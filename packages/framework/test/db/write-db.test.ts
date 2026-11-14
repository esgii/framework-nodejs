import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../../src/db/connection.ts";
import { quoteIdent } from "../../src/db/identifiers.ts";
import { from } from "../../src/db/select.ts";
import { deleteFrom, insert, update } from "../../src/db/write.ts";

/** La base de test, séparée de la base de développement (voir connection.test.ts). */
const TEST_URL =
    process.env["TEST_DATABASE_URL"] ?? "postgres://carnet:carnet@localhost:5433/carnet_test";

/** Une table propre à ce fichier et à ce processus, supprimée à la fin. */
const TABLE = `write_${process.pid}`;
let db: Database;

beforeAll(async () => {
    db = createDatabase(TEST_URL, () => {});
    await db.query(
        `CREATE TABLE ${quoteIdent(TABLE)} (id serial PRIMARY KEY, email text NOT NULL, name text)`,
    );
});

// Les tests tournent dans un ordre aléatoire : chacun part d'une table vide.
beforeEach(async () => {
    await db.query(`TRUNCATE TABLE ${quoteIdent(TABLE)} RESTART IDENTITY`);
});

afterAll(async () => {
    await db.query(`DROP TABLE IF EXISTS ${quoteIdent(TABLE)}`);
    await db.close();
});

describe("écriture sur une vraie base", () => {
    it("insère puis relit les lignes, avec RETURNING", async () => {
        const inserted = await insert(TABLE, [
            { email: "ada@carnet.fr", name: "Ada" },
            { email: "alan@carnet.fr", name: null },
        ])
            .returning("id", "email")
            .run(db);

        expect(inserted.rowCount).toBe(2);
        expect(inserted.rows.map((row) => row["email"])).toEqual(["ada@carnet.fr", "alan@carnet.fr"]);

        const read = from(TABLE).select("email", "name").where("email", "like", "%@carnet.fr").orderBy("email").toSQL();
        const { rows } = await db.query(read.text, [...read.values]);
        expect(rows).toEqual([
            { email: "ada@carnet.fr", name: "Ada" },
            { email: "alan@carnet.fr", name: null },
        ]);
    });

    it("modifie seulement les lignes du WHERE", async () => {
        await insert(TABLE, { email: "update@carnet.fr", name: "Avant" }).run(db);

        const updated = await update(TABLE).set({ name: "Après" }).where("email", "=", "update@carnet.fr").returning("name").run(db);

        expect(updated.rowCount).toBe(1);
        expect(updated.rows).toEqual([{ name: "Après" }]);
    });

    it("supprime seulement les lignes du WHERE", async () => {
        await insert(TABLE, [{ email: "gone@carnet.fr" }, { email: "kept@carnet.fr" }]).run(db);

        const deleted = await deleteFrom(TABLE).where("email", "=", "gone@carnet.fr").run(db);
        const read = from(TABLE).whereIn("email", ["gone@carnet.fr", "kept@carnet.fr"]).toSQL();
        const { rows } = await db.query(read.text, [...read.values]);

        expect(deleted.rowCount).toBe(1);
        expect(rows.map((row) => row["email"])).toEqual(["kept@carnet.fr"]);
    });
});
