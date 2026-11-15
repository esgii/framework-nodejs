import { describe, expect, it } from "vitest";
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
