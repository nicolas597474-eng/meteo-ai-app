# Audit transversal des pages — 12 août 2026

| Page | Statut de l’audit | Constat vérifiable | Décision |
|---|---|---|---|
| Dashboard | Déjà alignée | Utilise le régime opérationnel partagé et la trace officielle. | Aucune correction. |
| Fiabilité | Déjà alignée | Centralise les stations physiques, références et bilan de collecte. | Aucune correction. |
| AI Lab | Corrigée | Les scores et sources statiques ont été remplacés par la trace de fusion persistée. | Aucune correction supplémentaire. |
| Historique | Conforme | Exploite l’historique par lieu et les scores par échéance. | Aucune correction de données. |
| Prévisions détaillées | À corriger | Construit une confiance horaire arbitraire (base 75) et réintroduit une « Analyse IA » locale, alors que ces contenus ne proviennent pas du contrat officiel. Le lieu est lu depuis `localStorage` plutôt que le contexte partagé. | Supprimer les valeurs dérivées non vérifiables et utiliser le lieu actif. |
| Rapport | À corriger | Le titre affiche « Hondeghem » quel que soit le lieu et n’envoie aucune coordonnée au contrat de rapport. | Utiliser le lieu actif et transmettre ses coordonnées. |
| Comparaison des pondérations | À corriger | Le lieu est lu depuis `localStorage` et une confiance absente est affichée comme 0 %. | Utiliser le lieu actif et afficher une valeur indisponible si le snapshot ne contient pas de confiance. |
| Stations | Obsolète et non routée | `/stations` redirige déjà vers Fiabilité ; le composant autonome contient les anciens critères et sources. | Retirer le composant non utilisé. |
| Favoris | Conforme | Gère uniquement la configuration des lieux et du rayon ; aucun score ou modèle obsolète n’est présenté. | Aucune correction. |

La vérification mobile du Rapport après déduplication montre huit modèles experts uniques au lieu des répétitions issues de collectes successives.
