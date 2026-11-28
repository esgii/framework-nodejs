/**
 * DB-02 : les contraintes du schéma, vérifiées sur une vraie base.
 * La migration est appliquée dans un schéma PostgreSQL à part, propre à ce processus,
 * puis supprimée : la base de test reste propre et les autres fichiers ne sont pas gênés.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** La base de test, séparée de la base de développement. */
const TEST_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://postgres:test@localhost:5432/test";
const SCHEMA = `db02_${process.pid}`;
const MIGRATION = new URL("../migrations/001_init.sql", import.meta.url);

// Un seul client, donc une seule connexion : le search_path reste le même pour tout le fichier.
const client = new pg.Client({ connectionString: TEST_URL });

beforeAll(async () => {
  await client.connect();
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
  await client.query(await readFile(MIGRATION, "utf8"));
});

// Chaque test part de tables vides.
beforeEach(async () => {
  await client.query(
    "TRUNCATE users, journeys, steps, comments, tags, journey_tags RESTART IDENTITY CASCADE",
  );
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
});

/** Le code d'erreur PostgreSQL d'une requête refusée : 23505 doublon, 23503 clé étrangère. */
async function errorCode(
  sql: string,
  params: unknown[] = [],
): Promise<string | undefined> {
  try {
    await client.query(sql, params);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

async function count(table: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table}`,
  );
  return rows[0].n;
}

/** Un compte, un carnet avec une étape, un commentaire et un tag. */
async function seed(): Promise<void> {
  await client.query(
    `INSERT INTO users (email, password_hash, display_name) VALUES ('ada@carnet.fr', 'x', 'Ada')`,
  );
  await client.query(
    `INSERT INTO journeys (author_id, title) VALUES (1, 'Rome')`,
  );
  await client.query(
    `INSERT INTO steps (journey_id, title, position) VALUES (1, 'Colisée', 1)`,
  );
  await client.query(
    `INSERT INTO comments (journey_id, author_id, content) VALUES (1, 1, 'Super !')`,
  );
  await client.query(`INSERT INTO tags (name) VALUES ('italie')`);
  await client.query(
    `INSERT INTO journey_tags (journey_id, tag_id) VALUES (1, 1)`,
  );
}

describe("email unique", () => {
  it("refuse un deuxième compte avec le même email (erreur 23505)", async () => {
    await seed();

    expect(
      await errorCode(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('ada@carnet.fr', 'y', 'Autre')`,
      ),
    ).toBe("23505");
  });
});

describe("clés étrangères", () => {
  it.each([
    [
      "un carnet d'un auteur qui n'existe pas",
      `INSERT INTO journeys (author_id, title) VALUES (999, 'Fantôme')`,
    ],
    [
      "une étape d'un carnet qui n'existe pas",
      `INSERT INTO steps (journey_id, title, position) VALUES (999, 'x', 1)`,
    ],
    [
      "un commentaire sur un carnet qui n'existe pas",
      `INSERT INTO comments (journey_id, author_id, content) VALUES (999, 1, 'x')`,
    ],
    [
      "un commentaire d'un auteur qui n'existe pas",
      `INSERT INTO comments (journey_id, author_id, content) VALUES (1, 999, 'x')`,
    ],
    [
      "un lien vers un tag qui n'existe pas",
      `INSERT INTO journey_tags (journey_id, tag_id) VALUES (1, 999)`,
    ],
  ])("refuse %s (erreur 23503)", async (_name: string, sql: string) => {
    await seed();

    expect(await errorCode(sql)).toBe("23503");
  });
});

describe("ON DELETE CASCADE", () => {
  it("supprimer un carnet supprime ses étapes, ses commentaires et ses liens de tags", async () => {
    await seed();

    await client.query(`DELETE FROM journeys WHERE id = 1`);

    expect(await count("steps")).toBe(0);
    expect(await count("comments")).toBe(0);
    expect(await count("journey_tags")).toBe(0);
    // Le tag lui-même reste : il peut servir à d'autres carnets.
    expect(await count("tags")).toBe(1);
  });

  it("supprimer un tag retire seulement ses liens, pas les carnets", async () => {
    await seed();

    await client.query(`DELETE FROM tags WHERE id = 1`);

    expect(await count("journey_tags")).toBe(0);
    expect(await count("journeys")).toBe(1);
  });

  it("refuse de supprimer un compte qui a encore des carnets (erreur 23503)", async () => {
    await seed();

    expect(await errorCode(`DELETE FROM users WHERE id = 1`)).toBe("23503");
    expect(await count("journeys")).toBe(1);
  });
});
