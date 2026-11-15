import { describe, expect, it } from "vitest";
import { Route } from "../../src/router/route.js";
import { joinPaths } from "../../src/router/group.js";
import { RouteError } from "../../src/router/errors.js";
import { getGroupStack, getRoutes } from "../../src/router/registry.js";
import type { Controller, Middleware } from "../../src/types.js";

const ctrl: Controller = () => ({ status: 200, headers: {}, body: null });
const auth: Middleware = (_ctx, next) => next();
const admin: Middleware = (_ctx, next) => next();
const owner: Middleware = (_ctx, next) => next();
const audit: Middleware = (_ctx, next) => next();

describe("RTE-02 · groupes de routes imbriqués", () => {
  it("combine chemin, nom et middlewares sur 3 niveaux", () => {
    Route.group({ prefix: "/api", middleware: [auth], name: "api." }, () => {
      Route.group(
        { prefix: "/journeys", middleware: [admin], name: "journeys." },
        () => {
          Route.group(
            {
              prefix: "/{journeyId}/steps",
              middleware: [owner],
              name: "steps.",
            },
            () => {
              Route.post("/", ctrl).name("store").middleware(audit);
            },
          );
        },
      );
    });

    expect(getRoutes()).toHaveLength(1);
    expect(getRoutes()[0]).toMatchObject({
      method: "POST",
      path: "/api/journeys/{journeyId}/steps",
      name: "api.journeys.steps.store",
      // groupes du plus externe au plus interne, puis la route elle-même
      middlewares: [auth, admin, owner, audit],
    });
  });

  it("reproduit l’exemple du planning", () => {
    Route.group(
      { prefix: "/journeys", middleware: [auth], name: "journeys." },
      () => {
        Route.get("/", ctrl).name("index");
        Route.group({ prefix: "/{journeyId}/steps", name: "steps." }, () => {
          Route.post("/", ctrl).name("store");
        });
      },
    );

    expect(getRoutes().map((r) => [r.method, r.path, r.name])).toEqual([
      ["GET", "/journeys", "journeys.index"],
      ["POST", "/journeys/{journeyId}/steps", "journeys.steps.store"],
    ]);
  });

  it("accepte un groupe sans aucune option", () => {
    Route.group({}, () => {
      Route.get("/a", ctrl).name("a");
    });
    expect(getRoutes()[0]).toMatchObject({
      path: "/a",
      name: "a",
      middlewares: [],
    });
  });

  it("n’affecte pas les routes déclarées après la fin du groupe", () => {
    Route.group(
      { prefix: "/admin", middleware: [admin], name: "admin." },
      () => {
        Route.get("/users", ctrl).name("users");
      },
    );
    Route.get("/health", ctrl).name("health");

    expect(getRoutes()[1]).toMatchObject({
      path: "/health",
      name: "health",
      middlewares: [],
    });
    expect(getGroupStack()).toHaveLength(0);
  });

  it("isole deux groupes frères", () => {
    Route.group({ prefix: "/a", name: "a.", middleware: [auth] }, () => {
      Route.get("/x", ctrl).name("x");
    });
    Route.group({ prefix: "/b", name: "b." }, () => {
      Route.get("/x", ctrl).name("x");
    });

    expect(getRoutes()[1]).toMatchObject({
      path: "/b/x",
      name: "b.x",
      middlewares: [],
    });
  });

  it("une route sans .name() reste sans nom dans un groupe nommé", () => {
    Route.group({ name: "journeys." }, () => {
      Route.get("/", ctrl);
    });
    expect(getRoutes()[0]?.name).toBe(undefined);
  });

  it("garde le préfixe de nom même si .name() est appelé après le groupe", () => {
    let later = Route.get("/tmp", ctrl);
    Route.group({ name: "journeys." }, () => {
      later = Route.get("/", ctrl);
    });
    later.name("index");
    expect(later.definition.name).toBe("journeys.index");
  });

  it("dépile le groupe même si le callback lève", () => {
    expect(() =>
      Route.group({ prefix: "/broken", name: "broken." }, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(getGroupStack()).toHaveLength(0);
    Route.get("/ok", ctrl).name("ok");
    expect(getRoutes()[0]).toMatchObject({ path: "/ok", name: "ok" });
  });

  it("refuse un callback async et dépile quand même", () => {
    expect(() => Route.group({ prefix: "/a" }, async () => {})).toThrow(
      RouteError,
    );
    expect(getGroupStack()).toHaveLength(0);
  });

  it("copie le tableau de middlewares du groupe", () => {
    const shared: Middleware[] = [auth];
    Route.group({ middleware: shared }, () => {
      Route.get("/a", ctrl).middleware(admin);
    });
    expect(shared).toEqual([auth]);
  });
});

describe("joinPaths · normalisation des barres obliques", () => {
  it.each<[string[], string]>([
    [["/api/", "/users"], "/api/users"],
    [["api", "users"], "/api/users"],
    [["/journeys", "/"], "/journeys"],
    [["", "/"], "/"],
    [["", ""], "/"],
    [["//api//", "//users//"], "/api/users"],
    [["/files", "/{path*}"], "/files/{path*}"],
  ])("%s", (parts, expected) => {
    expect(joinPaths(...parts)).toBe(expected);
  });
});
