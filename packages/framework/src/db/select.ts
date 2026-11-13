import { quoteIdent } from "./identifiers.ts";

/** Une requête mal construite dans le code (opérateur inconnu…) : un bug, donc un 500. */
export class QueryError extends Error {
    override readonly name = "QueryError";
}

/** Une valeur qu'on peut comparer. Pas de null : on utilise whereNull pour ça. */
export type SqlValue = string | number | bigint | boolean | Date;

/** Les opérateurs de comparaison autorisés (liste blanche). */
export type Operator = "=" | "<>" | "<" | "<=" | ">" | ">=" | "like" | "ilike";

const OPERATORS: ReadonlySet<string> = new Set(["=", "<>", "<", "<=", ">", ">=", "like", "ilike"]);

/** Une colonne choisie : "j.title", ou ["j.title", "name"] pour la renommer. */
export type Column = string | readonly [column: string, alias: string];

/** Le texte SQL, et les valeurs qui remplacent $1, $2… dans le même ordre. */
export interface SqlQuery {
    readonly text: string;
    readonly values: readonly SqlValue[];
}

type Join = "AND" | "OR";

type Condition =
    | { readonly join: Join; readonly kind: "compare"; readonly column: string; readonly operator: Operator; readonly value: SqlValue }
    | { readonly join: Join; readonly kind: "in"; readonly column: string; readonly values: readonly SqlValue[] }
    | { readonly join: Join; readonly kind: "null"; readonly column: string; readonly not: boolean }
    | { readonly join: Join; readonly kind: "group"; readonly conditions: readonly Condition[] };

type JoinKind = "INNER" | "LEFT" | "RIGHT" | "FULL";

interface State {
    readonly table: string;
    readonly columns: readonly string[];
    /** Les jointures, déjà écrites en SQL : elles ne contiennent que des noms, jamais de valeurs. */
    readonly joins: readonly string[];
    readonly conditions: readonly Condition[];
}

/**
 * Une requête SELECT en construction. Immuable : chaque méthode renvoie
 * une nouvelle requête, donc une requête de base peut servir plusieurs fois.
 */
export class SelectQuery {
    readonly #state: State;

    constructor(state: State) {
        this.#state = state;
    }

    /** Les colonnes à lire ; sans appel à select, la requête lit toutes les colonnes (*). */
    select(...columns: Column[]): SelectQuery {
        const quoted = columns.map((column) =>
            typeof column === "string"
                ? quoteIdent(column)
                : `${quoteIdent(column[0])} AS ${quoteIdent(column[1])}`,
        );
        return this.#with({ columns: [...this.#state.columns, ...quoted] });
    }

    /** INNER JOIN : seulement les lignes qui ont une correspondance des deux côtés. */
    join(table: string, alias: string, leftColumn: string, rightColumn: string): SelectQuery {
        return this.#join("INNER", table, alias, leftColumn, rightColumn);
    }

    /** LEFT JOIN : toutes les lignes de gauche, même sans correspondance à droite. */
    leftJoin(table: string, alias: string, leftColumn: string, rightColumn: string): SelectQuery {
        return this.#join("LEFT", table, alias, leftColumn, rightColumn);
    }

    /** RIGHT JOIN : toutes les lignes de droite, même sans correspondance à gauche. */
    rightJoin(table: string, alias: string, leftColumn: string, rightColumn: string): SelectQuery {
        return this.#join("RIGHT", table, alias, leftColumn, rightColumn);
    }

    /** FULL JOIN : toutes les lignes des deux côtés, avec ou sans correspondance. */
    fullJoin(table: string, alias: string, leftColumn: string, rightColumn: string): SelectQuery {
        return this.#join("FULL", table, alias, leftColumn, rightColumn);
    }

    /** Ajoute une condition, reliée aux précédentes par AND. */
    where(column: string, operator: Operator, value: SqlValue): SelectQuery {
        return this.#add(compare("AND", column, operator, value));
    }

    /** Ajoute une condition, reliée aux précédentes par OR. */
    orWhere(column: string, operator: Operator, value: SqlValue): SelectQuery {
        return this.#add(compare("OR", column, operator, value));
    }

    /** column IN (…). Une liste vide ne correspond à aucune ligne. */
    whereIn(column: string, values: readonly SqlValue[]): SelectQuery {
        return this.#add({ join: "AND", kind: "in", column: quoteIdent(column), values });
    }

