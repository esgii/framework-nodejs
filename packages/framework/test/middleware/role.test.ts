import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { buildContext } from "../../src/http/context.ts";
import { HttpError } from "../../src/http/errors.ts";
import { authenticate } from "../../src/middleware/auth.ts";
import { compose } from "../../src/middleware/compose.ts";
import { requireRole } from "../../src/middleware/role.ts";
import { signToken, type Role } from "../../src/security/token.ts";
import type {
  AuthUser,
  Context,
  HttpResponse,
  Middleware,
} from "../../src/types.ts";

const SECRET = "un-secret-de-test-d-au-moins-32-caracteres";
const OK: HttpResponse = { status: 200, headers: {}, body: "ok" };

/** Un contexte de requête, avec l'en-tête Authorization donné (ou aucun). */
function contextWith(authorization?: string): Context {
  const req = new IncomingMessage(new Socket());
  if (authorization !== undefined) req.headers.authorization = authorization;
  return buildContext(req);
}

/** Un contexte où authenticate est déjà passé (ou non, avec null). */
function contextAs(user: AuthUser | null): Context {
  const ctx = contextWith();
  ctx.user = user;
  return ctx;
}

/** Passe le contexte dans le middleware : le statut de la réponse, ou celui de l'erreur levée. */
async function statusOf(middleware: Middleware, ctx: Context): Promise<number> {
  try {
    return (await middleware(ctx, async () => OK)).status;
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
}

describe("requireRole", () => {
  it("laisse passer le bon rôle", async () => {
    expect(
      await statusOf(
        requireRole("admin"),
        contextAs({ id: "1", role: "admin" }),
      ),
    ).toBe(200);
  });

  it("refuse un rôle insuffisant avec un 403", async () => {
    expect(
      await statusOf(
        requireRole("admin"),
        contextAs({ id: "2", role: "user" }),
      ),
    ).toBe(403);
  });

  it("accepte plusieurs rôles", async () => {
    const either = requireRole("user", "admin");

    expect(await statusOf(either, contextAs({ id: "1", role: "admin" }))).toBe(
      200,
    );
    expect(await statusOf(either, contextAs({ id: "2", role: "user" }))).toBe(
      200,
    );
  });

  it("refuse un rôle inconnu", async () => {
    expect(
      await statusOf(
        requireRole("user", "admin"),
        contextAs({ id: "3", role: "superadmin" }),
      ),
    ).toBe(403);
  });

  it("répond 401, pas 403, quand personne n'est connecté", async () => {
    expect(await statusOf(requireRole("admin"), contextAs(null))).toBe(401);
  });

  it("n'appelle pas la suite de la chaîne après un refus", async () => {
    let reached = false;

    await requireRole("admin")(
      contextAs({ id: "2", role: "user" }),
      async () => {
        reached = true;
        return OK;
      },
    ).catch(() => {});

    expect(reached).toBe(false);
  });
});

describe("authenticate puis requireRole : 401 ou 403 ?", () => {
  /** Une route réservée aux admins, comme dans l'appli. */
  const adminOnly = compose(
    [authenticate(SECRET), requireRole("admin")],
    () => OK,
  );

  async function call(authorization?: string): Promise<number> {
    try {
      return (await adminOnly(contextWith(authorization))).status;
    } catch (error) {
      if (error instanceof HttpError) return error.status;
      throw error;
    }
  }

  const bearer = (role: Role) =>
    `Bearer ${signToken({ sub: 1, role }, SECRET, 3600)}`;

  it("401 : pas de jeton, on ne sait pas qui vous êtes", async () => {
    expect(await call()).toBe(401);
  });

  it("401 : jeton invalide", async () => {
    expect(await call("Bearer abc")).toBe(401);
  });

  it("403 : jeton valide, mais rôle user", async () => {
    expect(await call(bearer("user"))).toBe(403);
  });

  it("200 : jeton valide et rôle admin", async () => {
    expect(await call(bearer("admin"))).toBe(200);
  });
});
