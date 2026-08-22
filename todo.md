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

## Cohérence température Dashboard et Fiabilité
- [x] Backend: Utiliser la même observation locale validée pour la température actuelle du Dashboard et la page Fiabilité.
- [x] Frontend: Expliquer la provenance de la température actuelle sans masquer la prévision officielle.
- [x] Tests: Vérifier les cas observation valide, absente ou périmée dans le contrat Dashboard.

## Transparence du relevé local Dashboard
- [x] Backend: Exposer l’heure du dernier relevé local validé et l’écart avec la prévision officielle.
- [x] Frontend: Afficher la fraîcheur du relevé et l’écart local/officiel dans la carte principale.
- [x] Tests: Vérifier le calcul de l’écart et les replis sans relevé local.

## Historique local vs prévision officielle
- [x] Backend: Construire une série horaire vérifiable des écarts sur les dernières 24 heures.
- [x] Frontend: Ajouter un graphique compact local/officiel au Dashboard.
- [x] Tests: Vérifier les paires d’observations comparables et les créneaux sans données.

## Régime officiel cohérent dans l’AI Lab
- [x] Backend: Exposer le régime opérationnel versionné dans les données de l’AI Lab.
- [x] Frontend: Remplacer le calcul local de régime de l’AI Lab par le régime opérationnel partagé.
- [x] Tests: Vérifier la sélection commune Dashboard / AI Lab pour une même localisation et date.

## Priorité de fraîcheur du régime
- [x] Audit: Comparer les horodatages, la couverture et les paramètres des régimes Dashboard et AI Lab.
- [x] Backend: Sélectionner le régime le plus récent et le mieux étayé selon des règles mesurables.
- [x] Frontend: Indiquer la fraîcheur de la source de régime affichée.

## Validation du régime de nébulosité
- [x] Audit: Comparer la nébulosité affichée aux valeurs actuelles de prévision et d’observation.
- [x] Backend: Ajuster le régime uniquement si les données vérifiées justifient un seuil différent.
- [x] Frontend: Rendre visible la valeur de nébulosité qui motive le libellé de régime.
- [x] Backend: Prioriser la nébulosité horaire actualisée pour la condition actuelle, sans confondre cette prévision avec une observation physique.

## Diagnostic du régime affiché obsolète
- [x] Audit: Vérifier le créneau horaire, le cache client et la réponse Dashboard réellement affichée.
- [x] Backend: Corriger tout décalage entre l’heure de Paris et le créneau de nébulosité sélectionné.
- [x] Frontend: Invalider les réponses de régime à l’heure courante et signaler explicitement leur actualisation.
- [x] Frontend: Rafraîchir automatiquement les régimes dépendant de la condition actuelle sans attendre une navigation manuelle.

## Actualisation et transitions de régime
- [x] Backend: Exposer le prochain créneau de changement de régime à partir de la série horaire.
- [x] Frontend: Ajouter un bouton d’actualisation immédiate du Dashboard.
- [x] Frontend: Afficher l’âge de la donnée et le prochain changement de régime.
- [x] Tests: Vérifier les transitions, l’absence de transition et la fraîcheur affichée.

## Intégration des stations Netatmo
- [x] Configuration: Enregistrer les identifiants Netatmo requis de manière sécurisée.
- [x] Backend: Collecter et valider les stations Netatmo publiques dans le rayon du favori.
- [x] Backend: Persister les observations Netatmo avec provenance, fraîcheur et règles d’anomalie.
- [x] Frontend: Afficher les stations Netatmo validées parmi les stations physiques locales.
- [x] Tests: Vérifier l’authentification, le filtrage et l’absence de données simulées.

## Reprise guidée de la configuration Netatmo
- [x] Configuration: Créer ou vérifier l’application Netatmo avec la Redirect URI de production exacte et le scope requis.
- [x] Configuration: Réenregistrer les identifiants de la même application Netatmo après validation de l’utilisateur.

## Correction de provenance des stations Netatmo
- [x] Audit: Identifier pourquoi des références de grille apparaissent sous le libellé Netatmo public.
- [x] Backend: Empêcher toute classification Netatmo sans observation authentifiée et provenance `netatmo` réelle.
- [x] Frontend: Afficher les références de grille dans leur catégorie exacte, sans badge de station réelle.
- [x] Tests: Vérifier qu’une référence de grille ne peut jamais devenir une station Netatmo réelle.

## Indicateur du modèle météo utilisé
- [x] Backend: Déterminer le modèle dominant et les modèles de fusion à partir des poids réellement appliqués.
- [x] Frontend: Afficher l’indicateur de modèle principal dans la carte de prévision du Dashboard.
- [x] Tests: Vérifier le modèle dominant, les égalités et le repli multi-modèles.

## Diagnostic OAuth Netatmo
- [x] Audit: Distinguer un Access Token d’un Refresh Token et relever le code de refus OAuth sans exposer de secret.
- [x] Configuration: Corriger le flux d’autorisation Netatmo requis pour la collecte récurrente.

## Callback OAuth Netatmo sécurisé
- [x] Backend: Créer l’endpoint callback OAuth Netatmo avec validation d’état anti-CSRF.
- [x] Backend: Échanger le code d’autorisation et stocker les jetons chiffrés côté serveur.
- [x] Frontend: Ajouter le lancement de l’autorisation et l’état de connexion Netatmo.
- [x] Tests: Vérifier la validation d’état, le rejet des callbacks incomplets et le stockage sécurisé.

## Correctif OAuth Netatmo mobile
- [x] Audit: Vérifier pourquoi le cookie d’état OAuth n’est pas renvoyé lors du retour depuis Netatmo sur mobile.
- [x] Backend: Rendre la validation anti-CSRF indépendante du cookie tiers perdu pendant la redirection mobile.
- [x] Tests: Vérifier le retour OAuth avec et sans cookie d’état, sans accepter un état falsifié.

## Diagnostic détaillé du callback Netatmo
- [x] Backend: Journaliser de manière non sensible la cause du rejet de callback (signature, expiration ou état consommé).
- [x] Backend: Vérifier le chemin de callback publié ; aucun montage ou contrôle fautif ne masque le diagnostic courant.
- [x] Tests: Couvrir le scénario de retour mobile correspondant au diagnostic.

## Traçage de la route callback Netatmo
- [x] Audit: Vérifier que la route de callback publiée exécute bien le code de diagnostic courant.
- [x] Backend: Confirmer qu’aucune route de repli ou montage ne masque le message de diagnostic.

## Refus Netatmo avant code OAuth
- [x] Backend: Afficher et journaliser de manière non sensible le paramètre d’erreur retourné par Netatmo.
- [x] Configuration: Corriger la Redirect URI ou les identifiants selon le code de refus reçu.
- [x] Backend: Ajouter le paramètre OAuth obligatoire `response_type=code` à l’autorisation Netatmo.

## Rejet Netatmo invalid_client
- [x] Diagnostic: Vérifier la cohérence entre le Client ID, le Client Secret et l’application Netatmo créée.
- [x] Configuration: Réenregistrer les identifiants de la même application puis confirmer l’échange OAuth.

## Données Netatmo sans connexion de compte
- [x] Étude: Clôturer cette voie après le choix utilisateur d’une autorisation OAuth Netatmo `read_station`.
- [x] Backend: Mettre en œuvre la voie OAuth retenue avec provenance et limites d’accès vérifiables.
- [x] Validation: Vérifier l’authenticité, la fraîcheur et l’affichage des stations obtenues.

## Compte Netatmo dédié
- [x] Décision: Ne pas imposer de compte dédié ; l’utilisateur a autorisé son compte actuel avec le seul scope `read_station`.
- [x] OAuth: Restreindre l’autorisation effective au seul scope `read_station`.

## Simplification de Fiabilité
- [x] Frontend: Retirer la section de connexion Netatmo de la page Fiabilité.
- [x] Validation: Vérifier que la page conserve les stations correctement classifiées sans affichage de connexion Netatmo.

## Étude Weather Underground
- [x] Étude: Vérifier les conditions d’accès, licences et API actuelles de Weather Underground.
- [x] Architecture: Définir le seul prérequis acceptable : une clé et une autorisation de propriétaire vérifiables, sans implémentation active.
- [x] Décision: Écarter Weather Underground du périmètre actif tant que ces prérequis ne sont pas fournis.

## Alternatives aux stations Weather Underground
- [x] Étude: Comparer les réseaux et APIs de stations personnelles accessibles gratuitement ou à coût réduit.
- [x] Décision: Conserver Netatmo autorisé et openSenseMap en validation ; ne pas activer les réseaux demandant clé, compte, abonnement ou droit de propriétaire.

## Sources de stations sans clé API
- [x] Étude: Retenir uniquement les réseaux gratuits, publics et accessibles sans clé API ni compte.
- [x] Décision: Écarter explicitement les sources qui nécessitent une clé, un abonnement ou l’accès du propriétaire de station.

## Conception d’intégration openSenseMap et CWOP
- [x] Architecture: Définir les adaptateurs serveur, le schéma de provenance et les filtres communs aux deux sources.
- [x] Qualité: Définir les règles mesurables de fraîcheur, exposition, complétude et cohérence locale avant la fusion.
- [x] Collecte: Définir les points de collecte à la demande et planifiés sans clé API.
- [x] Décision: Présenter les étapes d’implémentation pour accord avant tout développement.

## Réseau d’observations multi-sources
- [x] Architecture: Classer les sources en trois niveaux de confiance sans assimiler une source candidate à une station validée.
- [x] Algorithme: Définir une qualité par station et par paramètre fondée sur distance, fraîcheur, historique, cohérence, type, altitude et environnement.
- [x] Fusion: Définir une estimation locale robuste, explicable et vérifiable sans moyenne simple des stations.
- [x] Déploiement: Définir une expérimentation contrôlée et des critères de gain mesurés avant activation dans la température finale.
- [x] Décision: Présenter le plan multi-sources pour accord avant tout développement.

## Phase 1 — openSenseMap en observation
- [x] Backend: Retirer les références de grille qui utilisent abusivement des libellés de réseaux de stations.
- [x] Backend: Interroger openSenseMap sans clé et mapper uniquement des capteurs extérieurs identifiés comme candidats.
- [x] Données: Persister provenance, fraîcheur, mesures disponibles et statut `candidate`, sans contribution à la température locale.
- [x] Frontend: Afficher les capteurs citoyens avec un statut de validation distinct des stations physiques validées.
- [x] Tests: Vérifier le filtrage des capteurs, l’absence de données simulées et l’exclusion de la fusion locale.
- [x] Mesure: Évaluer la couverture openSenseMap et CWOP/MADIS autour des favoris avant l’activation d’une source supplémentaire.

## Cohérence des prochains changements de régime
- [x] Backend: Utiliser un unique régime de créneau horaire pour les annonces de transition.
- [x] Frontend: Afficher le même libellé dans « Prochain changement » et « Régime à venir ».
- [x] Tests: Vérifier l’identité des deux annonces pour un même créneau de transition.

## Cohérence nébulosité horaire et régime
- [x] Backend: Centraliser les seuils et libellés de nébulosité utilisés par les conditions horaires et les régimes.
- [x] Frontend: Afficher un libellé identique pour le créneau détaillé et le régime à venir.
- [x] Tests: Vérifier la catégorie commune pour les niveaux de nébulosité de transition.

## Audit complet des descriptions de nébulosité
- [x] Audit: Recenser les libellés, seuils et descriptions de nébulosité restants dans les écrans et services.
- [x] Backend: Remplacer les derniers calculs ou descriptions divergents par la catégorisation commune.
- [x] Tests: Couvrir les seuils partagés et les descriptions visibles pour chaque catégorie de ciel.

## Fiabilité mesurée par paramètre et modèle
- [x] Audit: Mesurer la couverture et les erreurs historiques disponibles par modèle, paramètre, lieu et échéance.
- [x] Backend: Sélectionner et pondérer séparément les modèles sur les performances réelles récentes et historiques.
- [x] Backend: Ajouter des garde-fous contre les poids instables lorsque les données observées sont insuffisantes.
- [x] Tests: Vérifier que tout changement de pondération est fondé sur des mesures et conserve un repli robuste.
- [x] Rapport: Présenter les sources privilégiées, les gains mesurés et les limites statistiques.

## Lisibilité mobile de la carte de température
- [x] Frontend: Empêcher le débordement à droite des températures maximale et minimale dans la carte principale du Dashboard.
- [x] Validation: Vérifier le rendu à largeur mobile sans dégrader l’affichage tablette et bureau.

## Aperçu des optimisations mobile
- [x] Validation: Produire un aperçu mobile du Dashboard et signaler les zones restantes à optimiser.

## Densité et hiérarchie du Dashboard mobile
- [x] Frontend: Compacter l’en-tête de la carte principale sur petits écrans sans réduire les zones tactiles.
- [x] Frontend: Hiérarchiser les détails secondaires de température et de régime pour limiter la hauteur de la carte mobile.
- [x] Frontend: Réduire l’espace avant les graphiques et préserver leur accès rapide sur mobile.
- [x] Validation: Vérifier la lisibilité mobile et l’absence de régression tablette et bureau.

## Actualisation de l’AI Lab
- [x] Audit: Identifier les modèles, scores, stations, régimes et explications obsolètes encore affichés dans l’AI Lab.
- [x] Backend: Exposer les traces et indicateurs réellement appliqués à la prévision officielle actuelle.
- [x] Frontend: Remplacer les sections obsolètes par une lecture mobile cohérente avec le Dashboard et Fiabilité.
- [x] Tests: Vérifier l’absence de modèle, station, score ou source simulé dans le contrat AI Lab.
- [x] Validation: Vérifier l’AI Lab sur mobile et publier la mise à jour.

## Audit transversal des pages
- [x] Audit: Cartographier les pages restantes, leurs appels tRPC et les données affichées.
- [x] Audit: Identifier les textes, compteurs, sources et algorithmes obsolètes ou non vérifiables.
- [x] Frontend: Corriger les vues affectées sans changer les calculs non concernés.
- [x] Tests: Couvrir les contrats corrigés et l’absence de valeurs héritées.
- [x] Validation: Vérifier les écrans mobile et publier les corrections retenues.

## Validation de préproduction
- [x] Validation: Exécuter TypeScript et la suite Vitest complète.
- [x] Validation: Contrôler l’unicité des modèles par date et lieu dans les données persistées.
- [x] Validation: Contrôler les parcours Rapport, Détails, Historique, Comparaison, Fiabilité et AI Lab.
- [x] Validation: Vérifier les rendus mobiles critiques et les états sans données.
- [x] Rapport: Documenter les résultats, les anomalies et les limites de validation Netatmo.

## Audit complet non destructif
- [x] Audit: Examiner l’architecture, les données, les calculs, les intégrations et les tâches planifiées sans modifier l’application.
- [x] Audit: Examiner les parcours, l’interface mobile et les erreurs d’exécution sans appliquer de correctif.
- [x] Rapport: Restituer les défaillances mesurées, leur impact, leurs preuves et les corrections proposées pour accord utilisateur.

## Corrections issues de l’audit
- [x] Sécurité: Mettre à niveau de manière contrôlée les dépendances présentant des vulnérabilités critiques ou élevées.
- [x] Backend: Borner les coordonnées géographiques dans toutes les procédures météo publiques.
- [x] Backend: Uniformiser les délais, les reprises bornées et les replis de fraîcheur des appels météo externes.
- [x] Frontend: Ajouter un état d’échec accessible et une relance contrôlée pour la carte des stations.
- [x] Exploitation: Vérifier et clarifier la source active des collectes planifiées sans interrompre les données utiles.
- [x] Tests: Couvrir les correctifs de sécurité, coordonnées, résilience réseau et état de carte indisponible.
- [x] Validation: Rejouer TypeScript, Vitest, l’audit de dépendances et les parcours affectés avant publication.

## Route Fiabilité mobile
- [x] Frontend: Rétablir le parcours `/reliability` vers la page Fiabilité et vérifier l’absence de page 404 sur mobile.

## Vérification de la page d’accueil
- [x] Audit: Examiner le Dashboard sur mobile et bureau pour identifier les ajustements justifiés.
- [x] Frontend: Appliquer les ajustements retenus sans modifier les données météo.
- [x] Validation: Vérifier les rendus de la page d’accueil après correction.

## Résilience et performance de l’accueil
- [x] Frontend: Afficher un état explicite lorsque la session MeteoAI est absente.
- [x] Frontend: Borner l’attente de prévision et proposer une action de relance lorsque les données restent indisponibles.
- [x] Performance: Charger les graphiques du Dashboard de manière différée sans modifier les données affichées.
- [x] Tests: Vérifier les états de session, d’expiration d’attente et le contrat de chargement différé.
- [x] Validation: Vérifier mobile, bureau, TypeScript et Vitest après amélioration de l’accueil.

## Lisibilité mobile de l’Historique
- [x] Frontend: Rendre la légende multi-modèles de l’Historique lisible sur mobile sans masquer les données.
- [x] Validation: Vérifier les graphiques Historique à 375 px avec plusieurs modèles présents.

## Idempotence des prévisions collectées
- [x] Backend: Empêcher l’insertion de doublons pour un même lieu, jour et modèle lors de collectes répétées.
- [x] Données: Dédupliquer prudemment les doublons historiques sans supprimer la dernière collecte.
- [x] Tests: Vérifier l’idempotence d’une collecte répétée et la sélection de la dernière collecte.

## Infobulle du statut capteur citoyen
- [x] Frontend: Ajouter une infobulle accessible expliquant le statut « CAPTEUR EN VALIDATION » dans la page Fiabilité.
- [x] Tests: Vérifier le contenu et l’accessibilité de l’aide contextuelle.

## Sources de stations absentes dans Fiabilité
- [x] Diagnostic: Identifier pourquoi les sources supplémentaires attendues ne sont plus visibles dans la page Fiabilité.
- [x] Frontend: Rétablir l’affichage des sources disponibles sans les présenter comme stations physiques validées.
- [x] Tests: Vérifier le nombre, le filtrage et la visibilité des sources retournées.

## Références de modèles et cohérence locale
- [x] Backend: Exposer les références de modèles comme références distinctes, sans les assimiler à des observations de station.
- [x] Backend: Calculer un indicateur de cohérence des références avec les stations physiques locales validées lorsqu’elles sont disponibles.
- [x] Frontend: Afficher les références de modèles avec leur cohérence, leur écart local et leurs limites explicites.
- [x] Tests: Vérifier l’exclusion des références de la vérité terrain et les replis sans station physique.

## Modale de transparence des sources
- [x] Frontend: Ouvrir une modale au clic sur une source affichant ses mesures brutes et sa provenance.
- [x] Frontend: Expliquer dans la modale la contribution réelle ou l’exclusion de la source du calcul local.
- [x] Tests: Vérifier la présence des données de transparence et les messages de garde-fou par type de source.

## Fonds illustrés du Dashboard selon la météo
- [x] Assets: Produire un ensemble cohérent de paysages météo, sans texte ni élément d’interface.
- [x] Frontend: Associer le fond de la carte Dashboard à la condition actuelle du lieu actif.
- [x] Cible: Appliquer le fond uniquement dans la grande carte de conditions actuelles, derrière les indicateurs météo.
- [x] Tests: Vérifier le mapping des conditions vers les fonds et la conservation de la lisibilité.

## Cohérence des modes Local et Ultra-local
- [x] Diagnostic: Identifier pourquoi les modes locaux divergent de la température officielle sans station physique validée.
- [x] Backend: Forcer le repli exact sur la température officielle lorsqu’aucune observation physique n’est qualifiée.
- [x] Frontend: Indiquer explicitement le repli officiel et masquer le micro-ajustement sans base station.
- [x] Tests: Vérifier l’égalité Standard / Local / Ultra-local à zéro station validée.

## Repli multi-modèles sans station physique
- [x] Audit: Identifier les références de modèles réelles disponibles au lieu et leurs poids de fusion officiels.
- [x] Backend: Utiliser la fusion officielle multi-modèles comme repli sans station physique, sans l’étiqueter comme station.
- [x] Frontend: Expliquer la source multi-modèles et ses contributions sans ambiguïté.
- [x] Tests: Vérifier le repli multi-modèles, la traçabilité et l’absence de micro-ajustement sans station.

## Audit général en lecture seule — en attente de validation
- [x] Audit: Cartographier les pages, composants, contrats et flux de données existants.
- [x] Audit: Distinguer observations réelles, prévisions, analyses/corrections et couches d’affichage.
- [x] Audit: Examiner les automatisations, calculs frontend/backend/IA, unités, temps et provenance.
- [x] Rapport: Qualifier les incohérences réelles, les duplications, les éléments corrects et les risques.
- [x] Rapport: Proposer une architecture cible et un plan de migration, sans appliquer de changement.

## Phase 1 — provenance et historisation vérifiables
- [x] Schéma: Ajouter une table additive d’exécutions de prévision avec émetteur, validité, provenance et payload.
- [x] Schéma: Ajouter une table additive d’observations qualifiées avec type de provenance explicite.
- [x] Backend: Conserver chaque émission de modèle sans modifier les prévisions ou poids actuellement affichés.
- [x] Backend: Empêcher les nouvelles pseudo-observations de devenir une vérité terrain ou un score opérationnel.
- [x] Tests: Vérifier la provenance, l’historisation des runs et l’absence de régression sur la fusion actuelle.

