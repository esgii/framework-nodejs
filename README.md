# Carnet

API de carnets de voyage, construite sur un framework HTTP maison (`packages/framework`).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance l'API en développement (tsx watch, lit `.env`) |
| `npm run typecheck` | Vérifie les types de tout le monorepo |
| `npm test` | Lance les tests avec le seuil de couverture à 100 % |
| `npm run build` | Construit le bundle de production dans `dist/` |
| `npm start` | Lance le bundle (`dist/main.js`), lit `.env` s'il existe |
| `npm run check-deps` | Échoue si un `package.json` contient une dépendance hors liste blanche |

## Image Docker

Le `Dockerfile` a deux étapes :

- **build** : installe toutes les dépendances, lance `npm run typecheck` puis `npm run build` ;
- **runtime** : repart d'une image `node:22-alpine` vide, installe seulement les dépendances de production (`npm ci --omit=dev`) et copie `dist/`. Aucun fichier `.ts` ni outil de développement n'est présent dans l'image finale.

Le processus tourne avec l'utilisateur `node` (pas `root`). Les fichiers envoyés vont dans `/data/uploads` (`UPLOAD_DIR`), qui sera un volume. La configuration passe par les variables d'environnement, il n'y a pas de `.env` dans l'image.

```bash
docker build -t carnet-api .
docker run --rm --env-file .env -p 3000:3000 carnet-api
```

Le `HEALTHCHECK` interroge `GET /v1/status` : il restera en échec tant que le serveur HTTP (kernel) et la route de statut n'existent pas. La copie des migrations SQL sera ajoutée avec DB-01.

## Docker Compose

`docker-compose.yml` lance deux services :

