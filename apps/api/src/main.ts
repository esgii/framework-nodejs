import type { HttpResponse } from "@carnet/framework";

import * as framework from "@carnet/framework";
import { ConfigError, validateConfig } from "@carnet/framework";
import { config } from "./config.js";

try {
  validateConfig(config);
} catch (error: unknown) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
console.log(
  `[api] démarrage en mode dev, framework chargé (${Object.keys(framework).length} export(s) runtime)`,
);

console.log("port :", config.server.port);
console.log("CORS :", config.cors.origins);
console.log("secret présent :", config.auth.jwtSecret.length > 0);

const ok: HttpResponse = { status: 200, headers: {}, body: { status: "ok" } };
console.log(ok);
