# Phase 6 officielle — Audit préparatoire de la fusion intelligente

**État : audit terminé ; implémentation shadow autorisée par validation explicite de gouvernance**

La couverture technique P1.6 reste documentée à 3/7 dates distinctes. L’utilisateur a explicitement validé l’analyse comme terminée pour autoriser la préparation et l’implémentation shadow de la Phase 6. Cette décision ne fabrique aucune date, ne modifie aucune archive et ne clôture pas le verdict technique historique.

## Cible officielle

La Phase 6 interdit la moyenne simple et exige, pour chaque variable et chaque échéance, une fusion pondérée de la forme suivante :

> **Prévision finale = Σ(prévision de la source × poids dynamique de la source)**

Les poids doivent pouvoir dépendre de la performance historique et locale, de l’échéance, de la variable, de la résolution, de la fraîcheur, de la qualité de la donnée, de la situation météorologique, de la convergence, de la dispersion des ensembles, de la disponibilité des observations, de la distance des stations et de leur représentativité géographique.

La présente étape est uniquement un audit. Aucun moteur parallèle, aucune table Phase 6 et aucune nouvelle écriture ne sont créés.

## Architecture actuelle

La fusion quotidienne persistée passe par `computeOfficialDailyForecast()`. Les collectes automatiques et la relance manuelle appliquent d’abord une correction de biais, chargent les performances qualifiées globales et par horizon, puis appellent ce même point d’entrée.[1] [2] [3]

| Chemin | Entrées actuelles | Sortie | Particularité |
|---|---|---|---|
| Collecte v8, lieu favori | Huit flux dits experts, scores physiques qualifiés, biais historiques, bucket `6-24h` | `meteoai_forecast` et `location_forecasts` | Écrit la trace canonique de poids version 1.[1] [2] |
| Relance manuelle | Même catalogue et mêmes fonctions de qualification | Même prévision quotidienne | Réutilise le moteur officiel, avec un marqueur `manual`.[3] |
| Affichage météo live | Open-Meteo Best Match horaire et prévision 15 jours | Snapshot en mémoire, cache deux minutes | Ce flux n’est pas la fusion quotidienne persistée.[4] |
| Repli local sans station | Températures de référence + poids de température de la trace officielle | Température de repli | Refuse d’inventer un consensus sans trace exploitable.[5] |

## Formule réellement appliquée aujourd’hui

Pour chaque variable, la fusion officielle transforme chaque entrée en source modèle et calcule un poids brut composé de quatre facteurs.[1] [6]

| Facteur | Calcul actuel | Limite constatée |
|---|---|---|
| Distance | `1 / (distance + 0,1)²` | La distance vaut artificiellement `1` pour tous les modèles ; elle ne les départage pas. |
| Qualité historique | `0,5 + reliabilityScore / 100` | `reliabilityScore` est dérivé du MAE de la variable ; sans MAE, la valeur neutre 50 est utilisée. |
| Fraîcheur | décroissance exponentielle | `updatedAt` est fixé à l’instant du calcul pour tous les modèles ; la fraîcheur fournisseur réelle n’est pas comparée. |
| Performance | `clamp(1 / MAE, 0,3, 2)` | Le MAE influence à la fois le score de qualité et le multiplicateur de performance. |
| Anomalie | pénalité éventuelle | Désactivée dans la fusion quotidienne officielle. |

Les poids bruts sont normalisés afin que la somme vaille 1 pour chaque paramètre. La température, les précipitations, le vent, l’humidité et la nébulosité sont fusionnés séparément. Une valeur absente est ignorée et les poids restants sont renormalisés.[1] [6]

## Preuves réelles au 2 septembre 2026

Les deux lieux suivis possèdent une trace finale version 1 calculée avec huit contributeurs pour la température, les précipitations, le vent et l’humidité. Les contributeurs sont AROME, ARPEGE, ICON, ECMWF, GFS, GEM, UKMET et Open-Meteo Best Match. Ce dernier est encore traité comme une source modèle dans la fusion de production, alors que le Data Hub le classe correctement comme agrégateur dérivé non indépendant.

