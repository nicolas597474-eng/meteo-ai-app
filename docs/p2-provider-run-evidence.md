# P2 — Preuve des runs fournisseur

## Sources externes officielles

Open-Meteo documente une API de métadonnées par modèle qui expose `last_run_initialisation_time`, `last_run_modification_time`, `last_run_availability_time`, `temporal_resolution_seconds` et `update_interval_seconds` : <https://open-meteo.com/en/docs/model-updates>.

La même documentation précise que les métadonnées sont **éventuellement cohérentes** entre serveurs et que l’heure indiquée ne garantit pas directement le run utilisé par l’API Forecast. Une marge de dix minutes après disponibilité est recommandée pour viser le run le plus récent sur tous les serveurs.

L’API Forecast assemble une série continuellement actualisée à partir des runs les plus récents. Elle ne renvoie pas dans son objet JSON standard l’initialisation exacte du run utilisé pour chaque valeur : <https://open-meteo.com/en/docs>.

L’API Single Runs permet au contraire de demander un run explicitement identifié par son heure UTC d’initialisation avec le paramètre `run` : <https://open-meteo.com/en/docs/single-runs-api>. Ce service constitue une preuve forte lorsqu’il est utilisé pour reconstruire un run précis, mais P2 ne doit pas remplacer la collecte de production ni ajouter une deuxième collecte complète.

## Conséquence pour MeteoAI

P2 distingue quatre niveaux de preuve :

| Statut | Signification |
|---|---|
| `PROVIDER_REPORTED` | Le payload utilisé contient explicitement l’heure du run. |
| `OPEN_METEO_METADATA` | L’API de métadonnées expose le dernier run du modèle, mais la liaison exacte au payload Forecast n’est pas garantie. |
| `SCHEDULE_DERIVED` | L’heure vient uniquement d’une cadence documentaire ou d’une règle interne ; elle n’est jamais enregistrée comme vraie heure fournisseur. |
| `UNKNOWN` | Aucune preuve exploitable n’est disponible. |

Pour les sept modèles nommés, P2 peut consulter le petit fichier `meta.json` du modèle correspondant avec un budget réseau court et un cache. Best Match reste `UNKNOWN`, car Open-Meteo peut sélectionner ou combiner des modèles selon le lieu et l’échéance.

P2 reste strictement shadow : aucune heure de run ne doit modifier la prévision, la fusion, les scores, les poids, les archives historiques ou la promotion de P1.
