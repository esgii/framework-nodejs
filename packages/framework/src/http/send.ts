import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpResponse } from "../types.ts";
import { JSON_CONTENT_TYPE, serializers } from "./serializers.ts";

/**
 * The only function that writes a response on the socket.
 * Returns true if it sent the response, false if one was already sent
 * (a second send is ignored, so Node never throws ERR_HTTP_HEADERS_SENT).
 */
export async function send(res: ServerResponse, response: HttpResponse): Promise<boolean> {
    if (res.headersSent || res.writableEnded) {
        return false;
    }

    //{ id: 7 } too {''{"id":7}'}
    const payload = serializers.serialize(response);
    const headers = { ...response.headers };
    if (headers["content-type"] === undefined && typeof payload === "string" && payload !== "") {
        headers["content-type"] = JSON_CONTENT_TYPE;
    }

    res.writeHead(response.status, headers);
    if (payload instanceof Readable) {
        await pipeline(payload, res);
    } else {
        res.end(payload);
    }
    return true;
}