Pour le lieu `50.756_2.521`, les poids de température observés vont de 9,8 % à 18,4 %, ceux des précipitations de 6,5 % à 19,6 % et ceux du vent de 8,2 % à 37,8 %. Les poids d’humidité sont uniformes à 12,5 %, faute de preuve discriminante disponible pour cette variable. La fusion n’est donc pas une moyenne simple pour les trois premières variables, mais elle redevient égalitaire lorsqu’aucune métrique qualifiée ne départage les sources.

| Preuve opérationnelle | Résultat réel |
|---|---|
| Services qualifiés par lieu | 10, dont les sept modèles actifs, Best Match et deux candidats de validation |
| Comparaisons physiques par service | 139 à 185 pour `50.676_2.845`, 177 pour `50.756_2.521` |
| Jours comparables | 7 à 9 |
| Dernier score qualifié | 1er septembre 2026 |
| Contributeurs de la trace finale | 8 |
| Méthode persistée | `IDW-p2+adaptive+alt-corrected` |
| Confiance persistée | 71 et 72 |

Deux candidats, DMI HARMONIE-DINI et ICON-D2, possèdent déjà des scores qualifiés mais ne sont pas injectés dans les huit entrées de la fusion finale. Ils n’influencent donc pas les poids appliqués aujourd’hui.

## Couverture des critères Phase 6

| Critère officiel | Couverture actuelle | Audit |
|---|---|---|
| Performance historique | Oui | Scores fondés sur des observations physiques qualifiées, minimum 30 comparaisons et 7 jours.[7] |
| Performance locale | Oui, partielle | Le classement du lieu est utilisé ; un classement global sert de repli lorsqu’il manque. |
| Échéance | Partielle | Les scores par horizon existent, mais la fusion quotidienne utilise toujours le bucket `6-24h` pour J+0. |
| Variable météo | Oui, partielle | Poids distincts pour température, précipitations, vent, humidité et nébulosité ; rafales et pression ne sont pas fusionnées dans cette sortie. |
| Résolution | Non | La résolution n’entre pas dans le poids. |
| Fraîcheur réelle | Non | Tous les modèles reçoivent l’heure locale de calcul. |
| Qualité Phase 5 | Non | Les champs QC shadow ne sont lus par aucun moteur de production. |
| Situation météorologique | Non dans le poids modèle | Les régimes existent ailleurs, mais ne modifient pas les poids de la fusion quotidienne. |
| Convergence | Confiance seulement | L’accord influence le score de confiance après fusion, pas les poids sources.[6] |
| Dispersion des ensembles | Non | Aucun ensemble n’est connecté au Data Hub actif. |
| Observations disponibles | Non dans cette fusion | Les observations physiques alimentent les performances historiques, pas la valeur quotidienne fusionnée. |
| Distance et représentativité des stations | Non dans cette fusion | Ces facteurs existent dans la fusion de stations, distincte de la fusion quotidienne modèle. |
| Indépendance des sources | Non | Best Match reste un huitième contributeur malgré son statut dérivé non indépendant. |

## Incohérence héritée — résolution avant toute Phase 6

Avant le nettoyage, le cycle v8 écrivait dans `forecasts` des lignes récentes `Météo-France` et `OpenWeatherMap` de catégorie publique pour les deux lieux. La trace finale les excluait déjà et conservait seulement les huit flux experts, car le passage multi-lieux réécrivait ensuite la synthèse avec `expertData`. Cette double voie a été supprimée : le handler n’appelle plus les adaptateurs publics, écrit uniquement les huit flux autorisés et ne relit plus les anciennes lignes publiques pour calculer la synthèse. Les archives historiques restent conservées.

Le nettoyage est protégé par des tests structurels couvrant l’absence des écrivains publics, le catalogue expert-only, le compteur 7+1 et la conservation du chemin production puis shadow.

## Périmètre shadow proposé après clôture de P1.6

Le futur moteur doit consommer uniquement les valeurs canoniques du Data Hub et produire une évaluation shadow indépendante de la prévision affichée. Chaque poids devra conserver ses composantes séparées afin de rester explicable.

