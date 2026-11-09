import { describe, expect, it } from "vitest";
import { v } from "../../src/index.ts";
import { fail } from "../../src/validation/schema.ts";

describe("number", () => {
    it("accepts integers and decimals", () => {
        expect(v.number().parse(3)).toEqual({ ok: true, value: 3 });
        expect(v.number().parse(1.5)).toEqual({ ok: true, value: 1.5 });
    });

    it.each([
        ["a string", "3"],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["null", null],
        ["a boolean", true],
    ])("refuses %s", (_label: string, input: unknown) => {
        expect(v.number().parse(input)).toEqual(fail("", "type", "Expected a number"));
    });

    it("refuses a decimal when int is set", () => {
        expect(v.number({ int: true }).parse(1.5)).toEqual(fail("", "int", "Expected a whole number"));
        expect(v.number({ int: true }).parse(2).ok).toBe(true);
    });

    it("checks the bounds at the exact limits", () => {
        const schema = v.number({ min: 1, max: 10 });

        expect(schema.parse(1).ok).toBe(true);
        expect(schema.parse(10).ok).toBe(true);
        expect(schema.parse(0)).toEqual(fail("", "min", "Must be at least 1"));
        expect(schema.parse(11)).toEqual(fail("", "max", "Must be at most 10"));
    });

    it("checks the sign, 0 being neither positive nor negative", () => {
        expect(v.number({ positive: true }).parse(1).ok).toBe(true);
        expect(v.number({ positive: true }).parse(0)).toEqual(fail("", "positive", "Must be positive"));
        expect(v.number({ negative: true }).parse(-1).ok).toBe(true);
        expect(v.number({ negative: true }).parse(0)).toEqual(fail("", "negative", "Must be negative"));
    });
});

describe("number with coerce", () => {
    it("turns a numeric string into a number", () => {
        const schema = v.number({ coerce: true });

        expect(schema.parse("3")).toEqual({ ok: true, value: 3 });
        expect(schema.parse("-1.5")).toEqual({ ok: true, value: -1.5 });
        expect(schema.parse(4)).toEqual({ ok: true, value: 4 });
    });

    it.each(["", " ", "12abc", "0x10", "1e3", "abc"])("refuses %j", (input: string) => {
        expect(v.number({ coerce: true }).parse(input)).toEqual(fail("", "type", "Expected a number"));
    });

    it("applies the other checks after the conversion", () => {
        expect(v.number({ coerce: true, int: true }).parse("1.5").ok).toBe(false);
    });
});
