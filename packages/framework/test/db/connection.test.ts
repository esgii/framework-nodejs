import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../../src/db/connection.ts";

/**
 * La base de test, séparée de la base de développement.
 * Par défaut : le conteneur Docker décrit dans la MR (port 5433).
 */
const TEST_URL =
    process.env["TEST_DATABASE_URL"] ?? "postgres://carnet:carnet@localhost:5433/carnet_test";

/** Les bases ouvertes par un test, fermées après lui : aucun test n'hérite d'un autre. */
const opened: Database[] = [];

function open(url = TEST_URL, onError = (_error: Error): void => {}): Database {
    const db = createDatabase(url, onError);
    opened.push(db);
    return db;
}

afterEach(async () => {
    await Promise.all(opened.splice(0).map((db) => db.close()));
});

describe("createDatabase", () => {
    it("répond au ping sur la base de test", async () => {
        await expect(open().ping()).resolves.toBeUndefined();
    });

    it("renvoie les lignes et leur nombre", async () => {
        const result = await open().query("SELECT $1::int + 1 AS n", [41]);

        expect(result.rows).toEqual([{ n: 42 }]);
        expect(result.rowCount).toBe(1);
    });

    it("lie les valeurs au lieu de les coller dans le SQL", async () => {
        const evil = "'; DROP TABLE users; --";
        const result = await open().query("SELECT $1::text AS value", [evil]);

        expect(result.rows).toEqual([{ value: evil }]);
    });

    it("accepte une commande sans paramètres qui ne compte pas de lignes", async () => {
        const result = await open().query("SET application_name = 'carnet-test'");

        expect(result.rows).toEqual([]);
        expect(result.rowCount).toBe(0);
    });

    it("se ferme sans erreur, même appelée plusieurs fois", async () => {
        const db = open();
        await db.ping();

        await db.close();
        await expect(db.close()).resolves.toBeUndefined();
    });

    it("se ferme sans erreur, même appelée deux fois en même temps", async () => {
        const db = open();

        await expect(Promise.all([db.close(), db.close()])).resolves.toEqual([undefined, undefined]);
    });

    it("refuse de servir après la fermeture", async () => {
        const db = open();
        await db.close();

        await expect(db.query("SELECT 1")).rejects.toThrow();
    });

    it("échoue au ping si la base est injoignable", async () => {
        await expect(open("postgres://carnet:carnet@127.0.0.1:1/none").ping()).rejects.toThrow();
    });

    it("survit à une connexion coupée par la base", async () => {
        const errors: Error[] = [];
        const name = `carnet-killed-${process.pid}`;
        const url = new URL(TEST_URL);
        url.searchParams.set("application_name", name);
        const db = open(url.toString(), (error) => errors.push(error));
        await db.ping(); // ouvre une connexion, qui reste ensuite inactive dans le pool

        // Une autre connexion coupe la première, comme un redémarrage de PostgreSQL.
        await open().query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1",
            [name],
        );

        await vi.waitFor(() => expect(errors.length).toBe(1));
    });
});
