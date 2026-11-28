import {
  bind,
  compare,
  inList,
  isNull,
  QueryError,
  render,
  search,
  type Condition,
  type Join,
  type Operator,
  type SqlParam,
  type SqlQuery,
  type SqlValue,
} from "./conditions.ts";
import type { Database } from "./connection.ts";
import { decodeRow, type Decoder } from "./decode.ts";
import { quoteIdent, sortColumn, type SortMap } from "./identifiers.ts";

// Réexportés ici pour que les imports existants (index.ts, tests) restent valables.
export { QueryError };
export type { Operator, SqlParam, SqlQuery, SqlValue };

/** Le sens d'un tri (liste blanche). */
export type Direction = "asc" | "desc";

const DIRECTIONS: ReadonlySet<string> = new Set(["asc", "desc"]);

/** Une page de résultats, et le nombre total de lignes de la requête sans pagination. */
export interface Page {
  readonly items: Record<string, unknown>[];
  readonly total: number;
  readonly size: number;
  readonly offset: number;
}

/** Une colonne choisie : "j.title", ou ["j.title", "name"] pour la renommer. */
export type Column = string | readonly [column: string, alias: string];

type JoinKind = "INNER" | "LEFT" | "RIGHT" | "FULL";

interface State {
  readonly table: string;
  readonly columns: readonly string[];
  /** Les jointures, déjà écrites en SQL : elles ne contiennent que des noms, jamais de valeurs. */
  readonly joins: readonly string[];
  readonly conditions: readonly Condition[];
  /** Les colonnes du GROUP BY, déjà entre guillemets. */
  readonly groups: readonly string[];
  /** Les tris, déjà écrits en SQL : "j"."created_at" DESC. */
  readonly orders: readonly string[];
  readonly limit: number | undefined;
  readonly offset: number | undefined;
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
  join(
    table: string,
    alias: string,
    leftColumn: string,
    rightColumn: string,
  ): SelectQuery {
    return this.#join("INNER", table, alias, leftColumn, rightColumn);
  }

  /** LEFT JOIN : toutes les lignes de gauche, même sans correspondance à droite. */
  leftJoin(
    table: string,
    alias: string,
    leftColumn: string,
    rightColumn: string,
  ): SelectQuery {
    return this.#join("LEFT", table, alias, leftColumn, rightColumn);
  }

  /** RIGHT JOIN : toutes les lignes de droite, même sans correspondance à gauche. */
  rightJoin(
    table: string,
    alias: string,
    leftColumn: string,
    rightColumn: string,
  ): SelectQuery {
    return this.#join("RIGHT", table, alias, leftColumn, rightColumn);
  }

  /** FULL JOIN : toutes les lignes des deux côtés, avec ou sans correspondance. */
  fullJoin(
    table: string,
    alias: string,
    leftColumn: string,
    rightColumn: string,
  ): SelectQuery {
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
    return this.#add(inList(column, values));
  }

  /** column IS NULL. */
  whereNull(column: string): SelectQuery {
    return this.#add(isNull(column, false));
  }

  /** column IS NOT NULL. */
  whereNotNull(column: string): SelectQuery {
    return this.#add(isNull(column, true));
  }

  /**
   * Recherche plein texte dans les colonnes, reliée aux conditions précédentes par AND.
   * Trouve les variantes d'un mot (montagne, montagnes) et ignore les petits mots (le, de…).
   * Un texte vide ne filtre rien.
   */
  whereSearch(columns: readonly string[], text: string): SelectQuery {
    return this.#add(search(columns, text));
  }

  /** Des conditions entre parenthèses, reliées aux précédentes par AND. */
  whereGroup(build: (group: SelectQuery) => SelectQuery): SelectQuery {
    return this.#add(this.#group("AND", build));
  }

  /** Des conditions entre parenthèses, reliées aux précédentes par OR. */
  orWhereGroup(build: (group: SelectQuery) => SelectQuery): SelectQuery {
    return this.#add(this.#group("OR", build));
  }

