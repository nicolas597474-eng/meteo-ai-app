# Audit complet de MeteoAI

**Date :** 20 août 2026  
**Auteur :** Manus AI  
**Périmètre :** moteurs de calcul, scores de fiabilité, données physiques, collectes planifiées, persistance, cohérence des pages, performances et erreurs d’exécution.

> **Conclusion exécutive.** L’application possède des bases solides : elle sépare explicitement les observations physiques des modèles, n’injecte pas de données publiques simulées dans la fusion officielle, conserve des traces de prévision et dispose d’une suite de 318 tests passants. Cependant, plusieurs défauts **prouvés** peuvent fausser l’historique de fiabilité, la confiance affichée ou la fraîcheur des prévisions. La priorité doit être la correction de l’intégrité des données, des valeurs de repli chiffrées et de la sélection par échéance avant toute évolution visuelle ou ajout de modèle.

## 1. Méthode et niveau de preuve

L’audit a combiné une lecture ciblée des moteurs `fusionEngine.ts`, `statsEngine.ts`, `officialForecast.ts`, `ultraLocalService.ts`, `qualifiedHourlyScoring.ts`, des routeurs et de la persistance Drizzle/MySQL, avec l’examen des journaux de tâches planifiées et de la base réelle. Les calculs sont comparés à des pratiques de vérification reconnues : séparation des métriques continues, vérification des précipitations par seuil, et stratification par échéance et contexte [1] [2] [3].

| Niveau | Définition appliquée dans ce rapport |
|---|---|
| **Prouvé** | Le comportement est observé directement dans le code, les journaux ou la base de données actuelle. |
| **Risque élevé** | Le mécanisme est présent et peut affecter les résultats, mais l’ampleur réelle dépend des données ou du trafic. |
| **Amélioration** | Évolution méthodologique recommandée, sans erreur fonctionnelle établie. |

## 2. Résumé des résultats

| Priorité | Constats prouvés | Risque principal | Action attendue |
|---|---:|---|---|
| **P0** | 4 | Scores historiques et snapshots dupliqués ; confiance potentiellement trompeuse ; collecte pouvant échouer sans alerte métier suffisante. | Migration d’unicité, déduplication, correction des scores sans observation, surveillance des tâches. |
| **P1** | 7 | Pondérations appliquées à une mauvaise échéance ou à un mauvais paramètre ; incohérence entre pages. | Corriger le choix des compartiments, les repli de confiance et unifier les sorties officielles. |
| **P2** | 6 | Amélioration de robustesse et de transparence. | Calibrage statistique, segmentation saison/régime, observabilité et optimisation. |

## 3. Défauts critiques à corriger avant d’augmenter les pondérations automatiques

### 3.1 Intégrité des données : les relances créent des doublons

La table réelle `reliability_scores` ne possède qu’une clé primaire `id`, tandis que `insertReliabilityScores` utilise un simple `INSERT`. La même absence de contrainte d’unicité existe sur `meteoai_forecast` et `observations`. Pourtant, plusieurs fonctions sont nommées `upsert` ou appellent `onDuplicateKeyUpdate` : sans index unique adéquat, cette clause ne peut pas empêcher l’insertion d’une nouvelle ligne.

La base confirme déjà **5 groupes de doublons dans `meteoai_forecast` représentant 9 lignes excédentaires**, et **3 groupes dans `reliability_scores` représentant 3 lignes excédentaires**. Les doublons connus de scores concernent `Open-Meteo`, les 9, 10 et 11 juillet 2026. Les doublons de snapshots concernent notamment les deux lieux actifs les 12, 14 et 17 août 2026.

| Preuve | Conséquence |
|---|---|
| `reliability_scores` : aucune clé unique métier ; insertion non idempotente. | Une relance double un jour de score et peut biaiser les moyennes, le nombre de comparaisons et le classement. |
| `meteoai_forecast` : aucune clé unique `(locationKey, date)`. | L’historique et les comparaisons de traces peuvent sélectionner une version ambiguë du même jour. |
| Journal de tâches : une collecte de prévisions a expiré le 19 août et un déclenchement a reçu un 403 le 20 août. | Les nouvelles tentatives sont plausibles ; l’idempotence doit être structurelle. |

**Correction P0.** Ajouter les contraintes uniques, dédupliquer en conservant la ligne la plus récente, puis remplacer les insertions simples par des upserts explicites. Les clés recommandées sont :

| Table | Clé métier recommandée |
|---|---|
| `reliability_scores` | `(locationKey, date, serviceName, evidenceType)` |
| `meteoai_forecast` | `(locationKey, date)` |
| `observations` | `(locationKey, date, provenanceType)` |
| `hourly_forecasts` | Conserver le remplacement par modèle ; ajouter un index de lecture `(locationKey, date, modelName, hour)`. |

