# Étude des sources de stations personnelles

## Weather Underground

Weather Underground maintient un réseau de stations personnelles présenté comme un réseau communautaire mondial de plus de 250 000 capteurs. La page publique décrit la visualisation et l’archivage de la station de son propriétaire, mais ne publie pas une interface d’API ouverte pour aspirer librement l’ensemble du réseau.[1]

Les intégrations tierces consultées exigent une **clé API Weather Underground**. La documentation Domo indique explicitement qu’une clé est nécessaire même pour créer un jeu de données PWS ; le composant Home Assistant maintenu pour les propriétaires de stations précise que les clés gratuites sont réservées aux propriétaires d’une station personnelle Weather Underground enregistrée et active.[2] [3]

| Critère MeteoAI | Constat | Décision |
|---|---|---|
| Accès sans clé | Non vérifié comme disponible ; les intégrations actuelles exigent une clé. | Ne pas intégrer. |
| Droits sur les stations tierces | Le parcours documenté est lié à une station PWS enregistrée par son propriétaire. | Ne pas traiter comme réseau public librement exploitable. |
| Fraîcheur et mesures | Les interfaces tierces documentent des conditions courantes et historiques, mais l’accès dépend de la clé. | Aucun gain opérationnel sans droit d’accès vérifiable. |
| Conformité au périmètre actuel | L’application dispose déjà d’un accès OAuth Netatmo `read_station` explicite. | Conserver Netatmo comme seule source PWS autorisée active. |

> **Conclusion.** Weather Underground ne doit pas être ajouté à MeteoAI sans une clé API et une confirmation explicite de licence. Cette étude n’introduit aucun appel API, aucun identifiant et aucune station Weather Underground dans les calculs ou l’affichage.

## Références

[1] [Weather Underground — Personal Weather Station Network](https://www.wunderground.com/pws/overview)

[2] [Domo — Weather Underground Connector](https://www.domo.com/docs/s/article/360042931074)

[3] [Home Assistant Wunderground PWS — prérequis de clé API](https://github.com/cytech/Home-Assistant-wundergroundpws)

## Comparaison des alternatives

L’analyse ci-dessous distingue l’accès technique à une observation de l’autorisation de la représenter comme donnée fiable. Une station personnelle, même géolocalisée et fraîche, reste une observation dont l’implantation et la calibration doivent être évaluées. Elle ne peut donc pas modifier les calculs de MeteoAI sans preuve de gain de précision mesuré.

| Réseau | Accès observé | Provenance et qualité | Position pour MeteoAI |
|---|---|---|---|
| **openSenseMap** | L’API documente la lecture de boxes par identifiant ou proximité, avec identifiants publics ; les données sont placées sous PDDL 1.0.[4] | Capteurs citoyens, géolocalisés et avec date du dernier relevé ; l’exposition peut être renseignée. | **Conserver Niveau 3, “CAPTEUR EN VALIDATION”**, sans fusion. |
| **CWOP / MADIS** | CWOP est déclaré publiquement accessible et ses relevés sont soumis au contrôle qualité MADIS ; les observations arrivent typiquement toutes les cinq minutes.[5] | Réseau de citoyens avec contrôle qualité centralisé ; la NOAA prévient néanmoins que les données mesonet restent expérimentales et exige une demande d’accès pour certains produits MADIS.[6] | **Étudier seulement avec un accès et des droits confirmés** ; aucune activation supplémentaire ici. |
| **Met Office WOW** | Les sites publics peuvent être consultés, mais un propriétaire peut interdire le téléchargement. La page WOW indique que le service DataPoint API est retiré.[7] [8] | Métadonnées de site et critères d’implantation disponibles, mais pas de voie de lecture API générale maintenue. | **Ne pas intégrer.** |
| **AWEKAS** | Carte publique de stations privées ; les fonctions de base sont gratuites pour l’usage personnel. Les documents consultés ne publient pas de contrat d’API de lecture générale pour un tiers.[9] [10] | Réseau communautaire, avec conseils d’implantation mais droits de lecture tiers non établis. | **Ne pas intégrer sans contrat API explicite.** |
| **Ambient Weather Network** | L’API REST demande une clé d’application et une clé utilisateur donnant accès aux appareils de cet utilisateur.[11] [12] | Données d’appareils identifiés, mais accès centré sur le propriétaire/partage de clé. | **Ne pas intégrer comme réseau public.** |
| **WeatherLink (Davis)** | L’API v2 ne donne accès qu’aux stations possédées, partagées, ou publiques avec un abonnement Pro/Pro+ appliqué ; clé et secret sont requis.[13] [14] | Stations Davis physiques avec accès contrôlé par propriétaire ou abonnement. | **Ne pas intégrer sans accord du propriétaire ou abonnement validé.** |

> **Décision de périmètre.** MeteoAI conserve les sources déjà autorisées : Netatmo OAuth `read_station` en Niveau 1 et openSenseMap en Niveau 3 d’observation. Aucune clé Weather Underground, Ambient, WeatherLink, AWEKAS ou aucune nouvelle source officielle n’est ajoutée par cette étude.

## Décision utilisateur — août 2026

L’utilisateur a choisi de conserver **Netatmo comme seule source de stations personnelles active**. Les options Davis/WeatherLink, Ambient Weather Network, AWEKAS, Weather Underground et Met Office WOW restent archivées à titre documentaire et ne doivent déclencher ni appel réseau, ni ajout de secret, ni collecte, ni contribution aux calculs. Toute évolution de ce périmètre exigera une demande explicite de l’utilisateur et une vérification renouvelée des droits d’accès.

## Références complémentaires

[4] [openSenseMap API — données, identifiants et licence](https://docs.opensensemap.org/)

[5] [NOAA / MADIS — CWOP Data](https://madis.ncep.noaa.gov/madis_cwop.shtml)

[6] [NOAA / MADIS — application et politique de données](https://madis.ncep.noaa.gov/data_application.shtml)

[7] [Met Office WOW — page d’accueil et statut DataPoint API](https://wow.metoffice.gov.uk/)

[8] [Met Office WOW — gestion des sites et droit de téléchargement](https://wow.metoffice.gov.uk/support/manageasite)

[9] [AWEKAS — réseau mondial de stations privées](https://www.awekas.at/main/en/)

[10] [AWEKAS — FAQ et services sous licence](https://www.awekas.at/main/en/faq/)

[11] [Ambient Weather — exigences de clés API](https://ambientweather.com/faqs/question/view/id/1811/)

[12] [Ambient Weather REST API — authentification](https://ambientweather.docs.apiary.io/)

[13] [WeatherLink v2 API — périmètre d’accès aux stations](https://weatherlink.github.io/v2-api/)

[14] [WeatherLink v2 API — clés, secret et accès historique](https://weatherlink.github.io/v2-api/tutorial)
