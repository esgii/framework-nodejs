import type { Schema } from "../types.ts";
import { createValidator, fail, ok, prefixErrors, type Infer, type Validator } from "./schema.ts";

/** La description d'un objet : un schéma par clé. */
export type Shape = Record<string, Schema<unknown>>;

/** Le type produit par un schéma d'objet : { title: string; ... } à partir de { title: v.string(), ... }. */
export type ObjectOutput<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

/** Un objet simple, ni null ni un tableau (typeof [] vaut aussi "object"). */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Valide un objet. Seules les clés déclarées sont lues et renvoyées :
 * une clé en trop envoyée par le client (role, id, author_id...) est ignorée.
 */
export function object<S extends Shape>(shape: S): Validator<ObjectOutput<S>> {
    return createValidator((input) => {
        if (!isRecord(input)) {
            return fail("", "type", "Expected an object");
        }
        const output: Record<string, unknown> = {};
        for (const [key, schema] of Object.entries(shape)) {
            // Clés propres uniquement : une clé nommée "toString" ne doit pas lire la méthode héritée.
            const result = schema.parse(Object.hasOwn(input, key) ? input[key] : undefined);
            if (!result.ok) {
                return { ok: false, errors: prefixErrors(key, result.errors) };
            }
            output[key] = result.value;
        }
        // Le seul cast de la validation : la boucle ci-dessus a rempli chaque clé du shape
        // avec la valeur de son schéma, mais TypeScript ne sait pas suivre une boucle sur des clés.
        return ok(output as ObjectOutput<S>);
    });
}
