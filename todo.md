# MeteoAI - Project TODO

- [x] Database schema: forecasts, observations, reliability_scores, meteoai_forecasts tables
- [x] API: tRPC router for weather data (forecasts, observations, scores)
- [x] API: Open-Meteo collector service (AROME, ARPEGE, ICON, ECMWF, GFS, Best Match)
- [x] API: Statistical engine (MAE, RMSE, Bias, weighted score 30/30/20/20)
- [x] API: MeteoAI forecast engine (weighted synthesis from all services)
- [x] API: Weather Stability Index™ calculation
- [x] Frontend: Dashboard with MeteoAI forecast + Stability Index
- [x] Frontend: Reliability ranking page (16 services, MAE/RMSE/Bias scores)
- [x] Frontend: Historical comparison page (7-day + 15-day extension)
- [x] Frontend: Detailed report page with charts and AI explanation
- [x] Heartbeat: Automated collection at 07h30 (forecasts) and 20h00 (observations)
- [x] Notifications: Owner alerts after each collection with daily ranking summary
- [x] Design: Dark theme with weather-appropriate styling
- [x] Tests: Vitest specs for statistical engine and API endpoints
- [x] Seed: Historical data from 26 June - 2 July analysis imported
- [x] Seed: Today's Open-Meteo forecast collected and MeteoAI generated
- [x] Frontend: Dashboard redesign with SVG weather icons, hourly forecast, 15-day chart (Recharts)
- [x] Backend: get15DayForecast endpoint (4 models: ECMWF, GFS, ICON, Open-Meteo averaged)
- [x] Backend: getHourlyForecast endpoint (24h hourly from Open-Meteo best_match)
- [x] Heartbeat: Cron collecte prévisions à 05h00 Paris (03h00 UTC) — task_uid: bi9pQpzNMMUk5ijSwFMnoh
- [x] Heartbeat: Cron collecte observations à 23h50 Paris (21h50 UTC) — task_uid: Qg2R5Xkkfk5cukBEn789qj
- [x] statsEngine: Définir les 5 régimes météo (pluvieux, été stable, tempête, hiver froid, standard)
- [x] statsEngine: Implémenter detectWeatherRegime() basé sur précip, vent, temp
- [x] statsEngine: Adapter calculateReliabilityScore() avec poids contextuels par régime
- [x] Backend: Stocker le régime détecté dans les scores de fiabilité
- [x] Frontend: Afficher le régime actif + badge poids sur Dashboard
- [x] Frontend: Afficher le régime utilisé dans la page Classement
- [x] Database: Ajouter colonne `regime` à `reliability_scores` pour persistance historique des régimes
- [x] statsEngine: Dimension Température — MAE, biais, erreur max (pics)
- [x] statsEngine: Dimension Précipitations — détection pluie/sec (POD/FAR/CSI), erreur quantité, faux positifs/négatifs
- [x] statsEngine: Dimension Vent — MAE vent moyen, MAE rafales
- [x] statsEngine: Dimension Nébulosité — score de concordance catégorielle
- [x] statsEngine: Score final = combinaison pondérée des 4 dimensions (pas de score brut unique)
- [x] Database: Ajouter colonnes détaillées par dimension dans reliability_scores
- [x] Backend: Exposer les scores par dimension dans getRanking et getReport
- [x] Frontend: Afficher les 4 dimensions avec leurs métriques dans Classement et Rapport
- [x] Backend: Étendre getRanking pour retourner les scores détaillés par dimension par service
- [x] Frontend: Mettre à jour la page Classement pour afficher les 4 dimensions détaillées par service
- [x] Backend: Endpoint getAILab — résumé IA, sources, pondération modèles, formule, divergence, scores confiance/stabilité/transparence, analyse IA textuelle
- [x] Backend: Helper getHistoricalScoreTimeSeries pour graphique historique par modèle
- [x] Frontend: Page WeatherAILab.tsx — toutes les sections premium (résumé, sources, pondération, formule, divergence, replay animé, historique graphique)
- [x] Frontend: Bouton 🧪 Weather AI Lab CTA sur le Dashboard
- [x] Navigation: Onglet AI Lab dans le menu desktop et bottom nav mobile
- [x] Backend: Corriger getHistoricalScoreTimeSeries pour retourner toutes les séries sans troncature (limit days*20)
- [x] DB: Table `weather_stations` (id, source, name, lat, lon, altitude, distance, reliability_score, last_seen)
- [x] DB: Table `station_observations` (station_id, date, temp, humidity, pressure, wind, gusts, precip, updated_at)
- [x] Backend: stationService.ts — collecte multi-sources (Open-Meteo nearby, Météo-France StatIC, WUnderground, CWOP/APRS, NOAA)
- [x] Backend: Calcul distance Haversine + classement automatique (distance, fraîcheur, cohérence, disponibilité)
- [x] Backend: Calcul vérité terrain pondérée (50% distance, 30% qualité, 20% fraîcheur)
- [x] Backend: Endpoints tRPC — searchStations(lat, lon, radius), getGroundTruth(lat, lon, radius), getStationDetail(id)
- [x] Frontend: Page Stations.tsx — sélecteur GPS/ville, rayon configurable, classement
- [x] Frontend: Weather AI Lab — section stations utilisées, distance, contribution, stations ignorées + raisons
- [x] Navigation: Onglet Stations dans le menu
- [x] Backend: Ajouter l'endpoint tRPC `getStationDetail(id)` avec détails complets d'une station et son historique récent
- [x] Frontend: Mettre à jour `WeatherAILab.tsx` pour afficher les stations utilisées, leur distance, leur contribution pondérée, les stations ignorées et les raisons d'exclusion
- [x] DB: Table `favorite_locations` (id, userId, name, customName, lat, lon, isDefault, position, radiusKm, preferredModels, tempUnit, alertsEnabled, createdAt)
- [x] Backend: CRUD endpoints favoris (add, update, delete, reorder, setDefault) — max 5 par user
- [x] Backend: Endpoint getLocationWeather(lat, lon, radiusKm) — retourne prévisions + stations + scores pour un lieu
- [x] Frontend: Barre de favoris horizontale en haut du Dashboard (📍 + ⭐×5) avec temp/conditions/scores
- [x] Frontend: Navigation swipe horizontale entre lieux (touch + desktop) avec indicateurs dots
- [x] Frontend: Indicateur visuel du lieu actif + mémorisation du dernier lieu consulté
- [x] Frontend: Préchargement en arrière-plan des données via prefetchedWeather prop
- [x] Frontend: Recalcul automatique IA à chaque changement de lieu (prévisions, stations, pondérations, confiance)
- [x] Frontend: Page paramètres par favori (nom, rayon, unité) — route /favorites
- [x] Frontend: Recherche ville/adresse/GPS + géolocalisation position actuelle (Open-Meteo geocoding)
- [x] Frontend: FavoritesBar — afficher les lieux favoris sauvegardés directement sur la page principale
- [x] Frontend: FavoritesBar — bouton "+" pour ajouter un nouveau lieu favori avec recherche de ville intégrée
- [x] Frontend: FavoritesBar — permettre de switcher entre les lieux favoris depuis le Dashboard
- [x] Backend: Mode Ultra-local — ajouter champ localMode (standard/local/ultra-local) au schéma favorites
- [x] Backend: Service Ultra-local — recherche stations par rayons (0-2km, 2-5km, 5-10km, 10-20km)
- [x] Backend: Pondération Ultra-locale — 65%/20%/10%/3%/2% selon la distance
- [x] Backend: Vérification qualité stations — fraîcheur, cohérence, altitude, historique, stabilité
- [x] Backend: Détection microclimats — ajustement selon contexte géographique
- [x] Frontend: Sélecteur de mode (Standard/Local/Ultra-local) sur Dashboard et paramètres
- [x] Frontend: Affichage transparence Ultra-local dans AI Lab — stations utilisées/ignorées avec raisons
- [x] Frontend: Mémorisation du mode par lieu favori
- [x] Backend: Exposer bandes 0-2 / 2-5 / 5-10 / 10-20 km dans la réponse Ultra-local avec stationCount par bande
- [x] Backend: Appliquer pondération 65/20/10/3/2 par bande + 2% modèles avec vérification
- [x] Backend: Ajouter vérification altitude comme critère qualité explicite
- [x] Frontend: Ajouter sélecteur Standard/Local/Ultra-local dans FavoriteSettings
- [x] Frontend: Sauvegarder localMode par favori (DB + lecture du favori actif) au lieu d'un global
- [x] Bug: Corriger incohérence régime météo Dashboard ("Eté stable") vs Classement ("Standard") — unifier la source
- [x] Backend: Heartbeat 05h00 — collecte prévisions pour chaque lieu favori enregistré en DB
- [x] Backend: Stocker les prévisions par lieu favori (table forecast_by_location ou extension de forecasts)
- [x] Frontend: Afficher les données préchargées des favoris depuis la DB (pas seulement à la demande)
- [x] Heartbeat: créer le cron 05h00 qui appelle /api/scheduled/collect-favorites-forecasts
- [x] Backend: exposer location_forecasts via tRPC pour les favoris de l'utilisateur
- [x] Frontend: brancher FavoritesBar sur les données préchargées (mini-temp dans les pills)
- [x] Backend: Réécriture stationService — champs SYNOP corrects (latitude/longitude/altitude), multi-sources réelles
- [x] Backend: OpenDataSoft SYNOP — vraies stations Météo-France avec champs latitude/longitude/altitude corrigés
- [x] Backend: Netatmo/WU/Infoclimat/CWOP — données Open-Meteo multi-points réels avec variation micro-climatique
- [x] Backend: SYNOP/WMO référence ECMWF IFS ajoutée comme source supplémentaire
- [x] Backend: Paramètre townName ajouté à collectNearbyStations pour nommer les stations par lieu
- [x] Bug: Unifier les poids de pondération du régime météo — Dashboard et Classement affichent maintenant les mêmes pourcentages (vrais poids du régime détecté, plus de valeurs codées en dur)

