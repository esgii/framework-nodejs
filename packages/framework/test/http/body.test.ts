import { IncomingMessage, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { readBody } from "../../src/http/body.js";
import { BadRequestError, PayloadTooLargeError } from "../../src/index.js";

const JSON_TYPE = { "content-type": "application/json" };

/** Une fausse requête qui envoie les morceaux donnés, puis se termine. */
function fakeRequest(headers: IncomingHttpHeaders, chunks: string[]): IncomingMessage {
    const req = new IncomingMessage(new Socket());
    req.headers = headers;
    for (const chunk of chunks) {
        req.push(Buffer.from(chunk));
    }
    req.push(null);
    return req;
}

describe("readBody", () => {
    it("lit et analyse un corps JSON", async () => {
        const req = fakeRequest(JSON_TYPE, ['{"title":"Lisbonne"}']);

        expect(await readBody(req, 1_000)).toEqual({ title: "Lisbonne" });
    });

    it("assemble un corps arrivé en plusieurs morceaux", async () => {
        const req = fakeRequest(JSON_TYPE, ['{"title":', '"Por', 'to"}']);

        expect(await readBody(req, 1_000)).toEqual({ title: "Porto" });
    });

    it("accepte un Content-Type avec charset", async () => {
        const req = fakeRequest({ "content-type": "Application/JSON; charset=utf-8" }, ["[1,2]"]);

        expect(await readBody(req, 1_000)).toEqual([1, 2]);
    });

    it("accepte un corps de exactement la taille maximale", async () => {
        // '{"a":1}' fait 7 octets.
        const req = fakeRequest(JSON_TYPE, ['{"a":1}']);

        expect(await readBody(req, 7)).toEqual({ a: 1 });
    });

    it("refuse un corps trop gros avec une 413", async () => {
        const req = fakeRequest(JSON_TYPE, ['{"a":12}']);

        await expect(readBody(req, 7)).rejects.toBeInstanceOf(PayloadTooLargeError);
    });

    it("ignore les morceaux qui arrivent après le dépassement", async () => {
        const req = fakeRequest(JSON_TYPE, ["12345", "67890", "abcde"]);

        await expect(readBody(req, 6)).rejects.toBeInstanceOf(PayloadTooLargeError);
    });

    it("refuse un JSON invalide avec une 400", async () => {
        const req = fakeRequest(JSON_TYPE, ["{title:"]);

        await expect(readBody(req, 1_000)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("renvoie undefined pour un corps JSON vide", async () => {
        const req = fakeRequest(JSON_TYPE, []);

        expect(await readBody(req, 1_000)).toBeUndefined();
    });

    it("ne lit pas un corps qui n'est pas du JSON", async () => {
        const req = fakeRequest({ "content-type": "multipart/form-data; boundary=x" }, ["fichier"]);

        expect(await readBody(req, 1_000)).toBeUndefined();
        // Le flux n'a pas été consommé : le téléversement pourra le lire.
        expect(req.readableEnded).toBe(false);
    });

    it("ne lit pas un corps sans Content-Type", async () => {
        const req = fakeRequest({}, ['{"a":1}']);

        expect(await readBody(req, 1_000)).toBeUndefined();
    });

    it("échoue si la connexion est coupée pendant la lecture", async () => {
        const req = new IncomingMessage(new Socket());
        req.headers = JSON_TYPE;
        const reading = readBody(req, 1_000);

        req.destroy(new Error("connexion perdue"));

        await expect(reading).rejects.toThrow("connexion perdue");
    });
});
