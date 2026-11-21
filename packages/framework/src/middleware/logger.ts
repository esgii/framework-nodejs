import { HttpError } from "../http/errors.js";
import type { Context, HttpResponse, Middleware } from "../types.js";

/**
 * Écrit la ligne de journal d'une requête :
 *
 *   12ms 203.0.113.7 /journeys?page=2 curl/8.4.0 200 journeys.index
 *
 * Dans l'ordre : durée, IP, URL, agent utilisateur, statut, nom de la route.
 * Une information absente (pas d'URL, pas de user-agent, pas de route, route sans nom) s'écrit "-".
 */
function writeLine(ctx: Context, start: number, status: number): void {
    const url = ctx.req.url ?? "-";
    const userAgent = ctx.headers["user-agent"] ?? "-";
    const routeName = ctx.route?.name ?? "-";
    console.log(`${Date.now() - start}ms ${ctx.ip} ${url} ${userAgent} ${status} ${routeName}`);
}

/**
 * Journalise chaque requête sur une ligne (§ 2.5).
 * À placer en premier dans les middlewares globaux, pour mesurer toute la chaîne.
 */
export const logger = (): Middleware => async (ctx, next) => {
    // L'heure est notée avant next() : la suite de la chaîne n'a pas encore tourné.
    const start = Date.now();

    let response: HttpResponse;
    try {
        response = await next();
    } catch (error: unknown) {
        // Une erreur levée plus loin (404, 422…) traverse ce middleware sans réponse :
        // on écrit le statut qu'elle va donner (500 si ce n'est pas une HttpError),
        // puis on la relance vers le gestionnaire d'erreurs, qui fabriquera la réponse.
        writeLine(ctx, start, error instanceof HttpError ? error.status : 500);
        throw error;
    }

    // Après next() : la durée et le statut ne sont connus qu'une fois la réponse prête.
    writeLine(ctx, start, response.status);
    return response;
};
