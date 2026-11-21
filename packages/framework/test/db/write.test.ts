import { describe, expect, it } from "vitest";
import { QueryError } from "../../src/db/conditions.ts";
import type { Database } from "../../src/db/connection.ts";
import { IdentifierError } from "../../src/db/identifiers.ts";
import { deleteFrom, insert, update, type Row } from "../../src/db/write.ts";

describe("insert", () => {
  it("insère une ligne et renvoie les colonnes demandées", () => {
    const q = insert("users", { email: "a@b.c", password_hash: "x" }).returning(
      "id",
      "email",
    );

    expect(q.toSQL()).toEqual({
      text: 'INSERT INTO "users" ("email", "password_hash") VALUES ($1, $2) RETURNING "id", "email"',
      values: ["a@b.c", "x"],
    });
  });

  it("insère plusieurs lignes en une requête", () => {
    const q = insert("steps", [
      { journey_id: 1, title: "Rome" },
      { journey_id: 1, title: "Naples" },
    ]);

    expect(q.toSQL()).toEqual({
      text: 'INSERT INTO "steps" ("journey_id", "title") VALUES ($1, $2), ($3, $4)',
      values: [1, "Rome", 1, "Naples"],
    });
  });

  it("accepte null pour une colonne vide", () => {
    expect(
      insert("journeys", { title: "Rome", summary: null }).toSQL().values,
    ).toEqual(["Rome", null]);
  });

  it("traite une valeur undefined comme NULL", () => {
    const row: Record<string, string | null> = { title: "Rome" };
    // Comme un code JavaScript qui passerait undefined : TypeScript ne le permet pas.
    Reflect.set(row, "summary", undefined);

    expect(insert("journeys", row).toSQL().values).toEqual(["Rome", null]);
  });

  it("refuse une insertion sans ligne ou sans colonne", () => {
    expect(() => insert("users", []).toSQL()).toThrow(QueryError);
    expect(() => insert("users", {}).toSQL()).toThrow(QueryError);
  });

  it.each([
    [{ email: "a" }, { name: "b" }],
    [{ email: "a" }, { email: "b", name: "c" }],
    [{ email: "a", name: "b" }, { email: "c" }],
  ])(
    "refuse des lignes qui n'ont pas les mêmes colonnes",
    (first: Row, second: Row) => {
      expect(() => insert("users", [first, second]).toSQL()).toThrow(
        QueryError,
      );
    },
  );

  it("refuse une table ou une colonne invalide", () => {
    expect(() => insert("users; --", { email: "a" })).toThrow(IdentifierError);
    expect(() => insert("users", { "email; --": "a" }).toSQL()).toThrow(
      IdentifierError,
    );
    expect(() => insert("users", { email: "a" }).returning("id; --")).toThrow(
      IdentifierError,
    );
  });
});

describe("update", () => {
  it("modifie les colonnes du set, avec les valeurs du WHERE à la suite", () => {
    const q = update("journeys")
      .set({ title: "Rome" })
      .where("id", "=", 7)
      .returning("id");

    expect(q.toSQL()).toEqual({
      text: 'UPDATE "journeys" SET "title" = $1 WHERE "id" = $2 RETURNING "id"',
      values: ["Rome", 7],
    });
  });

  it("cumule plusieurs appels à set", () => {
    const q = update("journeys")
      .set({ title: "Rome" })
      .set({ summary: null })
      .whereIn("id", [1, 2]);

    expect(q.toSQL()).toEqual({
      text: 'UPDATE "journeys" SET "title" = $1, "summary" = $2 WHERE "id" IN ($3, $4)',
      values: ["Rome", null, 1, 2],
    });
  });

  it("traite une valeur undefined comme NULL", () => {
    const changes: Record<string, string | null> = {};
    Reflect.set(changes, "summary", undefined);

    expect(
      update("journeys").set(changes).where("id", "=", 1).toSQL().values,
    ).toEqual([null, 1]);
  });

  it("refuse un UPDATE sans WHERE", () => {
    expect(() => update("journeys").set({ title: "x" }).toSQL()).toThrow(
      QueryError,
    );
  });

  it("accepte un UPDATE sur toutes les lignes avec .all()", () => {
    expect(update("journeys").set({ archived: true }).all().toSQL()).toEqual({
      text: 'UPDATE "journeys" SET "archived" = $1',
      values: [true],
    });
  });

  it("refuse un UPDATE sans colonne à modifier", () => {
    expect(() => update("journeys").where("id", "=", 1).toSQL()).toThrow(
      QueryError,
    );
  });

  it("refuse une colonne invalide dans set", () => {
    expect(() =>
      update("journeys").set({ "title = 'x' --": "y" }).all().toSQL(),
    ).toThrow(IdentifierError);
  });

  it("ne modifie pas la requête de départ", () => {
    const base = update("journeys").set({ title: "Rome" });
    base.where("id", "=", 1);
    base.set({ summary: "x" });

    expect(() => base.toSQL()).toThrow(QueryError);
    expect(base.all().toSQL().text).toBe('UPDATE "journeys" SET "title" = $1');
  });
});

