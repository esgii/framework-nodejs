export type { Infer, Validator } from "./validation/schema.ts";
export { createValidator } from "./validation/schema.ts";
export { v } from "./validation/index.ts";
export type { StringOptions } from "./validation/string.ts";
export type { NumberOptions } from "./validation/number.ts";
export type { BooleanOptions } from "./validation/primitives.ts";
export type { ArrayOptions } from "./validation/array.ts";
export type { ObjectOutput, Shape } from "./validation/object.ts";
export type * from "./types.ts";
export {
  created,
  html,
  json,
  noContent,
  stream,
  text,
} from "./http/response.ts";

// L'app ajoute ses propres formats (XML, CSV...) sans toucher au framework .
export { registerSerializer } from "./http/serializers.ts";
export type { SerializerFn } from "./http/serializers.ts";

// Les erreurs que l'app peut lancer : le gestionnaire les envoie au format unique .
// La classe HttpError remplace ici l'interface du même nom venue de types.ts :
// elle l'implémente, donc rien ne change pour ceux qui l'utilisaient comme type.
export {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  InternalError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
  UnsupportedMediaTypeError,
} from "./http/errors.ts";

export type {
  AppEnv,
  ApiConfig,
  AuthConfig,
  CorsConfig,
  DatabaseConfig,
  FrameworkConfig,
  RateLimitConfig,
  ServerConfig,
  UploadsConfig,
} from "./core/config.js";

export { ConfigError, validateConfig } from "./core/validate-config.js";
export type { ConfigIssue } from "./core/validate-config.js";
export { Route } from "./router/route.js";
export type { RouteBuilder } from "./router/route.js";
export type { GroupOptions } from "./router/group.js";
export { RouteError } from "./router/errors.js";
export { logger } from "./middleware/logger.js";

// La connexion (createDatabase) reste interne : elle accepte du SQL brut,
// l'app ne doit jamais pouvoir s'en servir directement.
export {
  defineTable,
  IdentifierError,
  sortColumn,
  UnknownSortKeyError,
} from "./db/identifiers.ts";
export type { SortMap, Table } from "./db/identifiers.ts";
export { from, QueryError, SelectQuery } from "./db/select.ts";
export type {
  Column,
  Direction,
  Operator,
  Page,
  SqlParam,
  SqlQuery,
  SqlValue,
} from "./db/select.ts";
export {
  deleteFrom,
  DeleteQuery,
  insert,
  InsertQuery,
  update,
  UpdateQuery,
} from "./db/write.ts";
export type { Row } from "./db/write.ts";
export { RowDecodeError } from "./db/decode.ts";
export type { Decoder } from "./db/decode.ts";
export {
  hashPassword,
  MAX_PASSWORD_BYTES,
  PasswordError,
  verifyPassword,
} from "./security/password.ts";
export { authenticate } from "./middleware/auth.ts";
export type { AuthOptions } from "./middleware/auth.ts";
export { requireRole } from "./middleware/role.ts";
