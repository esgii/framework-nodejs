import { createServer, IncomingMessage, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { buildContext, parseTarget } from "../../src/http/context.js";
import type { Controller } from "../../src/types.js";

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

    it("puts the body read by readBody in ctx.body", () => {
        const ctx = buildContext(fakeRequest("/journeys"), null, {}, false, { title: "Lisbonne" });

        expect(ctx.body).toEqual({ title: "Lisbonne" });
    });

    it("parses the query string", () => {
        const { query } = buildContext(fakeRequest("/journeys?author=3&tag=rome&tag=food"));

        expect(query.get("author")).toBe("3");
        expect(query.getAll("tag")).toEqual(["rome", "food"]);
        expect(query.get("missing")).toBeNull();
    });

    it("gives the request headers", () => {
        const { headers } = buildContext(fakeRequest("/journeys", { authorization: "Bearer abc" }));

        expect(headers["authorization"]).toBe("Bearer abc");
        expect(headers["accept"]).toBeUndefined();
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

describe("RTE-09 · query parameters", () => {
    it("offers get, getAll and has, like a key/value collection", () => {
        const { query } = buildContext(fakeRequest("/users?email=a%40b.fr&name=L%C3%A9na+P&tag=x&tag=y"));

        expect(query.get("email")).toBe("a@b.fr");
        expect(query.get("name")).toBe("Léna P");
        expect(query.getAll("tag")).toEqual(["x", "y"]);
        expect(query.has("tag")).toBe(true);
        expect(query.has("missing")).toBe(false);
    });

    it("keeps an empty value, which is not the same as a missing one", () => {
        const { query } = buildContext(fakeRequest("/users?email="));

        expect(query.get("email")).toBe("");
        expect(query.has("email")).toBe(true);
    });
});

describe("parseTarget", () => {
    it("splits the path from the query string", () => {
        const { path, query } = parseTarget("/journeys/3?lang=fr");

        expect(path).toBe("/journeys/3");
        expect(query.get("lang")).toBe("fr");
    });

    it("leaves the path encoded: the router decodes each parameter", () => {
        expect(parseTarget("/tags/%C3%A9t%C3%A9").path).toBe("/tags/%C3%A9t%C3%A9");
    });

    it("does not read //host/path as another domain", () => {
        expect(parseTarget("//evil.com/admin?x=1").path).toBe("//evil.com/admin");
    });

    it("falls back to / for a missing url or one that does not start with /", () => {
        expect(parseTarget(undefined).path).toBe("/");
        expect(parseTarget("*").path).toBe("/");
        expect(parseTarget("http://other/a").path).toBe("/");
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