## Phase 2 — snapshot météo officiel central
- [x] Contrat: Définir un résultat officiel avec lieu, instant de validité, instant de calcul, provenance et type de donnée.
- [x] Backend: Centraliser la résolution de la température et des paramètres horaires officiels.
- [x] API: Raccorder le Dashboard et les prévisions détaillées au même snapshot lorsque le lieu et l’instant sont identiques.
- [x] Tests: Vérifier l’égalité des valeurs et de la provenance entre les vues pour un même lieu et instant.

## Phase 3 — scores hérités non qualifiés
- [x] Audit: Identifier chaque lecture de score ou de biais capable d’influencer une pondération opérationnelle.
- [x] Schéma: Marquer explicitement les scores comme qualifiés ou historiques non vérifiés.
- [x] Backend: Exclure les scores non qualifiés des poids, biais et corrections opérationnels.
- [x] Tests: Vérifier un repli transparent quand aucune observation physique qualifiée n’est disponible.

## Phase 4 — scoring par observation physique qualifiée
- [x] Contrat: Définir l’alignement temporel entre une émission de prévision et une observation physique.
- [x] Backend: Calculer des erreurs par modèle uniquement lorsque la couverture station satisfait les seuils de qualité.
- [x] Automatisation: Raccorder ce calcul idempotent à la collecte d’observations existante.
- [x] Tests: Vérifier les cas alignés, incomplets, trop anciens et sans station qualifiée.

## Phase 4A — snapshots physiques horaires
- [x] Schéma: Conserver des snapshots horaires idempotents des stations physiques par lieu.
- [x] Backend: Agréger une journée uniquement si la couverture et la fraîcheur respectent les seuils définis.
- [x] Automatisation: Ajouter un cycle Heartbeat horaire sans modifier les poids opérationnels.
- [x] Tests: Vérifier l’exclusion des capteurs candidats et l’idempotence des snapshots.

## Phase 4B — scoring uniquement sur preuves physiques
- [x] Backend: Lire les snapshots du jour et qualifier l’observation quotidienne selon la couverture définie.
- [x] Backend: Comparer les prévisions archivées alignées à cette observation physique et écrire des scores qualifiés.
- [x] Automatisation: Utiliser le cycle nocturne existant et signaler explicitement une couverture insuffisante.
- [x] Tests: Vérifier les scores qualifiés, l’absence de score sans couverture et l’idempotence nocturne.

## Phase 5 — transparence des preuves physiques
- [x] Backend: Exposer la couverture horaire physique et le dernier score qualifié par lieu.
- [x] Frontend: Afficher l’éligibilité du scoring et l’explication en cas de données insuffisantes.
- [x] Tests: Vérifier les états sans donnée, incomplet et qualifié de la page Fiabilité.

## Couverture physique effective
- [x] Diagnostic: Confirmer la couverture physique collectée et le motif d’une éventuelle absence de snapshot.
- [x] Recherche: Évaluer des fournisseurs d’observations physiques publics, compatibles et vérifiables autour des favoris.
- [x] Décision: Proposition d’intégration annulée par l’utilisateur ; aucune nouvelle source n’est ajoutée.

## Décision utilisateur — fusion locale
- [x] Décision: Ne pas réintroduire la fusion locale à partir de stations physiques, même après qualification et mesure de gain.

## Restauration des modes Local et Ultra-local
- [x] Frontend: Restaurer les sélecteurs Local et Ultra-local dans le Dashboard.
- [x] Backend: Vérifier que la température locale utilise uniquement les stations physiques qualifiées, pondérées par distance, fraîcheur, fiabilité, altitude et cohérence.
- [x] Frontend: Afficher la moyenne, les contributions station et le repli multi-modèles explicite.
- [x] Tests: Vérifier l’exclusion des capteurs candidats et les pondérations des stations qualifiées.

## Intégration Netatmo autorisée
- [x] OAuth: Vérifier les identifiants, le callback et le scope `read_station` Netatmo.
- [x] Backend: Collecter les stations Netatmo proches avec identifiant vérifiable, fraîcheur et filtrage d’anomalies.
- [x] Frontend: Présenter les stations Netatmo autorisées et leurs contributions locales.
- [x] Tests: Vérifier l’autorisation, la provenance `netatmo-*` et l’exclusion des données non authentifiées.

## Contrôle comparatif des modes météo
- [x] Validation: Comparer Officiel, Local et Ultra-local pour les mêmes coordonnées et le même instant.
- [x] Validation: Vérifier les stations, poids, repli et provenance retournés par chaque mode.

## Performance du chargement mobile
- [x] Audit: Identifier les routes et dépendances responsables du bundle initial trop volumineux.
- [x] Frontend: Charger les pages secondaires à la demande sans modifier la navigation ni les données.
- [x] Tests: Vérifier la disponibilité des routes différées et le chargement du Dashboard.

## Audit complet post-évolutions — lecture seule
- [x] Audit: Examiner architecture, routes, dépendances, pages et composants après les dernières évolutions.
- [x] Audit: Examiner sources, provenance, scores, automatisations, sécurité et performances.
- [x] Rapport: Qualifier les incohérences, risques, éléments validés et priorités de correction sans modifier l’application.

## Cohérence régime / nébulosité
- [x] Diagnostic: Comparer les instants et seuils utilisés par le régime, la condition actuelle et la nébulosité détaillée.
- [x] Backend: Aligner le régime courant sur la même échéance que la condition actuelle affichée.
- [x] Tests: Vérifier qu’une nébulosité très faible ne produit plus un régime partiellement nuageux au même instant.

## Cohérence des transitions météo
- [x] Audit: Comparer condition actuelle, régime actif et prochain changement pour le même créneau horaire.
- [x] Backend: Aligner les transitions futures sur la même normalisation horaire que le régime courant.
- [x] Tests: Vérifier les changements à venir avec heures au format compact et zéro initial.

## Décision utilisateur — nouvelles observations officielles
- [x] Décision: Ne pas intégrer Météo‑France ni aucune nouvelle source d’observations officielle pour l’audit ou le scoring.

## Simplification des modes locaux
- [x] Audit: Recenser les sélecteurs, calculs et libellés Local / Ultra-local encore actifs.
- [x] Frontend: Réduire les modes à une information de contexte sans divergence avec la prévision officielle.
- [x] Tests: Vérifier que la température officielle reste identique indépendamment du mode sélectionné.

## Correctif state OAuth Netatmo
- [x] Diagnostic: Identifier pourquoi le state OAuth est perdu entre l’autorisation et le callback.
- [x] Backend: Persister et valider le state OAuth de manière durable et à usage unique.
- [x] Tests: Vérifier le callback avec state valide, expiré et déjà utilisé.

## Diagnostic approfondi du callback Netatmo
- [x] Diagnostic: Corréler l’empreinte du state créée, stockée et reçue par le callback publié.
- [x] Backend: Corriger uniquement la cause vérifiée du rejet persistant.
- [x] Tests: Couvrir le scénario de callback consenti jusqu’à l’échange de jeton.

## Activation des stations Netatmo autorisées
- [x] Validation: Confirmer la persistance du refresh token chiffré et du scope `read_station` après consentement.
- [x] Backend: Tester la collecte Netatmo réelle autour des lieux favoris et tracer le résultat sans exposer de jeton.
- [x] Backend: Raccorder les observations Netatmo authentifiées au cycle de collecte existant avec provenance `netatmo-*`.
- [x] Frontend: Afficher les stations Netatmo authentifiées dans Fiabilité avec un badge de niveau 1.
- [x] Tests: Vérifier la provenance, l’absence de simulation et les états sans station proche.

## Correctif format getpublicdata Netatmo
- [x] Backend: Décoder la structure publique `measures` avec séries horodatées, vent et pluie.
- [x] Tests: Couvrir le mapping d’une réponse getpublicdata publique documentée.
- [x] Opérations: Persister une collecte ponctuelle des stations Netatmo authentifiées pour les favoris actuels.
- [x] Backend: Lire les stations par tolérance géographique afin d’éviter les écarts binaires de coordonnées flottantes.
- [x] Tests: Vérifier le retour des stations persistées pour les coordonnées de référence demandées.

## Décision utilisateur — sources personnelles
- [x] Décision: Conserver Netatmo comme seule source personnelle active ; archiver les alternatives sans intégration.

## Diagnostic intégral Netatmo Hondeghem — lecture seule
- [x] Audit: Vérifier une station Netatmo réelle, sa qualification, son admissibilité et sa contribution potentielle.
- [x] Audit: Vérifier son archivage d’observations et les prérequis du scoring futur.
- [x] Rapport: Restituer la chaîne complète sans modifier le code, les données ou les tâches.

## Solutions d’autorisation Netatmo pour le Dashboard — analyse
- [x] Analyse: Comparer les solutions de propagation sécurisée de l’identité OAuth au Dashboard.
- [x] Recommandation: Décrire le correctif, les tests et les garde-fous sans l’appliquer.

## Correctif Dashboard Netatmo proposé
- [x] Backend: Transmettre `ctx.user?.id` au collecteur Netatmo dans le parcours Dashboard, après accord explicite.
- [x] Tests: Vérifier session autorisée, session absente, absence de jeton et exclusion de tout identifiant client.

## Résilience Dashboard Netatmo
- [x] Backend: Utiliser les observations Netatmo persistées et encore fraîches lorsque getpublicdata est temporairement indisponible.
- [x] Collecte: Archiver les relevés physiques individuels à chaque snapshot horaire pour entretenir ce repli.
- [x] Tests: Vérifier le repli, le filtre géographique et l’exclusion des relevés expirés.

## Garde-fous Netatmo proposés
- [x] Temps: Rendre explicites les heures UTC et Europe/Paris dans les snapshots et la fiabilité.
- [x] Ultra-local: Exposer la preuve des contrôles altitude et stabilité, sans les présenter comme validés lorsqu’ils ne sont pas mesurés.
- [x] Autorisation: Exposer un état explicite connexion absente / temporairement indisponible sans divulguer de secret.
- [x] Scoring: Garantir que le cycle quotidien ne score qu’après la couverture physique minimale de 18 heures.

## Comparaison du document utilisateur — lecture seule
- [x] Analyse: Extraire les recommandations du document et les comparer aux mécanismes existants.
- [x] Rapport: Prioriser les évolutions utiles sans modifier le code, les données ni les tâches.

## Renforcement scientifique MeteoAI
- [x] Local/Ultra-local: Aligner les sources, exclusions et seuils de fraîcheur avec le mode réellement affiché.
- [x] Qualité stations: Créer un profil historique objectif de continuité, stabilité et données manquantes sans modifier les poids prématurément.
- [x] Qualité stations: Calculer une première fois les profils depuis les observations réellement archivées.
- [x] Confiance: Distinguer et expliquer les confiances observation locale, prévision officielle et régime.
- [x] Cohérence: Ajouter des contrôles automatisés entre les pages qui doivent partager un même snapshot.
- [x] Scoring: Étendre les métriques seulement lorsque les observations physiques qualifiées rendent la comparaison possible.

## Diagnostic écart officiel / Ultra-local — lecture seule
- [x] Audit: Comparer les valeurs, dates, sources et contributions des deux températures affichées.
- [x] Rapport: Expliquer l’écart et distinguer une différence de provenance légitime d’une éventuelle incohérence.

## Feuille de route Ultra-local — proposition
- [x] Analyse: Prioriser les garde-fous de dispersion, d’admissibilité et de communication de l’écart local/officiel.
- [x] Recommandation: Présenter les améliorations sans modifier les modes ni les pondérations.

## Date complète du Dashboard
- [x] Interface: Remplacer la date ISO par une date française complète dans le sélecteur Dashboard.
- [x] Tests: Vérifier le format de date affiché sans modifier la date métier sous-jacente.

## Transparence du régime et de la fusion
- [x] Interface: Ajouter un menu déroulant des régimes météo possibles avec régime actif mis en évidence.
- [x] Interface: Ajouter une vue explicative de « Fusion · AROME 13 % » et des pondérations de modèles disponibles.
- [x] Tests: Vérifier les deux interactions de transparence sans modifier les calculs de régime ou de fusion.

## Design du menu de régimes
- [x] Interface: Affiner le menu déroulant des régimes pour une intégration mobile plus fluide à la carte Tendance.
- [x] Tests: Préserver le catalogue, le régime actif et l’accessibilité du menu après la retouche visuelle.

## Catalogue complet des régimes
- [x] Interface: Supprimer le défilement interne et afficher tous les régimes ouverts dans la page.
- [x] Interface: Afficher les pondérations température, pluie, vent et conditions pour chaque régime.
- [x] Tests: Vérifier que chaque régime conserve ses pondérations et reste visible sans défilement interne.

## Régimes repliables individuellement
- [x] Interface: Permettre d’ouvrir et refermer les pondérations de chaque régime séparément.
- [x] Tests: Vérifier l’état accessible ouvert/replié sans modifier le régime actif ni son catalogue.

## Robustesse du menu de régimes
- [x] Correctif: Empêcher une pondération manquante de provoquer une erreur au déploiement d’un régime.
- [x] Tests: Couvrir explicitement un régime sans objet `weights` complet.

## Pondérations visuelles des régimes
- [x] Backend: Fournir les pondérations complètes du catalogue de régimes dans le contrat Dashboard.
- [x] Interface: Afficher des barres de progression pour chaque pondération de régime.
- [x] Interface: Ajouter un bouton global pour tout développer ou tout réduire.
- [x] Tests: Vérifier les poids complets, les barres et les deux états globaux du catalogue.

## Graphiques horaires et prévisions
- [x] Interface: Afficher les échelles température, vent et pluie à gauche des deux graphiques.
- [x] Interface: Rendre la courbe de ressenti continue et visuellement distincte de la température.
- [x] Interface: Afficher température et ressenti pour chaque heure dans le graphique horaire.
- [x] Tests: Vérifier les séries, échelles et libellés sans modifier les données météo.

## Graduations simplifiées des graphiques
- [x] Interface: Afficher une échelle de température arrondie par pas de 5 °C.
- [x] Interface: Présenter seulement les unités km/h et mm sur les échelles vent et pluie.
- [x] Interface: Afficher les degrés en blanc, le vent en vert et la pluie en bleu sur les échelles.
- [x] Tests: Vérifier les graduations de 5 °C et les unités compactes sur les deux graphiques.

## Échelles thermiques dynamiques de 10 °C
- [x] Interface: Utiliser des graduations de température de 10 °C sur les deux graphiques.
- [x] Interface: Étendre automatiquement les échelles aux températures négatives.
- [x] Tests: Vérifier des plages strictement positives et des plages franchissant 0 °C.

## Vérification isolée de gel
- [x] Tests: Simuler des plages négatives dans les tests de graphique sans injecter de données météo applicatives.

## Allègement de l’en-tête Dashboard
- [x] Interface: Retirer l’en-tête de marque MeteoAI du Dashboard sans supprimer la navigation.
- [x] Tests: Vérifier que le contenu et les raccourcis de navigation restent accessibles sans l’en-tête.

## Ergonomie mobile des pages longues
- [x] Interface: Réduire l’espace supérieur restant du Dashboard sur mobile.
- [x] Interface: Ajouter un retour au début accessible sur Fiabilité et Historique.
- [x] Interface: Harmoniser les marges mobiles de Fiabilité et Historique.
- [x] Tests: Vérifier les espacements et la disponibilité du retour au début sur les pages longues.

## Reconstruction complète fidèle de MeteoAI
- [x] Audit: Inventorier toutes les pages, les routes, les composants réutilisés, les états de chargement et les parcours mobile/desktop.
- [x] Audit: Cartographier les sources de données, les contrats tRPC, les calculs frontend/backend et les graphiques sans les modifier.
- [x] Design system: Formaliser les tokens, proportions, typographies, surfaces, gradients, rayons, icônes et états déjà utilisés par MeteoAI.
- [x] Architecture: Définir la cible par composants et l’ordre de migration conservant exactement le rendu actuel.
- [x] Plan: Définir les lots de migration, leurs garanties de non-régression et les comparaisons obligatoires.
- [x] Reconstruction: Centraliser progressivement les primitives et composants partagés sans modifier les données, les calculs ni les parcours.
- [x] Reconstruction: Recomposer les pages avec un rendu visuellement équivalent et des contrats de données inchangés.
- [x] Correction responsive: Préserver la lisibilité des tableaux de l’Historique en largeur tablette et mobile sans supprimer de métrique.
- [x] Validation: Comparer chaque page sur mobile, tablette et bureau ; vérifier navigation, graphiques, états et données Netatmo.
- [x] Publication: Documenter les écarts résolus, les garanties de non-régression et publier la reconstruction validée.

## Collecte quotidienne des prévisions et observations
- [x] Audit: Vérifier les tâches actives, leurs horaires et les derniers résultats de collecte.
- [x] Périmètre: Confirmer que la collecte de 05h00 couvre les prévisions horaires de tous les modèles configurés pour chaque lieu favori.
- [x] Périmètre: Maintenir les relevés de stations comme observations distinctes, avec leur propre fraîcheur et leur cycle adapté.
- [x] Validation: Contrôler les cycles actifs, les derniers bilans archivés et les sources/stats de couverture.

## Graphiques pleine largeur sur mobile
- [x] Audit: Repérer les cadres et marges qui contraignent la largeur disponible des graphiques.
- [x] Interface: Étendre les graphiques horaire et quinze jours à la largeur mobile utile sans toucher au canvas.
- [x] Validation: Vérifier le défilement, les clics, les courbes et la lisibilité sur mobile, tablette et bureau.

## Relief 3D des graphiques
- [x] Audit: Identifier les surfaces et contours des cadres horaire et quinze jours à enrichir.
- [x] Interface: Appliquer un relief 3D bleu discret aux deux cadres sans modifier les composants Canvas.
- [x] Validation: Vérifier le contraste, la profondeur et les interactions à toutes les tailles.

## Fond plus neutre des graphiques
- [x] Audit: Identifier les couches bleues du fond 3D à atténuer.
- [x] Interface: Assombrir légèrement le fond des deux graphiques sans modifier leurs contours lumineux.
- [x] Validation: Vérifier le contraste des libellés, courbes et données à toutes les tailles.

## Alignement des graphiques et halo
- [x] Audit: Identifier la marge des cartes locales à répliquer et les sources du halo à réduire.
- [x] Interface: Aligner la largeur mobile des graphiques sur les cartes locales et atténuer leur halo.
- [x] Validation: Vérifier l’alignement, la lisibilité et les interactions à toutes les tailles.

## Finition des coins de graphiques
- [x] Audit: Identifier les rayons et bordures imbriqués à l’origine du défaut visible.
- [x] Interface: Uniformiser les coins arrondis et le raccord des deux cadres de graphiques.
- [x] Validation: Vérifier les contours aux différentes tailles sans modifier les graphiques Canvas.

## Coins inférieurs des graphiques
- [x] Audit: Identifier les rayons du cadre 3D et de la zone de tracé à modifier.
- [x] Interface: Conserver le haut rectiligne et arrondir uniquement les coins inférieurs des deux graphiques.
- [x] Validation: Vérifier les contours et les interactions aux différentes tailles.

## Diagnostic de la collecte de 05h00
- [x] Audit: Vérifier les tâches actives, leurs journaux d’exécution et le dernier bilan archivé.
- [x] Diagnostic: Comparer la collecte attendue aux prévisions, traces de pondération et snapshots AI Lab disponibles.
- [x] Correction: Remplacer le job dont le cookie cron était refusé par une tâche active avec autorisation fraîche, sans simuler de prévision ni de trace.
- [x] Validation: Confirmer l’exécution, la persistance et l’affichage du snapshot après correction.

## Évaluation de modèles supplémentaires
- [x] Audit: Recenser les modèles réellement exploités et les horizons où la couverture peut gagner en indépendance.
- [x] Recherche: Vérifier les modèles additionnels accessibles, leurs sources officielles et leur disponibilité pour le nord de la France.
- [x] Comparaison: Évaluer la valeur ajoutée, la redondance et la compatibilité avec le scoring existant.
- [x] Recommandation: Présenter des options graduées sans intégrer de nouveau modèle avant validation.

## Intégration contrôlée des modèles de référence
- [x] Audit: Réconcilier les douze modèles de la référence avec les sources et collectes actuelles.
- [x] Architecture: Définir le stockage séparé des sorties déterministes et probabilistes en mode observation.
- [x] Collecte: Ajouter les modèles localement disponibles au cycle horaire et quotidien sans leur attribuer de poids.
- [x] Transparence: Exposer leur statut « en validation » et leur couverture sans les présenter comme une fusion active.
- [x] Validation opérationnelle: Vérifier l’archivage réel de DMI HARMONIE-DINI et ICON-D2, l’affichage séparé et l’absence de candidats dans la prévision officielle.

## Repère de l’heure actuelle
- [x] Audit: Distinguer la surface de colonne Canvas du carré de l’en-tête horaire.
- [x] Interface: Retirer uniquement le carré bleu de l’en-tête et conserver la colonne actuelle en surbrillance.
- [x] Validation: Vérifier le repère de l’heure actuelle et les interactions du graphique.

