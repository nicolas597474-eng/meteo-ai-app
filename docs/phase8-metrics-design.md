# Phase 8 — Métriques shadow

## Définition officielle

La Phase 8 exige des métriques séparées par modèle, variable, horizon, localisation et période : MAE, RMSE, biais moyen, erreur absolue moyenne, erreur médiane, taux de réussite pluie/non-pluie, erreurs température, précipitations, vitesse du vent, rafales, direction du vent et pression. Brier Score, CRPS, calibration et fiabilité probabiliste ne sont pertinents que pour des probabilités ou des ensembles réellement ingérés ; aucune valeur ne doit être inventée pour les sept modèles déterministes ou pour Best Match.

## Audit de l’existant

Le moteur statistique production calcule déjà MAE, RMSE, biais et erreurs maximales pour la température, MAE et biais de quantité ainsi que POD/FAR/CSI pour les précipitations, MAE et biais du vent moyen, MAE des rafales, et la concordance des catégories météorologiques. Il expose aussi des composantes scalaires pour vent, rafales, humidité et pression. Ces calculs alimentent actuellement les scores historiques et la fusion de production ; ils ne doivent pas être réutilisés directement comme nouvelles preuves Phase 8.

Les lacunes pour le nouveau contrat sont l’erreur médiane explicite, la direction du vent, une séparation systématique par horizon et période, et une preuve d’éligibilité locale. Les métriques probabilistes Brier/CRPS et la calibration restent **non applicables** au périmètre actuel tant qu’aucune source probabiliste ou ensemble n’est réellement ingérée. La présence historique de lignes publiques ou non qualifiées ne constitue pas une preuve Phase 8.

## Contrat shadow proposé

Chaque résultat doit être identifié par `locationKey`, `sourceKey`, variable canonique, fenêtre Phase 3, période d’évaluation et version de contrat. Il doit conserver le nombre de comparaisons, les jours distincts, les valeurs manquantes, la preuve d’observation, la qualité QC, MAE, RMSE, biais, médiane absolue, statut et raison d’inéligibilité. Best Match reste un agrégateur dérivé non indépendant ; il peut être rapporté séparément mais ne doit jamais être compté comme modèle physique indépendant.

La Phase 8 doit distinguer `INSUFFICIENT`, `OBSERVING`, `VALIDABLE` et `INVALID`. Le classement `VALIDABLE` exige une preuve locale admissible, des comparaisons et des jours distincts suffisants, sans mélange silencieux de variables ou d’horizons. Les métriques absentes restent nulles et sont signalées comme non disponibles.

## Garde-fous

Le module sera écrit dans le Data Hub shadow, avec migration additive et upserts idempotents uniquement. Aucun lecteur ne sera ajouté à `fusionEngine`, `officialForecast`, `modelFallback`, aux pondérations actives, aux scores publics ou aux archives de production. `appliedToProduction` restera à zéro et le rapport sera réservé à l’administrateur.

## État avant implémentation

L’audit est terminé. La Phase 8 peut être préparée en shadow, mais aucune métrique probabiliste ne doit être activée sans ingestion réelle correspondante. La prochaine étape autorisée est l’implémentation d’un calcul pur et d’un stockage shadow séparé, suivie d’un contrôle réel de couverture ; la production reste inchangée.
