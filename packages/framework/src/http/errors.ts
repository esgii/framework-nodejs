import type { FieldError, HttpError as HttpErrorContract, HttpResponse } from "../types.ts";

/**
 * Classe de base de toutes les erreurs que le framework transforme en réponse.
 * On peut en lancer une n'importe où (routeur, middleware, validation, contrôleur) :
 * le gestionnaire d'erreurs l'envoie au format d'erreur unique.
 */
export class HttpError extends Error implements HttpErrorContract {
    // Déclarées une par une : `constructor(readonly status: number)` est
    // interdit par l'option "erasableSyntaxOnly" de notre tsconfig.
    readonly status: number;
    readonly code: string;
    readonly details: FieldError[];
    /** En-têtes en plus, par exemple Allow pour le 405 ou Retry-After pour le 429. */
    readonly headers: Record<string, string>;

    constructor(
        status: number,
        code: string,
        message: string,
        details: FieldError[] = [],
        headers: Record<string, string> = {},
    ) {
        super(message);
        this.name = new.target.name; // "NotFoundError", etc. dans les logs
        this.status = status;
        this.code = code;
        this.details = details;
        this.headers = headers;
    }

    /** La réponse envoyée au client : { error: { code, message, details } }. */
    toResponse(): HttpResponse {
        return {
            status: this.status,
            headers: { "content-type": "application/json; charset=utf-8", ...this.headers },
            body: { error: { code: this.code, message: this.message, details: this.details } },
        };
    }
}

export class BadRequestError extends HttpError {
    constructor(message = "Bad request", details: FieldError[] = []) {
        super(400, "BAD_REQUEST", message, details);
    }
}

export class UnauthorizedError extends HttpError {
    constructor(message = "Authentication required") {
        super(401, "UNAUTHORIZED", message);
    }
}

export class ForbiddenError extends HttpError {
    constructor(message = "Access denied") {
        super(403, "FORBIDDEN", message);
    }
}

export class NotFoundError extends HttpError {
    constructor(message = "Resource not found") {
        super(404, "NOT_FOUND", message);
    }
}

export class MethodNotAllowedError extends HttpError {
    /** `allow` : les méthodes acceptées par ce chemin, envoyées dans l'en-tête Allow. */
    constructor(allow: string[], message = "Method not allowed") {
        super(405, "METHOD_NOT_ALLOWED", message, [], { allow: allow.join(", ") });
    }
}

export class ConflictError extends HttpError {
    constructor(message = "Conflict") {
        super(409, "CONFLICT", message);
    }
}

export class PayloadTooLargeError extends HttpError {
    constructor(message = "Payload too large") {
        super(413, "PAYLOAD_TOO_LARGE", message);
    }
}

export class UnsupportedMediaTypeError extends HttpError {
    constructor(message = "Unsupported media type") {
        super(415, "UNSUPPORTED_MEDIA_TYPE", message);
    }
}

export class UnprocessableError extends HttpError {
    /** `details` : une entrée par champ invalide, fournie par le validateur. */
    constructor(details: FieldError[], message = "Validation failed") {
        super(422, "VALIDATION_FAILED", message, details);
    }
}

export class TooManyRequestsError extends HttpError {
    /** `retryAfter` : le nombre de secondes à attendre, envoyé dans l'en-tête Retry-After. */
    constructor(retryAfter: number, message = "Too many requests") {
        super(429, "TOO_MANY_REQUESTS", message, [], { "retry-after": String(retryAfter) });
    }
}

export class InternalError extends HttpError {
    /** Le message reste générique : les détails internes ne sont jamais montrés au client. */
    constructor(message = "Internal server error") {
        super(500, "INTERNAL_ERROR", message);
    }
}
