import type { Readable } from "node:stream";
import type { HttpResponse } from "../types.ts";

// Fonctions utilisées par les contrôleurs pour fabriquer leurs réponses.
// Chaque appel renvoie un objet neuf : deux réponses ne partagent jamais leurs en-têtes.
// Le Content-Type indique à l'envoi comment écrire le body.

/** Réponse en JSON (le format par défaut). */
export function json(body: unknown, status = 200): HttpResponse {
    return { status, headers: { "content-type": "application/json; charset=utf-8" }, body };
}

/** 201 Created, avec l'adresse de la nouvelle ressource si elle est donnée. */
export function created(body: unknown, location?: string): HttpResponse {
    const response = json(body, 201);
    if (location !== undefined) {
        response.headers["location"] = location;
    }
    return response;
}

/** 204 No Content : succès, sans rien à renvoyer. */
export function noContent(): HttpResponse {
    return { status: 204, headers: {}, body: null };
}

/** Réponse en texte brut. */
export function text(content: string, status = 200): HttpResponse {
    return { status, headers: { "content-type": "text/plain; charset=utf-8" }, body: content };
}

/** Réponse en HTML. */
export function html(content: string, status = 200): HttpResponse {
    return { status, headers: { "content-type": "text/html; charset=utf-8" }, body: content };
}

/** Réponse en flux (gros fichiers) : le body est envoyé morceau par morceau. */
export function stream(readable: Readable, contentType: string): HttpResponse {
    return { status: 200, headers: { "content-type": contentType }, body: readable };
}

/** Redirection vers une autre adresse (302 par défaut). */
export function redirect(url: string, status = 302): HttpResponse {
    return { status, headers: { location: url }, body: null };
}