## Gestion indépendante des 5 lieux favoris
- [x] DB: Ajouter locationKey (lat+lon hash) aux tables forecasts, observations, scores pour isoler les données par lieu
- [x] DB: Table location_profiles — altitude, timezone, climate type, microclimat par favori (via location_forecasts)
- [x] Backend: Endpoints history/ranking/AI Lab acceptent lat+lon comme paramètre de lieu
- [x] Backend: Classement indépendant par lieu (getRanking avec lat/lon)
- [x] Backend: Historique indépendant par lieu (getHistory avec lat/lon)
- [x] Backend: AI Lab indépendant par lieu (stations, scores, analyses)
- [x] Backend: Pondération intelligente selon contexte géographique (via ultraLocalService microclimats)
- [x] Cron 05h00: Collecter prévisions pour chaque favori indépendamment avec ses coordonnées
- [x] Frontend: Contexte de lieu actif propagé à toutes les pages (Classement, Historique, Stations, AI Lab)
- [x] Frontend: Chaque page affiche "Pour [Nom du lieu]" et utilise les données de ce lieu
- [x] Frontend: Swipe horizontal entre favoris sur Dashboard avec préchargement instantané
- [x] Backend: Collecte 05h00 — tous les modèles météo pour tous les lieux favoris (avec locationKey)
- [x] Backend: Fonction makeLocationKey(lat, lon) partagée dans shared/
- [x] Backend: db.ts helpers filtrés par locationKey pour forecasts/observations/scores

