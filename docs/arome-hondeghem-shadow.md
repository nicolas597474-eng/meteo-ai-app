# Comparaison AROME shadow à Hondeghem

## Comportement

- La comparaison est déclenchée manuellement dans le panneau admin de la page météo détaillée; aucun appel fournisseur n’est exécuté au chargement.
- Le serveur lit uniquement l’identifiant d’application OAuth2 déjà configuré dans `METEOFRANCE_API_KEY`. Il l’échange contre un jeton d’accès via `POST https://portail-api.meteofrance.fr/token`, puis appelle le WCS AROME avec `Authorization: Bearer`. L’identifiant et le jeton restent côté serveur, ne sont ni ajoutés à une URL ni journalisés. Si l’identifiant manque, la route retourne `missing-key` avant toute requête.
- Le profil retenu est AROME France haute résolution (`MF-NWP-HIGHRES-AROME-001-FRANCE-WCS`), cohérent avec le modèle Open-Meteo déjà utilisé par le projet (`meteofrance_arome_france_hd`). AROME global, AROME-Prévision immédiate et ARPEGE restent hors du périmètre.
- Le serveur découvre le run récent dans le catalogue WCS, lit `DescribeCoverage`, n’accepte que les axes/unités nécessaires, puis échantillonne les GeoTIFF sur le pixel géoréférencé qui contient Hondeghem (EPSG:4326). Le format MIME n’est pas supposé : il est choisi parmi les formats GeoTIFF annoncés dans `GetCapabilities`.
- Trois champs sont comparés sur jusqu’à 24 échéances horaires : température à 2 m, précipitations horaires uniquement quand le catalogue annonce `PT1H`, et vent à 10 m. Les valeurs sont converties vers °C, mm/h et km/h. Les sous-sélections de temps et de hauteur sont explicites; pour les précipitations, la hauteur au sol n’est ajoutée que si le WCS annonce cette dimension.
- Open-Meteo Single Runs est interrogé avec l’identifiant AROME France HD et le même run UTC. Si l’API n’expose pas ce run ou si les échéances ne se recoupent pas, aucun autre run n’est substitué.
- Le panneau présente les différences AROME WCS − Open-Meteo Single Runs par heure et par jour. Les valeurs Best Match déjà affichées sont une référence distincte, explicitement marquée « run non identifié »; elles ne sont pas utilisées pour prétendre à une équivalence de run.
- La route est admin-only et en lecture seule; aucun modèle affiché, fusion journalière, enregistrement ou flux Vigilance n’est modifié. Le compte Météo-France doit être abonné à l’API AROME avant de générer l’identifiant d’application OAuth2, selon la [FAQ officielle](https://portail-api.meteofrance.fr/web/faq).

## Sources

- [Portail officiel Météo-France — API AROME](https://portail-api.meteofrance.fr/web/fr/api/AROME)
- [Guide officiel API ciblée modèles](https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/854032416/API+Cibl+e+Mod+les) — catalogue dynamique, identifiants `CoverageId`, axes `long/lat/height/time`, valeurs d’axes discrètes, unités de dimensions, sélection WCS et exemple AROME France 0,01°.
- [Guide utilisateur officiel AROME](https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/854622209) — téléchargement WCS GRIB/GeoTIFF, tranche 2D et erreurs usuelles.
- [FAQ officielle du portail Météo-France](https://portail-api.meteofrance.fr/web/faq) — en-tête d’authentification API Key `apikey` (le protocole Bearer est une alternative).
- [Documentation Open-Meteo AROME](https://open-meteo.com/en/docs/meteofrance-api) — modèle `meteofrance_arome_france_hd`, résolution France haute résolution.
- [Documentation officielle Open-Meteo Single Runs](https://open-meteo.com/en/docs/single-runs-api) — l’endpoint Single Runs accepte les paramètres Forecast API avec le paramètre supplémentaire obligatoire `run` au format ISO UTC sans secondes.

## Validation et limites

Les tests utilisent des réponses WCS, GeoTIFF et Open-Meteo simulées; aucune clé réelle n’est utilisée. Ils couvrent l’absence de clé, l’authentification, le même run et les validités horaires, le MIME annoncé, les axes/hauteurs, les conversions d’unités, l’emprise Hondeghem, l’échantillonnage pixel/CRS/no-data et les données manquantes/403.

L’authentification et la collecte live ne sont pas vérifiées dans le cadre de cette correction : aucune clé n’est lue ni requête météo réelle lancée. Les tests utilisent un échange OAuth2 et des réponses WCS/Open-Meteo simulés. Dans l’application, une tentative manuelle indiquera explicitement l’identifiant manquant, un refus d’authentification, un run non disponible ou une comparaison partielle; elle ne remplacera jamais les prévisions affichées.
