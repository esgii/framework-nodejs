import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../../src/db/connection.ts";
import { quoteIdent } from "../../src/db/identifiers.ts";
import { from } from "../../src/index.js";

/** La base de test, séparée de la base de développement (voir connection.test.ts). */

const TEST_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://postgres:test@localhost:5432/test";

/** Une table propre à ce fichier et à ce processus, supprimée à la fin. */
const TABLE = `paginate_${process.pid}`;
let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_URL, () => {});
  // Une table laissée par un lancement interrompu ne doit pas faire échouer celui-ci (QA-01).
  await db.query(`DROP TABLE IF EXISTS ${quoteIdent(TABLE)}`);
  // 25 lignes, numérotées de 1 à 25 ; rest = id % 5 forme 5 groupes de 5 lignes.
  await db.query(
    `CREATE TABLE ${quoteIdent(TABLE)} AS SELECT n AS id, n % 5 AS rest FROM generate_series(1, 25) AS n`,
  );
});

afterAll(async () => {
  await db.query(`DROP TABLE IF EXISTS ${quoteIdent(TABLE)}`);
  await db.close();
});

describe("paginate sur une vraie base", () => {
  it("25 lignes, size 10 offset 20 : 5 lignes, total 25", async () => {
    const page = await from(TABLE)
      .select("id")
      .orderBy("id")
      .paginate(db, { size: 10, offset: 20 });

    expect(page.items.map((row) => row["id"])).toEqual([21, 22, 23, 24, 25]);
    expect(page.total).toBe(25);
    expect(page.size).toBe(10);
    expect(page.offset).toBe(20);
  });

  it("renvoie une page pleine au début", async () => {
    const page = await from(TABLE)
      .select("id")
      .orderBy("id", "desc")
      .paginate(db, { size: 10, offset: 0 });

    expect(page.items.length).toBe(10);
    expect(page.items[0]?.["id"]).toBe(25);
    expect(page.total).toBe(25);
  });

  it("renvoie une page vide après la fin, avec le vrai total", async () => {
    const page = await from(TABLE).paginate(db, { size: 10, offset: 40 });

    expect(page.items).toEqual([]);
    expect(page.total).toBe(25);
  });

  it("compte seulement les lignes qui respectent le WHERE", async () => {
    const page = await from(TABLE)
      .where("id", ">", 20)
      .paginate(db, { size: 2, offset: 0 });

    expect(page.items.length).toBe(2);
    expect(page.total).toBe(5);
  });
  it("avec GROUP BY, le total compte les groupes et pas les lignes", async () => {
    // id % 5 : 5 groupes (0 à 4) de 5 lignes chacun.
    const page = await from(TABLE)
      .select("rest")
      .count()
      .groupBy("rest")
      .paginate(db, { size: 2, offset: 0 });

    expect(page.items.length).toBe(2);
    expect(page.total).toBe(5);
  });
});
