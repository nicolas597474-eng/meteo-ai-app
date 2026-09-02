# Phase 3 officielle — Hiérarchie selon l’horizon

**État : implémentation shadow validée, prête à publication**

## Objectif

La Phase 3 crée une stratégie différente selon l’échéance, sans changer la prévision affichée. Elle ne calcule aucun nouveau poids, ne remplace pas la fusion actuelle et n’intègre aucune source. Son résultat est un contrat shadow expliquant quelles familles de données devraient être prioritaires et lesquelles sont réellement disponibles dans le Data Hub P1.

> La hiérarchie Phase 3 reste informative et réservée au propriétaire. `appliedToProduction` demeure toujours égal à zéro.

## Fenêtres officielles

| Fenêtre | Priorités prescrites | Situation actuelle vérifiée |
|---|---|---|
| 0 à 2 heures | Observations, radar, AROME PI/PIAF, satellite, très court terme, modèles classiques en complément | Seuls les sept modèles déterministes sont connectés ; toutes les priorités de très court terme sont absentes. |
| 2 à 6 heures | Observations, radar, AROME PI/PIAF, AROME, ensembles, autres modèles | AROME et les six autres déterministes sont disponibles ; observations, radar, PI/PIAF et ensembles sont absents. |
| 6 à 24 heures | AROME, ECMWF, AIFS, ICON, ensembles, observation pour correction initiale | AROME, ECMWF et ICON sont disponibles ; AIFS, ensembles et observation intégrée au Data Hub sont absents. |
| 1 à 3 jours | ECMWF, AIFS, AROME, ICON, GFS, UKMET, GEM, ECMWF ENS, GEFS et autres ensembles | Les sept déterministes existants peuvent être évalués ; AIFS et tous les ensembles sont absents. |
| 3 à 7 jours | ECMWF, AIFS, ECMWF ENS, GEFS, ICON Ensemble, GFS et autres modèles pertinents | ECMWF, GFS et les autres déterministes réellement présents peuvent être évalués ; AIFS et ensembles sont absents. |
| 7 à 15 jours | ECMWF ENS, AIFS ENS, GEFS, autres ensembles et consensus multi-source | Aucune source ensembliste n’est connectée. Les déterministes ne peuvent être affichés que comme contexte et jamais comme une certitude. |

Open-Meteo Best Match demeure un **agrégateur dérivé non indépendant**. Il peut servir de repère shadow, mais ne satisfait jamais une priorité demandant un modèle ou un consensus indépendant.

## Audit des données réelles

Les payloads quotidiens déjà archivés en production contiennent seize dates pour chacun des huit flux et chacun des deux lieux contrôlés. Le dernier point vérifié atteint le quinzième jour civil. Le Data Hub shadow P1 ne persiste actuellement que le jour cible et vingt-quatre heures par modèle : les fenêtres supérieures à vingt-quatre heures doivent donc être enrichies uniquement à partir du payload déjà reçu, sans nouvel appel fournisseur et sans nouvelle écriture de production.

Le champ P1 `forecastHorizonMinutes` existe déjà, mais reste nul. La Phase 3 le renseignera comme l’écart entre `validTime` et `receivedAt`. Ce repère mesure l’échéance depuis la réception du payload ; il ne doit pas être présenté comme l’heure réelle du run fournisseur tant que la preuve Phase 17 n’est pas exacte.

## Contrat shadow prévu

Le contrat partagé contiendra les six fenêtres, leurs bornes en minutes, leurs niveaux de priorité, les capacités attendues et les sources P1 admissibles. L’évaluateur produira pour chaque fenêtre un état `COMPLETE`, `PARTIAL` ou `UNAVAILABLE`, les sources réellement couvertes, les capacités manquantes, la présence éventuelle du repère Best Match et le nombre appliqué à la production.

