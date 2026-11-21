import { RouteError } from "./errors.js";

/**
 * Les règles des versions d'API, à part pour que le registre (VER-02),
 * les groupes (VER-01) et le résolveur les partagent sans import circulaire.
 */

/** Une version d'API : v1, v2… (même règle que config.api.defaultVersion). */
const VERSION = /^v\d+$/;

/** Lève une RouteError au démarrage si la version n'est pas de la forme v1, v2… */
export function assertVersion(name: string): void {
  if (!VERSION.test(name)) {
    throw new RouteError(
      `Version invalide « ${name} » : attendu v1, v2… (lettre v puis un nombre)`,
    );
  }
}

/**
 * Le chemin complet d'une route, version comprise : '/journeys' en v2 → '/v2/journeys'.
 * C'est ce chemin que le résolveur compare à la requête : la version fait partie
 * de la clé, donc /v1/journeys et /v2/journeys sont deux routes distinctes.
 * Le chemin d'une route commence toujours par '/' (joinPaths, RTE-02).
 */
export function versionedPath(route: {
  readonly path: string;
  readonly version: string | undefined;
}): string {
  if (route.version === undefined) return route.path;
  return route.path === "/" ? `/${route.version}` : `/${route.version}${route.path}`;
}
