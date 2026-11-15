import { describe, expect, it } from "vitest";
import { Route } from "../../src/router/route.js";
import { RouteError } from "../../src/router/errors.js";
import { getRouteByName, isFrozen } from "../../src/router/registry.js";
import type { Controller } from "../../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });

describe("RTE-07 · routes nommées", () => {
  it("retrouve chaque route par son nom après le gel", () => {
    const index = Route.get("/journeys", ctrl).name("journeys.index");
    const show = Route.get("/journeys/{id}", ctrl).name("journeys.show");
    Route.freeze();

    expect(getRouteByName("journeys.index")).toBe(index.definition);
    expect(getRouteByName("journeys.show")).toBe(show.definition);
    expect(getRouteByName("inconnue")).toBe(undefined);
  });

  it('deux .name("x") → Route.freeze() lève (critère du planning)', () => {
    Route.get("/a", ctrl).name("x");
    Route.post("/b", ctrl).name("x");

    expect(() => Route.freeze()).toThrow(RouteError);
    expect(() => Route.freeze()).toThrow(
      "Nom de route en double : x (GET /a et POST /b)",
    );
  });

  it("n’écrase jamais : après un doublon, aucun nom n’est enregistré et rien n’est figé", () => {
    const first = Route.get("/a", ctrl).name("x");
    Route.post("/b", ctrl).name("x");

    expect(() => Route.freeze()).toThrow(RouteError);
    expect(getRouteByName("x")).toBe(undefined);
    expect(isFrozen()).toBe(false);
    // un second appel redonne la même erreur, pas un faux doublon
    expect(() => Route.freeze()).toThrow("Nom de route en double : x");
    expect(first.definition.path).toBe("/a");
  });

  it("compare les noms finaux, préfixes de groupes compris", () => {
    Route.group({ name: "journeys." }, () => {
      Route.get("/journeys/{id}", ctrl).name("show");
    });
    Route.get("/other/{id}", ctrl).name("journeys.show");

    expect(() => Route.freeze()).toThrow(
      "Nom de route en double : journeys.show",
    );
  });

  it("le même nom court dans deux groupes différents n’est pas un doublon", () => {
    Route.group({ name: "journeys." }, () => {
      Route.get("/journeys", ctrl).name("index");
    });
    Route.group({ name: "users." }, () => {
      Route.get("/users", ctrl).name("index");
    });

    Route.freeze();
    expect(getRouteByName("journeys.index")?.path).toBe("/journeys");
    expect(getRouteByName("users.index")?.path).toBe("/users");
  });

  it("ignore les routes sans nom", () => {
    Route.get("/a", ctrl);
    Route.get("/b", ctrl);
    Route.freeze();
    expect(isFrozen()).toBe(true);
  });

  it("renommer une route avant le gel ne crée pas de doublon", () => {
    Route.get("/a", ctrl).name("old").name("new");
    Route.freeze();
    expect(getRouteByName("new")?.path).toBe("/a");
    expect(getRouteByName("old")).toBe(undefined);
  });

  it("freeze() est idempotent", () => {
    Route.get("/a", ctrl).name("a");
    Route.freeze();
    Route.freeze();
    expect(getRouteByName("a")?.path).toBe("/a");
  });

  describe("après le gel", () => {
    it("refuse une nouvelle route", () => {
      Route.freeze();
      expect(() => Route.get("/late", ctrl)).toThrow(RouteError);
    });

    it("refuse .name() et .middleware() sur une route existante", () => {
      const builder = Route.get("/a", ctrl).name("a");
      Route.freeze();
      expect(() => builder.name("b")).toThrow("figé");
      expect(() => builder.middleware((_ctx, next) => next())).toThrow("figé");
      expect(getRouteByName("a")?.name).toBe("a");
    });
  });

  it("Route.clear() vide les noms et dé-fige le registre", () => {
    Route.get("/a", ctrl).name("a");
    Route.freeze();
    Route.clear();

    expect(isFrozen()).toBe(false);
    expect(getRouteByName("a")).toBe(undefined);
    Route.get("/a", ctrl).name("a");
    Route.freeze();
    expect(getRouteByName("a")?.path).toBe("/a");
  });
});
