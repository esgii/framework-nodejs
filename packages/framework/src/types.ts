/**
 * Contrat public du framework (SET-08).
 */
import type { IncomingMessage } from "node:http";

/** Paramètres de la query (?email=a&name=b) : l'objet URL vu en cours. */
export type QueryParams = URLSearchParams;

/** Ce que renvoie le contrôleur. Le body part en JSON, sauf si c'est une chaîne, un Buffer ou un flux. */
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

/** Une erreur sur un champ, utilisée pour les réponses 422. */
export interface FieldError {
    field: string;
    message: string;
    code: string;
}

/** Lancée n'importe où, transformée au format d'erreur unique par le gestionnaire d'erreurs. */
export interface HttpError {
    status: number;
    code: string;
    message: string;
    details: FieldError[];
}

/** Les données lues dans le jeton. */
export interface AuthUser {
    id: string;
    role: string;
}

/** La route trouvée par le routeur. */
export interface ResolvedRoute {
    name: string | null;
    path: string;
    version: string;
}

/** Tout ce qu'un contrôleur ou un middleware peut utiliser. */
export interface Context<P = Record<string, string>, B = unknown> {
    readonly req: IncomingMessage;
    readonly params: P;
    readonly query: QueryParams;
    readonly body: B;
    readonly ip: string;
    readonly version: string;
    /** Rempli par le middleware d'authentification, null si personne n'est connecté. */
    user: AuthUser | null;
    readonly route: ResolvedRoute | null;
    /** Un espace libre partagé entre les middlewares. */
    readonly state: Map<string, unknown>;
}

/** Exécute la suite de la chaîne et rend sa réponse. */
export type Next = () => Promise<HttpResponse>;

export type Middleware = (ctx: Context, next: Next) => Promise<HttpResponse>;

export type Controller<P = Record<string, string>, B = unknown> = (
    ctx: Context<P, B>,
) => HttpResponse | Promise<HttpResponse>;

/** Le résultat d'une validation : la valeur propre, ou la liste des erreurs. */
export type ParseResult<T> =
    | { ok: true; value: T }
    | { ok: false; errors: FieldError[] };

export interface Schema<T> {
    parse(input: unknown): ParseResult<T>;
}

/** Une route, telle que le registre la garde en mémoire. */
export interface RouteDefinition {
    method: string;
    path: string;
    version: string;
    name: string | null;
    middlewares: Middleware[];
    /**
     * Typé Controller<never, never> pour que n'importe quel contrôleur y rentre,
     * y compris un contrôleur avec des params typés ou un body validé
     * (Controller<{ id: string }, { title: string }>).
     * Le routeur construit le vrai contexte et force le type une seule fois à l'appel.
     */
    controller: Controller<never, never>;
}
