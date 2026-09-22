# Audit complet des Phases 1 à 8 — MeteoAI

**Date :** 22 septembre 2026  
**Périmètre :** Data Hub shadow, collecte, normalisation, contrôle qualité, fusion expérimentale, performance locale et métriques Phase 8.  
**Méthode :** inspection du code, contrôles SQL en lecture seule, vérification du checkpoint courant et exécution complète de TypeScript et Vitest.  
**Exclusion :** aucune modification du moteur, des poids, des scores, des archives ou des prévisions de production. La Phase 9 n’est pas commencée.

## Conclusion générale

L’architecture des Phases 1 à 8 respecte actuellement la séparation entre expérimentation et production. Les contrôles SQL confirment **zéro violation d’isolation** pour les sources, les runs, les valeurs, les candidats Phase 6, les métriques Phase 8 et les comparaisons physiques Phase 8. Les **15 506 comparaisons** persistées sont uniques, complètes du point de vue de la provenance et ne présentent aucune fuite temporelle détectée.

La faiblesse principale ne concerne donc pas la sécurité de la production. Elle concerne la **maturité et l’automatisation du dispositif shadow**. La Phase 7 ne contient encore aucune ligne persistée de performance locale. Le replay Phase 8 est fiable, mais il est lancé par un script dédié et n’est pas appelé automatiquement par le cycle v8. Enfin, une partie importante des valeurs ingérées n’a pas encore d’horizon résolu ou de qualité Phase 5 `VALID`, ce qui réduit la couverture réellement exploitable.

> **Verdict :** aucune anomalie critique d’isolation ou de data leakage n’est observée. Trois écarts doivent être traités avant de considérer les Phases 1 à 8 comme pleinement opérationnelles : la persistance P7, l’automatisation du replay P8 et la réduction documentée des données sans horizon ou sans qualité admissible.

## Synthèse des contrôles réels

| Contrôle | Résultat | Évaluation |
|---|---:|---|
| Sources shadow enregistrées | 8 | Conforme au périmètre 7 modèles + 1 agrégateur |
| Violations sur les sources | 0 | Conforme |
| Runs d’ingestion shadow | 594 | Conforme |
| Runs sans `receivedAt` | 0 | Conforme |
| Violations sur les runs | 0 | Conforme |
| Valeurs shadow | 102 600 | Conforme pour l’isolation |
| Violations sur les valeurs | 0 | Conforme |
| Candidats Phase 6 | 6 066 | Shadow-only, mais tous `PARTIAL` |
| Lignes Phase 7 persistées | 0 | Écart de maturité |
| Groupes métriques Phase 8 | 168 | Conforme |
| Comparaisons Phase 8 | 15 506 | Conforme |
| Clés de comparaison distinctes | 15 506 | Aucun doublon |
| Fuites temporelles détectées | 0 | Conforme |
| Provenances manquantes | 0 | Conforme |

## Phase 1 — Data Hub canonique shadow

La Phase 1 est structurellement conforme. Huit sources sont présentes dans le registre shadow : sept modèles déterministes et l’agrégateur Open-Meteo Best Match. Les sources sont séparées par identifiant, fournisseur, modèle, rôle et classe d’indépendance.

Les 594 runs d’ingestion sont tous en mode shadow avec `appliedToProduction=0`. Aucun run ne présente de `receivedAt` manquant dans le contrôle effectué. L’idempotence est protégée par une clé unique combinant le cycle, la source et le lieu.

**Point de vigilance.** Les données auditées couvrent deux localisations principales. La capacité du code à gérer davantage de favoris ne constitue pas une preuve de couverture effectivement observée dans le Data Hub.

## Phase 2 — Classification des sources

La classification est cohérente avec la gouvernance actuelle : sept sources sont `DETERMINISTIC` avec le rôle `FORECAST`, tandis que Best Match est `DERIVED_AGGREGATOR` avec le rôle `DERIVED` et une indépendance `non_independent`. Aucune source Météo-France ou OpenWeatherMap n’est présente dans le registre actif audité et aucune classification n’est appliquée à la production.

Cette classification évite de compter Best Match comme un modèle indépendant supplémentaire. Elle est respectée dans les candidats Phase 6 et dans le rapport Phase 8.

