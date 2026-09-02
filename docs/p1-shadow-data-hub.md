# P1 — Data Hub canonique en mode shadow

## Périmètre publié

P1 ajoute un registre canonique et une copie d’observation pour les **sept modèles nommés** et **Open-Meteo Best Match**. Le service public Météo-France et OpenWeatherMap ne font pas partie de ce registre. AROME et ARPEGE restent décrits comme modèles sous-jacents distribués via Open-Meteo.

## Invariants de sécurité

| Invariant | Garantie |
|---|---|
| Lecture de production | Aucune procédure de prévision, fusion, score, poids ou classement n’importe les tables shadow. |
| Écriture | La copie shadow intervient seulement après les écritures de production et ses erreurs sont interceptées. |
| Application à la production | `appliedToProduction` vaut toujours `0` pendant P1. |
| Run fournisseur | `providerRunTime` reste `NULL` et `runTimeKnown=0` tant que la métadonnée n’est pas certaine. |
| Idempotence | Une clé unique lie cycle, source et lieu ; un replay remplace les valeurs du run shadow sans créer de doublon. |
| Rollback | Retirer les deux appels du handler et la procédure administrateur suffit à arrêter P1 ; les tables peuvent rester inutilisées. |

## Base réelle de vérification

Le 2 septembre 2026, une vérification indépendante du chemin de production a écrit uniquement dans les tables shadow pour deux lieux favoris. Chaque lieu a reçu huit flux quotidiens et huit flux horaires. Le second passage identique n’a créé aucun run ou doublon supplémentaire. Les compteurs `appliedToProduction` et `duplicateKeys` sont restés à zéro.

## Observation P1.6

Le rapport administrateur de l’AI Lab affiche le jour d’observation sur sept, les runs reçus, les valeurs valides ou manquantes, les statuts par source et le nombre de lignes appliquées à la production. Le cycle v8 existant alimente cette observation ; aucune nouvelle tâche planifiée n’est créée.

La Phase 2 officielle de classification ne doit pas être promue avant la fin de la fenêtre et une validation explicite de l’utilisateur.
