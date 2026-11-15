import { describe, expect, it } from "vitest";
import { Route } from "../../src/router/route.js";
import { getGroupStack, getRoutes } from "../../src/router/registry.js";
import type { Controller } from "../../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });

describe("RTE-03 · Route.clear()", () => {
  it("vide les routes enregistrées", () => {
    Route.get("/a", ctrl).name("a");
    Route.post("/b", ctrl).name("b");
    Route.clear();
    expect(getRoutes()).toHaveLength(0);
  });

  it("vide la pile de groupes", () => {
    getGroupStack().push({
      prefix: "/x",
      namePrefix: "x.",
      middlewares: [],
      version: undefined,
    });
    Route.clear();
    expect(getGroupStack()).toHaveLength(0);
    expect(Route.get("/a", ctrl).definition.path).toBe("/a");
  });

  it("permet de redéclarer les mêmes routes après un clear", () => {
    Route.get("/a", ctrl).name("a");
    Route.clear();
    Route.get("/a", ctrl).name("a");
    expect(getRoutes()).toHaveLength(1);
  });

  it("est sans effet sur un registre déjà vide", () => {
    Route.clear();
    Route.clear();
    expect(getRoutes()).toHaveLength(0);
  });
});

// Critère du planning : deux tests qui déclarent la même route nommée passent
// l'un après l'autre, quel que soit l'ordre. Chacun ne doit voir que SA route :
// c'est test/setup.ts qui garantit le reset entre les deux.
describe("RTE-03 · isolation entre tests (via test/setup.ts)", () => {
  it("test 1 déclare journeys.show", () => {
    Route.get("/journeys/{id}", ctrl).name("journeys.show");
    expect(getRoutes()).toHaveLength(1);
  });

  it("test 2 déclare aussi journeys.show", () => {
    Route.get("/journeys/{id}", ctrl).name("journeys.show");
    expect(getRoutes()).toHaveLength(1);
  });
});
