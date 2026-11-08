import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { buildContext } from "../../src/http/context.ts";
import { isHttpResponse, runController } from "../../src/http/controller.ts";
import type { Controller, RouteDefinition } from "../../src/types.ts";

const ctx = buildContext(new IncomingMessage(new Socket()));

describe("runController", () => {
    it("runs a synchronous controller", async () => {
        const controller: Controller = () => ({ status: 200, headers: {}, body: { sync: true } });

        expect((await runController(controller, ctx)).body).toEqual({ sync: true });
    });

    it("runs an asynchronous controller", async () => {
        const controller: Controller = async () => ({ status: 200, headers: {}, body: { async: true } });

        expect((await runController(controller, ctx)).body).toEqual({ async: true });
    });

    it("throws when the controller returns something else", async () => {
        const buggy = () => "oops";

        await expect(runController(buggy, ctx)).rejects.toThrow("Controller must return an HttpResponse");
    });
});

describe("isHttpResponse", () => {
    it("accepts a valid response", () => {
        expect(isHttpResponse({ status: 200, headers: {}, body: null })).toBe(true);
    });

    it.each([
        ["a number", 42],
        ["null", null],
        ["no status", { headers: {}, body: null }],
        ["a text status", { status: "200", headers: {}, body: null }],
        ["no headers", { status: 200, body: null }],
        ["text headers", { status: 200, headers: "x", body: null }],
        ["null headers", { status: 200, headers: null, body: null }],
        ["no body", { status: 200, headers: {} }],
    ])("rejects %s", (_label: string, value: unknown) => {
        expect(isHttpResponse(value)).toBe(false);
    });
});

describe("runController with a route", () => {
    it("runs a typed controller stored in a RouteDefinition", async () => {
        const update: Controller<{ id: string }, { title: string }> = ({ params, body }) =>
            ({ status: 200, headers: {}, body: { id: params.id, title: body.title } });
        const route: RouteDefinition = {
            method: "PUT",
            path: "/v1/journeys/{id}",
            version: "v1",
            name: "journeys.update",
            middlewares: [],
            controller: update,
        };
        const routed = { ...ctx, params: { id: "42" }, body: { title: "Rome" } };

        expect((await runController(route.controller, routed)).body).toEqual({ id: "42", title: "Rome" });
    });
});
