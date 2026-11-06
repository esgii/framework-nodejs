/**
 * Contract check (SET-08): never executed, it only has to compile.
 */
import type {Controller, HttpError, Middleware, QueryParams, RouteDefinition, Schema} from "@carnet/framework";

// A schema written by hand, until the real validator exists.
const titleSchema: Schema<{ title: string }> = {
    parse(input) {
        if (typeof input === "object" && input !== null && "title" in input && typeof input.title === "string") {
            return { ok: true, value: { title: input.title } };
        }
        return { ok: false, errors: [{ field: "title", message: "Title is required" }] };
    },
};

// A controller: receives the context, returns a response.
const showJourney: Controller = async ({ params }) => {
    return { status: 200, headers: {}, body: { id: params["id"] } };
};

// A middleware that stops the chain if there is no token.
const auth: Middleware = async (ctx, next) => {
    if (ctx.req.headers.authorization === undefined) {
        return { status: 401, headers: {}, body: { error: "unauthenticated" } };
    }
    ctx.user = { id: "1", role: "user" };
    return next();
};

// A middleware that acts after the controller (onion).
const timing: Middleware = async (_ctx, next) => {
    const start = Date.now();
    const res = await next();
    res.headers["X-Response-Time"] = `${Date.now() - start}ms`;
    return res;
};

const route: RouteDefinition = {
    method: "GET",
    path: "/v1/journeys/{id}",
    version: "v1",
    name: "journeys.show",
    middlewares: [timing, auth],
    controller: showJourney,
};
// A controller with typed params and a validated body also fits in a route.
const updateJourney: Controller<{ id: string }, { title: string }> = ({ params, body }) => {
    return { status: 200, headers: {}, body: { id: params.id, title: body.title } };
};

const typedRoute: RouteDefinition = {
    method: "PUT",
    path: "/v1/journeys/{id}",
    version: "v1",
    name: "journeys.update",
    middlewares: [auth],
    controller: updateJourney,
};

// URLSearchParams fits QueryParams as is.
const query: QueryParams = new URLSearchParams("email=a@b.c");

// The single error format.
const notFound: HttpError = { status: 404, code: "not_found", message: "Journey not found", details: [] };

export { route, titleSchema, typedRoute };
