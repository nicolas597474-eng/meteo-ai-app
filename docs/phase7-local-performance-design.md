# Phase 7 — Performance locale shadow

## Objet

La Phase 7 doit conserver un historique de performance par localisation et permettre un classement automatique par modèle, variable, saison, heure, horizon et situation météorologique. Elle ne doit pas supposer qu’un modèle est toujours meilleur et ne doit pas alimenter la fusion de production avant une validation indépendante.

## Audit réel au 13 septembre 2026

La table `reliability_scores` contient une clé `locationKey`, des métriques MAE température, précipitations et vent, des biais, des scores pondérés, une date d’évaluation et un champ `evidenceType`. Les preuves ne sont pas homogènes : une partie est `legacy_unqualified`, tandis que les preuves issues de stations physiques sont explicitement marquées `physical_observation`.

| Périmètre observé | Résultat réel | Conséquence Phase 7 |
|---|---:|---|
| Lieux présents dans `reliability_scores` | 6 clés de lieu | Le classement doit rester séparé par `locationKey` ; aucune agrégation implicite entre lieux |
| Preuves physiques qualifiées | 2 lieux : `50.676_2.845` et `50.756_2.521` | Seuls ces lieux disposent actuellement d’une base locale directement exploitable |
| Jours `physical_observation` | 20 jours pour `50.676_2.845`, 19 jours pour `50.756_2.521` | La maturité est mesurée par lieu, sans compléter artificiellement les dates manquantes |
| Modèles dans ces preuves physiques | 10 noms historiques par lieu | Le futur classement doit filtrer les sources autorisées 7+1 et signaler les autres archives comme hors périmètre |
| Preuves `legacy_unqualified` | Présentes sur les six lieux | Elles peuvent être conservées pour l’historique, mais ne doivent pas être présentées comme preuve locale qualifiée |
| Stations physiques | 25 jours de snapshots par lieu, dont 5 jours avec station qualifiée pour `50.676_2.845` et 4 pour `50.756_2.521` | La couverture station doit être une dimension de confiance séparée et visible |

Les performances existantes montrent déjà des différences locales. Par exemple, sur la période historique consultée, AROME et Open-Meteo ont des MAE température inférieures à GFS ou ICON sur certains lieux, tandis que le classement change selon la localisation et la période. Ces valeurs ne sont pas converties automatiquement en poids de production et ne suffisent pas à déclarer un modèle meilleur sans filtre d’évidence et seuil de comparaison.

## Contrat shadow proposé

La Phase 7 doit produire un enregistrement par `locationKey`, source autorisée 7+1, variable, fenêtre d’horizon, période d’évaluation et version de contrat. Chaque ligne doit conserver le nombre de comparaisons, le nombre de jours distincts, la MAE, la RMSE, le biais, le dernier instant observé, le statut d’évidence et le rang éventuel. Best Match reste un agrégateur dérivé et ne doit jamais être compté comme un modèle physique indépendant.

Le calcul doit distinguer au minimum les preuves `physical_observation` des preuves `legacy_unqualified`. Une métrique locale sans observation qualifiée doit être marquée comme historique non qualifiée, et non fusionnée silencieusement avec une preuve stationnée. Les sources publiques abandonnées et les modèles hors registre 7+1 restent conservés dans les archives, mais sont exclus du nouveau classement shadow.

## Seuils et garde-fous

Les seuils existants du laboratoire restent informatifs : 18 comparaisons constituent le minimum technique, tandis que 30 comparaisons et 7 jours distincts sont le seuil de classement public existant. Phase 7 ne doit pas abaisser ces seuils. Une absence de données, une couverture station insuffisante, un horizon non distinct ou un statut de qualité non valide doit produire un état explicite `INSUFFICIENT`, `OBSERVING` ou `VALIDABLE`, jamais une valeur inventée.

La production reste isolée : aucun lecteur de `reliability_scores` Phase 7, aucune nouvelle table shadow, aucun rang local et aucune performance locale candidate ne doit être utilisé par `fusionEngine`, `officialForecast`, `modelFallback`, les scores publics, les pondérations actives ou les archives de production. Toute écriture future devra être additive, idempotente et protégée par `appliedToProduction = 0`.

## Limites constatées

La base contient des archives historiques de services publics et des lignes `legacy_unqualified`. Le nettoyage 7+1 déjà publié empêche les nouvelles écritures publiques, mais ne réécrit ni ne supprime ces archives. La Phase 7 doit donc porter une preuve de périmètre explicite et ne pas interpréter leur présence historique comme une nouvelle source active.

La prochaine étape est la conception puis l’implémentation d’un contrat shadow local, sans promotion de classement et sans modification des moteurs actuels. Toute promotion devra attendre une validation indépendante de couverture, de stabilité, d’idempotence et de non-régression.

## État d’implémentation et contrôle réel

La Phase 7 dispose désormais d’un contrat pur (`phase7-local-performance-v1`), d’une table additive `shadow_weather_phase7_local_performance`, d’une persistance idempotente et d’un rapport administrateur réservé au rôle propriétaire. Le panneau indique séparément les comparaisons physiques, les archives non qualifiées et l’état de promotion.

Le contrôle SQL du 14 septembre 2026 retourne actuellement **0 fiche**, **0 comparaison physique**, **0 comparaison héritée**, **0 lecture production**, **0 application production** et **0 violation shadow**. Cette absence est volontaire et conforme aux garde-fous : les catégories d’observation du Data Hub P1 restent vides, donc aucune performance locale n’est inventée à partir des tables de production ou des archives non qualifiées. La Phase 7 est techniquement préparée mais ne peut pas être déclarée `VALIDABLE` tant qu’une branche d’observation physique shadow n’a pas fourni les preuves requises.
