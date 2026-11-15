import { describe, expect, it } from "vitest";
import { buildChain, withErrorHandling } from "../../src/core/pipeline.js";
import { compose, MiddlewareError } from "../../src/middleware/compose.js";
import type { Handler, Layer } from "../../src/middleware/compose.js";
import { Route } from "../../src/router/route.js";
import type { Controller, HttpResponse, Middleware } from "../../src/types.js";

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

describe("MDW-04 · chaîne robuste : toute erreur devient une réponse", () => {
  interface TestCtx {
    log: string[];
  }
  const ok = (body: unknown): HttpResponse => ({
    status: 200,
    headers: {},
    body,
  });

  /** Faux gestionnaire d'erreurs (le vrai est celui de CTL-08) : mémorise l'erreur reçue. */
  const fakeErrorHandler = () => {
    const received: unknown[] = [];
    const onError = (error: unknown): HttpResponse => {
      received.push(error);
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 500,
        headers: {},
        body: {
          error: { code: "INTERNAL_SERVER_ERROR", message, details: null },
        },
      };
    };
    return { received, onError };
  };

  const run = (
    chain: Layer<TestCtx>[],
    controller: Handler<TestCtx>,
    onError: (error: unknown) => HttpResponse | Promise<HttpResponse>,
    ctx: TestCtx = { log: [] },
  ) => withErrorHandling(compose(chain, controller), onError)(ctx);

  it("exception levée APRÈS next() → 500 au format unique (critère du planning)", async () => {
    const ctx: TestCtx = { log: [] };
    const after: Layer<TestCtx> = async (_ctx, next) => {
      await next();
      throw new Error("après next");
    };
    const { onError } = fakeErrorHandler();

    const response = await run(
      [after],
      (c) => {
        c.log.push("contrôleur");
        return ok(null);
      },
      onError,
      ctx,
    );

    expect(ctx.log).toEqual(["contrôleur"]);
    expect(response).toEqual({
      status: 500,
      headers: {},
      body: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "après next",
          details: null,
        },
      },
    });
  });

  it("exception levée AVANT next() → 500, le contrôleur n’est pas appelé", async () => {
    const ctx: TestCtx = { log: [] };
    const before: Layer<TestCtx> = async () => {
      throw new Error("avant next");
    };
    const { onError } = fakeErrorHandler();

    const response = await run(
      [before],
      (c) => {
        c.log.push("contrôleur");
        return ok(null);
      },
      onError,
      ctx,
    );

    expect(response.status).toBe(500);
    expect(ctx.log).toEqual([]);
  });

  it("exception SYNCHRONE dans un middleware non async → capturée", async () => {
    const sync: Layer<TestCtx> = () => {
      throw new Error("synchrone");
    };
    const { received, onError } = fakeErrorHandler();
    expect((await run([sync], () => ok(null), onError)).status).toBe(500);
    expect(received).toHaveLength(1);
  });

  it("promesse rejetée → capturée", async () => {
    const rejecting: Layer<TestCtx> = () => Promise.reject(new Error("rejet"));
    const { received, onError } = fakeErrorHandler();
    expect((await run([rejecting], () => ok(null), onError)).status).toBe(500);
    expect(received).toHaveLength(1);
  });

  it("erreur dans le contrôleur (synchrone ou async) → capturée", async () => {
    const { received, onError } = fakeErrorHandler();
    await run(
      [],
      () => {
        throw new Error("contrôleur sync");
      },
      onError,
    );
    await run(
      [],
      async () => {
        throw new Error("contrôleur async");
      },
      onError,
    );
    expect(received).toHaveLength(2);
  });

  it("next() appelé deux fois → MiddlewareError transmise au gestionnaire", async () => {
    const twice: Layer<TestCtx> = async (_ctx, next) => {
      await next();
      return next();
    };
    const { received, onError } = fakeErrorHandler();

    const response = await run([twice], () => ok(null), onError);

    expect(response.status).toBe(500);
    expect(received[0] instanceof MiddlewareError).toBe(true);
  });

  it("le gestionnaire reçoit l’erreur telle quelle, même si ce n’est pas une Error", async () => {
    const original = new TypeError("exacte");
    const throwsError: Layer<TestCtx> = async () => {
      throw original;
    };
    const throwsString: Layer<TestCtx> = async () => {
      throw "une chaîne";
    };
    const { received, onError } = fakeErrorHandler();

    await run([throwsError], () => ok(null), onError);
    await run([throwsString], () => ok(null), onError);

    expect(received[0]).toBe(original);
    expect(received[1]).toBe("une chaîne");
  });

  it("un middleware peut attraper lui-même l’erreur de la suite de la chaîne", async () => {
    const recover: Layer<TestCtx> = async (_ctx, next) => {
      try {
        return await next();
      } catch {
        return { status: 503, headers: {}, body: "repli" };
      }
    };
    const { received, onError } = fakeErrorHandler();

    const response = await run(
      [recover],
      () => {
        throw new Error("panne");
      },
      onError,
    );

    expect(response.status).toBe(503);
    expect(received).toHaveLength(0);
  });

  it("accepte un gestionnaire d’erreurs async", async () => {
    const failing: Layer<TestCtx> = async () => {
      throw new Error("x");
    };
    const response = await run(
      [failing],
      () => ok(null),
      async () => ({ status: 418, headers: {}, body: null }),
    );
    expect(response.status).toBe(418);
  });

  it("si le gestionnaire d’erreurs plante, renvoie une 500 minimale", async () => {
    const failing: Layer<TestCtx> = async () => {
      throw new Error("première erreur");
    };
    const brokenHandler = (): HttpResponse => {
      throw new Error("le gestionnaire plante aussi");
    };

    const response = await run([failing], () => ok(null), brokenHandler);

    expect(response).toEqual({
      status: 500,
      headers: {},
      body: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal Server Error",
          details: null,
        },
      },
    });
  });

  it("sans erreur, la réponse passe et le gestionnaire n’est pas appelé", async () => {
    const { received, onError } = fakeErrorHandler();
    const response = await run(
      [async (_ctx, next) => next()],
      () => ok("tout va bien"),
      onError,
    );
    expect(response.body).toBe("tout va bien");
    expect(received).toHaveLength(0);
  });
});
