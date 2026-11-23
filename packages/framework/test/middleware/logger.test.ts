import { IncomingMessage, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContext } from "../../src/http/context.js";
import { NotFoundError } from "../../src/index.js";
import { logger } from "../../src/index.js";
import type { Context, HttpResponse, ResolvedRoute } from "../../src/types.js";

/** Une fausse requête : l'URL et les en-têtes qu'on veut, sans serveur. */
function fakeRequest(url: string | undefined, headers: IncomingHttpHeaders = {}): IncomingMessage {
    const req = new IncomingMessage(new Socket());
    // undefined possible : le type de req.url l'autorise, le logger doit le gérer.
    req.url = url;
    req.headers = headers;
    return req;
}

const route: ResolvedRoute = { name: "journeys.index", path: "/journeys", version: "v1" };

/** Un contexte complet : l'IP vient de X-Forwarded-For (trustProxy à true). */
function fullContext(): Context {
    const req = fakeRequest("/journeys?page=2", {
        "user-agent": "curl/8.4.0",
        "x-forwarded-for": "203.0.113.7",
    });
    return buildContext(req, route, {}, true);
}

const ok = (status: number): HttpResponse => ({ status, headers: {}, body: null });

/** Remplace console.log par un espion muet, pour lire ce qui a été écrit. */
function spyLog() {
    return vi.spyOn(console, "log").mockImplementation(() => {});
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("logger", () => {
    it("écrit une ligne avec les 6 informations", async () => {
        const log = spyLog();

        await logger()(fullContext(), async () => ok(200));

        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\d+ms 203\.0\.113\.7 \/journeys\?page=2 curl\/8\.4\.0 200 journeys\.index$/));
    });

    it("mesure la durée entre l'avant et l'après de next()", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const log = spyLog();

        await logger()(fullContext(), async () => {
            // La suite de la chaîne prend 42 ms.
            vi.setSystemTime(1_042);
            return ok(200);
        });

        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^42ms /));
    });

    it("renvoie la réponse de la suite sans la modifier", async () => {
        spyLog();
        const response = ok(201);

        expect(await logger()(fullContext(), async () => response)).toBe(response);
    });

    it("écrit - quand le user-agent, la route ou l'URL manquent", async () => {
        const log = spyLog();
        const ctx = buildContext(fakeRequest(undefined), null);

        await logger()(ctx, async () => ok(404));

        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\d+ms {2}- - 404 -$/));
    });

    it("écrit - pour une route sans nom", async () => {
        const log = spyLog();
        const ctx = buildContext(fakeRequest("/status"), { name: null, path: "/status", version: "v1" });

        await logger()(ctx, async () => ok(200));

        expect(log).toHaveBeenCalledWith(expect.stringMatching(/ 200 -$/));
    });

    it("journalise une HttpError avec son statut, puis la relance", async () => {
        const log = spyLog();
        const error = new NotFoundError("Journey not found");

        await expect(
            logger()(fullContext(), async () => {
                throw error;
            }),
        ).rejects.toBe(error);

        expect(log).toHaveBeenCalledWith(expect.stringMatching(/ 404 journeys\.index$/));
    });

    it("journalise une erreur inconnue en 500, puis la relance", async () => {
        const log = spyLog();
        const error = new Error("panne");

        await expect(
            logger()(fullContext(), async () => {
                throw error;
            }),
        ).rejects.toBe(error);

        expect(log).toHaveBeenCalledWith(expect.stringMatching(/ 500 journeys\.index$/));
    });
});
