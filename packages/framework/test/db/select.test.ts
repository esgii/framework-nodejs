import { describe, expect, it } from "vitest";
import type { Database, QueryResult } from "../../src/db/connection.ts";
import {
  IdentifierError,
  UnknownSortKeyError,
} from "../../src/db/identifiers.ts";
import { from, QueryError, type Operator } from "../../src/db/select.ts";

describe("select", () => {
  it("produit la requête de l'exemple de la fiche", () => {
    const q = from("journeys", "j")
      .select("j.id", "j.title")
      .where("j.visibility", "=", "public")
      .whereIn("j.author_id", [1, 2]);

    expect(q.toSQL()).toEqual({
      text: 'SELECT "j"."id", "j"."title" FROM "journeys" AS "j" WHERE "j"."visibility" = $1 AND "j"."author_id" IN ($2, $3)',
      values: ["public", 1, 2],
    });
  });

  it("lit toutes les colonnes sans select", () => {
    expect(from("journeys").toSQL()).toEqual({
      text: 'SELECT * FROM "journeys"',
      values: [],
    });
  });

  it("renomme une colonne avec un alias", () => {
    expect(
      from("users").select("id", ["display_name", "name"]).toSQL().text,
    ).toBe('SELECT "id", "display_name" AS "name" FROM "users"');
  });

  it("ajoute les colonnes de plusieurs appels à select", () => {
    expect(from("users").select("id").select("email").toSQL().text).toBe(
      'SELECT "id", "email" FROM "users"',
    );
  });
});

describe("where", () => {
  it.each([
    ["=", '"age" = $1'],
    ["<>", '"age" <> $1'],
    ["<", '"age" < $1'],
    ["<=", '"age" <= $1'],
    [">", '"age" > $1'],
    [">=", '"age" >= $1'],
    ["like", '"age" LIKE $1'],
    ["ilike", '"age" ILIKE $1'],
  ] as const)("accepte l'opérateur %s", (operator: Operator, sql: string) => {
    expect(from("users").where("age", operator, 18).toSQL().text).toBe(
      `SELECT * FROM "users" WHERE ${sql}`,
    );
  });

  it("relie les conditions par AND, ou par OR avec orWhere", () => {
    const q = from("journeys")
      .where("visibility", "=", "public")
      .orWhere("author_id", "=", 7);

    expect(q.toSQL()).toEqual({
      text: 'SELECT * FROM "journeys" WHERE "visibility" = $1 OR "author_id" = $2',
      values: ["public", 7],
    });
  });

  it("écrit IS NULL et IS NOT NULL sans valeur", () => {
    const q = from("journeys")
      .whereNull("deleted_at")
      .whereNotNull("published_at");

    expect(q.toSQL()).toEqual({
      text: 'SELECT * FROM "journeys" WHERE "deleted_at" IS NULL AND "published_at" IS NOT NULL',
      values: [],
    });
  });

  it("ne renvoie aucune ligne pour un IN vide, au lieu d'un SQL invalide", () => {
    expect(from("journeys").whereIn("id", []).toSQL().text).toBe(
      'SELECT * FROM "journeys" WHERE FALSE',
    );
  });

  it("met un groupe entre parenthèses, en numérotant les valeurs à la suite", () => {
    const q = from("journeys", "j")
      .where("j.visibility", "=", "public")
      .whereGroup((g) =>
        g
          .where("j.title", "ilike", "%rome%")
          .orWhere("j.summary", "ilike", "%rome%"),
      );

    expect(q.toSQL()).toEqual({
      text: 'SELECT * FROM "journeys" AS "j" WHERE "j"."visibility" = $1 AND ("j"."title" ILIKE $2 OR "j"."summary" ILIKE $3)',
      values: ["public", "%rome%", "%rome%"],
    });
  });

  it("relie un groupe par OR avec orWhereGroup", () => {
    const q = from("journeys")
      .where("author_id", "=", 7)
      .orWhereGroup((g) =>
        g.where("visibility", "=", "public").whereNotNull("published_at"),
      );

    expect(q.toSQL().text).toBe(
      'SELECT * FROM "journeys" WHERE "author_id" = $1 OR ("visibility" = $2 AND "published_at" IS NOT NULL)',
    );
  });

  it("ignore un groupe vide", () => {
    expect(
      from("journeys")
        .whereGroup((g) => g)
        .toSQL().text,
    ).toBe('SELECT * FROM "journeys"');
  });

  it("commence par un groupe sans AND devant", () => {
    expect(
      from("journeys")
        .whereGroup((g) => g.where("id", "=", 1))
        .toSQL().text,
    ).toBe('SELECT * FROM "journeys" WHERE ("id" = $1)');
  });
});