## Lisibilité du graphique horaire
- [x] Audit: Identifier les tailles de température et les emplacements disponibles pour vitesse, unité et cap de vent.
- [x] Interface: Agrandir les températures et afficher « km/h » puis le cap cardinal sous chaque vent.
- [x] Validation: Vérifier la lisibilité mobile, l’absence de chevauchement et les interactions.

## Lisibilité du graphique quinze jours
- [x] Audit: Identifier les tailles de température et l’emplacement des données de vent.
- [x] Interface: Agrandir les températures et afficher « km/h » puis le cap cardinal par jour.
- [x] Validation: Vérifier la lisibilité, le non-chevauchement et les interactions.

## Lisibilité des précipitations
- [x] Audit: Identifier les tailles et emplacements des valeurs en millimètres sur les deux graphiques.
- [x] Interface: Agrandir les valeurs de précipitations sans modifier les barres ni les échelles.
- [x] Validation: Vérifier la lisibilité et le non-chevauchement à toutes les tailles.

## Valeurs de pluie au-dessus des barres
- [x] Audit: Identifier la position du texte et la hauteur réelle de chaque barre sur les deux graphiques.
- [x] Interface: Positionner les valeurs de précipitations juste au-dessus de leurs barres bleues.
- [x] Validation: Vérifier la visibilité des valeurs quelle que soit la hauteur de pluie.

## Valeurs de pluie nulles
- [x] Audit: Identifier la position dédiée aux valeurs 0,0 mm sur les deux graphiques.
- [x] Interface: Placer les valeurs nulles en bas de la zone de précipitation.
- [x] Validation: Vérifier la séparation entre valeurs nulles et valeurs au-dessus des barres.

## Libellés de température ressentie
- [x] Audit: Identifier les positions actuelles des libellés de température et ressenti.
- [x] Interface: Placer les valeurs de ressenti sous la courbe bleue.
- [x] Validation: Vérifier la lisibilité et l’absence de chevauchement avec les courbes.

## Taille des libellés de ressenti
- [x] Audit: Identifier la taille actuelle des valeurs de ressenti.
- [x] Interface: Agrandir légèrement les valeurs de ressenti sous la courbe bleue.
- [x] Validation: Vérifier la lisibilité et le non-chevauchement avec le vent.

## Laboratoire de fiabilité météo
- [x] Spécification: Analyser l’intégralité des exigences fonctionnelles et les limites des données réelles.
- [x] Audit: Inventorier les données archivées, les scores existants et les calculs de fiabilité réutilisables.
- [x] Configuration: Centraliser les pondérations du score normalisé et les seuils de confiance statistique.
- [x] Backend: Exposer les agrégats du laboratoire sans créer de moteur de scoring parallèle.
- [x] Interface: Créer la page responsive avec filtres de lieu, période et horizon.
- [x] Interface: Afficher les KPI, tableaux et graphiques à partir de données réellement disponibles.
- [x] Interface: Prévoir les états « Données insuffisantes » pour chaque analyse non qualifiable.
- [x] Navigation: Ajouter la route et l’accès au Laboratoire de fiabilité.
- [x] Tests: Couvrir les calculs, seuils et contrats tRPC du laboratoire.
- [x] Validation: Vérifier le rendu mobile, TypeScript, les tests et le build avant publication.

## Panneau des stations locales réelles
- [x] Interface: Afficher uniquement la première station locale réelle par défaut.
- [x] Interface: Ajouter une flèche vers le bas pour développer ou replier les autres stations.
- [x] Validation: Vérifier le comportement, l’accessibilité et la lisibilité mobile.

## Panneau des références de modèles
- [x] Interface: Afficher uniquement la première référence de modèle par défaut.
- [x] Interface: Ajouter une flèche vers le bas pour développer ou replier les autres références.
- [x] Validation: Vérifier le comportement, l’accessibilité et la lisibilité mobile.

## Volet de prévision détaillée mobile
- [x] Interface: Afficher la prévision sélectionnée dans un volet pleinement visible au clic sur un jour.
- [x] Interface: Préserver une fermeture claire et les détails météo sans exiger de défilement de page.
- [x] Validation: Vérifier le comportement mobile, TypeScript, tests et build.

## Détails au-dessus des graphiques
- [x] Interface: Afficher les détails du jour sélectionné au-dessus du graphique de prévisions.
- [x] Interface: Afficher les détails de l’heure sélectionnée au-dessus du graphique heure par heure.
- [x] Interface: Préserver les données détaillées et une fermeture claire sans défilement de page.
- [x] Validation: Vérifier les deux graphiques, TypeScript, tests et build.

## Détails horaires complets du Dashboard
- [x] Audit: Vérifier les paramètres horaires réellement fournis au graphique et leurs unités.
- [x] Données: Exposer uniquement les paramètres supplémentaires réellement disponibles pour chaque heure.
- [x] Interface: Afficher ces paramètres dans le panneau de détail horaire au-dessus du graphique.
- [x] Validation: Vérifier les données manquantes, TypeScript, tests, rendu mobile et build.

## Indicateurs horaires complémentaires du Dashboard
- [x] Audit: Identifier les tendances et indicateurs calculables à partir des mesures horaires officielles.
- [x] Calcul: Définir des indicateurs transparents sans donnée artificielle ni nouvelle source.
- [x] Interface: Ajouter les informations complémentaires au panneau horaire développé.
- [x] Validation: Couvrir les cas de données absentes, vérifier le rendu mobile, TypeScript, tests et build.

## Refonte de la page Historique
- [x] Audit: Identifier les données, onglets et graphiques actuels qui réduisent la lisibilité mobile.
- [x] Interface: Recomposer l’en-tête, les filtres et la hiérarchie de comparaison.
- [x] Graphiques: Remplacer les comparaisons surchargées par une lecture mobile sans chevauchement.
- [x] Interface: Ajouter des tableaux ou listes de valeurs détaillées accessibles en complément des graphiques.
- [x] Validation: Vérifier les données réelles, le rendu mobile, TypeScript, tests et build.

## Infobulles interactives de l’Historique
- [x] Audit: Identifier les séries et unités à présenter au survol de chaque graphique.
- [x] Interface: Créer une infobulle réutilisable, compacte et accessible sur mobile.
- [x] Graphiques: Raccorder l’infobulle aux comparaisons de température, pluie, vent et scores.
- [x] Validation: Vérifier les valeurs, l’interaction tactile, TypeScript, tests et build.

## Histogrammes de température Historique
- [x] Interface: Remplacer le graphique des températures maximales par un histogramme comparatif.
- [x] Interface: Remplacer le graphique des températures minimales par un histogramme comparatif.
- [x] Interaction: Conserver les infobulles de valeurs au survol et au toucher.
- [x] Validation: Vérifier les séries, le rendu mobile, TypeScript, tests et build.

## Panneaux quotidiens Historique plus compréhensibles
- [x] Interface: Mettre en avant l’observation, la synthèse MeteoAI et l’écart réellement mesuré.
- [x] Interface: Regrouper les informations secondaires sans répéter inutilement les libellés.
- [x] Interface: Rendre explicite l’absence d’observation ou d’information météo.
- [x] Validation: Vérifier la lisibilité mobile, TypeScript, tests et build.

## Palette et légende des histogrammes Historique
- [x] Design: Différencier nettement observation, MeteoAI et modèle sélectionné par la couleur.
- [x] Interface: Clarifier le rôle de chaque couleur dans la légende des histogrammes.
- [x] Validation: Vérifier le contraste mobile, TypeScript, tests et build.

## Ordre des métriques de la carte principale
- [x] Interface: Placer Vent max à l’emplacement haut de la grille de métriques.
- [x] Interface: Placer Confiance prévision à l’emplacement bas de la grille de métriques.
- [x] Validation: Vérifier le rendu mobile, TypeScript, tests et build.

## Ancrage de l’heure actuelle dans le graphique horaire
- [x] Interface: Positionner l’heure actuelle au début de la zone visible au chargement.
- [x] Interface: Réappliquer l’ancrage lors d’un changement de prévisions ou de lieu.
- [x] Validation: Vérifier le défilement, TypeScript, tests et build.

## Zone d’alerte du graphique journalier
- [x] Interface: Réserver une zone spécifique aux alertes météo dans l’en-tête du graphique.
- [x] Interface: Préserver les libellés de date et « Aujourd’hui » sans chevauchement.
- [x] Validation: Vérifier le rendu mobile, TypeScript, tests et build.

## Diagnostic des comparaisons historiques en attente
- [x] Audit: Vérifier les archives de prévisions et d’observations nécessaires à Meteoblue.
- [x] Rapport: Expliquer les causes précises des comparaisons en attente et leur résolution naturelle.

## Libellé de la carte principale
- [x] Interface: Retirer « Prévision officielle consolidée » sous la température principale.
- [x] Validation: Vérifier la carte mobile, TypeScript, tests et build.

## Lisibilité des graphiques horaire et journalier
- [x] Audit: Vérifier les zones de température ressentie, vent, pluie et alertes des deux graphiques.
- [x] Interface: Maintenir les ressentis sous leur courbe avec une marge de sécurité.
- [x] Interface: Réserver des zones distinctes pour températures, vent et précipitations.
- [x] Validation: Tester les données denses, les températures extrêmes, TypeScript, tests et build.

## Rétablissement du dessin du graphique horaire
- [x] Diagnostic: Identifier l’interruption du cycle de dessin du Canvas sur mobile.
- [x] Interface: Rétablir le tracé des températures, ressentis, vent et précipitations sur fond sombre.
- [x] Validation: Vérifier les données visibles, TypeScript, tests et build.

## Valeurs de température sous le ressenti
- [x] Audit: Vérifier les positions de la courbe bleue et des libellés de température.
- [x] Interface: Placer chaque valeur de température juste sous la courbe de ressenti.
- [x] Validation: Vérifier les courbes proches, TypeScript, tests et build.

## Séparation renforcée température et ressenti
- [x] Audit: Identifier les configurations où les deux courbes sont trop proches.
- [x] Interface: Réserver des décalages distincts pour les libellés orange et bleus.
- [x] Validation: Vérifier les écarts faibles, TypeScript, tests et build.

## Libellés de température simplifiés
- [x] Interface: Retirer les préfixes T et R des valeurs des deux courbes.
- [x] Validation: Vérifier la séparation par couleur et position, TypeScript, tests et build.

## Chargement initial et données horaires
- [x] Diagnostic: Mesurer les requêtes de démarrage et la cause des données horaires indisponibles.
- [x] Données: Mettre en place une reprise contrôlée sans inventer de prévision.
- [x] Interface: Rendre le chargement et les indisponibilités explicites et non bloquants.
- [x] Validation: Vérifier le démarrage, TypeScript, tests et build.

## Fermeture rapide des panneaux météo
- [x] Audit: Vérifier les commandes de fermeture des détails journalier et horaire.
- [x] Interface: Agrandir et expliciter la zone de fermeture sur mobile.
- [x] Validation: Vérifier les interactions tactiles, TypeScript, tests et build.

## Flèche de retour rapide du Dashboard
- [x] Interface: Ajouter la flèche de retour vers le haut au Dashboard.
- [x] Validation: Vérifier le comportement mobile, TypeScript, tests et build.

## Diagnostic des heures officielles indisponibles
- [x] Audit: Vérifier le snapshot horaire officiel, les erreurs récentes et les reprises.
- [x] Rapport: Expliquer la cause réelle et la disponibilité attendue sans modifier les données.

## Badge de collecte de la page Stations
- [x] Interface: Moderniser le badge « Collecte 05:00 Paris » en conservant son information.
- [x] Validation: Vérifier le rendu mobile, TypeScript, test ciblé et build ; la suite complète conserve deux échecs intermittents antérieurs liés aux snapshots météo dynamiques.

## Harmonisation des badges de synthèse et statut
- [x] Audit: Recenser les badges de synthèse, confiance et statut dans les pages météo.
- [x] Interface: Créer une primitive de badge réutilisable, avec variantes sémantiques.
- [x] Interface: Appliquer le nouveau langage visuel aux badges pertinents des différentes pages.
- [x] Validation: Vérifier les rendus mobiles, TypeScript, 210 tests et build.

## Correctif d’intégration et aide des badges
- [x] Audit: Identifier les badges coupés ou trop volumineux sur mobile.
- [x] Interface: Adapter la primitive de badge aux contraintes de largeur mobile.
- [x] Interface: Ajouter des infobulles explicatives aux badges de statut et de confiance.
- [x] Validation: Vérifier les rendus mobiles, TypeScript, 210 tests et build.

## Fonds de cartes en dégradé
- [x] Audit: Identifier les primitives et cartes partagées entre les pages météo.
- [x] Interface: Définir des dégradés réutilisables, sombres et compatibles avec les états sémantiques.
- [x] Interface: Appliquer ce traitement aux cartes principales des pages météo.
- [x] Validation: Vérifier la lisibilité mobile, TypeScript, 210 tests et build.

## Ajustement des dégradés de cartes
- [x] Interface: Atténuer l’opacité et les lueurs des dégradés de surface.
- [x] Validation: Vérifier la lisibilité mobile, TypeScript, 210 tests et build.

## Collecte quotidienne des prévisions et stations
- [x] Audit: Vérifier le cycle actif de 05h00 Paris et sa couverture réelle des modèles et stations.
- [x] Automatisation: Garantir l’exécution à 05h00 Paris en heure d’été comme en heure d’hiver.
- [x] Automatisation: Compléter le périmètre de collecte si un modèle actif ou une station admissible manque.
- [x] Validation: Vérifier le prochain passage planifié et le statut des collectes.

## Simplification du panneau détaillé horaire
- [x] Interface: Retirer les sections « Régime opérationnel » et « Évolution à court terme ».
- [x] Validation: Vérifier le panneau sur mobile, TypeScript, 210 tests et build.

## Qualité de l’air, soleil et lune
- [x] Audit: Identifier les sources existantes ou gratuites pour l’air et les éphémérides du lieu actif.
- [x] Données: Exposer une réponse environnementale réelle via le serveur.
- [x] Interface: Ajouter les panneaux Qualité de l’air et Soleil & Lune sous les graphiques du Dashboard.
- [x] Validation: Vérifier les données réelles, le rendu mobile, TypeScript, 214 tests et build.

## Synthèse de la page Fiabilité
- [x] Audit: Identifier les métriques essentielles et les détails techniques redondants sur mobile.
- [x] Interface: Mettre en avant un résumé explicite de la disponibilité et de la qualité des comparaisons.
- [x] Interface: Masquer les détails non exploitables ou les réserver à une consultation volontaire.
- [x] Validation: Vérifier le rendu mobile, TypeScript et build ; 214 tests passent, avec 2 échecs intermittents préexistants liés aux snapshots météo réels.

## Détails des panneaux environnementaux
- [x] Audit: Vérifier le composant modal réutilisable et les données disponibles.
- [x] Interface: Rendre les panneaux Qualité de l’air et Soleil & Lune cliquables.
- [x] Interface: Afficher les détails et la provenance dans deux modales accessibles.
- [x] Validation: Vérifier le comportement mobile, TypeScript et build ; 215 tests passent, avec 2 échecs intermittents préexistants liés aux snapshots météo réels.

## Icônes météo 3D futuristes
- [x] Audit: Recenser les variantes de MeteoIcon et leurs contextes d’affichage.
- [x] Interface: Ajouter un traitement 3D lumineux cohérent à la bibliothèque d’icônes météo.
- [x] Validation: Vérifier les rendus sur les pages principales, TypeScript, 219 tests et build.

## Remplacement complet des icônes météo
- [x] Direction: Définir le nouveau langage de formes 3D futuristes et les correspondances sémantiques.
- [x] Interface: Reconstruire les icônes de conditions météo, paramètres et indicateurs.
- [x] Validation: Vérifier les rendus multi-pages, TypeScript, 219 tests et build.

## Alternative de design pour les icônes météo
- [x] Direction: Définir une esthétique futuriste alternative, distincte de la version volumétrique actuelle.
- [x] Interface: Refondre la bibliothèque MeteoIcon avec ce nouveau langage graphique.
- [x] Validation: Vérifier les rendus multi-pages, TypeScript, 219 tests et build.

## Alternative verre dépoli des icônes météo
- [x] Direction: Définir une esthétique lumineuse et organique, distincte des tuiles holographiques.
- [x] Interface: Refondre la bibliothèque MeteoIcon avec le traitement verre dépoli.
- [x] Validation: Vérifier les rendus multi-pages, TypeScript, 219 tests et build.

## Icônes 3D illustrées inspirées de la référence
- [x] Direction: Définir les volumes doux, matériaux et silhouettes des phénomènes météo.
- [x] Interface: Refondre les conditions météo, paramètres et indicateurs dans le style 3D illustré.
- [x] Validation: Vérifier les rendus multi-pages, TypeScript, 219 tests et build.

## Pack d’icônes 3D pictural
- [x] Direction: Définir les conditions prioritaires et les règles de rendu du pack 3D de référence.
- [x] Actifs: Produire des icônes originales 3D picturales pour les conditions météo principales.
- [x] Interface: Intégrer les actifs au composant MeteoIcon et conserver les correspondances existantes.
- [x] Validation: Vérifier les pages, TypeScript, 219 tests et build.

## Pack de ciels météo pour la carte principale
- [x] Direction: Définir les catégories de ciel et la correspondance avec les conditions météo courantes.
- [x] Actifs: Produire des fonds de ciel météo originaux adaptés aux catégories principales.
- [x] Interface: Intégrer le fond de ciel dynamique à la carte principale sans réduire la lisibilité.
- [x] Validation: Vérifier les états météo, TypeScript, 219 tests et build.

## Animations des icônes météo
- [x] Audit: Identifier les conditions picturales animables et les contraintes d’accessibilité.
- [x] Interface: Ajouter des animations CSS discrètes, conditionnelles et compatibles avec la réduction de mouvement.
- [x] Validation: Vérifier les rendus, TypeScript, 219 tests et build.

## Lisibilité des libellés de la carte principale
- [x] Interface: Agrandir « Ciel couvert actuellement » et le badge « Fusion · 8 modèles ».
- [x] Validation: Vérifier le rendu mobile, TypeScript, 219 tests et build.

## Date et compactage de la pancarte principale
- [x] Interface: Afficher la date du jour dans la pancarte de la carte principale.
- [x] Interface: Réduire la hauteur de la zone Ciel couvert et Fusion des modèles.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Position explicite de la date dans la pancarte
- [x] Interface: Déplacer la date vers une position immédiatement visible dans l’en-tête de la pancarte.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Hiérarchie de la date et des températures extrêmes
- [x] Interface: Retirer la date affichée au-dessus de la carte principale.
- [x] Interface: Agrandir la date intégrée à la pancarte principale.
- [x] Interface: Accentuer les températures Max et Min.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Allégement de l’en-tête du Dashboard
- [x] Interface: Retirer le bloc MeteoAI et Hondeghem au-dessus des favoris.
- [x] Interface: Resserer l’espacement supérieur après le retrait du bloc.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Date centrée dans la pancarte
- [x] Interface: Retirer le bouton Actualiser de la pancarte principale.
- [x] Interface: Centrer et agrandir légèrement la date dans l’en-tête de pancarte.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Couleurs des températures extrêmes
- [x] Interface: Retirer la mention Tendance de la pancarte principale.
- [x] Interface: Renforcer les couleurs des températures Max et Min à droite.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Opacité des températures Max et Min
- [x] Interface: Rendre les fonds orange et bleu des capsules Max et Min plus opaques.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 220 tests et build.

## Intensité adaptative des températures extrêmes
- [x] Règles: Définir les seuils de chaleur et de gel utilisés pour les capsules Max et Min.
- [x] Interface: Appliquer automatiquement la palette et l’intensité adaptées aux seuils.
- [x] Validation: Couvrir les seuils par des tests et vérifier le rendu mobile, TypeScript et build.

## Compactage vertical de la pancarte principale
- [x] Audit: Identifier les espacements verticaux à réduire sans retirer d’information utile.
- [x] Interface: Ne pas appliquer le compactage vertical demandé, conformément à l’annulation utilisateur.
- [x] Validation: Vérifier le rétablissement intégral des espacements précédents.

## Annulation du compactage vertical
- [x] Décision: Conserver les espacements verticaux actuels de la pancarte principale.

## Ligne régime et fusion harmonisée
- [x] Interface: Afficher le régime et la fusion des modèles sur une même ligne mobile.
- [x] Interface: Conserver les pondérations sous cette ligne avec un ordre visuel clair.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 223 tests et build.

## Transparence de fusion dans AI Lab
- [x] Audit: Identifier les données de fusion disponibles pour AI Lab.
- [x] Interface: Retirer la fusion de modèles du Dashboard.
- [x] Interface: Ajouter dans AI Lab un panneau détaillé de modèle principal, poids, méthode et sources.
- [x] Validation: Vérifier Dashboard et AI Lab, TypeScript, 224 tests et build.

