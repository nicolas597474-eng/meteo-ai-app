# Phase 4 officielle — Normalisation des données shadow

**État : implémentation shadow validée, prête à publication**

## Objectif

La Phase 4 convertit les valeurs déjà reçues vers un format interne commun et conserve la preuve de chaque conversion. Elle s’applique exclusivement au Data Hub shadow. Elle ne modifie aucune requête fournisseur, aucune source active, aucune prévision publique, aucun score, aucun poids, aucune fusion et aucune archive de production.

> La normalisation répond à la question « cette valeur est-elle exprimée et décrite dans le format canonique attendu ? ». Le contrôle qualité complet de la Phase 5 répondra ensuite à la question « cette donnée est-elle fiable dans son contexte temporel, spatial et météorologique ? ».

## Audit initial réel

Le registre shadow contient 5 520 valeurs réparties entre douze couples variable/unité. Les unités observées sont `Cel`, `mm`, `km/h`, `degree`, `%`, `hPa` et `wmo_code`. Les payloads quotidiens archivés déclarent réellement `°C`, `mm`, `km/h` et `%` dans `daily_units` pour les huit flux P1.

| Contrôle en lecture seule | Résultat initial |
|---|---:|
| Coordonnées hors limites | 0 |
| Horodatages invalides | 0 |
| Valeurs hors shadow | 0 |
| Runs appliqués à la production | 0 |
| Températures structurellement impossibles | 0 |
| Vent, humidité, nuages ou précipitations structurellement impossibles | 0 |
| Direction ou pression structurellement impossible | 0 |

Certaines valeurs sont explicitement manquantes : elles restent nulles et ne doivent jamais être remplacées. La résolution native, l’heure réelle du run et plusieurs métadonnées fournisseur restent inconnues lorsque la preuve n’existe pas.

## Contrat canonique

| Grandeur | Unité canonique | Unités source acceptées | Règle |
|---|---|---|---|
| Température | `Cel` | `°C`, `Cel`, `°F`, `K` | Conversion déterministe vers °C. |
| Vent et rafales | `km/h` | `km/h`, `m/s`, `mph`, `kn` | Conversion déterministe vers km/h. |
| Précipitations | `mm` | `mm`, `cm`, `in` | Conversion déterministe vers mm. |
| Pression | `hPa` | `hPa`, `Pa`, `kPa` | Conversion déterministe vers hPa. |
| Humidité et nébulosité | `%` | `%`, fraction 0–1 | Conservation ou conversion en pourcentage. |
| Direction du vent | `degree` | `degree`, `°`, `rad` | Conversion vers degrés dans l’intervalle 0–360. |
| Visibilité | `km` | `km`, `m` | Conversion déterministe vers km. |
| Neige | `cm` | `cm`, `mm`, `m` | Conversion déterministe vers centimètres. |
| Code météo | `wmo_code` | `wmo_code` | Entier conservé sans conversion. |

Les variables `visibility` et `snowfall_amount` sont définies dans le contrat, mais restent sans valeur tant que le flux multi-modèles existant ne les ingère pas. La Phase 4 n’élargit pas la collecte.

## Vérifications structurelles

Le normaliseur vérifie la présence et la compatibilité de l’unité, la finitude de la valeur, les bornes physiques larges, le timestamp, le fuseau déclaré, les coordonnées, la résolution lorsqu’elle est connue et la cohérence de l’indicateur de donnée manquante. Une unité inconnue ou une valeur impossible est conservée comme anomalie explicite et n’est pas silencieusement transformée.

La Phase 4 n’implémente pas la détection de variation impossible entre deux instants, la fraîcheur, les duplications, les runs incomplets ou les modèles indisponibles. Ces contrôles contextuels appartiennent à la Phase 5.

## Métadonnées persistées

Chaque nouvelle valeur shadow recevra un objet `normalizationMetadata` contenant la version du contrat, l’unité source, l’unité canonique, la conversion appliquée, le fuseau source, l’état des coordonnées et de la résolution, les anomalies détectées et `appliedToProduction: 0`.

