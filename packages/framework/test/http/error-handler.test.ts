import { describe, expect, it } from "vitest";
import { toErrorResponse } from "../../src/http/error-handler.ts";
import { NotFoundError, TooManyRequestsError } from "../../src/http/errors.ts";

/** A logger that keeps what it receives, to check it in the test. */
function fakeLogger() {
    const entries: Record<string, unknown>[] = [];
    return { entries, log: (entry: Record<string, unknown>) => entries.push(entry) };
}

/** What node-postgres throws on a duplicate email: an Error with extra fields. */
function pgError() {
    return Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
        code: "23505",
        detail: "Key (email)=(alice@mail.com) already exists.",
    });
}

describe("toErrorResponse", () => {
    it("sends an HttpError as it is", () => {
        const { log } = fakeLogger();
        const response = toErrorResponse(new NotFoundError("Journey not found"), "production", log);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Journey not found", details: [] } });
    });

    it("keeps the extra headers of an HttpError", () => {
        const { log } = fakeLogger();

        expect(toErrorResponse(new TooManyRequestsError(30), "production", log).headers["retry-after"]).toBe("30");
    });

    it("hides a database error in production", () => {
        const { log } = fakeLogger();
        const response = toErrorResponse(pgError(), "production", log);
        const sent = JSON.stringify(response.body);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: { code: "INTERNAL_ERROR", message: "Internal server error", details: [] },
        });
        expect(sent.includes("duplicate")).toBe(false);
        expect(sent.includes("alice@mail.com")).toBe(false);
        expect(sent.includes("at ")).toBe(false); // no stack trace
    });

    it("shows what went wrong in development", () => {
        const { log } = fakeLogger();
        const response = toErrorResponse(new TypeError("x is undefined"), "development", log);

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body).includes("x is undefined")).toBe(true);
        expect(JSON.stringify(response.body).includes("TypeError")).toBe(true);
        expect(JSON.stringify(response.body).includes("error-handler.test")).toBe(true); // the stack points here
    });

    it("handles something thrown that is not an Error", () => {
        const { log } = fakeLogger();
        const response = toErrorResponse("oops", "development", log);

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body).includes("oops")).toBe(true);
    });

    it("always logs the error on the server side", () => {
        const { entries, log } = fakeLogger();

        toErrorResponse(pgError(), "production", log);
        toErrorResponse(new NotFoundError(), "production", log);

        expect(entries.length).toBe(2);
        expect(entries[0]?.["message"]).toBe('duplicate key value violates unique constraint "users_email_key"');
        expect(entries[1]?.["status"]).toBe(404);
    });
});
