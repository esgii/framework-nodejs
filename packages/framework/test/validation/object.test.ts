import { describe, expect, expectTypeOf, it } from "vitest";
import { v, type Infer } from "../../src/index.ts";
import { fail } from "../../src/validation/schema.ts";

const journey = v.object({
    title: v.string({ min: 1 }),
    visibility: v.enum(["public", "private"]).default("private"),
    tags: v.array(v.string()).optional(),
});

describe("object", () => {
    it("returns the clean object", () => {
        expect(journey.parse({ title: "Rome", visibility: "public", tags: ["food"] })).toEqual({
            ok: true,
            value: { title: "Rome", visibility: "public", tags: ["food"] },
        });
    });

    it("drops the keys that are not declared", () => {
        const result = journey.parse({ title: "Rome", role: "admin", author_id: 1 });

        expect(result).toEqual({ ok: true, value: { title: "Rome", visibility: "private", tags: undefined } });
    });

    it("applies the default value of a missing key", () => {
        const result = journey.parse({ title: "Rome" });

        expect(result.ok && result.value.visibility).toBe("private");
    });

    it("refuses a missing required key, with the key as field", () => {
        expect(journey.parse({})).toEqual(fail("title", "required", "This field is required"));
    });

    it.each([
        ["an array", []],
        ["null", null],
        ["a string", "Rome"],
    ])("refuses %s", (_label: string, input: unknown) => {
        expect(journey.parse(input)).toEqual(fail("", "type", "Expected an object"));
    });

    it("ignores inherited properties", () => {
        const schema = v.object({ toString: v.string().optional() });

        expect(schema.parse({})).toEqual({ ok: true, value: { toString: undefined } });
    });

    it("gives the full path of an error in a nested object", () => {
        const schema = v.object({ author: v.object({ name: v.string() }) });

        expect(schema.parse({ author: { name: 42 } })).toEqual(fail("author.name", "type", "Expected a string"));
    });

    it("gives the full path of an error in an array of objects", () => {
        const schema = v.object({ steps: v.array(v.object({ title: v.string() })) });
        const input = { steps: [{ title: "Colosseum" }, { title: "Trevi" }, { title: 3 }] };

        expect(schema.parse(input)).toEqual(fail("steps[2].title", "type", "Expected a string"));
    });

    it("is typed from the shape", () => {
        expectTypeOf<Infer<typeof journey>>().toEqualTypeOf<{
            title: string;
            visibility: "public" | "private";
            tags: string[] | undefined;
        }>();
    });
});
