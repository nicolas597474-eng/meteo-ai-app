# Rapport de validation de la Phase 8 — replay physique contrôlé

**Date du contrôle : 19 septembre 2026**  
**Périmètre : Phase 8 uniquement, en mode shadow**  
**Décision : aucune donnée n’est promue vers la production.**

## Conclusion

Le replay historique contrôlé a atteint les deux paliers demandés à partir de données réellement disponibles. Il a retenu **15 506 comparaisons valides** issues de **1 377 snapshots physiques qualifiés**. Les comparaisons couvrent deux localisations, dix-sept jours d’observation, trois fenêtres d’échéance et quatre paramètres météorologiques.

Les lignes retenues sont complètes et traçables. Elles associent la source et le modèle, la localisation, le paramètre, l’heure d’émission de la prévision, l’échéance, l’heure d’observation, les deux valeurs, l’erreur, la qualité de l’observation et les preuves de provenance des deux côtés. Les contrôles SQL ont confirmé **15 506 clés distinctes**, **zéro doublon**, **zéro ligne non-shadow**, **zéro application à la production** et **zéro champ de provenance manquant**.

Le contrôle temporel a confirmé que les **15 506 prévisions ont été reçues avant l’observation correspondante**. Aucune donnée future n’a donc été utilisée pour construire une comparaison.

## Premier rapport intermédiaire — palier de 18 comparaisons

Le palier de 18 comparaisons a été atteint par les 168 groupes évalués. Le plus petit groupe contient 27 comparaisons et couvre au moins 15 jours distincts. Les neuf groupes classés `OBSERVING` ont dépassé 18 comparaisons, mais restent sous 30. Les 159 autres groupes ont déjà dépassé le palier de 30 et sont classés `VALIDABLE` selon le contrat Phase 8.

L’examen intermédiaire n’a pas identifié de comparaison incomplète, de doublon ou de fuite temporelle. Il a toutefois confirmé trois limites importantes : la direction du vent n’est pas présente dans la table de snapshots physiques, la pression au niveau de la mer n’est pas ingérée dans les valeurs shadow comparables, et AROME possède des valeurs shadow mais ses valeurs Phase 5 pertinentes sont `SUSPECT` plutôt que `VALID`.

## Rapport complet — palier de 30 comparaisons

### Couverture réelle

| Élément | Résultat |
|---|---:|
| Snapshots physiques qualifiés utilisés | 1 377 |
| Comparaisons valides | 15 506 |
| Groupes source–paramètre–horizon–lieu | 168 |
| Groupes avec au moins 18 comparaisons | 168 |
| Groupes avec au moins 30 comparaisons | 159 |
| Groupes encore en observation | 9 |
| Localisations | 2 |
| Jours d’observation | 17 |
| Fenêtres d’échéance | `0_2h`, `2_6h`, `6_24h` |
| Sources effectivement évaluées | 7 |

Les deux localisations sont `50.676_2.845` et `50.756_2.521`. La période observée va du **2 septembre au 18 septembre 2026** pour les comparaisons effectivement alignées.

### Sources évaluées

Les six modèles déterministes effectivement comparés sont AROME exclu du replay faute de qualité admissible, ARPEGE, ECMWF, GEM, GFS, ICON et UKMET, auxquels s’ajoute Open-Meteo Best Match comme agrégateur dérivé. En pratique, les comparaisons persistées portent sur **ARPEGE, ECMWF, GEM, GFS, ICON, UKMET et Best Match**. AROME reste déclaré et ingéré dans le Data Hub, mais n’est pas compté tant que ses valeurs correspondantes ne sont pas qualifiées `VALID` par la Phase 5.

Cette exclusion est volontaire. Elle empêche de transformer une donnée `SUSPECT` en preuve physique valide et ne constitue pas une suppression de source ni une modification du moteur de production.

### Paramètres et horizons

| Paramètre | Horizons couverts | Comparaisons |
|---|---|---:|
| Température à 2 m | `0_2h`, `2_6h`, `6_24h` | 3 974 |
| Précipitations | `0_2h`, `2_6h`, `6_24h` | 3 792 |
| Vitesse du vent à 10 m | `0_2h`, `2_6h`, `6_24h` | 3 962 |
| Rafales à 10 m | `0_2h`, `2_6h`, `6_24h` | 3 778 |

Les quatre paramètres totalisent 15 506 lignes dans ce tableau agrégé par paramètre et horizon. Les nombres de référence sont ceux des lignes de comparaison et des métriques enregistrées en base.

La direction du vent et la pression MSL sont explicitement absentes du replay. Elles ne sont pas remplacées par une estimation.

### Agrégats statistiques shadow

Les valeurs ci-dessous sont des moyennes des métriques de groupes, et non une nouvelle pondération globale. Elles servent uniquement à contrôler la cohérence du calcul.

