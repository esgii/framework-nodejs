import { RouteError } from "./errors.js";
import { getRouteByName, isFrozen } from "./registry.js";
import { versionedPath } from "./version.js";

/** Les valeurs à mettre dans l'URL : { journeyId: 3 }. */
export type UrlParams = Readonly<Record<string, string | number>>;

/** Un paramètre dans un motif : {journeyId}, ou {path*} pour une fin de chemin. */
const PARAM = /\{([A-Za-z_][A-Za-z0-9_]*)(\*?)\}/g;

/**
 * Génère l'URL d'une route à partir de son nom, version comprise (RTE-08, VER-03).
 *
 *   url("journeys.show", { journeyId: 3 })   → "/v1/journeys/3"
 *   url("tags.show", { name: "été/hiver" })  → "/v1/tags/%C3%A9t%C3%A9%2Fhiver"
 *
 * Chaque valeur est encodée avec encodeURIComponent : un "/", un "?" ou une espace
 * restent dans leur segment, et le résolveur les décode à l'identique (RTE-05).
 * Une valeur de {path*} garde ses "/" : chaque morceau est encodé séparément.
 *
 * Les erreurs sont des bugs du code (500), levées avec le nom de la route
 * et du paramètre en cause : route inconnue, paramètre manquant, vide ou en trop.
 */
export function url(name: string, params: UrlParams = {}): string {
  if (!isFrozen()) {
    throw new RouteError(
      `url("${name}") : le registre n'est pas figé, appeler Route.freeze() au démarrage`,
    );
  }
  const route = getRouteByName(name);
  if (route === undefined) {
    throw new RouteError(`url() : route inconnue « ${name} »`);
  }

  const used = new Set<string>();
  const path = versionedPath(route).replace(
    PARAM,
    (_match, param: string, wildcard: string) => {
      const value = params[param];
      if (value === undefined) {
        throw new RouteError(
          `url("${name}") : paramètre « ${param} » manquant`,
        );
      }
      const text = String(value);
      // Le résolveur refuse un segment vide ({id} attend au moins un caractère) :
      // une URL générée doit toujours pouvoir être résolue.
      if (text === "") {
        throw new RouteError(`url("${name}") : paramètre « ${param} » vide`);
      }
      used.add(param);
      return wildcard === "*"
        ? text.split("/").map(encodeURIComponent).join("/")
        : encodeURIComponent(text);
    },
  );

  // Une valeur en trop est presque toujours une faute de frappe (journeyID au lieu de journeyId).
  const extra = Object.keys(params).filter((key) => !used.has(key));
  if (extra.length > 0) {
    throw new RouteError(
      `url("${name}") : paramètre(s) inconnu(s) pour cette route : ${extra.join(", ")}`,
    );
  }
  return path;
}
