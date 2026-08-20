# Audit complet de MeteoAI

**Date :** 20 août 2026  
**Auteur :** Manus AI  
**Périmètre :** calculs de fusion, scores de fiabilité, stations, tâches planifiées, persistance, cohérence des écrans, performance et journaux.

> **Conclusion.** Les fondations sont solides : séparation des stations physiques et des modèles, absence de données publiques simulées dans la fusion officielle, archivage des émissions et 318 tests passants. L’audit établit toutefois plusieurs défauts **prouvés** qui peuvent biaiser l’historique de fiabilité, afficher une confiance trop favorable ou rendre la prévision indisponible. La priorité est de réparer l’intégrité des données et les valeurs de repli avant de modifier des pondérations métier.

## Méthode et convention de preuve

L’audit a examiné les moteurs `fusionEngine.ts`, `statsEngine.ts`, `officialForecast.ts`, `ultraLocalService.ts`, `qualifiedHourlyScoring.ts`, les routeurs météo, les collectes planifiées, les index réels MySQL et les journaux du navigateur, du serveur et des tâches. Les conclusions de méthode sont confrontées aux pratiques de vérification WMO/WGNE, ECMWF et DTC [1] [2] [3].

| Niveau | Définition |
|---|---|
| **Prouvé** | Comportement observé directement dans le code, les journaux ou la base courante. |
| **Risque élevé** | Mécanisme présent, dont l’impact dépend de la disponibilité des données ou du trafic. |
| **Amélioration** | Évolution recommandée sans défaut de production démontré. |

## Résumé des priorités

| Priorité | Sujet | Impact |
|---|---|---|
| **P0** | Données dupliquées, scores favorables sans mesure, repli d’échéance incorrect, score historique fictif, tâches fragiles. | Peut biaiser le classement, la confiance et la disponibilité. |
| **P1** | Pondération par paramètre, régime, Ultra-local et cohérence de stabilité. | Peut réduire la cohérence et l’explicabilité. |
| **P2** | Segmentation scientifique, incertitude, observabilité et contrat de données partagé. | Augmente la robustesse progressive et la transparence. |

## 1. Constats P0 — à corriger avant d’automatiser davantage les poids

### 1.1 Relances non idempotentes et doublons réels

La table `reliability_scores` ne possède qu’une clé primaire technique `id` et `insertReliabilityScores` fait un simple `INSERT`. Les tables `meteoai_forecast` et `observations` n’ont pas non plus de clé unique métier. Certaines fonctions utilisent `onDuplicateKeyUpdate`, mais sans index unique de métier cette protection ne s’applique pas.

La base actuelle confirme **5 groupes de doublons de `meteoai_forecast` représentant 9 lignes excédentaires**, et **3 groupes de `reliability_scores` représentant 3 lignes excédentaires**. Les doublons de scores concernent `Open-Meteo` les 9, 10 et 11 juillet 2026. Les snapshots MeteoAI dupliqués concernent les deux lieux actifs les 12, 14 et 17 août 2026.

| Table | Clé unique recommandée | Correction |
|---|---|---|
| `reliability_scores` | `(locationKey, date, serviceName, evidenceType)` | Dédupliquer, ajouter la contrainte et utiliser un upsert. |
| `meteoai_forecast` | `(locationKey, date)` | Dédupliquer, ajouter la contrainte et utiliser un upsert. |
| `observations` | `(locationKey, date, provenanceType)` | Contraindre l’unicité de la synthèse quotidienne. |
| `hourly_forecasts` | Index `(locationKey, date, modelName, hour)` | Conserver le remplacement par modèle et accélérer les lectures. |

### 1.2 Score favorable lorsque la donnée est absente

Le moteur de fiabilité retourne une MAE nulle, donc un score de 100, quand il n’existe aucune paire température ou vent. Sans paire pluie, le CSI vaut 1 et le repli de quantité vaut 70, soit un score de pluie de 85. Sans condition comparable, le score est 70. Ces valeurs peuvent alimenter `weightedScore` alors qu’aucune observation ne les prouve.

Cela doit être aligné sur la règle plus stricte du score de laboratoire, qui conserve `normalizedScore = null` lorsqu’une dimension requise manque.

**Correction :** chaque dimension sans paire comparable doit être `null`; le score global ne doit utiliser que les dimensions effectivement mesurées avec renormalisation documentée des poids et publication de la couverture par variable. Aucun score global public ne doit être produit sans couverture minimale.

### 1.3 Repli de performance par échéance incorrect

`getLeadTimeWeights` prétend choisir un compartiment adjacent. Après le compartiment demandé, il essaie en réalité toujours `0-6h`, puis `6-24h`, puis les autres. Ainsi, un score `8-15d` absent peut être remplacé par une performance `0-6h` avant une performance `4-7d`.

