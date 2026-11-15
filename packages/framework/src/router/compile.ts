import { RouteError } from "./errors.js";

/** Résultat de la compilation d'un motif comme '/journeys/{journeyId}/steps'. */
export interface CompiledPattern {
  /** Le motif d'origine, pour les messages d'erreur. */
  readonly pattern: string;
  /** RegExp avec un groupe nommé par paramètre : (?<journeyId>[^/]+). */
  readonly regex: RegExp;
  /** Noms des paramètres, dans l'ordre d'apparition. */
  readonly names: readonly string[];
  /** true si le motif n'a aucun paramètre (le résolveur le mettra dans une Map, RTE-05). */
  readonly isStatic: boolean;
}

type Token =
  | { readonly kind: "literal"; readonly value: string }
  | {
      readonly kind: "param";
      readonly name: string;
      readonly wildcard: boolean;
    };

/** Un nom de paramètre est un identifiant : lettre ou _, puis lettres, chiffres ou _. */
const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Découpe un segment ('{name}.json', 'v{version}', 'users') en morceaux littéraux
 * et paramètres. Lecture caractère par caractère : contrairement à une regex,
 * aucune accolade orpheline ne peut passer inaperçue.
 */
function tokenize(segment: string, pattern: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  while (position < segment.length) {
    const open = segment.indexOf("{", position);
    const close = segment.indexOf("}", position);

    if (close !== -1 && (open === -1 || close < open)) {
      throw new RouteError(
        `Accolade fermante sans accolade ouvrante dans « ${pattern} »`,
      );
    }
    if (open === -1) {
      tokens.push({ kind: "literal", value: segment.slice(position) });
      return tokens;
    }
    if (open > position) {
      tokens.push({ kind: "literal", value: segment.slice(position, open) });
    }
    // '{id' (pas de }) ou '{a{b}' (une { s'ouvre avant la fermeture de la première)
    const inner = segment.slice(open + 1, close);
    if (close === -1 || inner.includes("{")) {
      throw new RouteError(`Accolade non fermée dans « ${pattern} »`);
    }
    const wildcard = inner.endsWith("*");
    tokens.push({
      kind: "param",
      name: wildcard ? inner.slice(0, -1) : inner,
      wildcard,
    });
    position = close + 1;
  }
  return tokens;
}

/**
 * Compile un motif de route en RegExp. Lève une RouteError au démarrage si le
 * motif est invalide, pour ne jamais découvrir l'erreur pendant une requête.
 *
 *   compile('/users/{id}')       → /^\/users\/(?<id>[^/]+)\/?$/
 *   compile('/f/{name}.json')    → /^\/f\/(?<name>[^/]+)\.json\/?$/
 *   compile('/files/{path*}')    → /^\/files\/(?<path>.+)\/?$/
 */
export function compile(pattern: string): CompiledPattern {
  const segments = pattern.split("/").filter((segment) => segment !== "");
  const names: string[] = [];
  let source = "";

  for (const [index, segment] of segments.entries()) {
    const tokens = tokenize(segment, pattern);
    let previousWasParam = false;
    source += "/";

    for (const token of tokens) {
      if (token.kind === "literal") {
        source += escapeRegExp(token.value);
        previousWasParam = false;
        continue;
      }
      if (token.name === "") {
        throw new RouteError(`Nom de paramètre vide dans « ${pattern} »`);
      }
      if (!PARAM_NAME.test(token.name)) {
        throw new RouteError(
          `Nom de paramètre invalide « ${token.name} » dans « ${pattern} » (lettres, chiffres et _ uniquement)`,
        );
      }
      if (names.includes(token.name)) {
        throw new RouteError(
          `Paramètre « ${token.name} » en double dans « ${pattern} »`,
        );
      }
      if (previousWasParam) {
        // '{a}{b}' : impossible de savoir où finit a et où commence b.
        throw new RouteError(
          `Deux paramètres collés sans séparateur dans « ${pattern} »`,
        );
      }
      if (
        token.wildcard &&
        (index !== segments.length - 1 || tokens.length !== 1)
      ) {
        throw new RouteError(
          `« {${token.name}*} » doit occuper tout le dernier segment dans « ${pattern} »`,
        );
      }
      names.push(token.name);
      source += token.wildcard
        ? `(?<${token.name}>.+)`
        : `(?<${token.name}>[^/]+)`;
      previousWasParam = true;
    }
  }

  return {
    pattern,
    // '/?' : '/users/42/' est accepté comme '/users/42'.
    regex: new RegExp(`^${source}/?$`),
    names,
    isStatic: names.length === 0,
  };
}

/**
 * Teste un chemin contre un motif compilé. Renvoie les paramètres capturés,
 * ou null si le chemin ne correspond pas.
 */
export function matchPattern(
  compiled: CompiledPattern,
  path: string,
): Record<string, string> | null {
  const match = compiled.regex.exec(path);
  if (match === null) return null;
  return { ...match.groups };
}
