import { describe, expect, it } from "vitest";
import { v } from "../../src/index.ts";
import { prefixErrors } from "../../src/validation/schema.ts";

describe("prefixErrors", () => {
    it("joins keys with a dot and indexes without one", () => {
        const errors = [
            { field: "", code: "type", message: "m" },
            { field: "title", code: "type", message: "m" },
            { field: "[2].title", code: "type", message: "m" },
        ];

        expect(prefixErrors("steps", errors).map((error) => error.field)).toEqual([
            "steps",
            "steps.title",
            "steps[2].title",
        ]);
    });

    it("keeps the code and the message", () => {
        expect(prefixErrors("a", [{ field: "", code: "min", message: "Too short" }])).toEqual([
            { field: "a", code: "min", message: "Too short" },
        ]);
    });
});

describe("collecting every error", () => {
    it("returns one error per wrong field in an object", () => {
        const schema = v.object({
            title: v.string({ min: 3 }),
            visibility: v.enum(["public", "private"]),
            days: v.number({ int: true }),
        });

        expect(schema.parse({ title: "ab", visibility: "secret", days: 1.5 })).toEqual({
            ok: false,
            errors: [
                { field: "title", code: "min", message: "Must be at least 3 characters" },
                { field: "visibility", code: "enum", message: "Expected one of: public, private" },
                { field: "days", code: "int", message: "Expected a whole number" },
            ],
        });
    });

    it("returns one error per wrong item in an array", () => {
        const result = v.array(v.number()).parse(["a", 1, "b"]);

        expect(result.ok === false && result.errors.map((error) => error.field)).toEqual(["[0]", "[2]"]);
    });

    it("reports a size error and the item errors together", () => {
        const result = v.array(v.number(), { min: 3 }).parse(["a"]);

        expect(result.ok === false && result.errors.map((error) => `${error.field}:${error.code}`)).toEqual([
            ":min",
            "[0]:type",
        ]);
    });

    it("gives the exact path of every error in nested data", () => {
        const schema = v.object({
            title: v.string(),
            steps: v.array(v.object({ title: v.string(), position: v.number() })),
        });
        const input = { steps: [{ title: "Colosseum", position: 1 }, { title: 2 }] };

        expect(schema.parse(input)).toEqual({
            ok: false,
            errors: [
                { field: "title", code: "required", message: "This field is required" },
                { field: "steps[1].title", code: "type", message: "Expected a string" },
                { field: "steps[1].position", code: "required", message: "This field is required" },
            ],
        });
    });
});
