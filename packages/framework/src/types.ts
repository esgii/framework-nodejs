/**
 * Public contract of the framework (SET-08).
 */
import type { IncomingMessage } from "node:http";

/** Query string params (?email=a&name=b): the URL object seen in class. */
export type QueryParams = URLSearchParams;

/** What the controller returns. body is sent as JSON unless it is a string or a Buffer. */
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

/** One error on one field, used for 422 responses. */
export interface FieldError {
    field: string;
    message: string;
}

/** Thrown anywhere, turned into the single error format by the error handler. */
export interface HttpError {
    status: number;
    code: string;
    message: string;
    details: FieldError[];
}

/** Data read from the token. */
export interface AuthUser {
    id: string;
    role: string;
}

/** The route found by the router. */
export interface ResolvedRoute {
    name: string | null;
    path: string;
    version: string;
}

/** Everything a controller or a middleware can use. */
export interface Context<P = Record<string, string>, B = unknown> {
    readonly req: IncomingMessage;
    readonly params: P;
    readonly query: QueryParams;
    readonly body: B;
    readonly ip: string;
    readonly version: string;
    /** Set by the auth middleware, null when not logged in. */
    user: AuthUser | null;
    readonly route: ResolvedRoute | null;
    /** Free storage shared between middlewares. */
    readonly state: Map<string, unknown>;
}

/** Runs the rest of the chain and gives back its response. */
export type Next = () => Promise<HttpResponse>;

export type Middleware = (ctx: Context, next: Next) => Promise<HttpResponse>;

export type Controller<P = Record<string, string>, B = unknown> = (
    ctx: Context<P, B>,
) => HttpResponse | Promise<HttpResponse>;

/** Result of a validation: the clean value, or the list of errors. */
export type ParseResult<T> =
    | { ok: true; value: T }
    | { ok: false; errors: FieldError[] };

export interface Schema<T> {
    parse(input: unknown): ParseResult<T>;
}

/** A route as stored by the registry. */
export interface RouteDefinition {
    method: string;
    path: string;
    version: string;
    name: string | null;
    middlewares: Middleware[];
    /**
     * Typed as Controller<never, never> so that any controller fits,
     * including one with typed params or a validated body
     * (Controller<{ id: string }, { title: string }>).
     * The router builds the real context and casts it once when calling.
     */
    controller: Controller<never, never>;
}