### 3.2 Score favorable sans donnée comparable

Dans `statsEngine.ts`, une dimension sans paire prévision–observation reçoit des valeurs favorables : température et vent obtiennent une MAE nulle, donc un score de 100 ; pour la pluie, aucun cas donne un CSI de 1 et un score de quantité de repli de 70, soit un score composite de 85. Les conditions sans donnée reçoivent 70. Ces scores peuvent alimenter `weightedScore`.

Ce comportement contredit le principe déjà adopté dans le laboratoire normalisé, qui laisse `normalizedScore` à `null` si les dimensions requises ne sont pas comparables. Une absence de mesure doit rester **indisponible**, et non être interprétée comme une bonne performance. Les recommandations de vérification insistent sur les mesures adaptées aux événements et sur une taille d’échantillon suffisante [1].

**Correction P0.** Renvoyer `null` pour une dimension sans comparaison ; recalculer le score global uniquement sur les dimensions réellement observées, avec normalisation explicite des poids restants et affichage de la couverture. Ne publier aucun score global si la couverture minimale par paramètre n’est pas atteinte.

### 3.3 Échéances : le repli choisit parfois l’horizon le plus éloigné de la demande

`getLeadTimeWeights` annonce un repli vers les compartiments adjacents. En pratique, il essaie toujours, après la cible, `0-6h`, puis `6-24h`, puis `1-3d`, etc. Ainsi, lorsque `8-15d` manque, le code peut utiliser la performance `0-6h` avant celle de `4-7d`. Une performance de très courte échéance n’est pas une preuve adéquate pour le moyen terme. ECMWF suit explicitement ses scores par paramètre **et par échéance** [2].

**Correction P0.** Définir une distance ordinale entre compartiments et trier les replis par proximité : pour `8-15d`, essayer `4-7d` puis éventuellement ne pas pondérer ; pour `0-6h`, essayer `6-24h`. Enregistrer la source du repli dans la trace utilisateur.

### 3.4 Confiance historique artificielle par défaut

La collecte quotidienne et la relance manuelle injectent un `bestModelScore` de **60** lorsqu’aucun historique qualifié n’existe. Ce 60 est ensuite fourni à `computeConfidenceScore`, qui le traite comme une performance historique mesurée. Le plafond lié à l’absence de performance n’est donc pas appliqué comme prévu.

**Correction P0.** Passer `null` en l’absence de score qualifié, ne jamais convertir l’absence d’historique en score numérique. Afficher « historique non qualifié » et conserver le plafond de confiance déjà prévu par la formule.

## 4. Calculs de fusion et modes locaux

### 4.1 Fusion générique : poids de température appliqués à toutes les variables

Dans `computeFusion`, le poids brut dépend de `maeTemp` même lorsque la variable fusionnée est la pluie, le vent, l’humidité ou la nébulosité. Le moteur officiel corrige partiellement ce point en appelant la fusion séparément par paramètre et en renseignant la MAE correspondante. En revanche, la fusion avancée locale et certains chemins génériques conservent cette dépendance à la température.

**Correction P1.** Faire accepter à `computeFusion` le champ de performance adapté au paramètre, ou isoler strictement le moteur officiel par paramètre. Ne jamais faire influencer une MAE de température sur une pondération de précipitation sans l’indiquer comme repli.

### 4.2 Nébulosité et traces incomplètes

La fusion quotidienne calcule la nébulosité avec une MAE dédiée quand elle existe, mais sa trace exposée ne contient que température, précipitation et vent. Dans `generateAdaptiveForecast`, la nébulosité utilise les poids de température faute de métrique dédiée. Cela est un repli acceptable seulement s’il est affiché comme tel ; ce n’est pas une véritable fusion par paramètre.

**Correction P1.** Ajouter `cloudWeight` à la trace, ou publier clairement « pondération de température utilisée faute de métrique de nébulosité ». À terme, stocker MAE/RMSE/biais de nébulosité et de visibilité.

### 4.3 Régimes météo : règles inatteignables et valeurs par défaut

Dans `detectExtendedRegime`, la règle `frost` (`t < 0`) est évaluée avant `cold_wave` (`t < -2` et vent fort), rendant cette dernière inatteignable. De même, une pluie sous zéro est classée avant la neige. Le même moteur remplace les valeurs absentes par 15 °C, 50 % de nuages, 60 % d’humidité et 10 km de visibilité, ce qui peut produire un régime spécifique sans observation correspondante.

**Correction P1.** Réordonner les phénomènes par spécificité : orage violent, neige/verglas, vague de froid, gel, puis régimes généraux. Faire remonter un statut `données insuffisantes` lorsque les variables nécessaires au régime sont absentes, au lieu de les remplacer par une météo moyenne.

