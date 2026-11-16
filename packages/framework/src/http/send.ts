import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpResponse } from "../types.ts";
import { JSON_CONTENT_TYPE, serializers } from "./serializers.ts";

/**
 * La seule fonction qui écrit une réponse sur la connexion.
 * Renvoie true si elle a envoyé la réponse, false si une réponse était déjà partie
 * (un second envoi est ignoré, donc Node ne lève jamais ERR_HTTP_HEADERS_SENT).
 */
export async function send(res: ServerResponse, response: HttpResponse): Promise<boolean> {
    if (res.headersSent || res.writableEnded) {
        return false;
    }

    const payload = serializers.serialize(response);
    const headers = { ...response.headers };
    // Le body a été écrit en JSON par défaut : on le dit au client.
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

/**
 * Envoie un flux morceau par morceau avec pipeline, qui s'occupe de tout :
 * il lit la source au rythme du client, la détruit si le client part,
 * et coupe la connexion si la source tombe en panne.
 */
async function sendStream(
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    source: Readable,
): Promise<void> {
    res.writeHead(status, headers);
    try {
        await pipeline(source, res);
    } catch {
        // Les en-têtes sont déjà partis : on ne peut plus changer le statut.
        // La connexion coupée indique au client que la réponse est incomplète.
    }
}
