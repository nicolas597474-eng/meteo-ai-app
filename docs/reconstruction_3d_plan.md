# Plan de reconstruction visuelle MeteoAI

## Objet et règle de préservation

La reconstruction conserve les contrats tRPC, les calculs de prévision, la séparation observation/prévision, les stations Netatmo, les graphiques Canvas et la navigation existante. La cible visuelle est l’identité MeteoAI actuelle : fond bleu-noir, accents cobalt, données contrastées, cartes arrondies et priorité mobile. Le relief 3D validé est introduit comme une **profondeur discrète**, jamais comme un nouveau thème ou un habillage décoratif autonome.

> Les données météo, les pondérations, les filtres de station et les sources de vérité ne changent pas dans cette reconstruction visuelle.

## Audit synthétique

| Domaine | État actuel | Décision de migration |
|---|---|---|
| Dashboard | Écran prioritaire, nombreux panneaux métier et graphiques interactifs | Première page migrée ; conserver intégralement ses contrats et états. |
| Fiabilité, Historique, AI Lab, Détails | Cartes et tableaux denses, données scientifiques | Appliquer le relief seulement aux surfaces et préserver les contrastes/tableaux. |
| Navigation | Barre basse mobile, barre supérieure desktop, chargement différé | Conserver routes, libellés, ordres et comportement tactile. |
| Graphiques Canvas | Interactions de clic, défilement et calculs de coordonnées | Ne modifier que leur cadre, légende et profondeur CSS ; ne pas altérer le tracé ou les coordonnées. |
| Icônes météo | Catalogue central `MeteoIcon` avec fallbacks | Conserver les icônes, leur mapping et leurs couleurs. |
| Styles globaux | Tokens Tailwind/OKLCH déjà centralisés | Étendre les tokens, sans remplacer les couleurs existantes. |

## Design system cible

Le système ajoute quatre niveaux de surface aux tokens actuels.

| Token conceptuel | Rôle | Traitement visuel |
|---|---|---|
| `weather-canvas` | Fond global | Bleu-noir mat avec vignette très légère. |
| `weather-surface` | Carte standard | Surface bleu profond, bordure translucide et ombre basse diffuse. |
| `weather-surface-raised` | Carte de premier plan / élément sélectionné | Halo cobalt contenu, reflet supérieur fin et ombre plus profonde. |
| `weather-surface-inset` | Graphique ou zone secondaire | Creux subtil par ombre interne, sans diminuer la lisibilité. |
| `weather-glow` | Accent d’interaction | Bleu contrôlé pour onglet, favori ou créneau actif ; jamais appliqué à une surface entière. |

Les rayons actuels restent la base de la composition. Les éléments tactiles conservent une taille minimale et les couleurs sémantiques météo restent inchangées : orange pour température, bleu pour pluie, vert pour vent et rouge pour alertes.

## Architecture frontend cible

La migration crée des primitives de présentation réutilisables plutôt que de recopier les ombres sur chaque page.

| Primitive | Responsabilité | Données métier |
|---|---|---|
| `WeatherSurface` | Niveaux de relief, bordure, halo et état compact | Aucune ; conteneur de présentation. |
| `WeatherSection` | Titre, sous-titre, icône et surface associée | Aucune ; composition de contenu existant. |
| `WeatherMetric` | Valeur, unité, variation, ton sémantique | Reçoit une valeur déjà calculée. |
| `WeatherChip` | Badges de modèle, régimes, alertes et filtres | Reçoit seulement libellé, tonalité et état. |
| `PageFrame` | Espacements mobiles, largeur desktop, zones de navigation | Aucune ; ne modifie pas les routes. |

Les composants Canvas `HourlyChart` et `FifteenDayChart` gardent leurs algorithmes. Ils sont entourés de surfaces `inset` uniquement afin de ne pas modifier leurs coordonnées ni leurs interactions tactiles.

## Ordre de migration

1. Étendre les tokens globaux et créer les primitives de surface sans modifier les pages.
2. Migrer le shell de navigation, la barre basse mobile et le cadre du Dashboard.
3. Migrer les cartes Dashboard et les panneaux locaux/officiels sans toucher aux appels tRPC.
4. Propager les primitives à Fiabilité, Historique, Détails, AI Lab, Rapport et comparaison de poids.
5. Vérifier les états de chargement, erreur, absence de données, formulaire et dialogue.
6. Vérifier mobile, tablette et desktop, puis comparer les données et interactions aux écrans actuels.

## Critères d’acceptation

La reconstruction est considérée valide seulement si les routes existantes, les requêtes tRPC, les sources de données, les graphiques, les stations Netatmo et les contrôles de navigation continuent de fonctionner. Chaque écran doit conserver sa hiérarchie et sa densité d’information ; le relief est refusé s’il diminue le contraste, masque une unité, gêne un tap, ralentit un graphique ou modifie une valeur météo.
