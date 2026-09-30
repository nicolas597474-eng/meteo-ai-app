# Collecte automatique des prévisions favorites

Le callback existant est `POST /api/scheduled/collect-favorites-forecasts`, enregistré dans `server/_core/index.ts`. Le dépôt contient le handler, mais pas l’horaire du Heartbeat : la tâche est gérée par la plateforme d’hébergement, conformément à [`references/periodic-updates.md`](../references/periodic-updates.md). Une PR ne modifie donc pas, à elle seule, la cadence actuellement exécutée.

Le dépôt contient aussi un ancien callback quotidien `POST /api/scheduled/collect-forecasts` (commenté à 07:30 dans le code). Il reste inchangé et indépendant; il collecte la position historique Hondeghem, et ses jobs sans clé de créneau ne sont pas présentés comme des lots favoris dans le Dashboard.

## Cadence cible

Les six collectes quotidiennes visées sont à **01:00, 05:00, 09:00, 13:00, 17:00 et 21:00 Europe/Paris**. 05:00 est conservé. Le handler collecte uniquement si l’heure locale est l’un de ces six créneaux; les autres appels de garde répondent sans appeler Open-Meteo.

Le Heartbeat accepte une expression UTC fixe à six champs, alors que Paris alterne UTC+01:00 et UTC+02:00. Pour couvrir les deux saisons avec une seule tâche, sans perdre 05:00, la configuration à appliquer à la tâche existante est :

```text
0 0 0,3,4,7,8,11,12,15,16,19,20,23 * * *
```

Cette expression déclenche jusqu’à douze vérifications HTTP par jour, mais **seules six** correspondent à un horaire de collecte parisien selon la saison. Elle ne déclenche pas douze collectes météo et n’interroge pas Open-Meteo à chaque heure. Par exemple, 03:00 UTC correspond à 05:00 à Paris en été; 04:00 UTC correspond à 05:00 en hiver.

## Activation coordonnée requise

Le code garde le mode historique **05:00** tant que la variable runtime `METEOAI_FAVORITES_FORECAST_CADENCE` n’est pas définie à `4h`. Après revue, fusion et déploiement du code, l’activation doit se faire en mettant à jour **la tâche Heartbeat existante** (ne pas créer une deuxième tâche) avec l’expression UTC ci-dessus et en réglant la variable runtime à `4h`. Les deux réglages doivent être coordonnés; le tableau de santé indique le mode runtime et l’expression requise, mais le dépôt ne peut pas vérifier l’état live du scheduler externe.

Avant l’activation, vérifier dans le gestionnaire de tâches que le callback est bien celui indiqué ci-dessus, noter son UID, puis modifier cette tâche en place. Vérifier ensuite son historique d’exécution : les créneaux non parisiens doivent être ignorés, et les six créneaux locaux doivent produire des lots avec heure de début, fin et compteurs. Le créneau de 05:00 doit rester présent toute l’année.

## Idempotence, concurrence et historique

Un lease persistant global sérialise deux lots programmés qui se chevaucheraient. Un lease par lieu est partagé avec la relance manuelle de l’AI Lab afin d’éviter les remplacements simultanés des séries quotidiennes et horaires. Les leases expirent après cinq minutes, sont réclamés par compare-and-set et sont supprimés à la libération; ils ne forment pas une archive croissante.

Un créneau Paris possède une clé stable par date et heure, avec une contrainte unique dans `collection_jobs`. Un appel dupliqué après succès est ignoré; un lot échoué ou resté bloqué peut être repris. Les deux derniers jobs exposés au Dashboard portent leurs propres horodatages et compteurs de modèles quotidiens et horaires persistés.

Les lignes `forecast_runs` restent l’archive immuable des émissions réellement collectées, utilisée pour l’évaluation des échéances. La cadence limite les nouveaux lots de prévisions favoris à six par jour et la clé par créneau empêche une tempête de doublons, mais l’archive historique croît naturellement avec chaque collecte réelle (y compris le callback legacy indépendant). Aucune politique de suppression/rétention n’est ajoutée ici, car supprimer ces lignes réduirait les données de validation à long terme.

Current Weather et ses snapshots officiels ne sont pas modifiés par ce callback; seules les prévisions quotidiennes et horaires sont rafraîchies.
