import { describe, expect, it } from "vitest";
import { MethodNotAllowedError, NotFoundError } from "../../src/http/errors.js";
import { RouteError } from "../../src/router/errors.js";
import { versionedPath } from "../../src/router/version.js";
import { getGroupStack, getRoutes } from "../../src/router/registry.js";
import { createResolver } from "../../src/router/resolve.js";
import { Route } from "../../src/router/route.js";
import type { Controller } from "../../src/types.js";

const listV1: Controller = () => ({ status: 200, headers: {}, body: "v1" });
const listV2: Controller = () => ({ status: 200, headers: {}, body: "v2" });

function resolve(method: string, path: string) {
  return createResolver(getRoutes()).resolve(method, path);
}

describe("VER-01 · déclarer une route dans une version", () => {
  it("donne la version aux routes déclarées dans Route.version", () => {
    Route.version("v2", () => {
      Route.get("/journeys", listV2);
    });
    expect(getRoutes()[0]).toMatchObject({ path: "/journeys", version: "v2" });
  });

  it("fait cohabiter v1 et v2 sur le même chemin", () => {
    Route.version("v1", () => {
      Route.get("/journeys", listV1);
    });
    Route.version("v2", () => {
      Route.get("/journeys", listV2);
    });
    expect(resolve("GET", "/v1/journeys").route.controller).toBe(listV1);
    expect(resolve("GET", "/v2/journeys").route.controller).toBe(listV2);
  });

  it("ne sert pas une route v2 sous une autre version", () => {
    Route.version("v2", () => {
      Route.get("/journeys", listV2);
    });
    expect(() => resolve("GET", "/v1/journeys")).toThrow(NotFoundError);
    expect(() => resolve("GET", "/journeys")).toThrow(NotFoundError);
  });

  it("versionne aussi les routes dynamiques et répond 405 dans la bonne version", () => {
    Route.version("v2", () => {
      Route.get("/journeys/{id}", listV2);
    });
    expect(resolve("GET", "/v2/journeys/3").params).toEqual({ id: "3" });
    expect(() => resolve("DELETE", "/v2/journeys/3")).toThrow(MethodNotAllowedError);
  });

  it("accepte la version en option de la route", () => {
    Route.get("/journeys", listV2, { version: "v3" });
    expect(resolve("GET", "/v3/journeys").route.controller).toBe(listV2);
  });

  it("met la version devant le préfixe d'un groupe, dans les deux sens d'imbrication", () => {
    Route.version("v2", () => {
      Route.group({ prefix: "/admin" }, () => {
        Route.get("/users", listV2);
      });
    });
    Route.group({ prefix: "/admin" }, () => {
      Route.version("v3", () => {
        Route.get("/users", listV1);
      });
    });
    expect(resolve("GET", "/v2/admin/users").route.controller).toBe(listV2);
    expect(resolve("GET", "/v3/admin/users").route.controller).toBe(listV1);
  });

  it("applique la version la plus interne", () => {
    Route.version("v1", () => {
      Route.version("v2", () => {
        Route.get("/journeys", listV2);
      });
    });
    expect(getRoutes()[0]?.version).toBe("v2");
  });

  it("dépile la version à la fin du callback", () => {
    Route.version("v2", () => {
      Route.get("/a", listV2);
    });
    Route.get("/b", listV1);
    expect(getGroupStack()).toHaveLength(0);
    expect(getRoutes()[1]?.version).toBeUndefined();
  });

  it.each(["2", "V2", "v", "v2/x", "version2"])(
    "refuse la version invalide « %s » au démarrage",
    (name) => {
      expect(() => Route.version(name, () => {})).toThrow(RouteError);
      expect(() => Route.get("/a", listV1, { version: name })).toThrow(RouteError);
    },
  );

  it("refuse un callback async, comme Route.group", () => {
    expect(() => Route.version("v2", async () => {})).toThrow(RouteError);
    expect(getGroupStack()).toHaveLength(0);
  });
});

describe("versionedPath", () => {
  it("ajoute la version devant le chemin", () => {
    expect(versionedPath({ path: "/journeys", version: "v2" })).toBe("/v2/journeys");
    expect(versionedPath({ path: "/", version: "v2" })).toBe("/v2");
  });

  it("laisse le chemin tel quel sans version", () => {
    expect(versionedPath({ path: "/journeys", version: undefined })).toBe("/journeys");
  });
});

describe("VER-02 · appliquer la version par défaut", () => {
  it("sert une route sans version sous la version par défaut", () => {
    Route.get("/users", listV1);
    Route.freeze("v1");
    expect(getRoutes()[0]?.version).toBe("v1");
    expect(resolve("GET", "/v1/users").route.controller).toBe(listV1);
    expect(() => resolve("GET", "/users")).toThrow(NotFoundError);
  });

  it("prend la version par défaut donnée par la configuration", () => {
    Route.get("/users", listV1);
    Route.freeze("v3");
    expect(resolve("GET", "/v3/users").route.controller).toBe(listV1);
  });

  it("ne touche pas aux routes qui ont déjà une version", () => {
    Route.get("/journeys", listV1);
    Route.version("v2", () => {
      Route.get("/journeys", listV2);
    });
    Route.freeze("v1");
    expect(resolve("GET", "/v1/journeys").route.controller).toBe(listV1);
    expect(resolve("GET", "/v2/journeys").route.controller).toBe(listV2);
  });

  it("refuse une version par défaut invalide, sans rien modifier", () => {
    Route.get("/users", listV1);
    expect(() => Route.freeze("1")).toThrow(RouteError);
    expect(getRoutes()[0]?.version).toBeUndefined();
    expect(() => Route.get("/other", listV1)).not.toThrow();
  });

  it("ne modifie aucune route si un nom est en double", () => {
    Route.get("/a", listV1).name("x");
    Route.get("/b", listV1).name("x");
    expect(() => Route.freeze("v1")).toThrow(RouteError);
    expect(getRoutes().map((route) => route.version)).toEqual([undefined, undefined]);
  });
});