## Capsules dégradées et graphique horaire simplifié
- [x] Audit: Identifier les dégradés Max-Min et le tracé de ressenti du graphique horaire.
- [x] Interface: Renforcer le dégradé de gauche à droite des capsules Max et Min.
- [x] Interface: Retirer la courbe et les chiffres de ressenti du graphique horaire.
- [x] Interface: Harmoniser les espaces et la légende du graphique après le retrait.
- [x] Validation: Vérifier le rendu mobile, TypeScript, 225 tests et build.

## Netteté des surfaces et capsules
- [x] Audit: Recenser les halos diffus décoratifs dans les composants et pages météo.
- [x] Interface: Remplacer les halos décoratifs par des bordures, dégradés et ombres nettes.
- [x] Validation: Vérifier la netteté mobile, TypeScript, tests et build.

## Stabilisation navigation mobile et chargements
- [x] Audit: Reproduire les transitions de pages, l’empilement de la barre mobile et les indisponibilités de données horaires.
- [x] Interface: Stabiliser le routage, les couches fixes et les états de chargement sur mobile.
- [x] Données: Fiabiliser les requêtes horaires et leur relance sans masquer les données journalières disponibles.
- [x] Validation: Vérifier les parcours mobile, TypeScript, Vitest et build.

## Simplification du ressenti du graphique journalier
- [x] Audit: Identifier les chiffres et la légende « Ressenti » du graphique Températures & Météo.
- [x] Interface: Retirer le ressenti visuel en conservant Max/Min, vent et pluie.
- [x] Validation: Vérifier TypeScript, Vitest, build et le rendu mobile.

## Refonte visuelle de la page Prévisions détaillées
- [x] Audit: Identifier les écarts de style avec le Dashboard, les graphiques et les autres pages MeteoAI.
- [x] Interface: Recomposer l’en-tête, les cartes horaires, les contrôles et les graphiques dans le style sombre net cohérent.
- [x] Mobile: Préserver la zone sûre de la barre basse, le défilement horizontal des heures et la lisibilité tactile.
- [x] Validation: Vérifier les parcours mobiles, TypeScript, Vitest et build.

## Collecte quotidienne des prévisions et stations
- [x] Audit: Vérifier le déclencheur 05h00, la liste des modèles, les stations actives et les archives créées.
- [x] Collecte: Enregistrer les prévisions horaires et journalières de tous les modèles actifs pour chaque lieu favori.
- [x] Stations: Archiver les relevés réellement disponibles des stations physiques, avec statut explicite si une source ne répond pas.
- [x] Fiabilité: Vérifier l’idempotence, les garde-fous de date et la traçabilité de chaque exécution.
- [x] Validation: Tester, contrôler les journaux du planificateur et publier la collecte renforcée.

## Lisibilité horaire des prévisions détaillées
- [x] Audit: Identifier les données horaires fiables déjà présentes dans les cartes et le graphique.
- [x] Interface: Agrandir les cartes horaires, leurs libellés et leurs mesures principales pour le mobile.
- [x] Graphique: Afficher les détails disponibles par heure sans inventer ni surcharger les données.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Correction du ruban de détails horaires
- [x] Audit: Identifier le débordement mobile des cartes sous le graphique.
- [x] Interface: Recomposer le ruban dans un défilement horizontal propre et non tronqué.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Repère immédiat de l’heure actuelle dans le graphique
- [x] Audit: Identifier le cadrage et le repère actuel dans le graphique horaire détaillé.
- [x] Interface: Afficher l’heure actuelle avec un libellé visible dès l’ouverture du graphique.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Synchronisation du ruban horaire avec l’heure actuelle
- [x] Audit: Identifier le défilement indépendant du ruban de cartes sous le graphique.
- [x] Interface: Cadrer automatiquement la carte de l’heure actuelle avec son repère visible.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Synchronisation dynamique graphique et cartes horaires
- [x] Audit: Identifier les plages de défilement du graphique et du ruban de cartes.
- [x] Interface: Synchroniser en continu le geste horizontal du graphique avec le ruban sans boucle d’événements.
- [x] Validation: Vérifier le geste mobile, TypeScript, Vitest et build.

## Synchronisation bidirectionnelle graphique et cartes
- [x] Audit: Vérifier la synchronisation existante et les protections contre les boucles d’événements.
- [x] Interface: Synchroniser le geste horizontal des cartes vers le graphique.
- [x] Validation: Vérifier le geste mobile dans les deux sens, TypeScript, Vitest et build.

## Lisibilité des libellés supérieurs du graphique
- [x] Audit: Identifier le recouvrement des valeurs et du repère de l’heure actuelle.
- [x] Interface: Réserver des positions de libellés lisibles au-dessus des points du graphique.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Tracé complet du lever et coucher du soleil
- [x] Audit: Identifier le découpage du tracé et des libellés du panneau Soleil & Lune.
- [x] Interface: Ajuster les dimensions du tracé pour l’afficher entièrement sur mobile.
- [x] Validation: Vérifier le panneau Soleil & Lune, TypeScript, Vitest et build.

## Image 3D de lune en croissant
- [x] Asset: Générer une lune 3D en croissant, sans texte et avec fond transparent.
- [x] Interface: Intégrer l’illustration à la phase lunaire affichée dans Soleil & Lune.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Premier croissant en lune 3D réaliste
- [x] Asset: Générer un premier croissant 3D réaliste et cratérisé, sans texte ni fond.
- [x] Interface: Remplacer explicitement le pictogramme du premier croissant par cet asset visible.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Lune 3D agrandie sans cercle
- [x] Audit: Identifier le conteneur et le fond décoratif de la lune 3D.
- [x] Interface: Agrandir l’astre et retirer cercle, bordure et arrière-plan autour de la lune.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Fonds de ciel dynamiques des cartes Dashboard
- [x] Audit: Identifier la source de ciel dynamique et les cartes éligibles du Dashboard.
- [x] Interface: Étendre l’image de ciel aux cartes avec une superposition sombre adaptée à chaque contenu.
- [x] Validation: Vérifier le contraste mobile, TypeScript, Vitest et build.

## Fonds de ciel dynamiques de toutes les pages
- [x] Audit: Identifier les surfaces principales et les contraintes des pages Prévisions, Historique, Fiabilité, Stations et AI Lab.
- [x] Infrastructure: Créer une couche de fond de ciel réutilisable, liée aux conditions du lieu actif.
- [x] Interface: Appliquer les fonds de ciel avec des voiles adaptés aux données, tableaux et graphiques.
- [x] Validation: Vérifier chaque page sur mobile, TypeScript, Vitest et build.

## Ciel dynamique conditionnel sur toutes les pages
- [x] Audit: Identifier la condition météo réelle disponible à chaque page pour le lieu actif.
- [x] Infrastructure: Créer un hook commun reliant condition météo, image de ciel et variable CSS de page.
- [x] Interface: Remplacer le ciel bleu fixe par l’image correspondant à la condition actuelle sur chaque page.
- [x] Validation: Vérifier les changements de condition, TypeScript, Vitest et build.

## Diagnostic du classement de fiabilité par condition
- [x] Interface: Identifier les seuils et états empêchant l’affichage des modèles les plus fiables.
- [x] Données: Contrôler les archives de prévisions, observations et échantillons disponibles par condition météo.
- [x] Rapport: Expliquer le blocage réel et les conditions nécessaires avant affichage d’un classement mesuré.

## Tendances provisoires de fiabilité
- [x] Données: Définir les métriques réellement disponibles pour température, pluie et vent par modèle.
- [x] API: Exposer uniquement ces tendances mesurées avec leur volume de comparaisons et un statut provisoire.
- [x] Interface: Afficher les trois tendances sans les présenter comme un classement validé.
- [x] Validation: Vérifier les libellés, TypeScript, Vitest et build.

## Accents bleu-vert de la page Fiabilité
- [x] Audit: Identifier les contours et badges ambrés à remplacer dans Fiabilité.
- [x] Interface: Appliquer des accents bleu et vert cohérents aux états de préparation et de tendance provisoire.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Lisibilité des courbes de prévision
- [x] Audit: Identifier les halos du tracé maximal et la proximité des chiffres minimaux bleus.
- [x] Interface: Rendre la courbe orange nette et écarter les libellés minimaux de leur courbe.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Harmonisation anti-chevauchement des graphiques
- [x] Audit: Identifier les collisions restantes de libellés dans les graphiques horaire et de prévisions.
- [x] Infrastructure: Définir des couloirs communs qui éloignent les chiffres des courbes.
- [x] Interface: Appliquer le placement harmonisé aux deux graphiques.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build.

## Notes provisoires de fiabilité
- [x] Audit: Identifier les comparaisons et jours archivés disponibles par modèle.
- [x] Méthode: Définir une note provisoire explicable fondée sur le volume de preuves, sans classement validé.
- [x] Interface: Afficher la note et son statut provisoire dans les tendances Température, Pluie et Vent.
- [x] Validation: Vérifier les libellés, TypeScript, Vitest et build.

## Note visible pour chaque modèle
- [x] Audit: Identifier pourquoi la note individuelle n’est pas suffisamment visible dans les lignes de tendance.
- [x] Interface: Afficher un badge de note explicite pour chaque modèle Température, Pluie et Vent.
- [x] Validation: Vérifier les notes par modèle, TypeScript, Vitest et build.

## Diagnostic des indicateurs de synthèse des stations
- [x] Interface: Identifier les conditions qui affichent un tiret pour Dernière synthèse et Confiance synthèse.
- [x] Données: Contrôler les synthèses locales, observations et scores réellement archivés pour Hondeghem.
- [x] Rapport: Expliquer les prérequis qui empêchent ou permettent l’affichage de ces deux indicateurs.

## Correction de correspondance géographique des synthèses
- [x] Données: Utiliser une tolérance cohérente pour retrouver une synthèse locale proche du lieu actif.
- [x] Tests: Couvrir la récupération de la dernière synthèse malgré un léger écart de coordonnées.
- [x] Validation: Vérifier la dernière synthèse et la confiance affichées dans Stations, TypeScript, Vitest et build.

## Détail de calcul de la synthèse locale
- [x] Données: Identifier les stations contributrices, pondérations, mesures et confiance déjà disponibles.
- [x] Interface: Ajouter un bouton et une fenêtre de détail de la synthèse locale.
- [x] Validation: Vérifier la fenêtre mobile, TypeScript, Vitest et build.

## Cohérence des températures officielle, locale et ultra-locale
- [x] Audit: Comparer les sources, horodatages et calculs affichés dans les trois contextes.
- [x] Correction: Corriger uniquement l’origine mesurée de l’écart ou expliciter un écart réel de source.
- [x] Validation: Vérifier la cohérence mobile, TypeScript, Vitest et build.

## Cohérence entre météo observée et affichage
- [x] Audit: Comparer l’heure, la température, les nuages, la pluie et la condition affichée avec les sources disponibles.
- [x] Correction: Corriger uniquement la sélection de données ou l’affichage objectivement incohérent.
- [x] Validation: Vérifier la cohérence des conditions et températures, TypeScript, Vitest et build.

## Observations personnelles et calibration progressive
- [x] Audit: Vérifier les prévisions archivées par modèle et définir les garde-fous de comparaison lieu-créneau.
- [x] Données: Ajouter le stockage sécurisé des observations personnelles et des scores de calibration par modèle.
- [x] Calcul: Évaluer température, condition, pluie et vent, puis mettre à jour des poids plafonnés selon la preuve accumulée.
- [x] Interface: Ajouter au Dashboard une saisie guidée des observations, des propositions de conditions et l’état de preuve.
- [x] Validation: Couvrir les calculs, la saisie mobile, TypeScript, Vitest et build avant publication.

## Historique modifiable des observations personnelles
- [x] Audit: Définir un recalcul complet et cohérent des scores après une correction ou suppression.
- [x] Données: Ajouter les opérations sécurisées de liste complète, modification, suppression et reconstruction de calibration.
- [x] Interface: Créer un panneau mobile pour consulter, modifier et supprimer les observations archivées.
- [x] Validation: Vérifier les recalculs, les actions utilisateur, TypeScript, Vitest et build.
- [x] Interface: Replier la section Mes observations par défaut avec une flèche d’ouverture et de fermeture rapide.

## Snapshot de fusion indisponible dans AI Lab
- [x] Audit: Vérifier la dernière fusion, les prévisions archivées et les exécutions de collecte pour Hondeghem.
- [x] Correction: Restaurer la récupération ou la production de snapshot sans inventer de données.
- [x] Validation: Vérifier AI Lab, TypeScript, Vitest et build avant publication.

## Position Soleil & Lune
- [x] Audit: Vérifier les horaires et les coordonnées disponibles pour les deux astres.
- [x] Interface: Agrandir le soleil et tracer une position lunaire distincte sur l’arche.
- [x] Validation: Vérifier le panneau mobile, TypeScript, Vitest et build avant publication.

## Relance manuelle de fusion météo
- [x] Audit: Identifier le flux réutilisable de collecte et les garde-fous de fréquence.
- [x] Données: Ajouter une procédure protégée qui recalcule et persiste un snapshot pour le lieu actif.
- [x] Interface: Ajouter le bouton de relance avec chargement, succès et erreur explicites dans AI Lab.
- [x] Validation: Vérifier la relance, TypeScript, Vitest et build avant publication.

## Marqueur solaire 3D
- [x] Interface: Retirer le contour blanc et créer un soleil 3D net sur l’arche.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Altitude et animation célestes
- [x] Calcul: Déterminer l’altitude affichable du Soleil et de la Lune à partir de leurs éphémérides.
- [x] Interface: Afficher les deux altitudes, un marqueur lunaire 3D sans fond et une animation solaire discrète respectant la réduction des mouvements.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Thème nocturne du panneau céleste
- [x] Calcul: Déterminer de façon fiable l’état nuit à partir des horaires de coucher et de lever locaux.
- [x] Interface: Appliquer un habillage nocturne dédié et automatique après le coucher du soleil.
- [x] Validation: Vérifier les états jour et nuit, TypeScript, Vitest et build avant publication.

## Soleil réaliste sans altitudes
- [x] Interface: Retirer les altitudes du Soleil et de la Lune du panneau et de son détail.
- [x] Médias: Créer un soleil réaliste 3D sans fond compatible avec la Lune 3D existante.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Ajout de lieu plein écran mobile
- [x] Audit: Identifier le composant et les contraintes de taille actuelles du panneau d’ajout de lieu.
- [x] Interface: Afficher la recherche de lieu en plein écran mobile avec fermeture accessible.
- [x] Validation: Vérifier l’intégralité du panneau sur mobile, TypeScript, Vitest et build avant publication.

## Séparation visuelle Soleil & Lune
- [x] Audit: Identifier l’origine de toute superposition des marqueurs sur l’arche.
- [x] Interface: Distinguer les calques, styles et positions des astres, y compris lorsqu’ils sont sous l’horizon.
- [x] Validation: Vérifier le tracé mobile, TypeScript, Vitest et build avant publication.
- [x] Interface: Retirer le libellé « Nuit locale » du panneau tout en conservant le thème nocturne.

## Astres visibles sous l’horizon
- [x] Audit: Vérifier les états nocturnes où Soleil et Lune sont simultanément sous l’horizon.
- [x] Interface: Afficher deux indicateurs célestes distincts sous l’arche, sans faux positionnement dans le ciel.
- [x] Validation: Vérifier le panneau nocturne mobile, TypeScript, Vitest et build avant publication.

## Astres affichés sur l’arche en permanence
- [x] Audit: Identifier la géométrie de référence et les règles actuelles de masquage hors horizon.
- [x] Interface: Conserver Soleil et Lune visibles, séparés et légendés directement sur le demi-cercle.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Collecte quotidienne de prévisions à 05:00
- [x] Audit: Vérifier la tâche de 05:00, les huit modèles et les relevés de stations effectivement archivés.
- [x] Correction: Aucune correction requise : la collecte active couvre déjà les modèles experts et les stations, avec contrôle de couverture.
- [x] Validation: Contrôler les données produites et la prochaine exécution planifiée.

## Cartes horaires : heure actuelle et lisibilité
- [x] Audit: Identifier le défilement initial et les surfaces appliquées aux cartes horaires.
- [x] Interface: Cadrer l’heure actuelle et éclaircir les fonds de cartes sans réduire le contraste.
- [x] Validation: Vérifier le comportement mobile, TypeScript, Vitest et build avant publication.

## Graphique détaillé : chiffres et heure actuelle
- [x] Audit: Identifier les tailles de libellés et la géométrie du repère actuel dans le SVG.
- [x] Interface: Agrandir les valeurs et placer l’heure actuelle centrée sous sa verticale.
- [x] Validation: Vérifier le graphique mobile, TypeScript, Vitest et build avant publication.

## Précipitations observées personnelles
- [x] Audit: Vérifier la persistance et le score des précipitations pour les observations personnelles.
- [x] Interface: Afficher un champ de millimètres pour les conditions pluvieuses et envoyer sa valeur.
- [x] Validation: Vérifier la saisie mobile, le score, TypeScript, Vitest et build avant publication.

## Icônes animées de vent et d’humidité
- [x] Audit: Identifier les cartes météo et les icônes réutilisables pour le vent et l’humidité.
- [x] Interface: Ajouter des animations discrètes respectant la réduction des mouvements.
- [x] Validation: Vérifier les cartes mobiles, TypeScript, Vitest et build avant publication.

## Modernisation des prévisions détaillées
- [x] Audit: Définir une hiérarchie visuelle plus moderne pour l’en-tête, les filtres et les cartes horaires.
- [x] Interface: Moderniser l’en-tête et les surfaces de lecture de la page.
- [x] Interface: Améliorer les cartes horaires et l’état de l’heure actuelle sur mobile.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Style éditorial alternatif des prévisions détaillées
- [x] Direction: Définir un style éditorial plus épuré, limité à cette page.
- [x] Interface: Recomposer l’en-tête, les contrôles et les cartes sans modifier les autres pages.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Direction immersive des prévisions détaillées
- [x] Direction: Définir une composition météo plus immersive, limitée à cette page.
- [x] Interface: Recomposer les repères de temps, les cartes horaires et les modules de prévisions.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Netteté des chiffres du graphique détaillé
- [x] Audit: Identifier les conflits de contraste et de position entre valeurs et courbe SVG.
- [x] Interface: Renforcer le contour, la lisibilité et l’espacement des valeurs.
- [x] Validation: Vérifier le graphique mobile, TypeScript, Vitest et build avant publication.

## Valeurs du graphique sans contour noir
- [x] Audit: Identifier les contours appliqués aux cartouches de température, vent et pluie.
- [x] Interface: Retirer les contours noirs en préservant le contraste typographique.
- [x] Validation: Vérifier le graphique mobile, TypeScript, Vitest et build avant publication.

## Valeurs du graphique sans ombre sombre
- [x] Audit: Identifier les remplissages et effets sombres encore appliqués aux valeurs.
- [x] Interface: Retirer toute ombre ou cartouche sombre autour des chiffres.
- [x] Validation: Vérifier le graphique mobile, TypeScript, Vitest et build avant publication.

## Prévisions détaillées : en-tête et chiffres sans ombre
- [x] Audit: Identifier la carte d’introduction et les styles sombres résiduels autour des valeurs.
- [x] Interface: Retirer la première carte et supprimer tout effet sombre restant sur les chiffres du graphique.
- [x] Validation: Vérifier la page mobile, TypeScript, Vitest et build avant publication.

## Cartes horaires compactes et lumineuses
- [x] Audit: Identifier les dimensions, débordements et surfaces actuelles des cartes sur mobile.
- [x] Interface: Compacter les cartes et éclaircir leurs fonds transparents.
- [x] Validation: Vérifier l’ouverture mobile, TypeScript, Vitest et build avant publication.

## Couleurs thermiques des prévisions détaillées
- [x] Audit: Identifier la fonction et les seuils thermiques employés par le Dashboard.
- [x] Interface: Appliquer ces teintes aux températures des cartes horaires détaillées.
- [x] Validation: Vérifier les seuils sur mobile, TypeScript, Vitest et build avant publication.

## Repère actuel sans ligne verticale
- [x] Audit: Identifier le tracé de la ligne verticale du repère actuel dans le graphique.
- [x] Interface: Retirer la ligne et conserver uniquement « Maintenant » sous l’heure.
- [x] Validation: Vérifier le graphique mobile, TypeScript, Vitest et build avant publication.

## Cohérence phénomène immédiat et régime opérationnel
- [x] Audit: Comparer les sources, horodatages et règles des libellés Averses, Bruine et Ciel couvert.
- [x] Interface: Clarifier les niveaux d’information ou corriger une incohérence objectivement mesurée.
- [x] Validation: Vérifier Dashboard, AI Lab, TypeScript, Vitest et build avant publication.

## Carte principale : phénomène et évolution sur deux lignes
- [x] Interface: Conserver « Phénomène actuel · Bruine » sur une ligne mobile et placer l’évolution horaire sur la ligne suivante.
- [x] Interface: Donner à la ligne d’évolution la même taille de lecture que le phénomène actuel.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Typographie et boutons calqués sur le Dashboard
- [x] Audit: Identifier les échelles typographiques, boutons, bordures et états bleu-cyan/vert du Dashboard.
- [x] Design system: Créer des styles partagés pour titres, libellés, boutons actifs et données locales fiables.
- [x] Interface: Appliquer ces styles aux pages Fiabilité, Stations, Historique, AI Lab, Prévisions détaillées et réglages.
- [x] Contrainte: Utiliser uniquement le bleu-cyan et le vert local pour les éléments non sémantiques, sans modifier le Dashboard.
- [x] Validation: Vérifier le rendu mobile, TypeScript, Vitest et build avant publication.

