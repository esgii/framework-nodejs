import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { toErrorResponse } from "../../src/http/error-handler.js";
import { buildContext } from "../../src/http/context.js";
import { NotFoundError } from "../../src/http/errors.js";
import { securityHeaders } from "../../src/middleware/security-headers.js";
import type { HttpResponse } from "../../src/types.js";

const HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
};

const ctx = buildContext(new IncomingMessage(new Socket()));

/** Le vrai gestionnaire d'erreurs, en production, sans écrire de logs. */
const onError = (error: unknown): HttpResponse => toErrorResponse(error, "production", () => {});

const ok: HttpResponse = {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: { ok: true },
};

describe("securityHeaders", () => {
    it("ajoute les en-têtes de la config à une réponse normale", async () => {
        const response = await securityHeaders(HEADERS, onError)(ctx, async () => ok);

        expect(response.headers).toEqual({
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "content-type": "application/json; charset=utf-8",
        });
    });

    it("garde le statut et le corps de la réponse", async () => {
        const response = await securityHeaders(HEADERS, onError)(ctx, async () => ok);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
    });

    it("ne modifie pas la réponse d'origine", async () => {
        const original: HttpResponse = { status: 200, headers: {}, body: null };

        await securityHeaders(HEADERS, onError)(ctx, async () => original);

        expect(original.headers).toEqual({});
    });

    it("ajoute aussi les en-têtes à une réponse d'erreur", async () => {
        const response = await securityHeaders(HEADERS, onError)(ctx, async () => {
            throw new NotFoundError("Journey not found");
        });

        expect(response.status).toBe(404);
        expect(response.headers["x-frame-options"]).toBe("DENY");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("ajoute aussi les en-têtes à une erreur inconnue (500)", async () => {
        const response = await securityHeaders(HEADERS, onError)(ctx, async () => {
            throw new Error("panne");
        });

        expect(response.status).toBe(500);
        expect(response.headers["x-frame-options"]).toBe("DENY");
    });

    it("laisse une route fixer elle-même un de ces en-têtes", async () => {
        const own: HttpResponse = { status: 200, headers: { "x-frame-options": "SAMEORIGIN" }, body: null };

        const response = await securityHeaders(HEADERS, onError)(ctx, async () => own);

        expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });

    it("ne change rien sans en-tête dans la config", async () => {
        const response = await securityHeaders({}, onError)(ctx, async () => ok);

        expect(response.headers).toEqual(ok.headers);
    });
});
