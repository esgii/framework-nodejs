import { describe, expect, it } from "vitest";
import { compile, matchPattern } from "../../src/router/compile.js";
import { RouteError } from "../../src/router/errors.js";

const match = (pattern: string, path: string) =>
  matchPattern(compile(pattern), path);

describe("RTE-04 · compilation des motifs", () => {
  describe("littéraux", () => {
    it("correspond exactement, avec ou sans / final", () => {
      expect(match("/journeys", "/journeys")).toEqual({});
      expect(match("/journeys", "/journeys/")).toEqual({});
      expect(match("/journeys", "/journeys/1")).toBe(null);
      expect(match("/journeys", "/journeysX")).toBe(null);
    });

    it("gère la racine", () => {
      expect(match("/", "/")).toEqual({});
      expect(match("/", "/a")).toBe(null);
    });

    it("échappe les caractères spéciaux des regex", () => {
      expect(match("/a.b", "/a.b")).toEqual({});
      expect(match("/a.b", "/aXb")).toBe(null);
      expect(match("/c++/(x)", "/c++/(x)")).toEqual({});
    });

    it("marque un motif sans paramètre comme statique", () => {
      expect(compile("/journeys").isStatic).toBe(true);
      expect(compile("/journeys/{id}").isStatic).toBe(false);
    });
  });

  describe("paramètres", () => {
    it("capture un paramètre non vide", () => {
      expect(match("/users/{id}", "/users/42")).toEqual({ id: "42" });
      expect(match("/users/{id}", "/users/")).toBe(null);
      expect(match("/users/{id}", "/users")).toBe(null);
    });

    it("un paramètre ne traverse pas les /", () => {
      expect(match("/users/{id}", "/users/42/edit")).toBe(null);
    });

    it("capture plusieurs paramètres dans l’ordre", () => {
      const compiled = compile("/journeys/{journeyId}/steps/{stepId}");
      expect(compiled.names).toEqual(["journeyId", "stepId"]);
      expect(matchPattern(compiled, "/journeys/7/steps/3")).toEqual({
        journeyId: "7",
        stepId: "3",
      });
    });

    it("gère {nom}.json", () => {
      expect(match("/f/{name}.json", "/f/abc.json")).toEqual({ name: "abc" });
      expect(match("/f/{name}.json", "/f/abc.xml")).toBe(null);
      expect(match("/f/{name}.json", "/f/.json")).toBe(null);
    });

    it("gère un littéral avant le paramètre et deux paramètres séparés", () => {
      expect(match("/api/v{version}", "/api/v2")).toEqual({ version: "2" });
      expect(match("/d/{from}-{to}", "/d/2024-2025")).toEqual({
        from: "2024",
        to: "2025",
      });
    });

    it("{path*} capture la fin du chemin avec ses /", () => {
      expect(match("/files/{path*}", "/files/a/b/c.png")).toEqual({
        path: "a/b/c.png",
      });
      expect(match("/files/{path*}", "/files/c.png")).toEqual({
        path: "c.png",
      });
      expect(match("/files/{path*}", "/files/")).toBe(null);
    });

    it("accepte _ et chiffres dans les noms", () => {
      expect(compile("/x/{_id2}").names).toEqual(["_id2"]);
    });
  });

  describe("motifs invalides → RouteError au démarrage", () => {
    it.each<[string, string]>([
      ["/a/{b", "Accolade non fermée"],
      ["/a/{b{c}", "Accolade non fermée"],
      ["/a/b}", "Accolade fermante sans accolade ouvrante"],
      ["/a/}{b}", "Accolade fermante sans accolade ouvrante"],
      ["/a/{}", "Nom de paramètre vide"],
      ["/a/{*}", "Nom de paramètre vide"],
      ["/a/{user-id}", "Nom de paramètre invalide"],
      ["/a/{1id}", "Nom de paramètre invalide"],
      ["/a/{a**}", "Nom de paramètre invalide"],
      ["/a/{id}/b/{id}", "Paramètre « id » en double"],
      ["/a/{x}{y}", "Deux paramètres collés"],
      ["/a/{path*}/b", "doit occuper tout le dernier segment"],
      ["/a/x{path*}", "doit occuper tout le dernier segment"],
      ["/a/{path*}.png", "doit occuper tout le dernier segment"],
    ])("%s", (pattern, message) => {
      expect(() => compile(pattern)).toThrow(RouteError);
      expect(() => compile(pattern)).toThrow(message);
    });
  });
});