## Villes favorites : typographie et température actuelle
- [x] Audit: Identifier la barre des favoris et la source fiable de température pour chaque lieu.
- [x] Interface: Harmoniser les libellés des villes avec le Dashboard et afficher la température actuelle dans chaque favori.
- [x] Contrainte: Ne jamais afficher une température inventée ; afficher un état explicite lorsqu’elle est indisponible.
- [x] Validation: Vérifier mobile, TypeScript, Vitest et build avant publication.

## Villes favorites : ordre et mini-icône météo
- [x] Audit: Vérifier la persistance de l’ordre des favoris connectés et locaux, ainsi que la condition météo disponible.
- [x] Interface: Ajouter le glisser-déposer mobile et desktop pour réorganiser les villes favorites.
- [x] Interface: Afficher une mini-icône météo avant le nom, avec la température actuelle fiable.
- [x] Validation: Vérifier la persistance, le rendu mobile, TypeScript, Vitest et build avant publication.

## Soleil réaliste dans le panneau astronomique
- [x] Audit: Identifier l’image et les styles utilisés par le Soleil du panneau Soleil & Lune.
- [x] Média: Créer un disque solaire réaliste, texturé, sans bord blanc et compatible avec la carte sombre.
- [x] Interface: Intégrer la nouvelle image du Soleil sans modifier la position de la Lune ni les éphémérides.
- [x] Validation: Vérifier le panneau mobile, TypeScript, Vitest et build avant publication.

## Correction : ajout d’une ville favorite
- [x] Audit: Identifier la condition ou le débordement qui masque l’action « Ajouter un lieu ».
- [x] Interface: Garder « Ajouter un lieu » visible et accessible avec les favoris réorganisables.
- [x] Validation: Vérifier mobile, TypeScript, Vitest et build avant publication.

## Ligne des favoris : ajout et paramètres
- [x] Audit: Vérifier le positionnement de l’ajout et le rendu conditionnel de l’icône Paramètres.
- [x] Interface: Replacer « Ajouter un lieu » dans la ligne défilante des favoris.
- [x] Interface: Toujours afficher l’icône Paramètres pour gérer les villes connectées.
- [x] Validation: Vérifier mobile, TypeScript, Vitest et build avant publication.

## Défilement libre des commandes de favoris
- [x] Audit: Identifier les conteneurs qui maintiennent l’ajout et les paramètres fixes.
- [x] Interface: Mettre l’ajout et les paramètres dans le même défilement horizontal que les villes.
- [x] Validation: Vérifier le défilement mobile, TypeScript, Vitest et build avant publication.

## Accessibilité de l’ajout de ville dans les favoris
- [x] Audit: Identifier pourquoi la commande d’ajout reste hors de portée après défilement.
- [x] Interface: Ajouter un repère de défilement et un accès évident à l’ajout sans fixer la commande.
- [x] Données: Augmenter de manière cohérente la capacité de cinq à huit villes favorites côté interface et serveur.
- [x] Validation: Vérifier le parcours mobile, TypeScript, Vitest et build avant publication.

## Ajout à droite dans les favoris défilants
- [x] Audit: Vérifier l’ordre des villes, des paramètres et de l’action Ajouter dans la rangée.
- [x] Interface: Placer l’action Ajouter tout à droite de la rangée défilante.
- [x] Interface: Préserver le défilement horizontal dans les deux sens sur mobile et desktop.
- [x] Validation: Vérifier le parcours mobile, TypeScript, Vitest et build avant publication.

## Correction : défilement tactile des favoris
- [x] Audit: Identifier le conflit entre les capteurs de glisser-déposer et le défilement horizontal.
- [x] Interface: Conserver le défilement tactile libre de gauche à droite et de droite à gauche.
- [x] Interface: Garder le réordonnancement accessible sans bloquer le défilement normal.
- [x] Validation: Vérifier tactile/mobile, TypeScript, Vitest et build avant publication.

## Inversion des commandes de favoris
- [x] Audit: Vérifier l’ordre actuel de l’ajout et des paramètres dans la rangée.
- [x] Interface: Placer Ajouter avant Paramètres dans le défilement horizontal.
- [x] Validation: Vérifier TypeScript, Vitest et build avant publication.

## Ajustement des espaces supérieurs du Dashboard
- [x] Audit: Identifier les marges entre les favoris, les indicateurs et la date.
- [x] Interface: Réduire légèrement ces espaces sans modifier la taille de la carte principale.
- [x] Validation: Vérifier mobile, TypeScript, Vitest et build avant publication.

## Année dans la date du Dashboard
- [x] Audit: Vérifier le formatage compact de la date et ses tests.
- [x] Interface: Afficher le jour, le mois et l’année dans la pastille de date.
- [x] Interface: Réduire l’espace entre le haut de la carte, la date et le régime de prévision dominant.
- [x] Validation: Vérifier mobile, TypeScript, Vitest et build avant publication.

## Clarification des stations physiques insuffisantes
- [x] Audit: Identifier les motifs réels d’absence ou de rejet des relevés de stations physiques.
- [x] Interface: Expliquer clairement quand seuls les modèles sont disponibles et pourquoi les stations sont insuffisantes.
- [x] Contrainte: Ne jamais attribuer une cause non mesurée ; afficher les motifs réellement disponibles.
- [x] Validation: Vérifier Stations, TypeScript, Vitest et build avant publication.

## Carte principale complète au premier écran mobile
- [x] Audit: Mesurer les espaces et les hauteurs au-dessus et dans la carte principale.
- [x] Interface: Réduire uniquement les zones non essentielles afin d’afficher la carte entière à l’ouverture.
- [x] Contrainte: Conserver toutes les informations météo de la carte principale.
- [x] Validation: Vérifier le premier écran mobile, TypeScript, Vitest et build avant publication.

## Carte Stations sous le rayon de recherche
- [x] Audit: Identifier l’ordre du sélecteur de rayon et de la carte, ainsi que le fond de carte par défaut.
- [x] Interface: Afficher la carte directement sous le rayon de recherche.
- [x] Interface: Ouvrir la carte en vue satellite par défaut.
- [x] Interface: Ouvrir la vue réelle exactement au point choisi par le contrôle d’exploration.
- [x] Validation: Vérifier Stations sur mobile, TypeScript, Vitest et build avant publication.

## Concordance de température entre favoris et Dashboard
- [x] Audit: Comparer les sources, horodatages et priorités de température des favoris et de la carte principale.
- [x] Interface: Alimenter les favoris avec la même température actuelle que la carte Dashboard pour le lieu actif.
- [x] Contrainte: Ne jamais remplacer une donnée indisponible par une température estimée non issue de la source partagée.
- [x] Validation: Vérifier la concordance, TypeScript, Vitest et build avant publication.

## Placement non conflictuel de la vue réelle
- [x] Audit: Vérifier les positions des commandes natives de carte et de la commande Vue réelle.
- [x] Interface: Positionner Vue réelle sans recouvrir les boutons d’agrandissement ou de zoom.
- [x] Validation: Vérifier sur mobile, TypeScript, Vitest et build avant publication.

## Infobulles détaillées des stations
- [x] Audit: Identifier les mesures, scores et motifs réellement disponibles pour chaque station.
- [x] Interface: Afficher une infobulle détaillée au clic sur un marqueur de station.
- [x] Contrainte: Ne présenter que les valeurs et motifs réellement retournés par les données de station.
- [x] Validation: Vérifier les interactions, TypeScript, Vitest et build avant publication.

## Street View uniquement en carte agrandie
- [x] Audit: Vérifier le contrôle Street View et l’événement d’agrandissement de la carte.
- [x] Interface: Masquer Street View dans la carte compacte et l’activer en plein écran.
- [x] Validation: Vérifier les contrôles, TypeScript, Vitest et build avant publication.

## Contrôles directionnels et fermeture de la carte
- [x] Audit: Identifier le contrôle directionnel qui recouvre l’agrandissement et le conteneur de plein écran.
- [x] Interface: Réserver les contrôles directionnels à la carte agrandie.
- [x] Interface: Ajouter un bouton pour fermer facilement la carte en plein écran.
- [x] Validation: Vérifier les contrôles, TypeScript, Vitest et build avant publication.

## Contrôles Plan et Satellite uniquement
- [x] Audit: Identifier les contrôles de carte visibles dans les vues compacte et plein écran.
- [x] Interface: Masquer les contrôles supplémentaires en vue compacte.
- [x] Interface: Afficher uniquement Plan et Satellite dans la vue agrandie.
- [x] Validation: Vérifier les contrôles, TypeScript, Vitest et build avant publication.

## Street View plein écran et infobulles lisibles
- [x] Audit: Vérifier le rétablissement de Street View au plein écran et les styles actuels des infobulles.
- [x] Interface: Afficher Street View avec Plan et Satellite uniquement dans la carte agrandie.
- [x] Interface: Renforcer le fond, le contraste et l’espacement des infobulles de stations.
- [x] Validation: Vérifier les contrôles, la lisibilité, TypeScript, Vitest et build avant publication.

## Couleur de fraîcheur dans l’infobulle de station
- [x] Audit: Vérifier les âges de relevé réellement disponibles et leurs seuils de fraîcheur.
- [x] Interface: Colorer l’heure du dernier relevé selon sa fraîcheur.
- [x] Contrainte: Afficher un état neutre lorsque l’horodatage est indisponible.
- [x] Validation: Vérifier les infobulles, TypeScript, Vitest et build avant publication.

## Pastilles de lieux favoris plus compactes
- [x] Audit: Identifier la hauteur, le rembourrage et les icônes des pastilles actuelles.
- [x] Interface: Réduire légèrement leur hauteur sans diminuer la lisibilité.
- [x] Validation: Vérifier mobile, TypeScript, Vitest et build avant publication.

## Noms de favoris tronqués
- [x] Audit: Vérifier la largeur maximale et le comportement des noms dans les pastilles.
- [x] Interface: Tronquer les noms longs avec des points de suspension sans masquer la température.
- [x] Validation: Vérifier les pastilles, TypeScript, Vitest et build avant publication.

## Carte Stations agrandie sans infobulle système
- [x] Audit: Identifier le plein écran natif qui affiche l’information système de sortie.
- [x] Interface: Utiliser une vue agrandie contrôlée dans l’application avec fermeture explicite.
- [x] Interface: Afficher Plan, Satellite et Street View dans cette vue agrandie.
- [x] Validation: Vérifier la carte agrandie, TypeScript, Vitest et build avant publication.

## Soleil légèrement réduit dans le panneau astronomique
- [x] Audit: Identifier les dimensions du Soleil et de la Lune dans l’arche astronomique.
- [x] Interface: Réduire légèrement le Soleil sans modifier son point de position ni la Lune.
- [x] Validation: Vérifier le panneau mobile, TypeScript, Vitest et build avant publication.

## Animation solaire discrète
- [x] Audit: Identifier les styles du Soleil et la gestion de réduction des mouvements.
- [x] Interface: Ajouter une animation solaire discrète, fondée uniquement sur transform et opacity.
- [x] Accessibilité: Désactiver l’animation lorsque la réduction des mouvements est demandée.
- [x] Validation: Vérifier le panneau, TypeScript, Vitest et build avant publication.

## Audit complet du contenu transmis
- [x] Périmètre: Examiner le contenu transmis et identifier le type d’audit pertinent.
- [x] Analyse: Relever les constats, risques, incohérences et éléments vérifiables.
- [x] Rapport: Produire un rapport structuré avec priorités et actions correctives.

## Corrections intégrales post-audit — fiabilité, provenance et cohérence
- [x] P0 Provenance: Exclure strictement les scores et observations `legacy_unqualified` de tous les classements, indicateurs, textes IA et pondérations décisionnels.
- [x] P0 Fiabilité: Afficher un état « données insuffisantes » tant que les seuils de preuves physiques qualifiées ne sont pas atteints par lieu, modèle et horizon.
- [x] P0 Historique: Distinguer explicitement dans toutes les vues une observation physique, une référence de modèle, une prévision et une estimation de fusion.
- [x] P1 Température: Ne plus présenter la température interpolée des favoris préchargés comme une température actuelle mesurée.
- [x] P1 Cohérence: Expliciter et harmoniser les sources des prévisions persistées à huit modèles, des horaires live et du consensus quotidien à quatre modèles.
- [x] P1 Géographie: Résoudre et appliquer le fuseau IANA par lieu favori au lieu d’imposer Europe/Paris à toutes les coordonnées.
- [x] P1 Sources: Afficher uniquement les fournisseurs publics réellement connectés et identifier clairement toute source indisponible.
- [x] P1 Confiance: Retirer les valeurs par défaut de performance et de cohérence qui peuvent surévaluer la confiance sans preuve qualifiée.
- [x] P2 Calculs: Remplacer la moyenne arithmétique des directions de vent par une moyenne vectorielle circulaire et renommer l’accord pluie à deux modèles.
- [x] P2 Ultra Local: Restreindre les heuristiques microclimatiques au périmètre validé et documenter leurs limites de preuve.
- [x] P2 Observabilité: Corriger les compteurs de scores de collecte et exposer une santé de cycle complète par lieu, modèle et station.
- [x] P2 Interface: Remplacer les scores décoratifs ou non mesurés par des indicateurs calculés ou un état indisponible.
- [x] P3 Robustesse: Ajouter cache persistant court, budget de requêtes, limitation de débit et suivi des disponibilités de fournisseurs.
- [x] P3 Traçabilité: Archiver les métadonnées utiles de modèle, de maillage et d’heure de disponibilité avec chaque émission.
- [x] Tests: Ajouter les invariants de provenance, cohérence inter-pages, unités, fuseaux, direction circulaire, absence de fuite temporelle et données insuffisantes.
- [x] Validation: Exécuter TypeScript, Vitest, build, captures mobile et contrôle des logs avant publication.

## Arche Soleil & Lune — continuité mobile
- [x] Analyse: Vérifier les dimensions communes de l’arche et de la ligne d’horizon dans le panneau mobile.
- [x] Interface: Aligner l’arche, la ligne d’horizon et les heures de lever/coucher sur une même largeur visible.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Dashboard — provenance après les prévisions détaillées
- [x] Analyse: Identifier les deux sections à réordonner sans modifier la carte météo principale.
- [x] Interface: Déplacer la provenance sous l’accès aux prévisions détaillées.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication — élément ensuite retiré à la demande de l’utilisateur.

## Dashboard — suppression de la provenance
- [x] Interface: Retirer entièrement le panneau « Provenance · Valeur actuelle ».
- [x] Nettoyage: Supprimer les données et imports devenus inutilisés.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Arche Soleil & Lune — sommet complet
- [x] Analyse: Vérifier le rognage supérieur constaté sur mobile.
- [x] Interface: Agrandir le canevas utile au-dessus de l’arche afin que son sommet reste visible.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Arche Soleil & Lune — libellés superposés
- [x] Interface: Retirer les textes « Soleil » et « Lune » dessinés au niveau des astres.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Arche Soleil & Lune — demi-cercle plus compact
- [x] Interface: Réduire légèrement le demi-cercle pour qu’il tienne intégralement sur mobile.
- [x] Contrainte: Conserver les astres, les horaires et l’ensemble des autres données du panneau.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Navigation entre pages par glissement
- [x] Interaction: Naviguer par balayage horizontal entre Dashboard, Fiabilité, Stations, Historique et AI Lab.
- [x] Sens: Prendre en charge les glissements gauche et droite, avec des limites aux première et dernière pages.
- [x] Protection: Ignorer les gestes démarrés sur un contrôle, un défilement horizontal, une carte ou un graphique interactif.
- [x] Accessibilité: Conserver la navigation par barre et les URL directes existantes.
- [x] Validation: Tester les seuils, les limites, TypeScript et les interactions internes avant publication.

## Collecte quotidienne modèles et stations à 05h00
- [x] Planification: Exécuter à 05h00, heure de Paris, la collecte des prévisions horaires et journalières de tous les modèles actifs.
- [x] Stations: Relever les stations météorologiques disponibles pour chaque lieu favori dans le même cycle.
- [x] Persistance: Archiver les prévisions de modèles, les relevés de stations et le statut par source sans fabriquer de données manquantes.
- [x] Observabilité: Exposer un bilan de cycle indiquant les modèles et stations effectivement collectés, les indisponibilités et les échecs.
- [x] Validation: Tester la planification, la collecte et la persistance avant publication.

## AI Lab — indicateurs de fusion indisponibles
- [x] Diagnostic: Vérifier la résolution du snapshot partagé et la clé géographique utilisée par l’AI Lab.
- [x] Données: Rétablir confiance, stabilité et nombre de modèles uniquement depuis une fusion horodatée et traçable.
- [x] Repli: Conserver l’état « indisponible » lorsqu’aucune donnée validée ne peut être associée au lieu actif.
- [x] Validation: Tester les états avec snapshot, sans snapshot et en changement de lieu avant publication.

## AI Lab — modèles collectés jour et horaires
- [x] Données: Exposer les noms des modèles journaliers et horaires réellement collectés dans le bilan de cycle.
- [x] Interface: Afficher les deux listes sous les compteurs « Modèles jour » et « Modèles horaires ».
- [x] Repli: Signaler explicitement les modèles indisponibles sans les afficher comme collectés.
- [x] Validation: Tester les listes, les états partiels et le rendu mobile avant publication.

## Prévisions détaillées — synchronisation courbe et cartes
- [x] Diagnostic: Identifier les index et heures distincts utilisés par la courbe et le ruban de cartes.
- [x] Interaction: Utiliser une sélection horaire unique lors du glissement de la courbe ou des cartes.
- [x] Alignement: Centrer la carte correspondant exactement au point et à l’heure sélectionnés.
- [x] Validation: Tester les glissements gauche/droite, les limites et le rendu mobile avant publication.

## Prévisions détaillées — alignement géométrique de toutes les heures
- [x] Diagnostic: Vérifier les largeurs, offsets et pas horaires de la courbe et des cartes.
- [x] Interface: Utiliser la même origine et le même pas horaire pour placer chaque carte sous son repère de courbe.
- [x] Interaction: Préserver le défilement synchronisé tout en gardant la carte active sous son point.
- [x] Validation: Tester maintenant, les heures voisines, les extrémités et le rendu mobile avant publication.

## Prévisions détaillées — accrochage centré après défilement
- [x] Interaction: Détecter la fin du défilement de la courbe ou des cartes.
- [x] Interface: Recentrer automatiquement l’heure sélectionnée dans les deux vues.
- [x] Limites: Respecter le premier et le dernier créneau sans défilement impossible.
- [x] Validation: Tester le calage après glissement, la synchronisation et le rendu mobile avant publication.

## Prévisions horaires — détail des modèles à l’origine de l’écart
- [x] Données: Identifier les modèles min/max qui déterminent l’écart thermique réellement affiché.
- [x] Interface: Ajouter un panneau déroulant sous la synthèse d’écart avec une flèche explicite.
- [x] Explication: Décrire factuellement le rôle de chaque modèle et l’écart calculé sans inventer de performance.
- [x] Validation: Tester les états avec deux modèles, un modèle ou aucune comparaison avant publication.

## Évaluation d’intégration des modèles de validation
- [x] Couverture: Vérifier la couverture géographique et temporelle de chaque modèle candidat pour les lieux actuels.
- [x] Disponibilité: Vérifier le statut de production et la disponibilité technique via le fournisseur actif.
- [x] Recommandation: Distinguer les candidats immédiatement intégrables des modèles à laisser en validation.
- [x] Décision: Proposer un ordre d’intégration sans modifier la fusion officielle sans accord explicite.

## Cartes horaires — ciel visible en transparence
- [x] Interface: Remplacer le fond opaque des cartes horaires par une couche sombre translucide.
- [x] Lisibilité: Conserver des contrastes suffisants pour les températures, étiquettes et métriques.
- [x] Cohérence: Préserver les bordures et l’état « Maintenant » sans ajouter d’effet flou.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Soleil & Lune — arche circulaire régulière
- [x] Diagnostic: Identifier la géométrie elliptique qui aplatit le sommet de l’arche.
- [x] Interface: Utiliser un vrai demi-cercle ou un arc circulaire sans sommet plat.
- [x] Contrainte: Préserver la position des astres, les horaires et les données astronomiques.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Soleil & Lune — libellés sous la ligne d’horizon
- [x] Interface: Placer les textes Lever et Coucher sous la ligne horizontale.
- [x] Lisibilité: Conserver les heures de lever/coucher visibles sans chevauchement.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## AI Lab — lexique et méthode de calcul
- [x] Inventaire: Recenser les indicateurs, tableaux et termes de chaque section AI Lab.
- [x] Contenu: Expliquer la fusion, confiance, stabilité, accord, dispersion, poids, modèle appliqué et collecte.
- [x] Méthode: Décrire les calculs réellement appliqués et les limites lorsque les données sont insuffisantes.
- [x] Interface: Ajouter un panneau déroulant clair, accessible depuis l’AI Lab sur mobile.
- [x] Validation: Tester le contenu, l’ouverture du panneau, TypeScript et le rendu mobile avant publication.

