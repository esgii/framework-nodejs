import {
  BadRequestError,
  MethodNotAllowedError,
  NotFoundError,
} from "../http/errors.js";
import type { HttpMethod, RouteDefinition } from "../types.js";
import { compile, matchPattern, type CompiledPattern } from "./compile.js";
import { versionedPath } from "./version.js";

/** Une route trouvée, avec les paramètres lus dans le chemin (déjà décodés). */
export interface RouteMatch {
  readonly route: RouteDefinition;
  readonly params: Record<string, string>;
}

/** Trouve la route d'une requête. Construit une fois au démarrage, utilisé à chaque requête. */
export interface Resolver {
  /**
   * La route qui correspond à la méthode et au chemin.
   * Lève NotFoundError (404) si aucun chemin ne correspond, MethodNotAllowedError (405,
   * avec l'en-tête Allow) si le chemin existe pour d'autres méthodes.
   * `method` est une chaîne : le client peut envoyer n'importe quoi (OPTIONS, HEAD, TRUC…).
   */
  resolve(method: string, path: string): RouteMatch;
}

interface DynamicRoute {
  readonly route: RouteDefinition;
  readonly compiled: CompiledPattern;
}

/** L'ordre des méthodes dans l'en-tête Allow : toujours le même, quel que soit l'ordre des déclarations. */
const METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** '/users/me/' et '/users/me' désignent la même route ; '/' reste '/'. */
function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function staticKey(method: string, path: string): string {
  return `${method} ${path}`;
}

/**
 * '%C3%A9t%C3%A9' devient 'été'. Un encodage cassé ('%E0%A4%A') est une erreur
 * du client : 400, et pas une 500 venue de decodeURIComponent.
 */
function decodeParams(raw: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    try {
      params[name] = decodeURIComponent(value);
    } catch {
      throw new BadRequestError(`Malformed URL parameter "${name}"`);
    }
  }
  return params;
}

/**
 * Prépare la recherche des routes. Appelé une fois, au démarrage, après Route.freeze().
 *
 * - Les routes statiques (sans paramètre) vont dans une Map, avec la clé "GET /users/me" :
 *   on les trouve en une seule lecture, qu'il y ait 10 routes ou 1 000.
 * - Les routes dynamiques sont compilées une fois ici, pas à chaque requête,
 *   puis essayées dans l'ordre de déclaration.
 *
 * Une route statique gagne toujours sur une dynamique, même déclarée après :
 * '/users/me' l'emporte sur '/users/{id}' parce que la Map est lue en premier.
 */
export function createResolver(routes: readonly RouteDefinition[]): Resolver {
  const statics = new Map<string, RouteDefinition>();
  const dynamics: DynamicRoute[] = [];

  for (const route of routes) {
    // La version fait partie du chemin comparé : '/journeys' en v2 devient '/v2/journeys'.
    const path = versionedPath(route);
    const compiled = compile(path);
    if (compiled.isStatic) {
      const key = staticKey(route.method, trimTrailingSlash(path));
      // Même règle que pour les dynamiques : la première route déclarée gagne.
      if (!statics.has(key)) statics.set(key, route);
    } else {
      dynamics.push({ route, compiled });
    }
  }

  /**
   * Les méthodes pour lesquelles ce chemin existe. Appelé seulement quand la requête
   * a échoué : le chemin heureux (route trouvée) ne paie pas ce parcours.
   */
  function allowedMethods(path: string): HttpMethod[] {
    const trimmed = trimTrailingSlash(path);
    return METHODS.filter(
      (method) =>
        statics.has(staticKey(method, trimmed)) ||
        dynamics.some(
          ({ route, compiled }) =>
            route.method === method && matchPattern(compiled, path) !== null,
        ),
    );
  }

  return {
    resolve(method, path) {
      const found = statics.get(staticKey(method, trimTrailingSlash(path)));
      if (found !== undefined) return { route: found, params: {} };

      for (const { route, compiled } of dynamics) {
        if (route.method !== method) continue;
        const raw = matchPattern(compiled, path);
        // On s'arrête à la première route qui correspond.
        if (raw !== null) return { route, params: decodeParams(raw) };
      }

      const allowed = allowedMethods(path);
      // Le chemin existe, mais pas avec cette méthode : 405, et Allow dit lesquelles marchent.
      if (allowed.length > 0) throw new MethodNotAllowedError(allowed);
      throw new NotFoundError("Route not found");
    },
  };
}
