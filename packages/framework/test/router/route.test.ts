import { beforeEach, describe, expect, it } from "vitest";
import { Route } from "../../src/router/route.js";
import {
  getGroupStack,
  getRoutes,
  resetRegistry,
} from "../../src/router/registry.js";
import type {
  Controller,
  HttpMethod,
  Middleware,
  Schema,
} from "../../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });
const mwA: Middleware = (_ctx, next) => next();
const mwB: Middleware = (_ctx, next) => next();
const schema: Schema<unknown> = {
  parse: (input) => ({ ok: true, value: input }),
};

describe("RTE-01 · registre de routes statique", () => {
  beforeEach(() => resetRegistry());

  it.each<[HttpMethod, typeof Route.get]>([
    ["GET", Route.get],
    ["POST", Route.post],
    ["PUT", Route.put],
    ["PATCH", Route.patch],
    ["DELETE", Route.delete],
  ])("%s enregistre une route avec la bonne méthode", (method, declare) => {
    declare("/journeys", ctrl);
    expect(getRoutes()).toHaveLength(1);
    expect(getRoutes()[0]).toMatchObject({
      method,
      path: "/journeys",
      controller: ctrl,
      middlewares: [],
      name: undefined,
      version: undefined,
    });
    expect(getRoutes()[0]?.schemas).toEqual({});
  });

  it("chaîne .name() et .middleware() sur la même route", () => {
    const builder = Route.get("/a", ctrl)
      .name("a")
      .middleware(mwA)
      .middleware(mwB);
    expect(getRoutes()).toHaveLength(1);
    expect(builder.definition.name).toBe("a");
    expect(builder.definition.middlewares).toEqual([mwA, mwB]);
  });

  it("accepte les options en troisième argument", () => {
    const { definition } = Route.post("/journeys", ctrl, {
      name: "journeys.store",
      middleware: [mwA],
      version: "v2",
      body: schema,
      query: schema,
    });
    expect(definition).toMatchObject({
      name: "journeys.store",
      middlewares: [mwA],
      version: "v2",
      schemas: { body: schema, query: schema },
    });
  });

  it(".middleware() ajoute après les middlewares passés en options", () => {
    const { definition } = Route.get("/a", ctrl, {
      middleware: [mwA],
    }).middleware(mwB);
    expect(definition.middlewares).toEqual([mwA, mwB]);
  });

  it("ne partage pas le tableau de middlewares des options", () => {
    const shared = [mwA];
    Route.get("/a", ctrl, { middleware: shared }).middleware(mwB);
    expect(shared).toEqual([mwA]);
  });

  it("garde les routes dans l’ordre de déclaration", () => {
    Route.get("/a", ctrl);
    Route.post("/b", ctrl);
    expect(getRoutes().map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /a",
      "POST /b",
    ]);
  });

  it("hérite du contexte de groupe courant (prêt pour RTE-02)", () => {
    getGroupStack().push(
      { prefix: "/api", namePrefix: "api.", middlewares: [mwA], version: "v1" },
      {
        prefix: "/journeys",
        namePrefix: "journeys.",
        middlewares: [mwB],
        version: undefined,
      },
    );
    const { definition } = Route.get("/{id}", ctrl).name("show");
    expect(definition).toMatchObject({
      path: "/api/journeys/{id}",
      name: "api.journeys.show",
      middlewares: [mwA, mwB],
      version: "v1",
    });
  });

  it("la version passée en option l’emporte sur celle du groupe", () => {
    getGroupStack().push({
      prefix: "",
      namePrefix: "",
      middlewares: [],
      version: "v1",
    });
    expect(Route.get("/a", ctrl, { version: "v2" }).definition.version).toBe(
      "v2",
    );
  });

  it("resetRegistry vide les routes et la pile de groupes", () => {
    Route.get("/a", ctrl);
    getGroupStack().push({
      prefix: "/x",
      namePrefix: "",
      middlewares: [],
      version: undefined,
    });
    resetRegistry();
    expect(getRoutes()).toHaveLength(0);
    expect(getGroupStack()).toHaveLength(0);
  });
});
