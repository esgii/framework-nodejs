import { describe, expect, it } from "vitest";
import {
  BadRequestError,
  HttpError,
  MethodNotAllowedError,
  NotFoundError,
} from "../../src/http/errors.js";
import { createResolver } from "../../src/router/resolve.js";
import { getRoutes } from "../../src/router/registry.js";
import { Route } from "../../src/router/route.js";
import type { Controller } from "../../src/types.js";

const show: Controller = () => ({ status: 200, headers: {}, body: "show" });
const me: Controller = () => ({ status: 200, headers: {}, body: "me" });

/** Le résolveur sur les routes déclarées dans le test (le registre est vidé avant chaque test). */
function resolver() {
  return createResolver(getRoutes());
}

describe("RTE-05 · trouver la bonne route", () => {
  it("trouve une route statique, sans paramètre", () => {
    Route.get("/journeys", show);
    const match = resolver().resolve("GET", "/journeys");
    expect(match.route.controller).toBe(show);
    expect(match.params).toEqual({});
  });

  it("transmet les paramètres d'une route dynamique", () => {
    Route.get("/journeys/{journeyId}/steps/{stepId}", show);
    const match = resolver().resolve("GET", "/journeys/3/steps/7");
    expect(match.params).toEqual({ journeyId: "3", stepId: "7" });
  });

  it("donne la priorité à la route statique, déclarée après la dynamique", () => {
    Route.get("/users/{id}", show);
    Route.get("/users/me", me);
    expect(resolver().resolve("GET", "/users/me").route.controller).toBe(me);
    expect(resolver().resolve("GET", "/users/42").route.controller).toBe(show);
  });

  it("donne la priorité à la route statique, déclarée avant la dynamique", () => {
    Route.get("/users/me", me);
    Route.get("/users/{id}", show);
    expect(resolver().resolve("GET", "/users/me").route.controller).toBe(me);
  });

  it("s'arrête à la première route dynamique qui correspond", () => {
    const first: Controller = () => ({ status: 200, headers: {}, body: 1 });
    Route.get("/files/{name}", first);
    Route.get("/files/{other}", show);
    expect(resolver().resolve("GET", "/files/a").route.controller).toBe(first);
  });

  it("passe à la route dynamique suivante si le motif ne correspond pas", () => {
    Route.get("/journeys/{id}/steps", me);
    Route.get("/journeys/{id}", show);
    expect(resolver().resolve("GET", "/journeys/3").route.controller).toBe(show);
  });

  it("garde la première route statique déclarée en cas de doublon", () => {
    Route.get("/a", me);
    Route.get("/a", show);
    expect(resolver().resolve("GET", "/a").route.controller).toBe(me);
  });

  it("tient compte de la méthode", () => {
    Route.get("/journeys", show);
    Route.post("/journeys", me);
    Route.delete("/journeys/{id}", me);
    expect(resolver().resolve("POST", "/journeys").route.controller).toBe(me);
    expect(resolver().resolve("DELETE", "/journeys/3").route.controller).toBe(me);
  });

  it("accepte une barre oblique finale, sur une route statique et dynamique", () => {
    Route.get("/users/me", me);
    Route.get("/users/{id}", show);
    expect(resolver().resolve("GET", "/users/me/").route.controller).toBe(me);
    expect(resolver().resolve("GET", "/users/42/").params).toEqual({ id: "42" });
  });

  it("trouve la racine", () => {
    Route.get("/", show);
    expect(resolver().resolve("GET", "/").route.controller).toBe(show);
  });

  it("décode les paramètres", () => {
    Route.get("/tags/{name}", show);
    expect(resolver().resolve("GET", "/tags/%C3%A9t%C3%A9%20chaud").params).toEqual({
      name: "été chaud",
    });
  });

  it("répond 400 si un paramètre est mal encodé", () => {
    Route.get("/tags/{name}", show);
    expect(() => resolver().resolve("GET", "/tags/%E0%A4%A")).toThrow(BadRequestError);
  });

  it("trouve la route d'un groupe avec son chemin complet", () => {
    Route.group({ prefix: "/journeys/{journeyId}" }, () => {
      Route.get("/steps", show);
    });
    expect(resolver().resolve("GET", "/journeys/5/steps").params).toEqual({ journeyId: "5" });
  });
});

/** L'erreur levée par resolve, pour pouvoir lire son statut et ses en-têtes. */
function errorOf(run: () => unknown): HttpError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("resolve n'a rien levé");
}

describe("RTE-06 · répondre 404 et 405", () => {
  it("répond 404 si aucun chemin ne correspond", () => {
    Route.get("/journeys", show);
    const error = errorOf(() => resolver().resolve("GET", "/nothing"));
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
  });

  it("répond 404 quand aucune route n'est déclarée", () => {
    expect(() => resolver().resolve("GET", "/")).toThrow(NotFoundError);
  });

  it("répond 405 avec Allow si le chemin statique existe pour une autre méthode", () => {
    Route.get("/journeys", show);
    const error = errorOf(() => resolver().resolve("DELETE", "/journeys"));
    expect(error).toBeInstanceOf(MethodNotAllowedError);
    expect(error.status).toBe(405);
    expect(error.headers).toEqual({ allow: "GET" });
  });

  it("répond 405 avec Allow si le chemin dynamique existe pour une autre méthode", () => {
    Route.delete("/journeys/{id}", me);
    Route.get("/journeys/{id}/steps", show);
    const error = errorOf(() => resolver().resolve("GET", "/journeys/3"));
    expect(error.headers).toEqual({ allow: "DELETE" });
  });

  it("liste toutes les méthodes du chemin, dans un ordre fixe", () => {
    Route.delete("/journeys/{id}", me);
    Route.patch("/journeys/{id}", me);
    Route.get("/journeys/{id}", show);
    Route.put("/journeys/{id}", me);
    const error = errorOf(() => resolver().resolve("POST", "/journeys/3/"));
    expect(error.headers).toEqual({ allow: "GET, PUT, PATCH, DELETE" });
  });

  it("répond 405 à une méthode que le framework ne connaît pas", () => {
    Route.get("/journeys", show);
    Route.post("/journeys", me);
    const error = errorOf(() => resolver().resolve("OPTIONS", "/journeys"));
    expect(error.headers).toEqual({ allow: "GET, POST" });
  });

  it("produit le format d'erreur unique", () => {
    Route.get("/journeys", show);
    const response = errorOf(() => resolver().resolve("PUT", "/journeys")).toResponse();
    expect(response.headers).toMatchObject({ allow: "GET" });
    expect(response.body).toEqual({
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed", details: [] },
    });
  });
});