**Anomalie : aucune.** La classification décrit toutefois la nature des flux ; elle ne constitue pas à elle seule une preuve de qualité statistique ou d’indépendance sur une longue période.

## Phase 3 — Hiérarchie des horizons

La Phase 3 dispose de fenêtres contractuelles et les métriques Phase 8 couvrent effectivement `0_2h`, `2_6h` et `6_24h`. Les comparaisons persistées utilisent un horizon résolu et excluent les valeurs dont l’horizon est inconnu.

L’audit révèle toutefois **19 960 valeurs sur 102 600** dont `forecastHorizonMinutes` est nul, soit environ **19,5 %**. Cette situation n’a pas provoqué de fuite temporelle dans le replay, car ces valeurs sont rejetées. Elle réduit néanmoins la couverture utile. Le code documente correctement que l’horizon calculé depuis l’heure de réception peut être un proxy lorsque l’heure réelle du run fournisseur n’est pas connue.

**Sévérité : moyenne.** Il s’agit d’une perte de couverture shadow, pas d’une contamination de production.

## Phase 4 — Normalisation canonique

Les **102 600 valeurs** contrôlées disposent d’une métadonnée de normalisation non nulle. La normalisation est donc persistée et traçable au niveau de chaque valeur shadow.

La couverture fonctionnelle reste partielle. La température, les précipitations, la vitesse du vent et les rafales sont disponibles pour le replay. La pression MSL et la direction du vent ne disposent pas d’une chaîne complète de comparaison physique. Elles ne sont ni estimées ni ajoutées artificiellement aux métriques.

**Anomalie d’isolation : aucune.** La limite porte sur la couverture des variables comparables.

## Phase 5 — Contrôle qualité

La répartition observée dans `shadow_weather_values` est de **66 870 valeurs `VALID`**, **19 808 `SUSPECT`** et **15 922 `MISSING`**. Aucune violation `phase5AppliedToProduction` n’a été détectée.

La règle d’exclusion est correctement appliquée au replay Phase 8. Les valeurs `SUSPECT`, `MISSING`, `INVALID` ou `STALE` ne sont pas transformées en preuves valides. Cela explique notamment pourquoi AROME reste exclu des comparaisons Phase 8 : ses valeurs pertinentes ne satisfont pas la qualité requise.

**Sévérité : moyenne pour la couverture, nulle pour l’isolation.** Près d’un tiers des valeurs n’est pas directement utilisable pour une comparaison physique. Le volume brut ingéré ne doit donc pas être présenté comme un volume de données évaluables.

## Phase 6 — Fusion intelligente expérimentale

Les 6 066 candidats Phase 6 sont tous `PARTIAL`. Aucun n’est `UNAVAILABLE`, mais aucun n’est encore `SHADOW_READY`. Cette situation est cohérente avec l’absence de performance locale suffisamment persistée et avec les preuves manquantes sur plusieurs composantes des poids expérimentaux.

Les garde-fous sont conformes : `productionReadsEnabled=0`, `shadowMode=1` et `appliedToProduction=0`. Best Match est conservé comme référence dérivée et non comme modèle indépendant.

**Sévérité : moyenne pour la maturité expérimentale.** Les candidats ne doivent pas être interprétés comme une fusion validée ou comme des poids prêts à remplacer la production.

## Phase 7 — Performance locale

La table `shadow_weather_phase7_local_performance` contient actuellement **zéro ligne**. Le rapport Phase 7 peut être calculé à partir de fonctions et de preuves disponibles, mais aucune fiche de performance locale n’est persistée dans la table dédiée au moment de l’audit.

Il s’agit du principal écart entre l’état annoncé de la Phase 7 et son état de persistance. Il explique aussi pourquoi les composants de performance locale restent absents des preuves utilisées par Phase 6 et pourquoi les candidats Phase 6 restent tous `PARTIAL`.

**Sévérité : élevée pour la complétude de la roadmap, nulle pour la sécurité.** Ce n’est pas une anomalie de production. C’est un manque de matérialisation persistante d’une phase déclarée préparée et publiée.

## Phase 8 — Métriques et replay physique contrôlé

