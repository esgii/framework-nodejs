import { IncomingMessage, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import type { CorsConfig } from "../../src/index.js";
import { buildContext } from "../../src/http/context.js";
import { toErrorResponse } from "../../src/http/error-handler.js";
import { ForbiddenError, NotFoundError } from "../../src/index.js";
import { cors } from "../../src/middleware/cors.js";
import type { Context, HttpResponse } from "../../src/types.js";

const SITE = "https://carnet.example.com";
const config: CorsConfig = { enabled: true, origins: [SITE] };

/** Le vrai gestionnaire d'erreurs, en production, sans écrire de logs. */
const onError = (error: unknown): HttpResponse => toErrorResponse(error, "production", () => {});

/** Un contexte avec la méthode et les en-têtes voulus. */
function context(method: string, headers: IncomingHttpHeaders): Context {
    const req = new IncomingMessage(new Socket());
    req.method = method;
    req.headers = headers;
    return buildContext(req);
}

const ok: HttpResponse = { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: [] };

describe("cors", () => {
    it("ajoute Access-Control-Allow-Origin pour une origine autorisée", async () => {
        const response = await cors(config, onError)(context("GET", { origin: SITE }), async () => ok);

        expect(response.status).toBe(200);
        expect(response.headers).toEqual({
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": SITE,
        });
    });

    it("refuse une origine absente de la liste avec une 403", async () => {
        let called = false;
        const run = cors(config, onError)(context("GET", { origin: "https://pirate.example" }), async () => {
            called = true;
            return ok;
        });

        await expect(run).rejects.toBeInstanceOf(ForbiddenError);
        // La requête refusée n'atteint jamais le contrôleur.
        expect(called).toBe(false);
    });

    it("répond 204 à la pré-vérification, sans appeler la suite", async () => {
        let called = false;
        const response = await cors(config, onError)(context("OPTIONS", { origin: SITE }), async () => {
            called = true;
            return ok;
        });

        expect(response).toEqual({
            status: 204,
            headers: {
                "access-control-allow-origin": SITE,
                "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "access-control-allow-headers": "Content-Type, Authorization",
            },
            body: null,
        });
        expect(called).toBe(false);
    });

    it("refuse aussi la pré-vérification d'une origine non autorisée", async () => {
        const run = cors(config, onError)(context("OPTIONS", { origin: "https://pirate.example" }), async () => ok);

        await expect(run).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("ajoute l'en-tête à une réponse d'erreur, pour que le site puisse la lire", async () => {
        const response = await cors(config, onError)(context("GET", { origin: SITE }), async () => {
            throw new NotFoundError("Journey not found");
        });

        expect(response.status).toBe(404);
        expect(response.headers["access-control-allow-origin"]).toBe(SITE);
    });

    it("laisse passer une requête sans Origin (curl, même site)", async () => {
        const response = await cors(config, onError)(context("GET", {}), async () => ok);

        expect(response).toBe(ok);
    });

    it("ne fait rien quand CORS est désactivé", async () => {
        const off: CorsConfig = { enabled: false, origins: [] };

        const response = await cors(off, onError)(context("GET", { origin: "https://pirate.example" }), async () => ok);

        expect(response).toBe(ok);
    });
});
