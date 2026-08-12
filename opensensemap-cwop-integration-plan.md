# Plan d’intégration : openSenseMap et CWOP/MADIS

## Objectif et périmètre

L’objectif est d’ajouter des observations gratuites, publiques et sans clé API, sans jamais présenter une source de grille ou un capteur non vérifié comme une station locale fiable. L’intégration est limitée à deux réseaux : openSenseMap, via son API de lecture publique, et CWOP, via les observations publiques contrôlées par NOAA MADIS.

## Étape 0 — Retirer les fausses références de stations

Le collecteur actuel contient des entrées de grille Open-Meteo portant des noms de sources telles que `cwop` et `wunderground`. Elles ne représentent pas des stations physiques et doivent être supprimées avant toute intégration. Une station CWOP ou openSenseMap ne doit exister qu’après récupération d’un identifiant fournisseur réel et d’une observation réelle.

## Adaptateur openSenseMap

L’adaptateur serveur `openSenseMapService.ts` interrogera uniquement les routes publiques :

```text
GET https://api.opensensemap.org/boxes
  ?near=<longitude>,<latitude>
  &maxDistance=<rayon_en_mètres>
  &exposure=outdoor
  &classify=true
  &full=true
```

Pour chaque capteur, l’adaptateur doit enregistrer l’identifiant public de boîte, les coordonnées, l’exposition, la date du dernier relevé, le type du capteur et les dernières mesures. Seules les grandeurs explicitement fournies sont mappées : température, humidité, pression, vent, rafales et précipitation. Il ne faut jamais déduire une grandeur manquante.

Les identifiants persistés suivront le format `opensensemap-<boxId>`. La provenance visible sera `openSenseMap · capteur citoyen`, distincte de Météo-France, METAR et Netatmo.

## Adaptateur CWOP/MADIS

L’adaptateur `cwopMadisService.ts` doit être introduit uniquement après une mesure de couverture autour des favoris. Il lira les fichiers ou services de diffusion publics MADIS/CWOP adaptés aux observations de surface ; aucun compte ni jeton utilisateur n’est requis pour consulter les observations publiquement accessibles.

Chaque observation doit conserver le véritable identifiant CWOP, l’heure de l’observation, les indicateurs qualité fournis par MADIS et les variables réellement présentes. Les identifiants persistés suivront le format `cwop-<stationId>`.

## Filtres avant affichage et fusion

Une observation peut être affichée comme **capteur citoyen** si elle possède : des coordonnées valides, une observation datée, au moins une mesure météo et un identifiant fournisseur réel. Elle reste toutefois **en validation** et ne contribue pas à la température locale au premier relevé.

La qualification pour la fusion nécessite cumulativement :

| Contrôle | Règle |
|---|---|
| Fraîcheur | Âge inférieur à un seuil par source, affiché explicitement ; toute donnée périmée reste visible mais exclue. |
| Exposition | openSenseMap doit être déclaré `outdoor` ; les capteurs intérieurs ou mobiles sont exclus. |
| Complétude | Température et horodatage réels obligatoires pour une contribution thermique. |
| Cohérence | Écart évalué contre les stations officielles et les voisins à l’aide d’une médiane robuste et d’un écart absolu médian, sans seuil arbitraire unique. |
| Historique | Minimum de 7 comparaisons observées avant activation dans la fusion, puis poids mis à jour par MAE, biais, fraîcheur et distance. |
| Anomalies | Valeurs figées, hors domaine physique, sauts brusques et divergences répétées entraînent une exclusion temporaire et un motif affiché. |

Les sources doivent d’abord recevoir le statut `candidate`. Le statut `physical` ne sera accordé qu’après qualification ci-dessus. Cela évite qu’un capteur citoyen unique, mal exposé ou défectueux modifie la vérité terrain.

## Collecte et persistance

La recherche utilisateur peut lancer une lecture à la demande avec un cache court pour la liste locale. Le cycle planifié de collecte persiste les observations, les indicateurs qualité et un snapshot de disponibilité par favori. La persistance doit rester idempotente sur `source + providerStationId + observedAt`.

Les tables de stations et d’observations existantes sont suffisantes si elles conservent au minimum : la source, l’identifiant fournisseur, l’heure observée, l’heure de collecte, les mesures brutes, l’état de qualification et le motif d’exclusion. Si une migration est nécessaire, elle sera conçue puis appliquée séparément après accord.

## Interface et transparence

La page Fiabilité devra afficher des badges explicites : `Station officielle`, `Capteur citoyen en validation`, `Capteur citoyen validé` ou `Exclu`. Elle indiquera la source, l’âge, la distance, les variables présentes et le motif d’exclusion. Aucun capteur citizen ne sera étiqueté Netatmo, Weather Underground ou station officielle.

## Tests requis

Les tests devront couvrir le bornage du rayon, le mappage de réponses sans clé, l’absence de données simulées, le refus des capteurs intérieurs ou périmés, le passage `candidate` vers `validated` après historique suffisant, l’exclusion par cohérence et l’idempotence de persistance. Les tests réseau réels restent exclus de la suite déterministe ; les réponses de test devront être des fixtures explicitement marquées comme données de test et jamais utilisées en production.

## Ordre recommandé

1. Retirer définitivement les fausses références de grille étiquetées `cwop` ou `wunderground`.
2. Mesurer la disponibilité openSenseMap dans les rayons des favoris, sans l’inclure dans la fusion.
3. Intégrer openSenseMap comme source candidate et accumuler l’historique.
4. Tester la couverture CWOP/MADIS autour des mêmes favoris.
5. Activer la qualification et la pondération seulement si les métriques historiques améliorent objectivement l’erreur locale.

## Références

1. openSenseMap API, routes publiques et paramètres de recherche : https://api.opensensemap.org/ et https://docs.opensensemap.org/
2. NOAA MADIS — CWOP, disponibilité publique et contrôles qualité : https://madis.ncep.noaa.gov/madis_cwop.shtml