## Corrections gaps identifiés
- [x] Backend: Rendre getAILab 100% location-aware (observation + meteoAI filtrés par locationKey)
- [x] Frontend: Ajouter indicateur lieu actif sur Stations et AI Lab pages
- [x] Heartbeat: Aligner le cron favoris sur 05h00 Paris exactement (cron 0 0 3 * * *)

## Collecte observations 00h30 par lieu favori
- [x] Backend: Étendre collectObservations(date, lat, lon) pour accepter des coordonnées arbitraires
- [x] Backend: Reécrire collectObservationsHandler pour boucler sur tous les favoris
- [x] Backend: Stocker les observations avec locationKey par lieu
- [x] Backend: Calculer les scores de fiabilité par lieu (forecasts vs observations du même locationKey)
- [x] Backend: Notification récapitulative avec scores par lieu
- [x] Heartbeat: Cron observations mis à jour à 00h30 Paris (22h30 UTC) — task_uid: Qg2R5Xkkfk5cukBEn789qj

## Dashboard dynamique par lieu favori
- [x] Backend: collect15DayForecast() accepte coords {lat, lon} optionnelles
- [x] Backend: collectHourlyForecast() accepte coords {lat, lon} optionnelles
- [x] Backend: get15DayForecast tRPC accepte input {lat, lon} optionnel
- [x] Backend: getHourlyForecast tRPC accepte input {lat, lon} optionnel
- [x] Frontend: Dashboard — Prévision MeteoAI change selon le lieu actif (via getLocationWeather + getDashboard)
- [x] Frontend: Dashboard — Heure par heure change selon le lieu actif (getHourlyForecast avec coordsInput)
- [x] Frontend: Dashboard — Températures 15 jours change selon le lieu actif (get15DayForecast avec coordsInput)
- [x] Frontend: Dashboard — Prévisions 15 jours change selon le lieu actif (get15DayForecast avec coordsInput)
- [x] Frontend: Nom du lieu actif affiché dans chaque section (MeteoAI, Heure par heure, Températures 15j, Prévisions 15j)

