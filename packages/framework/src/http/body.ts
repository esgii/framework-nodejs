import type { IncomingMessage } from "node:http";
import { BadRequestError, PayloadTooLargeError } from "./errors.js";

/** Vrai si l'en-tête Content-Type annonce du JSON ("application/json; charset=utf-8" compris). */
function isJson(contentType: string | undefined): boolean {
    const type = contentType?.split(";")[0]?.trim().toLowerCase();
    return type === "application/json";
}

/**
 * Lit et analyse le corps d'une requête JSON (§ 2.5), avec une taille maximale (§ 2.9).
 *
 * - Le corps est lu morceau par morceau en comptant sa taille : au-delà de maxBytes → 413.
 * - JSON invalide → 400.
 * - Corps vide → undefined.
 * - Autre type que JSON → undefined, sans rien lire : le flux reste intact
 *   pour le téléversement de fichiers, qui le lira lui-même.
 *
 * Le résultat est unknown : on ne sait pas ce que le client a envoyé avant
 * de l'avoir validé (la validation vient ensuite).
 */
export function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
    if (!isJson(req.headers["content-type"])) {
        return Promise.resolve(undefined);
    }

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;

        req.on("data", (chunk: Buffer) => {
            // Trop gros : on ignore la suite sans la garder en mémoire.
            // Le reste est quand même lu jusqu'au bout, pour que le client reçoive bien la 413.
            if (tooLarge) return;
            size += chunk.length;
            if (size > maxBytes) {
                tooLarge = true;
                chunks.length = 0;
                reject(new PayloadTooLargeError(`Body larger than ${maxBytes} bytes`));
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => {
            // La promesse est déjà rejetée en 413 : rien à faire.
            if (tooLarge) return;
            const text = Buffer.concat(chunks).toString("utf8");
            if (text === "") {
                resolve(undefined);
                return;
            }
            try {
                // Annoté unknown : JSON.parse renvoie any, qu'on ne laisse pas sortir.
                const value: unknown = JSON.parse(text);
                resolve(value);
            } catch {
                reject(new BadRequestError("Invalid JSON body"));
            }
        });

        // Connexion coupée pendant la lecture.
        req.on("error", reject);
    });
}
