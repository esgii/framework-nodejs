import type { Middleware, RouteDefinition } from "../types.js";

/**
 * Construit la chaîne de middlewares d'une requête, dans l'ordre exigé par le sujet :
 *
 *   1. globaux, dans l'ordre des kernel.use(...)
 *   2. groupes, du plus externe au plus interne
 *   3. route : d'abord les options ({ middleware: [...] }), puis les .middleware(...)
 *
 * Les points 2 et 3 sont déjà rangés dans route.middlewares au moment de la
 * déclaration : il ne reste qu'à placer les globaux devant.
 *
 * Sans route (404, 405), seuls les globaux s'exécutent : CORS, logs et en-têtes
 * de sécurité doivent s'appliquer aussi aux réponses d'erreur .
 *
 * Renvoie toujours un nouveau tableau : ni `globals` ni la route ne sont modifiés.
 */
export function buildChain(
  globals: readonly Middleware[],
  route?: Pick<RouteDefinition, "middlewares">,
): Middleware[] {
  return [...globals, ...(route?.middlewares ?? [])];
}
