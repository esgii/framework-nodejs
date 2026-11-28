import { ForbiddenError, UnauthorizedError } from "../http/errors.ts";
import type { Role } from "../security/token.ts";
import type { Middleware } from "../types.ts";

/**
 * Laisse passer seulement les rôles donnés. À placer APRÈS authenticate (SEC-03),
 * qui remplit ctx.user :
 *
 *   Route.delete("/users/{id}", removeUser, {
 *       middleware: [authenticate(config.auth.jwtSecret), requireRole("admin")],
 *   });
 *
 * 401 : on ne sait pas qui vous êtes (pas de ctx.user).
 * 403 : on sait qui vous êtes, mais votre rôle n'a pas le droit.
 */
export function requireRole(role: Role, ...others: Role[]): Middleware {
  // Au moins un rôle est exigé par la signature : requireRole() ne compile pas.
  const allowed: readonly string[] = [role, ...others];

  return async (ctx, next) => {
    if (ctx.user === null) {
      // Personne n'est connecté : authenticate était optionnel, ou absent de la route.
      throw new UnauthorizedError("Authentication required");
    }
    if (!allowed.includes(ctx.user.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    return next();
  };
}
