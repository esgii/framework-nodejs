/**
 * Les lignes renvoyées par PostgreSQL sont des données venues de l'extérieur :
 * elles sont reçues comme `unknown` et passent par un décodeur avant d'être utilisées.
 */

/**
 * Ce qui transforme une ligne inconnue en objet typé :
 * - une fonction, qui renvoie l'objet (ou lève une erreur) ;
 * - un schéma du validateur (v.object({...})) : tout objet avec une méthode parse convient.
 * Décrit par sa forme, sans importer le validateur : src/db reste indépendant du reste du framework.
 */
export type Decoder<T> =
    | ((row: unknown) => T)
    | {
    parse(input: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly unknown[] };
};

/**
 * Une ligne de la base qui ne correspond pas au décodeur : le code et la base ne sont
 * pas d'accord (une colonne renommée, un type changé…). C'est un bug, donc un 500, jamais un 422 :
 * le client n'y est pour rien.
 */
export class RowDecodeError extends Error {
    override readonly name = "RowDecodeError";
    /** La position de la ligne fautive dans le résultat. */
    readonly index: number;
    /** Les erreurs du schéma, pour les logs du serveur. */
    readonly errors: readonly unknown[];

    constructor(index: number, errors: readonly unknown[]) {
        super(`Row ${index} does not match the expected shape`);
        this.index = index;
        this.errors = errors;
    }
}

/** Décode une ligne avec une fonction ou un schéma. */
export function decodeRow<T>(decode: Decoder<T>, row: unknown, index: number): T {
    if (typeof decode === "function") {
        return decode(row);
    }
    const result = decode.parse(row);
    if (!result.ok) {
        throw new RowDecodeError(index, result.errors);
    }
    return result.value;
}
