import { describe, expect, it } from "vitest";
import type { Database, QueryResult } from "../../src/db/connection.ts";
import { RowDecodeError } from "../../src/db/decode.ts";
import { from } from "../../src/db/select.ts";
import { v } from "../../src/validation/index.ts";
import type { Infer } from "../../src/validation/schema.ts";

/** Une fausse base : elle garde les requêtes reçues et répond toujours les mêmes lignes. */
function fakeDatabase(rows: Record<string, unknown>[]) {
  const queries: { text: string; params: unknown[] }[] = [];
  const db: Database = {
    async query(text, params = []): Promise<QueryResult> {
      queries.push({ text, params });
      return { rows, rowCount: rows.length };
    },
    async ping() {},
    async close() {},
    transaction: <T>(fn: (trx: Database) => Promise<T>) => fn(db),
  };
  return { db, queries };
}

// Le schéma de la fiche : il sert de décodeur sans rien changer au validateur.
const journeyRow = v.object({ id: v.number(), title: v.string() });
type JourneyRow = Infer<typeof journeyRow>;

describe("all", () => {
  it("décode chaque ligne avec un schéma du validateur, typé sans as", async () => {
    const { db, queries } = fakeDatabase([
      { id: 1, title: "Lisbonne" },
      { id: 2, title: "Porto" },
    ]);
    const q = from("journeys")
      .select("id", "title")
      .where("visibility", "=", "public");

    const rows: JourneyRow[] = await q.all(db, journeyRow);

    expect(rows).toEqual([
      { id: 1, title: "Lisbonne" },
      { id: 2, title: "Porto" },
    ]);
    expect(queries).toEqual([
      {
        text: 'SELECT "id", "title" FROM "journeys" WHERE "visibility" = $1',
        params: ["public"],
      },
    ]);
  });

  it("accepte aussi une simple fonction de décodage", async () => {
    const { db } = fakeDatabase([{ id: 1 }, { id: 2 }]);
    const toId = (row: unknown): string => JSON.stringify(row);

    const ids: string[] = await from("journeys").all(db, toId);

    expect(ids).toEqual(['{"id":1}', '{"id":2}']);
  });

  it("renvoie un tableau vide quand il n'y a aucune ligne", async () => {
    const { db } = fakeDatabase([]);
    expect(await from("journeys").all(db, journeyRow)).toEqual([]);
  });

  it("lève une RowDecodeError (500, pas 422) quand une ligne ne correspond pas", async () => {
    const { db } = fakeDatabase([
      { id: 1, title: "Lisbonne" },
      { id: "2", title: "Porto" },
    ]);

    const error = await from("journeys")
      .all(db, journeyRow)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RowDecodeError);
    expect(error).toMatchObject({ index: 1, errors: [{ field: "id" }] });
  });

  it("laisse passer l'erreur lancée par une fonction de décodage", async () => {
    const { db } = fakeDatabase([{ id: 1 }]);
    const refuse = (): never => {
      throw new Error("ligne refusée");
    };

    await expect(from("journeys").all(db, refuse)).rejects.toThrow(
      "ligne refusée",
    );
  });
});

describe("first", () => {
  it("ajoute LIMIT 1 et renvoie la première ligne décodée", async () => {
    const { db, queries } = fakeDatabase([{ id: 1, title: "Lisbonne" }]);

    const row: JourneyRow | null = await from("journeys").first(db, journeyRow);

    expect(row).toEqual({ id: 1, title: "Lisbonne" });
    expect(queries).toEqual([
      { text: 'SELECT * FROM "journeys" LIMIT $1', params: [1] },
    ]);
  });

  it("renvoie null quand il n'y a aucune ligne", async () => {
    const { db } = fakeDatabase([]);
    expect(await from("journeys").first(db, journeyRow)).toBeNull();
  });
});
