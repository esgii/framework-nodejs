import { describe, expect, expectTypeOf, it } from "vitest";
import { createValidator, fail, ok, type Infer } from "../../src/validation/schema.ts";

/** Un validateur de test qui n'accepte que le texte "yes". */
const yes = createValidator((input) => (input === "yes" ? ok("yes") : fail("", "type", "Expected yes")));

describe("ok", () => {
    it("wraps the value in a success result", () => {
        expect(ok({ title: "Hello" })).toEqual({ ok: true, value: { title: "Hello" } });
    });
});

describe("fail", () => {
    it("builds a failure result with one field error", () => {
        expect(fail("title", "required", "Title is required")).toEqual({
            ok: false,
            errors: [{ field: "title", code: "required", message: "Title is required" }],
        });
    });
});

describe("createValidator", () => {
    it("runs the check on a present value", () => {
        expect(yes.parse("yes")).toEqual({ ok: true, value: "yes" });
        expect(yes.parse("no")).toEqual(fail("", "type", "Expected yes"));
    });

    it("refuses a missing value with the required code, without running the check", () => {
        expect(yes.parse(undefined)).toEqual(fail("", "required", "This field is required"));
    });

    it("does not treat null as missing", () => {
        expect(yes.parse(null)).toEqual(fail("", "type", "Expected yes"));
    });
});

describe("optional", () => {
    it("accepts undefined and still checks other values", () => {
        const schema = yes.optional();

        expect(schema.parse(undefined)).toEqual({ ok: true, value: undefined });
        expect(schema.parse("yes")).toEqual({ ok: true, value: "yes" });
        expect(schema.parse("no").ok).toBe(false);
    });
});

describe("nullable", () => {
    it("accepts null and still refuses undefined", () => {
        const schema = yes.nullable();

        expect(schema.parse(null)).toEqual({ ok: true, value: null });
        expect(schema.parse(undefined).ok).toBe(false);
    });

    it("can be combined with optional", () => {
        const schema = yes.nullable().optional();

        expect(schema.parse(null)).toEqual({ ok: true, value: null });
        expect(schema.parse(undefined)).toEqual({ ok: true, value: undefined });
    });
});

describe("default", () => {
    it("uses the default value when the field is missing", () => {
        expect(yes.default("yes").parse(undefined)).toEqual({ ok: true, value: "yes" });
    });

    it("keeps a value that is present, and still checks it", () => {
        const schema = createValidator((input) => (typeof input === "number" ? ok(input) : fail("", "type", "Number")));

        expect(schema.default(1).parse(5)).toEqual({ ok: true, value: 5 });
        expect(schema.default(1).parse("5").ok).toBe(false);
    });
});

describe("Infer", () => {
    it("gives the type produced by a schema", () => {
        expectTypeOf<Infer<typeof yes>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<ReturnType<typeof yes.optional>>>().toEqualTypeOf<string | undefined>();
        expectTypeOf<Infer<ReturnType<typeof yes.nullable>>>().toEqualTypeOf<string | null>();
        expectTypeOf<Infer<string>>().toEqualTypeOf<never>();
    });
});
