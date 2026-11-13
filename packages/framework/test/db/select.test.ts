import { describe, expect, it } from "vitest";
import { IdentifierError } from "../../src/db/identifiers.ts";
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
        expect(from("journeys").toSQL()).toEqual({ text: 'SELECT * FROM "journeys"', values: [] });
    });

    it("renomme une colonne avec un alias", () => {
        expect(from("users").select("id", ["display_name", "name"]).toSQL().text).toBe(
            'SELECT "id", "display_name" AS "name" FROM "users"',
        );
    });

    it("ajoute les colonnes de plusieurs appels à select", () => {
        expect(from("users").select("id").select("email").toSQL().text).toBe('SELECT "id", "email" FROM "users"');
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
        expect(from("users").where("age", operator, 18).toSQL().text).toBe(`SELECT * FROM "users" WHERE ${sql}`);
    });

    it("relie les conditions par AND, ou par OR avec orWhere", () => {
        const q = from("journeys").where("visibility", "=", "public").orWhere("author_id", "=", 7);

        expect(q.toSQL()).toEqual({
            text: 'SELECT * FROM "journeys" WHERE "visibility" = $1 OR "author_id" = $2',
            values: ["public", 7],
        });
    });

    it("écrit IS NULL et IS NOT NULL sans valeur", () => {
        const q = from("journeys").whereNull("deleted_at").whereNotNull("published_at");

        expect(q.toSQL()).toEqual({
            text: 'SELECT * FROM "journeys" WHERE "deleted_at" IS NULL AND "published_at" IS NOT NULL',
            values: [],
        });
    });

    it("ne renvoie aucune ligne pour un IN vide, au lieu d'un SQL invalide", () => {
        expect(from("journeys").whereIn("id", []).toSQL().text).toBe('SELECT * FROM "journeys" WHERE FALSE');
    });

    it("met un groupe entre parenthèses, en numérotant les valeurs à la suite", () => {
        const q = from("journeys", "j")
            .where("j.visibility", "=", "public")
            .whereGroup((g) => g.where("j.title", "ilike", "%rome%").orWhere("j.summary", "ilike", "%rome%"));

        expect(q.toSQL()).toEqual({
            text: 'SELECT * FROM "journeys" AS "j" WHERE "j"."visibility" = $1 AND ("j"."title" ILIKE $2 OR "j"."summary" ILIKE $3)',
            values: ["public", "%rome%", "%rome%"],
        });
    });

    it("relie un groupe par OR avec orWhereGroup", () => {
        const q = from("journeys")
            .where("author_id", "=", 7)
            .orWhereGroup((g) => g.where("visibility", "=", "public").whereNotNull("published_at"));

        expect(q.toSQL().text).toBe(
            'SELECT * FROM "journeys" WHERE "author_id" = $1 OR ("visibility" = $2 AND "published_at" IS NOT NULL)',
        );
    });

    it("ignore un groupe vide", () => {
        expect(from("journeys").whereGroup((g) => g).toSQL().text).toBe('SELECT * FROM "journeys"');
    });

    it("commence par un groupe sans AND devant", () => {
        expect(from("journeys").whereGroup((g) => g.where("id", "=", 1)).toSQL().text).toBe(
            'SELECT * FROM "journeys" WHERE ("id" = $1)',
        );
    });
});

describe("sécurité", () => {
    it("ne met jamais une valeur dans le texte SQL", () => {
        const evil = "'; DROP TABLE users; --";
        const { text, values } = from("users").where("email", "=", evil).toSQL();

        expect(text.includes("DROP")).toBe(false);
        expect(values).toEqual([evil]);
    });

    it.each(["name; DROP TABLE users", 'title" OR 1=1 --'])("refuse la colonne %s", (column: string) => {
        expect(() => from("users").where(column, "=", 1)).toThrow(IdentifierError);
        expect(() => from("users").select(column)).toThrow(IdentifierError);
    });

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

        expect(base.toSQL().text).toBe('SELECT * FROM "journeys" WHERE "visibility" = $1');
        expect(mine.toSQL().text).toBe('SELECT * FROM "journeys" WHERE "visibility" = $1 AND "author_id" = $2');
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
    ] as const)("%s produit un %s sur deux colonnes", (method: "join" | "leftJoin" | "rightJoin" | "fullJoin", sql: string) => {
        const q = from("journeys", "j")[method]("steps", "s", "j.id", "s.journey_id");

        expect(q.toSQL()).toEqual({
            text: `SELECT * FROM "journeys" AS "j" ${sql} "steps" AS "s" ON "j"."id" = "s"."journey_id"`,
            values: [],
        });
    });

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
    ])("refuse la jointure %s %s %s %s", (table: string, alias: string, left: string, right: string) => {
        expect(() => from("journeys", "j").join(table, alias, left, right)).toThrow(IdentifierError);
    });

    it("ne modifie pas la requête de départ", () => {
        const base = from("journeys", "j");
        base.join("users", "u", "j.author_id", "u.id");

        expect(base.toSQL().text).toBe('SELECT * FROM "journeys" AS "j"');
    });
});