describe("sécurité", () => {
  it("ne met jamais une valeur dans le texte SQL", () => {
    const evil = "'; DROP TABLE users; --";
    const { text, values } = from("users").where("email", "=", evil).toSQL();

    expect(text.includes("DROP")).toBe(false);
    expect(values).toEqual([evil]);
  });

  it.each(["name; DROP TABLE users", 'title" OR 1=1 --'])(
    "refuse la colonne %s",
    (column: string) => {
      expect(() => from("users").where(column, "=", 1)).toThrow(
        IdentifierError,
      );
      expect(() => from("users").select(column)).toThrow(IdentifierError);
    },
  );

  it("refuse une table ou un alias invalide", () => {
    expect(() => from("users; --")).toThrow(IdentifierError);
    expect(() => from("users", "u u")).toThrow(IdentifierError);
  });

  it("refuse à l'exécution un opérateur hors de la liste blanche", () => {
    const q = from("users");
    // Reflect.apply appelle where sans vérification de types, comme un code JavaScript le ferait.
    const call = () => Reflect.apply(q.where, q, ["email", "= 1 OR 1=1 --", 1]);

    expect(call).toThrow(QueryError);
  });
});

describe("immuabilité", () => {
  it("ne modifie jamais la requête de départ", () => {
    const base = from("journeys").where("visibility", "=", "public");
    const mine = base.where("author_id", "=", 7);

    expect(base.toSQL().text).toBe(
      'SELECT * FROM "journeys" WHERE "visibility" = $1',
    );
    expect(mine.toSQL().text).toBe(
      'SELECT * FROM "journeys" WHERE "visibility" = $1 AND "author_id" = $2',
    );
  });

  it("donne le même résultat à chaque appel de toSQL", () => {
    const q = from("journeys").where("id", "=", 1);

    expect(q.toSQL()).toEqual(q.toSQL());
  });
});

describe("jointures", () => {
  it.each([
    ["join", "INNER JOIN"],
    ["leftJoin", "LEFT JOIN"],
    ["rightJoin", "RIGHT JOIN"],
    ["fullJoin", "FULL JOIN"],
  ] as const)(
    "%s produit un %s sur deux colonnes",
    (method: "join" | "leftJoin" | "rightJoin" | "fullJoin", sql: string) => {
      const q = from("journeys", "j")[method](
        "steps",
        "s",
        "j.id",
        "s.journey_id",
      );

      expect(q.toSQL()).toEqual({
        text: `SELECT * FROM "journeys" AS "j" ${sql} "steps" AS "s" ON "j"."id" = "s"."journey_id"`,
        values: [],
      });
    },
  );

  it("enchaîne plusieurs jointures dans l'ordre", () => {
    const q = from("comments", "c")
      .join("journeys", "j", "c.journey_id", "j.id")
      .leftJoin("users", "u", "c.author_id", "u.id");

    expect(q.toSQL().text).toBe(
      'SELECT * FROM "comments" AS "c" INNER JOIN "journeys" AS "j" ON "c"."journey_id" = "j"."id" LEFT JOIN "users" AS "u" ON "c"."author_id" = "u"."id"',
    );
  });

  it("place les jointures entre FROM et WHERE, sans décaler les valeurs", () => {
    const q = from("journeys", "j")
      .select("j.title", ["u.display_name", "author"])
      .where("j.visibility", "=", "public")
      .join("users", "u", "j.author_id", "u.id");

    expect(q.toSQL()).toEqual({
      text: 'SELECT "j"."title", "u"."display_name" AS "author" FROM "journeys" AS "j" INNER JOIN "users" AS "u" ON "j"."author_id" = "u"."id" WHERE "j"."visibility" = $1',
      values: ["public"],
    });
  });

  it.each([
    ["users; --", "u", "j.author_id", "u.id"],
    ["users", "u u", "j.author_id", "u.id"],
    ["users", "u", "j.author_id OR 1=1", "u.id"],
    ["users", "u", "j.author_id", "'1'"],
  ])(
    "refuse la jointure %s %s %s %s",
    (table: string, alias: string, left: string, right: string) => {
      expect(() =>
        from("journeys", "j").join(table, alias, left, right),
      ).toThrow(IdentifierError);
    },
  );

  it("ne modifie pas la requête de départ", () => {
    const base = from("journeys", "j");
    base.join("users", "u", "j.author_id", "u.id");

    expect(base.toSQL().text).toBe('SELECT * FROM "journeys" AS "j"');
  });
});