### 4.4 Ultra-local : pondérations de variables possiblement associées à la mauvaise station

Les contributions Ultra-local sont construites dans l’ordre des bandes de distance, mais `weightedAvgVar` parcourt ensuite `activeStations` et réutilise `contributions[idx]`. Les deux tableaux n’ont pas la même garantie d’ordre. Une humidité, pression, rafale ou précipitation peut recevoir le poids d’une autre station lorsque les stations sont réparties sur plusieurs bandes.

**Correction P1.** Construire une `Map<stationId, weight>` et l’utiliser pour toutes les variables, ou stocker directement la station source dans chaque contribution. Ajouter un test où l’ordre d’entrée des stations diffère de l’ordre des bandes.

### 4.5 Confiance Ultra-local incomplète

La confiance Ultra-local dépend de la dispersion de température et du nombre de stations actives. Une station sans température mais avec vent peut améliorer le bonus de nombre de stations, alors qu’elle n’apporte aucune preuve pour la température. Les divergences de pluie, rafales, humidité et pression ne réduisent pas cette confiance.

**Correction P1.** Calculer une confiance **par variable** avec le nombre de capteurs réellement contributeurs. Le score global doit être la couverture et la cohérence pondérées des variables affichées, pas seulement l’écart type thermique.

## 5. Fiabilité, observations et classement

### 5.1 Comparaison horaire : couverture température ≠ couverture de toutes les variables

Le score horaire qualifié exige 18 heures alignées avec une température physique présente. Il transmet ensuite ces mêmes paires au moteur de pluie, vent, humidité et pression, même lorsqu’une de ces variables est manquante. Le problème de score favorable sans donnée peut donc être persisté sous un `sampleSize` de 18, alors que la couverture réelle de pluie ou de rafales est nulle.

**Correction P1.** Stocker un échantillon par dimension (`sampleSizeTemp`, `sampleSizePrecip`, etc.), appliquer les seuils d’éligibilité indépendamment et empêcher l’agrégation lorsque la dimension est non comparable. La température horaire dupliquée en `tempMax` et `tempMin` doit également être remplacée par un type de mesure horaire explicite pour éviter une taille d’échantillon interne doublée.

### 5.2 Segmentation méthodologique insuffisante

Le moteur déduit un régime moyen sur toute la période observée, puis applique ce seul jeu de poids à l’ensemble des erreurs. Il ne segmente pas réellement les scores par régime, saison, seuil de pluie ou échéance complète. La WMO/WGNE recommande de stratifier a minima la vérification de précipitation par échéance, saison, région et seuil d’intensité, ainsi que de publier une incertitude des scores agrégés [1].

**Amélioration P2.** Ajouter des partitions par `locationKey`, saison, horizon, régime observé et seuil de précipitation. Publier les intervalles de confiance ou au minimum la couverture, la médiane et l’intervalle interquartile avant d’interpréter de faibles écarts entre modèles.

### 5.3 Stabilité et absence de données

`calculateStabilityIndex` retourne 100 (« stable ») avec moins de deux prévisions. Le collecteur 15 jours calcule par ailleurs une stabilité heuristique à partir de la distance dans le temps et de la dispersion de seulement quatre modèles, alors que la fusion officielle quotidienne s’appuie sur huit modèles actifs. Ce sont deux indices différents qui peuvent diverger d’une page à l’autre.

**Correction P1.** Retourner `null`/« non calculable » sous deux modèles ; unifier la définition de stabilité ou afficher explicitement l’origine : « accord 4 modèles affichés » contre « stabilité fusion officielle ».

## 6. Données, collectes et performance

### 6.1 Planification : exécutions imparfaites et télémetrie incorrecte

Les journaux Heartbeat confirment un timeout de la collecte de prévisions le **19 août 2026** et un échec **403** le **20 août** pour un déclenchement. Le gestionnaire accepte deux créneaux UTC pour couvrir l’heure d’été, puis ignore le créneau ne correspondant pas à 05h00 Paris ; ce principe est raisonnable, mais la tâche doit distinguer explicitement une exécution utile, une exécution ignorée et un échec d’autorisation.

Le compteur `totalScores` de `collectObservationsHandler` est initialisé à 0 mais jamais incrémenté. Les réponses de plusieurs exécutions récentes annoncent donc `totalScores: 0` même lorsque des scores sont calculés. Cette erreur ne semble pas modifier les calculs, mais rend le monitoring et les notifications trompeurs.

