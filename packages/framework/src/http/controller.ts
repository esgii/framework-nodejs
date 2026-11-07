import type { Context, HttpResponse } from "../types.ts";


/** Checks the result of a controller: true if it is an HttpResponse, false otherwise. */
export function isHttpResponse(value: unknown): value is HttpResponse {
    return (
        typeof value === "object" &&
        value !== null &&
        "status" in value &&
        typeof value.status === "number" &&
        "headers" in value &&
        typeof value.headers === "object" &&
        value.headers !== null &&
        "body" in value
    );
}

/**
 * Runs a controller (sync or async) and checks that it returned a real HttpResponse.
 * Accepts any function: routes store controllers as Controller<never, never>,
 * and at runtime a buggy controller can return anything.
 */
export async function runController(
    controller: (ctx: never) => unknown,
    ctx: Context,
): Promise<HttpResponse> {
    const call = controller as (ctx: Context) => unknown;
    const result = await call(ctx);
    if (!isHttpResponse(result)) {
        throw new Error("Controller must return an HttpResponse { status, headers, body }");
    }
    return result;
}

