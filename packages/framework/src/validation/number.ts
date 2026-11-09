import { createValidator, fail, ok, type Validator } from "./schema.ts";

export interface NumberOptions {
    /** Uniquement des nombres entiers (pas de décimales). */
    int?: boolean;
    min?: number;
    max?: number;
    /** Strictement supérieur à 0. */
    positive?: boolean;
    /** Strictement inférieur à 0. */
    negative?: boolean;
    /** Accepte aussi une chaîne numérique ("2"), pour les paramètres de requête comme ?page=2. */
    coerce?: boolean;
}

/** Un nombre décimal simple écrit en texte : "12", "-3", "1.5". Refuse "", "12abc", "0x10", "1e3". */
const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Lit un nombre depuis l'entrée, ou undefined si ce n'en est pas un. */
function toNumber(input: unknown, coerce: boolean): number | undefined {
    if (typeof input === "number") {
        return input;
    }
    if (coerce && typeof input === "string" && NUMERIC.test(input)) {
        return Number(input);
    }
    return undefined;
}

/** Valide un nombre : fini, puis entier, puis les bornes, puis le signe. */
export function number(options: NumberOptions = {}): Validator<number> {
    return createValidator((input) => {
        const value = toNumber(input, options.coerce === true);
        // NaN et Infinity sont de type "number" en JS, mais ce ne sont pas des valeurs utilisables.
        if (value === undefined || !Number.isFinite(value)) {
            return fail("", "type", "Expected a number");
        }
        if (options.int === true && !Number.isInteger(value)) {
            return fail("", "int", "Expected a whole number");
        }
        if (options.min !== undefined && value < options.min) {
            return fail("", "min", `Must be at least ${options.min}`);
        }
        if (options.max !== undefined && value > options.max) {
            return fail("", "max", `Must be at most ${options.max}`);
        }
        if (options.positive === true && value <= 0) {
            return fail("", "positive", "Must be positive");
        }
        if (options.negative === true && value >= 0) {
            return fail("", "negative", "Must be negative");
        }
        return ok(value);
    });
}
