import type { IncomingMessage } from "node:http";
import type { Context, ResolvedRoute } from "../types.ts";

/**
 * Renvoie l'IP du client.
 * Derrière un proxy de confiance (Traefik), elle vient de l'en-tête X-Forwarded-For,
 * par exemple "203.0.113.7, 10.0.0.1" : le client est la première partie.
 * Sinon, elle vient de la connexion elle-même.
 */
function getClientIp(req: IncomingMessage, trustProxy: boolean): string {
    if (trustProxy) {
        const header = req.headers["x-forwarded-for"];
        const value = Array.isArray(header) ? header[0] : header;
        const first = value?.split(",")[0]?.trim();
        if (first) {
            return first;
        }
    }
    return req.socket.remoteAddress ?? "";
}

/**
 * Construit le contexte à partir de la requête du client : chaque information
 * va dans sa propre case, pour que les contrôleurs et les middlewares ne prennent que ce dont ils ont besoin.
 */
export function buildContext(
    req: IncomingMessage,
    route: ResolvedRoute | null = null,
    params: Record<string, string> = {},
    trustProxy = false,
): Context {

    const url = new URL(req.url ?? "/", "http://localhost");

    return {
        req,
        params,
        query: url.searchParams,
        body: undefined,
        ip: getClientIp(req, trustProxy),
        version: route?.version ?? "",
        user: null,
        route,
        state: new Map(),
    };
}
