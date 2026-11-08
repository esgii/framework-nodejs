import { describe, expect, it } from "vitest";
import { v } from "../../src/index.ts";
import { fail } from "../../src/validation/schema.ts";

describe("array", () => {
    it("validates each item", () => {
        expect(v.array(v.string()).parse(["rome", "food"])).toEqual({ ok: true, value: ["rome", "food"] });
    });

    it("returns the clean items (trimmed here)", () => {
        expect(v.array(v.string({ trim: true })).parse([" rome "])).toEqual({ ok: true, value: ["rome"] });
    });

    it("accepts an empty array without bounds", () => {
        expect(v.array(v.number()).parse([])).toEqual({ ok: true, value: [] });
    });

    it.each([
        ["an object", { 0: "rome" }],
        ["a string", "rome"],
        ["null", null],
    ])("refuses %s", (_label: string, input: unknown) => {
        expect(v.array(v.string()).parse(input)).toEqual(fail("", "type", "Expected an array"));
    });

    it("checks the number of items at the exact limits", () => {
        const schema = v.array(v.number(), { min: 1, max: 2 });

        expect(schema.parse([1]).ok).toBe(true);
        expect(schema.parse([1, 2]).ok).toBe(true);
        expect(schema.parse([])).toEqual(fail("", "min", "Must contain at least 1 items"));
        expect(schema.parse([1, 2, 3])).toEqual(fail("", "max", "Must contain at most 2 items"));
    });

    it("gives the index of the wrong item in the field", () => {
        expect(v.array(v.string()).parse(["rome", 42])).toEqual(fail("[1]", "type", "Expected a string"));
    });
});