## Vraies APIs météo publiques (avec fallback gracieux)
- [x] Créer server/realWeatherAPIs.ts — adaptateurs OpenWeatherMap + Météo-France
- [x] OpenWeatherMap: endpoint /data/2.5/forecast (5j/3h), agrégation journalière, fallback si clé absente
- [x] Météo-France: OAuth2 portail + fallback Open-Meteo ARPEGE/AROME (sans authentification)
- [x] Ajouter OPENWEATHERMAP_API_KEY et METEOFRANCE_API_KEY dans server/_core/env.ts
- [x] Intégrer realWeatherAPIs dans collectFavoritesForecastsHandler — remplacer generatePublicServiceForecasts pour OWM et MF
- [x] Conserver simulation pour les 8 autres modèles publics (AccuWeather, Apple Weather, etc.)
- [x] TypeScript clean + 47 tests passent
- [x] Checkpoint final

## Graphique enrichi Températures & Météo 15 jours
- [x] Frontend: Créer FifteenDayChart.tsx — graphique Canvas avec courbes Max/Min + valeurs sur points
- [x] Frontend: Zones colorées contextuelles (canicule rouge, orage violet) selon WMO code
- [x] Frontend: Ligne de vent en pointillés verts avec flèches directionnelles et valeurs
- [x] Frontend: Barres de précipitations bleues avec valeurs mm
- [x] Frontend: Icônes météo SVG entre barres précip et jours de la semaine
- [x] Frontend: Panneau déroulant au clic sur un jour (ressenti, UV, humidité, vent+direction, confiance, Matin/AM/Soir)
- [x] Frontend: Intégrer FifteenDayChart dans Dashboard.tsx en remplacement de la section existante
- [x] TypeScript clean + 47 tests passent

## Amélioration lisibilité graphique 15 jours
- [x] Frontend: Agrandir le graphique (CHART_HEIGHT 280, PRECIP 56, ICON 40, LABEL 42)
- [x] Frontend: Scroll horizontal tactile — 7 jours visibles, glisser pour les 8 suivants
- [x] Frontend: Colonnes plus larges (largeur fixe basée sur viewport / 7)
- [x] Frontend: Hint "← Glissez pour voir les jours suivants →"
- [x] TypeScript clean + 47 tests passent

## Design moderne graphique 15 jours + panneau détaillé enrichi
- [x] Backend: Ajouter uvIndex, windDirection, feelsLikeMax, feelsLikeMin, sunrise, sunset dans DayForecast
- [x] Backend: Requête Open-Meteo étendue avec tous les champs daily supplémentaires
- [x] Frontend: Précipitations intégrées DANS le graphique (barres avec gradient + glow en arrière-plan)
- [x] Frontend: Courbes bézier lisses avec gradient fill entre Max et Min
- [x] Frontend: Points lumineux avec glow effect + labels annotés
- [x] Frontend: Zones contextuelles colorées (canicule rouge, orage violet)
- [x] Frontend: Flèches de vent directionnelles orientées selon windDirection
- [x] Frontend: Panneau détaillé enrichi : Température, Ressenti, Vent, Direction, Précipitations, Humidité, UV, Nébulosité, Lever/Coucher soleil, Confiance avec barre de progression
- [x] Frontend: Design glassmorphism (bg-gradient, backdrop-blur, border-white/10)
- [x] TypeScript clean + 47 tests passent

## Toggle 7j/15j + Barre de progression cliquable
- [x] Frontend: Toggle 7j/15j au-dessus du graphique (boutons pill actif/inactif)
- [x] Frontend: Barre de progression cliquable — clic positionne le scroll au jour correspondant
- [x] Frontend: Barre de progression agrandie (6px) avec hover effect et texte "Cliquez ou glissez"
- [x] TypeScript clean + 47 tests passent

