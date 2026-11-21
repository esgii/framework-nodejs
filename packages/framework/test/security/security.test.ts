/**
 * SEC-05 : la sécurité de bout en bout. Chaque cas passe par une vraie route protégée
 * (authenticate + requireRole + gestionnaire d'erreurs), et on regarde la réponse
 * HTTP que le client reçoit vraiment. Un test par cas.
 */
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "../../src/core/pipeline.ts";
import { buildContext } from "../../src/http/context.ts";
import { toErrorResponse } from "../../src/http/error-handler.ts";
import { authenticate } from "../../src/middleware/auth.ts";
import { compose } from "../../src/middleware/compose.ts";
import { requireRole } from "../../src/middleware/role.ts";
import { hashPassword, verifyPassword } from "../../src/security/password.ts";
import { signToken } from "../../src/security/token.ts";
import type { HttpResponse } from "../../src/types.ts";

const SECRET = "un-secret-de-test-d-au-moins-32-caracteres";
const ONE_HOUR = 3600;

/** Ce que le serveur écrit dans ses logs pendant le test. */
let logs: Record<string, unknown>[] = [];

/** Une route réservée aux admins, montée comme dans l'appli, en production. */
const adminRoute = withErrorHandling(
  compose([authenticate(SECRET), requireRole("admin")], (ctx) => ({
    status: 200,
    headers: {},
    body: { hello: ctx.user?.id },
  })),
  (error) => toErrorResponse(error, "production", (entry) => logs.push(entry)),
);

/** Envoie une requête à la route, avec ou sans jeton. */
function call(token?: string): Promise<HttpResponse> {
  const req = new IncomingMessage(new Socket());
  if (token !== undefined) req.headers.authorization = `Bearer ${token}`;
  return adminRoute(buildContext(req));
}

/** La réponse d'erreur au format unique du framework. */
function errorBody(code: string, message: string): unknown {
  return { error: { code, message, details: [] } };
}

afterEach(() => {
  logs = [];
  vi.useRealTimers();
});

describe("SEC-05 : hachage", () => {
  it("le mot de passe n'est jamais stocké : seul un hash salé l'est, et il se vérifie", async () => {
    const hash = await hashPassword("secret123", 4);

    expect(hash.includes("secret123")).toBe(false);
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("mauvais", hash)).toBe(false);
  });
});

describe("SEC-05 : jetons et rôles, vus par le client", () => {
  it("jeton valide et rôle admin → 200", async () => {
    const response = await call(
      signToken({ sub: 42, role: "admin" }, SECRET, ONE_HOUR),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hello: "42" });
  });

  it("jeton absent → 401", async () => {
    const response = await call();

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      errorBody("UNAUTHORIZED", "Authentication required"),
    );
  });

  it("jeton expiré : valable 1 h, encore accepté à 59 min 59 s, refusé à 1 h → 401", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const token = signToken({ sub: 42, role: "admin" }, SECRET, ONE_HOUR);

    vi.setSystemTime(start + (ONE_HOUR - 1) * 1000);
    expect((await call(token)).status).toBe(200);

    vi.setSystemTime(start + ONE_HOUR * 1000);
    const response = await call(token);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorBody("UNAUTHORIZED", "Token expired"));
  });

  it("mauvaise signature (un autre secret) → 401", async () => {
    const response = await call(
      signToken(
        { sub: 42, role: "admin" },
        "un-autre-secret-de-test-d-au-moins-32-car",
        ONE_HOUR,
      ),
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorBody("UNAUTHORIZED", "Invalid token"));
  });

  it("jeton modifié pour devenir admin → 401", async () => {
    const [header, , signature] = signToken(
      { sub: 42, role: "user" },
      SECRET,
      ONE_HOUR,
    ).split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "42", role: "admin", exp: 9999999999 }),
    ).toString("base64url");

    expect((await call(`${header}.${forged}.${signature}`)).status).toBe(401);
  });

  it("jeton sans signature (alg: none) → 401", async () => {
    const unsigned = jwt.sign({ sub: "42", role: "admin" }, "", {
      algorithm: "none",
    });

    expect((await call(unsigned)).status).toBe(401);
  });

  it("rôle insuffisant : jeton valide, mais rôle user → 403", async () => {
    const response = await call(
      signToken({ sub: 42, role: "user" }, SECRET, ONE_HOUR),
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorBody("FORBIDDEN", "Insufficient role"));
  });
});

describe("SEC-05 : rien de secret ne fuit", () => {
  it("le jeton n'apparaît ni dans la réponse ni dans les logs", async () => {
    const token = signToken(
      { sub: 42, role: "admin" },
      "un-autre-secret-de-test-d-au-moins-32-car",
      ONE_HOUR,
    );

    const response = await call(token);

    expect(JSON.stringify(response).includes(token)).toBe(false);
    expect(logs.length).toBe(1);
    expect(JSON.stringify(logs).includes(token)).toBe(false);
    expect(JSON.stringify(logs).includes(SECRET)).toBe(false);
  });
});
