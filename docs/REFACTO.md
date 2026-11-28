# Brief de refacto — semaines 1 et 2

Projet : framework HTTP Node.js + API « carnet de voyage »
Équipe : Elias, Léna, Eva
Référence : le board « Planning Carnet simplifié » et le sujet du formateur

---

## 0. Pourquoi cette refacto

La première version des tickets ajoutait des choses que le sujet ne demande pas. Nous avons décidé de **revenir strictement au sujet** :

- faire **tout** ce que le sujet exige, ni plus ni moins ;
- garder un code **simple, que chacun des trois peut expliquer** en soutenance ;
- ne pas réécrire ce qui marche déjà et respecte le sujet.

> **Règle d'or :** si le code actuel respecte le sujet, est testé et que tout le monde le comprend, **on ne le touche pas**, même s'il ne ressemble pas à l'exemple du board. Les exemples du board servent à comprendre, pas de modèle à recopier.

---

## 1. Règles communes aux trois lots

### Contraintes du sujet (non négociables)

| Contrainte | Référence | Malus si non respectée |
|---|---|---|
| TypeScript partout, aucun fichier `.js` dans les sources | § 2.11, § 5.1 | Non conforme |
| Mode `strict` actif, aucune option du mode strict désactivée | § 2.11 | — |
| Au plus **une** directive `@ts-expect-error`, justifiée dans le README | § 2.11 | — |
| Pas de `any`, pas de conversion forcée (`as`) dans les types exposés | § 2.11 | — |
| Données extérieures (corps, résultats de base, config) typées `unknown` puis vérifiées | § 2.11 | — |
| Dépendances limitées à : typescript, @types/node, rolldown, vitest, tsx, pg, @types/pg, bcryptjs, @types/bcryptjs, jsonwebtoken, @types/jsonwebtoken | § 5.2 | **−3** |
| Pas d'ORM, de validateur, de framework, de logger, de bundler ou d'exécuteur de tests tiers | § 5.4 | **−2** |
| Pas de conteneur d'injection de dépendances | § 5.4 | **−2** |
| Couverture du framework à **100 %**, et `npm test` **échoue** si elle baisse | § 2.10 | **−3** |
| Aucun secret en dur dans le code versionné | § 2.2, § 2.9 | **−3 par secret** |
| Ne pas committer `node_modules`, `dist`, la base, les uploads, les secrets | § 5.4 | **−0,5** |
| Chaque membre comprend tout le code livré | § 1, § 5.3 | **−3** |

### Ce qu'il ne faut pas changer

- **Les types publics du framework (SET-08)** : `Context`, `Controller`, `Middleware`, `Next`, la réponse et `HttpError`. Les trois lots s'appuient dessus. Tout changement passe par une PR relue **par les trois**.
- **La séparation** : `packages/framework` ne contient aucun code métier, et `apps/api` ne contient aucun code technique (pas de `node:http`, `pg` ni `jsonwebtoken` en direct).
- **Les identifiants des tickets, les blocs et la rotation** du board.
- **Les tests qui passent** : une refacto ne doit jamais faire baisser la couverture.
- **Le comportement exigé par le sujet**, même si le code qui le produit est simplifié.

### Méthode de refacto

1. Chacun relit **son bloc de la semaine 1 et de la semaine 2** avec ce brief.
2. Pour chaque ticket, trois cas :
   - **Conforme et compris** → on ne touche à rien ;
   - **Ajout hors sujet** → on le retire, ou on le garde s'il est déjà testé et ne gêne personne (voir les tableaux « Optionnel ») ;
   - **Manque une exigence** → on la complète.
3. Une PR de refacto par bloc, relue par la personne qui reprend le lot ensuite.
4. Après chaque PR : `npm run typecheck` et `npm test` au vert, couverture à 100 %.
5. Séance d'explication : l'auteur présente le code refactoré aux deux autres.

### Priorités

1. **Obligatoire** : ce que le sujet exige et qui bloque les autres lots (types, config, routeur, middlewares, validation, Query Builder).
2. **Important** : exigé par le sujet, mais moins bloquant (index, recette).
3. **Facultatif** : pas demandé par le sujet. On n'y passe pas de temps.
4. **Bonus** : seulement quand tout le reste marche (semaine 6).