ECMWF suit ses performances par paramètre et par échéance, et les recommandations WMO/WGNE demandent de stratifier la vérification par échéance [1] [2].

**Correction :** trier les compartiments par distance à la cible : `8-15d → 4-7d → aucune preuve`, et `0-6h → 6-24h → aucune preuve`. La trace doit indiquer chaque repli.

### 1.4 Confiance historique créée artificiellement

Les chemins planifié et manuel envoient un `bestModelScore` de **60** en l’absence d’historique qualifié. `computeConfidenceScore` traite alors ce 60 comme une performance mesurée, ce qui contourne le plafond prévu lorsqu’il n’existe pas de preuve historique.

**Correction :** transmettre `null`, afficher « historique non qualifié » et conserver le plafond lié à l’absence de preuve.

### 1.5 Collectes : échecs réels et télémétrie erronée

Les journaux Heartbeat confirment un timeout de collecte de prévisions le **19 août 2026** et un échec **403** le **20 août**. Le compteur `totalScores` du gestionnaire d’observations est initialisé à zéro mais n’est jamais incrémenté : les réponses affichent donc `totalScores: 0` même après calculs.

**Correction :** réparer l’autorisation du cron, incrémenter le compteur, mesurer la couverture par lieu/modèle, alerter sur l’absence de collecte 05h00 et imposer une idempotence de base de données.

### 1.6 Délai Dashboard de 300 secondes

Un appel réel `weather.getDashboard` a produit un **504 après environ 300 secondes**. La cause racine n’est pas prouvée : les collecteurs ont des délais de 5 à 8 secondes, mais la procédure peut encore rester bloquée dans une cascade d’appels ou une dépendance externe. Le risque utilisateur est confirmé.

**Correction :** imposer un délai de niveau routeur inférieur au délai de passerelle, retourner immédiatement le dernier snapshot persistant avec horodatage et déclencher le rafraîchissement en arrière-plan. Instrumenter chaque fournisseur, procédure tRPC et accès base.

## 2. Constats P1 — moteurs de fusion et cohérence scientifique

### 2.1 Poids de température appliqué au mauvais paramètre

Dans `computeFusion`, le poids brut dépend de `maeTemp` même lorsqu’il fusionne pluie, vent, humidité ou nébulosité. La fusion officielle quotidienne atténue partiellement le problème en appelant ce moteur séparément avec la métrique adéquate. Les chemins génériques et locaux restent exposés.

**Correction :** rendre le paramètre de performance explicite dans `computeFusion`, ou n’appeler ce moteur qu’avec une source par paramètre. Toute absence de MAE dédiée doit apparaître comme un repli, non comme une pondération adaptative complète.

### 2.2 Nébulosité : repli non visible et trace incomplète

La fusion officielle peut utiliser une MAE de nébulosité, mais sa trace ne publie que température, pluie et vent. `generateAdaptiveForecast` utilise les poids de température pour la nébulosité lorsqu’il n’a pas de métrique propre.

**Correction :** ajouter `cloudWeight` à la trace et stocker MAE/RMSE/biais de nébulosité. En attendant, afficher clairement le repli de poids.

### 2.3 Régimes météo : cas inatteignables et données manquantes remplacées

`frost` est évalué avant `cold_wave`, rendant la vague de froid inatteignable sous ses propres critères. Une pluie sous zéro est classée avant la neige. Le détecteur remplace aussi les valeurs manquantes par une météo moyenne (15 °C, 50 % de nuages, 60 % d’humidité, visibilité 10 km), susceptible de créer un régime détaillé sans donnée.

**Correction :** évaluer les phénomènes les plus spécifiques d’abord — orage violent, neige/verglas, vague de froid, gel — puis les régimes généraux. Retourner « données insuffisantes » si les variables nécessaires manquent.

### 2.4 Pondération Ultra-local associée à une mauvaise station

Les contributions sont remplies dans l’ordre des bandes de distance, puis `weightedAvgVar` les réutilise par l’index des `activeStations`. Les deux ordres ne sont pas garantis identiques. L’humidité, la pression, le vent, les rafales ou les précipitations d’une station peuvent donc recevoir le poids d’une autre.

**Correction :** remplacer l’association par index par une `Map<stationId, weight>` et ajouter un test avec des stations en ordre inverse des bandes.

### 2.5 Confiance Ultra-local limitée à la température

La confiance locale combine l’écart type de température et le nombre de stations actives. Une station sans température peut augmenter le bonus de nombre de sources, et les divergences de pluie, rafales, humidité ou pression n’affectent pas le score.

**Correction :** calculer une confiance par variable, basée sur le nombre de capteurs contributeurs, leur fraîcheur, leur qualité et leur accord; n’agréger que les variables réellement affichées.

### 2.6 Stabilité incohérente selon la page

