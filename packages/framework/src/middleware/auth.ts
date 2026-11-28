import { UnauthorizedError } from "../http/errors.ts";
import {
  TokenError,
  verifyToken,
  type TokenPayload,
} from "../security/token.ts";
import type { Middleware } from "../types.ts";

/** "Bearer <jeton>" : le mot Bearer (majuscules ou non), un espace, puis le jeton sans espace. */
const BEARER = /^Bearer \S+$/i;
const PREFIX_LENGTH = "Bearer ".length;

export interface AuthOptions {
  /**
   * true : sans en-tête Authorization, la requête continue avec ctx.user = null
   * (par exemple une liste publique qui montre en plus les carnets privés de la personne connectée).
   * Un jeton présent mais refusé donne quand même un 401.
   */
  readonly optional?: boolean;
}

/**
 * Lit "Authorization: Bearer <jeton>", vérifie le jeton (SEC-02) et remplit ctx.user.
 * 401 si le jeton est absent, expiré ou invalide.
 *
 *   Route.get("/me", me, { middleware: [authenticate(config.auth.jwtSecret)] });
 */
export function authenticate(
  secret: string,
  options: AuthOptions = {},
): Middleware {
  return async (ctx, next) => {
    const header = ctx.req.headers.authorization;

    // 1er cas de 401 : pas de jeton du tout.
    if (header === undefined) {
      if (options.optional === true) return next();
      throw new UnauthorizedError("Authentication required");
    }
    if (!BEARER.test(header)) {
      throw new UnauthorizedError("Invalid authorization header");
    }

    const payload = check(header.slice(PREFIX_LENGTH), secret);
    // Le contrat (types.ts) range l'id en texte : "42".
    ctx.user = { id: String(payload.sub), role: payload.role };
    return next();
  };
}

/** Vérifie le jeton ; ses erreurs deviennent des 401. */
function check(token: string, secret: string): TokenPayload {
  try {
    return verifyToken(token, secret);
  } catch (error) {
    // 2e cas : le jeton était bon, mais il a expiré.
    if (error instanceof TokenError && error.reason === "expired") {
      throw new UnauthorizedError("Token expired");
    }
    // 3e cas : mauvaise signature, jeton modifié, illisible…
    throw new UnauthorizedError("Invalid token");
  }
}
