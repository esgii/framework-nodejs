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

/** L'adresse demandée, découpée : le chemin pour le routeur, la query pour le contrôleur. */
export interface RequestTarget {
    /** "/journeys/3" : sans la query string, encore encodé (le routeur décode les paramètres). */
    readonly path: string;
    /** "?lang=fr&tag=a&tag=b" lu comme une collection : get, getAll, has. */
    readonly query: URLSearchParams;
}

/**
 * Découpe req.url ("/journeys/3?lang=fr") avec l'objet URL intégré à Node.
 * Personne d'autre ne découpe la chaîne à la main : ni le routeur, ni les contrôleurs.
 *
 * L'adresse est collée derrière "http://localhost" plutôt que passée comme base :
 * avec une base, "//evil.com/a" serait lu comme un autre domaine et le chemin deviendrait "/a".
 * Une adresse qui ne commence pas par "/" (ex. "*" pour OPTIONS *) est traitée comme "/".
 */
export function parseTarget(url: string | undefined): RequestTarget {
    const safe = url?.startsWith("/") ? url : "/";
    const parsed = new URL(`http://localhost${safe}`);
    return { path: parsed.pathname, query: parsed.searchParams };
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
    body: unknown = undefined,
): Context {
    return {
        req,
        params,
        query: parseTarget(req.url).query,
        headers: req.headers,
        body,
        ip: getClientIp(req, trustProxy),
        version: route?.version ?? "",
        user: null,
        route,
        state: new Map(),
    };
}
