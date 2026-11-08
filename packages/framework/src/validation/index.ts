import { email, string } from "./string.ts";

/**
 * Tous les validateurs dans un seul objet, pour que l'app écrive v.string(), v.object({...}).
 */
export const v = {
    string,
    email,
};
