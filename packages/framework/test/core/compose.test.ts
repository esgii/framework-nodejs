import { describe, expect, it } from "vitest";
import { buildChain } from "../../src/core/pipeline.js";
import { compose, MiddlewareError } from "../../src/middleware/compose.js";
import type { Layer } from "../../src/middleware/compose.js";
import type { Controller, HttpResponse, Middleware } from "../../src/types.js";

// Contexte minimal pour les tests : compose est générique, pas besoin d'un vrai Context.
interface TestCtx {
  log: string[];
}

const ok = (body: unknown): HttpResponse => ({
  status: 200,
  headers: {},
  body,
});

/** Middleware qui note son passage avant et après next(). */
const trace =
  (label: string): Layer<TestCtx> =>
  async (ctx, next) => {
    ctx.log.push(`${label}-avant`);
    const response = await next();
    ctx.log.push(`${label}-après`);
    return response;
  };

describe("MDW-01 · composition en oignon", () => {
  it("exécute avant/après dans l’ordre de l’oignon (critère du planning)", async () => {
    const ctx: TestCtx = { log: [] };
    const run = compose([trace("a"), trace("b")], (c) => {
      c.log.push("contrôleur");
      return ok("fin");
    });

    await run(ctx);
    expect(ctx.log).toEqual([
      "a-avant",
      "b-avant",
      "contrôleur",
      "b-après",
      "a-après",
    ]);
  });

  it("renvoie la réponse du contrôleur à travers la chaîne", async () => {
    const run = compose([trace("a"), trace("b")], () => ok("données"));
    const response = await run({ log: [] });
    expect(response).toEqual({ status: 200, headers: {}, body: "données" });
  });

  it("sans middleware, appelle directement le contrôleur", async () => {
    const run = compose<TestCtx>([], () => ok("direct"));
    expect((await run({ log: [] })).body).toBe("direct");
  });

  it("accepte un contrôleur async", async () => {
    const run = compose<TestCtx>([trace("a")], async () => ok("async"));
    expect((await run({ log: [] })).body).toBe("async");
  });

  it("un middleware peut modifier la réponse après next()", async () => {
    const addHeader: Layer<TestCtx> = async (_ctx, next) => {
      const response = await next();
      return {
        ...response,
        headers: { ...response.headers, "x-powered-by": "carnet" },
      };
    };
    const run = compose([addHeader], () => ok("x"));
    expect((await run({ log: [] })).headers).toEqual({
      "x-powered-by": "carnet",
    });
  });

  it("tous les maillons reçoivent le même objet ctx", async () => {
    const seen: TestCtx[] = [];
    const remember: Layer<TestCtx> = (ctx, next) => {
      seen.push(ctx);
      return next();
    };
    const ctx: TestCtx = { log: [] };
    await compose([remember, remember], (c) => {
      seen.push(c);
      return ok(null);
    })(ctx);

    expect(seen).toHaveLength(3);
    expect(seen.every((c) => c === ctx)).toBe(true);
  });

  it("une chaîne composée une fois sert à plusieurs requêtes indépendantes", async () => {
    const run = compose([trace("a")], () => ok(null));
    const first: TestCtx = { log: [] };
    const second: TestCtx = { log: [] };

    await run(first);
    await run(second); // le garde de next() ne doit pas être partagé entre les deux

    expect(second.log).toEqual(["a-avant", "a-après"]);
  });

  it("ajouter un middleware au tableau d’origine ne change pas une chaîne déjà composée", async () => {
    const middlewares = [trace("a")];
    const run = compose(middlewares, () => ok(null));
    middlewares.push(trace("b"));

    const ctx: TestCtx = { log: [] };
    await run(ctx);
    expect(ctx.log).toEqual(["a-avant", "a-après"]);
  });

  it("next() appelé deux fois → MiddlewareError", async () => {
    const twice: Layer<TestCtx> = async (_ctx, next) => {
      await next();
      return next();
    };
    const run = compose([twice], () => ok(null));
    await expect(run({ log: [] })).rejects.toThrow(MiddlewareError);
  });

  it("fonctionne avec les vrais types Middleware et Controller de SET-08", () => {
    const mw: Middleware = (_ctx, next) => next();
    const controller: Controller = () => ok(null);
    // Si le typage échoue, c'est tsc (npm run typecheck) qui le signale.
    const run = compose([mw], controller);
    expect(typeof run).toBe("function");
  });
});

