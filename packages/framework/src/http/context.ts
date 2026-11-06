import type { IncomingMessage } from "node:http";
import type { Context, ResolvedRoute } from "../types.ts";

/**
 * Returns the client IP.
 * Behind a trusted proxy (Traefik), it comes from the X-Forwarded-For header,
 * like "203.0.113.7, 10.0.0.1": the client is the first part.
 * Otherwise, it comes from the connection itself.
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
 * Builds the context from the client request: each piece of information
 * goes in its own field, so controllers and middlewares can use only what they need.
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

