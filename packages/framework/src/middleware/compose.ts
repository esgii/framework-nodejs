import type { HttpResponse, Next } from "../types.js";

/**
 * Un maillon de la chaîne. Avec C = Context, c'est exactement le type Middleware
 * le générique permet de tester compose sans construire un vrai Context.
 */
export type Layer<C> = (ctx: C, next: Next) => Promise<HttpResponse>;

/** Le bout de la chaîne. Avec C = Context, c'est le type Controller */
export type Handler<C> = (ctx: C) => HttpResponse | Promise<HttpResponse>;

/** Erreur de programmation dans un middleware (ex. next() appelé deux fois). */
export class MiddlewareError extends Error {
  override name = "MiddlewareError";
}

/**
 * Assemble les middlewares et le contrôleur en une seule fonction « en oignon ».
 *
 *   const run = compose([a, b], controller);
 *   const response = await run(ctx);
 *
 * Ordre d'exécution : a (avant next) → b (avant next) → controller
 *                     → b (après next) → a (après next)
 *
 * Chaque middleware peut :
 * - agir avant `await next()` (lire ctx, vérifier un jeton…) ;
 * - agir après (lire ou modifier la réponse renvoyée par la suite de la chaîne) ;
 * - ne pas appeler next et renvoyer sa propre réponse .
 */
export function compose<C>(
  middlewares: readonly Layer<C>[],
  handler: Handler<C>,
): (ctx: C) => Promise<HttpResponse> {
  // Copie : ajouter un middleware au tableau d'origine plus tard ne change pas
  // une chaîne déjà composée.
  const chain = [...middlewares];

  return (ctx) => {
    // Propre à chaque requête : une chaîne composée une fois sert à toutes les
    // requêtes, il ne faut donc pas partager ce compteur entre elles.
    let lastIndex = -1;

    // async : une erreur levée de façon synchrone par un middleware devient un
    // rejet de promesse, que le pipeline (KRN-02) attrapera comme les autres.
    const dispatch = async (index: number): Promise<HttpResponse> => {
      if (index <= lastIndex) {
        throw new MiddlewareError(
          "next() a été appelé plusieurs fois dans le même middleware",
        );
      }
      lastIndex = index;

      const middleware = chain[index];
      if (middleware === undefined) return handler(ctx);
      return middleware(ctx, () => dispatch(index + 1));
    };

    return dispatch(0);
  };
}
