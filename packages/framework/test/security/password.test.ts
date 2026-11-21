import { describe, expect, it } from "vitest";
import {
  hashPassword,
  MAX_PASSWORD_BYTES,
  PasswordError,
  verifyPassword,
} from "../../src/security/password.ts";

/** Le coût minimal accepté par la config : les tests restent rapides. En production, la config donne 12. */
const COST = 4;

describe("hashPassword", () => {
  it("ne renvoie jamais le mot de passe, mais un hash bcrypt qui contient le coût", async () => {
    const hash = await hashPassword("secret123", COST);

    expect(hash.includes("secret123")).toBe(false);
    expect(hash.startsWith("$2b$04$")).toBe(true);
    expect(hash.length).toBe(60);
  });

  it("utilise le coût donné", async () => {
    expect((await hashPassword("secret123", 5)).startsWith("$2b$05$")).toBe(
      true,
    );
  });

  it("donne deux hash différents pour le même mot de passe : un sel par hash", async () => {
    const first = await hashPassword("secret123", COST);
    const second = await hashPassword("secret123", COST);

    expect(first).not.toBe(second);
    // Le sel (22 caractères après "$2b$04$") est différent, et chacun reste vérifiable.
    expect(first.slice(7, 29)).not.toBe(second.slice(7, 29));
    expect(await verifyPassword("secret123", first)).toBe(true);
    expect(await verifyPassword("secret123", second)).toBe(true);
  });

  it("accepte un mot de passe de 72 octets, et refuse au-delà", async () => {
    await expect(
      hashPassword("a".repeat(MAX_PASSWORD_BYTES), COST),
    ).resolves.toMatch(/^\$2b\$04\$/);
    await expect(
      hashPassword("a".repeat(MAX_PASSWORD_BYTES + 1), COST),
    ).rejects.toThrow(PasswordError);
  });

  it("compte les octets et non les caractères : é prend 2 octets", async () => {
    await expect(hashPassword("é".repeat(37), COST)).rejects.toThrow(
      PasswordError,
    );
  });
});

describe("verifyPassword", () => {
  it("accepte le bon mot de passe", async () => {
    const hash = await hashPassword("secret123", COST);

    expect(await verifyPassword("secret123", hash)).toBe(true);
  });

  it.each(["Secret123", "secret12", "secret1234", ""])(
    "refuse le mauvais mot de passe %j",
    async (wrong: string) => {
      const hash = await hashPassword("secret123", COST);

      expect(await verifyPassword(wrong, hash)).toBe(false);
    },
  );

  it("refuse un mot de passe trop long, sans appeler bcrypt", async () => {
    const hash = await hashPassword("a".repeat(MAX_PASSWORD_BYTES), COST);

    expect(await verifyPassword("a".repeat(MAX_PASSWORD_BYTES + 1), hash)).toBe(
      false,
    );
  });
});