| Paramètre | Horizon | Comparaisons | MAE moyen | RMSE moyen | Biais moyen |
|---|---|---:|---:|---:|---:|
| Température | `0_2h` | 461 | 1,02 | 1,25 | -0,80 |
| Température | `2_6h` | 901 | 1,16 | 1,39 | -1,01 |
| Température | `6_24h` | 2 612 | 1,39 | 1,63 | -1,25 |
| Précipitations | `0_2h` | 440 | 0,02 | 0,08 | 0,02 |
| Précipitations | `2_6h` | 880 | 0,12 | 0,69 | -0,06 |
| Précipitations | `6_24h` | 2 472 | 0,08 | 0,34 | 0,05 |
| Rafales | `0_2h` | 433 | 13,00 | 15,39 | 12,88 |
| Rafales | `2_6h` | 873 | 14,94 | 17,25 | 14,78 |
| Rafales | `6_24h` | 2 472 | 17,21 | 19,44 | 17,10 |
| Vitesse du vent | `0_2h` | 454 | 8,25 | 9,46 | 7,78 |
| Vitesse du vent | `2_6h` | 894 | 9,86 | 11,17 | 9,75 |
| Vitesse du vent | `6_24h` | 2 614 | 10,76 | 12,14 | 10,22 |

Les métriques probabilistes Brier, CRPS et calibration restent indisponibles après contrôle des données réelles. Les **108 120 valeurs shadow** auditées portent toutes `memberKey=deterministic` ; aucune probabilité d’événement, distribution d’ensemble, quantile ou issue binaire traçable n’est ingérée. Le rapport Phase 8 expose désormais explicitement le statut `UNAVAILABLE`, les compteurs Brier/CRPS/calibration à zéro comme **métriques non calculées**, et les raisons d’absence de preuve. Ces valeurs zéro ne représentent donc pas une performance. Aucune probabilité n’est reconstruite à partir de l’écart entre modèles ou d’une extrapolation.

## Données exclues

Le replay a refusé explicitement les catégories suivantes : variables qui ne font pas partie du contrat Phase 8, valeurs forecast absentes ou non finies, qualité forecast différente de `VALID`, qualité Phase 5 différente de `VALID`, runs shadow qui ne sont pas `SUCCESS`, runs sans `receivedAt`, horizons non résolus, prévisions hors période, observations sans station ou confiance, observations sans valeur pour le paramètre demandé, absence de prévision alignée, et prévision reçue après l’instant observé.

Le dry-run a notamment signalé 9 132 valeurs avec une qualité forecast/Phase 5 non admissible, 7 930 horizons non résolus, 1 377 observations sans direction du vent, 1 377 observations sans pression comparable, ainsi que des absences ponctuelles de précipitation, de rafales et de vitesse du vent. Ces lignes restent exclues ; elles ne sont ni corrigées artificiellement ni comptées dans les seuils.

## Reproductibilité et idempotence

Le replay est disponible via `scripts/run-phase8-replay.ts`. Le mode `--dry-run` ne produit aucune écriture. Le mode normal écrit exclusivement dans `shadow_weather_phase8_comparisons` et `shadow_weather_phase8_metrics`, avec une clé de comparaison déterministe et une mise à jour idempotente. Les champs `shadowMode=1` et `appliedToProduction=0` sont imposés à chaque ligne.

La comparaison conserve deux objets de provenance JSON. La provenance de l’observation pointe vers le snapshot qualifié, son identifiant, sa localisation, sa date, son heure, sa couverture station, son niveau de confiance, les stations utilisées et son heure de collecte. La provenance forecast conserve l’identifiant de valeur shadow, le run d’ingestion, la source, le fournisseur, le modèle, l’heure de réception, l’heure valide, l’horizon, le statut de preuve du run et le hash du payload lorsqu’il existe.

## Impact sur le moteur de fusion

L’impact opérationnel est **nul à ce stade**. Les métriques sont stockées dans des tables shadow et ne sont lues par aucun moteur de fusion, calcul de score de production, pondération, prévision visible ou archive historique de production. Les seuils de 18 et 30 servent uniquement à qualifier la maturité de l’observation Phase 8.

Aucune pondération ne doit être modifiée sur la base de ces résultats. Les volumes restent concentrés sur deux localisations et dix-sept jours, plusieurs paramètres sont absents, AROME n’est pas encore admissible et Best Match est un agrégateur dérivé non indépendant. Ces limites empêchent toute conclusion de promotion opérationnelle.

## État et décision

La Phase 8 dispose désormais d’un replay contrôlé, d’un registre de comparaison auditable et de résultats dépassant les deux seuils demandés pour les groupes admissibles. La Phase 8 reste en **shadow-only**. La Phase 9 n’est pas préparée et ne doit pas commencer sans validation explicite distincte.

## Références internes

[1]: /home/ubuntu/meteo-ai-app/shared/weatherDataHub.ts "Contrat partagé et seuils Phase 8"
[2]: /home/ubuntu/meteo-ai-app/server/weatherDataHubShadow.ts "Orchestrateur shadow et replay contrôlé Phase 8"
[3]: /home/ubuntu/meteo-ai-app/scripts/run-phase8-replay.ts "Lanceur du replay historique contrôlé"
[4]: /home/ubuntu/meteo-ai-app/drizzle/0039_fantastic_gwen_stacy.sql "Migration additive de traçabilité Phase 8"
