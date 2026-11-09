import { createValidator, fail, ok, type Validator } from "./schema.ts";

export interface BooleanOptions {
    /** Accepte aussi les chaînes "true" et "false", pour les paramètres de requête comme ?published=true. */
    coerce?: boolean;
}

/** Valide un booléen. */
export function boolean(options: BooleanOptions = {}): Validator<boolean> {
    return createValidator((input) => {
        if (typeof input === "boolean") {
            return ok(input);
        }
        if (options.coerce === true && (input === "true" || input === "false")) {
            return ok(input === "true");
        }
        return fail("", "type", "Expected a boolean");
    });
}

/** Type guard : indique à TypeScript que l'entrée fait partie des valeurs autorisées, sans cast. */
function isOneOf<T extends readonly string[]>(values: T, input: unknown): input is T[number] {
    return values.some((value) => value === input);
}

/**
 * Valide une valeur parmi une liste fixe. Le type de sortie est l'union des valeurs :
 * enumOf(["public", "private"]) donne "public" | "private", et non string.
 * « const T » garde les valeurs exactes sans avoir à écrire « as const ».
 */
export function enumOf<const T extends readonly string[]>(values: T): Validator<T[number]> {
    return createValidator((input) =>
        isOneOf(values, input) ? ok(input) : fail("", "enum", `Expected one of: ${values.join(", ")}`),
    );
}
