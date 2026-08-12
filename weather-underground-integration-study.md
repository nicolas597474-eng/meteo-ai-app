# Étude d’intégration Weather Underground — 12 août 2026

## Sources officielles consultées

- Weather Underground décrit un réseau de plus de 250 000 stations météorologiques personnelles et indique que le réseau alimente des données hyperlocales : https://www.wunderground.com/pws/overview
- Weather Underground indique que ses observations s’appuient notamment sur des stations personnelles soumises à des contrôles de qualité, des stations aéroportuaires et d’autres sources : https://www.wunderground.com/about/data
- The Weather Company commercialise des APIs comprenant les observations de stations personnelles ; l’essai annoncé est limité dans le temps et à l’éligibilité, tandis que l’offre Standard affichée est à 500 USD/mois pour 1 million d’appels mensuels : https://www.weathercompany.com/weather-data-apis/weather-data-apis-packages-pricing/
- La documentation IBM Environmental Intelligence Suite décrit des clés d’essai, développement et production, avec des limites distinctes : https://www.ibm.com/docs/en/environmental-intel-suite?topic=reference-weather-data-apis

## Constat

L’accès programmatique légitime au réseau Weather Underground pour une application de production passe par une offre Weather Data APIs/The Weather Company ou IBM avec clé contractuelle. Les anciennes clés Weather Underground gratuites ne doivent pas être supposées disponibles pour un nouveau projet.

## Architecture recommandée si une clé est obtenue

1. Stocker la clé exclusivement côté serveur.
2. Interroger les observations de stations personnelles dans le rayon du favori selon le quota contractuel.
3. Conserver la provenance `weatherunderground`, l’identifiant source, l’heure de mesure et la distance.
4. Rejeter ou dégrader les mesures périmées, hors plage physique ou incohérentes avec les stations voisines et les observations officielles.
5. Ne jamais transformer une station en observation locale validée avant la validation qualité et la persistance de son historique.

## Alternatives vérifiées

- **CWOP via NOAA MADIS** : les observations de citoyens sont accessibles publiquement, mondiales, arrivent toutes les cinq minutes et sont soumises aux contrôles qualité MADIS. La densité européenne doit toutefois être mesurée lieu par lieu avant intégration : https://madis.ncep.noaa.gov/madis_cwop.shtml
- **WeatherLink v2 (Davis)** : l’API donne accès aux stations possédées ou partagées avec l’utilisateur. Une station publique peut être accédée après achat et application d’une mise à niveau Pro ou Pro+ sur cette station ; ce n’est donc pas un agrégateur gratuit général : https://weatherlink.github.io/v2-api/
- **Synoptic Data** : le service documente des ressources de données disponibles et une offre tarifaire distincte ; la couverture et le coût doivent être confirmés contractuellement pour le cas français : https://docs.synopticdata.com/ et https://synopticdata.com/pricing

## Sources gratuites sans clé API vérifiées

- **openSenseMap** est la seule source examinée qui répond clairement au critère strict d’une API publique sans clé : ses routes de lecture `GET /boxes`, `GET /boxes/data` et `GET /boxes/:boxId` ne nécessitent pas d’authentification. La recherche autour d’un point est prévue par les paramètres `near` et `maxDistance`. Les données sont sous licence PDDL 1.0. Les capteurs sont citoyens et hétérogènes ; il faut donc sélectionner uniquement les capteurs extérieurs de température, humidité, pression, vent ou précipitation, selon leur fraîcheur et leur cohérence : https://api.opensensemap.org/ et https://docs.opensensemap.org/
- **CWOP/MADIS** confirme que les observations sont publiques, mondiales et traitées toutes les cinq minutes avec des contrôles qualité. Son accès de données est plus technique et la densité locale doit être vérifiée avant intégration : https://madis.ncep.noaa.gov/madis_cwop.shtml
- **Meteostat** est gratuit et ouvert pour les données historiques et climatiques, mais ne constitue pas un réseau général de stations personnelles temps réel : https://dev.meteostat.net/
