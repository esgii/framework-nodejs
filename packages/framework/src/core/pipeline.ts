import type { HttpResponse, Middleware, RouteDefinition } from "../types.js";

/**
 * Construit la chaîne de middlewares d'une requête, dans l'ordre exigé par le sujet :
 *
 *   1. globaux, dans l'ordre des kernel.use(...)
 *   2. groupes, du plus externe au plus interne
 *   3. route : d'abord les options ({ middleware: [...] }), puis les .middleware(...)
 *
 * Les points 2 et 3 sont déjà rangés dans route.middlewares au moment de la
 * déclaration (RTE-01, RTE-02) : il ne reste qu'à placer les globaux devant.
 *
 * Sans route (404, 405), seuls les globaux s'exécutent : CORS, logs et en-têtes
 * de sécurité doivent s'appliquer aussi aux réponses d'erreur (KRN-02).
 *
 * Renvoie toujours un nouveau tableau : ni `globals` ni la route ne sont modifiés.
 */
export function buildChain(
  globals: readonly Middleware[],
  route?: Pick<RouteDefinition, "middlewares">,
): Middleware[] {
  return [...globals, ...(route?.middlewares ?? [])];
}

/** Transforme une erreur (de type inconnu) en réponse HTTP. En pratique : le gestionnaire de CTL-08. */
export type ErrorResponder = (
  error: unknown,
) => HttpResponse | Promise<HttpResponse>;

/** Réponse de dernier recours, si le gestionnaire d'erreurs lui-même plante. */
function fallbackResponse(): HttpResponse {
  return {
    status: 500,
    headers: {},
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
        details: null,
      },
    },
  };
}

/**
 * enveloppe une chaîne composée pour qu'aucune erreur ne s'en échappe.
 *
 *   const run = withErrorHandling(compose(chain, controller), (e) => toErrorResponse(e, env));
 *
 * Toute erreur aboutit dans `onError`, quel que soit l'endroit où elle naît :
 * avant next(), après next(), dans le contrôleur, levée (throw) ou rejetée
 * (promesse), ou un next() appelé deux fois (MiddlewareError de compose).
 *
 * Si `onError` plante à son tour, on renvoie une 500 minimale plutôt que de
 * laisser la requête sans réponse.
 */
export function withErrorHandling<C>(
  run: (ctx: C) => Promise<HttpResponse>,
  onError: ErrorResponder,
): (ctx: C) => Promise<HttpResponse> {
  return async (ctx) => {
    try {
      // « return await » et pas « return » : sans await, la promesse serait
      // renvoyée telle quelle et son rejet sortirait du try sans être attrapé.
      return await run(ctx);
    } catch (error: unknown) {
      try {
        return await onError(error);
      } catch {
        return fallbackResponse();
      }
    }
  };
}