### Questions en attente du formateur

| Ticket | Question | Bloque |
|---|---|---|
| CLR-01 | Le plugin de couverture `@vitest/coverage-v8` est-il autorisé ? | SET-03 |
| CLR-02 | 403 ou 404 quand on modifie le carnet d'un autre ? | APP-24 (semaine 5) |
| CLR-03 | Que faut-il écrire soi-même pour le WebSocket ? | BON-02 (bonus) |
| CLR-04 | Un reverse proxy (Caddy, nginx) dans Docker est-il autorisé pour le HTTPS ? | DEP-03 |

---

## 2. Lot A — Cœur HTTP

| Semaine | Bloc | Codé par | Relu par |
|---|---|---|---|
| 1 | A1 · Contexte, réponses et erreurs | Elias | Eva |
| 2 | A2 · Registre de routes et moteur de middlewares | Eva | Léna |

### A1 — Contexte, réponses et erreurs (CTL-01 à CTL-09)

**Ce que demande le sujet (§ 2.3, § 2.5, § 2.9, § 3.4)**
Un contrôleur reçoit un contexte et renvoie une réponse. C'est la seule façon de traiter une requête. La réponse est en JSON par défaut, mais le framework reste ouvert à d'autres formats. Une réponse n'est envoyée qu'une fois. Le format d'erreur est le même partout, et en production une erreur interne ne montre ni la pile d'appels ni le message de la base.

| Ticket | C'est fini quand |
|---|---|
| CTL-01 Contexte | `ctx` contient params, query, body, headers, ip, user, version, et s'utilise en `({ params }) => …` |
| CTL-02 Contrôleur | Contrôleur = fonction `(ctx) → réponse`, sans jamais toucher à `res` |
| CTL-03 Réponses | `json()`, `created()`, `noContent()` ; JSON par défaut |
| CTL-04 Formats | Registre de formats (json, texte…) ; on peut en ajouter un (ex. XML) sans modifier le framework |
| CTL-05 Réponse unique | Une seule fonction `send()` ; si `res.headersSent`, elle ne fait rien |
| CTL-06 Flux | Un corps `Readable` est envoyé avec `pipeline` |
| CTL-07 Format d'erreur | Toujours `{ error: { code, message, details } }` ; classe `HttpError` et les erreurs utiles (400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500) |
| CTL-08 Gestion des erreurs | `HttpError` → son statut ; toute autre erreur → 500 avec un message générique en production ; `catch (e: unknown)` vérifié avec `instanceof` |
| CTL-09 Tests | Chaque fonction de réponse, format ajouté, envoi unique, flux, erreurs en prod et en dev |

