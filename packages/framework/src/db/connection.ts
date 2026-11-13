import pg from "pg";

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
}

/** Reçoit les erreurs des connexions inactives (console.error, ou le logger de l'app). */
export type DatabaseErrorHandler = (error: Error) => void;

/**
 * Crée un pool de connexions PostgreSQL à partir de la chaîne de connexion.
 * Le kernel l'ouvre au démarrage et le ferme à l'arrêt.
 */
export function createDatabase(url: string, onError: DatabaseErrorHandler): Database {
    const pool = new pg.Pool({ connectionString: url });
    // Une connexion inactive coupée par la base émet "error" sur le pool :
    // sans écouteur, c'est tout le serveur qui planterait.
    pool.on("error", onError);

    let closing: Promise<void> | undefined;

    return {
        async query(sql, params = []) {
            const result = await pool.query(sql, params);
            // rowCount vaut null pour les commandes qui ne comptent pas de lignes (SET…).
            return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        },

        async ping() {
            await pool.query("SELECT 1");
        },

        close() {
            // Le premier appel ferme le pool ; les suivants attendent la même fermeture.
            closing ??= pool.end();
            return closing;
        },
    };
}
