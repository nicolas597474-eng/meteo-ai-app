# Phase 2 — Classification officielle des sources

**Auteur : Manus AI**  
**État : implémentation shadow validée, prête à publication**

La Phase 2 classe chaque source selon sa nature météorologique réelle. Elle ne change ni les valeurs collectées, ni la fusion, ni les scores, ni les poids. Le classement est d’abord ajouté au Data Hub shadow, puis vérifié avant toute utilisation ultérieure.

## Catégories officielles

| Catégorie | Définition | État actuel dans MeteoAI |
|---|---|---|
| Modèle déterministe | Une simulation unique issue d’un modèle et d’un run identifiables. | Sept flux actifs : AROME, ARPEGE, ICON EU, ECMWF IFS, GFS, GEM et UKMET. |
| Ensemble | Plusieurs membres simulant l’incertitude autour d’un même système. | Aucun ensemble n’est actuellement connecté au Data Hub. |
| Observation | Une mesure du temps réellement observé à une date et un lieu. | Les stations physiques alimentent déjà un pipeline séparé de mesures. |
| Radar | Une observation spatiale issue d’un radar météorologique, notamment pour les précipitations. | Aucune donnée radar n’est actuellement ingérée dans le Data Hub. |
| Satellite | Une observation spatiale issue d’un instrument satellitaire. | Aucune donnée satellite n’est actuellement ingérée dans le Data Hub. |

Open-Meteo Best Match reste classé comme **agrégateur dérivé non indépendant**. Il ne devient pas un huitième modèle déterministe et ne doit jamais être compté comme une nouvelle famille physique.

## Périmètre shadow initial

La Phase 2 ne crée aucune nouvelle collecte. Elle enrichit seulement le registre P1 des huit flux existants avec une classification contrôlée. Les sept modèles reçoivent la catégorie `DETERMINISTIC`; Best Match reçoit `DERIVED_AGGREGATOR`. Les catégories `ENSEMBLE`, `OBSERVATION`, `RADAR` et `SATELLITE` sont définies dans le contrat, mais aucun flux ne leur est associé tant qu’une ingestion réelle, documentée et vérifiée n’existe pas.

| Flux existant | Catégorie proposée | Rôle | Indépendance |
|---|---|---|---|
| AROME France HD | `DETERMINISTIC` | Prévision numérique | Famille AROME |
| ARPEGE Europe | `DETERMINISTIC` | Prévision numérique | Famille ARPEGE |
| ICON EU | `DETERMINISTIC` | Prévision numérique | Famille ICON |
| ECMWF IFS | `DETERMINISTIC` | Prévision numérique | Famille IFS |
| GFS | `DETERMINISTIC` | Prévision numérique | Famille GFS |
| GEM | `DETERMINISTIC` | Prévision numérique | Famille GEM |
| UKMET | `DETERMINISTIC` | Prévision numérique | Famille UKMET |
| Open-Meteo Best Match | `DERIVED_AGGREGATOR` | Sélection ou assemblage dérivé | Non indépendant |

## Champs shadow appliqués

| Champ | Valeurs initiales | Règle |
|---|---|---|
| `classificationCategory` | `DETERMINISTIC`, `ENSEMBLE`, `OBSERVATION`, `RADAR`, `SATELLITE`, `DERIVED_AGGREGATOR` | Obligatoire pour toute source enregistrée. |
| `classificationRole` | `FORECAST`, `OBSERVATION`, `DERIVED` | Empêche de mélanger prévisions, mesures et produits dérivés. |
| `independenceClass` | Valeur P1 existante | Best Match reste non indépendant. |
| `classificationEvidence` | Version de contrat et justification | Toute classification doit être explicable et versionnée. |
| `classificationAppliedToProduction` | Toujours `0` pendant la Phase 2 shadow | Aucun effet sur la fusion ou les poids. |

## Critères d’acceptation

La classification initiale est acceptable lorsque les huit flux possèdent exactement une catégorie, que les sept modèles sont distingués de Best Match, qu’aucune source inexistante n’est créée, que les catégories radar, satellite, ensemble et observation restent vides sans ingestion réelle, et qu’aucune procédure de production ne lit ces nouveaux champs.

## Validation réelle

Le contrôle en lecture seule du registre shadow confirme les huit lignes attendues. AROME, ARPEGE, ICON, ECMWF, GFS, GEM et UKMET sont `DETERMINISTIC` avec le rôle `FORECAST` et une famille indépendante. Open-Meteo Best Match est `DERIVED_AGGREGATOR`, avec le rôle `DERIVED` et la classe `non_independent`.

| Contrôle | Résultat |
|---|---|
| Sources classées | 8 sur 8 |
| Répartition | 7 déterministes et 1 agrégateur dérivé |
| Catégories vides | Ensemble, observation, radar et satellite |
| Sources interdites dans le registre | 0 Météo-France et 0 OpenWeatherMap |
| Classifications appliquées à la production | 0 |
| Lecteurs de production | Aucun dans la fusion, la prévision officielle ou la fiabilité |
| Validation automatisée | TypeScript réussi ; 464 tests réussis et 2 ignorés |
| Interface | Panneau propriétaire contrôlé sur mobile |

## Rollback

Le rollback fonctionnel consiste à retirer l’enrichissement de classification et son panneau propriétaire. Les champs ou tables additives peuvent rester inutilisés afin d’éviter une suppression destructive. P1, P1.6 et la préparation de la Phase 17 continuent alors de fonctionner sans la classification Phase 2.

> La Phase 2 s’arrête à cette classification shadow. La Phase 3 n’est pas commencée et nécessitera une validation explicite séparée.
