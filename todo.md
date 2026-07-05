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
