import {
    bind,
    compare,
    inList,
    isNull,
    QueryError,
    render,
    type Condition,
    type Operator,
    type SqlParam,
    type SqlQuery,
    type SqlValue,
} from "./conditions.ts";
import type { Database, QueryResult } from "./connection.ts";
import { quoteIdent } from "./identifiers.ts";

/** Une ligne à écrire : colonne -> valeur. null est permis pour vider une colonne. */
export type Row = Readonly<Record<string, SqlParam>>;

/** RETURNING "id", "email" : les colonnes que la base renvoie après l'écriture. */
function returningSQL(columns: readonly string[]): string {
    return columns.length === 0 ? "" : ` RETURNING ${columns.join(", ")}`;
}

/** INSERT INTO … VALUES … : une ligne, ou plusieurs avec les mêmes colonnes. */
export class InsertQuery {
    readonly #table: string;
    readonly #rows: readonly Row[];
    readonly #returning: readonly string[];

    constructor(table: string, rows: readonly Row[], returning: readonly string[]) {
        this.#table = table;
        this.#rows = rows;
        this.#returning = returning;
    }

    /** Les colonnes à renvoyer après l'insertion (l'id créé, par exemple). */
    returning(...columns: string[]): InsertQuery {
        return new InsertQuery(this.#table, this.#rows, [...this.#returning, ...columns.map(quoteIdent)]);
    }

    toSQL(): SqlQuery {
        const [first] = this.#rows;
        if (first === undefined) {
            throw new QueryError("INSERT needs at least one row");
        }
        // Les colonnes de la première ligne servent pour toutes les autres.
        const columns = Object.keys(first);
        if (columns.length === 0) {
            throw new QueryError("INSERT needs at least one column");
        }
        const values: SqlParam[] = [];
        const tuples = this.#rows.map((row) => {
            const keys = Object.keys(row);
            if (keys.length !== columns.length || !columns.every((column) => Object.hasOwn(row, column))) {
                throw new QueryError("Every inserted row must have the same columns");
            }
            return `(${columns.map((column) => bind(row[column] ?? null, values)).join(", ")})`;
        });
        const text = `INSERT INTO ${this.#table} (${columns.map(quoteIdent).join(", ")}) VALUES ${tuples.join(", ")}${returningSQL(this.#returning)}`;
        return { text, values };
    }

    /** Exécute l'insertion ; `rows` contient les colonnes demandées par returning. */
    run(db: Database): Promise<QueryResult> {
        const { text, values } = this.toSQL();
        return db.query(text, [...values]);
    }
}

/** Ce que partagent UPDATE et DELETE : le WHERE, .all() et RETURNING. */
interface FilterState {
    readonly table: string;
    readonly conditions: readonly Condition[];
    /** true seulement après .all() : la requête touche volontairement toutes les lignes. */
    readonly everyRow: boolean;
    readonly returning: readonly string[];
}

/**
 * La base commune d'UPDATE et DELETE. Sans where, la requête est refusée :
 * un oubli toucherait toutes les lignes de la table. Il faut .all() pour le vouloir.
 */
abstract class FilteredQuery<Self> {
    protected readonly state: FilterState;

    constructor(state: FilterState) {
        this.state = state;
    }

    /** Une copie de la requête avec ce changement (les requêtes sont immuables). */
    protected abstract copy(change: Partial<FilterState>): Self;

    where(column: string, operator: Operator, value: SqlValue): Self {
        return this.#add(compare("AND", column, operator, value));
    }

    orWhere(column: string, operator: Operator, value: SqlValue): Self {
        return this.#add(compare("OR", column, operator, value));
    }

    whereIn(column: string, values: readonly SqlValue[]): Self {
        return this.#add(inList(column, values));
    }

    whereNull(column: string): Self {
        return this.#add(isNull(column, false));
    }

    whereNotNull(column: string): Self {
        return this.#add(isNull(column, true));
    }

    /** Accepte explicitement de toucher toutes les lignes de la table. */
    all(): Self {
        return this.copy({ everyRow: true });
    }

    /** Les colonnes à renvoyer après l'écriture. */
    returning(...columns: string[]): Self {
        return this.copy({ returning: [...this.state.returning, ...columns.map(quoteIdent)] });
    }

    /** Exécute la requête ; `rowCount` donne le nombre de lignes touchées. */
    run(db: Database): Promise<QueryResult> {
        const { text, values } = this.toSQL();
        return db.query(text, [...values]);
    }

    abstract toSQL(): SqlQuery;

    /** " WHERE …" et " RETURNING …", ou une erreur s'il n'y a ni where ni .all(). */
    protected tail(statement: string, values: SqlParam[]): string {
        const where = render(this.state.conditions, values);
        if (where === "" && !this.state.everyRow) {
            throw new QueryError(`${statement} without WHERE: call .all() to affect every row`);
        }
        return `${where === "" ? "" : ` WHERE ${where}`}${returningSQL(this.state.returning)}`;
    }

    #add(condition: Condition): Self {
        return this.copy({ conditions: [...this.state.conditions, condition] });
    }
}

/** UPDATE … SET … WHERE … */
export class UpdateQuery extends FilteredQuery<UpdateQuery> {
    readonly #changes: Row;

    constructor(state: FilterState, changes: Row) {
        super(state);
        this.#changes = changes;
    }

    /** Les colonnes à modifier ; plusieurs appels s'ajoutent. */
    set(changes: Row): UpdateQuery {
        return new UpdateQuery(this.state, { ...this.#changes, ...changes });
    }

    toSQL(): SqlQuery {
        const columns = Object.keys(this.#changes);
        if (columns.length === 0) {
            throw new QueryError("UPDATE needs at least one column in set()");
        }
        const values: SqlParam[] = [];
        // Les valeurs du SET sont liées avant celles du WHERE : $1, $2… dans l'ordre du texte.
        const assignments = columns.map((column) => `${quoteIdent(column)} = ${bind(this.#changes[column] ?? null, values)}`);
        const text = `UPDATE ${this.state.table} SET ${assignments.join(", ")}${this.tail("UPDATE", values)}`;
        return { text, values };
    }

    protected copy(change: Partial<FilterState>): UpdateQuery {
        return new UpdateQuery({ ...this.state, ...change }, this.#changes);
    }
}

/** DELETE FROM … WHERE … */
export class DeleteQuery extends FilteredQuery<DeleteQuery> {
    toSQL(): SqlQuery {
        const values: SqlParam[] = [];
        const text = `DELETE FROM ${this.state.table}${this.tail("DELETE", values)}`;
        return { text, values };
    }

    protected copy(change: Partial<FilterState>): DeleteQuery {
        return new DeleteQuery({ ...this.state, ...change });
    }
}

/** insert("users", { email }) ou insert("users", [{ email: "a" }, { email: "b" }]). */
export function insert(table: string, rows: Row | readonly Row[]): InsertQuery {
    const list: readonly Row[] = Array.isArray(rows) ? rows : [rows];
    return new InsertQuery(quoteIdent(table), list, []);
}

/** update("journeys").set({ title }).where("id", "=", id). */
export function update(table: string): UpdateQuery {
    return new UpdateQuery({ table: quoteIdent(table), conditions: [], everyRow: false, returning: [] }, {});
}

/** deleteFrom("comments").where(…). « delete » est un mot réservé en JavaScript. */
export function deleteFrom(table: string): DeleteQuery {
    return new DeleteQuery({ table: quoteIdent(table), conditions: [], everyRow: false, returning: [] });
}
