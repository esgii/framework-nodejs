import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { created, html, json, noContent, redirect, stream, text } from "../../src/index.js";

describe("response helpers", () => {
    it("json: 200 by default, with a JSON content type", () => {
        expect(json({ a: 1 })).toEqual({
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
            body: { a: 1 },
        });
    });

    it("json: accepts another status", () => {
        expect(json({ error: "nope" }, 404).status).toBe(404);
    });

    it("created: 201 with a location header", () => {
        const response = created({ id: 7 }, "/v1/journeys/7");

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ id: 7 });
        expect(response.headers["location"]).toBe("/v1/journeys/7");
    });

    it("created: no location header when none is given", () => {
        expect(created({ id: 7 }).headers["location"]).toBeUndefined();
    });

    it("noContent: 204 with an empty body", () => {
        expect(noContent()).toEqual({ status: 204, headers: {}, body: null });
    });

    it("text and html: right content type and status", () => {
        expect(text("hello").headers["content-type"]).toBe("text/plain; charset=utf-8");
        expect(html("<p>hi</p>", 404)).toEqual({
            status: 404,
            headers: { "content-type": "text/html; charset=utf-8" },
            body: "<p>hi</p>",
        });
    });

    it("stream: keeps the readable as body", () => {
        const readable = Readable.from(["chunk"]);
        const response = stream(readable, "image/png");

        expect(response.body).toBe(readable);
        expect(response.headers["content-type"]).toBe("image/png");
    });

    it("redirect: 302 by default, or the given status", () => {
        expect(redirect("/login")).toEqual({ status: 302, headers: { location: "/login" }, body: null });
        expect(redirect("/new", 301).status).toBe(301);
    });

    it("never shares headers between two responses", () => {
        const first = json({});
        first.headers["x-test"] = "1";

        expect(json({}).headers["x-test"]).toBeUndefined();
    });
});
