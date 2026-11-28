/**
 * QA-01 · le beforeEach commun (test/setup.ts) remet à zéro l'état partagé.
 * Les deux tests modifient le même état ; vitest les lance dans un ordre aléatoire :
 * chacun vérifie d'abord qu'il part d'un état propre, quel que soit celui qui passe en premier.
 */
import { describe, expect, it } from "vitest";
import { serializers } from "../src/http/serializers.js";
import { getGroupStack, getRoutes, isFrozen } from "../src/router/registry.js";
import { Route } from "../src/router/route.js";
import type { Controller } from "../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });
const csv = { status: 200, headers: { "content-type": "text/csv" }, body: ["a"] };

function expectCleanState(): void {
  expect(getRoutes()).toHaveLength(0);
  expect(getGroupStack()).toHaveLength(0);
  expect(isFrozen()).toBe(false);
  expect(() => serializers.serialize(csv)).toThrow("No serializer");
}

/** Laisse derrière lui tout ce qu'un test peut oublier : routes, nom, gel, format ajouté. */
function dirtyEverything(): void {
  Route.get("/a", ctrl).name("a");
  Route.freeze("v1");
  serializers.register("text/csv", () => "a");
}

describe("QA-01 · isolation entre les tests", () => {
  it("premier test : part d'un état propre puis le salit", () => {
    expectCleanState();
    dirtyEverything();
  });

  it("second test : part d'un état propre puis le salit", () => {
    expectCleanState();
    dirtyEverything();
  });
});
