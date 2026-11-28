import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../../src/db/connection.ts";
import { quoteIdent } from "../../src/db/identifiers.ts";
import { from } from "../../src/db/select.ts";
import { insert } from "../../src/db/write.ts";

/** La base de test, séparée de la base de développement (voir connection.test.ts). */
const TEST_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://postgres:test@localhost:5432/test";

/** Une table propre à ce fichier et à ce processus, supprimée à la fin. */
const TABLE = `search_${process.pid}`;
let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_URL, () => {});
  await db.query(
    `CREATE TABLE ${quoteIdent(TABLE)} (id int PRIMARY KEY, title text NOT NULL, summary text NULL)`,
  );
  await insert(TABLE, [
    {
      id: 1,
      title: "Randonnée en montagne",
      summary: "Trois jours dans les Alpes",
    },
    {
      id: 2,
      title: "Week-end à Rome",
      summary: "Le Colisée et les montagnes autour",
    },
    { id: 3, title: "Plages de Bretagne", summary: null },
  ]).run(db);
});

afterAll(async () => {
  await db.query(`DROP TABLE IF EXISTS ${quoteIdent(TABLE)}`);
  await db.close();
});

/** Les id trouvés par la recherche, dans l'ordre. */
async function found(text: string): Promise<unknown[]> {
  const { text: sql, values } = from(TABLE)
    .select("id")
    .whereSearch(["title", "summary"], text)
    .orderBy("id")
    .toSQL();
  const { rows } = await db.query(sql, [...values]);
  return rows.map((row) => row["id"]);
}

describe("recherche plein texte sur une vraie base", () => {
  it("trouve le singulier et le pluriel, dans le titre comme dans le résumé", async () => {
    expect(await found("montagne")).toEqual([1, 2]);
    expect(await found("montagnes")).toEqual([1, 2]);
  });

  it("exige tous les mots cherchés", async () => {
    expect(await found("montagne Rome")).toEqual([2]);
  });

  it("cherche dans le titre même quand le résumé est NULL", async () => {
    expect(await found("plage")).toEqual([3]);
  });

  it("ne trouve rien pour un mot absent, et renvoie tout pour un texte vide", async () => {
    expect(await found("désert")).toEqual([]);
    expect(await found("")).toEqual([1, 2, 3]);
  });

  it("traite un texte malveillant comme de simples mots", async () => {
    expect(await found("'); DROP TABLE users; --")).toEqual([]);
  });
});
