// Ces tests importent uniquement depuis index.ts, comme le fait l'app.
// Les autres tests importent les fichiers internes : ils ne voient donc pas
// qu'une fonction a été oubliée dans les exports publics.
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
  registerSerializer,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
  UnsupportedMediaTypeError,
} from "../../src/index.ts";
import { serializers } from "../../src/http/serializers.ts";

describe("public API", () => {
  it("lets the app add a format (CTL-04)", () => {
    registerSerializer("text/csv", (body) => (Array.isArray(body) ? body.join(",") : ""));

    const out = serializers.serialize({
      status: 200,
      headers: { "content-type": "text/csv" },
      body: ["Rome", "Paris"],
    });

    expect(out).toBe("Rome,Paris");
  });

  it("lets the app throw every useful HTTP error (CTL-07)", () => {
    const errors: HttpError[] = [
      new BadRequestError(),
      new UnauthorizedError(),
      new ForbiddenError(),
      new NotFoundError(),
      new MethodNotAllowedError(["GET"]),
      new ConflictError(),
      new PayloadTooLargeError(),
      new UnsupportedMediaTypeError(),
      new UnprocessableError([]),
      new TooManyRequestsError(1),
      new InternalError(),
    ];

    expect(errors.every((e) => e instanceof HttpError)).toBe(true);
    expect(errors.map((e) => e.status)).toEqual([400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500]);
  });
});
