import type { HttpResponse } from "../types.ts";
import { HttpError, InternalError } from "./errors.ts";

export type Environment = "production" | "development";

/** Writes an error on the server side (console.error, or the app's logger). */
export type ErrorLogger = (entry: Record<string, unknown>) => void;

/**
 * Turns anything that was thrown into a response with the single error format.
 * - An HttpError (404, 422...) was thrown on purpose: it is sent as it is.
 * - Anything else is a bug: 500. In production the client gets a generic
 *   message only, never the stack or a database message.
 * The error is always logged on the server side.
 */
export function toErrorResponse(thrown: unknown, env: Environment, log: ErrorLogger): HttpResponse {
    if (thrown instanceof HttpError) {
        log({ status: thrown.status, code: thrown.code, message: thrown.message });
        return thrown.toResponse();
    }

    const debug =
        thrown instanceof Error
            ? { name: thrown.name, message: thrown.message, stack: thrown.stack }
            : { name: "NonError", message: String(thrown) };
    log({ status: 500, ...debug });

    const internal = new InternalError();
    const error = { code: internal.code, message: internal.message, details: internal.details };
    return {
        ...internal.toResponse(),
        body: env === "development" ? { error: { ...error, debug } } : { error },
    };
}
