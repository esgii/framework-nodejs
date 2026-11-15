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
