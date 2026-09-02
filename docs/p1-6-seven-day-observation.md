# P1.6 — Observation shadow automatisée sur sept jours

**Auteur : Manus AI**  
**Statut : démarrée le 2 septembre 2026**

P1.6 mesure quotidiennement la sécurité et la qualité technique du Data Hub canonique. Cette observation reste strictement **shadow** : elle ne déclenche aucune promotion automatique et aucune de ses valeurs n’est lue par les prévisions, les scores ou les poids de production.

| Critère | Seuil quotidien | Rupture dure |
|---|---:|---|
| Couverture quotidienne | 8/8 flux | Non, verdict `EXTEND` |
| Couverture horaire | 8/8 flux | Non, verdict `EXTEND` |
| Écritures persistées | ≥ 99 % des runs `SUCCESS` ou `PARTIAL` | Non, verdict `EXTEND` |
| Intégrité canonique | 100 % des valeurs conformes ou manquantes explicitement | Non, verdict `EXTEND` |
| Doublons de run | 0 | Oui, verdict `FAILED` |
| Runs appliqués à la production | 0 | Oui, verdict `FAILED` |
| Valeurs hors mode shadow | 0 | Oui, verdict `FAILED` |

> Un run `PARTIAL` peut être une écriture réussie : les valeurs absentes sont conservées comme `MISSING` plutôt que remplacées par des données inventées.

## Verdicts

| Verdict | Signification |
|---|---|
| `OBSERVING` | Moins de sept dates distinctes ont été enregistrées. |
| `VALIDABLE` | Les sept bilans respectent tous les critères ; une validation humaine reste obligatoire. |
| `EXTEND` | La fenêtre est complète mais un critère récupérable demande une prolongation. |
| `FAILED` | Une rupture d’idempotence ou d’isolation a été détectée. |

Le bilan est écrit après les copies quotidiennes et horaires shadow de v8, dans une enveloppe d’erreur non bloquante. La clé unique `(observationDate, locationKey)` rend les réévaluations idempotentes.

## Premier contrôle réel

Le 2 septembre 2026, Hondeghem et Erquinghem-Lys présentent chacun 8/8 flux quotidiens, 8/8 flux horaires, 100 % d’écritures persistées, 100 % d’intégrité canonique, zéro doublon et zéro donnée appliquée à la production. Le bilan quotidien est `VALIDABLE`, tandis que la fenêtre globale reste `OBSERVING` à 1/7 jour.

## Rollback

Le rollback applicatif consiste à retirer l’appel `recordP1ObservationDay` et le panneau propriétaire. La table additive peut rester inutilisée afin d’éviter une suppression destructive. Aucun rollback de données de production n’est requis, car P1.6 n’écrit que dans son stockage shadow dédié.