describe("tri", () => {
  it("trie par ordre croissant par défaut", () => {
    expect(from("journeys").orderBy("created_at").toSQL().text).toBe(
      'SELECT * FROM "journeys" ORDER BY "created_at" ASC',
    );
  });

  it("cumule plusieurs tris dans l'ordre des appels", () => {
    expect(
      from("journeys", "j")
        .orderBy("j.created_at", "desc")
        .orderBy("j.id", "asc")
        .toSQL().text,
    ).toBe(
      'SELECT * FROM "journeys" AS "j" ORDER BY "j"."created_at" DESC, "j"."id" ASC',
    );
  });

  it("refuse une injection dans la colonne de tri", () => {
    expect(() => from("users").orderBy("name; DROP TABLE users")).toThrow(
      IdentifierError,
    );
  });

  it("refuse à l'exécution un sens hors de la liste blanche", () => {
    const q = from("users");
    // Reflect.apply appelle orderBy sans vérification de types, comme un code JavaScript le ferait.
    expect(() =>
      Reflect.apply(q.orderBy, q, ["id", "desc; DROP TABLE users"]),
    ).toThrow(QueryError);
  });

  it("trie selon une clé du client, traduite par la table de correspondance", () => {
    const sorts = { created: "j.created_at" };

    expect(
      from("journeys", "j").sortBy("created", sorts, "desc").toSQL().text,
    ).toBe('SELECT * FROM "journeys" AS "j" ORDER BY "j"."created_at" DESC');
    expect(from("journeys", "j").sortBy("created", sorts).toSQL().text).toBe(
      'SELECT * FROM "journeys" AS "j" ORDER BY "j"."created_at" ASC',
    );
  });

  it("refuse une clé de tri inconnue du client", () => {
    expect(() =>
      from("journeys").sortBy("password", { created: "created_at" }),
    ).toThrow(UnknownSortKeyError);
  });
});

describe("agrégations", () => {
  it("compte les étapes de chaque carnet (exemple du ticket)", () => {
    const q = from("journeys", "j")
      .select("j.id", "j.title")
      .count("s.id", "steps_count")
      .leftJoin("steps", "s", "s.journey_id", "j.id")
      .where("j.visibility", "=", "public")
      .groupBy("j.id", "j.title");

    expect(q.toSQL()).toEqual({
      text:
        'SELECT "j"."id", "j"."title", COUNT("s"."id")::int AS "steps_count" FROM "journeys" AS "j" ' +
        'LEFT JOIN "steps" AS "s" ON "s"."journey_id" = "j"."id" WHERE "j"."visibility" = $1 GROUP BY "j"."id", "j"."title"',
      values: ["public"],
    });
  });

  it("compte toutes les lignes avec COUNT(*) quand on ne donne pas de colonne", () => {
    expect(from("steps").count().toSQL().text).toBe(
      'SELECT COUNT(*)::int AS "count" FROM "steps"',
    );
  });

  it("cumule plusieurs appels à groupBy", () => {
    expect(
      from("steps")
        .select("journey_id")
        .count()
        .groupBy("journey_id")
        .groupBy("date")
        .toSQL().text,
    ).toBe(
      'SELECT "journey_id", COUNT(*)::int AS "count" FROM "steps" GROUP BY "journey_id", "date"',
    );
  });

  it("place GROUP BY après WHERE et avant ORDER BY, LIMIT et OFFSET", () => {
    const q = from("steps")
      .select("journey_id")
      .count("id", "n")
      .where("position", ">", 0)
      .groupBy("journey_id")
      .orderBy("n", "desc")
      .limit(5)
      .offset(10);

    expect(q.toSQL()).toEqual({
      text: 'SELECT "journey_id", COUNT("id")::int AS "n" FROM "steps" WHERE "position" > $1 GROUP BY "journey_id" ORDER BY "n" DESC LIMIT $2 OFFSET $3',
      values: [0, 5, 10],
    });
  });

  it("refuse une injection dans count et dans groupBy", () => {
    expect(() => from("steps").count("id); DROP TABLE users; --")).toThrow(
      IdentifierError,
    );
    expect(() => from("steps").count("id", "n; DROP TABLE users")).toThrow(
      IdentifierError,
    );
    expect(() => from("steps").groupBy("journey_id; DROP TABLE users")).toThrow(
      IdentifierError,
    );
  });
});

