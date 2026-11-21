import { describe, expect, it } from "vitest";
import { BadRequestError } from "../../src/http/errors.js";
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
    expect(match?.route.controller).toBe(show);
    expect(match?.params).toEqual({});
  });

  it("transmet les paramètres d'une route dynamique", () => {
    Route.get("/journeys/{journeyId}/steps/{stepId}", show);
    const match = resolver().resolve("GET", "/journeys/3/steps/7");
    expect(match?.params).toEqual({ journeyId: "3", stepId: "7" });
  });

  it("donne la priorité à la route statique, déclarée après la dynamique", () => {
    Route.get("/users/{id}", show);
    Route.get("/users/me", me);
    expect(resolver().resolve("GET", "/users/me")?.route.controller).toBe(me);
    expect(resolver().resolve("GET", "/users/42")?.route.controller).toBe(show);
  });

  it("donne la priorité à la route statique, déclarée avant la dynamique", () => {
    Route.get("/users/me", me);
    Route.get("/users/{id}", show);
    expect(resolver().resolve("GET", "/users/me")?.route.controller).toBe(me);
  });

  it("s'arrête à la première route dynamique qui correspond", () => {
    const first: Controller = () => ({ status: 200, headers: {}, body: 1 });
    Route.get("/files/{name}", first);
    Route.get("/files/{other}", show);
    expect(resolver().resolve("GET", "/files/a")?.route.controller).toBe(first);
  });

  it("passe à la route dynamique suivante si le motif ne correspond pas", () => {
    Route.get("/journeys/{id}/steps", me);
    Route.get("/journeys/{id}", show);
    expect(resolver().resolve("GET", "/journeys/3")?.route.controller).toBe(show);
  });

  it("garde la première route statique déclarée en cas de doublon", () => {
    Route.get("/a", me);
    Route.get("/a", show);
    expect(resolver().resolve("GET", "/a")?.route.controller).toBe(me);
  });

  it("tient compte de la méthode", () => {
    Route.get("/journeys", show);
    Route.post("/journeys", me);
    Route.delete("/journeys/{id}", me);
    expect(resolver().resolve("POST", "/journeys")?.route.controller).toBe(me);
    expect(resolver().resolve("GET", "/journeys/3")).toBeNull();
  });

  it("accepte une barre oblique finale, sur une route statique et dynamique", () => {
    Route.get("/users/me", me);
    Route.get("/users/{id}", show);
    expect(resolver().resolve("GET", "/users/me/")?.route.controller).toBe(me);
    expect(resolver().resolve("GET", "/users/42/")?.params).toEqual({ id: "42" });
  });

  it("trouve la racine", () => {
    Route.get("/", show);
    expect(resolver().resolve("GET", "/")?.route.controller).toBe(show);
  });

  it("décode les paramètres", () => {
    Route.get("/tags/{name}", show);
    expect(resolver().resolve("GET", "/tags/%C3%A9t%C3%A9%20chaud")?.params).toEqual({
      name: "été chaud",
    });
  });

  it("répond 400 si un paramètre est mal encodé", () => {
    Route.get("/tags/{name}", show);
    expect(() => resolver().resolve("GET", "/tags/%E0%A4%A")).toThrow(BadRequestError);
  });

  it("renvoie null si aucune route ne correspond", () => {
    Route.get("/journeys", show);
    expect(resolver().resolve("GET", "/nothing")).toBeNull();
  });

  it("trouve la route d'un groupe avec son chemin complet", () => {
    Route.group({ prefix: "/journeys/{journeyId}" }, () => {
      Route.get("/steps", show);
    });
    expect(resolver().resolve("GET", "/journeys/5/steps")?.params).toEqual({ journeyId: "5" });
  });
});
