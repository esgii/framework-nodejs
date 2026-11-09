import type { ServerResponse } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpResponse } from "../types.ts";
import { InternalError } from "./errors.ts";
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

/** Envoie un flux morceau par morceau, et gère la panne de la source ou le départ du client. */
async function sendStream(
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    source: Readable,
): Promise<void> {
    // Une erreur que personne n'écoute fait planter tout le serveur : on garde un écouteur jusqu'au bout.
    // pipeline voit quand même l'erreur et la traite.
    const ignore = () => {};
    source.on("error", ignore);
    try {
        // On attend la première donnée : un fichier impossible à ouvrir échoue ici,
        // avant l'envoi des en-têtes, donc le client peut encore recevoir un 500 propre.
        await once(source, "readable");
    } catch {
        source.off("error", ignore);
        source.destroy();
        const failed = new InternalError().toResponse();
        res.writeHead(failed.status, failed.headers);
        res.end(JSON.stringify(failed.body));
        return;
    }

    res.writeHead(status, headers);
    try {
        // pipeline envoie les morceaux au rythme du client. Si le client part,
        // il détruit la source ; si la source tombe en panne, il coupe la connexion.
        await pipeline(source, res);
    } catch {
        // Les en-têtes sont déjà partis : on ne peut plus changer le statut.
        // La connexion a été coupée, ce qui indique au client que le fichier est incomplet.
    } finally {
        source.off("error", ignore);
    }
}