## AI Lab — lexique avancé de fiabilité et de sources
- [x] Contenu: Ajouter les horizons de prévision, MAE, RMSE, biais, taille d’échantillon et seuils de décision.
- [x] Stations: Expliquer fraîcheur, distance, continuité, fiabilité et règles d’exclusion des relevés physiques.
- [x] Méthode: Expliquer la correction de biais, la dispersion, les sources actives/validation et les limites de maillage ou microclimat.
- [x] Interface: Organiser ces informations dans le panneau déroulant sans nuire à la lecture mobile.
- [x] Validation: Tester le contenu, TypeScript et le rendu mobile avant publication.

## Navigation entre pages — transition fluide
- [x] Interaction: Animer l’entrée de la page cible après un glissement horizontal valide.
- [x] Direction: Adapter le sens de la transition au balayage gauche ou droit.
- [x] Accessibilité: Désactiver l’animation non essentielle si la réduction des mouvements est demandée.
- [x] Protection: Préserver les gestes exclus et les URL directes existantes.
- [x] Validation: Tester la navigation, TypeScript et le rendu mobile avant publication.

## Navigation entre pages — optimisation de fluidité
- [x] Chargement: Précharger les pages principales après l’affichage initial sans bloquer le Dashboard.
- [x] Transition: Raccourcir et simplifier la transition directionnelle pour les gestes rapides.
- [x] Rafraîchissement: Éviter les rechargements superflus et le travail bloquant pendant le changement de route.
- [x] Accessibilité: Préserver la préférence de réduction des mouvements et les interactions protégées.
- [x] Validation: Tester le préchargement, TypeScript, la navigation tactile et le rendu mobile avant publication.

## Dashboard — date intégrée au régime dominant
- [x] Interface: Déplacer la date complète dans le panneau Régime de prévision dominant.
- [x] Nettoyage: Retirer la pastille de date indépendante au-dessus du panneau.
- [x] Lisibilité: Préserver la hiérarchie du régime, de la condition et des indicateurs associés.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Dashboard — date agrandie en tête du régime
- [x] Interface: Placer la date au-dessus du libellé Régime de prévision dominant.
- [x] Typographie: Agrandir la date tout en conservant la lisibilité mobile.
- [x] Cohérence: Garder la date dans le panneau de régime, sans réintroduire de pastille externe.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Dashboard — harmonisation phénomène et évolution
- [x] Interface: Utiliser la même teinte bleue pour les libellés Phénomène actuel et Évolution.
- [x] Lisibilité: Afficher les conditions Bruine, Averses et les autres valeurs de condition en blanc.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Dashboard — date sans contour
- [x] Interface: Retirer toute bordure, fond de pastille et contour autour de la date.
- [x] Lisibilité: Conserver une date agrandie et contrastée en texte seul.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Soleil & Lune — espace entre les astres et le titre
- [x] Diagnostic: Vérifier la position haute des astres par rapport au sous-titre du panneau.
- [x] Interface: Réserver une zone de sécurité pour empêcher la Lune ou le Soleil de chevaucher le titre.
- [x] Contrainte: Préserver l’arche, les horaires et le positionnement astronomique relatif.
- [x] Validation: Tester les positions extrêmes, TypeScript et le rendu mobile avant publication.

## Soleil & Lune — repères Lever et Coucher dégagés
- [x] Interface: Décaler les libellés Lever et Coucher sous la ligne d’horizon avec un espace fixe.
- [x] Lisibilité: Conserver les heures de lever et coucher visibles au-dessus de la ligne.
- [x] Validation: Tester les positions extrêmes, TypeScript et le rendu mobile avant publication.

## Soleil & Lune — prochains repères et alertes astronomiques
- [x] Lune: Afficher la prochaine pleine lune, nouvelle lune, quartier et phase actuelle avec des dates calculées.
- [x] Soleil: Afficher les prochains jalons de durée du jour et les repères solaires pertinents.
- [x] Alertes: Ajouter les éclipses et phénomènes astronomiques à venir, avec visibilité ou non pour le lieu actif.
- [x] Transparence: Distinguer strictement les alertes astronomiques des alertes météo et indiquer la source ou la limite de visibilité.
- [x] Validation: Tester les calculs de dates, les états sans événement et le rendu mobile avant publication.

## Alertes astronomiques — essaims et carte locale
- [x] Essaims: Ajouter les principaux pics de météores avec date, fréquence indicative et conditions d’observation.
- [x] Visibilité: Calculer une appréciation locale à partir de la nuit, de la phase lunaire et de la nébulosité disponible.
- [x] Carte: Intégrer une petite carte interactive centrée sur le lieu actif, avec le périmètre et les consignes de visibilité des éclipses ou essaims.
- [x] Transparence: Distinguer la visibilité astronomique théorique, la couverture nuageuse prévue et les limites de l’horizon local.
- [x] Validation: Tester les événements, la carte, les états d’indisponibilité et le rendu mobile avant publication.

## Alertes astronomiques — icônes distinctives
- [x] Interface: Associer une icône explicite aux éclipses, essaims de météores et pleines lunes.
- [x] Lisibilité: Conserver un code visuel cohérent dans les cartes et le détail du panneau.
- [x] Accessibilité: Ajouter un libellé textuel ou alternatif pour chaque icône.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Alertes astronomiques — typographie plus lisible
- [x] Interface: Agrandir légèrement les descriptions, sources et indications de visibilité.
- [x] Hiérarchie: Conserver les titres principaux visuellement prioritaires sur mobile.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Éclipses — compatibilité Timeanddate et carte locale
- [x] Données: Vérifier le périmètre, la disponibilité et les limites de réutilisation des informations Timeanddate.
- [x] Carte: Comparer ces informations à la carte locale existante et à sa représentation actuelle du rayon de 25 km.
- [x] Transparence: Déterminer ce qui peut être affiché sans présenter le contexte local comme une bande officielle d’éclipse.
- [x] Rapport: Documenter la recommandation sans modifier la carte sans accord explicite.

## Éclipses — carte officielle de trajectoire ou visibilité
- [x] Sources: Comparer les données ouvertes officielles, les API sous licence et les calculs géométriques indépendants.
- [x] Précision: Définir les couches de visibilité, de pénombre/ombre et les données locales complémentaires.
- [x] Conformité: Déterminer les droits de réutilisation, l’attribution et la méthode de mise à jour.
- [x] Recommandation: Proposer une architecture sans modifier la carte sans accord explicite.

## Éclipses — zones de visibilité sur la carte interactive
- [x] Données: Construire des zones traçables de visibilité solaire et lunaire à partir de sources officielles ou de calculs vérifiables.
- [x] Carte: Afficher les couches, limites et légendes avec un style distinct par type d’éclipse.
- [x] Local: Conserver le lieu actif, la météo disponible et l’horizon comme contexte séparé de la géométrie de l’éclipse.
- [x] Transparence: Afficher la source, l’horodatage, la précision et les limites de chaque couche.
- [x] Validation: Tester les coordonnées, les zones, la carte interactive et le rendu mobile avant publication.

## Éclipse solaire 2027 — libellé global et visibilité française
- [x] Données: Nommer l’événement comme une éclipse solaire totale avec visibilité partielle depuis la France.
- [x] Validation: Vérifier les alertes et les zones de carte après correction du libellé.

## Carte astronomique — agrandissement intégré
- [x] Interface: Retirer le contrôle déplacé de la carte de visibilité.
- [x] Interaction: Ajouter un bouton explicite pour ouvrir une vue agrandie de la carte.
- [x] Carte: Préserver les couches, la légende et les contrôles de zoom dans la vue agrandie.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Carte astronomique — détails et position actuelle
- [x] Données: Calculer les circonstances et la visibilité d’éclipse pour une coordonnée sélectionnée.
- [x] Infobulle: Afficher au clic sur une zone le type de visibilité, l’heure du maximum et les limites de précision.
- [x] Localisation: Ajouter un bouton « Me localiser » pour centrer la carte sur la position du navigateur et évaluer la visibilité.
- [x] Transparence: Gérer l’absence ou le refus de géolocalisation sans fabriquer de position.
- [x] Validation: Tester les zones, les coordonnées, les erreurs de localisation et le rendu mobile avant publication.

## Carte astronomique — azimut de l’astre
- [x] Données: Calculer l’azimut du Soleil ou de la Lune au maximum pour le point sélectionné.
- [x] Interface: Afficher l’angle et la direction cardinale dans les détails d’éclipse.
- [x] Transparence: Préciser que la direction est mesurée depuis le nord géographique.
- [x] Validation: Tester les calculs solaire et lunaire, TypeScript et le rendu mobile avant publication.

## Carte astronomique — localisation animée
- [x] Interaction: Afficher un état de chargement pendant la demande de géolocalisation.
- [x] Carte: Remplacer le marqueur statique de position par un marqueur précis avec animation discrète.
- [x] Accessibilité: Préserver le libellé de la position et respecter la réduction des mouvements.
- [x] Erreurs: Conserver un message clair en cas de refus ou d’indisponibilité de la géolocalisation.
- [x] Validation: Tester les états de localisation, TypeScript et le rendu mobile avant publication.

## Carte astronomique — contrôles et zoom
- [x] Interface compacte: Afficher des boutons iconographiques superposés pour agrandir la carte et demander la localisation.
- [x] Vue agrandie: Réserver la commande Street View / direction à la carte ouverte en grand.
- [x] Carte: Corriger le réagencement et la disponibilité du zoom après ouverture de la vue agrandie.
- [x] Accessibilité: Ajouter des libellés explicites aux boutons iconographiques et préserver leurs états de chargement.
- [x] Validation: Tester la carte compacte, la vue agrandie, le zoom, TypeScript et la suite de régression avant publication.

## Carte astronomique — orientation et recentrage
- [x] Vue agrandie: Afficher une boussole lisible indiquant le nord géographique et la rotation courante de la carte.
- [x] Commande: Ajouter un bouton de recentrage vers le cadrage initial des zones de visibilité.
- [x] Accessibilité: Associer un libellé explicite aux nouvelles commandes de la carte.
- [x] Validation: Tester la boussole, le recentrage, TypeScript et la suite de régression avant publication.

## Carte astronomique — azimut sur la boussole
- [x] Données: Réutiliser l’azimut calculé et sa direction cardinale pour le point sélectionné.
- [x] Vue agrandie: Afficher l’azimut de l’astre directement avec la boussole.
- [x] Transparence: Signaler l’indisponibilité de l’azimut tant qu’aucune circonstance locale n’est calculée.
- [x] Validation: Tester l’affichage solaire et lunaire, TypeScript et la suite de régression avant publication.

## Carte astronomique — alerte d’observabilité
- [x] Position: Réutiliser uniquement une position du navigateur explicitement autorisée, sans inventer de localisation.
- [x] Conditions: Déterminer l’observabilité à partir des circonstances locales calculées et de la hauteur de l’astre.
- [x] Interface: Afficher une notification visuelle claire lorsque l’astre devient observable depuis cette position.
- [x] Transparence: Distinguer le calcul astronomique des limites réelles d’horizon, de nuages et de sécurité solaire.
- [x] Validation: Tester les états observable, non observable et sans position autorisée avant publication.

## Carte astronomique — alerte sonore et contrôles sans chevauchement
- [x] Interaction: Ajouter une activation volontaire et réversible d’une alerte sonore discrète.
- [x] Alerte: Jouer le son une seule fois lors du passage à l’état observable, sans lecture automatique non sollicitée.
- [x] Carte: Séparer les contrôles personnalisés des commandes Google Maps sur mobile et grand écran.
- [x] Interface: Définir une règle commune d’espacement et de superposition sûre pour les groupes de commandes de l’application.
- [x] Validation: Tester le son optionnel, les contrôles de carte, les formats mobile/desktop, TypeScript et la suite de régression.

## Carte astronomique — suppression du contrôle de déplacement
- [x] Carte compacte: Désactiver le contrôle natif de déplacement visible sous les boutons personnalisés.
- [x] Interface: Conserver exclusivement les actions d’agrandissement et de localisation sur la carte compacte.
- [x] Validation: Vérifier le rendu mobile, TypeScript et les tests avant publication.

## Carte astronomique — indication de lieu sans chevauchement
- [x] Carte agrandie: Déplacer l’indication de lieu hors de la zone réservée à la boussole et aux actions.
- [x] Interface: Préserver une zone libre pour les contrôles natifs et les notifications éventuelles.
- [x] Validation: Vérifier le rendu mobile et grand écran, TypeScript et les tests avant publication.

## Carte astronomique — couches de visibilité renforcées
- [x] Cartographie: Augmenter le contraste, l’opacité et l’épaisseur des zones bleues et violettes calculées.
- [x] Localisation: Conserver ces couches visibles après recentrage sur la position autorisée.
- [x] Vue agrandie: Préserver la même lisibilité après ouverture de la carte en grand.
- [x] Validation: Tester les couches solaire et lunaire, TypeScript et la suite de régression avant publication.

## Carte astronomique — réglage d’opacité des zones
- [x] Interaction: Ajouter un curseur accessible permettant de régler l’opacité des zones calculées.
- [x] Cartographie: Appliquer le réglage aux couches bleues et violettes sans modifier leurs contours ni leur ordre.
- [x] Interface: Préserver une position de curseur qui ne chevauche pas les autres contrôles de carte.
- [x] Validation: Tester les valeurs minimale, médiane et maximale, TypeScript et la suite de régression avant publication.

## Carte astronomique — ouverture rapide de la carte agrandie
- [x] Interaction: Empêcher les ouvertures concurrentes lors d’appuis rapides sur l’action d’agrandissement.
- [x] Carte: Attendre l’initialisation et le redimensionnement de la vue agrandie avant de réactiver les contrôles.
- [x] Validation: Tester les ouvertures répétées, la fermeture puis réouverture, TypeScript et la suite de régression avant publication.

## Carte astronomique — zoom tactile stable
- [x] Interaction: Préserver le zoom à deux doigts sans déclencher de réinitialisation de cadrage.
- [x] Carte: Dissocier le redimensionnement d’initialisation des gestes continus de zoom et déplacement.
- [x] Interface: Éviter que les curseurs et boutons superposés capturent involontairement les gestes cartographiques.
- [x] Validation: Tester le pincement tactile, le déplacement, la réouverture, TypeScript et la suite de régression avant publication.

## Carte astronomique — zoom tactile excessif persistant
- [x] Diagnostic: Éliminer les comportements Google Maps et navigateur qui amplifient le pincement tactile.
- [x] Interaction: Appliquer une politique de geste unique et stable pour la carte compacte et agrandie.
- [x] Carte: Empêcher les changements de niveau de zoom involontaires lors des changements de taille ou de contrôles.
- [x] Validation: Tester les pincements rapides répétés sur mobile, TypeScript et la suite de régression avant publication.

## AI Lab et Tableau de bord — sources et astronomie
- [x] AI Lab: Ajouter au lexique une section détaillant les sources effectivement utilisées, leur rôle et leurs limites.
- [x] Tableau de bord: Compléter le panneau Soleil & Lune avec les grandeurs, événements et limites disponibles.
- [x] Transparence: Distinguer clairement calcul astronomique, données observées et contexte réel d’observation.
- [x] Validation: Tester les contenus, la lisibilité mobile, TypeScript et la suite de régression avant publication.

## Carte astronomique — transition douce de zoom
- [x] Interaction: Animer avec fluidité les zooms déclenchés par les commandes de carte.
- [x] Tactile: Préserver le pincement natif sans ajouter d’animation concurrente ni de redimensionnement parasite.
- [x] Accessibilité: Respecter la préférence de réduction des mouvements.
- [x] Validation: Tester les commandes, le pincement, TypeScript et la suite de régression avant publication.

## Carte astronomique — curseur d’opacité en vue agrandie
- [x] Interface compacte: Masquer le curseur de transparence lorsque la carte n’est pas agrandie.
- [x] Vue agrandie: Conserver le réglage et remplacer le libellé « Zones » par « Opacité ».
- [x] Validation: Tester les deux formats de carte, TypeScript et la suite de régression avant publication.

## Carte astronomique — bouton d’opacité bas gauche
- [x] Commande: Afficher un bouton rond d’opacité cohérent avec les autres actions de carte.
- [x] Position: Placer cette commande en bas à gauche de la vue agrandie, hors des crédits et des contrôles natifs.
- [x] Interaction: Ouvrir et fermer le réglage d’opacité depuis le bouton sans gêner les gestes cartographiques.
- [x] Validation: Tester la commande en vue agrandie, TypeScript et la suite de régression avant publication.

## Carte astronomique — détails de la boussole
- [x] Interaction: Rendre la boussole activable au toucher et au clavier.
- [x] Informations: Afficher l’orientation de la carte, l’azimut de l’astre, sa direction et la méthode de lecture.
- [x] Transparence: Préciser que l’azimut est géographique et que l’horizon réel reste à vérifier.
- [x] Validation: Tester l’ouverture, la fermeture, TypeScript et la suite de régression avant publication.

## Carte astronomique — rose des vents complète
- [x] Carte agrandie: Afficher les huit directions cardinales et intermédiaires autour de la boussole.
- [x] Orientation: Tourner les repères avec la carte tout en préservant le nord géographique et l’azimut de l’astre.
- [x] Interface: Préserver des contrôles lisibles et sans chevauchement sur mobile.
- [x] Validation: Tester les orientations, TypeScript et la suite de régression avant publication.

## Carte astronomique — direction de l’astre mise en évidence
- [x] Calcul: Associer l’azimut calculé de l’astre au repère de rose des vents le plus proche.
- [x] Interface: Mettre ce repère en évidence avec une couleur distincte et un libellé accessible.
- [x] Transparence: Conserver l’angle exact et distinguer l’arrondi visuel du relèvement calculé.
- [x] Validation: Tester les directions cardinales et intermédiaires, TypeScript et la suite de régression avant publication.

## Carte astronomique — commandes simplifiées et aide sonore
- [x] Interface: Retirer la commande de rotation / recentrage de la rose des vents.
- [x] Position: Placer l’alerte sonore sous la rose des vents, à gauche de la carte agrandie.
- [x] Aide: Ajouter une infobulle expliquant l’activation volontaire et le déclenchement unique de l’alerte sonore.
- [x] Validation: Tester les commandes, l’infobulle, TypeScript et la suite de régression avant publication.

## Carte astronomique — localisation en vue agrandie
- [x] Commande: Afficher l’action de localisation dans la carte agrandie.
- [x] Carte: Recentrer et zoomer directement sur la position du navigateur après autorisation.
- [x] Accessibilité: Préserver les états de chargement et les messages de refus ou d’indisponibilité.
- [x] Validation: Tester la carte compacte et agrandie, TypeScript et la suite de régression avant publication.

## Carte astronomique — commandes à droite sans chevauchement
- [x] Position: Placer la localisation et l’alerte sonore à droite, entre le sélecteur Plan/Satellite et le zoom.
- [x] Interface: Garantir les espacements entre commandes personnalisées et contrôles Google Maps.
- [x] Aide: Conserver l’infobulle de l’alerte sonore à côté de son nouveau bouton.
- [x] Validation: Tester les formats mobile et grand écran, TypeScript et la suite de régression avant publication.

## Carte astronomique — alerte sonore sous le zoom
- [x] Position: Placer l’alerte sonore sous les commandes + / − de Google Maps.
- [x] Interface: Conserver un espace vertical sûr avec les boutons de zoom et les crédits de carte.
- [x] Aide: Garder l’infobulle de l’alerte sonore lisible depuis sa nouvelle position.
- [x] Validation: Tester les formats mobile et grand écran, TypeScript et la suite de régression avant publication.

## Carte astronomique — aide sonore au clic
- [x] Interaction: Ouvrir et fermer l’aide de l’alerte sonore au clic, sans dépendre du survol.
- [x] Interface: Positionner l’aide au-dessus de la carte avec une largeur adaptée au mobile.
- [x] Accessibilité: Exposer l’état étendu et garder le contenu lisible au clavier.
- [x] Validation: Tester le clic, la fermeture, TypeScript et la suite de régression avant publication.

## Carte astronomique — fermeture de carte entièrement visible
- [x] Mobile: Réserver une hauteur suffisante à la zone de fermeture dans la fenêtre agrandie.
- [x] Interface: Réduire la hauteur de carte si nécessaire sans rogner le bouton « Fermer la carte ».
- [x] Validation: Tester le rendu mobile et grand écran, TypeScript et la suite de régression avant publication.

## Collecte météo — prévisions 05h00 et stations
- [x] Audit: Identifier les modèles actifs, candidats et sources de stations réellement disponibles à la collecte, ainsi que le délai d’exécution constaté.
- [x] Stratégie: Confirmer que la tâche active de 05h00 collecte déjà les prévisions quotidiennes et horaires des modèles actifs et candidats, ainsi que les stations disponibles par lieu favori.
- [x] Automatisation: Alléger la tâche de 05h00 en séparant la découverte et les relevés de stations afin d’éviter les délais d’exécution.
- [x] Planification: Confirmer la tâche active de 05h00 Paris pour les prévisions et maintenir la collecte physique horaire séparée.
- [x] Validation: Tester la couverture des modèles, la séparation des relevés, TypeScript et la suite de régression avant publication.

