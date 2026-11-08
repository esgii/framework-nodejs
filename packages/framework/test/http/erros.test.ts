import { describe, expect, it } from "vitest";
import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    HttpError,
    InternalError,
    MethodNotAllowedError,
    NotFoundError,
    PayloadTooLargeError,
    TooManyRequestsError,
    UnauthorizedError,
    UnprocessableError,
    UnsupportedMediaTypeError,
} from "../../src/http/errors.ts";

describe("error classes", () => {
    it.each([
        [new BadRequestError(), 400, "BAD_REQUEST"],
        [new UnauthorizedError(), 401, "UNAUTHORIZED"],
        [new ForbiddenError(), 403, "FORBIDDEN"],
        [new NotFoundError(), 404, "NOT_FOUND"],
        [new MethodNotAllowedError(["GET"]), 405, "METHOD_NOT_ALLOWED"],
        [new ConflictError(), 409, "CONFLICT"],
        [new PayloadTooLargeError(), 413, "PAYLOAD_TOO_LARGE"],
        [new UnsupportedMediaTypeError(), 415, "UNSUPPORTED_MEDIA_TYPE"],
        [new UnprocessableError([]), 422, "VALIDATION_FAILED"],
        [new TooManyRequestsError(60), 429, "TOO_MANY_REQUESTS"],
        [new InternalError(), 500, "INTERNAL_ERROR"],
    ])("%s has the right status and code", (error: HttpError, status: number, code: string) => {
        expect(error.status).toBe(status);
        expect(error.code).toBe(code);
        expect(error instanceof HttpError).toBe(true);
        expect(error instanceof Error).toBe(true);
    });

    it("keeps a custom message", () => {
        expect(new NotFoundError("Journey not found").message).toBe("Journey not found");
    });

    it("names the error after its class, for the logs", () => {
        expect(new NotFoundError().name).toBe("NotFoundError");
    });
});

describe("toResponse", () => {
    it("uses the single error format", () => {
        expect(new NotFoundError("Journey not found").toResponse()).toEqual({
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
            body: { error: { code: "NOT_FOUND", message: "Journey not found", details: [] } },
        });
    });

    it("lists the invalid fields for a 422", () => {
        const details = [{ field: "title", message: "Title is required" }];

        expect(new UnprocessableError(details).toResponse().body).toEqual({
            error: { code: "VALIDATION_FAILED", message: "Validation failed", details },
        });
    });

    it("keeps the details of a 400", () => {
        const details = [{ field: "body", message: "Invalid JSON" }];

        expect(new BadRequestError("Bad JSON", details).details).toEqual(details);
    });

    it("sends the Allow header with a 405", () => {
        expect(new MethodNotAllowedError(["GET", "POST"]).toResponse().headers["allow"]).toBe("GET, POST");
    });

    it("sends the Retry-After header with a 429", () => {
        expect(new TooManyRequestsError(30).toResponse().headers["retry-after"]).toBe("30");
    });

    it("can be built directly for any other status", () => {
        const error = new HttpError(418, "TEAPOT", "I'm a teapot");

        expect(error.toResponse().status).toBe(418);
        expect(error.details).toEqual([]);
    });
});