describe("MDW-03 · interruption de la chaîne (court-circuit)", () => {
  const unauthorized: HttpResponse = {
    status: 401,
    headers: {},
    body: {
      error: { code: "UNAUTHORIZED", message: "Jeton manquant", details: null },
    },
  };

  /** Contrôleur espion : compte ses appels. */
  const spyController = () => {
    const spy = { calls: 0 };
    const handler = () => {
      spy.calls++;
      return ok("contrôleur");
    };
    return { spy, handler };
  };

  /** Middleware qui renvoie sa propre réponse sans appeler next(). */
  const block: Layer<TestCtx> = async (ctx) => {
    ctx.log.push("block");
    return unauthorized;
  };

  it("le contrôleur n’est jamais appelé (critère du planning)", async () => {
    const { spy, handler } = spyController();
    await compose([block], handler)({ log: [] });
    expect(spy.calls).toBe(0);
  });

  it("renvoie la réponse du middleware, sans exception", async () => {
    const { handler } = spyController();
    const response = await compose([block], handler)({ log: [] });
    expect(response).toEqual(unauthorized);
  });

  it("les middlewares suivants ne s’exécutent pas", async () => {
    const ctx: TestCtx = { log: [] };
    const { handler } = spyController();
    await compose([trace("a"), block, trace("c")], handler)(ctx);
    expect(ctx.log).toEqual(["a-avant", "block", "a-après"]);
  });

  it("les middlewares précédents reçoivent la réponse du court-circuit au retour", async () => {
    const statuses: number[] = [];
    const logger: Layer<TestCtx> = async (_ctx, next) => {
      const response = await next();
      statuses.push(response.status);
      return response;
    };
    const { handler } = spyController();
    await compose([logger, block], handler)({ log: [] });
    expect(statuses).toEqual([401]);
  });

  it("un middleware conditionnel laisse passer ou bloque selon la requête", async () => {
    interface AuthCtx {
      token: string | null;
    }
    const auth: Layer<AuthCtx> = async (ctx, next) =>
      ctx.token === null ? unauthorized : next();

    let calls = 0;
    const run = compose([auth], () => {
      calls++;
      return ok("profil");
    });

    expect((await run({ token: null })).status).toBe(401);
    expect(calls).toBe(0);
    expect((await run({ token: "abc" })).status).toBe(200);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MDW-05 · compléments pour couvrir toute la liste du planning :
//   0 / 1 / plusieurs middlewares ........ MDW-01 + « nombre de middlewares » ci-dessous
//   oignon avant/après ................... MDW-01
//   ordre global / groupe / route ........ « ordre d'exécution réel » ci-dessous
//   court-circuit ........................ MDW-03
//   erreur avant / après next ............ « propagation des erreurs » ci-dessous
//   double next .......................... MDW-01 + « double next » ci-dessous
//   middleware qui modifie la réponse .... MDW-01
// La transformation des erreurs en réponse 500 est testée dans test/core/pipeline.test.ts (MDW-04).
// ---------------------------------------------------------------------------

describe("MDW-05 · nombre de middlewares", () => {
  it("avec 1 middleware : avant, contrôleur, après", async () => {
    const ctx: TestCtx = { log: [] };
    await compose([trace("seul")], (c) => {
      c.log.push("contrôleur");
      return ok(null);
    })(ctx);
    expect(ctx.log).toEqual(["seul-avant", "contrôleur", "seul-après"]);
  });

  it("avec 5 middlewares : l’oignon reste symétrique", async () => {
    const ctx: TestCtx = { log: [] };
    const labels = ["1", "2", "3", "4", "5"];
    await compose(labels.map(trace), (c) => {
      c.log.push("C");
      return ok(null);
    })(ctx);
    expect(ctx.log).toEqual([
      ...labels.map((l) => `${l}-avant`),
      "C",
      ...[...labels].reverse().map((l) => `${l}-après`),
    ]);
  });
});

describe("MDW-05 · ordre d’exécution réel global → groupes → route", () => {
  it("exécute G, G1, G2, R puis le contrôleur, et remonte dans l’ordre inverse", async () => {
    const ctx: TestCtx = { log: [] };
    // Une route telle que RTE-02 la produit : groupes (externe → interne) puis route.
    const route = { middlewares: [trace("G1"), trace("G2"), trace("R")] };

    const chain = buildChain([trace("G")], route);
    await compose(chain, (c) => {
      c.log.push("contrôleur");
      return ok(null);
    })(ctx);

    expect(ctx.log).toEqual([
      "G-avant",
      "G1-avant",
      "G2-avant",
      "R-avant",
      "contrôleur",
      "R-après",
      "G2-après",
      "G1-après",
      "G-après",
    ]);
  });

  it("sans route (404), seuls les globaux s’exécutent autour de la réponse d’erreur", async () => {
    const ctx: TestCtx = { log: [] };
    const notFound: HttpResponse = { status: 404, headers: {}, body: null };
    const response = await compose(
      buildChain([trace("G")]),
      () => notFound,
    )(ctx);
    expect(ctx.log).toEqual(["G-avant", "G-après"]);
    expect(response.status).toBe(404);
  });
});

describe("MDW-05 · propagation des erreurs par compose", () => {
  // compose ne transforme pas les erreurs : il les laisse remonter sous forme de
  // promesse rejetée. C'est withErrorHandling (MDW-04) qui en fait une réponse.

  it("erreur AVANT next() : promesse rejetée, contrôleur et suite non exécutés", async () => {
    const ctx: TestCtx = { log: [] };
    const failing: Layer<TestCtx> = async () => {
      throw new TypeError("avant");
    };
    await expect(
      compose([trace("a"), failing, trace("c")], (c) => {
        c.log.push("contrôleur");
        return ok(null);
      })(ctx),
    ).rejects.toThrow(TypeError);
    // a n'a pas de « après » : l'erreur a traversé son await next()
    expect(ctx.log).toEqual(["a-avant"]);
  });

  it("erreur APRÈS next() : le contrôleur a bien été exécuté, puis la promesse est rejetée", async () => {
    const ctx: TestCtx = { log: [] };
    const failingAfter: Layer<TestCtx> = async (_ctx, next) => {
      await next();
      throw new RangeError("après");
    };
    await expect(
      compose([failingAfter], (c) => {
        c.log.push("contrôleur");
        return ok(null);
      })(ctx),
    ).rejects.toThrow(RangeError);
    expect(ctx.log).toEqual(["contrôleur"]);
  });

  it("erreur du contrôleur : remonte à travers les middlewares", async () => {
    const ctx: TestCtx = { log: [] };
    await expect(
      compose([trace("a")], () => {
        throw new SyntaxError("contrôleur");
      })(ctx),
    ).rejects.toThrow(SyntaxError);
    expect(ctx.log).toEqual(["a-avant"]);
  });
});

describe("MDW-05 · double next", () => {
  it("deux next() en parallèle → MiddlewareError", async () => {
    const parallel: Layer<TestCtx> = async (_ctx, next) => {
      const [first] = await Promise.all([next(), next()]);
      return first;
    };
    await expect(
      compose([parallel], () => ok(null))({ log: [] }),
    ).rejects.toThrow(MiddlewareError);
  });

  it("le contrôleur n’est exécuté qu’une seule fois malgré le double next()", async () => {
    let calls = 0;
    const twice: Layer<TestCtx> = async (_ctx, next) => {
      await next();
      return next();
    };
    await expect(
      compose([twice], () => {
        calls++;
        return ok(null);
      })({ log: [] }),
    ).rejects.toThrow(MiddlewareError);
    expect(calls).toBe(1);
  });

  it("un double next() dans un middleware interne est aussi détecté", async () => {
    const twice: Layer<TestCtx> = async (_ctx, next) => {
      await next();
      return next();
    };
    await expect(
      compose([trace("a"), trace("b"), twice], () => ok(null))({ log: [] }),
    ).rejects.toThrow(MiddlewareError);
  });
});