La Phase 8 est la phase la plus complète de l’audit. Le replay a persisté **15 506 comparaisons valides** provenant de **1 377 snapshots physiques qualifiés**. Les comparaisons couvrent deux localisations, dix-sept jours, trois fenêtres d’échéance et quatre paramètres : température, précipitations, vitesse du vent et rafales.

Chaque comparaison conserve la source et le modèle, le lieu, la variable, l’heure d’émission ou de réception de la prévision, l’heure valide, l’horizon, l’heure d’observation, les deux valeurs, l’erreur signée, l’erreur absolue, le statut qualité de l’observation et la provenance JSON de la prévision et de l’observation.

Les contrôles SQL confirment :

- 15 506 clés distinctes pour 15 506 lignes ;
- zéro doublon ;
- zéro ligne non shadow ;
- zéro application à la production ;
- zéro provenance manquante ;
- zéro prévision reçue après l’observation correspondante.

Les 168 groupes ont dépassé le seuil de 18 comparaisons. 159 groupes ont dépassé 30 comparaisons et neuf groupes restent entre 18 et 29. Le seuil de 18 est donc atteint pour tous les groupes actuels ; le seuil de 30 n’est pas encore atteint par tous.

Les sources effectivement évaluées sont ARPEGE, ECMWF, GEM, GFS, ICON, UKMET et Best Match. AROME est volontairement exclu tant que sa qualité Phase 5 ne permet pas de le compter. Best Match reste un agrégateur dérivé et ne doit pas être présenté comme un modèle indépendant supplémentaire.

**Écart d’automatisation identifié.** Le replay est disponible dans `scripts/run-phase8-replay.ts`, mais la recherche du cycle v8 montre qu’il n’est pas appelé automatiquement depuis `scheduledHandlers.ts`. Les métriques Phase 8 ne s’actualisent donc pas nécessairement après chaque nouvelle collecte physique sans exécution explicite du lanceur ou d’un appel équivalent. Cette situation reste compatible avec le mode shadow, mais elle doit être résolue avant de parler de suivi continu.

## Anomalies et problèmes classés par priorité

| Priorité | Constat | Impact | Recommandation |
|---|---|---|---|
| P0 — aucune | Aucune violation d’isolation, aucune fuite temporelle et aucune promotion production détectée | Aucun impact production identifié | Conserver les garde-fous et les tests de non-régression |
| P1 | Phase 7 ne persiste aucune ligne de performance locale | Phase 6 reste entièrement `PARTIAL` et la performance locale n’est pas historisée dans sa table dédiée | Clarifier puis implémenter la persistance P7 shadow, sans modifier les poids |
| P1 | Replay Phase 8 non branché automatiquement au cycle v8 | Les métriques peuvent devenir obsolètes entre deux replays manuels | Préparer un branchement non bloquant et idempotent après les snapshots qualifiés |
| P2 | 19 960 valeurs ont un horizon inconnu | Réduction de la couverture Phase 3 et exclusion du replay | Améliorer la traçabilité de l’heure de run ou conserver l’exclusion explicite |
| P2 | 19 808 valeurs `SUSPECT` et 15 922 `MISSING` | Le volume brut est largement supérieur au volume réellement évaluable | Afficher séparément ingéré, normalisé, qualifié et comparable |
| P2 | Trois journées P1.6 ont une couverture incomplète | Continuité historique non parfaite sur la période du 2 au 20 septembre | Conserver les verdicts `EXTEND` et ne pas les convertir en journées complètes |
| P3 | Pression MSL et direction du vent absentes du replay physique | Pas de métriques Phase 8 pour ces paramètres | Ajouter uniquement si une observation physique qualifiée existe réellement |
| P3 | Brier, CRPS et calibration indisponibles | Pas d’évaluation probabiliste | Les afficher comme non disponibles, jamais comme zéro |

## Ce qui fonctionne correctement

Le registre des sources respecte le périmètre gouverné de sept modèles déterministes et un agrégateur dérivé. Les données sont stockées dans des tables shadow séparées. Les champs d’application production sont désactivés dans les contrôles réalisés.

La chaîne Phase 8 respecte les règles d’intégrité essentielles. Elle refuse les observations non qualifiées, les prévisions sans horizon, les valeurs non finies, les runs incomplets et les prévisions disponibles après l’observation. La provenance est conservée des deux côtés de chaque comparaison.

