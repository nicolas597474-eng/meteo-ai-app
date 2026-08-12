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

## Page Détails météo (prévisions complètes)
- [x] Backend: Étendre HourlyPoint avec pressure, dewPoint, visibility, solarRadiation, cloudLow/Mid/High, precipType, precipIntensity
- [x] Backend: Étendre DayForecast avec uvIndex, feelsLikeMax, feelsLikeMin, sunrise, sunset, windDirection
- [x] Backend: Endpoint getDetailedForecast (48h hourly + 15j daily + régime + confiance + meilleur modèle)
- [x] Frontend: Créer page WeatherDetails.tsx — section prévisions horaires (frise défilante 30+ params)
- [x] Frontend: Section graphiques interactifs (temp, vent, précip, pression, humidité, nuages)
- [x] Frontend: Section résumé IA horaire
- [x] Frontend: Section prévisions jours (16 jours avec icône + max/min + précip + vent + stabilité)
- [x] Frontend: Section tendances (flèches hausse/stable/baisse par paramètre)
- [x] Frontend: Indices de confiance (période en cours, aujourd'hui, 7 prochains jours)
- [x] Frontend: Navigation et route /details dans App.tsx + lien depuis Dashboard

## Corrections Audit MeteoAI (8 points)
- [x] Backend: Correction automatique des biais — applyBiasCorrection() dans fusionEngine, appliquée dans scheduledHandlers (default + favoris)
- [x] Backend: Scoring par échéance — getLeadTimeWeights() dans fusionEngine, appliqué dans scheduledHandlers (default + favoris)
- [x] Backend: Unifier les régimes — statsEngine importe detectExtendedRegime (20 régimes) depuis fusionEngine, WeatherRegime = ExtendedRegime
- [x] Backend: Corriger confidenceScore — computeConfidenceScore() dans fusionEngine (accord modèles 40% + perf historiques 30% + stations 20% + échéance 10%)
- [x] Backend: Activer computeFusion avancé (IDW + qualité + fiabilité historique) dans les collectes journalières et la fusion ultra-locale active
- [x] Backend: Calcul et stockage RMSE vent/précipitations dans lead_time_scores par échéance, avec agrégation RMS dans db.ts
- [x] Backend: Activer détection persistante des anomalies — transmettre previousReadings depuis stationReadingsCache à computeFusion puis enregistrer les nouveaux relevés
- [x] Frontend: Afficher le vrai indice de confiance (vs stabilité) dans Dashboard et WeatherDetails
- [x] Tests: Ajouter tests IDW et pénalité de station figée dans fusionEngine.test.ts

## Système de notifications personnalisées — annulé à la demande de l'utilisateur
- [x] Annulation : router, intégration frontend et schéma applicatif supprimés. Les tables vides déjà créées en DB sont conservées à la demande de l'utilisateur et ne sont référencées par aucun code.
- [x] DB: Table `notification_preferences` (userId, locationId, alertType, threshold, enabled, channels) — annulée, table vide conservée en DB.
- [x] DB: Table `alert_history` (userId, locationId, alertType, triggeredAt, message, read) — annulée, table vide conservée en DB.
- [x] Backend: Procédures tRPC getNotificationPreferences / updateNotificationPreferences / getAlertHistory / markAlertsRead — annulées.
- [x] Backend: Logique de déclenchement d'alertes dans le cron de collecte — annulée.
- [x] Frontend: Page Notifications.tsx avec historique des alertes et configuration des seuils par lieu — annulée.
- [x] Frontend: Badge de notification dans la navigation — annulé.
- [x] Frontend: Toast in-app lors de la détection d'un régime dangereux au chargement du Dashboard — annulé.

## Simplification du Dashboard — suppression des résumés
- [x] Frontend: Supprimer le bloc « Résumé de la journée » sous la carte principale du Dashboard.
- [x] Frontend: Supprimer le bloc « Analyse IA » sous le graphique des prévisions à 16 jours.
- [x] Frontend: Supprimer le bloc « Résumé IA des prochaines heures » de la page Détails météo.
- [x] Frontend: Nettoyer les helpers, props et imports devenus inutiles puis vérifier TypeScript et Vitest.

## Corrections de cohérence — audit source de vérité
- [x] Backend: Transmettre les coordonnées de la localisation aux collecteurs horaire et 16 jours dans `favorites.getLocationWeather`.
- [x] Backend: Centraliser les dates métier avec `weatherTime.ts` (Europe/Paris) et supprimer les usages UTC / système qui affectent les prévisions.
- [x] Backend: Exclure les services publics simulés des ensembles de prévision et de scoring officiels.
- [x] Backend: Unifier le chemin de collecte manuelle sur la même fusion avancée que le cron planifié.
- [x] Backend: Exposer une réponse de prévision consolidée cohérente par localisation et instant de calcul.
- [x] Frontend: Faire consommer au Dashboard et à la page Détails les mêmes données officielles pour l’instant courant et la journée.
- [x] Frontend: Distinguer explicitement prévision officielle et observation locale/ultra-locale sans repli implicite.
- [x] Tests: Ajouter des tests de fuseau Paris et de reproductibilité/pondération de la fusion officielle; TypeScript et Vitest validés.

## Traçabilité des prévisions — sources et pondérations
- [x] Backend: Définir le contrat de traçabilité d’une prévision officielle (sources, poids par paramètre, méthode, horodatage).
- [x] DB: Persister les diagnostics exacts de fusion dans le JSON de chaque snapshot MeteoAI, sans migration destructive.
- [x] Backend: Exposer la traçabilité dans les réponses Dashboard et Détails, avec un repli explicite pour les prévisions historiques.
- [x] Frontend: Afficher les sources réellement utilisées, les poids température/précipitations/vent et l’horodatage dans le Dashboard.
- [x] Frontend: Afficher la même traçabilité détaillée dans la page Détails.
- [x] Tests: Vérifier la conservation exacte des sources et la somme des poids pour chaque paramètre.

## Comparaison des pondérations entre prévisions
- [x] Backend: Exposer l’historique de snapshots avec leur traçabilité par localisation.
- [x] Backend: Calculer les écarts de poids par source et par paramètre entre deux snapshots sélectionnés.
- [x] Frontend: Créer une vue comparative avec sélecteurs de snapshots, barres avant/après et écarts chiffrés.
- [x] Frontend: Ajouter l’accès à la comparaison depuis la zone de traçabilité des prévisions.
- [x] Tests: Vérifier les écarts positifs, négatifs et les sources ajoutées ou retirées.

## Diagnostic de cohérence des régimes
- [x] Audit: Identifier la divergence de régime actif entre Dashboard et Classement sans modifier le code.

## Unification du régime actif officiel
- [x] Backend: Créer un contrat de régime officiel commun depuis le snapshot MeteoAI versionné.
- [x] Backend: Faire consommer ce même régime officiel par `getDashboard`, `getRanking` et `getDetailedForecast`.
- [x] Frontend: Afficher le régime officiel commun dans le Dashboard, même en mode Local/Ultra-local.
- [x] Frontend: Afficher l’observation locale comme information distincte et non comme régime officiel.
- [x] Tests: Vérifier l’identité du régime officiel retourné par Dashboard et Classement pour une même localisation; Détails utilise le même constructeur serveur.

## Clarification condition actuelle et tendance journalière
- [x] Frontend: Renommer le badge de régime en « Tendance officielle de la journée ».
- [x] Frontend: Renommer la condition sous la température en « [condition] actuellement ».
- [x] Frontend: Vérifier la lisibilité mobile, TypeScript et Vitest.

## Prochain changement de condition météo
- [x] Frontend: Détecter le premier créneau horaire futur dont la condition diffère de la condition actuelle.
- [x] Frontend: Afficher l’heure exacte et la nouvelle condition dans la carte principale du Dashboard.
- [x] Tests: Vérifier la détection d’un changement, l’absence de changement et les heures de passage de jour.

## Alertes visuelles de changement météo
- [x] Frontend: Classifier le prochain changement en pluie, orage ou vent fort à partir des prévisions horaires officielles.
- [x] Frontend: Afficher une alerte visuelle colorée avec icône MeteoAI, heure et détail du risque dans le Dashboard.
- [x] Tests: Vérifier les alertes pluie, orage, vent fort et les changements non dangereux.

## Refonte visuelle des graphiques météo
- [x] Frontend: Recomposer HourlyChart avec le style de référence : grille en colonnes, courbes orange/bleue lumineuses, créneaux, vent et pluie.
- [x] Frontend: Recomposer FifteenDayChart avec le même style : sélecteur 7j/15j/16j, températures max/min, vent et barres de précipitations.
- [x] Frontend: Conserver les données officielles, le responsive mobile et les interactions existantes.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile des deux graphiques.

## Colonnes météo enrichies dans les graphiques
- [x] Frontend: Afficher l’heure, une grande icône, températures, vent et pluie dans chaque colonne du graphique horaire.
- [x] Frontend: Afficher le jour, une grande icône, températures, vent et pluie dans chaque colonne du graphique journalier.
- [x] Frontend: Conserver les courbes et le clic vers le détail tout en rapprochant la hiérarchie de la maquette.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile des colonnes enrichies.

## Fond noir et zones de données structurées
- [x] Frontend: Remplacer les dégradés bleus des cartes de graphiques par des surfaces noires cohérentes avec le thème MeteoAI.
- [x] Frontend: Distinguer visuellement les zones températures, vent et pluie avec séparateurs et libellés fixes.
- [x] Frontend: Préserver la lisibilité des courbes, des colonnes et des sélections actives.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile.

## Fond sombre des graphiques
- [x] Frontend: Remplacer les dégradés bleus des cartes de graphiques par des surfaces noires cohérentes avec le thème MeteoAI. Couvert par « Fond noir et zones de données structurées ».
- [x] Frontend: Préserver la lisibilité des colonnes, quadrillages, courbes et sélections actives. Couvert par « Fond noir et zones de données structurées ».
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile. Couvert par la validation finale.

## Ajustements fins du graphique horaire
- [x] Frontend: Affiner l’épaisseur et la lueur de la courbe de température.
- [x] Frontend: Appliquer un fond et un contour bleus à la colonne de l’heure actuelle.
- [x] Frontend: Remplacer la barre de défilement violette par un indicateur bleu.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile.

## Simplification du graphique Prévisions météo
- [x] Frontend: Affiner les deux courbes de température du graphique journalier.
- [x] Frontend: Supprimer la grille et les repères de température latéraux du graphique journalier.
- [x] Frontend: Supprimer la courbe de vent et afficher uniquement le vent en km/h par colonne.
- [x] Frontend: Afficher la pluie en mm par colonne, avec barre seulement en cas de cumul.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile.

## Graphiques pleine largeur sans axes latéraux
- [x] Frontend: Supprimer la courbe de vent du graphique horaire et afficher le vent en km/h par colonne.
- [x] Frontend: Retirer l’axe latéral et les libellés de température, vent et pluie des deux graphiques.
- [x] Frontend: Élargir les graphiques sur toute la largeur disponible du Dashboard mobile.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile des deux graphiques.

## Graphique journalier fixe sur quinze jours
- [x] Frontend: Supprimer les choix 7j, 15j et 16j du graphique journalier.
- [x] Frontend: Afficher exclusivement les quinze prochains jours et permettre la navigation horizontale par glissement.
- [x] Frontend: Harmoniser la barre de défilement du graphique journalier avec l’indicateur bleu du graphique horaire.
- [x] Tests: Vérifier TypeScript, Vitest et le rendu mobile.

## Panneau de détails d’une prévision journalière
- [x] Frontend: Enrichir le panneau au clic avec les paramètres météo disponibles du jour sélectionné.
- [x] Frontend: Améliorer la hiérarchie mobile et l’accessibilité de fermeture du panneau.
- [x] Tests: Vérifier TypeScript, Vitest et l’ouverture/fermeture du panneau depuis le graphique.

## Collecte prévisions et stations à 05h00
- [x] Backend: Étendre le job actif de 05h00 pour collecter et persister les stations réellement disponibles par lieu favori.
- [x] Backend: Persister les métadonnées de station et leurs relevés horodatés de manière idempotente.
- [x] Backend: Calculer et stocker la synthèse locale issue des stations actives au sein du même cycle de collecte.
- [x] Backend: Conserver les prévisions quotidiennes et horaires de tous les modèles réellement disponibles, sans ajouter de job planifié.
- [x] Tests: Vérifier la collecte de stations, le filtrage des sources non physiques et l’idempotence des écritures.
- [x] Opérations: Confirmer le job actif « meteoai-collect-favorites-forecasts » à 05h00 Paris (03h00 UTC en été), prochaine exécution planifiée le 13 août 2026 à 03:00 UTC.

## Remplacement de la page Classement par Stations & fiabilité locale
- [x] Backend: Exposer les stations physiques actives, leur dernier relevé, leur âge et leur historique par lieu.
- [x] Backend: Exposer une série 24 h comparant synthèse de stations et prévision officielle.
- [x] Frontend: Remplacer la page Classement par la vue Stations & fiabilité locale.
- [x] Frontend: Afficher les âges des relevés, l’historique des stations et la comparaison 24 h.
- [x] Tests: Vérifier les données de stations, les âges et les séries comparatives sans données simulées.

## Rétablissement de collecte et enrichissement de la fiabilité locale
- [x] Backend: Diagnostiquer et corriger l’échec de la collecte de stations de 05h00.
- [x] Opérations: Renouveler l’autorisation du job de 05h00 après l’échec 403 « cron cookie ».
- [x] Backend: Exécuter une récupération contrôlée des relevés physiques manquants après correction.
- [x] Opérations: Déclencher immédiatement une collecte ponctuelle des huit modèles et des stations physiques, sans modifier la collecte quotidienne.
- [x] Backend: Exécuter le même cycle de collecte une fois avec une identité planifiée locale, sans assouplir l’authentification de production.
- [x] Backend: Borner les appels aux services publics externes pour qu’une indisponibilité ne bloque pas la collecte.
- [x] Frontend: Ajouter une carte des stations physiques autour du lieu.
- [x] Frontend: Afficher l’écart instantané station/prévision officielle en °C.
- [x] Frontend: Ajouter un filtre 24 h / 7 jours à l’historique et à la comparaison.
- [x] Tests: Vérifier les écarts et les deux fenêtres de période.

## Collecte exhaustive à 05h00 — modèles et stations
- [x] Backend: Contrôler et journaliser la couverture des huit modèles experts quotidiens et horaires par lieu.
- [x] Backend: Éviter que le résumé LLM non affiché ralentisse ou bloque la collecte quotidienne.
- [x] Backend: Réduire la durée des appels multi-modèles pour respecter la fenêtre d’exécution planifiée.
- [x] Backend: Persister les relevés des stations physiques disponibles et distinguer explicitement les sources sans observation réelle.
- [x] Tests: Vérifier la couverture des modèles et la terminaison du cycle de collecte dans la fenêtre planifiée.

## Fiabilité locale — disponibilité, rayon et bilan de collecte
- [x] Backend: Enregistrer un historique de disponibilité par lieu pour chaque cycle de collecte de stations.
- [x] Backend: Utiliser le rayon de recherche configurable du lieu favori lors de la collecte des stations physiques.
- [x] Backend: Exposer le dernier bilan de collecte et la série de disponibilité dans la réponse Fiabilité.
- [x] Frontend: Ajouter un sélecteur de rayon de recherche sur la page Fiabilité.
- [x] Frontend: Afficher l’historique de disponibilité des stations et le dernier bilan de collecte.
- [x] Tests: Vérifier la persistance, le rayon choisi et les contrats de disponibilité/bilan.

## Simplification des prévisions
- [x] Frontend: Retirer le panneau « Sources et pondérations de la prévision » du Dashboard.
- [x] Frontend: Retirer le même panneau des prévisions détaillées.
- [x] Tests: Vérifier que les prévisions restent accessibles après le retrait de la traçabilité visible.

## Fusion Stations vers Fiabilité
- [x] Backend: Exposer dans Fiabilité les sources locales réelles et les sources de référence distinctement.
- [x] Frontend: Regrouper la synthèse multi-source, les critères de classement et la liste des stations dans Fiabilité.
- [x] Frontend: Distinguer visuellement les stations physiques locales des sources de grille ou de référence.
- [x] Navigation: Retirer l’accès redondant à la page Stations après transfert du contenu.
- [x] Tests: Vérifier les catégories de sources et la continuité des données sur la page Fiabilité.
- [x] Tests: Rendre déterministe le test de catégorisation des sources sans dépendre des appels météo externes.

## Lisibilité et filtres des sources Fiabilité
- [x] Frontend: Renforcer les badges distinguant stations physiques locales et sources de référence.
- [x] Frontend: Ajouter des filtres interactifs par statut de source et ordre de distance.
- [x] Tests: Vérifier le filtrage et le tri déterministe des sources affichées.

## Extension des stations physiques vérifiables
- [x] Recherche: Sélectionner les réseaux d’observations physiques et vérifier leurs conditions d’accès.
- [x] Backend: Intégrer les sources retenues sans clé au cycle de collecte de 05h00 avec provenance et fraîcheur.
- [x] Backend: Appliquer une validation stricte et une classification distincte des stations physiques, références et sources écartées.
- [x] Tests: Vérifier l’origine, les restrictions d’accès et la non-utilisation de données simulées.
- [x] Décision: Conserver Netatmo désactivé jusqu’à la fourniture d’identifiants OAuth, sans le présenter comme source physique.
- [x] Backend: Ajouter le collecteur METAR mondial officiel avec filtrage géographique, conversion d’unités et délai réseau borné.
- [x] Frontend: Clarifier que les références de grille ne sont pas des stations Netatmo, Weather Underground ou CWOP réelles sans accès fournisseur.