    /** column IS NULL. */
    whereNull(column: string): SelectQuery {
        return this.#add({ join: "AND", kind: "null", column: quoteIdent(column), not: false });
    }

    /** column IS NOT NULL. */
    whereNotNull(column: string): SelectQuery {
        return this.#add({ join: "AND", kind: "null", column: quoteIdent(column), not: true });
    }

    /** Des conditions entre parenthèses, reliées aux précédentes par AND. */
    whereGroup(build: (group: SelectQuery) => SelectQuery): SelectQuery {
        return this.#add(this.#group("AND", build));
    }

    /** Des conditions entre parenthèses, reliées aux précédentes par OR. */
    orWhereGroup(build: (group: SelectQuery) => SelectQuery): SelectQuery {
        return this.#add(this.#group("OR", build));
    }

    /** Le texte SQL et ses valeurs, numérotées $1, $2… dans l'ordre où elles apparaissent. */
    toSQL(): SqlQuery {
        const values: SqlValue[] = [];
        const columns = this.#state.columns.length > 0 ? this.#state.columns.join(", ") : "*";
        const joins = this.#state.joins.map((join) => ` ${join}`).join("");
        const where = render(this.#state.conditions, values);
        const text = `SELECT ${columns} FROM ${this.#state.table}${joins}${where === "" ? "" : ` WHERE ${where}`}`;
        return { text, values };
    }

    /** La condition de jointure compare deux colonnes : aucune valeur, donc rien à lier. */
    #join(kind: JoinKind, table: string, alias: string, leftColumn: string, rightColumn: string): SelectQuery {
        const sql = `${kind} JOIN ${quoteIdent(table)} AS ${quoteIdent(alias)} ON ${quoteIdent(leftColumn)} = ${quoteIdent(rightColumn)}`;
        return this.#with({ joins: [...this.#state.joins, sql] });
    }

    #add(condition: Condition): SelectQuery {
        return this.#with({ conditions: [...this.#state.conditions, condition] });
    }

    /** Construit le groupe sur une requête vide, puis garde seulement ses conditions. */
    #group(join: Join, build: (group: SelectQuery) => SelectQuery): Condition {
        const inner = build(new SelectQuery({ table: "", columns: [], joins: [], conditions: [] }));
        return { join, kind: "group", conditions: inner.#state.conditions };
    }

    #with(change: Partial<State>): SelectQuery {
        return new SelectQuery({ ...this.#state, ...change });
    }
}

/** Point de départ d'une requête : from("journeys", "j"). */
export function from(table: string, alias?: string): SelectQuery {
    const quoted = alias === undefined ? quoteIdent(table) : `${quoteIdent(table)} AS ${quoteIdent(alias)}`;
    return new SelectQuery({ table: quoted, columns: [], joins: [], conditions: [] });
}

function compare(join: Join, column: string, operator: Operator, value: SqlValue): Condition {
    // TypeScript refuse déjà un autre opérateur ; ceci protège à l'exécution.
    if (!OPERATORS.has(operator)) {
        throw new QueryError(`Operator not allowed: "${operator}"`);
    }
    return { join, kind: "compare", column: quoteIdent(column), operator, value };
}

/** Écrit les conditions en SQL ; chaque valeur est ajoutée à `values` et remplacée par $n. */
function render(conditions: readonly Condition[], values: SqlValue[]): string {
    const parts: string[] = [];
    for (const condition of conditions) {
        const sql = renderOne(condition, values);
        if (sql !== "") {
            parts.push(parts.length === 0 ? sql : `${condition.join} ${sql}`);
        }
    }
    return parts.join(" ");
}

function renderOne(condition: Condition, values: SqlValue[]): string {
    const bind = (value: SqlValue): string => {
        values.push(value);
        return `$${values.length}`;
    };
    switch (condition.kind) {
        case "compare":
            return `${condition.column} ${condition.operator.toUpperCase()} ${bind(condition.value)}`;
        case "in":
            // IN () est du SQL invalide : une liste vide ne correspond à rien.
            return condition.values.length === 0 ? "FALSE" : `${condition.column} IN (${condition.values.map(bind).join(", ")})`;
        case "null":
            return `${condition.column} IS ${condition.not ? "NOT " : ""}NULL`;
        case "group": {
            const inner = render(condition.conditions, values);
            return inner === "" ? "" : `(${inner})`;
        }
    }
}
