# P2 — Traçabilité des runs fournisseur en mode shadow

**Auteur : Manus AI**  
**État : implémenté en shadow, sans lecture par la production**

P2 enrichit les runs du Data Hub P1 avec une preuve distincte de l’heure de run. Il ne modifie ni les prévisions, ni la fusion, ni les scores, ni les poids. La documentation Open-Meteo expose une API de métadonnées indiquant l’initialisation, la disponibilité et la modification du dernier run de chaque modèle.[1]

> Une heure provenant de l’API de métadonnées décrit le dernier run connu du modèle, mais ne prouve pas que le payload Forecast reçu est exactement lié à ce run.

| Statut | Signification | Heure attribuable au payload |
|---|---|---:|
| `PROVIDER_REPORTED` | Le payload ou son en-tête porte une heure de run explicite. | Oui |
| `OPEN_METEO_METADATA` | L’API de métadonnées expose le dernier run du modèle ou de sa famille. | Non |
| `SCHEDULE_DERIVED` | Seule une cadence documentaire est connue. | Non |
| `UNKNOWN` | Aucune heure fiable n’est disponible ou Best Match reste non résolu. | Non |

## Résultat du contrôle réel du 2 septembre 2026

Le replay P2 a été exécuté sur les deux lieux favoris et a écrit exclusivement dans les tables shadow. Pour chaque lieu, les huit flux quotidiens et huit flux horaires ont été normalisés. Quatorze runs portent une métadonnée Open-Meteo, tandis que les deux runs Best Match restent explicitement inconnus. Aucun run ni aucune valeur shadow n’est appliqué à la production, et la clé unique complète ne présente aucun doublon.

| Contrôle | Résultat par lieu |
|---|---:|
| Flux quotidiens | 8 |
| Flux horaires | 8 |
| Runs `OPEN_METEO_METADATA` | 14 |
| Runs `UNKNOWN` | 2 |
| Runs `PROVIDER_REPORTED` | 0 |
| Valeurs appliquées à la production | 0 |

## Correspondance des métadonnées

AROME, ARPEGE, ICON EU et ECMWF utilisent une cible de métadonnées exacte. Les alias seamless GFS, GEM et UKMET sont associés à une famille documentée ; ils restent donc distingués par la portée `model_family`. Best Match peut sélectionner ou assembler des modèles selon le lieu et l’échéance et conserve la portée `aggregator_unresolved`.[2]

## Garde-fous

Les appels de métadonnées utilisent un délai court, une seule tentative et un cache partagé de quinze minutes. Tout échec produit un statut `UNKNOWN` sans interrompre la collecte v8 ni l’écriture de production. `runTimeKnown` reste à zéro pour `OPEN_METEO_METADATA`; seul `PROVIDER_REPORTED` pourra déclarer un vrai run lié au payload.

## Rollback

Le code P2 peut être retiré sans toucher aux tables de production. Les colonnes shadow peuvent rester inutilisées. Le rollback fonctionnel consiste à désactiver l’enrichissement de preuve et à conserver P1 ; aucune suppression de données n’est requise.

## Références

[1]: https://open-meteo.com/en/docs/model-updates "Open-Meteo — Weather Model Updates"
[2]: https://open-meteo.com/en/docs "Open-Meteo — Weather Forecast API Documentation"
