import { createValidator, fail, ok, type Validator } from "./schema.ts";

export interface StringOptions {
    /** Longueur minimale, en caractères. */
    min?: number;
    /** Longueur maximale, en caractères. */
    max?: number;
    /** Motif que la valeur doit respecter. */
    regex?: RegExp;
    /** Retire les espaces autour de la valeur avant les autres vérifications. */
    trim?: boolean;
}

/** Volontairement simple : quelquechose@quelquechose.quelquechose, sans espaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valide une chaîne. Le trim est appliqué d'abord, puis la longueur et le motif sont vérifiés. */
export function string(options: StringOptions = {}): Validator<string> {
    return createValidator((input) => {
        if (typeof input !== "string") {
            return fail("", "type", "Expected a string");
        }
        const value = options.trim === true ? input.trim() : input;
        // [...value] découpe par caractère : "é" ou un emoji compte pour un, contrairement à value.length.
        const length = [...value].length;
        if (options.min !== undefined && length < options.min) {
            return fail("", "min", `Must be at least ${options.min} characters`);
        }
        if (options.max !== undefined && length > options.max) {
            return fail("", "max", `Must be at most ${options.max} characters`);
        }
        // search() ignore le flag g et lastIndex, contrairement à test() qui garde un état entre deux appels.
        if (options.regex !== undefined && value.search(options.regex) === -1) {
            return fail("", "regex", "Invalid format");
        }
        return ok(value);
    });
}

/** Valide un email : trimé, vérifié avec un motif simple, puis mis en minuscules. */
export function email(): Validator<string> {
    const base = string({ trim: true, max: 254 });
    return createValidator((input) => {
        const result = base.parse(input);
        if (!result.ok) {
            return result;
        }
        if (!EMAIL.test(result.value)) {
            return fail("", "email", "Must be a valid email address");
        }
        return ok(result.value.toLowerCase());
    });
}
