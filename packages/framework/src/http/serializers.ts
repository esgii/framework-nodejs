import { Readable } from "node:stream";
import type { HttpResponse } from "../types.ts";

/** Transforme le body d'une réponse en ce qui est écrit sur la connexion. */
export type SerializerFn = (body: unknown) => string | Buffer;

export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** Garde seulement le type de contenu : "application/json; charset=utf-8" -> "application/json". */
function mediaType(value: string): string {
    const index = value.indexOf(";");
    return (index === -1 ? value : value.slice(0, index)).trim().toLowerCase();
}

/**
 * Crée un registre de sérialiseurs, rangés par type de contenu.
 * JSON, texte brut et HTML sont inscrits d'office ; n'importe qui peut ajouter un format
 * (XML, CSV...) avec register(), sans toucher au framework.
 */
export function createSerializerRegistry() {
    const serializers = new Map<string, SerializerFn>();

    /** Ajoute (ou remplace) le sérialiseur d'un type de contenu. */
    function register(contentType: string, fn: SerializerFn): void {
        serializers.set(mediaType(contentType), fn);
    }

    /** Transforme le body d'une réponse en chaîne, en Buffer, ou en flux à brancher. */
    function serialize(response: HttpResponse): string | Buffer | Readable {
        const { body } = response;
        if (body === null || body === undefined) {
            return "";
        }
        if (body instanceof Readable || Buffer.isBuffer(body)) {
            return body; // déjà des octets : envoyé tel quel
        }
        const type = mediaType(response.headers["content-type"] ?? JSON_CONTENT_TYPE);
        const fn = serializers.get(type);
        if (fn === undefined) {
            // Un bug : personne n'a inscrit ce format. Le gestionnaire d'erreurs le transforme en 500.
            throw new Error(`No serializer registered for "${type}"`);
        }
        return fn(body);
    }

    register("application/json", (body) => JSON.stringify(body));
    register("text/plain", (body) => String(body));
    register("text/html", (body) => String(body));

    return { register, serialize };
}

/** Le registre utilisé par le framework. */
export const serializers = createSerializerRegistry();
export const registerSerializer = serializers.register;
