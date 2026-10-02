# Preuves statistiques de la fusion quotidienne

## But

La fusion quotidienne ne traite plus un MAE brut comme une certitude. Une performance n’est admissible que pour le **même lieu, le même modèle, la même variable et le même horizon**. Les comparaisons de production proviennent d’une émission archivée et d’une observation physique journalière qualifiée; aucune donnée du Data Hub Phase 8 shadow n’est lue ou réutilisée.

## Construction des comparaisons

À chaque collecte, les dates quotidiennes déjà présentes dans la réponse Open-Meteo sont archivées dans `forecast_runs`. La ligne conserve les valeurs après la même correction de biais que celle injectée dans la fusion. Quand une journée physique est qualifiée, les valeurs du modèle sont comparées à cette observation pour chaque variable disponible et pour l’horizon calculé entre l’émission et la fin de la journée locale Europe/Paris.

La température et le vent demandent au moins 18 heures physiques qualifiées. Le cumul de pluie n’est comparable que lorsque les 24 précipitations horaires physiques existent; aucune pluie manquante n’est assimilée à zéro. Les réémissions d’un même jour sont réduites à un score journalier avant le calcul d’incertitude, afin qu’elles n’augmentent pas artificiellement le nombre d’unités indépendantes.

## Admission des preuves

Pour un groupe exact `(lieu, modèle, variable, horizon)`, il faut :

- au moins **30 dates valides distinctes**, et au moins 30 comparaisons;
- un échantillon cohérent (`sampleSize = evaluatedDays`);
- un score physique récent (au plus 7 jours), non futur;
- une prévision et une observation finies, avec une couverture horaire propre à la variable.

La fenêtre de calcul est limitée aux 120 jours précédant la date évaluée; la date évaluée elle-même et les dates futures sont exclues. Un autre lieu, une autre variable ou un horizon voisin ne peut pas servir de repli.

## Équation de régularisation

Pour un modèle `m` dans un groupe exact, on note `n` le nombre de jours indépendants, `MAE_m` sa moyenne d’erreur absolue par jour et `SE_m` l’erreur standard des MAE journaliers. La référence `B` est la médiane des MAE des modèles admissibles du même groupe.

```text
fiabilité de l’échantillon       q_m = n / (n + 30)
borne prudente à 90 %            U_m = MAE_m + 1,645 × SE_m
MAE régularisé                   R_m = B + q_m × (U_m − B)
multiplicateur de performance    P_m = clip(1 / max(R_m, 0,5), 0,3, 2)
poids brut quotidien             W_m = fraîcheur × P_m
```

Dans la fusion quotidienne, distance et qualité spatiales sont neutres (toutes les sources proviennent du même lieu et la performance statistique est déjà intégrée); l’horodatage de l’émission fournit le facteur de fraîcheur. Les poids sont ensuite normalisés **sous un plafond de 35 % par `modelId`**. S’il n’y a pas assez de modèles distincts pour remplir le budget sans dépasser ce plafond, la variable n’est pas fusionnée.

Le plancher de 0,5 et les bornes `[0,3; 2]` bornent l’influence d’un MAE extrême. La borne `U_m` pénalise l’incertitude, tandis que `q_m` rapproche davantage les petits échantillons de la médiane des pairs admissibles. La médiane n’est jamais fabriquée à partir de modèles insuffisamment documentés.

## Exemple 0,6 °C sur 12 cas contre 0,8 °C sur 500

Si « 12 cas » correspond à 12 dates distinctes, **0,6 °C est exclu** avant le calcul des poids parce qu’il n’atteint pas les 30 jours minimum. Il ne peut donc pas battre, démultiplier ou obtenir un avantage sur le modèle à 0,8 °C.

Le modèle à **0,8 °C sur 500 comparaisons** peut être admissible si ces comparaisons couvrent au moins 30 dates distinctes récentes dans le même lieu, la même variable et le même horizon. Comme la fenêtre de calcul est de 120 jours, `n` vaut au plus 120 : avec 120 dates distinctes, `q = 120 / (120 + 30) = 0,8`. Les 500 comparaisons ne sont jamais comptées comme 500 observations indépendantes; le poids final dépend aussi de `SE_m`, de la médiane `B` des modèles admissibles comparables et de la fraîcheur. Les deux MAE seuls ne suffisent pas à calculer honnêtement le poids exact.

## Avant et après la migration

La migration versionnée `0045_daily_fusion_performance.sql` ajoute uniquement `daily_forecast_observation_comparisons` et ses index. **Elle n’est pas appliquée par ce changement.** Tant que la table n’existe pas, l’écriture des comparaisons est ignorée avec un avertissement contrôlé, la lecture retourne `schema_unavailable`, et les valeurs/confidences officielles non qualifiées restent `null` — sans moyenne égale ni fallback sur des scores globaux ou Phase 8. L’interface affiche alors « Non disponible », pas « 0 % ».

Après activation de la migration, les nouvelles comparaisons physiques s’accumulent progressivement. Les sorties demeurent non calibrées jusqu’à 30 dates admissibles pour chaque modèle, variable et horizon concerné; les horizons longs nécessitent donc leur propre période d’observation. Les variables sans observation physique journalière robuste, notamment humidité et nébulosité, restent indisponibles.