- **db** : PostgreSQL 16, sans port publié (joignable seulement par l'API, sur le réseau interne de Compose). Ses données sont dans le volume nommé `pgdata` ;
- **api** : l'image du `Dockerfile`, lancée quand `db` est prête (healthcheck `pg_isready`). Elle lit `.env`, mais Compose impose `NODE_ENV=production`, `UPLOAD_DIR=/data/uploads` (volume `uploads`) et une `DATABASE_URL` qui pointe vers `db`. Le port 3000 n'est publié que sur `127.0.0.1` : depuis Internet, l'accès passera par le reverse proxy.

Les deux services redémarrent seuls (`restart: unless-stopped`), y compris après un redémarrage de la machine.

`.env` doit contenir `DB_PASSWORD` (Compose refuse de démarrer sinon). Générer une valeur sans caractère spécial, car elle est insérée dans une URL :

```bash
openssl rand -hex 32
```

```bash
docker compose up -d --build   # construit l'image et démarre db puis api
docker compose ps              # état et healthchecks
docker compose logs -f api
docker compose down            # arrête, les volumes (données) sont conservés
```

`docker compose down -v` supprime aussi les volumes, donc **toute la base et les fichiers envoyés**.

## Reverse proxy HTTPS

Le serveur de production fait déjà tourner Apache sur les ports 80 et 443 pour d'autres sites. L'API n'a donc pas son propre proxy (Caddy) dans `docker-compose.yml` : c'est Apache qui reçoit les requêtes HTTPS du sous-domaine de l'API et les transmet à `127.0.0.1:3000`, le seul port publié par le conteneur `api`.

`deploy/apache/carnet.conf` est le modèle du site Apache (remplacer `carnet.example.com` par le vrai nom de domaine). Il a besoin des modules `proxy`, `proxy_http` et `headers`. Le certificat Let's Encrypt est obtenu et renouvelé par certbot, qui ajoute lui-même le site HTTPS et la redirection depuis HTTP :

```bash
sudo a2enmod proxy proxy_http headers
sudo a2ensite carnet
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d <domaine>
```

## Déploiement sur le serveur

Prérequis : un VPS Linux avec Docker (service activé au démarrage), Apache et certbot, et un enregistrement DNS `A` du sous-domaine de l'API vers l'IP du serveur. Seuls les ports 22, 80 et 443 doivent être ouverts.

Première installation :

```bash
git clone -b main <url-du-dépôt> /var/www/carnet
cd /var/www/carnet
cat > .env <<EOF
NODE_ENV=production
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
DB_PASSWORD=$(openssl rand -hex 32)
CORS_ENABLED=false
EOF
chmod 600 .env
sudo systemctl enable docker
sudo docker compose up -d --build
```

Les secrets sont générés sur le serveur et n'en sortent pas. Le dossier ne doit être publié par aucun `DocumentRoot` Apache. Configurer ensuite le reverse proxy (section précédente).

Mise à jour :

```bash
cd /var/www/carnet
git pull
sudo docker compose up -d --build
```

Après un redémarrage de la machine, Apache, Docker et les conteneurs (`restart: unless-stopped`) repartent seuls.

### Création des tables

Le docker-compose monte `apps/api/migrations/001_init.sql` dans `/docker-entrypoint-initdb.d/` du service `db`. Postgres l'exécute **une seule fois**, au premier démarrage, quand le volume `pgdata` est vide. Sur une première installation, les tables sont donc créées sans rien faire.

Si le volume existe déjà (base créée avant ce montage), le fichier n'est pas rejoué. Deux possibilités :

```bash
# Base vide ou jetable : recréer les volumes (efface la base ET les fichiers envoyés)
sudo docker compose down -v
sudo docker compose up -d --build

# Base à conserver : exécuter le schéma une fois à la main
sudo docker compose exec -T db psql -U postgres -d carnet -v ON_ERROR_STOP=1 < apps/api/migrations/001_init.sql
```

## Intégration continue

`.github/workflows/ci.yml` tourne sur chaque pull request et sur chaque push sur `main`. Les étapes s'arrêtent à la première erreur :

1. `npm ci` : installe exactement les versions de `package-lock.json` ;
2. `npm run typecheck` : le build ne vérifie pas les types, c'est cette étape qui le fait ;
3. `npm test` : tests et seuil de couverture à 100 %, avec un service PostgreSQL 16 disponible (`DATABASE_URL`) ;
4. `npm run build` : le bundle de production doit se construire ;
5. `npm run check-deps` : aucune dépendance hors liste.

## Dépendances autorisées

Le projet n'a droit qu'à une liste fermée de dépendances npm : `typescript`, `@types/node`, `rolldown`, `vitest`, `@vitest/coverage-v8`, `tsx`, `pg`, `@types/pg`, `bcryptjs`, `@types/bcryptjs`, `jsonwebtoken`, `@types/jsonwebtoken`. Les paquets internes `@carnet/*` sont toujours acceptés.

`scripts/check-deps.ts` lit le `package.json` racine et celui de chaque workspace, liste tous les paquets hors liste, puis s'arrête avec le code 1 s'il en a trouvé. La CI le lance sur chaque PR. Pour autoriser un nouveau paquet, il faut l'accord du formateur, puis l'ajouter à la liste dans ce script.

## Build de production

`rolldown.config.ts` part de `apps/api/src/main.ts` et produit un seul fichier ESM, `dist/main.js`, avec sa sourcemap.

**Inclus dans le bundle** : le code de l'API et le framework `@carnet/framework`, importé depuis ses sources TypeScript. Le framework n'est jamais publié séparément, donc il est toujours bundlé.

**Laissés en dehors (`external`)** : `pg`, `bcryptjs` et `jsonwebtoken`. Ce sont les seules dépendances npm de production autorisées. Elles sont installées dans l'image Docker avec `npm ci --omit=dev`. Pourquoi ce choix plutôt que tout bundler :

- `pg` charge certains modules de façon dynamique, ce qui se bundle mal ;
- les versions installées restent visibles dans `package-lock.json` et vérifiables par `npm audit` ;
- le bundle reste petit et lisible, puisqu'il ne contient que notre code.

**Le build ne vérifie pas les types** : rolldown retire les annotations TypeScript sans les contrôler. La CI lance donc `npm run typecheck` avant `npm run build`.

Pour tester le bundle en local :

```bash
npm run build
npm start          # avec un .env valide, sinon l'API refuse de démarrer
```
