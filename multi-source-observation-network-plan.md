# Réseau d’observations multi-sources — plan d’architecture

## Principe directeur

MeteoAI ne doit ni choisir arbitrairement une station, ni calculer une moyenne simple. Chaque observation suit un parcours contrôlé : **découverte**, **validation**, **qualification**, **pondération par paramètre**, puis éventuellement **fusion**. Une station inconnue ou non vérifiable peut être affichée, mais elle ne modifie jamais la température locale finale.

## Niveaux de confiance

| Niveau | Sources | Rôle initial | Condition de contribution |
|---|---|---|---|
| 1 — Très haute confiance | Météo-France, METAR, Netatmo authentifiée, station professionnelle documentée | Référence prioritaire | Identifiant réel, fraîcheur, mesures complètes et absence d’anomalie. |
| 2 — Haute confiance | CWOP/MADIS, station privée avec historique mesuré | Candidate forte | Drapeaux qualité exploitables et performances locales suffisamment observées. |
| 3 — Ultra-local | openSenseMap, WeatherLink, Ambient, AWEKAS, WOW et autres capteurs privés | Candidate locale | Métadonnées, exposition, fraîcheur et cohérence satisfaisantes ; historique requis avant fusion. |
| Référence non station | Meteostat, modèles et réanalyses | Contrôle et repli | Ne sont jamais présentés comme station physique ni assimilés à une observation instantanée locale. |

Un niveau donne un **a priori de confiance**, jamais un poids final garanti. Toute station peut être temporairement exclue ; une station de niveau 3 ayant un excellent historique local peut être qualifiée, sans dépasser les protections appliquées aux observations officielles.

## Modèle de données commun

Chaque source doit produire le même contrat logique : `provider`, `providerStationId`, `sourceTier`, `observationTime`, `collectionTime`, `coordinates`, `altitude`, `exposure`, `environment`, `qualityFlags`, `variablesAvailable` et `rawMeasurement`.

Les identifiants sont obligatoires et préfixés par fournisseur, par exemple `netatmo-…`, `cwop-…` ou `opensensemap-…`. Aucune donnée de grille ne peut utiliser un identifiant ou un libellé de réseau physique.

## Qualification avant fusion

Une station passe successivement par les statuts suivants : `discovered`, `candidate`, `validated`, `temporarily_excluded` et `retired`. La qualification est indépendante pour la température, l’humidité, le vent, les rafales, la précipitation et la pression.

| Contrôle | Méthode objective | Effet |
|---|---|---|
| Identité et provenance | Identifiant fournisseur réel et métadonnées suffisantes | Sans preuve : affichage comme référence ou rejet. |
| Fraîcheur | Âge calculé depuis `observationTime`, seuil par fournisseur et paramètre | Hors seuil : exclue de la fusion, mais âge affiché. |
| Complétude | Variable et horodatage réellement présents | Une station peut contribuer au vent sans contribuer à la température. |
| Exposition et environnement | `outdoor` obligatoire si disponible ; environnement documenté ou inconnu | Intérieur/mobile exclus de la température locale. |
| Anomalies temporelles | Valeur figée, saut rapide, domaine physique impossible | Exclusion temporaire avec motif. |
| Cohérence spatiale | Médiane pondérée des voisins qualifiés, écart absolu médian et références officielles | Pénalité ou exclusion, jamais rejet basé sur une seule station. |
| Historique | MAE, biais, disponibilité et fréquence sur comparaisons observées | Activation seulement après nombre suffisant de comparaisons. |

## Score par station et par paramètre

Le score n’est pas une addition brute. Pour la station `s` et le paramètre `p` :

```text
Q(s,p) = T(s,p) × D(s,p) × F(s,p) × H(s,p) × C(s,p) × A(s,p) × E(s,p) × V(s,p)
```

| Composante | Définition |
|---|---|
| `T` — type | A priori du niveau et du réseau ; il est plafonné et ne remplace pas l’historique. |
| `D` — distance | Décroissance continue adaptée au paramètre, calculée depuis les coordonnées réelles. |
| `F` — fraîcheur | Décroissance depuis l’âge réel du relevé, spécifique au paramètre. |
| `H` — historique | Fonction de MAE, biais, disponibilité et taille d’échantillon ; shrinkage vers un a priori tant que l’échantillon est faible. |
| `C` — cohérence | Pénalité basée sur l’écart robuste aux voisins et aux références indépendantes. |
| `A` — altitude | Pénalité selon l’écart d’altitude ; correction thermique uniquement si elle est validée localement sur historique. |
| `E` — environnement | Ajustement seulement avec une métadonnée documentée ; sinon neutre, sans inventer un microclimat. |
| `V` — complétude | Zéro si la variable est absente ; pénalité si les métadonnées requises manquent. |

La station Netatmo à 1,8 km de votre exemple ne peut atteindre un poids élevé que si sa fraîcheur, sa cohérence et son historique justifient ce niveau. Le poids final est toujours rendu avec son détail explicable dans Fiabilité.

## Fusion locale robuste

La fusion est calculée **séparément par paramètre**. Après les filtres de qualification, MeteoAI utilise une médiane pondérée comme centre robuste, puis une estimation pondérée qui réduit progressivement l’influence des écarts résiduels élevés. Les poids normalisés proviennent de `Q(s,p)` ; une source exclue a un poids nul et un motif visible.

L’altitude ne doit pas recevoir une correction fixe appliquée à toutes les stations. Une correction n’est appliquée qu’après validation de son gain sur les observations locales ; sinon elle reste une pénalité de comparabilité. En l’absence de sources qualifiées, MeteoAI conserve la référence officielle plutôt que de produire une valeur ultra-locale artificielle.

## Déploiement scientifique contrôlé

1. Retirer les fausses références de grille actuellement étiquetées comme réseaux de stations.
2. Ajouter les adaptateurs réels en statut `candidate`, sans fusion dans la température affichée.
3. Conserver les comparaisons par source et paramètre avec une référence indépendante.
4. Exécuter le nouveau calcul en **mode ombre** parallèlement au moteur actuel.
5. Ne promouvoir une source ou une nouvelle fusion que si l’amélioration du MAE est statistiquement démontrée, avec l’échantillon minimal et le seuil de significativité déjà adoptés par MeteoAI.
6. Afficher dans Fiabilité le statut, l’âge, les variables, le score détaillé, le motif d’exclusion et la contribution réelle de chaque station.

## Implémentation proposée après accord

L’implémentation se fera en modules : un catalogue de sources, des adaptateurs par fournisseur, un qualificateur commun, une persistance d’observations idempotente, une fusion robuste par paramètre et des tests unitaires pour chaque règle. Les fournisseurs nécessitant une clé, un abonnement ou l’accès du propriétaire ne seront jamais activés sans une décision et des identifiants explicites de votre part.
