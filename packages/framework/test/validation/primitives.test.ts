import { describe, expect, expectTypeOf, it } from "vitest";
import { v, type Infer } from "../../src/index.ts";
import { fail } from "../../src/validation/schema.ts";

describe("boolean", () => {
    it("accepts true and false", () => {
        expect(v.boolean().parse(true)).toEqual({ ok: true, value: true });
        expect(v.boolean().parse(false)).toEqual({ ok: true, value: false });
    });

    it.each([
        ["a string", "true"],
        ["a number", 1],
        ["null", null],
    ])("refuses %s without coerce", (_label: string, input: unknown) => {
        expect(v.boolean().parse(input)).toEqual(fail("", "type", "Expected a boolean"));
    });

    it("turns 'true' and 'false' into booleans with coerce", () => {
        const schema = v.boolean({ coerce: true });

        expect(schema.parse("true")).toEqual({ ok: true, value: true });
        expect(schema.parse("false")).toEqual({ ok: true, value: false });
        expect(schema.parse(true)).toEqual({ ok: true, value: true });
    });

    it.each(["yes", "1", "TRUE", ""])("refuses %j even with coerce", (input: string) => {
        expect(v.boolean({ coerce: true }).parse(input).ok).toBe(false);
    });
});

describe("enum", () => {
    const visibility = v.enum(["public", "private"]);

    it("accepts a value from the list", () => {
        expect(visibility.parse("public")).toEqual({ ok: true, value: "public" });
    });

    it("refuses a value outside the list, and lists the allowed values", () => {
        expect(visibility.parse("secret")).toEqual(fail("", "enum", "Expected one of: public, private"));
    });

    it("refuses a value of another type", () => {
        expect(visibility.parse(1).ok).toBe(false);
    });

    it("is typed as the union of the values", () => {
        expectTypeOf<Infer<typeof visibility>>().toEqualTypeOf<"public" | "private">();
    });
});
