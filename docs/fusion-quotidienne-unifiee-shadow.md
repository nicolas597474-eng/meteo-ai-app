# Fusion quotidienne unifiée — rapport de consolidation shadow

**Date :** 2 octobre 2026  
**Périmètre :** cohérence entre les prévisions quotidiennes et horaires, sans modification de la production.  
**Statut :** **shadow uniquement** — aucune sortie publique, aucun poids officiel, score officiel ou archive de production n’est lu ou modifié par ce travail.

## Objectif

Construire une série quotidienne expérimentale cohérente avec la règle des prévisions horaires officielles :

- **sept modèles déterministes** seulement : AROME, ARPEGE, ICON, ECMWF, GFS, GEM et UKMET ;
- Open-Meteo **Best Match** conservé comme référence dérivée de comparaison ;
- observations de stations réservées à la validation, sans réécriture d’une prévision ;
- aucune valeur absente remplacée, extrapolée ou fabriquée.

## Réalisation

| Élément | Mise en œuvre |
|---|---|
| Calcul | `daily-unified-shadow-v1`, construit uniquement depuis `shadow_weather_values` déjà normalisées et contrôlées |
| Sources de fusion | Les 7 modèles déterministes seulement |
| Best Match | Référence de comparaison ; poids nul et exclusion structurelle du candidat |
| Pondération shadow | Qualité Phase 5, fraîcheur, preuve de performance qualifiée et indépendance |
| Ancienne référence | Moyenne structurelle ECMWF + GFS + ICON + Best Match, recalculée depuis le même cycle shadow ; elle ne lit pas la prévision publique |
| Persistance | Table additive `shadow_weather_daily_unified_candidates` |
| Visibilité | Panneau administrateur dans AI Lab uniquement |
| Sécurité | `productionReadsEnabled = 0`, `appliedToProduction = 0`, `shadowMode = 1` pour chaque candidat |

## Résultat du replay historique

Le replay a lu **58 cycles quotidiens déjà présents dans le Data Hub shadow** et a produit **870 candidats journaliers**.

| Contrôle | Résultat |
|---|---:|
| Candidats persistés | 870 |
| Clés uniques après deux replays | 870 |
| Doublons introduits | 0 |
| Lectures production | 0 |
| Applications production | 0 |
| Violations d’isolation shadow | 0 |
| Statut global des candidats | 870 `PARTIAL` |

Le statut `PARTIAL` est volontaire et correct : il ne dissimule ni une couverture incomplète ni une preuve de pondération manquante.

## Échantillon réel — cycle du 2 octobre 2026

| Jour prévu | Température max, candidat 7 modèles | Référence historique à 4 flux | Best Match, référence seule | État |
|---|---:|---:|---:|---|
| 02/10 | 19,60 °C | 19,65 °C | 19,60 °C | PARTIAL |
| 03/10 | 20,11 °C | 20,13 °C | 20,50 °C | PARTIAL |
| 04/10 | 20,22 °C | 19,95 °C | 20,90 °C | PARTIAL |

Ces valeurs servent uniquement à comparer les méthodes. Elles ne remplacent pas la vue 15 jours, le Dashboard ou le moteur officiel.

## Pourquoi aucun candidat n’est encore `SHADOW_READY`

### 1. Couverture fournisseur réellement variable

Les horizons fournis par les modèles ne sont pas identiques. Pour la température maximale du cycle du 2 octobre, la disponibilité réellement archivée est :

| Modèle | Jours demandés | Jours avec valeur qualifiée |
|---|---:|---:|
| AROME | 15 | 2 |
| ARPEGE | 15 | 4 |
| ICON | 15 | 5 |
| UKMET | 15 | 6 |
| GEM | 15 | 10 |
| ECMWF | 15 | 14 |
| GFS | 15 | 15 |

La fusion utilise les modèles réellement disponibles par jour. Quand l’un d’eux ne couvre pas l’échéance, le candidat reste `PARTIAL` au lieu de simuler une septième valeur.

### 2. Fraîcheur du run quotidien encore inconnue

Les valeurs quotidiennes conservent l’état de fraîcheur `UNKNOWN` lorsque l’API ne fournit pas de preuve de run directement rattachable au payload. Elles restent utilisables avec une pondération prudente, mais ne peuvent être déclarées complètes.

### 3. Preuve de performance quotidienne insuffisante

La Phase 7/8 ne dispose pas encore de suffisamment de comparaisons physiques quotidiennes qualifiées pour attribuer une performance par modèle, variable et échéance. Le calcul utilise donc un facteur neutre documenté, mais marque explicitement `qualified_performance` comme preuve manquante.

### 4. Lacune fournisseur explicite

AROME ne renvoie pas de nébulosité quotidienne exploitable dans les données archivées du cycle contrôlé. Cette valeur demeure `MISSING` : aucune moyenne horaire, valeur voisine ou autre modèle ne la remplace silencieusement.

## Garde-fous vérifiés

- Best Match a une trace de référence, mais son poids de fusion est **toujours zéro**.
- Les 7 modèles sont pris en compte lorsqu’ils sont présents et qualifiés.
- Une variable absente reste absente ; elle ne devient pas un substitut calculé.
- Aucun appel météo supplémentaire n’est nécessaire au replay : les candidats réutilisent les données déjà stockées par le Data Hub shadow.
- Les deux replays sont idempotents grâce à la clé unique `(cycleKey, locationKey, forecastDate)`.
- Le code et les tests ne créent pas de lecteur vers les tables de production.

## Validation technique

- TypeScript : réussi.
- Tests ciblés : **20 tests réussis**.
- Tests spécifiques : calcul à sept modèles, exclusion de Best Match, couverture partielle, indisponibilité sans invention, rapport d’isolation et rendu AI Lab.
- Migration : `0044_new_nuke.sql`, strictement additive.

## Prochaine étape recommandée

Ne pas basculer l’interface publique à ce stade.

La suite sûre consiste à laisser les prochains cycles alimenter la série shadow, puis à :

1. comparer la série journalière aux observations physiques quotidiennes réellement qualifiées ;
2. mesurer MAE, RMSE et biais par variable et échéance sans fuite temporelle ;
3. vérifier que la couverture sept modèles est suffisante selon les jours ;
4. produire un rapport comparatif contre l’ancienne méthode avant toute autorisation de bascule.

> Aucun poids de production ne doit être modifié sur la seule base des premiers candidats ou d’un faible nombre de comparaisons.
