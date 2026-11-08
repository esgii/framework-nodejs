import type { FieldError, Schema } from "../types.ts";
import { createValidator, fail, ok, prefixErrors, type Validator } from "./schema.ts";

export interface ArrayOptions {
    /** Nombre minimum d'éléments. */
    min?: number;
    /** Nombre maximum d'éléments. */
    max?: number;
}

/** Valide un tableau : sa taille, puis chaque élément avec le schéma donné. */
export function array<T>(item: Schema<T>, options: ArrayOptions = {}): Validator<T[]> {
    return createValidator((input) => {
        if (!Array.isArray(input)) {
            return fail("", "type", "Expected an array");
        }
        // Array.isArray donne any[] : on le ramène à unknown[] pour que rien n'échappe aux vérifications.
        const items: readonly unknown[] = input;
        // On continue après une erreur, pour que le client reçoive tous les problèmes en une seule réponse.
        const errors: FieldError[] = [];
        if (options.min !== undefined && items.length < options.min) {
            errors.push({ field: "", code: "min", message: `Must contain at least ${options.min} items` });
        }
        if (options.max !== undefined && items.length > options.max) {
            errors.push({ field: "", code: "max", message: `Must contain at most ${options.max} items` });
        }
        const output: T[] = [];
        for (const [index, value] of items.entries()) {
            const result = item.parse(value);
            if (result.ok) {
                output.push(result.value);
            } else {
                errors.push(...prefixErrors(`[${index}]`, result.errors));
            }
        }
        return errors.length > 0 ? { ok: false, errors } : ok(output);
    });
}
