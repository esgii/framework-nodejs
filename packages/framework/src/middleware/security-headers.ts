import type { ErrorResponder } from "../core/pipeline.js";
import type { HttpResponse, Middleware } from "../types.js";

/**
 * Ajoute les en-têtes de sécurité de la config à chaque réponse (§ 2.2, § 2.9),
 * y compris aux réponses d'erreur.
 *
 *   kernel.use(securityHeaders(config.securityHeaders, (e) => toErrorResponse(e, env, log)));
 *
 * Une erreur levée plus loin ne donne pas de réponse : elle traverse ce middleware.
 * On la transforme donc ici en réponse avec `onError` (le gestionnaire d'erreurs),
 * pour pouvoir lui ajouter les en-têtes, comme à une réponse normale.
 */
export const securityHeaders =
    (headers: Readonly<Record<string, string>>, onError: ErrorResponder): Middleware =>
        async (_ctx, next) => {
            let response: HttpResponse;
            try {
                response = await next();
            } catch (error: unknown) {
                response = await onError(error);
            }

            // Noms en minuscules, comme les autres en-têtes de la réponse ("content-type") :
            // "X-Frame-Options" et "x-frame-options" ne peuvent pas finir en double.
            const added: Record<string, string> = {};
            for (const [name, value] of Object.entries(headers)) {
                added[name.toLowerCase()] = value;
            }

            // Les en-têtes de la réponse passent après : une route qui fixe elle-même
            // un de ces en-têtes garde sa valeur.
            return { ...response, headers: { ...added, ...response.headers } };
        };