describe("limit et offset", () => {
  it("passe LIMIT et OFFSET en paramètres liés, après ceux du WHERE", () => {
    const q = from("journeys")
      .where("visibility", "=", "public")
      .orderBy("id")
      .limit(10)
      .offset(20);

    expect(q.toSQL()).toEqual({
      text: 'SELECT * FROM "journeys" WHERE "visibility" = $1 ORDER BY "id" ASC LIMIT $2 OFFSET $3',
      values: ["public", 10, 20],
    });
  });

  it("accepte LIMIT sans OFFSET, et OFFSET sans LIMIT", () => {
    expect(from("journeys").limit(5).toSQL().text).toBe(
      'SELECT * FROM "journeys" LIMIT $1',
    );
    expect(from("journeys").offset(5).toSQL().text).toBe(
      'SELECT * FROM "journeys" OFFSET $1',
    );
  });

  it.each([-1, 2.5, Number.NaN])("refuse la valeur %s", (value: number) => {
    expect(() => from("journeys").limit(value)).toThrow(QueryError);
    expect(() => from("journeys").offset(value)).toThrow(QueryError);
  });
});

/** Une fausse base : elle garde les requêtes reçues et répond ce qu'on lui a préparé. */
function fakeDatabase(answer: (text: string) => QueryResult) {
  const queries: { text: string; params: unknown[] }[] = [];
  const db: Database = {
    async query(text, params = []) {
      queries.push({ text, params });
      return answer(text);
    },
    async ping() {},
    async close() {},
    transaction: <T>(fn: (trx: Database) => Promise<T>) => fn(db),
  };

  return { db, queries };
}

describe("paginate", () => {
  it("exécute la page et le comptage, et renvoie la page avec le total", async () => {
    const { db, queries } = fakeDatabase((text) =>
      text.startsWith("SELECT COUNT")
        ? { rows: [{ total: "25" }], rowCount: 1 }
        : { rows: [{ id: 21 }, { id: 22 }], rowCount: 2 },
    );
    const q = from("journeys")
      .select("id")
      .where("visibility", "=", "public")
      .orderBy("id");

    const page = await q.paginate(db, { size: 10, offset: 20 });

    expect(page).toEqual({
      items: [{ id: 21 }, { id: 22 }],
      total: 25,
      size: 10,
      offset: 20,
    });
    expect(queries).toEqual([
      {
        text: 'SELECT "id" FROM "journeys" WHERE "visibility" = $1 ORDER BY "id" ASC LIMIT $2 OFFSET $3',
        params: ["public", 10, 20],
      },
      {
        text: 'SELECT COUNT(*) AS "total" FROM "journeys" WHERE "visibility" = $1',
        params: ["public"],
      },
    ]);
  });

  it("avec GROUP BY, compte les groupes dans une sous-requête", async () => {
    const { db, queries } = fakeDatabase((text) =>
      text.startsWith("SELECT COUNT")
        ? { rows: [{ total: "3" }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    const q = from("journeys", "j")
      .select("j.id")
      .count("s.id", "steps_count")
      .leftJoin("steps", "s", "s.journey_id", "j.id")
      .where("j.visibility", "=", "public")
      .groupBy("j.id")
      .orderBy("j.id");

    const page = await q.paginate(db, { size: 10, offset: 0 });

    expect(page.total).toBe(3);
    expect(queries[1]).toEqual({
      text:
        'SELECT COUNT(*) AS "total" FROM (SELECT 1 FROM "journeys" AS "j" LEFT JOIN "steps" AS "s" ON "s"."journey_id" = "j"."id" ' +
        'WHERE "j"."visibility" = $1 GROUP BY "j"."id") AS "grouped"',
      params: ["public"],
    });
  });

  it("compte 0 si le comptage ne renvoie aucune ligne", async () => {
    const { db } = fakeDatabase(() => ({ rows: [], rowCount: 0 }));

    expect(
      (await from("journeys").paginate(db, { size: 10, offset: 0 })).total,
    ).toBe(0);
  });

  it.each([
    [0, 0],
    [10, -1],
    [1.5, 0],
  ])("refuse size %s et offset %s", async (size: number, offset: number) => {
    const { db } = fakeDatabase(() => ({ rows: [], rowCount: 0 }));

    await expect(
      from("journeys").paginate(db, { size, offset }),
    ).rejects.toThrow(QueryError);
  });
});
