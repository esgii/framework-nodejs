import type { Middleware, RouteDefinition } from "../types.js";
import { RouteError } from "./errors.js";

/**
 * Contexte d'un groupe de routes. La pile est remplie par Route.group ;
 *  elle reste vide, mais register() la lit déjà, donc RTE-02 n'aura
 * qu'à pousser/dépiler sans toucher à route.ts.
 */
export interface GroupContext {
  readonly prefix: string;
  readonly namePrefix: string;
  readonly middlewares: readonly Middleware[];
  readonly version: string | undefined;
}

const routes: RouteDefinition[] = [];
const groupStack: GroupContext[] = [];
/** Nom final → route. Rempli par freezeRegistry() (RTE-07). */
const names = new Map<string, RouteDefinition>();
let frozen = false;

/**
 * Une fois le registre figé (au démarrage du serveur), plus aucune route ne
 * peut être ajoutée ni modifiée : la Map des noms et le cache
 * compilé ne seraient plus à jour.
 */
export function assertNotFrozen(): void {
  if (frozen) {
    throw new RouteError(
      "Le registre de routes est figé (Route.freeze() a été appelé) : impossible de déclarer ou modifier une route.",
    );
  }
}

export function isFrozen(): boolean {
  return frozen;
}

export function addRoute(def: RouteDefinition): void {
  assertNotFrozen();
  routes.push(def);
}

/**
 * Fige le registre (exposé en Route.freeze(), appelé par le kernel au démarrage).
 */
export function freezeRegistry(): void {
  if (frozen) return;

  // Construite à part puis recopiée : si un doublon lève, `names` reste vide et
  // un nouvel appel donnera la même erreur (et non un faux doublon avec elle-même).
  const found = new Map<string, RouteDefinition>();
  for (const route of routes) {
    if (route.name === undefined) continue;
    const existing = found.get(route.name);
    if (existing !== undefined) {
      throw new RouteError(
        `Nom de route en double : ${route.name} (${existing.method} ${existing.path} et ${route.method} ${route.path})`,
      );
    }
    found.set(route.name, route);
  }

  for (const [name, route] of found) names.set(name, route);
  frozen = true;
}

/** Route portant ce nom final, ou undefined. Vide tant que le registre n'est pas figé. */
export function getRouteByName(name: string): RouteDefinition | undefined {
  return names.get(name);
}

/** Lecture seule : le gel (freezeRegistry) et le résolveur partent de là. */
export function getRoutes(): readonly RouteDefinition[] {
  return routes;
}

export function getGroupStack(): GroupContext[] {
  return groupStack;
}

export function currentPrefix(): string {
  return groupStack.map((g) => g.prefix).join("");
}

export function currentNamePrefix(): string {
  return groupStack.map((g) => g.namePrefix).join("");
}

/** Du groupe le plus externe au plus interne */
export function currentMiddlewares(): Middleware[] {
  return groupStack.flatMap((g) => g.middlewares);
}

/** Version du groupe le plus interne qui en fixe une Route.version  */
export function currentVersion(): string | undefined {
  return [...groupStack].reverse().find((g) => g.version !== undefined)
    ?.version;
}

/**
 * Remet le registre à zéro et le dé-fige (exposé en Route.clear())
 * Chaque nouvelle structure ajoutée au registre doit être vidée ici
 */
export function resetRegistry(): void {
  routes.length = 0;
  groupStack.length = 0;
  names.clear();
  frozen = false;
}
