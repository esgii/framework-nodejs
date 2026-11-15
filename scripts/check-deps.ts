import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ALLOWED = new Set([
  "typescript",
  "@types/node",
  "rolldown",
  "vitest",
  "@vitest/coverage-v8",
  "tsx",
  "pg",
  "@types/pg",
  "bcryptjs",
  "@types/bcryptjs",
  "jsonwebtoken",
  "@types/jsonwebtoken",
]);

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

const root = join(import.meta.dirname, "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readManifest(file: string): Promise<Record<string, unknown>> {
  const data: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!isRecord(data)) {
    throw new Error(`${file} ne contient pas un objet JSON`);
  }
  return data;
}

function dependencyNames(manifest: Record<string, unknown>): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const deps = manifest[field];
    return isRecord(deps) ? Object.keys(deps) : [];
  });
}

async function workspaceDirs(patterns: unknown): Promise<string[]> {
  if (!Array.isArray(patterns)) {
    return [];
  }
  const list: readonly unknown[] = patterns;
  const dirs: string[] = [];
  for (const pattern of list) {
    if (typeof pattern !== "string") {
      continue;
    }
    if (!pattern.endsWith("/*")) {
      dirs.push(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    const entries = await readdir(join(root, parent), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(join(parent, entry.name));
      }
    }
  }
  return dirs;
}

const rootManifest = await readManifest(join(root, "package.json"));
const files = ["package.json"];
for (const dir of await workspaceDirs(rootManifest["workspaces"])) {
  const file = join(dir, "package.json");
  if (existsSync(join(root, file))) {
    files.push(file);
  }
}

const forbidden: string[] = [];
for (const file of files) {
  const manifest = await readManifest(join(root, file));
  for (const name of dependencyNames(manifest)) {
    if (!name.startsWith("@carnet/") && !ALLOWED.has(name)) {
      forbidden.push(`  - ${file} : ${name}`);
    }
  }
}

if (forbidden.length > 0) {
  console.error(`Dépendances non autorisées (${forbidden.length}) :\n${forbidden.join("\n")}`);
  console.error("Seules les dépendances de la liste blanche (scripts/check-deps.ts) sont permises.");
  process.exit(1);
}

console.log(`Dépendances vérifiées : ${files.length} package.json, aucune dépendance hors liste.`);
