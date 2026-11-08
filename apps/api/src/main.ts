import type { HttpResponse } from "@carnet/framework";

import * as framework from "@carnet/framework";

console.log(
  `[api] démarrage en mode dev, framework chargé (${Object.keys(framework).length} export(s) runtime)`,
);

const ok: HttpResponse = { status: 200, headers: {}, body: { status: "ok" } };
console.log(ok);
