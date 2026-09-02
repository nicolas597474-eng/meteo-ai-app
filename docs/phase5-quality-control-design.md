# Phase 5 officielle — Préparation parallèle du contrôle qualité shadow

**État : préparation shadow validée, P1.6 reste officiellement ouverte**

## Périmètre

La Phase 5 attribue à chaque donnée shadow un statut `VALID`, `SUSPECT`, `INVALID`, `MISSING` ou `STALE`. Elle détecte les valeurs physiquement impossibles, les variations trop rapides, les incohérences temporelles ou spatiales, les duplications, l’indisponibilité d’un modèle et les runs incomplets. Cette préparation est autorisée en parallèle, mais **P1.6 reste officiellement ouverte à 1/7**.

> Le statut QC Phase 5 n’est jamais lu par la prévision publique, la fusion, les scores, les pondérations ou P1.6. Une donnée `INVALID` n’est exclue que des rapports expérimentaux Phase 5 tant qu’aucune promotion n’est validée.

## Audit de l’existant

Le Data Hub contient 5 520 valeurs shadow sur deux lieux : 4 644 portent actuellement le statut structurel `VALID` et 876 le statut `MISSING`. Les 5 520 fraîcheurs sont `UNKNOWN`. Les 32 runs couvrent les huit flux : 16 sont `SUCCESS`, 16 `PARTIAL`, aucun n’est `FAILED`. Aucun groupe dupliqué, aucune coordonnée invalide, aucune valeur hors shadow et aucune application production n’ont été détectés.

Les statuts existants proviennent de la normalisation Phase 4. Ils ne doivent pas être remplacés pendant que P1.6 est ouverte, car l’évaluateur P1.6 vérifie encore le champ historique `qualityStatus`. La Phase 5 nécessite donc des champs dédiés, additifs et indépendants.

## Statuts et précédence

| Statut | Définition shadow | Utilisation expérimentale |
|---|---|---|
| `MISSING` | Valeur absente ou drapeau `missingData = 1`. | Conservée sans valeur et jamais remplacée. |
| `INVALID` | Borne physique dépassée, unité non résolue, timestamp ou coordonnées invalides, valeur non finie ou duplication. | Exclue uniquement du rapport Phase 5. |
| `STALE` | Run reçu depuis plus de 30 heures au moment de l’évaluation. | Conservée mais non présentée comme fraîche. |
| `SUSPECT` | Valeur utilisable avec avertissement : seuil extrême, variation rapide ou run partiel. | Reste utilisable dans l’analyse shadow. |
| `VALID` | Aucun défaut détecté. | Utilisable dans l’analyse shadow. |

La précédence est `MISSING`, puis `INVALID`, puis `STALE`, puis `SUSPECT`, puis `VALID`. Un statut supérieur ne masque pas les motifs secondaires : toutes les règles déclenchées restent enregistrées dans la preuve QC.

## Contrôles déterministes v1

Les bornes absolues réutilisent le contrat structurel Phase 4. Une violation Phase 4 non liée à l’absence de valeur devient `INVALID`. Les seuils d’avertissement suivants sont conservateurs, versionnés et sans effet sur la production.

| Variable | Avertissement `SUSPECT` | Invalidité absolue |
|---|---|---|
| Température | inférieure à −60 °C ou supérieure à 50 °C | hors de −100 à 70 °C |
| Vent moyen | supérieur à 250 km/h | hors de 0 à 500 km/h |
| Rafales | supérieures à 300 km/h | hors de 0 à 500 km/h |
| Précipitations horaires | supérieures à 150 mm | hors de 0 à 1 000 mm |
| Précipitations quotidiennes | supérieures à 500 mm | hors de 0 à 1 000 mm |
| Pression | inférieure à 850 hPa ou supérieure à 1 100 hPa | hors de 800 à 1 200 hPa |
| Humidité et nébulosité | aucun seuil intermédiaire | hors de 0 à 100 % |
| Direction | aucun seuil intermédiaire | hors de 0 à 360 degrés |
| Code météo | aucun seuil intermédiaire | non entier ou hors de 0 à 99 |

Une variation est évaluée seulement entre deux valeurs du même lieu, de la même source, de la même variable, du même niveau et du même type de membre. Le seuil `SUSPECT` est fixé à 15 °C/h pour la température, 150 km/h par heure pour le vent ou les rafales et 20 hPa/h pour la pression. Pour des pas inférieurs ou égaux à trente minutes, le double de ces vitesses devient `INVALID`. L’absence de point précédent ne produit aucun motif.

## Fraîcheur, timestamps et runs