## Graphique heure par heure Canvas + nettoyage Dashboard
- [x] Frontend: Créer HourlyChart.tsx — graphique Canvas similaire au 15 jours (courbes temp, vent, précip, icônes, scroll horizontal)
- [x] Frontend: Supprimer section Weather AI Lab du Dashboard
- [x] Frontend: Supprimer section Prévisions 15 jours en tableau (cards) du Dashboard
- [x] Frontend: Supprimer section Classement des modèles du Dashboard
- [x] Frontend: Intégrer HourlyChart dans le Dashboard à la place de la section heure par heure actuelle
- [x] TypeScript clean + tests passent

## Courbe température ressentie sur graphique horaire
- [x] Ajouter courbe en pointillés (rose/pink) pour la température ressentie sur HourlyChart
- [x] Ajouter entrée dans la légende

## Harmonisation températures avec 1 décimale
- [x] Dashboard héro : afficher currentTemp, tempMax, tempMin, apparentTemp avec toFixed(1) au lieu de Math.round

## Unification moteur température Vérité terrain / Mode Local
- [x] Analyser les deux algorithmes actuels (stationService.ts et routers/weather.ts)
- [x] Créer un moteur unifié — calculateUltraLocal(mode="local") utilisé partout
- [x] Mettre à jour le Dashboard (Mode Local) et Stations pour utiliser le même moteur
- [x] Algorithme identique dans les deux vues (bandes 55/25/10%, qualité, altitude, modèle 10%)

## Unification moteur température Vérité terrain / Mode Local
- [x] Analyser les deux algorithmes (calculateGroundTruth vs calculateUltraLocal)
- [x] Remplacer calculateGroundTruth par calculateUltraLocal(mode="local") dans getGroundTruth, searchStations, getStationDetail
- [x] Vérifier TypeScript + 47 tests passent

## Optimisation scientifique MeteoAI
- [x] Phase 1: Audit complet des algorithmes existants (ultraLocalService, stationService, scoring)
- [x] Phase 2: Implémenter moteur d'évaluation MAE/RMSE/biais sur données historiques
- [x] Phase 3: Implémenter fusion IDW (Inverse Distance Weighting) avec exposant adaptatif
- [x] Phase 4: Pondération adaptative par performance historique (station + modèle)
- [x] Phase 5: Détection et correction des microclimats (altitude, urbain, maritime)
- [x] Phase 6: Scoring contextuel dynamique (pondérations selon phénomène météo)
- [x] Phase 7: Tests A/B validation sur données réelles + rapport de précision
- [x] Phase 8: Déploiement des améliorations validées

## Refonte multi-régimes + prévisions 16j + horaire détaillé
- [x] Backend: collect15DayForecast — étendre de 15 à 16 jours (changer slice(0,15) → slice(0,16))
- [x] Backend: getRanking + getDashboard — brancher detectExtendedRegime (12 régimes) au lieu de detectWeatherRegime (5 régimes)
- [x] Backend: Implémenter détection multi-régimes simultanés avec pourcentages d'influence
- [x] Backend: getHourlyForecast — retourner données multi-modèles (collectHourlyForecastAllModels) avec fusion synthétique
- [x] Frontend: FifteenDayChart — toggle 7j/15j/16j + barre de progression adaptée
- [x] Frontend: HourlyChart — overlay détaillé enrichi (confiance, multi-modèles si dispo)
- [x] Frontend: Ranking — système multi-régimes avec illustration dynamique, pourcentages, confiance globale

## Corrections bugs audit + scoring échéance + historique enrichi (31 juillet 2026)

- [x] Bug 1: Séparer confidenceScore (basé sur accord modèles + historique) de stabilityIndex
- [x] Bug 2: Implémenter rmsePrecip et rmseWind dans calculateReliabilityScore
- [x] Bug 3: Persister previousReadings pour activer la détection de valeurs figées
- [x] Bug 4: Supprimer le cron 07h30 redondant (collectForecastsHandler)
- [x] Scoring par échéance: brancher computeLeadTimeScores dans collectObservationsHandler + stocker en DB
- [x] Scoring par échéance: créer table lead_time_scores en DB
- [x] Scoring par échéance: exposer via procédure tRPC
- [x] Page Historique: comparaison par modèle individuel (graphique multi-courbes)
- [x] Page Historique: graphique de précipitations observées vs prévues
- [x] Page Historique: graphique de vent observé vs prévu

## Refonte complète page Classement (31 juillet 2026)

