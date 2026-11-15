/**
 * Erreur de déclaration de routes, levée au démarrage (jamais pendant une requête).
 * Réutilisée par RTE-04 (motifs invalides) et RTE-07 (noms en double).
 */
export class RouteError extends Error {
  override name = "RouteError";
}
