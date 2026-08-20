# Dossier de travail — audit MeteoAI

## Régimes et pondérations

Le module `server/fusionEngine.ts` contient vingt régimes étendus, alors que son commentaire d’en-tête et son titre de section annoncent encore douze régimes. Cette divergence documentaire ne modifie pas directement un calcul, mais rend plus difficile le contrôle des scénarios couverts.

Dans `detectExtendedRegime`, le test `t < 0` qui retourne `frost` précède le test de vague de froid `t < -2 && w > 15`. Une situation froide et ventée correspondant au second critère ne peut donc jamais produire `cold_wave`. À température inférieure ou égale à 0 °C avec précipitation supérieure à 0,5, le code classe d’abord l’événement comme `freezing_rain`, ce qui empêche le régime `snow` de représenter des précipitations neigeuses sous 0 °C.

Les valeurs manquantes sont remplacées dans cette même fonction par des valeurs météorologiques centrales, notamment 15 °C, 50 % de nébulosité et 60 % d’humidité. Le moteur peut donc produire un régime spécifique malgré l’absence totale de données d’entrée.

Les poids de régime sont codés en dur. Ils sont mélangés entre régimes dans le mécanisme multi-régime, mais ne dépendent pas explicitement de l’échéance, de la saison calendaire, du volume d’observations ni de performances mesurées par paramètre.

## Fusion adaptative, échéances et confiance

La fonction `computeFusion` annonce une pondération par paramètre, mais le poids brut de toutes les variables dépend uniquement de `maeTemp`. Les MAE de précipitations et de vent sont définis dans le type d’entrée mais ne sont jamais sélectionnés par `computeRawWeight`. Ainsi, la température historique pilote aussi les poids appliqués aux précipitations, au vent, à l’humidité et aux autres variables.

La fonction `getLeadTimeWeights` ne recherche pas réellement les compartiments d’échéance adjacents : après le compartiment demandé, elle essaie systématiquement `0-6h`, puis `6-24h`, etc. Si le compartiment `8-15d` est absent, un score de très courte échéance est donc choisi avant `4-7d`. Ce repli croise des horizons qui ne sont pas comparables.

Dans `generateAdaptiveForecast`, la nébulosité est calculée avec les poids de température, faute de métrique dédiée. Cette décision est explicite dans le code et doit être affichée comme un repli, ou remplacée par une métrique de nébulosité avant d’être qualifiée de fusion par paramètre.

Le score de confiance local compte les stations admissibles même lorsqu’elles ne renseignent pas la température, et ne mesure l’accord inter-source qu’avec l’écart type thermique. Le nombre de stations peut donc augmenter la confiance alors que la variable évaluée est indisponible, tandis que les divergences de précipitation, rafales, humidité ou nébulosité ne diminuent pas ce score local.

## Moteur de fiabilité

`calculateReliabilityScore` produit des scores favorables lorsque les comparaisons sont absentes. Sans paire de température ou de vent, les primitives renvoient une erreur nulle et `maeToScore` renvoie 100. Sans paire de précipitation, le CSI vaut 1 et le score de quantité reçoit une valeur de repli de 70, ce qui crée un score de précipitation de 85 avec une taille d’échantillon nulle. Sans ligne de condition, la concordance est fixée à 70. Ces valeurs alimentent malgré tout `weightedScore`, même si `normalizedScore` est correctement laissé à `null` tant que les dimensions de laboratoire ne sont pas toutes comparables.

Le régime servant à pondérer `weightedScore` est déduit de la moyenne des observations de toute la période fournie. Le même poids contextuel est alors appliqué à toutes les erreurs, y compris si la période mélange plusieurs régimes ou saisons. L’évaluation n’est donc pas réellement segmentée par régime observé.

`calculateStabilityIndex` retourne 100 et « stable » avec moins de deux prévisions ; l’absence de données est interprétée comme une stabilité maximale. La fonction historique `generateMeteoAIForecast` retourne quant à elle des zéros numériques, et non des valeurs indisponibles, lorsqu’aucune prévision exploitable n’est présente. Son appel doit être localisé avant de qualifier ce dernier point de défaut de production.
