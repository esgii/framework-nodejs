import jwt from "jsonwebtoken";

/** Les rôles possibles, comme dans la base (CHECK role IN ('user', 'admin')). */
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Ce que contient un jeton : l'identifiant de l'utilisateur (sub) et son rôle. */
export interface TokenPayload {
  readonly sub: number;
  readonly role: Role;
}

/** Un jeton refusé : absent du bon format, mal signé, expiré… Toujours un 401 pour le client. */
export class TokenError extends Error {
  override readonly name = "TokenError";
  /** "expired" : le jeton était bon mais a expiré ; "invalid" : tout le reste. */
  readonly reason: "expired" | "invalid";

  constructor(reason: "expired" | "invalid", message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Un seul algorithme accepté : HMAC-SHA256, avec le secret de la config. */
const ALGORITHM = "HS256";

/**
 * Crée un jeton signé qui expire après `ttlSeconds`.
 * Le contenu d'un JWT est lisible par tout le monde (il est encodé, pas chiffré) :
 * on n'y met donc que l'id et le rôle, jamais d'email ni de mot de passe.
 */
export function signToken(
  payload: TokenPayload,
  secret: string,
  ttlSeconds: number,
): string {
  // La norme JWT veut un sub en texte : 42 devient "42".
  return jwt.sign({ sub: String(payload.sub), role: payload.role }, secret, {
    algorithm: ALGORITHM,
    expiresIn: ttlSeconds,
  });
}

/**
 * Vérifie la signature et l'expiration, puis le contenu. Lève TokenError sinon.
 * jwt.decode lirait le jeton sans rien vérifier : n'importe qui pourrait en fabriquer un.
 */
export function verifyToken(token: string, secret: string): TokenPayload {
  let decoded: unknown;
  try {
    // algorithms : refuse un jeton qui annonce un autre algorithme, dont "none" (sans signature).
    decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenError("expired", "Token expired");
    }
    throw new TokenError("invalid", "Invalid token");
  }
  return readPayload(decoded);
}

/** Le contenu vient de l'extérieur : on vérifie sa forme avant de s'en servir. */
function readPayload(decoded: unknown): TokenPayload {
  if (typeof decoded !== "object" || decoded === null) {
    throw new TokenError("invalid", "Invalid token payload");
  }
  const sub: unknown = Reflect.get(decoded, "sub");
  const role: unknown = Reflect.get(decoded, "role");
  if (typeof sub !== "string" || !/^[1-9][0-9]*$/.test(sub)) {
    throw new TokenError("invalid", "Invalid token subject");
  }
  if (!isRole(role)) {
    throw new TokenError("invalid", "Invalid token role");
  }
  return { sub: Number(sub), role };
}

function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}
