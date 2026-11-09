import type { FrameworkConfig } from "./config.js";

export interface ConfigIssue {
  /** Chemin de la clé fautive */
  readonly key: string;
  /** Explication lisible, ex: 'doit faire au moins 32 caractères'. */
  readonly reason: string;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const lines = issues.map((issue) => `  - ${issue.key} ${issue.reason}`);
    super(["Configuration invalide :", ...lines].join("\n"));
    this.issues = issues;
  }
}

const MIN_SECRET_LENGTH = 32;
const DATABASE_URL = /^postgres(ql)?:\/\/.+/;
const MIME_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/i;
const API_VERSION = /^v\d+$/;
/** Caractères autorisés dans un nom d'en-tête HTTP */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const LINE_BREAK = /[\r\n]/;

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Origine CORS : schéma http(s) + hôte (+ port), sans chemin ni barre finale. */
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.origin === value
  );
}

export function validateConfig(config: FrameworkConfig): void {
  const issues: ConfigIssue[] = [];
  const check = (ok: boolean, key: string, reason: string): void => {
    if (!ok) issues.push({ key, reason });
  };
  const {
    server,
    database,
    auth,
    cors,
    uploads,
    securityHeaders,
    rateLimit,
    api,
  } = config;

  // Serveur
  // Vérification de la présence d'un host et d'un port valide (entier entre 0 et 65535)
  check(server.host !== "", "server.host", "est vide");
  check(
    isIntegerBetween(server.port, 0, 65535),
    "server.port",
    "doit être un entier entre 0 et 65535",
  );
  check(
    isPositiveInteger(server.bodyLimitBytes),
    "server.bodyLimitBytes",
    "doit être un entier strictement positif",
  );

  // Base de données
  // Vérification de la présence d'une URL et qu'elle commence par postgres:// ou postgresql://
  if (database.url === "") {
    check(false, "database.url", "est vide");
  } else {
    check(
      DATABASE_URL.test(database.url),
      "database.url",
      "doit commencer par postgres:// ou postgresql://",
    );
  }

  // Authentification
  // Vérification de la présence d'un secret et qu'il fasse au moins 32 caractères
  if (auth.jwtSecret === "") {
    check(false, "auth.jwtSecret", "est vide");
  } else {
    check(
      auth.jwtSecret.length >= MIN_SECRET_LENGTH,
      "auth.jwtSecret",
      `doit faire au moins ${MIN_SECRET_LENGTH} caractères`,
    );
  }
  // Vérification que jwtTtlSeconds est un entier strictement positif
  check(
    isPositiveInteger(auth.jwtTtlSeconds),
    "auth.jwtTtlSeconds",
    "doit être un entier strictement positif",
  );
  // Vérification que bcryptCost est un entier entre 4 et 31
  check(
    isIntegerBetween(auth.bcryptCost, 4, 31),
    "auth.bcryptCost",
    "doit être un entier entre 4 et 31",
  );

  // CORS
  // Vérification que si CORS est activé, il y a au moins une origine
  check(
    !cors.enabled || cors.origins.length > 0,
    "cors.origins",
    "est vide alors que CORS est activé",
  );
  cors.origins.forEach((origin, i) => {
    check(
      isOrigin(origin),
      `cors.origins[${i}]`,
      `n'est pas une origine valide : "${origin}" (attendu : https://domain.fr)`,
    );
  });

  // Uploads
  // Vérification que le répertoire d'uploads est non vide, que la taille max est un entier strictement positif et qu'il y a au moins un type MIME autorisé
  check(uploads.dir !== "", "uploads.dir", "est vide");
  check(
    isPositiveInteger(uploads.maxBytes),
    "uploads.maxBytes",
    "doit être un entier strictement positif",
  );
  check(uploads.allowedTypes.length > 0, "uploads.allowedTypes", "est vide");
  uploads.allowedTypes.forEach((type, i) => {
    check(
      MIME_TYPE.test(type),
      `uploads.allowedTypes[${i}]`,
      `n'est pas un type MIME valide : "${type}"`,
    );
  });

  // Security header
  // Vérification que les noms d'en-têtes sont valides et que les valeurs ne contiennent pas de retour à la ligne
  for (const [name, value] of Object.entries(securityHeaders)) {
    check(
      HEADER_NAME.test(name),
      `securityHeaders["${name}"]`,
      "n'est pas un nom d'en-tête valide",
    );
    check(
      !LINE_BREAK.test(value),
      `securityHeaders["${name}"]`,
      "ne doit pas contenir de retour à la ligne",
    );
  }

  // Rate limit
  // Vérification que max et windowMs sont des entiers strictement positifs
  check(
    isPositiveInteger(rateLimit.max),
    "rateLimit.max",
    "doit être un entier strictement positif",
  );
  check(
    isPositiveInteger(rateLimit.windowMs),
    "rateLimit.windowMs",
    "doit être un entier strictement positif",
  );

  // API
  // Vérification que defaultVersion est de la forme v1, v2…
  check(
    API_VERSION.test(api.defaultVersion),
    "api.defaultVersion",
    "doit être de la forme v1, v2…",
  );

  if (issues.length > 0) throw new ConfigError(issues);
}
