/**
 * QB-11 : l'injection SQL. Une valeur envoyée par le client ne doit jamais devenir du SQL :
 * elle reste dans `values` ($1, $2…), et la base la traite comme du simple texte.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SqlQuery } from "../../src/db/conditions.ts";
import { createDatabase, type Database } from "../../src/db/connection.ts";
import { quoteIdent } from "../../src/db/identifiers.ts";
import { from } from "../../src/db/select.ts";
import { deleteFrom, insert, update } from "../../src/db/write.ts";

/** Des valeurs qu'un attaquant pourrait envoyer dans un formulaire ou une URL. */
const EVIL = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  "1; DELETE FROM journeys",
  'x" OR 1=1 --',
  "admin'--",
];

/** Chaque méthode qui reçoit une valeur, avec la valeur malveillante. */
const queries: [string, (evil: string) => SqlQuery][] = [
  ["where", (evil) => from("users").where("email", "=", evil).toSQL()],
  [
    "orWhere",
    (evil) =>
      from("users").where("id", "=", 1).orWhere("email", "=", evil).toSQL(),
  ],
  ["whereIn", (evil) => from("users").whereIn("email", [evil]).toSQL()],
  [
    "whereGroup",
    (evil) =>
      from("users")
        .whereGroup((g) => g.where("email", "=", evil))
        .toSQL(),
  ],
  [
    "whereSearch",
    (evil) => from("journeys").whereSearch(["title"], evil).toSQL(),
  ],
  ["insert", (evil) => insert("users", { email: evil }).toSQL()],
  [
    "update set",
    (evil) =>
      update("users").set({ display_name: evil }).where("id", "=", 1).toSQL(),
  ],
  [
    "update where",
    (evil) =>
      update("users").set({ role: "user" }).where("email", "=", evil).toSQL(),
  ],
  [
    "deleteFrom where",
    (evil) => deleteFrom("users").where("email", "=", evil).toSQL(),
  ],
];

describe("injection : sans base, la valeur reste dans values", () => {
  for (const [method, build] of queries) {
    it.each(EVIL)(`${method} garde %j hors du texte SQL`, (evil: string) => {
      const { text, values } = build(evil);

      expect(text.includes(evil)).toBe(false);
      expect(values).toContain(evil);
    });
  }
});

/** La base de test, séparée de la base de développement (voir connection.test.ts). */
const TEST_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://postgres:test@localhost:5432/test";

/** Une table propre à ce fichier et à ce processus, supprimée à la fin. */
const TABLE = `injection_${process.pid}`;
let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_URL, () => {});
  await db.query(
    `CREATE TABLE ${quoteIdent(TABLE)} (id serial PRIMARY KEY, email text NOT NULL)`,
  );
});

// Chaque test part d'une table vide : aucun test ne dépend de ce qu'un autre a écrit.
beforeEach(async () => {
  await db.query(`TRUNCATE TABLE ${quoteIdent(TABLE)} RESTART IDENTITY`);
});

afterAll(async () => {
  await db.query(`DROP TABLE IF EXISTS ${quoteIdent(TABLE)}`);
  await db.close();
});

/** Les emails de la table, dans l'ordre. */
async function emails(): Promise<unknown[]> {
  const { text, values } = from(TABLE).select("email").orderBy("id").toSQL();
  const { rows } = await db.query(text, [...values]);
  return rows.map((row) => row["email"]);
}

describe("injection : sur une vraie base, la valeur est du simple texte", () => {
  it("enregistre la valeur telle quelle, et la table existe toujours", async () => {
    await insert(
      TABLE,
      EVIL.map((email) => ({ email })),
    ).run(db);

    expect(await emails()).toEqual(EVIL);
  });

  it("' OR '1'='1 ne renvoie pas toutes les lignes", async () => {
    await insert(TABLE, [
      { email: "ada@carnet.fr" },
      { email: "alan@carnet.fr" },
    ]).run(db);

    const { text, values } = from(TABLE)
      .where("email", "=", "' OR '1'='1")
      .toSQL();
    const { rows } = await db.query(text, [...values]);

    // Collée dans le SQL, la condition serait toujours vraie et renverrait les 2 lignes.
    expect(rows).toEqual([]);
  });

  it("un DELETE avec une valeur malveillante ne supprime rien d'autre", async () => {
    await insert(TABLE, [
      { email: "ada@carnet.fr" },
      { email: "alan@carnet.fr" },
    ]).run(db);

    const deleted = await deleteFrom(TABLE)
      .where("email", "=", "x' OR '1'='1")
      .run(db);

    expect(deleted.rowCount).toBe(0);
    expect(await emails()).toEqual(["ada@carnet.fr", "alan@carnet.fr"]);
  });
});
