// Chargé par vitest avant chaque fichier de test (option setupFiles).
//
// QA-01 : chaque test part d'un état propre, quel que soit l'ordre (vitest mélange
// l'ordre des fichiers et des tests : sequence.shuffle dans vitest.config.ts).
// Le framework n'a que deux états partagés par tout le processus, remis à zéro ici :
// - le registre de routes : une route déclarée dans un test serait encore là dans le suivant ;
// - le registre des formats de réponse : un format ajouté (text/csv…) le resterait.
//
// Le reste est remis à zéro par le test qui l'utilise :
// - la configuration n'est jamais globale : chaque test construit la sienne ;
// - la base : chaque fichier de test/db/ crée sa propre table, la vide avant chaque
//   test (TRUNCATE) et la supprime à la fin ;
// - les fichiers envoyés (FIL, semaine 4) : un dossier temporaire par test.
import { beforeEach } from "vitest";
import { serializers } from "../src/http/serializers.js";
import { Route } from "../src/router/route.js";

beforeEach(() => {
  Route.clear();
  serializers.reset();
});