`calculateStabilityIndex` renvoie 100 (« stable ») avec moins de deux prévisions. Le 15 jours affiche une heuristique fondée sur la distance temporelle et la dispersion de quatre modèles, alors que la fusion officielle quotidienne utilise huit modèles. Les deux indices peuvent diverger sans explication.

**Correction :** retourner « non calculable » sous deux modèles ; unifier la formule ou afficher systématiquement le périmètre exact de chaque indice.

## 3. Fiabilité, observations et classement

Le score horaire qualifié exige 18 heures dont la température physique est disponible. Les mêmes paires servent ensuite à calculer pluie, vent, humidité et pression, même quand ces variables manquent. La couverture `sampleSize` affichée peut donc paraître suffisante alors que la dimension pluie ou rafales n’est pas observée. La température horaire est dupliquée en `tempMax` et `tempMin`, doublant sa taille d’échantillon interne.

**Correction :** stocker une couverture indépendante par variable, appliquer les seuils par dimension et créer un type de comparaison horaire plutôt que de réutiliser les champs journaliers.

Le régime appliqué au score est déterminé à partir d’une moyenne de toute la période, puis utilisé pour toutes les erreurs. Il n’y a pas de véritable partition par saison, seuil de pluie ou régime observé. La WMO/WGNE recommande au minimum la stratification par échéance, saison, région et intensité, avec incertitude des scores agrégés [1].

**Amélioration :** partitionner par lieu, saison, horizon, régime et seuil de pluie; publier couverture, médiane, intervalle interquartile et, si possible, intervalle de confiance à 95 %.

## 4. Cohérence entre pages et expérience

Le Dashboard, les prévisions détaillées, les favoris et les modes locaux ne consomment pas tous la même construction : moyenne 15 jours de quatre modèles, horaire `best_match` + AROME, fusion quotidienne officielle de huit modèles, et synthèse locale de stations avec repli officiel. Ces différences sont parfois pertinentes, mais elles doivent être visibles. Elles ne peuvent pas être présentées sous un même libellé sans provenance.

Le journal a également relevé des avertissements Google Maps chargé sans `loading=async`, ainsi que les avertissements horaires historiques désormais traités. L’avertissement Maps est une amélioration de performance, pas une erreur de calcul.

**Amélioration :** centraliser un contrat de snapshot avec `source`, `modelsUsed`, `validAt`, `computedAt`, `coverage`, `fallbackReason` et `methodVersion`, puis afficher ce périmètre sur chaque page.

## 5. Points positifs confirmés

| Élément | Constat |
|---|---|
| Provenance | Les stations physiques qualifiées sont séparées des modèles et des capteurs candidats. |
| Données publiques | `generatePublicServiceForecasts` retourne des réponses d’API réelles ou une liste vide; aucune simulation n’entre dans la fusion officielle. |
| Traçabilité | Les émissions de modèle sont archivées et la fusion conserve des traces par température, pluie et vent. |
| Réactivité locale | Le cache court des stations évite les appels répétés au basculement Local/Ultra-local. |
| Santé automatisée | TypeScript est valide; 87 fichiers de test passent, soit 318 tests passants et 2 ignorés. |

## 6. Feuille de route priorisée

| Ordre | Chantier | Critère d’acceptation |
|---:|---|---|
| 1 | Contraintes uniques, déduplication et upserts. | Aucune ligne dupliquée après relance d’un cron. |
| 2 | Scores nullables et couverture par variable. | Aucun score favorable sans observation comparable. |
| 3 | Échéances et confiance sans valeur fictive. | Trace de l’horizon réellement utilisé ou absence de preuve. |
| 4 | Régimes et poids Ultra-local par station. | Tests froid/vent, neige, valeurs manquantes et ordre de stations. |
| 5 | Snapshot persistant, délai routeur et métriques fournisseurs. | Pas de page bloquée 300 s; état de fraîcheur visible. |
| 6 | Définition unique de stabilité et contrat de données inter-pages. | Chaque indice annonce sa formule et ses sources. |
| 7 | Segmentation saison/régime/seuil/horizon et incertitude. | Classement robuste et explicable sur échantillons suffisants. |

> **Décision recommandée :** ne pas modifier les poids métier à l’intuition. Corriger d’abord les chantiers 1 à 4, relancer les collectes sur des données propres, puis comparer objectivement la qualité avant/après par lieu, paramètre et horizon.

## Références

[1] [WMO/WGNE — *Suggested methods for the verification of precipitation forecasts against high resolution limited area observations*](https://wgne.net/publications/suggested-methods-for-precipitation-verification/)

[2] [ECMWF — *Quality of our forecasts*](https://www.ecmwf.int/en/forecasts/quality-our-forecasts)

[3] [DTC METplus — *Verification Statistics for Continuous Forecasts*](https://dtcenter.org/metplus-practical-session-guide-version-5-0/basic-verification-statistics-review/continuous-forecasts/verification-statistics-continuous-forecasts)