| Champ | Règle |
|---|---|
| `version` | `phase4-data-normalization-v1` |
| `sourceUnit` | Valeur réellement déclarée par le payload, sinon `null` |
| `canonicalUnit` | Unité du contrat interne |
| `conversion` | Identifiant déterministe, jamais un texte libre de fournisseur |
| `sourceTimezone` | Fuseau déclaré, sinon `null` |
| `issues` | Liste contrôlée, vide lorsque la normalisation est complète |
| `appliedToProduction` | Toujours `0` |

## Migration additive

Une migration additive ajoute uniquement la colonne JSON nullable `normalizationMetadata` à `shadow_weather_values`. Aucune table de production, contrainte existante, donnée historique ou ligne shadow antérieure n’est modifiée. Les anciennes valeurs restent lisibles avec une métadonnée absente et sont signalées comme héritées dans le rapport propriétaire.

## Rapport propriétaire

Le rapport admin du Data Hub présentera la couverture normalisée par variable, le nombre de conversions, les unités source observées, les métadonnées héritées, les anomalies et les variables prévues par le contrat mais sans ingestion réelle. Il confirmera explicitement zéro application à la production.

## Critères d’acceptation

La Phase 4 est validée lorsque le contrat pur couvre toutes les unités exigées, que les conversions sont testées, que les valeurs réelles des deux lieux reçoivent des métadonnées traçables lors d’un replay shadow idempotent, que les valeurs manquantes restent nulles, que le rapport propriétaire est lisible sur mobile et que tous les lecteurs de production restent indépendants.

## Validation réelle

La migration `0033_supreme_apocalypse.sql` ajoute uniquement la colonne JSON nullable `normalizationMetadata` à `shadow_weather_values`. Le replay a réutilisé les huit payloads quotidiens archivés, puis interrogé les huit mêmes flux horaires existants afin de conserver leurs unités réellement déclarées. Toutes les écritures de validation sont restées dans le Data Hub shadow.

| Contrôle | Résultat par lieu |
|---|---:|
| Sources quotidiennes | 8 |
| Valeurs quotidiennes écrites | 840 |
| Sources horaires | 8 |
| Valeurs horaires écrites | 1 920 |
| Valeurs shadow contrôlées | 2 760 |
| Valeurs normalisées | 2 322 |
| Valeurs manquantes conservées | 438 |
| Anomalies structurelles | 0 |
| Métadonnées héritées sans Phase 4 | 0 |
| Variables réellement ingérées | 12 sur 15 |
| Groupes dupliqués | 0 |
| Application production | 0 |

Les unités source réellement observées sont `°C`, `mm`, `km/h`, `%`, `°`, `hPa` et `wmo code`. La pression horaire est désormais décrite correctement comme `air_pressure_surface`, car le payload fournit `surface_pressure`. `air_pressure_msl`, `visibility` et `snowfall_amount` restent sans ingestion Phase 4 ; aucune valeur n’est fabriquée pour compléter ces variables.

Le contrôle statique ne relève aucun lecteur Phase 4 dans `fusionEngine.ts`, `officialForecast.ts`, `statsEngine.ts`, `manualFusion.ts` ou `officialWeatherSnapshot.ts`. Le panneau reste réservé à l’administrateur. TypeScript réussit, 478 tests réussissent, 2 sont ignorés et le rendu mobile est contrôlé.

## Rollback

Le rollback fonctionnel consiste à arrêter l’écriture et la lecture de `normalizationMetadata` puis à retirer le panneau Phase 4. La colonne nullable peut rester en place sans effet. P1, P1.6, les Phases 2 et 3, la préparation de la Phase 17 et toute la production continuent alors de fonctionner sans changement.

> La Phase 5 de contrôle qualité automatique n’est pas commencée et nécessitera une validation explicite séparée.