| Élément | Règle |
|---|---|
| Référence d’horizon | `receivedAt`, explicitement signalé comme proxy d’ingestion |
| Valeurs quotidiennes | Réutilisation du `rawData.daily` déjà reçu, limitée à quinze jours d’échéance |
| Valeurs horaires | Conservation du flux horaire P1 existant |
| Sources absentes | Restent déclarées manquantes, jamais simulées |
| Best Match | Repère dérivé, jamais compté comme source indépendante |
| Production | Aucun lecteur, aucun poids et aucun calcul actif |
| Interface | Rapport propriétaire dans l’AI Lab uniquement |

## Fichiers autorisés

L’implémentation peut modifier le contrat partagé `shared/weatherDataHub.ts`, le pipeline `server/weatherDataHubShadow.ts`, leurs tests, un panneau propriétaire dédié et son raccordement conditionnel dans `WeatherAILab.tsx`. Une migration n’est pas nécessaire, car le champ d’horizon existe déjà. Les collecteurs, `fusionEngine.ts`, `officialForecast.ts`, les scores, les pondérations et les archives historiques sont hors périmètre.

## Critères d’acceptation

La Phase 3 est validée lorsque les six fenêtres sont uniques et continues, que chaque nouvelle valeur shadow porte une échéance traçable, que les payloads existants alimentent réellement les fenêtres jusqu’à quinze jours, que toute capacité absente reste explicitement manquante, que Best Match reste non indépendant et que le rapport confirme zéro application à la production. Les anciennes valeurs P1 dont l’échéance n’avait pas été persistée sont évaluées sans réécriture, à partir de leur `validTime` et du `receivedAt` de leur run.

## Validation réelle

Le replay contrôlé a réutilisé, sans nouvel appel de prévision, les payloads quotidiens déjà archivés pour les huit flux et les deux lieux. Il a persisté 840 valeurs shadow par lieu, puis un contrôle indépendant en lecture seule a confirmé les six fenêtres et l’absence d’application à la production.

| Contrôle | Résultat réel |
|---|---|
| Lieux contrôlés | `50.676_2.845` et `50.756_2.521` |
| Fenêtres évaluées | 6 sur 6 |
| Valeurs avec horizon résolu par lieu | 1 720 |
| Anciennes valeurs hors fenêtre résoluble par lieu | 1 040, conservées explicitement sans horizon |
| 0–2 h | Priorités indisponibles ; 7 déterministes en contexte et Best Match comme repère dérivé |
| 2–6 h | Couverture partielle ; 7 déterministes et 1 repère dérivé |
| 6–24 h | Couverture partielle ; 7 déterministes et 1 repère dérivé |
| 1–3 j | Couverture partielle ; 6 déterministes réellement présents et 1 repère dérivé |
| 3–7 j | Couverture partielle ; 4 déterministes réellement présents et 1 repère dérivé |
| 7–15 j | Priorités indisponibles ; 3 déterministes en contexte et 1 repère dérivé, sans ensemble ni consensus |
| Application production | 0 |
| Validation automatisée | TypeScript réussi ; 472 tests réussis et 2 ignorés |
| Interface | Panneau propriétaire vérifié sur mobile |

Le contrôle statique ne relève aucun lecteur Phase 3 dans `fusionEngine.ts`, `officialForecast.ts`, `statsEngine.ts`, `manualFusion.ts` ou `officialWeatherSnapshot.ts`. Aucune migration, source, pondération, correction, archive historique ou prévision publique n’a été ajoutée ou modifiée.

## Rollback

Le rollback fonctionnel consiste à cesser de renseigner `forecastHorizonMinutes`, à retirer l’évaluateur et le panneau Phase 3. Les valeurs shadow enrichies peuvent rester archivées sans être lues. P1, P1.6, la Phase 2 et la préparation de la Phase 17 continuent alors de fonctionner sans changement.

> La Phase 4 de normalisation générale n’est pas commencée et nécessitera une validation explicite séparée.
