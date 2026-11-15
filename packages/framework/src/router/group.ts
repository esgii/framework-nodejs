import type { Middleware } from "../types.js";
import { RouteError } from "./errors.js";
import { getGroupStack } from "./registry.js";

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
  const stack = getGroupStack();
  stack.push({
    prefix: options.prefix ?? "",
    namePrefix: options.name ?? "",
    middlewares: [...(options.middleware ?? [])],
    version: undefined,
  });
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
