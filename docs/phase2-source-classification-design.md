# Phase 2 — Classification officielle des sources

**Auteur : Manus AI**  
**État : périmètre proposé, aucune implémentation de classification commencée**

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

## Périmètre shadow initial proposé

La première implémentation ne créera aucune nouvelle collecte. Elle enrichira seulement le registre P1 des huit flux existants avec une classification contrôlée. Les sept modèles recevront la catégorie `DETERMINISTIC`; Best Match recevra `DERIVED_AGGREGATOR`. Les catégories `ENSEMBLE`, `OBSERVATION`, `RADAR` et `SATELLITE` seront définies dans le contrat, mais aucun flux ne leur sera associé tant qu’une ingestion réelle, documentée et vérifiée n’existe pas.

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

## Champs proposés

| Champ | Valeurs initiales | Règle |
|---|---|---|
| `sourceCategory` | `DETERMINISTIC`, `ENSEMBLE`, `OBSERVATION`, `RADAR`, `SATELLITE`, `DERIVED_AGGREGATOR` | Obligatoire pour toute source enregistrée. |
| `sourceRole` | `FORECAST`, `OBSERVATION`, `DERIVED` | Empêche de mélanger prévisions, mesures et produits dérivés. |
| `independenceClass` | Valeur P1 existante | Best Match reste non indépendant. |
| `classificationEvidence` | Version de contrat et justification | Toute classification doit être explicable et versionnée. |
| `classificationAppliedToProduction` | Toujours `0` pendant la Phase 2 shadow | Aucun effet sur la fusion ou les poids. |

## Critères d’acceptation

La classification initiale sera acceptable lorsque les huit flux posséderont exactement une catégorie, que les sept modèles seront distingués de Best Match, qu’aucune source inexistante ne sera créée, que les catégories radar, satellite, ensemble et observation resteront vides sans ingestion réelle, et qu’aucune procédure de production ne lira ces nouveaux champs.

## Rollback

Le rollback fonctionnel consiste à retirer l’enrichissement de classification et son panneau propriétaire. Les champs ou tables additives peuvent rester inutilisés afin d’éviter une suppression destructive. P1, P1.6 et la préparation de la Phase 17 continuent alors de fonctionner sans la classification Phase 2.

> La prochaine action nécessite une validation explicite : implémenter uniquement cette classification shadow des huit flux existants, sans connecter d’ensemble, de radar, de satellite ou de nouvelle observation.