## Fiabilité — période par défaut de 7 jours
- [x] État initial: Sélectionner automatiquement la période de 7 jours à l’ouverture de la page.
- [x] Interface: Conserver le choix manuel des autres périodes après l’initialisation.
- [x] Validation: Tester l’état initial, TypeScript et la suite de régression avant publication.

## Carte astronomique — indication de lieu Street View visible
- [x] Position: Remonter l’indication native de lieu au-dessus des crédits de carte.
- [x] Interface: Préserver l’espace entre ce libellé, les commandes et le pied de carte.
- [x] Validation: Tester le rendu mobile et grand écran, TypeScript et la suite de régression avant publication.

## Soleil & Lune — Premier quartier réaliste
- [x] Rendu: Restaurer l’image réaliste de la Lune pour la phase Premier quartier.
- [x] Cohérence: Utiliser le même visuel sur l’arche et près du libellé de phase.
- [x] Validation: Tester le rendu de phase, TypeScript et la suite de régression avant publication.

## Soleil & Lune — mouvement horizontal continu
- [x] Animation: Ajouter un déplacement horizontal continu et discret au Soleil et à la Lune de l’arche.
- [x] Calcul: Préserver les positions astronomiques calculées comme point de départ visuel.
- [x] Accessibilité: Désactiver le mouvement lorsque la réduction des mouvements est demandée.
- [x] Validation: Tester le rendu mobile, TypeScript et la suite de régression avant publication.

## Soleil & Lune — rotation continue à 360 degrés
- [x] Animation: Remplacer l’oscillation horizontale par une rotation complète et continue des deux astres.
- [x] Calcul: Conserver les coordonnées astronomiques de l’arche sans déplacement latéral.
- [x] Accessibilité: Respecter la réduction des mouvements pour la rotation.
- [x] Validation: Tester le rendu mobile, TypeScript et la suite de régression avant publication.

## Soleil & Lune — parcours gauche-droite de la Lune
- [x] Animation: Déplacer la Lune continuellement de gauche à droite sur l’arche, sans la faire tourner sur elle-même.
- [x] Soleil: Conserver le Soleil fixe sur sa position astronomique calculée.
- [x] Accessibilité: Désactiver le mouvement lorsque la réduction des mouvements est demandée.
- [x] Validation: Tester le parcours mobile, TypeScript et la suite de régression avant publication.

## Cartes agrandies — zoom rapide stabilisé
- [x] Diagnostic: Identifier les redimensionnements et rappels de caméra déclenchés pendant les gestes rapides.
- [x] Interaction: Bloquer les mises à jour concurrentes tant qu’un zoom ou dézoom est en cours.
- [x] Carte: Préserver le centre et le niveau de zoom choisis par l’utilisateur.
- [x] Validation: Tester les zooms rapides répétés sur mobile, TypeScript et la suite de régression avant publication.

## Soleil & Lune — rotation axiale de la Lune
- [x] Animation: Faire tourner uniquement la Lune sur son axe de façon continue.
- [x] Position: Conserver la Lune sur sa position astronomique fixe de l’arche.
- [x] Accessibilité: Désactiver la rotation lorsque la réduction des mouvements est demandée.
- [x] Validation: Tester le rendu mobile, TypeScript et la suite de régression avant publication.

## Soleil & Lune — rotation horizontale 3D de la Lune
- [x] Animation: Remplacer la rotation plane par une bascule continue sur l’axe horizontal de la Lune.
- [x] Position: Conserver la Lune sur sa position astronomique fixe de l’arche.
- [x] Accessibilité: Désactiver la rotation 3D lorsque la réduction des mouvements est demandée.
- [x] Validation: Tester le rendu mobile, TypeScript et la suite de régression avant publication.

## Soleil & Lune — positions astronomiques apparentes réelles
- [x] Audit: Vérifier les coordonnées actuelles, les sources et les champs de calcul pour les deux astres.
- [x] Calcul: Déterminer l’azimut, la hauteur et l’état sous/sur l’horizon pour le lieu, la date, l’heure et le fuseau actifs.
- [x] Projection: Positionner les astres dans l’arche à partir des données apparentes, sans coordonnées esthétiques fixes.
- [x] Temps réel: Actualiser progressivement les positions quand l’heure locale évolue, sans animation décorative ni rotation de la Lune.
- [x] Cas limites: Gérer lever, coucher, crépuscule, nuit, phases lunaires, changement de lieu, date et fuseau.
- [x] Validation: Comparer les positions calculées à Astronomy Engine sur plusieurs lieux et heures, puis tester l’interface avant publication.

## Soleil & Lune — trajectoires et fond céleste de l’arche
- [x] Référence: Adapter l’ambiance nocturne crépusculaire et les contrastes de la référence sans modifier les données astronomiques.
- [x] Trajectoires: Dessiner les parcours apparents du Soleil et de la Lune en pointillés, distincts et alignés à leurs positions calculées.
- [x] Lisibilité: Préserver la visibilité des horaires de lever/coucher, des marqueurs et de l’état sous l’horizon sur mobile.
- [x] Stabilité: Conserver la Lune fixe et exclure toute rotation ou animation décorative de son marqueur ou de sa trajectoire.
- [x] Validation: Contrôler le rendu mobile, TypeScript et la suite de régression avant publication.

## Soleil & Lune — repères horaires et lumière contextuelle
- [x] Repères: Afficher des heures utiles le long des trajectoires, ancrées sur les échantillons apparents réels visibles.
- [x] Ambiance: Déduire le mode jour, crépuscule ou nuit à partir de la hauteur réelle du Soleil et adapter le fond sans données décoratives inventées.
- [x] Lisibilité: Assurer le contraste des repères, des horaires de lever/coucher et des astres sur les trois ambiances.
- [x] Stabilité: Préserver les trajectoires réelles, les interruptions sous l’horizon et la Lune fixe sans rotation.
- [x] Validation: Tester TypeScript, Vitest et le rendu mobile avant publication.

## Soleil & Lune — correction astronomique complète
- [x] Audit: Identifier toute phase, image, horaire, trajectoire ou position encore dérivée d’un pourcentage ou d’une approximation.
- [x] Lune: Calculer phase géométrique, éclairage indépendant, azimut, altitude, lever, culmination, coucher et trajectoire au lieu et à l’instant actifs.
- [x] Soleil: Calculer lever, culmination, coucher, azimut, altitude et trajectoire pour les coordonnées et la date exactes du lieu sélectionné.
- [x] Projection: Représenter exclusivement les coordonnées topocentriques réelles et la position actuelle dans l’arche, sans segment décoratif ni position fixe statique.
- [x] Visuel: Orienter le disque lunaire selon la phase et la géométrie locales sans ajouter de rotation décorative.
- [x] Temps réel: Rafraîchir positions, visibilité, phase, éclairage, horaires et trajectoires au changement d’instant ou de lieu.
- [x] Validation: Vérifier les calculs sur plusieurs lieux et dates avec TypeScript, Vitest et le rendu mobile avant publication.

## Soleil & Lune — horizon de relief local
- [x] Données: Identifier une source d'altitude terrain et documenter la précision de l'horizon calculé.
- [x] Calcul: Échantillonner l'altitude du relief par direction autour du lieu actif et la projeter sur l'azimut de l'arche.
- [x] Interface: Ajouter un contrôle optionnel pour afficher ou masquer le profil de relief sans remplacer l'horizon astronomique.
- [x] Information: Indiquer les limites de l'estimation terrain et conserver les trajectoires astronomiques indépendantes.
- [x] Validation: Tester le comportement mobile, les coordonnées variables, TypeScript et Vitest avant publication.

## Soleil & Lune — transition fluide des marqueurs
- [x] Ajouter une transition CSS sur left/bottom des marqueurs Soleil et Lune pour un déplacement progressif lors de l'actualisation.
- [x] Respecter prefers-reduced-motion en désactivant la transition si l'utilisateur le demande.
- [x] Vérifier que la Lune ne reçoit aucune rotation ni animation décorative.

## Soleil & Lune — mode accéléré 24 h et rotation lunaire
- [x] Intégrer le hook useTimelapseSimulation dans le panneau actif avec bouton de déclenchement.
- [x] Rétablir la rotation 3D horizontale de la Lune sur l'arche (CSS keyframes + prefers-reduced-motion).
- [x] Valider TypeScript, Vitest et le rendu mobile avant publication.

## Soleil & Lune — contrôles lecture/pause/curseur et suppression rotation lunaire
- [x] Ajouter lecture, pause, reprise et arrêt au mode accéléré 24 h.
- [x] Ajouter un curseur interactif pour naviguer manuellement dans la simulation.
- [x] Supprimer la rotation 3D horizontale de la Lune (demande utilisateur).
- [x] Valider TypeScript, Vitest et le rendu mobile avant publication.

## Soleil & Lune — lisibilité des repères de trajectoire
- [x] Déplacer l’indication des astres sous l’horizon dans une zone dédiée, hors des pointillés.
- [x] Agrandir les repères horaires et leur donner un fond de contraste sans masquer les trajectoires.
- [x] Renforcer le contraste du tracé vert du relief local sans masquer les trajectoires célestes.
- [x] Vérifier l’absence de chevauchement sur mobile, TypeScript et Vitest avant publication.

## AI Lab — audit global du lexique
- [x] Inventorier le lexique déjà exposé et l’ensemble des modules utiles à l’utilisateur.
- [x] Identifier les méthodes, indicateurs, sources, limites et calculs encore absents du lexique.
- [x] Ajouter les définitions vérifiables du module Soleil & Lune, des prévisions, de la fiabilité et des stations.
- [x] Vérifier la couverture, la lisibilité mobile, TypeScript et Vitest avant publication.

## Correction de placement — diagrammes des prévisions détaillées
- [x] Restaurer le graphique horaire du Dashboard dans son rendu précédent.
- [x] Refondre uniquement le graphique de la page Prévisions détaillées en diagrammes sélectionnables.
- [x] Préserver les données réelles, les interactions et la lisibilité mobile dans les deux emplacements.
- [x] Valider TypeScript, Vitest et le rendu avant publication.

## Prévisions détaillées — suppression de la section Graphiques
- [x] Supprimer les onglets, diagrammes et cartes de détails horaires de la section Graphiques.
- [x] Retirer les états, types et composants devenus inutiles sans affecter le déroulé horaire ni les prochains jours.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Prévisions détaillées — cartes de période pour tous les jours
- [x] Vérifier la couverture horaire réelle disponible pour aujourd’hui, demain et les jours suivants.
- [x] Afficher Matin, Après-midi, Soir et Nuit pour chaque jour avec les données disponibles.
- [x] Distinguer clairement les valeurs issues du découpage horaire des valeurs quotidiennes agrégées, sans inventer de données.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Prévisions détaillées — confiance par créneau
- [x] Définir un indicateur basé sur l’accord horaire et la couverture réellement disponibles.
- [x] Afficher l’indicateur sur les cartes heure par heure.
- [x] Agréger l’indicateur sans interpolation pour les cartes Matin, Après-midi, Soir et Nuit.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Prévisions détaillées — accord multi-paramètres
- [x] Étendre les collectes multi-modèles horaires au vent, à l’humidité et à la nébulosité.
- [x] Calculer des accords transparents à partir des écarts réellement observés entre modèles.
- [x] Intégrer les nouveaux accords à l’indicateur des cartes heure par heure et de période.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Prévisions détaillées — accord détaillable et code couleur
- [x] Étendre les comparaisons multi-modèles aux rafales et à la direction du vent.
- [x] Ajouter un code couleur explicite pour le niveau d’accord global.
- [x] Afficher au toucher le détail des paramètres réellement inclus dans l’accord.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Prévisions détaillées — performances historiques qualifiées
- [x] Identifier les performances historiques qualifiées disponibles pour les modèles réellement comparés.
- [x] Calculer une contribution historique distincte de l’accord instantané, sans repli artificiel.
- [x] Afficher la contribution historique dans le détail des cartes horaires et de période.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Prévisions détaillées — historique par paramètre
- [x] Exposer les erreurs historiques qualifiées de température, précipitations et vent par modèle.
- [x] Présenter les valeurs par paramètre sans les convertir en score fictif.
- [x] Afficher le détail dans les cartes horaires et de période lorsque les mesures existent.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Maquette — accord global et écart thermique
- [x] Proposer une hiérarchie visuelle où l’accord global est prioritaire et l’écart thermique reste accessible.
- [x] Présenter une maquette de carte horaire mobile sans modifier l’application.

## Cartes horaires — hiérarchie accord global
- [x] Mettre l’accord global et son niveau au premier plan sous la température.
- [x] Déplacer l’écart thermique dans une action secondaire ouvrant la comparaison des contributeurs.
- [x] Conserver le détail par paramètre, les performances historiques et la lisibilité mobile.
- [x] Vérifier TypeScript, Vitest et le rendu avant publication.

## Carte détaillée principale — hiérarchie accord global
- [x] Mettre l’accord global au premier plan dans la vue détaillée de l’heure.
- [x] Conserver l’écart thermique et les deux contributeurs dans une action secondaire.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Carte principale — accord multi-paramètres complet
- [x] Transmettre les accords réels de vent, rafales, direction, humidité et nuages au flux horaire principal.
- [x] Afficher l’ensemble des paramètres disponibles dans le détail d’accord de la carte principale.
- [x] Conserver l’absence explicite de paramètres non reçus, sans score inventé.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Carte principale — détail explicite vent et humidité
- [x] Mettre en évidence les accords de vent et d’humidité dans le détail ouvert.
- [x] Conserver les valeurs seulement lorsqu’elles sont réellement comparées.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Accord global — légende des seuils
- [x] Définir les niveaux faible, modéré et élevé avec leurs bornes chiffrées.
- [x] Ajouter une légende accessible depuis le détail d’accord.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Accord global — légende visuellement harmonisée
- [x] Recomposer la légende avec les surfaces et espacements du panneau détaillé.
- [x] Conserver les couleurs des niveaux sans créer de rupture visuelle.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Accord global — animation de légende
- [x] Ajouter une entrée discrète fondée sur l’opacité et la translation.
- [x] Respecter la préférence de réduction des mouvements.
- [x] Vérifier TypeScript, Vitest et le rendu mobile avant publication.

## Accord global — fermeture animée de la légende
- [x] Préserver la légende dans le DOM durant l’animation de fermeture.
- [x] Animer la sortie avec opacité et translation, sans animer la géométrie de page.
- [x] Respecter la préférence de réduction des mouvements et vérifier TypeScript, Vitest et le rendu mobile.

## Collecte quotidienne — prévisions de 05h00
- [x] Vérifier la tâche planifiée et sa couverture des modèles actifs pour tous les lieux favoris.
- [x] Confirmer la collecte horaire et quotidienne des prévisions sans mélanger les observations de stations physiques.
- [x] Ajuster la tâche si nécessaire et vérifier son exécution.
- [x] Valider TypeScript, Vitest et la configuration planifiée avant publication.

## Page Stations — retrait des bilans techniques
- [x] Retirer les sections « Dernier bilan de collecte », « Disponibilité des stations » et « Preuves physiques pour le scoring ».
- [x] Nettoyer les données et imports devenus inutilisés sans retirer la collecte ni le scoring serveur.
- [x] Vérifier le rendu mobile de la page Stations, TypeScript et Vitest avant publication.

## Page Stations — bandeau de collecte discret
- [x] Simplifier visuellement le bandeau « Collecte 05h00 Paris » sans supprimer l’information d’automatisation.
- [x] Vérifier le rendu mobile, TypeScript et Vitest avant publication.

## Aides contextuelles — affichage et cohérence
- [x] Corriger l’ouverture de l’aide « Confiance synthèse » sans découpe ni invisibilité sur mobile.
- [x] Auditer les autres déclencheurs d’aide et harmoniser leur comportement entre les pages.
- [x] Vérifier les interactions mobiles, TypeScript et Vitest avant publication.

## Aides contextuelles — langage et style communs
- [x] Recenser les textes d’aide et définir une structure commune, concise et factuelle.
- [x] Uniformiser la mise en forme des panneaux d’aide et les textes existants sans inventer de données.
- [x] Vérifier les aides sur mobile, TypeScript et Vitest avant publication.

## AI Lab — aide des indicateurs de fusion
- [x] Exposer le calcul et les facteurs réellement disponibles pour Confiance prévision, Stabilité modèles et Modèles appliqués.
- [x] Ajouter un panneau d’aide accessible à chacune des trois cartes sans inventer de raison ou de pourcentage.
- [x] Vérifier le rendu mobile, TypeScript et Vitest avant publication.

## Aides contextuelles — contrôle discret et fermeture rapide
- [x] Réduire visuellement les déclencheurs d’aide sans diminuer leur accessibilité tactile.
- [x] Ajouter une croix de fermeture explicite à tous les panneaux d’aide contextuels.
- [x] Vérifier les interactions mobiles, TypeScript et Vitest avant publication.

## AI Lab — simulation de fusion et stations locales
- [x] Construire une frise pas-à-pas à partir des traces réelles : collecte, disponibilité, régime, poids, accord, confiance et résultat officiel.
- [x] Expliquer les données absentes sans les remplacer et distinguer clairement les snapshots archivés, courants et directs.
- [x] Ajouter une section de résultat final distincte pour les stations locales, leur fraîcheur, distance, cohérence et statut de contribution.
- [x] Vérifier le parcours mobile, TypeScript et Vitest avant publication.

## AI Lab — frise verticale de simulation
- [x] Réorganiser les étapes en repères verticaux à gauche et explication active à droite.
- [x] Préserver une disposition compacte et tactile sur mobile sans couper les libellés.
- [x] Vérifier les rendus mobile et ordinateur, TypeScript et Vitest avant publication.

## AI Lab — branche Stations dans la frise
- [x] Ajouter la recherche, le filtrage physique, la qualification et la synthèse locale comme étapes explicites.
- [x] Distinguer les observations de contexte, les contributions locales et les preuves qualifiées sans inventer de statut.
- [x] Vérifier le rendu de la branche, TypeScript et Vitest avant publication.

## AI Lab — snapshot et fusion archivée
- [x] Reformuler clairement la définition de snapshot pour un utilisateur novice.
- [x] Retirer uniquement la section « Dernière fusion archivée » sans modifier les autres contenus AI Lab.
- [x] Vérifier le rendu mobile, TypeScript et Vitest avant publication.

## AI Lab — aide débutant sur le snapshot
- [x] Ajouter une illustration simple de la photo du calcul à partir des données réellement présentes.
- [x] Rendre visibles la date, l’heure et le fuseau du snapshot dans la simulation.
- [x] Ajouter un parcours débutant dans le lexique et vérifier TypeScript, Vitest et le rendu mobile.

## AI Lab — en-tête simplifié
- [x] Retirer uniquement le bouton « Actualiser » de l’en-tête.
- [x] Conserver le bouton « Relancer » et valider TypeScript et Vitest avant publication.

## AI Lab — retrait de l’aide débutant
- [x] Retirer l’illustration et le texte d’aide débutant de la simulation.
- [x] Retirer uniquement la rubrique « Débuter dans l’AI Lab » du lexique.
- [x] Vérifier TypeScript et Vitest sans modifier les autres définitions du lexique.

## Navigation — Prévisions détaillées
- [x] Ajouter Prévisions détaillées entre Dashboard et Fiabilité dans la navigation principale.
- [x] Préserver la route et le contenu existants de la page détaillée.
- [x] Vérifier l’ordre mobile, TypeScript et Vitest avant publication.

## Dashboard — retrait du lien Prévisions détaillées
- [x] Retirer uniquement le lien « Voir les prévisions détaillées » du Dashboard.
- [x] Préserver la page Prévisions et son accès depuis la navigation principale.
- [x] Vérifier TypeScript et Vitest avant publication.

## Prévisions détaillées — carrousel horaire à deux cartes
- [x] Afficher exactement deux cartes horaires complètes à l’écran sur mobile.
- [x] Masquer les aperçus latéraux des cartes voisines sans casser le défilement tactile.
- [x] Vérifier le rendu mobile, TypeScript et Vitest avant publication.

## Interface — boutons de remontée uniformisés
- [x] Utiliser le style circulaire de la page principale pour tous les boutons de remontée.
- [x] Préserver le placement, l’accessibilité et le comportement de défilement.
- [x] Vérifier les rendus mobile et ordinateur, TypeScript et Vitest avant publication.

## Interface — boutons de remontée strictement circulaires
- [x] Forcer une largeur et une hauteur identiques, avec un cercle réel pour chaque bouton.
- [x] Vérifier qu’aucune page ne conserve un bouton rectangulaire ou carré arrondi.
- [x] Valider mobile, TypeScript et Vitest avant publication.

## Stations — retrait du détail de synthèse
- [x] Retirer uniquement le bouton « Détails de calcul de la synthèse ».
- [x] Préserver les indicateurs, le rayon, la carte et les autres sections Stations.
- [x] Vérifier TypeScript et Vitest avant publication.

## Dashboard — modes Local et Ultra-local réactifs
- [x] Mesurer les requêtes et calculs qui ralentissent le basculement Local et Ultra-local.
- [x] Optimiser le cache et le chargement sans retirer ni inventer de données.
- [x] Vérifier la réactivité mobile, TypeScript et Vitest avant publication.

