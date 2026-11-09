import { describe, expect, it } from "vitest";
import type { FrameworkConfig } from "../../src/index.js";
import { ConfigError, validateConfig } from "../../src/index.js";

/**
 * Config correcte, recréée à chaque appel : aucun test ne peut modifier
 * la config d'un autre (remise à zéro entre les tests).
 */
function validConfig(): FrameworkConfig {
  return {
    env: "test",
    server: { host: "127.0.0.1", port: 3000, bodyLimitBytes: 1_000_000 },
    database: { url: "postgres://carnet:pw@localhost:5432/carnet" },
    auth: { jwtSecret: "x".repeat(32), jwtTtlSeconds: 3600, bcryptCost: 12 },
    cors: { enabled: true, origins: ["http://localhost:5173"] },
    uploads: {
      dir: "uploads",
      maxBytes: 5_000_000,
      allowedTypes: ["image/jpeg", "image/png"],
    },
    securityHeaders: { "X-Content-Type-Options": "nosniff" },
    rateLimit: { max: 100, windowMs: 60_000 },
    api: { defaultVersion: "v1" },
  };
}

/** Lance la validation et renvoie les clés fautives ([] si la config est valide). */
function issuesOf(config: FrameworkConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (error: unknown) {
    if (error instanceof ConfigError)
      return error.issues.map((issue) => issue.key);
    throw error;
  }
}

