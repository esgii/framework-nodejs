import type { HttpResponse } from "../types.ts";
import { HttpError, InternalError } from "./errors.ts";

/** Où tourne l'app : les détails ne sont montrés qu'en développement. */
export type Environment = "production" | "development";

/** Écrit une erreur côté serveur (console.error, ou le logger de l'app). */
export type ErrorLogger = (entry: Record<string, unknown>) => void;

/**
 * Transforme tout ce qui a été lancé en réponse au format d'erreur unique.
 * - Une HttpError (404, 422...) a été lancée exprès : elle est envoyée telle quelle.
 * - Tout le reste est un bug : 500. En production, le client ne reçoit qu'un message
 *   générique, jamais la trace ni un message de la base de données.
 * L'erreur est toujours écrite dans les logs du serveur.
 */
export function toErrorResponse(thrown: unknown, env: Environment, log: ErrorLogger): HttpResponse {
    if (thrown instanceof HttpError) {
        log({ status: thrown.status, code: thrown.code, message: thrown.message });
        return thrown.toResponse();
    }

    // `catch (e)` donne `unknown` : on vérifie que c'est une Error avant de lire .message.
    const debug =
        thrown instanceof Error
            ? { name: thrown.name, message: thrown.message, stack: thrown.stack }
            : { name: "NonError", message: String(thrown) };
    log({ status: 500, ...debug });

    const internal = new InternalError();
    const error = { code: internal.code, message: internal.message, details: internal.details };
    return {
        ...internal.toResponse(),
        // Seulement sur la machine du développeur : ce qui s'est mal passé, et où.
        body: env === "development" ? { error: { ...error, debug } } : { error },
    };
}
