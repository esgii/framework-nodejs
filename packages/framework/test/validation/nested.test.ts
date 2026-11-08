import { describe, expect, expectTypeOf, it } from "vitest";
import { v, type Infer } from "../../src/index.ts";

/** Un voyage tel que l'app le recevra : trois niveaux de profondeur (journey → steps → location). */
const journey = v.object({
    title: v.string({ trim: true, min: 1, max: 120 }),
    visibility: v.enum(["public", "private"]).default("private"),
    steps: v.array(
        v.object({
            title: v.string({ min: 1 }),
            position: v.number({ int: true, min: 0 }),
            location: v.object({
                city: v.string(),
                lat: v.number({ min: -90, max: 90 }).nullable().default(null),
            }),
        }),
        { max: 50 },
    ),
});

describe("nested schemas", () => {
    it("cleans every level: trims, applies defaults, drops extra keys", () => {
        const input = {
            title: "  Rome  ",
            role: "admin",
            steps: [{ title: "Colosseum", position: 0, id: 99, location: { city: "Rome", country: "IT" } }],
        };

        // toStrictEqual échoue aussi sur les clés en trop, donc on est sûr qu'elles ont bien disparu.
        expect(journey.parse(input)).toStrictEqual({
            ok: true,
            value: {
                title: "Rome",
                visibility: "private",
                steps: [{ title: "Colosseum", position: 0, location: { city: "Rome", lat: null } }],
            },
        });
    });

    it("finds an error three levels deep, with its full path", () => {
        const input = {
            title: "Rome",
            steps: [
                { title: "Colosseum", position: 0, location: { city: "Rome" } },
                { title: "Trevi", position: 1, location: { city: "Rome", lat: 120 } },
            ],
        };

        expect(journey.parse(input)).toEqual({
            ok: false,
            errors: [{ field: "steps[1].location.lat", code: "max", message: "Must be at most 90" }],
        });
    });

    it("collects errors from every level at once", () => {
        const input = {
            title: "",
            visibility: "secret",
            steps: [{ title: "Colosseum", position: -1, location: {} }],
        };
        const result = journey.parse(input);

        expect(result.ok === false && result.errors.map((error) => `${error.field}:${error.code}`)).toEqual([
            "title:min",
            "visibility:enum",
            "steps[0].position:min",
            "steps[0].location.city:required",
        ]);
    });

    it("never changes the input", () => {
        const input = { title: "  Rome  ", steps: [] };

        journey.parse(input);

        expect(input).toEqual({ title: "  Rome  ", steps: [] });
    });

    it("gives the controller a fully typed value", () => {
        expectTypeOf<Infer<typeof journey>>().toEqualTypeOf<{
            title: string;
            visibility: "public" | "private";
            steps: {
                title: string;
                position: number;
                location: { city: string; lat: number | null };
            }[];
        }>();
    });
});
