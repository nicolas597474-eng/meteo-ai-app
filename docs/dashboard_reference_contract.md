# Contrat de fidélité — Dashboard mobile MeteoAI

## Référence de composition

La référence mobile se lit dans cet ordre : barre d’application, localisation/date, panneau **Tendance**, carte météo héro, sélecteur de contexte local, carte d’observation locale et graphique horaire. Le Dashboard ne doit pas insérer de navigation basse dans cette séquence.

| Composant MeteoAI | Référence visuelle à préserver | Données et comportements à conserver |
|---|---|---|
| `DashboardAppBar` | Deux boutons ronds à bordure sombre, mot-symbole centré, aucune carte générique | Le bouton de localisation mène au sélecteur de favoris ; le bouton de réglage conserve l’accès aux favoris. |
| `DashboardLocationHeading` | Épingle bleue, lieu en fort, date sur une ligne secondaire | `selectedLocation`, `formatDashboardDate` et le fuseau Europe/Paris. |
| `DashboardTrendPanel` | Panneau indépendant bordé de bleu ; régime à gauche, quatre poids météo à droite | Catalogue de régimes, menu dépliable, pondérations, fraîcheur et trace de fusion. |
| `DashboardHeroCard` | Paysage dynamique, grande icône de l’heure courante, température dominante et quatre mesures de bas de carte | Image conditionnelle, condition courante, température officielle, ressenti, humidité, vent et pression. |
| `DashboardContextSwitch` | Bascule Local / Ultra-local en deux segments bleu-noir | État `localMode` et persistance locale ; la prévision officielle n’est jamais remplacée. |
| `DashboardLocalObservation` | Panneau vert distinct, réservé à une observation réelle ou à un repli explicitement qualifié | `locationWeather.ultraLocal`, nombre de stations, provenance Netatmo et repli de modèle sans le présenter comme station. |
| `DashboardHourlyFrame` | Panneau bleu sombre bordé, titre bleu et canvas intégral | `HourlyChart` inchangé : courbes, unités, clics, défilement et panneaux de détail. |

## Contraintes de non-régression

Les icônes météo proviennent exclusivement de `MeteoIcon`. Les icônes de navigation peuvent conserver les symboles existants. La carte héro doit utiliser l’icône de l’heure courante, et non une icône de journée. Aucune valeur n’est dérivée, remplacée ou simulée pour remplir une zone de la référence.

Le régime et ses détails restent accessibles par clavier, les contrôles mesurent au moins 44 px de hauteur tactile et les textes secondaires conservent un contraste suffisant sur fond bleu-noir. Sur tablette et bureau, la hiérarchie de données est préservée sans forcer la composition mobile à devenir une colonne générique.

## Validation de l’implémentation

| Vérification | Résultat |
|---|---|
| Barre mobile | Menu rond, mot-symbole centré, accès aux favoris et navigation dépliable ajoutés sur le Dashboard uniquement. |
| Hiérarchie mobile | Localisation, Tendance, carte héro, modes, observation locale et graphique horaire suivent l’ordre de la référence. |
| Grands écrans | En-tête, favoris, contrôles de contexte et second graphique existants restent visibles à partir du breakpoint `sm`. |
| Données | Prévision officielle, régime, observations locales et repli qualifié restent issus des mêmes requêtes existantes. |
| Graphiques | `HourlyChart` n’est pas modifié ; le cadre mobile est uniquement ajusté. Le graphique quinze jours est conservé aux formats larges. |
| Tests techniques | TypeScript, 176 tests Vitest réussis et build de production réussis. |
