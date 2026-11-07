import { createServer, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { send } from "../../src/http/send.ts";

/**
 * Starts a server whose handler receives the raw `res`,
 * makes one request to it, then closes it.
 */
async function request(handler: (res: ServerResponse) => Promise<void>): Promise<Response> {
    const server = createServer((_req, res) => {
        void handler(res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("server is not listening on a port");
    }
    try {
        return await fetch(`http://127.0.0.1:${address.port}/`);
    } finally {
        server.close();
    }
}

describe("send", () => {
    it("writes the status, the headers and the body", async () => {
        const response = await request(async (res) => {
            await send(res, { status: 201, headers: { "x-id": "7" }, body: { id: 7 } });
        });

        expect(response.status).toBe(201);
        expect(response.headers.get("x-id")).toBe("7");
        expect(await response.text()).toBe('{"id":7}');
    });

    it("adds the JSON content type when none is given", async () => {
        const response = await request(async (res) => {
            await send(res, { status: 200, headers: {}, body: { a: 1 } });
        });

        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    });

    it("keeps the content type chosen by the controller", async () => {
        const response = await request(async (res) => {
            await send(res, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: "hi" });
        });

        expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expect(await response.text()).toBe("hi");
    });

    it("sends an empty body without a content type", async () => {
        const response = await request(async (res) => {
            await send(res, { status: 204, headers: {}, body: null });
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("content-type")).toBeNull();
    });

    it("pipes a stream chunk by chunk", async () => {
        const response = await request(async (res) => {
            const body = Readable.from(["chunk 1, ", "chunk 2"]);
            await send(res, { status: 200, headers: { "content-type": "text/plain" }, body });
        });

        expect(await response.text()).toBe("chunk 1, chunk 2");
    });

    it("ignores a second send, without ERR_HTTP_HEADERS_SENT", async () => {
        const results: boolean[] = [];
        const response = await request(async (res) => {
            results.push(await send(res, { status: 200, headers: {}, body: { first: true } }));
            results.push(await send(res, { status: 500, headers: {}, body: { second: true } }));
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('{"first":true}');
        expect(results).toEqual([true, false]);
    });

    it("does nothing if the headers were already written by hand", async () => {
        let sent = true;
        const response = await request(async (res) => {
            res.writeHead(418);
            sent = await send(res, { status: 200, headers: {}, body: { a: 1 } });
            res.end();
        });

        expect(response.status).toBe(418);
        expect(sent).toBe(false);
    });
});
