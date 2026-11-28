import bcrypt from "bcryptjs";

/**
 * bcrypt ne lit que les 72 premiers octets d'un mot de passe et ignore la suite sans prévenir :
 * deux mots de passe longs qui commencent pareil auraient le même hash. On refuse donc au-delà.
 */
export const MAX_PASSWORD_BYTES = 72;

/** Un mot de passe que bcrypt ne peut pas traiter correctement. */
export class PasswordError extends Error {
  override readonly name = "PasswordError";
}

/**
 * Hache un mot de passe. bcrypt tire un sel aléatoire à chaque appel et le range dans le hash :
 * "$2b$12$<sel de 22 caractères><hash>". Le coût (12) est aussi dans le hash.
 * Seul ce hash est enregistré : jamais le mot de passe lui-même.
 */
export async function hashPassword(
  password: string,
  cost: number,
): Promise<string> {
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new PasswordError(
      `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    );
  }
  return bcrypt.hash(password, cost);
}

/**
 * Vérifie un mot de passe contre un hash enregistré. bcrypt relit le sel et le coût
 * dans le hash, hache le mot de passe de la même façon, puis compare.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // Trop long : il n'a pas pu être enregistré, donc il ne peut pas être le bon.
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return false;
  return bcrypt.compare(password, hash);
}
