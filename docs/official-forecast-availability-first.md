# Disponibilité d’abord : moteurs officiels de prévision

## Règle de calcul

Pour chaque `validTime` et chaque variable, le flux officiel est :

> **Availability → sélection exacte → fiabilité historique → pondération → renormalisation → fusion**

Un modèle contribue uniquement si un run admissible existe réellement pour le lieu, la variable et l’échéance, si sa valeur est finie et si son identité/timestamp sont cohérents. L’horizon est calculé à partir des horodatages du run (`validTime` et `availableAt`), pas d’une hypothèse globale fondée sur la seule date cible. L’historique est ensuite recherché pour le modèle, le lieu, la variable et le bucket exacts. L’absence d’historique change le statut de calibration et la pondération, pas la disponibilité physique de la valeur.

- **0 valeur admissible** : `UNAVAILABLE`.
- **1 valeur admissible** : valeur conservée, statut `SINGLE_MODEL`, sans la nommer « fusion multimodèle ».
- **2 valeurs ou plus** : fusion des seuls contributeurs effectivement présents, avec renormalisation dynamique.
- Preuve complète, partielle ou insuffisante : `CALIBRATED`, `PARTIALLY_CALIBRATED` ou `UNCALIBRATED_ROBUST`. Un fallback robuste conserve les valeurs utilisables; le plafonnement ne peut pas rendre à lui seul la sortie `NULL`.

Une absence à J+7–J+15 (par exemple AROME, ARPEGE ou UKMET hors de leur portée normale) est un fait de **couverture**, pas une erreur de modèle ni une mauvaise performance. Elle ne devient pas un échec dans les classements, les scores ou leurs dénominateurs.

## Niveau indicatif selon le nombre de contributeurs

L’interface peut présenter, pour chaque échéance et variable, un **niveau de couverture/confiance indicatif selon le nombre de modèles effectivement contributeurs** : 0 = indisponible; 1 = prévision d’un modèle unique; 2 = confiance réduite; 3–4 = confiance moyenne; 5 ou plus = confiance élevée. Ces catégories sont uniquement descriptives : elles ne sont ni une probabilité ni une confiance statistiquement calibrée et ne modifient aucune valeur, aucun poids ni aucun score. Elles restent distinctes des statuts historiques `CALIBRATED`, `PARTIALLY_CALIBRATED` et `UNCALIBRATED_ROBUST`.

## Chemins en production

| Chemin | Rôle | Traitement |
| --- | --- | --- |
| `server/forecastModelSelection.ts` | Sélecteur commun des runs | Vérifie l’identité du modèle, le lieu, le `validTime`, le `availableAt`, la variable et l’horizon; trace les admissions et exclusions. |
| `server/officialForecast.ts` | Moteur quotidien officiel | Sélection et fusion par variable/échéance; réutilise `computeFusion` et les preuves de performance exactes. |
| `server/officialHourlyForecast.ts` | Moteur horaire officiel | Sélection et fusion par variable et heure UTC; historique exact modèle × variable × bucket et repli robuste par valeur disponible. |
| `server/officialWeatherSnapshot.ts` | Assemblage du snapshot live | Combine le moteur horaire officiel, le snapshot météo courant distinct et la série quotidienne officielle. Le fallback quotidien, lorsqu’il n’existe aucune heure, reste daté et séparé de la série horaire. |
| `server/weatherServices.ts` | Collecte de runs | `collect15DayForecast` conserve `requestStartedAt`, `availableAt`, le `runId` et le `validTime`; `collectHourlyForecastAllModelsWithDiagnostics` fait de même pour l’horaire multimodèle. |
| `server/scheduledHandlers.ts`, `server/manualFusion.ts`, `server/routers/weather.ts` | Relances planifiées, manuelles et endpoint d’administration | Alimentent les mêmes moteurs officiels; Best Match est exclu des entrées et preuves de fusion. |
| `server/hourlyForecastRunScoring.ts`, `server/dailyForecastPerformance.ts` | Évaluation historique | Score uniquement les couples run/observation admissibles. Un run absent ou hors portée ne crée ni erreur synthétique ni perte de couverture dans le dénominateur de performance. |

Les traces exposent séparément la disponibilité, l’état de calibration, les compteurs de modèles disponibles/contributeurs, les timestamps de run, les poids bruts/robustes/finals et les motifs d’exclusion.

## Chemins auxiliaires qui ne sont pas des fusions officielles

- **Open-Meteo Best Match** est une référence comparative (`officialContributor: false`). Dans les prévisions quotidiennes, il reste dans `bestMatchReference`; dans les longues périodes horaires auxiliaires de `collectHourlyForecast`, il est identifié comme `open_meteo_best_match_reference`. Il n’est jamais un modèle déterministe supplémentaire dans la fusion ni dans son scoring.
- `collectHourlyForecast` sert au chemin auxiliaire Best Match/longue période; le snapshot officiel multimodèle passe par `collectOfficialHourlyForecast`.
- `collectCurrentWeatherSnapshot` et `fetchCurrentModelReferences` décrivent des références météo **actuelles** et séparées des runs de prévision.
- `calculateUltraLocal` et `computeFusion` dans les routes stations servent à la synthèse locale de stations/observations et au fallback de température courante; ils ne remplacent pas le moteur officiel de prévision quotidienne ou horaire.

## Override horaire manuel

Une relance manuelle peut mettre temporairement sa série en cache pour le lieu. Elle est marquée `manualOverride` dans le résumé horaire avec son motif, son horodatage et la preuve que la série officielle originale est conservée. Le snapshot conserve `officialHourlyOriginal` en mémoire; l’avis horaire indique visiblement qu’un override a été appliqué et que l’original est préservé. Le point météo courant et la fusion quotidienne ne sont pas remplacés par cette opération.