describe("validateConfig", () => {
  it("accepte une config valide", () => {
    expect(() => validateConfig(validConfig())).not.toThrow();
  });

  describe("server", () => {
    it("refuse un hôte vide", () => {
      const c = validConfig();
      expect(issuesOf({ ...c, server: { ...c.server, host: "" } })).toEqual([
        "server.host",
      ]);
    });

    it.each([-1, 65536, 3000.5, Number.NaN])("refuse le port %s", (port) => {
      const c = validConfig();
      expect(issuesOf({ ...c, server: { ...c.server, port } })).toEqual([
        "server.port",
      ]);
    });

    it.each([0, 65535])("accepte le port limite %s", (port) => {
      const c = validConfig();
      expect(issuesOf({ ...c, server: { ...c.server, port } })).toEqual([]);
    });

    it.each([0, -1, 1.5])(
      "refuse une taille de corps de %s",
      (bodyLimitBytes) => {
        const c = validConfig();
        expect(
          issuesOf({ ...c, server: { ...c.server, bodyLimitBytes } }),
        ).toEqual(["server.bodyLimitBytes"]);
      },
    );
  });

  describe("database", () => {
    it("refuse une URL vide avec le message « est vide »", () => {
      const c = validConfig();
      expect(() => validateConfig({ ...c, database: { url: "" } })).toThrow(
        /database\.url est vide/,
      );
    });

    it("refuse une URL qui n’est pas PostgreSQL", () => {
      const c = validConfig();
      expect(() =>
        validateConfig({ ...c, database: { url: "mysql://localhost/carnet" } }),
      ).toThrow(/database\.url doit commencer par postgres:\/\//);
    });

    it("accepte le préfixe postgresql://", () => {
      const c = validConfig();
      expect(
        issuesOf({ ...c, database: { url: "postgresql://localhost/carnet" } }),
      ).toEqual([]);
    });
  });

  describe("auth", () => {
    it("refuse un secret vide avec le message « est vide »", () => {
      const c = validConfig();
      expect(() =>
        validateConfig({ ...c, auth: { ...c.auth, jwtSecret: "" } }),
      ).toThrow(/auth\.jwtSecret est vide/);
    });

    it("refuse un secret de 31 caractères", () => {
      const c = validConfig();
      expect(() =>
        validateConfig({
          ...c,
          auth: { ...c.auth, jwtSecret: "x".repeat(31) },
        }),
      ).toThrow(/auth\.jwtSecret doit faire au moins 32 caractères/);
    });

    it.each([0, -60, 1.5])("refuse une durée de vie de %s", (jwtTtlSeconds) => {
      const c = validConfig();
      expect(issuesOf({ ...c, auth: { ...c.auth, jwtTtlSeconds } })).toEqual([
        "auth.jwtTtlSeconds",
      ]);
    });

    it.each([3, 32, 12.5])("refuse un coût bcrypt de %s", (bcryptCost) => {
      const c = validConfig();
      expect(issuesOf({ ...c, auth: { ...c.auth, bcryptCost } })).toEqual([
        "auth.bcryptCost",
      ]);
    });

    it.each([4, 31])("accepte le coût bcrypt limite %s", (bcryptCost) => {
      const c = validConfig();
      expect(issuesOf({ ...c, auth: { ...c.auth, bcryptCost } })).toEqual([]);
    });
  });

  describe("cors", () => {
    it("refuse une liste vide quand CORS est activé", () => {
      const c = validConfig();
      expect(issuesOf({ ...c, cors: { enabled: true, origins: [] } })).toEqual([
        "cors.origins",
      ]);
    });

    it("accepte une liste vide quand CORS est désactivé", () => {
      const c = validConfig();
      expect(issuesOf({ ...c, cors: { enabled: false, origins: [] } })).toEqual(
        [],
      );
    });

    it.each([
      "https://carnet.fr/",
      "ftp://carnet.fr",
      "*",
      "pas une url",
      "https://carnet.fr/api",
    ])("refuse l’origine %s", (origin) => {
      const c = validConfig();
      expect(
        issuesOf({
          ...c,
          cors: { enabled: true, origins: ["https://ok.fr", origin] },
        }),
      ).toEqual(["cors.origins[1]"]);
    });

    it("accepte une origine https avec port", () => {
      const c = validConfig();
      expect(
        issuesOf({
          ...c,
          cors: { enabled: true, origins: ["https://carnet.fr:8443"] },
        }),
      ).toEqual([]);
    });
  });

  describe("uploads", () => {
    it("refuse un répertoire vide", () => {
      const c = validConfig();
      expect(issuesOf({ ...c, uploads: { ...c.uploads, dir: "" } })).toEqual([
        "uploads.dir",
      ]);
    });

    it.each([0, -1, 1.5])("refuse une taille max de %s", (maxBytes) => {
      const c = validConfig();
      expect(issuesOf({ ...c, uploads: { ...c.uploads, maxBytes } })).toEqual([
        "uploads.maxBytes",
      ]);
    });

    it("refuse une liste de types vide", () => {
      const c = validConfig();
      expect(
        issuesOf({ ...c, uploads: { ...c.uploads, allowedTypes: [] } }),
      ).toEqual(["uploads.allowedTypes"]);
    });

    it.each(["image", "image/", "image/png; charset=utf-8"])(
      "refuse le type MIME %s",
      (type) => {
        const c = validConfig();
        expect(
          issuesOf({
            ...c,
            uploads: { ...c.uploads, allowedTypes: ["image/png", type] },
          }),
        ).toEqual(["uploads.allowedTypes[1]"]);
      },
    );
  });

  describe("securityHeaders", () => {
    it("refuse un nom d’en-tête invalide", () => {
      const c = validConfig();
      expect(
        issuesOf({ ...c, securityHeaders: { "Mauvais Nom": "x" } }),
      ).toEqual(['securityHeaders["Mauvais Nom"]']);
    });

    it("refuse une valeur avec un retour à la ligne (injection d’en-tête)", () => {
      const c = validConfig();
      expect(
        issuesOf({
          ...c,
          securityHeaders: { "X-Test": "a\r\nSet-Cookie: x=1" },
        }),
      ).toEqual(['securityHeaders["X-Test"]']);
    });

    it("accepte une config sans en-tête de sécurité", () => {
      const c = validConfig();
      expect(issuesOf({ ...c, securityHeaders: {} })).toEqual([]);
    });
  });

  describe("rateLimit", () => {
    it.each([0, -1, 1.5])("refuse un maximum de %s requêtes", (max) => {
      const c = validConfig();
      expect(issuesOf({ ...c, rateLimit: { ...c.rateLimit, max } })).toEqual([
        "rateLimit.max",
      ]);
    });

    it.each([0, -1, 1.5])("refuse une fenêtre de %s ms", (windowMs) => {
      const c = validConfig();
      expect(
        issuesOf({ ...c, rateLimit: { ...c.rateLimit, windowMs } }),
      ).toEqual(["rateLimit.windowMs"]);
    });
  });

  describe("api", () => {
    it.each(["1", "v", "version1", "v1.0", ""])(
      "refuse la version %s",
      (defaultVersion) => {
        const c = validConfig();
        expect(issuesOf({ ...c, api: { defaultVersion } })).toEqual([
          "api.defaultVersion",
        ]);
      },
    );

    it("accepte la version v2", () => {
      const c = validConfig();
      expect(issuesOf({ ...c, api: { defaultVersion: "v2" } })).toEqual([]);
    });
  });

  describe("ConfigError", () => {
    it("collecte toutes les erreurs d’un coup, dans un message lisible", () => {
      const c = validConfig();
      const broken: FrameworkConfig = {
        ...c,
        server: { ...c.server, port: 70000 },
        auth: { ...c.auth, jwtSecret: "" },
      };

      let caught: unknown;
      try {
        validateConfig(broken);
      } catch (error: unknown) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ConfigError);
      if (!(caught instanceof ConfigError)) return; // affine le type pour TypeScript, sans « as »
      const error = caught;
      expect(error.name).toBe("ConfigError");
      expect(error.issues).toEqual([
        { key: "server.port", reason: "doit être un entier entre 0 et 65535" },
        { key: "auth.jwtSecret", reason: "est vide" },
      ]);
      expect(error.message).toBe(
        [
          "Configuration invalide :",
          "  - server.port doit être un entier entre 0 et 65535",
          "  - auth.jwtSecret est vide",
        ].join("\n"),
      );
    });
  });
});
