import { describe, expect, it } from "vitest";
import {
    IdentifierError,
    UnknownSortKeyError,
    defineTable,
    quoteIdent,
    sortColumn,
    type Table,
} from "../../src/db/identifiers.ts";

describe("quoteIdent", () => {
    it("entoure un nom de guillemets doubles", () => {
        expect(quoteIdent("journeys")).toBe('"journeys"');
    });

    it("accepte un nom préfixé par sa table", () => {
        expect(quoteIdent("j.created_at")).toBe('"j"."created_at"');
    });

    it("accepte un nom de 63 caractères, la limite de PostgreSQL", () => {
        expect(quoteIdent("a".repeat(63))).toBe(`"${"a".repeat(63)}"`);
    });

    it.each([
        "name; DROP TABLE users",
        'title" OR 1=1 --',
        "Title",
        "1column",
        "",
        "j..created_at",
        "a".repeat(64),
    ])("refuse %s", (name: string) => {
        expect(() => quoteIdent(name)).toThrow(IdentifierError);
    });
});

describe("defineTable", () => {
    const journeys = defineTable("journeys", ["id", "title", "created_at"]);

    it("donne le nom de la table entre guillemets", () => {
        expect(journeys.ref).toBe('"journeys"');
    });

    it("donne une colonne préfixée par sa table", () => {
        expect(journeys.column("created_at")).toBe('"journeys"."created_at"');
    });

    it("refuse à l'exécution une colonne qui n'est pas déclarée", () => {
        // Sans types, comme un appel venu d'un code JavaScript : TypeScript ne protège plus.
        const untyped: Table<string> = journeys;

        expect(() => untyped.column("password")).toThrow(IdentifierError);
    });

    it("refuse un nom de table invalide dès la déclaration", () => {
        expect(() => defineTable("users; --", ["id"])).toThrow(IdentifierError);
    });

    it("refuse un nom de colonne invalide dès la déclaration", () => {
        expect(() => defineTable("users", ["id", "Email"])).toThrow(IdentifierError);
    });
});

describe("sortColumn", () => {
    const sorts = { created: "j.created_at", steps: "step_count" };

    it("traduit une clé connue en colonne SQL", () => {
        expect(sortColumn("created", sorts)).toBe('"j"."created_at"');
        expect(sortColumn("steps", sorts)).toBe('"step_count"');
    });

    it("refuse une injection dans la clé de tri", () => {
        expect(() => sortColumn("name; DROP TABLE users", sorts)).toThrow(UnknownSortKeyError);
    });

    it("refuse le nom d'une vraie colonne qui n'est pas dans la table de correspondance", () => {
        expect(() => sortColumn("j.created_at", sorts)).toThrow(UnknownSortKeyError);
    });

    it.each(["constructor", "__proto__", "toString"])("ignore la clé héritée %s", (key: string) => {
        expect(() => sortColumn(key, sorts)).toThrow(UnknownSortKeyError);
    });

    it("indique la clé refusée et les clés possibles", () => {
        let caught: unknown;
        try {
            sortColumn("price", sorts);
        } catch (error: unknown) {
            caught = error;
        }

        expect(caught instanceof UnknownSortKeyError).toBe(true);
        if (!(caught instanceof UnknownSortKeyError)) return; // affine le type pour TypeScript, sans « as »
        expect(caught.key).toBe("price");
        expect(caught.allowed).toEqual(["created", "steps"]);
    });

    it("refuse une colonne invalide écrite par erreur dans le code", () => {
        expect(() => sortColumn("bad", { bad: "drop table" })).toThrow(IdentifierError);
    });
});
