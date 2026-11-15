import type {
  Controller,
  HttpMethod,
  Middleware,
  RouteDefinition,
  RouteOptions,
  RouteSchemas,
} from "../types.js";
import {
  addRoute,
  currentMiddlewares,
  currentNamePrefix,
  currentPrefix,
  currentVersion,
} from "./registry.js";

/** Objet renvoyé par Route.get/post/... pour chaîner .name() et .middleware(). */
export interface RouteBuilder {
  name(name: string): RouteBuilder;
  middleware(...middlewares: Middleware[]): RouteBuilder;
  /** La définition enregistrée, utile pour les tests et le débogage. */
  readonly definition: Readonly<RouteDefinition>;
}

function register(
  method: HttpMethod,
  path: string,
  controller: Controller,
  options: RouteOptions = {},
): RouteBuilder {
  // Avec exactOptionalPropertyTypes, une clé optionnelle doit être absente,
  // pas présente avec la valeur undefined : on ne l'ajoute que si elle existe.
  const schemas: RouteSchemas = {};
  if (options.body !== undefined) schemas.body = options.body;
  if (options.query !== undefined) schemas.query = options.query;

  const def: RouteDefinition = {
    method,
    path: currentPrefix() + path,
    controller,
    middlewares: [...currentMiddlewares(), ...(options.middleware ?? [])],
    name: undefined,
    version: options.version ?? currentVersion(),
    schemas,
  };
  addRoute(def);

  const builder: RouteBuilder = {
    name(name) {
      // Le préfixe du groupe est figé au moment de la déclaration : le nom
      // stocké est le nom final (exigence de RTE-02).
      def.name = currentNamePrefix() + name;
      return builder;
    },
    middleware(...middlewares) {
      def.middlewares.push(...middlewares);
      return builder;
    },
    definition: def,
  };

  if (options.name !== undefined) builder.name(options.name);
  return builder;
}

/**
 * Point d'entrée statique, style Laravel : aucune instance à créer.
 *
 *   Route.get('/journeys/{id}', show).name('journeys.show').middleware(auth);
 */
export const Route = {
  get: (path: string, controller: Controller, options?: RouteOptions) =>
    register("GET", path, controller, options),
  post: (path: string, controller: Controller, options?: RouteOptions) =>
    register("POST", path, controller, options),
  put: (path: string, controller: Controller, options?: RouteOptions) =>
    register("PUT", path, controller, options),
  patch: (path: string, controller: Controller, options?: RouteOptions) =>
    register("PATCH", path, controller, options),
  delete: (path: string, controller: Controller, options?: RouteOptions) =>
    register("DELETE", path, controller, options),
};
