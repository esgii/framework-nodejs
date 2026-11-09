import { array } from "./array.ts";
import { number } from "./number.ts";
import { object } from "./object.ts";
import { boolean, enumOf } from "./primitives.ts";
import { email, string } from "./string.ts";

/**
 * Tous les validateurs dans un seul objet, pour que l'app écrive v.string(), v.object({...}).
 * « enum » est un mot réservé en TypeScript, donc la fonction s'appelle enumOf
 * et elle est exposée ici sous le nom v.enum.
 */
export const v = {
    string,
    email,
    number,
    boolean,
    enum: enumOf,
    array,
    object,
};
