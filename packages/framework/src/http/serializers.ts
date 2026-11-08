import { Readable } from "node:stream";
import type { HttpResponse } from "../types.ts";

export type SerializerFn = (body: unknown) => string | Buffer;

export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function mediaType(value: string): string {
    const index = value.indexOf(";");
    return (index === -1 ? value : value.slice(0, index)).trim().toLowerCase();
}

/**
 * Creates a registry of serializers, keyed by content type.
 * JSON, plain text and HTML are registered; anyone can add a format
 * (XML, CSV...) with register(), without touching the framework.
 */
export function createSerializerRegistry() {
    const serializers = new Map<string, SerializerFn>();

    function register(contentType: string, fn: SerializerFn): void {
        serializers.set(mediaType(contentType), fn);
    }

    /** Turns the body of a response into a string, a Buffer, or a stream to pipe. */
    function serialize(response: HttpResponse): string | Buffer | Readable {
        const { body } = response;
        if (body === null || body === undefined) {
            return "";
        }
        if (body instanceof Readable || Buffer.isBuffer(body)) {
            return body;
        }
        const type = mediaType(response.headers["content-type"] ?? JSON_CONTENT_TYPE);
        const fn = serializers.get(type);
        if (fn === undefined) {
            throw new Error(`No serializer registered for "${type}"`);
        }
        return fn(body);
    }

    register("application/json", (body) => JSON.stringify(body));
    register("text/plain", (body) => String(body));
    register("text/html", (body) => String(body));

    return { register, serialize };
}

/** The registry used by the framework. */
export const serializers = createSerializerRegistry();
export const registerSerializer = serializers.register;
