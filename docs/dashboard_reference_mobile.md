# Référence Dashboard mobile — MeteoAI

## Structure observée

La maquette de référence présente une seule colonne mobile, sur fond bleu-noir. L’en-tête se compose d’un bouton menu, du mot-symbole MeteoAI et d’un bouton réglages. Le lieu et la date forment ensuite un bloc indépendant.

La hiérarchie principale est : panneau **Tendance**, carte météo héro avec paysage et température dominante, bascule **Local / Ultra-local**, carte d’observation locale verte, puis carte **Heure par heure**. Les surfaces ont des contours bleus lumineux, des ombres profondes et un relief contenu.

## Règles de reproduction appliquées

| Élément de référence | Implémentation MeteoAI |
|---|---|
| En-tête mobile centré | Chrome propre au Dashboard mobile ; navigation basse masquée uniquement sur la route `/`. |
| Tendance au-dessus de la carte | Régime officiel existant, ses poids et sa description, sans modifier la classification. |
| Carte héro avec soleil/paysage | Image météo existante et `MeteoIcon` de la condition courante ; la prévision officielle reste la source de température. |
| Deux modes locaux | Bascule visuelle Local / Ultra-local ; aucune formule ni pondération modifiée. |
| Carte locale verte | Lecture de `ultraLocal` existante, avec repli explicitement libellé lorsqu’aucune station qualifiée n’est disponible. |
| Graphique horaire à bord bleu | Même composant Canvas, mêmes données et coordonnées ; cadre et en-tête mobile affinés seulement. |

> La maquette est une référence de composition et de matériau visuel. Elle ne constitue pas une source de données météo : les valeurs affichées restent celles des contrats MeteoAI existants.

## Vérification de développement

Le chargement différé du Dashboard affiche d’abord ses squelettes de sécurité dans une session fraîche. La vérification navigateur confirme que le shell conserve les routes et la navigation ; les validations TypeScript, Vitest et build confirment que les requêtes météo, les graphiques Canvas et les contrats n’ont pas été modifiés par la recomposition.
