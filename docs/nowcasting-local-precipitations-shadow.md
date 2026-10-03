# Nowcasting local de précipitations — mode shadow

**Version :** `local-precipitation-nowcasting-shadow-v1`  
**Périmètre :** AI Lab administrateur uniquement  
**État de production :** verrouillé (`productionReadsEnabled = 0`, `appliedToProduction = 0`)

## Objectif

Le module confronte un **snapshot physique qualifié** de précipitations à une médiane des sept modèles déterministes déjà archivés. Il produit uniquement un signal d’**occurrence locale de pluie** pour les horizons `0 h`, `+1 h` et `+2 h`.

> Il ne modifie jamais un montant de précipitations exprimé en millimètres. Les pluviomètres disponibles ne publient pas tous un intervalle d’accumulation comparable ; calculer un delta de mm aurait été mathématiquement trompeur.

## Données réellement disponibles lors de l’audit initial

- **1 865** snapshots physiques contenant une précipitation ;
- **185** snapshots humides (`> 0 mm`) ;
- les sept archives de prévision horaire comportent la variable `precipitation` ;
- les observations humides historiques existent, mais les archives horaires antérieures ne sont pas présentes pour toutes les dates historiques. Elles sont donc explicitement marquées `UNAVAILABLE`, sans reconstitution ni invention.

## Algorithme

1. Lire le snapshot physique qualifié : date, heure Paris, station(s), confiance et précipitation observée.
2. Lire les seules archives horaires de modèles disponibles **au plus tard** à l’heure de référence de ce snapshot.
3. Exclure Best Match et calculer la médiane des valeurs de précipitation disponibles parmi les sept modèles déterministes.
4. Déterminer un seuil d’occurrence humide de `0,1 mm`.
5. Si l’observation est humide alors que la médiane est sèche, produire `WET_SIGNAL` à `0 h`, avec une persistance réduite à `50 %` à `+1 h` et nulle à `+2 h`.
6. Ne jamais supprimer une pluie modélisée au motif qu’une station est sèche : l’observation reste spatialement limitée.

## Pare-feux

| Règle | Effet |
|---|---|
| Archive disponible après l’observation | `LEAKAGE_BLOCKED` |
| Heure de disponibilité absente ou non finie | archive exclue |
| Observation de plus de 90 minutes | `STALE_OBSERVATION` |
| Absence de snapshot, de précipitation ou d’archive admissible | `UNAVAILABLE` |
| Horizon au-delà de +2 h | `UNAVAILABLE` |
| Best Match | exclu systématiquement |
| Ajustement de montant en mm | interdit |

## Premier replay contrôlé

Le replay du **3 octobre 2026 à 09 h Europe/Paris** a utilisé une archive reçue le **2 octobre à 23 h 01 UTC**, donc antérieure au snapshot de référence. Les sept modèles déterministes étaient présents. Le snapshot et la médiane étant secs (`0 mm`), les trois sorties ont le statut `BASELINE_DRY` : il n’y a pas de signal humide à ajouter.

Les lignes précédemment rejouées sur une date sans archive horaire conservée sont correctement restées `UNAVAILABLE`. Ce comportement est attendu et préférée à toute donnée reconstituée.

## Limites et suite de validation

Ce module doit accumuler des cas humides réels avant toute évaluation de son utilité. Les comparaisons devront notamment séparer :

- pluie observée alors que les modèles sont secs ;
- pluie prévue puis effectivement observée ;
- fausses alertes locales ;
- pluie locale hors du périmètre des stations.

Aucun score, aucune pondération et aucune prévision publique ne peut être modifiée sur la base de ce module tant que cette validation n’est pas terminée.
