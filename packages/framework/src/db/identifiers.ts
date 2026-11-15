/**
 * Noms de tables et de colonnes. Une valeur passe par les paramètres ($1, $2…),
 * mais un nom ne le peut pas : il est collé dans le SQL. Il doit donc venir du code,
 * être vérifié, puis entouré de guillemets.
 */

/** Un nom de table ou de colonne invalide : une erreur dans le code, pas du client (500). */
export class IdentifierError extends Error {
    override readonly name = "IdentifierError";
}

/** Une clé de tri envoyée par le client, absente de la table de correspondance (400). */
export class UnknownSortKeyError extends Error {
    override readonly name = "UnknownSortKeyError";
    readonly key: string;
    readonly allowed: readonly string[];

    constructor(key: string, allowed: readonly string[]) {
        super(`Unknown sort key "${key}"`);
        this.key = key;
        this.allowed = allowed;
    }
}

/** Minuscules, chiffres et _ ; jamais un chiffre en premier. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** Au-delà, PostgreSQL coupe le nom sans prévenir. */
const MAX_LENGTH = 63;

/**
 * Vérifie un nom puis l'entoure de guillemets doubles : journeys -> "journeys".
 * Accepte un nom préfixé : j.created_at -> "j"."created_at".
 */
export function quoteIdent(name: string): string {
    return name
        .split(".")
        .map((part) => {
            if (!IDENTIFIER.test(part) || part.length > MAX_LENGTH) {
                throw new IdentifierError(`Invalid identifier "${name}"`);
            }
            return `"${part}"`;
        })
        .join(".");
}

/** Une table déclarée dans le code, avec la liste de ses colonnes. */
export interface Table<C extends string> {
    /** Le nom de la table, entre guillemets : "journeys". */
    readonly ref: string;
    /** Une colonne connue, préfixée par sa table : "journeys"."title". */
    column(name: C): string;
}

/**
 * Déclare une table et ses colonnes. Les noms sont vérifiés tout de suite,
 * donc une faute de frappe fait échouer le démarrage, pas une requête plus tard.
 */
export function defineTable<const C extends string>(name: string, columns: readonly C[]): Table<C> {
    const ref = quoteIdent(name);
    columns.forEach(quoteIdent);
    const known = new Set<string>(columns);

    return {
        ref,
        column(column) {
            // TypeScript refuse déjà une colonne inconnue ; ceci protège à l'exécution.
            if (!known.has(column)) {
                throw new IdentifierError(`Unknown column "${column}" in table "${name}"`);
            }
            return `${ref}.${quoteIdent(column)}`;
        },
    };
}

/** Table de correspondance du tri : clé envoyée par le client -> colonne écrite dans le code. */
export type SortMap = Readonly<Record<string, string>>;

/**
 * Traduit une clé de tri du client en colonne SQL : "created" -> "j"."created_at".
 * Une clé absente de la table lève UnknownSortKeyError : le client ne choisit jamais une colonne lui-même.
 */
export function sortColumn(key: string, map: SortMap): string {
    // Object.hasOwn ignore les clés héritées comme "constructor" ou "__proto__".
    const column = Object.hasOwn(map, key) ? map[key] : undefined;
    if (column === undefined) {
        throw new UnknownSortKeyError(key, Object.keys(map));
    }
    return quoteIdent(column);
}