## Correctifs — graphique horaire et audit technique
- [x] Corriger les clés dupliquées des heures dans le graphique du Dashboard.
- [x] Auditer les journaux et les composants météo pour identifier les autres défauts reproductibles.
- [x] Corriger uniquement les anomalies confirmées, avec des tests de non-régression.
- [x] Vérifier TypeScript, Vitest et les rendus avant publication.

## Graphique 48 h — transition de journée et modes locaux
- [x] Ajouter un séparateur visuel clair entre aujourd’hui et demain dans le graphique horaire.
- [x] Clarifier le comportement attendu du bouton de fermeture associé aux modes Local et Ultra-local.
- [x] Ajouter une croix qui ferme le bloc de contexte local et repasse en mode Officiel.
- [x] Vérifier TypeScript, Vitest et les rendus avant publication.

## Présentation PowerPoint — audit MeteoAI
- [x] Structurer les conclusions, preuves et priorités de l’audit. — Annulé à la demande de l’utilisateur.
- [x] Créer les diapositives PowerPoint et vérifier leur cohérence visuelle. — Annulé à la demande de l’utilisateur.
- [x] Livrer le support de présentation final. — Annulé à la demande de l’utilisateur.

## Corrections P0/P1 — moteur futur et affichage uniquement
- [x] Relever les invariants sans modifier les données persistées.
- [x] Signaler les données insuffisantes et réordonner les règles froid, neige et verglas.
- [x] Rendre les replis de fiabilité non mesurés explicites dans les calculs et l’interface.
- [x] Corriger le bilan de collecte des nouveaux scores, sans recalcul de l’historique.
- [x] Vérifier la confiance et les poids par variable du mode Ultra-local.
- [x] Unifier provenance, couverture et fraîcheur affichées entre les pages.
- [x] Ajouter un repli Dashboard quotidien daté et des diagnostics fournisseurs sans inventer d’heures.
- [x] Corriger la lecture des réponses HTTP et stabiliser la compilation avant publication.
- [x] Confirmer par test la réutilisation d’une réponse consommée et la reprise après délai réseau.
- [x] Valider TypeScript, Vitest, rendu et invariants de données avant publication.

## Validation ciblée — diagnostic fournisseur
- [x] Redémarrer le service de développement sans opération de données.
- [x] Revalider le test de diagnostic fournisseur sur les sources actuelles.

## Vérification post-restauration bcd2c15
- [x] Restaurer seulement les fichiers de code validés depuis bcd2c15, sans opération de base de données.
- [x] Retirer uniquement les artefacts de travail déjà archivés et conserver les rapports de référence.
- [x] Vérifier le code restauré, TypeScript, Vitest et les compteurs protégés avant toute nouvelle correction.
- [x] Corriger uniquement le contrat Ultra-local attendu par les tests, sans modification de données ni de tests.

## Invariants avec collectes physiques actives
- [x] Protéger strictement prévisions, scores, stations, favoris, intégrations et configurations des corrections de code.
- [x] Autoriser uniquement les ajouts horodatés normaux de relevés physiques pendant les validations.

## Fiabilisation nécessaire — ordre validé
- [x] Retirer les panneaux Prévision horaire officielle et Deux indicateurs différents de Prévisions, Fiabilité, Stations et AI Lab.
- [x] Préserver les composants métier, données de provenance et contenus propres à chacune des quatre pages.
- [x] Vérifier les quatre pages après simplification sur mobile et desktop.
- [x] Placer une flèche de divulgation à droite de Confiance prévision.
- [x] Masquer initialement les panneaux Prévision horaire officielle et Deux indicateurs différents.
- [x] Ouvrir les deux panneaux ensemble avec la flèche et les fermer avec une croix tactile accessible.
- [x] Rétablir le régime dominant dans la carte météo principale au-dessus de la température.
- [x] Retirer le panneau de régime intermédiaire entre Contexte et Mes observations.
- [x] Vérifier que les détails et probabilités du régime restent inchangés.
- [x] Déplacer le régime dominant entre les modes Officiel/Local/Ultra-local et Mes observations.
- [x] Conserver les détails, probabilités et données du régime sans modification.
- [x] Vérifier le nouvel ordre sur mobile et desktop.
- [x] Remonter la carte Historique des prévisions juste sous l’en-tête de la page Stations.
- [x] Renforcer le contour de la carte Historique avec un vert distinct et accessible.
- [x] Vérifier le rendu mobile sans modifier l’accès à la page Historique.
- [x] Ajouter dans Stations une section ouvrant la page Historique complète.
- [x] Retirer l’icône Historique de la navigation principale sans supprimer la route ni son contenu.
- [x] Vérifier que tous les détails, graphiques et interactions de l’Historique restent accessibles depuis Stations.
- [x] Corriger la croix de fermeture du panneau d’observation Historique pour les gestes tactiles.
- [x] Vérifier que la fermeture masque le tooltip sans modifier la sélection ou les données du graphique.
- [x] Remonter Confiance prévision, Stabilité modèles et Modèles appliqués en tête de l’AI Lab.
- [x] Conserver les aides, valeurs et la grille à trois cartes sur mobile.
- [x] Vérifier que la frise des observations physiques reste sous les indicateurs.
- [x] Intégrer au compte rendu 05h00 la fraîcheur et le statut des derniers snapshots de stations existants.
- [x] Distinguer les stations physiques validées, candidates et indisponibles sans générer de nouveau relevé.
- [x] Tester le bilan de stations sans modifier la cadence de collecte horaire ni l’historique.
- [x] Auditer la couverture 05h00 des huit modèles, des favoris et des stations disponibles sans modifier la collecte.
- [x] Présenter les options de couverture ou de rapport de collecte avant toute modification des prévisions futures.
- [x] Valider toute correction de collecte sans réécrire l’historique météo.
- [x] Ajouter une croix tactile et accessible pour fermer le panneau d’observation détaillé de l’Historique.
- [x] Vérifier que la fermeture ne désélectionne ni ne modifie les données du graphique.
- [x] Déplacer complètement le libellé Soleil/Lune sous l’arche graphique dans le flux normal de la carte.
- [x] Préserver un espacement distinct avant la ligne d’horaires.
- [x] Vérifier l’absence de positionnement absolu du libellé dans la zone de l’arche.
- [x] Descendre l’indication sous l’horizon tout en conservant une grille d’espacement identique avec l’arche et les horaires.
- [x] Vérifier l’alignement régulier sur mobile et desktop avant publication.
- [x] Placer l’indication Soleil/Lune sous l’horizon dans une zone distincte de l’arche.
- [x] Réserver un espacement clair avant les horaires Lever/Coucher et Soleil/Lune.
- [x] Vérifier l’absence de chevauchement sur mobile et desktop.
- [x] Ajouter des commandes séparées d’alerte visuelle et sonore, désactivées par défaut, pour le début local d’éclipse.
- [x] Déclencher l’alerte une seule fois après activation explicite et seulement dans la fenêtre calculée.
- [x] Préserver les permissions du navigateur et un repli silencieux lorsqu’elles sont refusées ou indisponibles.
- [x] Ajouter un bouton de mode plein écran au suivi de l’éclipse et de ses circonstances locales.
- [x] Prévoir une sortie accessible, la touche Échap et un repli lorsque le navigateur refuse le plein écran.
- [x] Vérifier le mode immersif sur mobile sans masquer les informations de visibilité locale.
- [x] Déterminer l’état « éclipse en cours » exclusivement depuis les circonstances locales début/fin.
- [x] Ajouter un clignotement discret seulement dans cette fenêtre, avec respect de prefers-reduced-motion.
- [x] Tester les états avant, pendant et après l’éclipse sans animation hors fenêtre.
- [x] Identifier les circonstances locales d’éclipse déjà calculées pour le lieu actif.
- [x] Afficher un indicateur de visibilité locale accompagné d’une infobulle accessible.
- [x] Couvrir les états visible, partielle et indisponible sans valeur fictive.
- [x] Vérifier les conversions UTC/Europe-Paris des horaires de Soleil, de Lune et de l’horodatage astronomique.
- [x] Vérifier les dates de prochaines phases lunaires contre le moteur astronomique et une source de référence.
- [x] Corriger uniquement les anomalies prouvées sans modifier les données météo historiques.
- [x] Couvrir les horaires d’été, d’hiver et les jalons de phase par des tests de régression.
- [x] Adapter l’intensité de la lueur lunaire à la nébulosité réelle disponible pour le lieu actif.
- [x] Préserver une lueur neutre et signaler implicitement l’absence de nébulosité plutôt que d’inventer une couverture.
- [x] Tester les niveaux de lueur sous ciel clair, partiellement nuageux, couvert et sans donnée.
- [x] Ajouter une lueur lunaire légère et animée autour de la Lune réaliste, avec prise en charge de prefers-reduced-motion.
- [x] Vérifier le rendu mobile et les tests du module Soleil & Lune avant publication.
- [x] Identifier le visuel de Lune réaliste précédent et le composant qui l’a remplacé dans l’arche astronomique.
- [x] Rétablir la Lune réaliste dans l’arche et dans le panneau de phase, sans modifier phase, azimut, altitude ou calculs.
- [x] Vérifier le rendu mobile du module Soleil & Lune et les tests astronomiques avant publication.
- [x] Auditer et unifier les définitions de stabilité et confiance dans les calculs, libellés et aides concernés.
- [x] Afficher les poids réels par paramètre de la dernière fusion dans l’AI Lab, sans valeur de démonstration.
- [x] Exposer et visualiser l’évolution réelle de la MAE et du score d’humidité par modèle.
- [x] Valider les trois améliorations sans modifier les données historiques ni créer de valeurs fictives.
- [x] Auditer les poids officiels de température, pluie, vent et humidité ainsi que les preuves qualifiées disponibles.
- [x] Proposer une pondération par paramètre fondée uniquement sur des scores observés et suffisants.
- [x] Ajouter, après confirmation, une colonne d’humidité nullable à la synthèse future sans remplir ni recalculer l’historique.
- [x] Tester les poids distincts, l’absence de preuve et l’invariance des autres paramètres.
- [x] Valider la fusion future sans recalculer les prévisions ni scores historiques.
- [x] Auditer le déclencheur 05h00, les exécutions récentes et l’idempotence de la collecte sans modifier la planification.
- [x] Proposer le correctif minimal de collecte ou de planification avant toute modification affectant les prévisions futures.
- [x] Remplacer l’autorisation expirée de la tâche 05h00 puis désactiver l’ancienne tâche seulement après création réussie.
- [x] Valider le correctif de collecte sans recalculer ni modifier l’historique existant.
- [x] Repartir d’une arborescence synchronisée depuis le jalon stable `bcd2c15`.
- [x] Ajouter un repli Dashboard quotidien daté sans donnée horaire inventée.
- [x] Exposer explicitement le statut, la date et l’horodatage de la dernière fusion quotidienne lorsque les horaires sont indisponibles.
- [x] Empêcher la carte principale de présenter une valeur quotidienne comme une observation horaire actuelle.
- [x] Couvrir le repli quotidien daté par des tests sans écriture en base.
- [x] Mesurer délais, erreurs, reprises et fraîcheur par fournisseur météo.
- [x] Instrumenter en mémoire les appels fournisseur, sans persister de diagnostics en base.
- [x] Exposer la dernière mesure réelle et l’état d’indisponibilité sans valeur par défaut.
- [x] Couvrir les mesures de succès, erreur et nouvelle tentative par des tests unitaires.
- [x] Harmoniser provenance, couverture et motifs de repli entre les pages.
- [x] Créer un contrat de provenance commun, calculé uniquement depuis le snapshot officiel et la dernière fusion quotidienne réelle.
- [x] Afficher le même indicateur compact dans Dashboard, Prévisions, Fiabilité, Stations et AI Lab.
- [x] Tester les provenances horaire, quotidienne de repli et indisponible sans donnée fictive.
- [x] Consolider les garde-fous de confiance et les tests Ultra-local par variable.
- [x] Renvoyer une confiance nulle et un motif explicite lorsqu’une variable ne dispose pas de preuve locale suffisante.
- [x] Couvrir température, humidité, précipitations, vent et rafales avec stations propres, manquantes ou écartées.
- [x] Vérifier que l’absence d’une variable n’affecte pas les poids ni les confiances des autres variables.
- [x] Valider TypeScript, Vitest, rendu et invariants de données avant publication.
- [x] Retirer la ligne Accord pluie des cartes de prévisions heure par heure.
- [x] Réduire légèrement la hauteur de la pastille Accord global des cartes heure par heure.
- [x] Compacter encore légèrement la pastille Accord global dans les cartes heure par heure.
- [x] Afficher des détails de conditions météorologiques uniquement lorsqu’ils sont disponibles dans chaque créneau horaire.
- [x] Retirer Visibilité et Rayonnement des détails de conditions des cartes horaires.
- [x] Afficher la direction cardinale du vent avec la vitesse et les rafales dans chaque carte horaire.
- [x] Harmoniser le libellé et l’unité des rafales dans les cartes quotidiennes avec les cartes horaires.
- [x] Rééquilibrer l’espacement interne de la grille des détails quotidiens après le regroupement Vent et rafales.
- [x] Retirer le séparateur entre la pastille Accord et les métriques Humidité/Vent des cartes horaires.
- [x] Réduire l’espace inférieur des cartes horaires sous les couches nuageuses.
- [x] Harmoniser les espaces entre les pastilles de conditions horaires.
- [x] Décaler légèrement la pastille Couches nuageuses sous les autres pastilles.
- [x] Réduire la hauteur excédentaire entre les couches nuageuses et la bordure basse des cartes horaires.
- [x] Agrandir légèrement les cartes du carrousel heure par heure.
- [x] Rapprocher l’indication de défilement sous les cartes horaires.
- [x] Agrandir encore légèrement la zone interne des cartes horaires.
- [x] Réduire la hauteur des pastilles Accord des cartes horaires en préservant leur libellé et leur action tactile.
- [x] Compacter encore la hauteur des pastilles Accord sans réduire leur libellé.
- [x] Augmenter très légèrement la hauteur des pastilles Accord tout en conservant le format compact.
- [x] Augmenter encore légèrement la hauteur des pastilles Accord en conservant le centrage du texte.
- [x] Augmenter la hauteur et l’espacement interne de la pastille Couches nuageuses des cartes horaires.
- [x] Augmenter de nouveau la hauteur des pastilles Accord tout en conservant leur centrage et leur détail tactile.
- [x] Afficher les panneaux Prévision horaire officielle et Deux indicateurs différents ouverts au-dessus des autres cartes du Dashboard.
- [x] Uniformiser les pastilles Note par modèle afin que leur texte reste sur une ligne sur mobile.
- [x] Attribuer une couleur distinctive à chaque diagramme de modèle dans l’évolution d’humidité.
- [x] Remplacer les diagrammes d’évolution d’humidité par les scores globaux réellement archivés par modèle.
- [x] Agrandir les valeurs de score global et afficher les dates au format français long dans les diagrammes.
- [x] Trier les diagrammes de score global du meilleur modèle au moins bon selon leur moyenne réellement archivée.
- [x] Afficher un badge Meilleur modèle sur la première carte classée de score global.
- [x] Placer les scores globaux par modèle avant les tendances provisoires.
- [x] Déplacer la section Fiabilité en bref sous les tendances provisoires.
- [x] Mettre en évidence le meilleur modèle réellement classé dans la section Prévisions.
- [x] Ajouter en tête du lexique une présentation claire de la philosophie et de l’objectif de MeteoAI.
- [x] Ajouter des conditions observées plus précises, notamment Très nuageux et Quelques gouttes, avec leurs correspondances de comparaison.
- [x] Renommer le libellé de nébulosité en État du ciel pour le distinguer du phénomène actuel.
- [x] Vérifier les couches nationales françaises réutilisables gratuitement pour une carte météo multi-couches.
- [x] Proposer une carte Prévisions avec couches précipitations, température, vent, humidité, nuages et pression selon les données confirmées.
- [x] Diagnostiquer l’absence apparente des bandes de couverture et des stations locales dans les modes Local et Ultra-local.
- [x] Diagnostiquer pourquoi la note de preuve est identique pour plusieurs modèles et paramètres malgré des performances différentes.
- [x] Masquer les notes de couverture comme 29/100 dans les sections de tendances du Laboratoire.
- [x] Ajouter un panneau déroulant expliquant le score de précipitation, avec une croix de fermeture rapide.
- [x] Ajouter des panneaux déroulants explicatifs pour la MAE de température, le vent et l’humidité, avec des croix de fermeture rapide.
- [x] Afficher les explications de tendance dans des fenêtres plein écran avec fermeture rapide.
- [x] Vérifier et différencier les rayons de stations des modes Local et Ultra-local sans altérer les données historiques.
- [x] Définir un Ultra-local 0–10 km et un mode Local élargi avec des repli explicites, après confirmation.
- [x] Appliquer les rayons et pondérations confirmés aux calculs futurs sans recalculer l’historique.

## Dashboard — transparence locale et carte météo multi-couches
- [x] Réafficher les bandes de couverture et les stations réellement contributrices dans les blocs Local et Ultra-local du Dashboard.
- [x] Vérifier que les informations de couverture et de contribution suivent exactement le rayon actif, sans modifier les données historiques.
- [x] Finaliser le périmètre fonctionnel, les sources et les limites de la carte météo multi-couches de la page Prévisions.
- [x] Ajouter au lexique AI Lab l’explication de la collecte, qualification et analyse nocturne des observations réelles.
- [x] Ajouter dans l’Historique, pour chaque soir, la couverture obtenue, les stations utilisées et le motif d’exclusion éventuel.
- [x] Retirer la commande Vue réelle intégrée, agrandir la carte des stations et déplacer son bouton d’agrandissement sous la carte.
- [x] Ajouter un bouton de zoom qui recentre la carte des stations sur le lieu actif.
- [x] Ajouter une action permettant de revenir au cadrage normal de la carte après le zoom.
- [x] Ajouter dans la carte agrandie des boutons + et − espacés de la fermeture et des commandes natives, sans chevauchement.
- [x] Ajouter un bouton de centrage dans la carte agrandie, afficher le niveau de zoom et permettre le choix Satellite/Plan dans la vue compacte.
- [x] Repositionner les commandes personnalisées de la carte agrandie en bas à droite, avec des espaces réguliers entre chaque bouton.
- [x] Conserver uniquement les commandes Plan et Satellite en haut de la carte agrandie.
- [x] Ajouter une légende repliable expliquant les marqueurs du lieu de référence et des stations selon la fraîcheur de leur relevé.
- [x] Aligner les commandes de centrage et de zoom de la carte agrandie dans une colonne de référence sur le côté droit.
- [x] Conserver la position actuelle des commandes et appliquer le design clair de la référence aux boutons de centrage et de zoom.
- [x] Reproduire fidèlement le style de la référence pour le centrage et le contrôle de zoom, sans changer leurs positions.
- [x] Reproduire fidèlement le contrôle + / − et le bouton de fermeture selon la géométrie de la référence, à position constante.
- [x] Réduire uniformément les commandes de centrage, zoom et fermeture à droite de la carte agrandie sans modifier leurs positions.
- [x] Reproduire dans la carte de visibilité d’éclipse agrandie les mêmes commandes et emplacements que la carte des stations.
- [x] Conserver strictement les positions actuelles de la boussole et du bouton d’opacité de la carte d’éclipse.
- [x] Retirer le bouton d’alerte sonore de la carte d’éclipse agrandie et réduire Plan/Satellite pour éviter tout chevauchement avec la fermeture.
- [x] Agrandir la carte compacte d’éclipse, empêcher son défilement et maintenir le repère du lieu actif visible.
- [x] Permettre le défilement vertical de la page sur la carte compacte fixe sans réactiver les gestes cartographiques.
- [x] Indiquer dans l’aide de température que le biais mesure une tendance plus chaude ou plus froide, distincte de la MAE.
- [x] Afficher le biais thermique réel par modèle et une pastille plutôt chaud ou plutôt froid uniquement lorsque le biais est mesuré.
- [x] Ajouter au panneau d’aide de température une explication claire du RMSE et de son rôle pour les écarts importants.
- [x] Réaliser un audit complet non destructif des calculs, données, collectes, résilience serveur et interfaces MeteoAI.
- [x] Afficher le bilan réel de la collecte de 05 h 00 des huit modèles, distinct des observations de stations et sans modifier la planification.
- [x] Corriger le cache HTTP afin de ne jamais réutiliser une réponse consommée.
- [x] Ajouter des états de délai, d’erreur et de réessai contrôlé dans Prévisions et AI Lab.
- [x] Préparer l’isolement des erreurs de collecte horaire par favori sans le déployer sans confirmation explicite.
- [x] Appliquer l’isolement confirmé des erreurs par favori dans la collecte horaire, avec statut partiel explicite.
- [x] Relancer automatiquement une fois les seuls favoris en échec lors de la collecte horaire, sans réécrire les snapshots existants.
- [x] Déplacer le bilan de collecte des prévisions du Dashboard vers l’AI Lab sans modifier les données ni le contrat serveur.