La fraîcheur repose sur `receivedAt`, qui est une preuve d’ingestion et non une heure de run fournisseur. Une donnée est `FRESH` jusqu’à 24 heures, `AGING` entre 24 et 30 heures, puis `STALE`. Un `validTime` antérieur de plus de 24 heures à la réception ou postérieur de plus de 15 jours et 24 heures est incohérent et donc `INVALID`.

Un run `PARTIAL` ajoute un motif `RUN_INCOMPLETE` et rend les valeurs présentes `SUSPECT`, sans transformer les valeurs absentes. Un run `FAILED` ajoute `RUN_FAILED`. L’indisponibilité d’un modèle est calculée dans le rapport à partir des huit sources P1 attendues, sans créer de fausse valeur. La duplication est recherchée sur la clé canonique `run + validTime + variable + level + member`.

## Persistance additive

Une migration additive ajoutera à `shadow_weather_values` les colonnes nullable `phase5QualityStatus`, `phase5QualityMetadata` et `phase5EvaluatedAt`, ainsi que `phase5AppliedToProduction` avec une valeur obligatoire de zéro. Aucun champ existant ne sera réécrit. Les nouvelles écritures shadow recevront la preuve QC v1 ; les anciennes valeurs pourront être évaluées à la lecture ou lors d’un replay shadow contrôlé.

La preuve contiendra la version, le statut, la fraîcheur, les règles déclenchées, les seuils utilisés, le statut du run, la référence temporelle, la décision expérimentale d’usage et `appliedToProduction: 0`.

## Rapport propriétaire

Le rapport administrateur présentera les comptes par statut, variable et source, les motifs les plus fréquents, les runs partiels, les sources indisponibles, les duplications et l’âge du dernier run. Il indiquera explicitement que `SUSPECT` reste utilisable avec avertissement, que `INVALID` est exclu seulement du rapport shadow et que P1.6 demeure ouverte.

## Validation réelle

La migration `0034_lumpy_bedlam.sql` ajoute uniquement quatre champs Phase 5 et deux index à `shadow_weather_values`. Aucun champ P1 à P4 n’est réécrit. Un replay contrôlé a évalué les 5 520 valeurs shadow existantes, puis un second replay identique a confirmé les mêmes comptes sans créer de ligne ni de doublon.

| Contrôle | Résultat par lieu |
|---|---:|
| Valeurs évaluées et preuves persistées | 2 760 |
| `VALID` | 1 785 |
| `SUSPECT` | 537 |
| `INVALID` | 0 |
| `MISSING` | 438 |
| `STALE` | 0 |
| Runs partiels | 8 |
| Sources indisponibles parmi les huit flux P1 | 0 |
| Groupes dupliqués | 0 |
| Application production | 0 |

Les 537 valeurs `SUSPECT` proviennent exclusivement de runs quotidiens partiels, via le motif `RUN_INCOMPLETE`. Les 438 valeurs `MISSING` restent nulles et conservent la précédence sur ce même motif secondaire. Aucune valeur impossible, variation rapide, donnée trop ancienne ou duplication n’est présente dans le jeu réel contrôlé ; les statuts `INVALID` et `STALE` sont couverts par des tests déterministes sans être inventés dans les données réelles.

Le contrôle statique confirme l’absence de lecteur Phase 5 dans `fusionEngine.ts`, `officialForecast.ts`, `statsEngine.ts`, `manualFusion.ts`, `officialWeatherSnapshot.ts` et `weatherP1Observation.ts`. Le panneau est réservé à l’administrateur et rappelle que P1.6 est toujours `OBSERVING` à 1/7. TypeScript réussit, 488 tests réussissent, 2 sont ignorés et le rendu mobile est contrôlé.

## Fichiers autorisés et rollback

Les changements sont limités au contrat `shared/weatherDataHub.ts`, au schéma et à une migration additive, au pipeline `server/weatherDataHubShadow.ts`, aux tests, à un panneau propriétaire dédié, à `WeatherAILab.tsx` et à cette documentation. `weatherP1Observation.ts`, `fusionEngine.ts`, `officialForecast.ts`, les scores, les poids et les archives de production sont hors périmètre.

Le rollback consiste à cesser de renseigner et de lire les quatre champs Phase 5, puis à retirer le panneau. Les colonnes nullable peuvent rester en base. P1 à P4 et P1.6 continuent sans modification.

> La Phase 6 de fusion intelligente n’est pas commencée. La préparation Phase 5 reste shadow et P1.6 demeure ouverte jusqu’à sept dates distinctes.