L’accès au rapport Data Hub est protégé par `adminProcedure`, et le panneau Phase 8 est conditionné au rôle administrateur dans l’AI Lab. La surface utilisateur standard ne lit pas les métriques shadow.

## Ce qui ne doit pas être conclu

Les résultats ne justifient pas une modification des poids de production. Les comparaisons couvrent seulement deux localisations et une période courte. AROME n’est pas encore comparable, Best Match n’est pas indépendant, et plusieurs paramètres ne disposent pas de vérité terrain exploitable.

Les 15 506 comparaisons ne constituent pas 15 506 observations indépendantes au sens statistique strict. Elles sont regroupées par lieu, source, paramètre, échéance et période. Les moyennes MAE, RMSE et biais restent donc des indicateurs shadow descriptifs, sans interprétation causale ni promotion automatique.

Les seuils de 18 et 30 valident une maturité minimale de groupe. Ils ne prouvent pas à eux seuls qu’un modèle est meilleur qu’un autre, ni qu’une pondération améliorera la prévision visible.

## Plan recommandé, sans passage en Phase 9

La prochaine action devrait rester dans le périmètre de consolidation des Phases 1 à 8. Elle devrait d’abord documenter la décision concernant P7 : soit persister une fiche locale alimentée exclusivement par les comparaisons physiques qualifiées, soit marquer explicitement P7 comme rapport calculé sans persistance et supprimer toute ambiguïté dans le suivi.

Ensuite, le replay Phase 8 devrait être appelé de manière non bloquante après une collecte physique réussie. Le branchement doit rester shadow-only, idempotent et indépendant des poids ou archives de production. Une panne du replay ne doit jamais faire échouer la collecte officielle.

Enfin, l’AI Lab devrait distinguer quatre volumes : valeurs ingérées, valeurs normalisées, valeurs qualifiées Phase 5 et comparaisons physiques Phase 8. Cette séparation éviterait de confondre disponibilité technique et preuve statistique.

## Validation logicielle

La validation exécutée pendant cet audit est verte : **135 fichiers de tests réussis, 505 tests réussis et 2 tests ignorés**. TypeScript est également validé par `pnpm check`.

Le dépôt était propre avant l’audit : aucun fichier modifié non prévu et aucun problème détecté par `git diff --check`. Le commit courant est le checkpoint `0928a9c`, qui documente la consolidation Phase 8 et l’absence de démarrage de la Phase 9.

L’audit parallèle multi-agent n’a pas produit de résultats séparés, car le job a été interrompu pour insuffisance de crédits. Les conclusions de ce rapport reposent donc sur les contrôles SQL directs, l’inspection locale du code, le checkpoint courant, le rapport Phase 8 et la suite complète de tests.

## Décision proposée

**Ne pas passer à la Phase 9.** La Phase 8 est validée pour l’isolation et le replay physique contrôlé, mais elle n’est pas encore complètement automatisée ni statistiquement mature pour une promotion.

La prochaine validation utilisateur devrait porter uniquement sur les deux écarts P1 : persistance de la performance locale Phase 7 et branchement automatique du replay Phase 8. Aucun poids, score de production, archive historique ou moteur de prévision ne doit être modifié dans cette consolidation.

## Références

[1]: /home/ubuntu/meteo-ai-app/shared/weatherDataHub.ts "Contrats partagés et calculs des Phases 2 à 8"
[2]: /home/ubuntu/meteo-ai-app/server/weatherDataHubShadow.ts "Orchestrateur shadow et replay contrôlé Phase 8"
[3]: /home/ubuntu/meteo-ai-app/drizzle/schema.ts "Schéma des tables shadow MeteoAI"
[4]: /home/ubuntu/meteo-ai-app/docs/phase8-validation-report.md "Rapport de validation du replay physique Phase 8"
[5]: /home/ubuntu/meteo-ai-app/scripts/run-phase8-replay.ts "Lanceur réutilisable du replay Phase 8"
[6]: /home/ubuntu/meteo-ai-app/todo.md "Suivi de la roadmap MeteoAI"

— **Manus AI**

> Ce document est un audit en lecture seule. Il ne constitue pas une autorisation de modifier la production ni de démarrer la Phase 9.
