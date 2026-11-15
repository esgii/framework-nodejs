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
