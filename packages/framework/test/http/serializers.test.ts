import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createSerializerRegistry } from "../../src/http/serializers.ts";
import type { HttpResponse } from "../../src/types.ts";

/** A response with a given content type, as a controller would return it. */
function response(body: unknown, contentType?: string): HttpResponse {
    return { status: 200, headers: contentType === undefined ? {} : { "content-type": contentType }, body };
}

function toXml(body: unknown): string {
    if (typeof body !== "object" || body === null) {
        return "<root/>";
    }
    const tags = Object.entries(body).map(([key, value]) => `<${key}>${String(value)}</${key}>`);
    return `<root>${tags.join("")}</root>`;
}

describe("serialize", () => {
    it("uses JSON when no content type is given", () => {
        expect(createSerializerRegistry().serialize(response({ a: 1 }))).toBe('{"a":1}');
    });

    it("ignores the charset when looking up the content type", () => {
        const registry = createSerializerRegistry();

        expect(registry.serialize(response({ a: 1 }, "application/json; charset=utf-8"))).toBe('{"a":1}');
    });

    it("writes text and HTML as they are", () => {
        const registry = createSerializerRegistry();

        expect(registry.serialize(response("hello", "text/plain"))).toBe("hello");
        expect(registry.serialize(response("<p>hi</p>", "text/html"))).toBe("<p>hi</p>");
    });

    it("writes nothing for an empty body", () => {
        const registry = createSerializerRegistry();

        expect(registry.serialize(response(null))).toBe("");
        expect(registry.serialize(response(undefined))).toBe("");
    });

    it("keeps streams and buffers as they are", () => {
        const registry = createSerializerRegistry();
        const readable = Readable.from(["chunk"]);
        const buffer = Buffer.from("bytes");

        expect(registry.serialize(response(readable, "image/png"))).toBe(readable);
        expect(registry.serialize(response(buffer, "image/png"))).toBe(buffer);
    });

    it("throws for a format nobody registered", () => {
        expect(() => createSerializerRegistry().serialize(response({ a: 1 }, "application/xml"))).toThrow(
            'No serializer registered for "application/xml"',
        );
    });

    it("accepts a new format without changing the framework", () => {
        const registry = createSerializerRegistry();
        registry.register("application/xml", toXml);

        expect(registry.serialize(response({ city: "Rome", days: 3 }, "application/xml"))).toBe(
            "<root><city>Rome</city><days>3</days></root>",
        );
    });
});
