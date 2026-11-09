import { createServer, get, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { send } from "../../src/http/send.ts";

/** Démarre un serveur dont le gestionnaire reçoit le `res` brut. */
async function startServer(handler: (res: ServerResponse) => Promise<void>) {
    const server = createServer((_req, res) => {
        void handler(res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("server is not listening on a port");
    }
    return { url: `http://127.0.0.1:${address.port}/`, close: () => server.close() };
}

/** Fait une requête avec fetch, puis ferme le serveur. */
async function request(handler: (res: ServerResponse) => Promise<void>): Promise<Response> {
    const server = await startServer(handler);
    try {
        return await fetch(server.url);
    } finally {
        server.close();
    }
}

/** Un flux qui fabrique ses morceaux à la demande : il n'a jamais tout le body en mémoire. */
function lazySource(totalBytes: number, chunkBytes = 64 * 1024) {
    const state = { produced: 0 };
    const stream = new Readable({
        read() {
            if (state.produced >= totalBytes) {
                this.push(null);
                return;
            }
            state.produced += chunkBytes;
            this.push(Buffer.alloc(chunkBytes));
        },
    });
    return { stream, state };
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

describe("send with a stream", () => {
    it("pipes a stream chunk by chunk", async () => {
        const response = await request(async (res) => {
            const body = Readable.from(["chunk 1, ", "chunk 2"]);
            await send(res, { status: 200, headers: { "content-type": "text/plain" }, body });
        });

        expect(await response.text()).toBe("chunk 1, chunk 2");
    });

    it("reads the source at the client's pace (memory stays constant)", async () => {
        const total = 50 * 1024 * 1024;
        const { stream, state } = lazySource(total);
        const server = await startServer(async (res) => {
            await send(res, { status: 200, headers: { "content-type": "application/octet-stream" }, body: stream });
        });

        const response = await new Promise<IncomingMessage>((resolve) => get(server.url, resolve));
        response.pause();
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Le client ne lit rien : le serveur a arrêté de lire la source bien avant la fin.
        const producedWhilePaused = state.produced;

        let received = 0;
        response.on("data", (chunk: Buffer) => {
            received += chunk.length;
        });
        response.resume();
        await once(response, "end");
        server.close();

        expect(producedWhilePaused < total / 2).toBe(true);
        expect(received).toBe(total);
    });

    it("answers 500 when the source fails before sending anything", async () => {
        const response = await request(async (res) => {
            const body = new Readable({
                read() {
                    this.destroy(new Error("ENOENT: file deleted"));
                },
            });
            await send(res, { status: 200, headers: { "content-type": "image/png" }, body });
        });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: { code: "INTERNAL_ERROR", message: "Internal server error", details: [] },
        });
    });

    it("cuts the connection when the source fails in the middle", async () => {
        let sending = Promise.resolve(false);
        const response = await request(async (res) => {
            let step = 0;
            const body = new Readable({
                read() {
                    step += 1;
                    if (step === 1) {
                        this.push("first part ");
                    } else {
                        // Le disque tombe en panne un peu plus tard, une fois la première partie arrivée au client.
                        setTimeout(() => this.destroy(new Error("disk error")), 50);
                    }
                },
            });
            sending = send(res, { status: 200, headers: { "content-type": "text/plain" }, body });
            await sending;
        });

        let failed = false;
        try {
            await response.text();
        } catch {
            failed = true;
        }

        expect(response.status).toBe(200);
        expect(failed).toBe(true);
        expect(await sending).toBe(true); // send lui-même ne lève jamais d'erreur

    });

    it("stops reading the source when the client leaves", async () => {
        const { stream } = lazySource(Number.POSITIVE_INFINITY);
        const server = await startServer(async (res) => {
            await send(res, { status: 200, headers: { "content-type": "application/octet-stream" }, body: stream });
        });

        const req = get(server.url, (response) => {
            response.once("data", () => req.destroy()); // le client ferme après le premier morceau
        });
        req.on("error", () => {});
        await new Promise((resolve) => stream.on("close", resolve));
        server.close();

        expect(stream.destroyed).toBe(true);
    });
});
