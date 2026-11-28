import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { QueryError } from "../../src/db/conditions.ts";
import { createDatabase, type Database } from "../../src/db/connection.ts";
import { quoteIdent } from "../../src/db/identifiers.ts";
import { from } from "../../src/db/select.ts";
import { insert } from "../../src/db/write.ts";

/** La base de test, séparée de la base de développement (voir connection.test.ts). */
const TEST_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://postgres:test@localhost:5432/test";

/** Une table propre à ce fichier et à ce processus, supprimée à la fin. */
const TABLE = `transaction_${process.pid}`;
let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_URL, () => {});
  await db.query(`CREATE TABLE ${quoteIdent(TABLE)} (id int PRIMARY KEY)`);
});

beforeEach(async () => {
  await db.query(`TRUNCATE ${quoteIdent(TABLE)}`);
});

afterAll(async () => {
  await db.query(`DROP TABLE IF EXISTS ${quoteIdent(TABLE)}`);
  await db.close();
});

/** Les id présents dans la table, lus hors transaction. */
async function ids(): Promise<unknown[]> {
  const { rows } = await db.query(
    `SELECT id FROM ${quoteIdent(TABLE)} ORDER BY id`,
  );
  return rows.map((row) => row["id"]);
}

describe("transaction", () => {
  it("valide tout si la fonction réussit, et renvoie son résultat", async () => {
    const result = await db.transaction(async (trx) => {
      await insert(TABLE, { id: 1 }).run(trx);
      await insert(TABLE, { id: 2 }).run(trx);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(await ids()).toEqual([1, 2]);
  });

  it("annule tout si la fonction lève une erreur, et relance cette erreur", async () => {
    const failure = new Error("boom");

    await expect(
      db.transaction(async (trx) => {
        await insert(TABLE, { id: 1 }).run(trx);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await ids()).toEqual([]);
  });

  it("annule tout si une requête échoue au milieu", async () => {
    await expect(
      db.transaction(async (trx) => {
        await insert(TABLE, { id: 1 }).run(trx);
        await insert(TABLE, { id: 1 }).run(trx); // doublon de clé primaire
      }),
    ).rejects.toThrow();

    expect(await ids()).toEqual([]);
  });

  it("passe toutes les requêtes par la même connexion, invisible des autres avant le COMMIT", async () => {
    await db.transaction(async (trx) => {
      await insert(TABLE, { id: 1 }).run(trx);

      const { text } = from(TABLE).count("id", "n").toSQL();
      expect((await trx.query(text)).rows).toEqual([{ n: 1 }]); // la transaction voit sa ligne
      expect(await ids()).toEqual([]); // une autre connexion ne voit pas encore la ligne
      await trx.ping();
    });

    expect(await ids()).toEqual([1]);
  });

  it("rend toujours la connexion au pool, même après des erreurs", async () => {
    // Le pool a 10 connexions : sans release, la 11e transaction attendrait pour toujours.
    for (let i = 0; i < 15; i += 1) {
      await expect(
        db.transaction(() => Promise.reject(new Error("boom"))),
      ).rejects.toThrow("boom");
    }

    await expect(db.ping()).resolves.toBeUndefined();
  });

  it("détruit la connexion si le ROLLBACK échoue, signale la coupure, et la base continue de servir", async () => {
    const errors: Error[] = [];
    const watched = createDatabase(TEST_URL, (error) => errors.push(error));

    await expect(
      watched.transaction(async (trx) => {
        // La connexion de la transaction se coupe elle-même : le ROLLBACK ne pourra pas passer.
        await trx.query("SELECT pg_terminate_backend(pg_backend_pid())");
      }),
    ).rejects.toThrow();

    await vi.waitFor(() => expect(errors.length).toBe(1)); // passée à onError, pas un crash
    await expect(watched.ping()).resolves.toBeUndefined();
    await watched.close();
  });

  it("refuse une transaction imbriquée et la fermeture depuis la transaction", async () => {
    await db.transaction(async (trx) => {
      await expect(trx.transaction(async () => {})).rejects.toThrow(QueryError);
      await expect(trx.close()).rejects.toThrow(QueryError);
    });
  });
});
