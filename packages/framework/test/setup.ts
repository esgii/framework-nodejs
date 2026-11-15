// Chargé par vitest avant chaque fichier de test (option setupFiles).
// Le registre de routes est global au module : sans ce reset, une route
// déclarée dans un test serait encore là dans le suivant.
import { beforeEach } from "vitest";
import { Route } from "../src/router/route.js";

beforeEach(() => {
  Route.clear();
});
