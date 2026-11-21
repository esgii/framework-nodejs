import { BadRequestError } from "../http/errors.js";
import type { HttpMethod, RouteDefinition } from "../types.js";
import { compile, matchPattern, type CompiledPattern } from "./compile.js";

/** Une route trouvée, avec les paramètres lus dans le chemin (déjà décodés). */
export interface RouteMatch {
  readonly route: RouteDefinition;
  readonly params: Record<string, string>;
}

/** Trouve la route d'une requête. Construit une fois au démarrage, utilisé à chaque requête. */
export interface Resolver {
  /** La route qui correspond, ou null si aucune ne correspond. */
  resolve(method: HttpMethod, path: string): RouteMatch | null;
}

interface DynamicRoute {
  readonly route: RouteDefinition;
  readonly compiled: CompiledPattern;
}

/** '/users/me/' et '/users/me' désignent la même route ; '/' reste '/'. */
function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function staticKey(method: HttpMethod, path: string): string {
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
    const compiled = compile(route.path);
    if (compiled.isStatic) {
      const key = staticKey(route.method, trimTrailingSlash(route.path));
      // Même règle que pour les dynamiques : la première route déclarée gagne.
      if (!statics.has(key)) statics.set(key, route);
    } else {
      dynamics.push({ route, compiled });
    }
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
      return null;
    },
  };
}