- [x] Backend: enrichir getRanking avec paramètres météo actuels (temp, humidité, pression, précip, vent, couverture nuageuse) + impact par paramètre
- [x] Backend: calcul des pondérations 6 dimensions (température, nuages, précipitations, vent, humidité, pression)
- [x] Backend: grille 20 régimes possibles avec pourcentages calculés par l'IA
- [x] Backend: facteurs clés du moment (top 5 facteurs influençant la météo actuelle)
- [x] Frontend: refonte complète Ranking.tsx fidèle à la maquette (image paysage, détection IA, confiance, paramètres, pondérations, régimes, facteurs, meilleur modèle)
- [x] Frontend: refonte pixel-perfect identique à la maquette fournie (fond noir, cartes arrondies, SVG icons, grille 5x4, image paysage uploadée)

## Images paysages météo dynamiques (31 juillet 2026)

- [x] Générer images paysages: ensoleillé, nuageux, partiellement nuageux, pluie, orage, neige, brouillard, vent fort
- [x] Uploader toutes les images via manus-upload-file --webdev
- [x] Intégrer sélection dynamique dans Ranking.tsx (hero card image change selon régime)
- [x] Intégrer sélection dynamique dans Dashboard.tsx (image change selon régime)

## Migration icônes lucide-react
- [x] Frontend: Remplacer tous les SVG inline par des icônes lucide-react dans Ranking.tsx
- [x] Frontend: Icônes lucide-react pour paramètres (Thermometer, CloudRain, Wind, Cloud, Droplets, Gauge)
- [x] Frontend: Icônes lucide-react pour grille 20 régimes (Sun, CloudSun, CloudFog, Snowflake, CloudLightning, etc.)
- [x] Frontend: Icônes lucide-react pour facteurs clés et pondérations

## Suppression régime Standard + recalcul 20 régimes
- [x] Backend: supprimer "standard" de EXTENDED_REGIME_WEIGHTS et EXTENDED_REGIME_INFO
- [x] Backend: supprimer "standard" de detectMultiRegime — ne plus retomber sur Standard par défaut
- [x] Backend: ajouter les 20 régimes spécifiques de la grille (overcast, partly_cloudy, few_clouds, sunny, fog, showers, rainy, thunderstorm, windy, snow, frost, freezing_rain, deep_frost, summer_heat, cold_wave, storm, variable, spring_unstable, stable, autumn_disturbed)
- [x] Backend: recalculer detectMultiRegime pour attribuer toujours un des 20 régimes spécifiques
- [x] Frontend: supprimer toute référence au régime "Standard" dans Ranking.tsx
- [x] Tests: vérifier que detectMultiRegime ne retourne jamais "standard"

## Badges d'alerte régimes dangereux + Dashboard régime détecté
- [x] Frontend: Créer composant AlertBadge pour régimes dangereux (thunderstorm, storm, summer_heat, cold_wave, freezing_rain, windy)
- [x] Frontend: Afficher badge d'alerte animé (pulsation) sur Dashboard quand régime dangereux détecté
- [x] Frontend: Afficher badge d'alerte sur page Classement dans le hero card
- [x] Frontend: Dashboard — remplacer label "Standard" du mode par le nom du régime actif détecté
- [x] Frontend: Dashboard — afficher le régime détecté avec icône + pourcentage dans la section prévision MeteoAI
- [x] Backend: Ajouter le régime détecté dans la réponse getDashboard (multiRegime avec activeRegimes, confidenceScore, blendedWeights)
- [x] Backend: Ajouter multiRegime dans la réponse getLocationWeather (favorites.ts)
- [x] Backend: Corriger fallback stale "standard" → "variable" dans fusionEngine.ts

## Pack d'icônes MeteoAI personnalisé + résumé journée
- [x] Frontend: Créer composant MeteoIcon.tsx avec tous les SVG du pack MeteoAI (30+ icônes régimes + paramètres + indicateurs)
- [x] Frontend: Remplacer les icônes SVG inline du Dashboard par MeteoIcon
- [x] Frontend: Remplacer les icônes de la page Classement par MeteoIcon
- [x] Frontend: Dashboard — afficher l'icône météo de l'heure en cours (pas celle de la journée)
- [x] Frontend: Dashboard — ajouter un résumé de la journée avec icône de tendance météo
- [x] Frontend: Remplacer les icônes dans FifteenDayChart et HourlyChart par MeteoIcon
- [x] Frontend: Remplacer les icônes lucide dans AlertBadge.tsx par MeteoIcon
