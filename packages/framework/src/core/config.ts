/** Mode d'exécution  */
export type AppEnv = "development" | "production" | "test";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly bodyLimitBytes: number;
}

export interface DatabaseConfig {
  readonly url: string;
}

export interface AuthConfig {
  readonly jwtSecret: string;
  /** Durée de vie en secondes. */
  readonly jwtTtlSeconds: number;
  /** Coût bcrypt */
  readonly bcryptCost: number;
}

export interface CorsConfig {
  readonly enabled: boolean;
  readonly origins: readonly string[];
}

export interface UploadsConfig {
  readonly dir: string;
  /** Taille maximale d'un fichier en octets */
  readonly maxBytes: number;
  readonly allowedTypes: readonly string[];
}

export interface RateLimitConfig {
  /** Nombre maximal de requêtes par client dans la fenêtre. */
  readonly max: number;
  /** Durée de la fenêtre en millisecondes. */
  readonly windowMs: number;
}

export interface ApiConfig {
  /** Version utilisée quand la requête n'en précise pas */
  readonly defaultVersion: string;
}

export interface FrameworkConfig {
  readonly env: AppEnv;
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
  readonly cors: CorsConfig;
  readonly uploads: UploadsConfig;
  readonly securityHeaders: Readonly<Record<string, string>>;
  readonly rateLimit: RateLimitConfig;
  readonly api: ApiConfig;
}
