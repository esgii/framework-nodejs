import type { CorsConfig } from "../core/config.js";
import type { ErrorResponder } from "../core/pipeline.js";
import { ForbiddenError } from "../http/errors.js";
import type { HttpResponse, Middleware } from "../types.js";

/** Ce qu'on annonce au navigateur lors de la pré-vérification. */
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";

/**
 * CORS (§ 2.9) : quels sites web ont le droit d'appeler l'API depuis un navigateur.
 *
 *   kernel.use(cors(config.cors, (e) => toErrorResponse(e, env, log)));
 *
 * - CORS désactivé, ou requête sans en-tête Origin (curl, même site) : rien à faire.
 * - Origine absente de la liste : 403.
 * - Pré-vérification (OPTIONS) d'une origine autorisée : 204 avec les en-têtes, sans aller plus loin.
 * - Sinon : la requête continue, et la réponse reçoit Access-Control-Allow-Origin,
 *   y compris une réponse d'erreur (sinon le site ne pourrait pas lire le message d'erreur).
 */
export const cors =
    (config: CorsConfig, onError: ErrorResponder): Middleware =>
        async (ctx, next) => {
            const origin = ctx.headers["origin"];
            if (!config.enabled || origin === undefined) {
                return next();
            }

            // Refus explicite : le navigateur bloquera la réponse côté site.
            if (!config.origins.includes(origin)) {
                throw new ForbiddenError(`Origin not allowed: ${origin}`);
            }

            // Le navigateur demande d'abord si la vraie requête est permise.
            if (ctx.req.method === "OPTIONS") {
                return {
                    status: 204,
                    headers: {
                        "access-control-allow-origin": origin,
                        "access-control-allow-methods": ALLOWED_METHODS,
                        "access-control-allow-headers": ALLOWED_HEADERS,
                    },
                    body: null,
                };
            }

            let response: HttpResponse;
            try {
                response = await next();
            } catch (error: unknown) {
                // Une erreur plus loin (404, 422…) : on fabrique sa réponse ici pour lui ajouter l'en-tête.
                response = await onError(error);
            }
            return { ...response, headers: { ...response.headers, "access-control-allow-origin": origin } };
        };
