import type { ServerResponse } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpResponse } from "../types.ts";
import { JSON_CONTENT_TYPE, serializers } from "./serializers.ts";

const STREAM_FAILED = JSON.stringify({
    error: { code: "internal_error", message: "Internal Server Error", details: [] },
});

/**
 * The only function that writes a response on the socket.
 * Returns true if it sent the response, false if one was already sent
 * (a second send is ignored, so Node never throws ERR_HTTP_HEADERS_SENT).
 */
export async function send(res: ServerResponse, response: HttpResponse): Promise<boolean> {
    if (res.headersSent || res.writableEnded) {
        return false;
    }

    const payload = serializers.serialize(response);
    const headers = { ...response.headers };
    if (headers["content-type"] === undefined && typeof payload === "string" && payload !== "") {
        headers["content-type"] = JSON_CONTENT_TYPE;
    }

    if (payload instanceof Readable) {
        await sendStream(res, response.status, headers, payload);
    } else {
        res.writeHead(response.status, headers);
        res.end(payload);
    }
    return true;
}

/** Sends a stream chunk by chunk, and handles the source failing or the client leaving. */
async function sendStream(
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    source: Readable,
): Promise<void> {
    const ignore = () => {};
    source.on("error", ignore);
    try {
        await once(source, "readable");
    } catch {
        source.off("error", ignore);
        source.destroy();
        res.writeHead(500, { "content-type": JSON_CONTENT_TYPE });
        res.end(STREAM_FAILED);
        return;
    }

    res.writeHead(status, headers);
    try {
        await pipeline(source, res);
    } catch {

    } finally {
        source.off("error", ignore);
    }
}
