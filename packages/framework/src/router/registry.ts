import type { Middleware, RouteDefinition } from "../types.js";

export interface GroupContext {
  readonly prefix: string;
  readonly namePrefix: string;
  readonly middlewares: readonly Middleware[];
  readonly version: string | undefined;
}

const routes: RouteDefinition[] = [];
const groupStack: GroupContext[] = [];

export function addRoute(def: RouteDefinition): void {
  routes.push(def);
}

/** Lecture seule : le résolveur (RTE-05) et le gel (RTE-07) partiront de là. */
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

/** Du groupe le plus externe au plus interne (ordre exigé par MDW-02). */
export function currentMiddlewares(): Middleware[] {
  return groupStack.flatMap((g) => g.middlewares);
}

/** Version du groupe le plus interne qui en fixe une (Route.version, VER-01). */
export function currentVersion(): string | undefined {
  return [...groupStack].reverse().find((g) => g.version !== undefined)
    ?.version;
}

/**
 * Remet le registre à zéro (exposé en Route.clear()).
 */
export function resetRegistry(): void {
  routes.length = 0;
  groupStack.length = 0;
}
