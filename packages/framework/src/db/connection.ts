import pg from "pg";
import { QueryError } from "./conditions.ts";

/** Le résultat d'une requête : les lignes, et le nombre de lignes concernées. */
export interface QueryResult {
  /** Les lignes renvoyées. Leurs valeurs viennent de la base : à vérifier avant usage. */
  readonly rows: Record<string, unknown>[];
  /** Le nombre de lignes lues ou modifiées (utile pour UPDATE et DELETE). */
  readonly rowCount: number;
}

/** Une connexion à PostgreSQL, partagée par tout le framework. */
export interface Database {
  /**
   * Exécute une requête. Les valeurs passent toujours par `params` ($1, $2…),
   * jamais collées dans le texte SQL : c'est ce qui empêche l'injection SQL.
   */
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  /** Vérifie que la base répond ; échoue si elle est injoignable. */
  ping(): Promise<void>;
  /** Ferme toutes les connexions. Peut être appelée plusieurs fois sans erreur. */
  close(): Promise<void>;
  /**
   * Exécute `fn` dans une transaction : tout est validé (COMMIT) si `fn` réussit,
   * tout est annulé (ROLLBACK) si elle lève une erreur, qui est ensuite relancée.
   * Les requêtes doivent passer par `trx` : la base, elle, utiliserait une autre connexion,
   * hors de la transaction.
   */
  transaction<T>(fn: (trx: Database) => Promise<T>): Promise<T>;
}

/** Reçoit les erreurs des connexions inactives (console.error, ou le logger de l'app). */
export type DatabaseErrorHandler = (error: Error) => void;

/**
 * Crée un pool de connexions PostgreSQL à partir de la chaîne de connexion.
 * Le kernel l'ouvre au démarrage et le ferme à l'arrêt.
 */
export function createDatabase(
  url: string,
  onError: DatabaseErrorHandler,
): Database {
  const pool = new pg.Pool({ connectionString: url });
  // Une connexion inactive coupée par la base émet "error" sur le pool :
  // sans écouteur, c'est tout le serveur qui planterait.
  pool.on("error", onError);

  let closing: Promise<void> | undefined;

  return {
    async query(sql, params = []) {
      return toResult(await pool.query(sql, params));
    },

    async ping() {
      await pool.query("SELECT 1");
    },

    close() {
      // Le premier appel ferme le pool ; les suivants attendent la même fermeture.
      closing ??= pool.end();
      return closing;
    },

    async transaction<T>(fn: (trx: Database) => Promise<T>): Promise<T> {
      // Une transaction vit sur UNE connexion : on la prend au pool pour toute sa durée.
      const client = await pool.connect();
      // Une connexion prise au pool n'est plus surveillée par lui : si la base la coupe,
      // son "error" n'aurait aucun écouteur et ferait planter le serveur.
      client.on("error", onError);
      let broken: Error | undefined;
      try {
        await client.query("BEGIN");
        const result = await fn(onClient(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        // Si même le ROLLBACK échoue, la connexion est cassée : on la retient pour la détruire.
        await client.query("ROLLBACK").catch((rollbackError: Error) => {
          broken = rollbackError;
        });
        throw error;
      } finally {
        // Toujours rendre la connexion, sinon le pool se vide et l'app se bloque.
        // Avec une erreur, release la détruit au lieu de la remettre dans le pool.
        // Une connexion saine retourne au pool : on retire l'écouteur pour ne pas les cumuler.
        // Une connexion cassée garde le sien : la coupure peut être signalée juste après.
        if (broken === undefined) client.off("error", onError);
        client.release(broken);
      }
    },
  };
}

/** La base vue depuis une transaction : toutes les requêtes passent par la même connexion. */
function onClient(client: pg.PoolClient): Database {
  return {
    async query(sql, params = []) {
      return toResult(await client.query(sql, params));
    },

    async ping() {
      await client.query("SELECT 1");
    },

    async close() {
      throw new QueryError(
        "Cannot close the database from inside a transaction",
      );
    },

    async transaction() {
      throw new QueryError(
        "Nested transactions are not supported: use trx directly",
      );
    },
  };
}

function toResult(result: pg.QueryResult): QueryResult {
  // rowCount vaut null pour les commandes qui ne comptent pas de lignes (SET…).
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}