**Optionnel : on peut le retirer (ou le garder seulement s'il est déjà testé)**
- Le typage automatique des params à partir du motif (`ParamsOf<'/journeys/{journeyId}'>`).
- La négociation du format selon l'en-tête `Accept`.
- Les helpers `redirect()` et `html()` s'ils ne servent à rien.
- La gestion de la déconnexion du client pendant un flux, au-delà de `pipeline`.

**À ne pas changer**
- La forme `{ error: { code, message, details } }` : les lots B et C l'utilisent.

### A2 — Registre de routes et moteur de middlewares (RTE-01 à 04, RTE-07, MDW-01 à 05)

**Ce que demande le sujet (§ 2.1, § 2.3, § 2.5)**
Déclarer une route aussi simplement qu'en appelant une fonction, dans le style de Laravel. Les routes peuvent être nommées et regroupées (préfixe, middlewares, préfixe de nom, groupes imbriqués). Le registre doit pouvoir être vidé. Les paramètres s'écrivent entre accolades et cinq formes doivent marcher. Un nom en double est une erreur au démarrage. Les middlewares s'exécutent en oignon, dans l'ordre global → groupes → route. Une exception levée après `next` doit être rattrapée.

| Ticket | C'est fini quand |
|---|---|
| RTE-01 Déclarer | `Route.get('/chemin', ctrl)` marche et on peut enchaîner `.name()` et `.middleware()` |
| RTE-02 Groupes | `Route.group({ prefix, middleware, name }, () => …)` ; dans des groupes imbriqués, les chemins, noms et middlewares se concatènent |
| RTE-03 Vider | `Route.clear()` vide tout ; il est appelé avant chaque test |
| RTE-04 Motifs | Les 5 formes : `{id}` non vide, plusieurs paramètres, `{nom}.json`, fin de chemin avec `/` (ex. `{path*}`), littéraux exacts |
| RTE-07 Noms | Un nom en double lève une erreur au démarrage |
| MDW-01 Oignon | `compose(middlewares, contrôleur)` ; un test montre « A avant, B avant, B après, A après » |
| MDW-02 Ordre | Global → groupes (de l'extérieur vers l'intérieur) → route, prouvé par un test |
| MDW-03 Arrêt de chaîne | Un middleware renvoie une réponse sans appeler `next` ; le contrôleur n'est pas appelé |
| MDW-04 Robustesse | Une erreur levée après `await next()` ou dans du code async est capturée et devient une réponse d'erreur normale |
| MDW-05 Tests | 0, 1 ou plusieurs middlewares, oignon, ordre, arrêt de chaîne, erreur après `next` |

**Optionnel : on peut le retirer (ou le garder seulement s'il est déjà testé)**
- Le « gel » du registre (`freeze`) s'il complique le code.
- L'erreur si `next()` est appelé deux fois.
- Les erreurs détaillées pour les motifs invalides (accolade non fermée, paramètre en double). Le paramètre vide, lui, doit être refusé.
- La normalisation poussée des barres obliques.

**À ne pas changer**
- La signature `Middleware = (ctx, next) => Promise<HttpResponse>`.
- La syntaxe des paramètres `{nom}`. Si vous changez la syntaxe de fin de chemin (`{path*}`), prévenez le lot B, qui en a besoin pour le service de fichiers (FIL-03).

---

## 3. Lot B — Données et sécurité

| Semaine | Bloc | Codé par | Relu par |
|---|---|---|---|
| 1 | B1 · Bibliothèque de validation | Léna | Elias |
| 2 | B2 · Query Builder : connexions, lecture, écriture | Elias | Eva |

### B1 — Bibliothèque de validation (VAL-01 à 06, VAL-08)

**Ce que demande le sujet (§ 2.6)**
Une bibliothèque de validation écrite par nous. Le type final est conçu à l'avance, et la sortie du validateur est l'entrée du contrôleur. Une validation incorrecte renvoie un 422 détaillé champ par champ. L'objet renvoyé ne contient que les clés déclarées. Types à gérer : chaînes (min, max, regex), nombres entiers ou décimaux (bornes, signe), booléens, listes de valeurs, tableaux, objets imbriqués (champs obligatoires ou facultatifs, valeurs par défaut).

| Ticket | C'est fini quand |
|---|---|
| VAL-01 Base | `Schema<T>` avec `parse(unknown)` et `Infer<S>` qui déduit le type |
| VAL-02 Chaînes | `string({ min, max, regex })` |
| VAL-03 Nombres | `number({ int, min, max })`, et une conversion depuis une chaîne pour les paramètres de requête |
| VAL-04 Booléens et listes | `boolean()` et `enum(['public', 'private'])`, typé `'public' \| 'private'` |
| VAL-05 Tableaux et objets | `array(schema)`, `object({…})`, `.optional()`, `.default()` ; clés non déclarées supprimées |
| VAL-06 Erreurs | Chaque erreur donne le chemin du champ (ex. `steps[2].title`) et toutes les erreurs sont listées |
| VAL-08 Tests | Valeurs aux limites exactes, mauvais types, clés en trop, valeurs par défaut, objets imbriqués |

**Optionnel : on peut le retirer (ou le garder seulement s'il est déjà testé)**
- L'option `trim`, le helper `email()` (une regex suffit) et `nullable()`.
- Des codes d'erreur très détaillés : un message clair par champ suffit.

**À ne pas changer**
- `parse()` renvoie soit une valeur nettoyée, soit une liste d'erreurs. VAL-07 (semaine 4) et le Query Builder (QB-09) s'appuient dessus.

### B2 — Query Builder (QB-01 à 05, QB-07, QB-09, DB-01)

**Ce que demande le sujet (§ 2.7, § 3)**
Notre propre Query Builder pour PostgreSQL via `pg`, réutilisable seul. Il construit une requête par assemblage (colonnes, conditions, jointures, tri, pagination, agrégation) puis l'exécute. **Aucune valeur n'est concaténée dans le SQL** : tout passe par des paramètres liés, et un nom de colonne ou un tri venant du client n'est jamais accepté tel quel. Aucune requête brute ne se construit à partir d'une chaîne de l'appelant. Le Query Builder gère les connexions et ne connaît pas HTTP.

| Ticket | C'est fini quand |
|---|---|
| QB-01 Connexion | Un `Pool` `pg` est créé depuis la config, fermé à l'arrêt, sans aucun import HTTP dans `src/db` |
| QB-02 Injection | Valeurs en `$1, $2…` ; tri du client choisi dans une liste fixe ; aucune méthode `raw(sql)` |
| QB-03 SELECT / WHERE | `from().select().where()` produit le bon SQL et le tableau de valeurs |
| QB-04 Jointures | `join()` (INNER) et `leftJoin()` |
| QB-05 Tri et pagination | `orderBy`, `limit` et `offset` en paramètres liés ; une fonction renvoie la page **et le total** |
| QB-07 Écriture | `insert`, `update`, `delete` avec paramètres liés (`RETURNING` pour récupérer la ligne) |
| QB-09 Résultats typés | Lignes traitées comme `unknown` et converties par une fonction ou un schéma, sans `as` |
| DB-01 Schéma SQL | Tables users, journeys, steps, comments (avec `deleted_at`), tags et journey_tags |

**Optionnel : on peut le retirer (ou le garder seulement s'il est déjà testé)**
- Le builder immuable (une nouvelle instance à chaque appel) : un builder qui se modifie lui-même suffit.
- `RIGHT JOIN` et `FULL JOIN`, les groupes AND/OR complexes.
- Le refus d'un `UPDATE` ou `DELETE` sans `WHERE`.
- L'index plein texte et la contrainte différée (passés en « Important » dans DB-02).

**À ne pas changer**
- Les noms de tables et de colonnes du schéma : le lot C et les fonctionnalités métier s'en servent.
- L'interdiction de toute concaténation de valeurs.

---

## 4. Lot C — Infra et transverses

| Semaine | Bloc | Codé par | Relu par |
|---|---|---|---|
| 1 | C1 · Outillage et configuration | Eva | Léna |
| 2 | C2 · Build, CI et infrastructure de déploiement | Léna | Elias |

### C1 — Outillage et configuration (SET-03, SET-04, SET-06, CFG-01 à 04)

**Ce que demande le sujet (§ 2.2, § 2.10, § 2.11)**
Les tests utilisent vitest, avec 100 % de couverture et un seuil bloquant. Le code métier n'est pas testé. En dev, le code se lance avec `tsx`, qui relance à chaque modification. La configuration tient dans un module unique, lu à un seul endroit et transmis au kernel. Elle couvre au minimum : adresse et port, base, secret et durée de vie des jetons, coût de hachage, CORS, uploads, en-têtes de sécurité, limite de débit et version par défaut. Le kernel valide la configuration au démarrage : il refuse de démarrer et nomme la valeur fautive. Aucun secret par défaut.

| Ticket | C'est fini quand |
|---|---|
| SET-03 vitest | Seuils à 100 sur les 4 mesures, mesurés seulement sur `packages/framework` ; `npm test` échoue sous 100 % (preuve faite) |
| SET-04 tsx | `npm run dev` démarre l'API et relance à chaque modification du framework |
| SET-06 .gitignore / .env.example | Ignore `node_modules`, `dist`, `coverage`, `uploads`, `.env` ; `.env.example` sans vraie valeur secrète |
| CFG-01 Type de config | Un champ pour chaque élément de la liste du § 2.2 |
| CFG-02 Config de l'app | `apps/api/src/config.ts` est le seul fichier qui lit `process.env` ; pas de valeur par défaut pour le secret |
| CFG-03 Validation | Démarrage refusé si une valeur manque ou est incohérente, avec un message qui nomme la valeur |
| CFG-04 Tests | Un test par valeur manquante ou incorrecte, plus un test avec une config valide |

**Optionnel : on peut le retirer (ou le garder seulement s'il est déjà testé)**
- L'ordre aléatoire des tests (`sequence.shuffle`).
- Les options TypeScript en plus de `strict` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`…). On peut les garder ; seul `strict` est exigé.

**À ne pas changer**
- **La forme de la configuration** si elle est déjà utilisée par le kernel et les autres lots. Une config imbriquée (`server.port`) ou plate (`port`) convient : ne la changez pas juste pour coller à l'exemple.
- Le seuil de 100 % et son caractère bloquant.

### C2 — Build, CI et déploiement (SET-05, SET-07, SET-10, DEP-01, 02, 03, 06)

**Ce que demande le sujet (§ 2.11, § 2.12, § 5.2)**
Le build de production se fait avec rolldown et sort dans `dist/`. Le conteneur exécute ce build, sans les sources TypeScript, et tourne en non-root. Docker Compose lance au minimum l'API et PostgreSQL, avec un volume nommé. La base n'est pas exposée et son mot de passe n'est pas celui par défaut. L'API est servie en HTTPS sur un nom de domaine. Elle doit rester en ligne pendant la soutenance et un mois après, et redémarrer seule après un reboot. Le secret vient d'une variable d'environnement.

| Ticket | C'est fini quand |
|---|---|
| SET-05 rolldown | `npm run build` crée `dist/` et `node dist/main.js` démarre l'API |
| SET-07 CI | **Facultatif** : pas demandé. Si elle existe déjà et marche, on la garde ; sinon on ne la fait pas |
| SET-10 Dépendances | Tous les `package.json` ne contiennent que la liste du § 5.2 (vérification à la main avant chaque fusion) |
| DEP-01 Dockerfile | Deux étapes ; l'image finale ne contient que `dist/` et les dépendances de production ; `USER node` ; `HEALTHCHECK` |
| DEP-02 docker-compose | API + base ; aucun port ouvert pour la base ; mot de passe lu dans `.env` ; volume nommé ; `schema.sql` monté dans `/docker-entrypoint-initdb.d/` |
| DEP-03 HTTPS | `https://<domaine>/v1/status` répond avec un certificat valide (selon la réponse à CLR-04) |
| DEP-06 Serveur | VPS payé jusqu'à un mois après la soutenance ; après un `reboot`, l'API revient seule ; `.env` présent seulement sur le serveur |

**Optionnel : on peut le retirer (ou le garder seulement s'il est déjà testé)**
- Le script automatique de vérification des dépendances (`check-deps.ts`). Il peut rester s'il existe, mais une vérification à la main suffit.
- Le système de migrations « maison » : il est remplacé par un `schema.sql` exécuté par Postgres au premier démarrage (DB-03, semaine 4).
- La protection de branche et les règles GitHub avancées.

**À ne pas changer**
- `USER node` dans l'image (sinon −1) et l'absence de sources TypeScript dans l'image (sinon −1).
- L'absence de section `ports` sur le service de base de données.

---

## 5. Checklist de fin de refacto

- [ ] `npm run typecheck` passe
- [ ] `npm test` passe, couverture à 100 % sur les 4 mesures
- [ ] Aucune dépendance hors de la liste du § 5.2
- [ ] Aucun `any`, aucun `as` dans les types exposés, au plus un `@ts-expect-error` justifié
- [ ] `grep -r process.env` ne trouve que `apps/api/src/config.ts`
- [ ] Aucun secret ni `.env` dans l'historique git
- [ ] Les types de SET-08 sont inchangés (ou leur changement a été validé à trois)
- [ ] Chaque bloc a été expliqué par son auteur aux deux autres
- [ ] Chacun sait répondre aux questions « À savoir expliquer à l'oral » des tickets des semaines 1 et 2
