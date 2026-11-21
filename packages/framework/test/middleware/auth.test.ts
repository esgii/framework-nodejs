import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { buildContext } from "../../src/http/context.ts";
import { HttpError } from "../../src/http/errors.ts";
import { authenticate } from "../../src/middleware/auth.ts";
import { signToken } from "../../src/security/token.ts";
import type { Context, HttpResponse } from "../../src/types.ts";

const SECRET = "un-secret-de-test-d-au-moins-32-caracteres";
const OK: HttpResponse = { status: 200, headers: {}, body: "ok" };

/** Un contexte de requête, avec l'en-tête Authorization donné (ou aucun). */
function contextWith(authorization?: string): Context {
  const req = new IncomingMessage(new Socket());
  if (authorization !== undefined) req.headers.authorization = authorization;
  return buildContext(req);
}

/** Passe la requête dans le middleware ; `reached` dit si la suite de la chaîne a été appelée. */
async function run(
  ctx: Context,
  optional = false,
): Promise<{ response: HttpResponse; reached: boolean }> {
  let reached = false;
  const response = await authenticate(SECRET, { optional })(ctx, async () => {
    reached = true;
    return OK;
  });
  return { response, reached };
}

/** Le 401 levé par le middleware, avec son message. */
async function rejection(ctx: Context, optional = false): Promise<HttpError> {
  try {
    await run(ctx, optional);
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("Le middleware aurait dû lever une erreur");
}

describe("authenticate : jeton valide", () => {
  it("remplit ctx.user et appelle la suite de la chaîne", async () => {
    const ctx = contextWith(
      `Bearer ${signToken({ sub: 42, role: "admin" }, SECRET, 3600)}`,
    );

    const { response, reached } = await run(ctx);

    expect(ctx.user).toEqual({ id: "42", role: "admin" });
    expect(reached).toBe(true);
    expect(response).toEqual(OK);
  });

  it("accepte bearer en minuscules", async () => {
    const ctx = contextWith(
      `bearer ${signToken({ sub: 1, role: "user" }, SECRET, 3600)}`,
    );

    await run(ctx);

    expect(ctx.user).toEqual({ id: "1", role: "user" });
  });
});

describe("authenticate : les trois cas de 401", () => {
  it("1. jeton absent", async () => {
    const error = await rejection(contextWith());

    expect(error.status).toBe(401);
    expect(error.message).toBe("Authentication required");
  });

  it("2. jeton expiré", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign(
      { sub: "1", role: "user", iat: now - 7200, exp: now - 3600 },
      SECRET,
      { algorithm: "HS256" },
    );

    const error = await rejection(contextWith(`Bearer ${expired}`));

    expect(error.status).toBe(401);
    expect(error.message).toBe("Token expired");
  });

  it("3. jeton invalide (signé avec un autre secret)", async () => {
    const other = signToken(
      { sub: 1, role: "admin" },
      "un-autre-secret-de-test-d-au-moins-32-car",
      3600,
    );

    const error = await rejection(contextWith(`Bearer ${other}`));

    expect(error.status).toBe(401);
    expect(error.message).toBe("Invalid token");
  });

  it.each([
    "Basic dXNlcjpwYXNz",
    "Bearer",
    "Bearer ",
    "Bearer a b",
    "Token abc",
    "",
  ])("refuse l'en-tête mal formé %j", async (header: string) => {
    const error = await rejection(contextWith(header));

    expect(error.status).toBe(401);
    expect(error.message).toBe("Invalid authorization header");
  });

  it("n'appelle jamais la suite de la chaîne et laisse ctx.user à null", async () => {
    const ctx = contextWith("Bearer abc");
    let reached = false;

    await authenticate(SECRET)(ctx, async () => {
      reached = true;
      return OK;
    }).catch(() => {});

    expect(reached).toBe(false);
    expect(ctx.user).toBe(null);
  });
});

describe("authenticate({ optional: true })", () => {
  it("laisse passer une requête sans jeton, avec ctx.user à null", async () => {
    const ctx = contextWith();

    const { reached } = await run(ctx, true);

    expect(reached).toBe(true);
    expect(ctx.user).toBe(null);
  });

  it("remplit ctx.user si le jeton est valide", async () => {
    const ctx = contextWith(
      `Bearer ${signToken({ sub: 7, role: "user" }, SECRET, 3600)}`,
    );

    await run(ctx, true);

    expect(ctx.user).toEqual({ id: "7", role: "user" });
  });

  it("refuse quand même un jeton invalide", async () => {
    expect((await rejection(contextWith("Bearer abc"), true)).status).toBe(401);
  });
});
