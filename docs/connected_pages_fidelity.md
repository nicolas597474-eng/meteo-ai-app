# Cohérence des pages connexes

## Décision de fidélité

Les pages Fiabilité, Historique, Rapport, AI Lab et Favoris utilisent déjà les primitives de surface MeteoAI dans leurs états de présentation sans données ou dans leurs cartes statiques. Les sections denses de Détails, Fiabilité et Historique conservent leurs conteneurs existants : elles portent des graphiques, des tableaux, des filtres et des interactions dont la structure participe directement au rendu de référence.

| Page | Élément centralisé | Élément volontairement conservé |
|---|---|---|
| Favoris | Cartes et panneau d’information `MeteoSurface` | Formulaires, mutations et choix de mode local. |
| Historique | État vide et contrat de largeur du tableau | Séries Recharts, onglets et tableau de mesures. |
| Fiabilité | État d’attente de comparaison | Filtres, stations, carte et modal de transparence. |
| Rapport | État vide de collecte | Scores, métriques et diagnostics de modèles. |
| AI Lab | Cartes de statistiques | Traces, poids, diagnostics et commandes de rafraîchissement. |
| Détails | Aucun remplacement cosmétique nécessaire | Graphiques officiels, prévisions horaires et cartes de données. |

Cette décision évite de remplacer des composants visuels spécifiques par des cartes génériques. Les contrats tRPC, les interactions et les données restent inchangés ; la cohérence provient des mêmes tokens de thème, couleurs de statut et composants de présentation déjà raccordés.
