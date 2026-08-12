# Mesure de couverture des observations candidates — 12 août 2026

## Méthode

La mesure a été effectuée une fois, à titre de diagnostic, autour des deux lieux favoris configurés avec un rayon opérationnel de **20 km**. L’API publique openSenseMap a été interrogée avec les mêmes paramètres que MeteoAI (`exposure=outdoor`, `classify=true`, `full=true`), puis les capteurs ont été contrôlés pour la présence d’une température et une fraîcheur maximale de 90 minutes.

La couverture CWOP/APRS a été vérifiée par une consultation ponctuelle de l’outil FindU de proximité. Ce service interdit le moissonnage récurrent destiné à alimenter une base de données ; il ne doit donc pas être utilisé par le cycle automatique de 05h00. Les horaires et distances ci-dessous sont une photographie instantanée, non une promesse de disponibilité.

## Résultats

| Lieu | Rayon | Boîtes openSenseMap extérieures | Boîtes avec température | Température fraîche (≤ 90 min) | Rapports météo CWOP/APRS récents observés |
|---|---:|---:|---:|---:|---:|
| Hondeghem | 10 km | 0 | 0 | 0 | 0 |
| Hondeghem | 20 km | 0 | 0 | 0 | 3 |
| Hondeghem | 50 km | 12 | 1 | 0 | non mesuré à ce rayon |
| Erquinghem-Lys | 10 km | 1 | 0 | 0 | 2 |
| Erquinghem-Lys | 20 km | 5 | 0 | 0 | 6 |
| Erquinghem-Lys | 50 km | 28 | 1 | 0 | non mesuré à ce rayon |

Le seul capteur openSenseMap de température détecté à 50 km, « Jonas Geldof », a une dernière mesure du 20 juillet 2025. Il est donc largement au-delà du seuil de fraîcheur et reste inéligible, même comme candidat actif. Quelques boîtes de qualité de l’air remontent des mesures très récentes, mais ne proposent pas de température ; elles ne peuvent pas contribuer à l’objectif de température locale.

Pour Hondeghem, les trois rapports météo voisins observés à moins de 20 km étaient `FW0151` (11,1 km), `AV279` (13,6 km) et `DW8013` (15,2 km). Pour Erquinghem-Lys, six rapports étaient visibles dans le même rayon : `EW9132` (5,1 km), `DW8013` (7,7 km), `ON7XX-13` (10,9 km), `DW7857` (13,6 km), `FW2929` (16,0 km) et `FW0151` (17,2 km). Tous avaient une ancienneté affichée inférieure à quatorze minutes au moment de la consultation.

## Décision opérationnelle

> **openSenseMap reste en mode observation uniquement.** Aucun capteur de température suffisamment frais n’a été mesuré dans le rayon configuré des deux favoris ; aucune exception au filtrage de fraîcheur ou à l’exclusion de fusion n’est justifiée.

CWOP montre une couverture potentiellement intéressante autour des deux lieux. Cependant, l’accès MADIS Text/XML requiert une demande de compte, tandis que la politique publiée de FindU interdit une collecte automatique répétée par extraction de ses pages. Aucune intégration CWOP/MADIS ne doit donc être activée dans le cron actuel sans une voie d’accès fournisseur conforme et une validation historique séparée.

## Références

[1] [NOAA/NWS — Citizen Weather Observer Program (CWOP) Data](https://madis.ncep.noaa.gov/madis_cwop.shtml) : données CWOP contrôlées par MADIS, cadence de cinq minutes et observations publiques.

[2] [NOAA — MADIS Web Services Portal](https://madis-data.ncep.noaa.gov/index.html) : les services Text/XML demandent une demande de compte et une catégorie de diffusion.

[3] [FindU — documentation des CGI](http://www.findu.com/cgi.html) : requête géographique `wxnear`, politique interdisant l’extraction dynamique répétée à des fins de base de données.

[4] [FindU — stations proches d’Hondeghem](http://www.findu.com/cgi-bin/wxnear.cgi?lat=50.75646&lon=2.52085) et [stations proches d’Erquinghem-Lys](http://www.findu.com/cgi-bin/wxnear.cgi?lat=50.67601&lon=2.84505), consultées le 12 août 2026.
