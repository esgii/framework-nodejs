import { describe, expect, it } from "vitest";
import { buildChain } from "../../src/core/pipeline.js";
import { Route } from "../../src/router/route.js";
import type { Controller, Middleware } from "../../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });

// Un middleware distinct par rôle : on compare les références, donc l'ordre exact.
const mw = (): Middleware => (_ctx, next) => next();
const G = mw();
const G1 = mw();
const G2 = mw();
const R = mw();

describe("MDW-02 · ordre global → groupes → route", () => {
  it("global, deux groupes imbriqués, route → G, G1, G2, R (test exigé par le sujet)", () => {
    let route = Route.get("/tmp", ctrl);
    Route.group({ prefix: "/g1", middleware: [G1] }, () => {
      Route.group({ prefix: "/g2", middleware: [G2] }, () => {
        route = Route.get("/r", ctrl).middleware(R);
      });
    });

    expect(buildChain([G], route.definition)).toEqual([G, G1, G2, R]);
  });

  it("garde l’ordre des globaux et place les options de route avant .middleware()", () => {
    const globalA = mw();
    const globalB = mw();
    const fromOptions = mw();
    const chained = mw();

    let route = Route.get("/tmp", ctrl);
    Route.group({ middleware: [G1] }, () => {
      route = Route.get("/r", ctrl, { middleware: [fromOptions] }).middleware(
        chained,
      );
    });

    expect(buildChain([globalA, globalB], route.definition)).toEqual([
      globalA,
      globalB,
      G1,
      fromOptions,
      chained,
    ]);
  });

  it("les middlewares d’un groupe frère ne s’appliquent pas", () => {
    Route.group({ middleware: [G1] }, () => {
      Route.get("/a", ctrl);
    });
    let route = Route.get("/tmp", ctrl);
    Route.group({ middleware: [G2] }, () => {
      route = Route.get("/b", ctrl);
    });

    expect(buildChain([G], route.definition)).toEqual([G, G2]);
  });

  it("sans route (404/405), seuls les globaux s’exécutent", () => {
    expect(buildChain([G, G1])).toEqual([G, G1]);
  });

  it("sans aucun middleware, la chaîne est vide", () => {
    expect(buildChain([], Route.get("/a", ctrl).definition)).toEqual([]);
  });

  it("ne modifie ni les globaux ni la route", () => {
    const globals = [G];
    const route = Route.get("/a", ctrl).middleware(R);

    const chain = buildChain(globals, route.definition);
    chain.push(G2);

    expect(globals).toEqual([G]);
    expect(route.definition.middlewares).toEqual([R]);
  });
});