  /**
   * Ajoute COUNT(colonne) aux colonnes lues, sous le nom `alias`.
   * Sans colonne, COUNT(*) compte les lignes ; avec une colonne, les NULL ne comptent pas
   * (après un LEFT JOIN, un carnet sans étape donne 0 et pas 1).
   * ::int parce que PostgreSQL renvoie COUNT en bigint, que le driver pg lit comme du texte.
   */
  count(column = "*", alias = "count"): SelectQuery {
    const counted = column === "*" ? "*" : quoteIdent(column);
    return this.#with({
      columns: [
        ...this.#state.columns,
        `COUNT(${counted})::int AS ${quoteIdent(alias)}`,
      ],
    });
  }

  /** Regroupe les lignes : une ligne par valeur distincte des colonnes. Plusieurs appels s'ajoutent. */
  groupBy(...columns: string[]): SelectQuery {
    return this.#with({
      groups: [...this.#state.groups, ...columns.map(quoteIdent)],
    });
  }

  /** Trie par une colonne écrite dans le code. Plusieurs appels s'ajoutent : le premier tri compte d'abord. */
  orderBy(column: string, direction: Direction = "asc"): SelectQuery {
    return this.#order(quoteIdent(column), direction);
  }

  /** Trie selon une clé envoyée par le client, traduite par la table de correspondance. */
  sortBy(key: string, map: SortMap, direction: Direction = "asc"): SelectQuery {
    return this.#order(sortColumn(key, map), direction);
  }

  /** Le nombre maximum de lignes, passé en paramètre lié. */
  limit(count: number): SelectQuery {
    return this.#with({ limit: integer(count, "limit", 0) });
  }

  /** Le nombre de lignes à sauter, passé en paramètre lié. */
  offset(count: number): SelectQuery {
    return this.#with({ offset: integer(count, "offset", 0) });
  }

  /** Le texte SQL et ses valeurs, numérotées $1, $2… dans l'ordre où elles apparaissent. */
  toSQL(): SqlQuery {
    const columns =
      this.#state.columns.length > 0 ? this.#state.columns.join(", ") : "*";
    return this.#sql(columns, true);
  }

  /**
   * Exécute la requête et décode chaque ligne : avec un schéma du validateur,
   * `const rows: JourneyRow[] = await q.all(db, journeyRow)` est typé sans `as`.
   */
  async all<T>(db: Database, decode: Decoder<T>): Promise<T[]> {
    const { text, values } = this.toSQL();
    const { rows } = await db.query(text, [...values]);
    // Chaque ligne arrive comme unknown dans le décodeur.
    return rows.map((row: unknown, index) => decodeRow(decode, row, index));
  }

  /** Exécute la requête limitée à une ligne ; null s'il n'y en a aucune. */
  async first<T>(db: Database, decode: Decoder<T>): Promise<T | null> {
    const [row] = await this.limit(1).all(db, decode);
    return row ?? null;
  }

  /**
   * Exécute la requête pour une page, et compte le total des lignes sans pagination.
   * Deux requêtes : la page (avec tri, LIMIT et OFFSET) et le COUNT(*) (sans).
   */
  async paginate(
    db: Database,
    { size, offset }: { size: number; offset: number },
  ): Promise<Page> {
    const page = this.limit(integer(size, "size", 1))
      .offset(offset)
      .toSQL();
    const count = this.#countSQL();
    const [rows, counted] = await Promise.all([
      db.query(page.text, [...page.values]),
      db.query(count.text, [...count.values]),
    ]);
    // PostgreSQL renvoie COUNT(*) sous forme de texte ("25") : on le convertit en nombre.
    return {
      items: rows.rows,
      total: Number(counted.rows[0]?.["total"] ?? 0),
      size,
      offset,
    };
  }

  /** Écrit la requête ; sans `paged`, ni tri, ni LIMIT, ni OFFSET (pour le comptage). */
  #sql(columns: string, paged: boolean): SqlQuery {
    const values: SqlParam[] = [];
    const { table, joins, conditions, groups, orders, limit, offset } =
      this.#state;
    const where = render(conditions, values);
    let text = `SELECT ${columns} FROM ${table}${joins.map((join) => ` ${join}`).join("")}`;
    if (where !== "") text += ` WHERE ${where}`;
    if (groups.length > 0) text += ` GROUP BY ${groups.join(", ")}`;
    if (paged && orders.length > 0) text += ` ORDER BY ${orders.join(", ")}`;
    if (paged && limit !== undefined) text += ` LIMIT ${bind(limit, values)}`;
    if (paged && offset !== undefined)
      text += ` OFFSET ${bind(offset, values)}`;
    return { text, values };
  }

  /**
   * La requête du total. Avec GROUP BY, un COUNT(*) direct renverrait une ligne par groupe :
   * on compte donc les groupes, en mettant la requête dans une sous-requête.
   */
  #countSQL(): SqlQuery {
    if (this.#state.groups.length === 0)
      return this.#sql('COUNT(*) AS "total"', false);
    const inner = this.#sql("1", false);
    return {
      text: `SELECT COUNT(*) AS "total" FROM (${inner.text}) AS "grouped"`,
      values: inner.values,
    };
  }

  #order(column: string, direction: Direction): SelectQuery {
    // TypeScript refuse déjà un autre sens ; ceci protège à l'exécution.
    if (!DIRECTIONS.has(direction)) {
      throw new QueryError(`Sort direction not allowed: "${direction}"`);
    }
    return this.#with({
      orders: [...this.#state.orders, `${column} ${direction.toUpperCase()}`],
    });
  }

  /** La condition de jointure compare deux colonnes : aucune valeur, donc rien à lier. */
  #join(
    kind: JoinKind,
    table: string,
    alias: string,
    leftColumn: string,
    rightColumn: string,
  ): SelectQuery {
    const sql = `${kind} JOIN ${quoteIdent(table)} AS ${quoteIdent(alias)} ON ${quoteIdent(leftColumn)} = ${quoteIdent(rightColumn)}`;
    return this.#with({ joins: [...this.#state.joins, sql] });
  }

  #add(condition: Condition): SelectQuery {
    return this.#with({ conditions: [...this.#state.conditions, condition] });
  }

  /** Construit le groupe sur une requête vide, puis garde seulement ses conditions. */
  #group(join: Join, build: (group: SelectQuery) => SelectQuery): Condition {
    const inner = build(empty(""));
    return { join, kind: "group", conditions: inner.#state.conditions };
  }

  #with(change: Partial<State>): SelectQuery {
    return new SelectQuery({ ...this.#state, ...change });
  }
}

/** Point de départ d'une requête : from("journeys", "j"). */
export function from(table: string, alias?: string): SelectQuery {
  const quoted =
    alias === undefined
      ? quoteIdent(table)
      : `${quoteIdent(table)} AS ${quoteIdent(alias)}`;
  return empty(quoted);
}

function empty(table: string): SelectQuery {
  return new SelectQuery({
    table,
    columns: [],
    joins: [],
    conditions: [],
    groups: [],
    orders: [],
    limit: undefined,
    offset: undefined,
  });
}

/** Un entier au moins égal à `min` : LIMIT -1 ou OFFSET 2.5 sont refusés avant d'arriver à la base. */
function integer(value: number, name: string, min: number): number {
  if (!Number.isInteger(value) || value < min) {
    throw new QueryError(`${name} must be an integer >= ${min}`);
  }
  return value;
}
