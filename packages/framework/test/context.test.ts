import { createServer, IncomingMessage, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { buildContext } from "../src/http/context.js";
import type { Controller } from "../src/types.js";

function fakeRequest(url: string, headers: IncomingHttpHeaders = {}): IncomingMessage {
    const req = new IncomingMessage(new Socket());
    req.url = url;
    req.headers = headers;
    return req;
}

describe("buildContext", () => {
    it("starts empty before routing", () => {
        const ctx = buildContext(fakeRequest("/journeys"));

        expect(ctx.params).toEqual({});
        expect(ctx.route).toBeNull();
        expect(ctx.version).toBe("");
        expect(ctx.user).toBeNull();
        expect(ctx.body).toBeUndefined();
        expect(ctx.state.size).toBe(0);
    });

    it("keeps the original request", () => {
        const req = fakeRequest("/journeys");

        expect(buildContext(req).req).toBe(req);
    });

    it("parses the query string", () => {
        const { query } = buildContext(fakeRequest("/journeys?author=3&tag=rome&tag=food"));

        expect(query.get("author")).toBe("3");
        expect(query.getAll("tag")).toEqual(["rome", "food"]);
        expect(query.get("missing")).toBeNull();
    });

    it("falls back to / when the request has no url", () => {
        const req = fakeRequest("/");
        delete req.url;

        expect(buildContext(req).query.size).toBe(0);
    });

    it("takes params, route and version from the router", () => {
        const route = { name: "journeys.show", path: "/v1/journeys/{id}", version: "v1" };
        const ctx = buildContext(fakeRequest("/v1/journeys/42"), route, { id: "42" });

        expect(ctx.params).toEqual({ id: "42" });
        expect(ctx.route).toBe(route);
        expect(ctx.version).toBe("v1");
    });

    it("can be destructured by a controller", async () => {
        const show: Controller = ({ params, query }) => ({
            status: 200,
            headers: {},
            body: { id: params["id"], lang: query.get("lang") },
        });
        const ctx = buildContext(fakeRequest("/journeys/42?lang=fr"), null, { id: "42" });

        expect((await show(ctx)).body).toEqual({ id: "42", lang: "fr" });
    });
});

describe("ip", () => {
    it("reads the socket address", async () => {
        const server = createServer((req, res) => res.end(buildContext(req).ip));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (address === null || typeof address === "string") {
            throw new Error("server is not listening on a port");
        }

        const response = await fetch(`http://127.0.0.1:${address.port}/`);
        server.close();

        expect(await response.text()).toBe("127.0.0.1");
    });

    it("is empty when the socket has no address", () => {
        expect(buildContext(fakeRequest("/")).ip).toBe("");
    });

    it("ignores X-Forwarded-For without a trusted proxy", () => {
        const req = fakeRequest("/", { "x-forwarded-for": "6.6.6.6" });

        expect(buildContext(req).ip).toBe("");
    });

    it("reads the first X-Forwarded-For address behind a trusted proxy", () => {
        const req = fakeRequest("/", { "x-forwarded-for": "203.0.113.7, 10.0.0.1" });

        expect(buildContext(req, null, {}, true).ip).toBe("203.0.113.7");
    });

    it("accepts X-Forwarded-For given as an array", () => {
        const req = fakeRequest("/");
        req.headers["x-forwarded-for"] = ["203.0.113.7"];

        expect(buildContext(req, null, {}, true).ip).toBe("203.0.113.7");
    });

    it("falls back to the socket when the proxy sent no header", () => {
        expect(buildContext(fakeRequest("/"), null, {}, true).ip).toBe("");
    });
});