| Composante de poids | Source de preuve prévue | Règle de sécurité |
|---|---|---|
| Performance globale et locale | Scores physiques qualifiés | Aucune preuve insuffisante n’est remplacée par une performance inventée. |
| Horizon | Fenêtres Phase 3 et `forecastHorizonMinutes` | Une fenêtre sans source prioritaire reste incomplète. |
| Variable | Variable canonique Phase 4 | Un poids différent est calculé pour chaque variable. |
| Fraîcheur et qualité | Preuve Phase 5 | `INVALID`, `MISSING` et `STALE` ne participent pas ; `SUSPECT` reste traçable et pénalisé seulement en shadow. |
| Résolution | Métadonnée source vérifiée | Une résolution inconnue reste neutre et signalée. |
| Situation météorologique | Règles déterministes versionnées | Aucun pourcentage arbitraire ni apprentissage opaque. |
| Indépendance | `sourceFamily` et `independenceClass` | Best Match reste un repère dérivé, jamais un huitième vote indépendant. |
| Ensembles, observations et stations | Données réellement connectées seulement | Les composantes absentes restent indisponibles, sans simulation. |

La sortie shadow devra conserver les valeurs originales, la décision QC, les sources rejetées, chaque facteur de poids, la somme normalisée, la prévision candidate, la comparaison avec la production existante et `appliedToProduction = 0`. Aucune confiance finale ne devra être publiée avant les phases dédiées au consensus, à l’incertitude et au score de confiance.

## Garde-fous, validation et rollback

L’implémentation shadow est autorisée par la validation explicite de gouvernance, malgré une couverture technique P1.6 de 3/7. Elle commence par des fonctions pures et une table additive shadow, puis un replay sur les deux lieux. Elle devra démontrer l’idempotence, l’absence de lecture publique, l’exclusion des sources dérivées ou invalides et la stabilité du moteur actuel. La fusion de production ne sera jamais promue sur la base de cette validation de gouvernance seule.

Le rollback consistera à cesser l’écriture et la lecture des évaluations Phase 6 shadow. La fusion actuelle, ses traces version 1 et les prévisions historiques resteront intactes. La Phase 7 de performance locale ne sera pas commencée dans ce chantier.

## Références

[1]: ../server/officialForecast.ts "Fusion quotidienne officielle"
[2]: ../server/scheduledHandlers.ts "Cycle v8 et écritures de production"
[3]: ../server/manualFusion.ts "Relance manuelle de la fusion"
[4]: ../server/officialWeatherSnapshot.ts "Snapshot météo live Best Match"
[5]: ../server/modelFallback.ts "Repli fondé sur la trace officielle"
[6]: ../server/fusionEngine.ts "Moteur de fusion adaptatif actuel"
[7]: ../server/db.ts "Sélection des performances physiques qualifiées"

## Résultats réels de l’évaluation shadow — 12 septembre 2026

Le contrat `phase6-smart-fusion-v1`, la table additive `shadow_weather_phase6_candidates` et le panneau administrateur sont désormais implémentés. Le moteur candidate lit uniquement les valeurs canoniques du Data Hub shadow ; il conserve Best Match comme référence dérivée non indépendante et n’active aucun vote indépendant supplémentaire.

Un replay idempotent des valeurs déjà archivées a traité 36 couples cycle-lieu et a persisté 3 138 candidats. Un second replay a produit exactement les mêmes comptes, sans créer de doublon. Les deux lieux disposent chacun de 1 569 candidats ; les six fenêtres Phase 3 sont représentées. Tous les candidats sont actuellement `PARTIAL`, car la couverture exigée par la stratégie reste incomplète pour les données historiques disponibles ; aucune valeur n’a été fabriquée et aucun candidat n’est `UNAVAILABLE`.

Le rapport propriétaire retourne `valid = true` pour l’isolation shadow : `productionReadsEnabled = 0`, `appliedToProduction = 0`, `shadowModeViolations = 0`. Les contrôles SQL confirment zéro groupe dupliqué. La suite complète valide **497 tests réussis et 2 ignorés** ; TypeScript et `git diff --check` sont propres. Cette évaluation ne modifie ni la fusion officielle, ni ses poids, ni les scores, ni les archives de production.