describe("deleteFrom", () => {
  it("supprime les lignes du WHERE", () => {
    const q = deleteFrom("comments")
      .where("journey_id", "=", 3)
      .orWhere("author_id", "=", 9);

    expect(q.toSQL()).toEqual({
      text: 'DELETE FROM "comments" WHERE "journey_id" = $1 OR "author_id" = $2',
      values: [3, 9],
    });
  });

  it("accepte IS NULL et IS NOT NULL, et RETURNING", () => {
    const q = deleteFrom("sessions")
      .whereNull("user_id")
      .whereNotNull("expired_at")
      .returning("id");

    expect(q.toSQL().text).toBe(
      'DELETE FROM "sessions" WHERE "user_id" IS NULL AND "expired_at" IS NOT NULL RETURNING "id"',
    );
  });

  it("refuse un DELETE sans WHERE", () => {
    expect(() => deleteFrom("comments").toSQL()).toThrow(QueryError);
  });

  it("accepte un DELETE sur toutes les lignes avec .all()", () => {
    expect(deleteFrom("comments").all().toSQL()).toEqual({
      text: 'DELETE FROM "comments"',
      values: [],
    });
  });

  it("refuse un opérateur hors de la liste blanche", () => {
    const q = deleteFrom("comments");
    expect(() => Reflect.apply(q.where, q, ["id", "= 1 OR 1=1 --", 1])).toThrow(
      QueryError,
    );
  });
});

describe("run", () => {
  /** Une fausse base qui garde les requêtes reçues. */
  function fakeDatabase() {
    const queries: { text: string; params: unknown[] }[] = [];
    const db: Database = {
      async query(text, params = []) {
        queries.push({ text, params });
        return { rows: [{ id: 1 }], rowCount: 1 };
      },
      async ping() {},
      async close() {},
      transaction: <T>(fn: (trx: Database) => Promise<T>) => fn(db),
    };
    return { db, queries };
  }

  it("envoie le texte et les valeurs à la base, pour les trois requêtes", async () => {
    const { db, queries } = fakeDatabase();

    expect(
      (await insert("users", { email: "a" }).returning("id").run(db)).rows,
    ).toEqual([{ id: 1 }]);
    await update("users").set({ email: "b" }).where("id", "=", 1).run(db);
    await deleteFrom("users").where("id", "=", 1).run(db);

    expect(queries).toEqual([
      {
        text: 'INSERT INTO "users" ("email") VALUES ($1) RETURNING "id"',
        params: ["a"],
      },
      {
        text: 'UPDATE "users" SET "email" = $1 WHERE "id" = $2',
        params: ["b", 1],
      },
      { text: 'DELETE FROM "users" WHERE "id" = $1', params: [1] },
    ]);
  });

  it("n'envoie rien à la base si la requête est refusée", async () => {
    const { db, queries } = fakeDatabase();

    expect(() => deleteFrom("users").run(db)).toThrow(QueryError);
    expect(queries).toEqual([]);
  });
});
