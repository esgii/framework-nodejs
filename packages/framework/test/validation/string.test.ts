import { describe, expect, it } from "vitest";
import { v } from "../../src/index.ts";
import { fail } from "../../src/validation/schema.ts";

describe("string", () => {
    it("accepts a string", () => {
        expect(v.string().parse("Rome")).toEqual({ ok: true, value: "Rome" });
    });

    it.each([
        ["a number", 42],
        ["null", null],
        ["an object", { title: "Rome" }],
    ])("refuses %s", (_label: string, input: unknown) => {
        expect(v.string().parse(input)).toEqual(fail("", "type", "Expected a string"));
    });

    it("refuses a missing value", () => {
        expect(v.string().parse(undefined)).toEqual(fail("", "required", "This field is required"));
    });

    it("checks the minimum length at the exact limit", () => {
        const schema = v.string({ min: 3 });

        expect(schema.parse("abc").ok).toBe(true);
        expect(schema.parse("ab")).toEqual(fail("", "min", "Must be at least 3 characters"));
    });

    it("checks the maximum length at the exact limit", () => {
        const schema = v.string({ max: 3 });

        expect(schema.parse("abc").ok).toBe(true);
        expect(schema.parse("abcd")).toEqual(fail("", "max", "Must be at most 3 characters"));
    });

    it("counts characters, not code units", () => {
        expect(v.string({ max: 1 }).parse("😀").ok).toBe(true);
    });

    it("trims before checking the length", () => {
        const schema = v.string({ trim: true, min: 3 });

        expect(schema.parse("  abc  ")).toEqual({ ok: true, value: "abc" });
        expect(schema.parse("  ab  ").ok).toBe(false);
    });

    it("keeps the spaces without trim", () => {
        expect(v.string().parse(" a ")).toEqual({ ok: true, value: " a " });
    });

    it("checks the pattern", () => {
        const schema = v.string({ regex: /^[a-z]+$/ });

        expect(schema.parse("rome").ok).toBe(true);
        expect(schema.parse("Rome")).toEqual(fail("", "regex", "Invalid format"));
    });

    it("gives the same answer every time with a global pattern", () => {
        const schema = v.string({ regex: /rome/g });

        expect(schema.parse("rome").ok).toBe(true);
        expect(schema.parse("rome").ok).toBe(true);
    });
});

describe("email", () => {
    it("trims and lowercases a valid email", () => {
        expect(v.email().parse("  Lena@Example.COM ")).toEqual({ ok: true, value: "lena@example.com" });
    });

    it.each(["lena", "lena@example", "lena @example.com", "@example.com"])("refuses %s", (input: string) => {
        expect(v.email().parse(input)).toEqual(fail("", "email", "Must be a valid email address"));
    });

    it("refuses something that is not a string", () => {
        expect(v.email().parse(42)).toEqual(fail("", "type", "Expected a string"));
    });

    it("refuses an email longer than 254 characters", () => {
        expect(v.email().parse(`${"a".repeat(250)}@b.co`).ok).toBe(false);
    });
});
