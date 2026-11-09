import type { AppEnv, FrameworkConfig } from "@carnet/framework";

const env = process.env;

/** Valeur brute, ou undefined si la variable est absente ou vide. */
function read(name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/** Texte avec valeur par défaut. */
function text(name: string, fallback: string): string {
  return read(name) ?? fallback;
}

/** Texte obligatoire, sans valeur par défaut : vide s'il manque, CFG-03 refusera de démarrer. */
function required(name: string): string {
  return read(name) ?? "";
}

/** Nombre avec valeur par défaut. "abc" donne NaN */
function number(name: string, fallback: number): number {
  const value = read(name);
  return value === undefined ? fallback : Number(value);
}

/** Booléen : seul "true" vaut true. */
function bool(name: string, fallback: boolean): boolean {
  const value = read(name);
  return value === undefined ? fallback : value.toLowerCase() === "true";
}

/** Liste séparée par des virgules : "a, b,,c" donne ['a', 'b', 'c']. */
function list(name: string, fallback: readonly string[]): readonly string[] {
  const value = read(name);
  if (value === undefined) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** Mode d'exécution : tout ce qui n'est pas "production" ou "test" vaut "development". */
function appEnv(): AppEnv {
  const value = read("NODE_ENV");
  return value === "production" || value === "test" ? value : "development";
}

export const config: FrameworkConfig = {
  env: appEnv(),
  server: {
    host: text("HOST", "0.0.0.0"),
    port: number("PORT", 3000),
    bodyLimitBytes: number("BODY_LIMIT_BYTES", 1_000_000),
  },
  database: {
    url: required("DATABASE_URL"),
  },
  auth: {
    jwtSecret: required("JWT_SECRET"),
    jwtTtlSeconds: number("JWT_TTL_SECONDS", 3600),
    bcryptCost: number("BCRYPT_COST", 12),
  },
  cors: {
    enabled: bool("CORS_ENABLED", false),
    origins: list("CORS_ORIGINS", []),
  },
  uploads: {
    dir: text("UPLOAD_DIR", "uploads"),
    maxBytes: number("UPLOAD_MAX_BYTES", 5_000_000),
    allowedTypes: list("UPLOAD_ALLOWED_TYPES", [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
  },
  // Les en-têtes de sécurité ne dépendent pas de l'environnement : ils sont écrits ici.
  securityHeaders: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  },
  rateLimit: {
    max: number("RATE_LIMIT_MAX", 100),
    windowMs: number("RATE_LIMIT_WINDOW_MS", 60_000),
  },
  api: {
    defaultVersion: text("API_DEFAULT_VERSION", "v1"),
  },
};
