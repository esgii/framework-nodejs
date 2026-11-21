import { describe, expect, it } from "vitest";
import { url as publicUrl } from "../../src/index.js";
import { RouteError } from "../../src/router/errors.js";
import { getRoutes } from "../../src/router/registry.js";
import { createResolver } from "../../src/router/resolve.js";
import { Route } from "../../src/router/route.js";
import { url } from "../../src/router/url.js";
import type { Controller } from "../../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });

describe("RTE-08 · générer une URL à partir d'un nom de route", () => {
  it("remplace les paramètres et ajoute la version par défaut", () => {
    Route.get("/journeys/{journeyId}", ctrl).name("journeys.show");
    Route.freeze("v1");
    expect(url("journeys.show", { journeyId: 3 })).toBe("/v1/journeys/3");
  });

  it("utilise la version de la route (VER-03)", () => {
    Route.version("v2", () => {
      Route.get("/journeys", ctrl).name("v2.journeys.index");
    });
    Route.freeze("v1");
    expect(url("v2.journeys.index")).toBe("/v2/journeys");
  });

  it("garde le nom complet d'un groupe et plusieurs paramètres", () => {
    Route.group({ prefix: "/journeys/{journeyId}", name: "journeys." }, () => {
      Route.get("/steps/{stepId}", ctrl).name("steps.show");
    });
    Route.freeze("v1");
    expect(url("journeys.steps.show", { journeyId: 3, stepId: "7" })).toBe(
      "/v1/journeys/3/steps/7",
    );
  });

  it("encode / ? et espace pour qu'ils restent dans le segment", () => {
    Route.get("/tags/{name}", ctrl).name("tags.show");
    Route.freeze("v1");
    expect(url("tags.show", { name: "été/hiver ?" })).toBe(
      "/v1/tags/%C3%A9t%C3%A9%2Fhiver%20%3F",
    );
  });

  it("garde les / d'un paramètre de fin de chemin {path*}", () => {
    Route.get("/files/{path*}", ctrl).name("files.show");
    Route.freeze("v1");
    expect(url("files.show", { path: "2026/rome bis.png" })).toBe(
      "/v1/files/2026/rome%20bis.png",
    );
  });

  it("produit une URL que le résolveur retrouve avec les mêmes valeurs", () => {
    Route.get("/tags/{name}", ctrl).name("tags.show");
    Route.get("/files/{path*}", ctrl).name("files.show");
    Route.freeze("v1");
    const resolver = createResolver(getRoutes());
    expect(resolver.resolve("GET", url("tags.show", { name: "a/b ?c" })).params).toEqual({
      name: "a/b ?c",
    });
    expect(resolver.resolve("GET", url("files.show", { path: "x/y z" })).params).toEqual({
      path: "x/y z",
    });
  });

  it("est exportée par le framework", () => {
    Route.get("/", ctrl).name("home");
    Route.freeze("v1");
    expect(publicUrl("home")).toBe("/v1");
  });
});

describe("RTE-08 · erreurs explicites", () => {
  it("refuse une route inconnue, en la nommant", () => {
    Route.freeze("v1");
    expect(() => url("journeys.nope")).toThrow(RouteError);
    expect(() => url("journeys.nope")).toThrow("route inconnue « journeys.nope »");
  });

  it("refuse un paramètre manquant, en nommant la route et le paramètre", () => {
    Route.get("/journeys/{journeyId}", ctrl).name("journeys.show");
    Route.freeze("v1");
    expect(() => url("journeys.show")).toThrow(
      'url("journeys.show") : paramètre « journeyId » manquant',
    );
  });

  it("refuse un paramètre vide, que le résolveur ne retrouverait pas", () => {
    Route.get("/journeys/{journeyId}", ctrl).name("journeys.show");
    Route.freeze("v1");
    expect(() => url("journeys.show", { journeyId: "" })).toThrow(
      "paramètre « journeyId » vide",
    );
  });

  it("refuse un paramètre en trop (faute de frappe)", () => {
    Route.get("/journeys/{journeyId}", ctrl).name("journeys.show");
    Route.freeze("v1");
    expect(() => url("journeys.show", { journeyId: 3, journeyID: 3 })).toThrow(
      "paramètre(s) inconnu(s) pour cette route : journeyID",
    );
  });

  it("refuse d'être appelée avant Route.freeze()", () => {
    Route.get("/journeys", ctrl).name("journeys.index");
    expect(() => url("journeys.index")).toThrow("le registre n'est pas figé");
  });
});
