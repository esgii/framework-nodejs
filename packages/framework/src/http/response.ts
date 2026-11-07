import type { Readable } from "node:stream";
import type { HttpResponse } from "../types.ts";

// Helpers used by controllers to build responses.
// Each call returns a new object: two responses never share their headers.
// The Content-Type tells the sender how to write the body.

export function json(body: unknown, status = 200): HttpResponse {
    return { status, headers: { "content-type": "application/json; charset=utf-8" }, body };
}

export function created(body: unknown, location?: string): HttpResponse {
    const response = json(body, 201);
    if (location !== undefined) {
        response.headers["location"] = location;
    }
    return response;
}

export function noContent(): HttpResponse {
    return { status: 204, headers: {}, body: null };
}

export function text(content: string, status = 200): HttpResponse {
    return { status, headers: { "content-type": "text/plain; charset=utf-8" }, body: content };
}

export function html(content: string, status = 200): HttpResponse {
    return { status, headers: { "content-type": "text/html; charset=utf-8" }, body: content };
}

export function stream(readable: Readable, contentType: string): HttpResponse {
    return { status: 200, headers: { "content-type": contentType }, body: readable };
}

export function redirect(url: string, status = 302): HttpResponse {
    return { status, headers: { location: url }, body: null };
}
