# Sources externes — provenance Météo-France shadow

Consultation du 2 septembre 2026.

La documentation Open-Meteo indique que son API Météo-France combine le modèle global **ARPEGE** et les modèles régionaux haute résolution **AROME**. Elle précise que ce service est un intermédiaire Open-Meteo fondé sur des sorties de modèles Météo-France, et non le flux applicatif authentifié de Météo-France. Source : https://open-meteo.com/en/docs/meteofrance-api

La fiche officielle data.gouv.fr de l’API Modèle AROME identifie **Météo-France** comme producteur, indique un accès ouvert avec compte, une URL de portail Météo-France et une limite publiée de 50 requêtes par minute. Source : https://www.data.gouv.fr/dataservices/api-modele-arome

Le portail historique des données publiques de Météo-France annonce la migration des données vers le portail des API et meteo.data.gouv.fr. Source : https://donneespubliques.meteofrance.fr/

Conséquence de conception : MeteoAI doit afficher séparément `official` pour un flux authentifié Météo-France, `fallback` pour le service Open-Meteo alimenté par AROME/ARPEGE, et `unavailable` lorsqu’aucun des deux ne fournit de résultat. Ces statuts restent en mode shadow et ne modifient pas la prévision de production.
