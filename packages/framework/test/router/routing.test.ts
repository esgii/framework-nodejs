/**
 * RTE-10 · le routage de bout en bout, comme le kernel s'en servira :
 * déclarer (Route), figer (Route.freeze), chercher (createResolver), générer (url).
 * Les tests détaillés de chaque morceau sont dans compile, resolve, group, names,
 * version et url.test.ts ; ici, un test par cas de la liste du planning.
 * Le registre est vidé avant chaque test par test/setup.ts (Route.clear()).
 */
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { buildContext } from "../../src/http/context.js";
import { HttpError, MethodNotAllowedError, NotFoundError } from "../../src/http/errors.js";
import { RouteError } from "../../src/router/errors.js";
import { getRoutes } from "../../src/router/registry.js";
import { createResolver, type Resolver } from "../../src/router/resolve.js";
import { Route } from "../../src/router/route.js";
import { url } from "../../src/router/url.js";
import type { Controller } from "../../src/types.js";

/** Un contrôleur reconnaissable : sa réponse porte son nom. */
function named(label: string): Controller {
  return () => ({ status: 200, headers: {}, body: label });
}

/** Fige le registre en v1 et prépare le résolveur, comme au démarrage du serveur. */
function boot(): Resolver {
  Route.freeze("v1");
  return createResolver(getRoutes());
}

/** Le nom du contrôleur trouvé pour cette requête. */
async function hit(resolver: Resolver, method: string, path: string): Promise<unknown> {
  const { route, resolved, params } = resolver.resolve(method, path);
  const req = new IncomingMessage(new Socket());
  req.url = path;
  const response = await route.controller(buildContext(req, resolved, params));
  return response.body;
}

describe("RTE-10 · les 5 formes de motif, à travers le résolveur", () => {
  it.each([
    ["{id} non vide", "/users/{id}", "/v1/users/42", { id: "42" }],
    ["plusieurs paramètres", "/journeys/{journeyId}/steps/{stepId}", "/v1/journeys/3/steps/7", { journeyId: "3", stepId: "7" }],
    ["{nom}.json", "/exports/{name}.json", "/v1/exports/rome.json", { name: "rome" }],
    ["fin de chemin {path*}", "/files/{path*}", "/v1/files/2026/11/rome.png", { path: "2026/11/rome.png" }],
    ["littéral exact", "/status", "/v1/status", {}],
  ])("%s : %s", (_label, pattern, path, params) => {
    Route.get(pattern, named("ok"));
    expect(boot().resolve("GET", path).params).toEqual(params);
  });

  it.each([
    ["un {id} vide", "/users/{id}", "/v1/users/"],
    ["un {id} qui contiendrait un /", "/users/{id}", "/v1/users/4/2"],
    ["un .json absent", "/exports/{name}.json", "/v1/exports/rome"],
    ["un {path*} vide", "/files/{path*}", "/v1/files/"],
    ["un littéral prolongé", "/status", "/v1/statusx"],
    ["un littéral dans une autre casse", "/status", "/v1/STATUS"],
  ])("ne confond pas %s (%s, %s) : 404", (_label, pattern, path) => {
    Route.get(pattern, named("ok"));
    expect(() => boot().resolve("GET", path)).toThrow(NotFoundError);
  });

  it("refuse un motif invalide au démarrage, pas pendant une requête", () => {
    Route.get("/users/{}", named("ko"));
    expect(() => boot()).toThrow(RouteError);
  });
});

describe("RTE-10 · priorité statique", () => {
  // Le test à savoir montrer à l'oral : /users/me est déclaré APRÈS /users/{id}, et gagne quand même.
  it("la route statique gagne sur la dynamique, même déclarée après", async () => {
    Route.get("/users/{id}", named("show"));
    Route.get("/users/me", named("me"));
    const resolver = boot();
    expect(await hit(resolver, "GET", "/v1/users/me")).toBe("me");
    expect(await hit(resolver, "GET", "/v1/users/42")).toBe("show");
  });
});

describe("RTE-10 · 404 et 405", () => {
  it("répond 404 au format unique pour un chemin inconnu", () => {
    Route.get("/journeys", named("index"));
    const resolver = boot();
    expect(() => resolver.resolve("GET", "/v1/nothing")).toThrow(NotFoundError);
    try {
      resolver.resolve("GET", "/v1/nothing");
    } catch (error) {
      expect(error instanceof HttpError && error.toResponse()).toMatchObject({
        status: 404,
        body: { error: { code: "NOT_FOUND" } },
      });
    }
  });

  it("répond 405 avec Allow quand seule la méthode est fausse", () => {
    Route.get("/journeys/{id}", named("show"));
    Route.delete("/journeys/{id}", named("destroy"));
    const resolver = boot();
    expect(() => resolver.resolve("POST", "/v1/journeys/3")).toThrow(MethodNotAllowedError);
    try {
      resolver.resolve("POST", "/v1/journeys/3");
    } catch (error) {
      expect(error instanceof HttpError && error.toResponse()).toMatchObject({
        status: 405,
        headers: { allow: "GET, DELETE" },
      });
    }
  });
});

describe("RTE-10 · groupes", () => {
  it("résout une route de groupes imbriqués, avec ses paramètres et son nom complet", async () => {
    Route.group({ prefix: "/journeys", name: "journeys." }, () => {
      Route.group({ prefix: "/{journeyId}/steps", name: "steps." }, () => {
        Route.get("/{stepId}", named("step")).name("show");
      });
    });
    const resolver = boot();
    const match = resolver.resolve("GET", "/v1/journeys/3/steps/7");
    expect(match.params).toEqual({ journeyId: "3", stepId: "7" });
    expect(match.resolved.name).toBe("journeys.steps.show");
    expect(await hit(resolver, "GET", "/v1/journeys/3/steps/7")).toBe("step");
  });
});

describe("RTE-10 · url() et ses erreurs", () => {
  it("génère une URL que le résolveur retrouve à l'identique", () => {
    Route.get("/journeys/{journeyId}", named("show")).name("journeys.show");
    const resolver = boot();
    const generated = url("journeys.show", { journeyId: "rome & milan/2026" });
    expect(generated).toBe("/v1/journeys/rome%20%26%20milan%2F2026");
    expect(resolver.resolve("GET", generated).params).toEqual({
      journeyId: "rome & milan/2026",
    });
  });

  it("nomme la route et le paramètre dans ses erreurs", () => {
    Route.get("/journeys/{journeyId}", named("show")).name("journeys.show");
    boot();
    expect(() => url("journeys.unknown")).toThrow("« journeys.unknown »");
    expect(() => url("journeys.show")).toThrow("« journeyId » manquant");
  });
});

describe("RTE-10 · noms en double", () => {
  it("fait échouer le démarrage si deux routes portent le même nom", () => {
    Route.get("/a", named("a")).name("dup");
    Route.post("/b", named("b")).name("dup");
    expect(() => boot()).toThrow("Nom de route en double : dup (GET /a et POST /b)");
  });
});
