/**
 * Vérification du contrat (SET-08) : jamais exécuté, ce fichier doit seulement compiler.
 */
import type { Controller, Middleware, RouteDefinition, Schema } from "@carnet/framework";

// Un schéma écrit à la main, en attendant le vrai validateur.
const titleSchema: Schema<{ title: string }> = {
    parse(input) {
        if (typeof input === "object" && input !== null && "title" in input && typeof input.title === "string") {
            return { ok: true, value: { title: input.title } };
        }
        return { ok: false, errors: [{ field: "title", message: "Title is required", code: "required" }] };
    },
};

// Un contrôleur : il reçoit le contexte et renvoie une réponse.
const showJourney: Controller = async ({ params }) => {
    return { status: 200, headers: {}, body: { id: params["id"] } };
};

// Un middleware qui arrête la chaîne s'il n'y a pas de jeton.
const auth: Middleware = async (ctx, next) => {
    if (ctx.req.headers.authorization === undefined) {
        return { status: 401, headers: {}, body: { error: "unauthenticated" } };
    }
    ctx.user = { id: "1", role: "user" };
    return next();
};

// Un middleware qui agit après le contrôleur (l'oignon).
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

// Un contrôleur avec des params typés et un body validé rentre aussi dans une route.
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

export { route, titleSchema, typedRoute };
