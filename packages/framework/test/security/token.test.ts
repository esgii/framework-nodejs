import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  signToken,
  TokenError,
  verifyToken,
} from "../../src/security/token.ts";

const SECRET = "un-secret-de-test-d-au-moins-32-caracteres";
const OTHER_SECRET = "un-autre-secret-de-test-d-au-moins-32-car";
const TTL = 3600;

/** Le contenu d'un jeton, lu SANS vérification : ce que n'importe qui peut voir. */
function readWithoutChecking(token: string): Record<string, unknown> {
  const [, payload = ""] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

/** Vérifie que le jeton est refusé, et pour quelle raison. */
function expectRefused(
  token: string,
  reason: "expired" | "invalid",
  secret = SECRET,
): void {
  try {
    verifyToken(token, secret);
  } catch (error) {
    expect(error).toBeInstanceOf(TokenError);
    expect((error as TokenError).reason).toBe(reason);
    return;
  }
  throw new Error("Le jeton aurait dû être refusé");
}

describe("signToken", () => {
  it("crée un jeton en trois parties, qui contient l'id, le rôle et l'expiration", () => {
    const token = signToken({ sub: 42, role: "admin" }, SECRET, TTL);
    const payload = readWithoutChecking(token);

    expect(token.split(".").length).toBe(3);
    expect(payload["sub"]).toBe("42");
    expect(payload["role"]).toBe("admin");
    expect(payload["exp"]).toBe(Number(payload["iat"]) + TTL);
  });

  it("ne met rien d'autre que l'id et le rôle dans le jeton", () => {
    const payload = readWithoutChecking(
      signToken({ sub: 1, role: "user" }, SECRET, TTL),
    );

    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "role", "sub"]);
  });
});

describe("verifyToken", () => {
  it("rend l'id et le rôle d'un jeton valide", () => {
    const token = signToken({ sub: 42, role: "admin" }, SECRET, TTL);

    expect(verifyToken(token, SECRET)).toEqual({ sub: 42, role: "admin" });
  });

  it("refuse un jeton expiré (raison : expired)", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { sub: "1", role: "user", iat: now - 7200, exp: now - 3600 },
      SECRET,
      { algorithm: "HS256" },
    );

    expectRefused(token, "expired");
  });

  it("refuse un jeton signé avec un autre secret", () => {
    expectRefused(
      signToken({ sub: 1, role: "user" }, OTHER_SECRET, TTL),
      "invalid",
    );
  });

  it("refuse un jeton modifié après la signature (user devenu admin)", () => {
    const [header, , signature] = signToken(
      { sub: 1, role: "user" },
      SECRET,
      TTL,
    ).split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "1", role: "admin", exp: 9999999999 }),
    ).toString("base64url");

    expectRefused(`${header}.${forged}.${signature}`, "invalid");
  });

  it("refuse un jeton sans signature (alg: none)", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "1", role: "admin" }),
    ).toString("base64url");

    expectRefused(`${header}.${payload}.`, "invalid");
  });

  it("refuse un autre algorithme, même avec le bon secret", () => {
    expectRefused(
      jwt.sign({ sub: "1", role: "user" }, SECRET, { algorithm: "HS512" }),
      "invalid",
    );
  });

  it.each(["", "abc", "a.b.c", "Bearer xxx"])(
    "refuse le texte %j",
    (token: string) => {
      expectRefused(token, "invalid");
    },
  );

  it("refuse un jeton dont le contenu n'est pas un objet", () => {
    expectRefused(jwt.sign("hello", SECRET, { algorithm: "HS256" }), "invalid");
  });

  it.each([
    ["sans sub", { role: "user" }],
    ["avec un sub nombre", { sub: 1, role: "user" }],
    ["avec un sub 0", { sub: "0", role: "user" }],
    ["avec un sub texte", { sub: "ada", role: "user" }],
    ["sans rôle", { sub: "1" }],
    ["avec un rôle inconnu", { sub: "1", role: "superadmin" }],
  ])("refuse un jeton bien signé %s", (_name: string, payload: object) => {
    expectRefused(
      jwt.sign(payload, SECRET, { algorithm: "HS256", expiresIn: TTL }),
      "invalid",
    );
  });
});
