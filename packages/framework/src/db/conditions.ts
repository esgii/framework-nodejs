/**
 * Ce que partagent SELECT, UPDATE et DELETE : les valeurs, les opérateurs,
 * et les conditions du WHERE écrites en SQL avec des paramètres liés.
 */
import { quoteIdent } from "./identifiers.ts";

/** Une requête mal construite dans le code (opérateur inconnu, UPDATE sans WHERE…) : un bug, donc un 500. */
export class QueryError extends Error {
  override readonly name = "QueryError";
}

/** Une valeur qu'on peut comparer. Pas de null : on utilise whereNull pour ça. */
export type SqlValue = string | number | bigint | boolean | Date;

/** Une valeur envoyée à la base : null est permis pour écrire (INSERT, UPDATE), pas pour comparer. */
export type SqlParam = SqlValue | null;

/** Le texte SQL, et les valeurs qui remplacent $1, $2… dans le même ordre. */
export interface SqlQuery {
  readonly text: string;
  readonly values: readonly SqlParam[];
}

/** Les opérateurs de comparaison autorisés (liste blanche). */
export type Operator = "=" | "<>" | "<" | "<=" | ">" | ">=" | "like" | "ilike";

const OPERATORS: ReadonlySet<string> = new Set([
  "=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "like",
  "ilike",
]);

export type Join = "AND" | "OR";

export type Condition =
  | {
      readonly join: Join;
      readonly kind: "compare";
      readonly column: string;
      readonly operator: Operator;
      readonly value: SqlValue;
    }
  | {
      readonly join: Join;
      readonly kind: "in";
      readonly column: string;
      readonly values: readonly SqlValue[];
    }
  | {
      readonly join: Join;
      readonly kind: "null";
      readonly column: string;
      readonly not: boolean;
    }
  | {
      readonly join: Join;
      readonly kind: "group";
      readonly conditions: readonly Condition[];
    }
  | {
      readonly join: Join;
      readonly kind: "search";
      readonly columns: readonly string[];
      readonly text: string;
    };

/** column <opérateur> valeur. */
export function compare(
  join: Join,
  column: string,
  operator: Operator,
  value: SqlValue,
): Condition {
  // TypeScript refuse déjà un autre opérateur ; ceci protège à l'exécution.
  if (!OPERATORS.has(operator)) {
    throw new QueryError(`Operator not allowed: "${operator}"`);
  }
  return { join, kind: "compare", column: quoteIdent(column), operator, value };
}

/** column IN (…). */
export function inList(column: string, values: readonly SqlValue[]): Condition {
  return { join: "AND", kind: "in", column: quoteIdent(column), values };
}

/** column IS NULL, ou IS NOT NULL. */
export function isNull(column: string, not: boolean): Condition {
  return { join: "AND", kind: "null", column: quoteIdent(column), not };
}

/** La langue de la recherche plein texte : fixée dans le code, jamais choisie par le client. */
const SEARCH_LANGUAGE = "'french'";

/** Recherche plein texte dans une ou plusieurs colonnes ; le texte cherché reste une valeur liée. */
export function search(columns: readonly string[], text: string): Condition {
  if (columns.length === 0) {
    throw new QueryError("Full-text search needs at least one column");
  }
  return {
    join: "AND",
    kind: "search",
    columns: columns.map(quoteIdent),
    text,
  };
}

/** Une valeur ajoutée à la liste, remplacée dans le texte par $1, $2… */
export function bind(value: SqlParam, values: SqlParam[]): string {
  values.push(value);
  return `$${values.length}`;
}

/** Écrit les conditions en SQL ; chaque valeur est ajoutée à `values` et remplacée par $n. */
export function render(
  conditions: readonly Condition[],
  values: SqlParam[],
): string {
  const parts: string[] = [];
  for (const condition of conditions) {
    const sql = renderOne(condition, values);
    if (sql !== "") {
      parts.push(parts.length === 0 ? sql : `${condition.join} ${sql}`);
    }
  }
  return parts.join(" ");
}

function renderOne(condition: Condition, values: SqlParam[]): string {
  switch (condition.kind) {
    case "compare":
      return `${condition.column} ${condition.operator.toUpperCase()} ${bind(condition.value, values)}`;
    case "in":
      // IN () est du SQL invalide : une liste vide ne correspond à rien.
      return condition.values.length === 0
        ? "FALSE"
        : `${condition.column} IN (${condition.values.map((value) => bind(value, values)).join(", ")})`;
    case "null":
      return `${condition.column} IS ${condition.not ? "NOT " : ""}NULL`;
    case "search": {
      // Un texte vide ou fait d'espaces ne filtre rien : toutes les lignes restent.
      if (condition.text.trim() === "") return "";
      // coalesce : une colonne NULL ferait disparaître tout le texte (NULL || 'x' vaut NULL).
      const document = condition.columns
        .map((column) => `coalesce(${column}, '')`)
        .join(" || ' ' || ");
      return `to_tsvector(${SEARCH_LANGUAGE}, ${document}) @@ plainto_tsquery(${SEARCH_LANGUAGE}, ${bind(condition.text, values)})`;
    }
    case "group": {
      const inner = render(condition.conditions, values);
      return inner === "" ? "" : `(${inner})`;
    }
  }
}
