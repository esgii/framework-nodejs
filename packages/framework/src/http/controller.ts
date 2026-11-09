import type { Context, HttpResponse } from "../types.ts";

/**
 * Exécute un contrôleur (synchrone ou asynchrone) et vérifie qu'il a renvoyé une vraie HttpResponse.
 * Accepte n'importe quelle fonction : les routes rangent les contrôleurs en Controller<never, never>,
 * et à l'exécution, un contrôleur bogué peut renvoyer n'importe quoi.
 */
export async function runController(
    controller: (ctx: never) => unknown,
    ctx: Context,
): Promise<HttpResponse> {
    // Le seul cast du framework : le routeur a associé ce contrôleur à cette
    // requête, donc le contexte qu'il a construit est celui que le contrôleur attend.
    const call = controller as (ctx: Context) => unknown;
    const result = await call(ctx);
    if (!isHttpResponse(result)) {
        // Un bug dans le contrôleur : le gestionnaire d'erreurs le transforme en 500.
        throw new Error("Controller must return an HttpResponse { status, headers, body }");
    }
    return result;
}

/** Vérifie, pendant l'exécution, qu'une valeur a bien la forme d'une HttpResponse. */
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
