import type { HttpResponse } from "@carnet/framework";

const ok: HttpResponse = { status: 200, headers: {}, body: { status: "ok" } };
console.log(ok);