**Correction P0.** Corriger le compteur, journaliser la couverture par lieu/modèle, alerter sur absence de collecte 05h00, et supprimer/réparer l’autorisation du déclenchement qui reçoit 403. Imposer un délai applicatif inférieur au délai de passerelle et servir le dernier snapshot qualifié avec un état « retard de mise à jour ».

### 6.2 Délai de Dashboard observé

Un appel réel à `weather.getDashboard` a abouti à un **504 après environ 300 secondes**. Les collecteurs sous-jacents utilisent pourtant des délais de 5 à 8 secondes. La cause exacte n’est pas prouvée par les journaux disponibles ; elle peut relever d’un appel externe bloqué, d’une saturation serveur ou d’une cascade de requêtes. Le risque est confirmé : l’écran peut rester indisponible au lieu de présenter un snapshot persistant.

**Correction P0.** Mettre en place un `Promise.race` de niveau routeur (par exemple 10–12 s), retourner immédiatement le dernier snapshot officiel persistant, déclencher le rafraîchissement en arrière-plan et exposer un marqueur de fraîcheur. Instrumenter la durée de chaque fournisseur et de chaque procédure tRPC.

### 6.3 Couverture et cohérence entre pages

Le Dashboard officiel, la page détaillée, les favoris et les modes locaux combinent des sorties différentes : 15 jours moyennés sur quatre modèles, 48 heures `best_match` + AROME, fusion quotidienne officielle à huit modèles, et température locale issue de stations avec un repli officiel. Ces choix sont défendables par usage, mais doivent être identifiés dans l’interface : ils ne constituent pas un unique « modèle MeteoAI ».

**Amélioration P2.** Centraliser un contrat de snapshot avec `source`, `modelsUsed`, `validAt`, `computedAt`, `coverage`, `fallbackReason` et `methodVersion`. Chaque page doit consommer ce contrat ou expliquer sa différence de méthode.

## 7. Points positifs confirmés

| Élément | Constat |
|---|---|
| Séparation des preuves | Les observations de stations physiques qualifiées sont séparées des références de modèles et des capteurs candidats. |
| Données publiques | `generatePublicServiceForecasts` renvoie uniquement des réponses d’API réelles ou une liste vide ; aucune simulation n’entre dans la fusion officielle. |
| Traçabilité | Les prévisions de modèle sont archivées avec émission et la fusion officielle conserve une trace par température, pluie et vent. |
| Résilience locale | Le cache court des stations réduit les appels lors du basculement Local/Ultra-local sans mélanger les sessions Netatmo. |
| Qualité de code | TypeScript est valide ; 87 fichiers de test passent, soit 318 tests passants et 2 ignorés à la date de l’audit. |

## 8. Feuille de route proposée

| Ordre | Chantier | Résultat de vérification attendu |
|---:|---|---|
| 1 | Migration de clés uniques, déduplication et upserts. | Zéro groupe dupliqué et relance d’un même cron sans modification des agrégats. |
| 2 | Scores nullables par dimension et couverture par variable. | Aucun score global favorable lorsque la dimension mesurée est absente. |
| 3 | Correction des replis d’échéance et suppression du score historique fictif de 60. | Les traces indiquent un score du bon horizon ou « aucune preuve qualifiée ». |
| 4 | Réparation des régimes et de la pondération Ultra-local par `stationId`. | Tests sur froid/vent, neige, valeurs manquantes et ordre de stations. |
| 5 | Snapshot officiel persistant, délai routeur et télémétrie des fournisseurs. | Pas de page bloquée 300 s ; affichage d’un snapshot daté en cas de source lente. |
| 6 | Unification de la stabilité et contrat commun de données entre pages. | Chaque indice affiche la même formule ou son périmètre exact. |
| 7 | Segmentation par saison, régime, seuil et horizon ; intervalles de confiance. | Classement explicable et robuste, sans surinterprétation d’échantillons faibles. |

## 9. Décision recommandée

Ne pas modifier les poids métier « à l’œil ». Exécuter d’abord les chantiers 1 à 4, relancer la collecte sur des données propres, puis comparer la qualité avant/après par lieu, horizon et paramètre. Les évolutions de pondération doivent être activées progressivement, documentées dans la trace et annulables si les métriques observées se dégradent.

## Références

[1] [WMO/WGNE — *Suggested methods for the verification of precipitation forecasts against high resolution limited area observations*](https://wgne.net/publications/suggested-methods-for-precipitation-verification/)

[2] [ECMWF — *Quality of our forecasts*](https://www.ecmwf.int/en/forecasts/quality-our-forecasts)

[3] [DTC METplus — *Verification Statistics for Continuous Forecasts*](https://dtcenter.org/metplus-practical-session-guide-version-5-0/basic-verification-statistics-review/continuous-forecasts/verification-statistics-continuous-forecasts)
