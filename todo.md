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
