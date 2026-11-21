import type { Middleware } from "../types.js";
import { RouteError } from "./errors.js";
import { getGroupStack, type GroupContext } from "./registry.js";

/** Options de Route.group : toutes facultatives. */
export interface GroupOptions {
  /** Préfixe de chemin, ex. '/journeys' ou '/{journeyId}/steps'. */
  prefix?: string;
  /** Middlewares appliqués à toutes les routes du groupe. */
  middleware?: readonly Middleware[];
  /** Préfixe de nom, ex. 'journeys.' (le point fait partie du préfixe). */
  name?: string;
}

/**
 * Assemble des morceaux de chemin en un chemin propre :
 * un seul '/' entre les segments, un '/' au début, aucun à la fin.
 *
 *   joinPaths('/api/', '/users')      → '/api/users'
 *   joinPaths('/journeys', '/')       → '/journeys'
 *   joinPaths('', '/')                → '/'
 */
export function joinPaths(...parts: readonly string[]): string {
  const segments = parts
    .flatMap((part) => part.split("/"))
    .filter((s) => s !== "");
  return "/" + segments.join("/");
}

/**
 * Déclare un groupe de routes. Les groupes s'imbriquent : préfixes de chemin et
 * de nom sont concaténés, middlewares empilés du plus externe au plus interne.
 *
 *   Route.group({ prefix: '/journeys', middleware: [auth], name: 'journeys.' }, () => {
 *     Route.get('/', list).name('index');   // GET /journeys → journeys.index
 *   });
 */
export function group(options: GroupOptions, callback: () => unknown): void {
  withGroup(
    {
      prefix: options.prefix ?? "",
      namePrefix: options.name ?? "",
      middlewares: [...(options.middleware ?? [])],
      version: undefined,
    },
    callback,
  );
}

/** Une version d'API : v1, v2… (même règle que config.api.defaultVersion). */
const VERSION = /^v\d+$/;

/**
 * Déclare des routes dans une version. Marche comme un groupe sans préfixe :
 * la version est ajoutée devant le chemin quand on cherche la route (VER-01).
 *
 *   Route.get('/journeys', listV1);           // GET /v1/journeys (version par défaut)
 *   Route.version('v2', () => {
 *     Route.get('/journeys', listV2);         // GET /v2/journeys
 *   });
 */
export function version(name: string, callback: () => unknown): void {
  assertVersion(name);
  withGroup(
    { prefix: "", namePrefix: "", middlewares: [], version: name },
    callback,
  );
}

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
 */
export function versionedPath(route: {
  readonly path: string;
  readonly version: string | undefined;
}): string {
  return route.version === undefined
    ? route.path
    : joinPaths(route.version, route.path);
}

/** Empile le contexte du groupe le temps du callback, puis le dépile toujours. */
function withGroup(context: GroupContext, callback: () => unknown): void {
  const stack = getGroupStack();
  stack.push(context);
  try {
    const result = callback();
    // Un callback async rendrait la main à son premier await : les routes
    // déclarées ensuite seraient enregistrées hors du groupe, sans erreur.
    if (result instanceof Promise) {
      throw new RouteError(
        "Route.group : le callback doit être synchrone (pas de async ni de Promise).",
      );
    }
  } finally {
    // Toujours dépiler, même si le callback lève : sinon toutes les routes
    // déclarées ensuite hériteraient de ce groupe.
    stack.pop();
  }
}
