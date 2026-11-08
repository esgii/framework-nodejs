import type { ParseResult, Schema } from "../types.ts";

/**
 * Un schéma avec les modificateurs communs. Chaque validateur (string, number, object...)
 * est un Validator, donc .optional(), .nullable() et .default() marchent partout.
 */
export interface Validator<T> extends Schema<T> {
    /** Accepte aussi undefined (un champ absent). */
    optional(): Validator<T | undefined>;
    /** Accepte aussi null. */
    nullable(): Validator<T | null>;
    /** Utilise cette valeur quand le champ est absent (undefined). */
    default(value: T): Validator<T>;
}

/** Le type produit par un schéma : Infer<typeof schema>. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

/** Construit un résultat de validation réussi qui contient la valeur nettoyée. */
export function ok<T>(value: T): ParseResult<T> {
    return { ok: true, value };
}

/**
 * Construit un résultat de validation en échec avec une seule erreur de champ.
 * Typé ParseResult<never> : un échec n'a pas de valeur, donc il convient à n'importe quel ParseResult<T>.
 */
export function fail(field: string, code: string, message: string): ParseResult<never> {
    return { ok: false, errors: [{ field, code, message }] };
}

/** Ajoute les modificateurs autour d'une fonction parse. Chaque modificateur enveloppe le parse précédent. */
function build<T>(parse: (input: unknown) => ParseResult<T>): Validator<T> {
    return {
        parse,
        optional: () => build<T | undefined>((input) => (input === undefined ? ok(undefined) : parse(input))),
        nullable: () => build<T | null>((input) => (input === null ? ok(null) : parse(input))),
        default: (value) => build<T>((input) => (input === undefined ? ok(value) : parse(input))),
    };
}

/**
 * Transforme une fonction de vérification en validateur complet.
 * Une valeur absente (undefined) est refusée avec le code "required" avant la vérification,
 * donc la vérification ne traite que des valeurs présentes. Utiliser .optional() pour l'accepter.
 */
export function createValidator<T>(check: (input: unknown) => ParseResult<T>): Validator<T> {
    return build((input) => (input === undefined ? fail("", "required", "This field is required") : check(input)));
}
