# Station API Research

## Infoclimat (infoclimat.fr/opendata)
- **URL**: https://www.infoclimat.fr/opendata/
- **Auth**: Requires free account + API key (non-commercial use free)
- **Data**: Réseau StatIC (amateur), stations officielles MF, Météo à l'École
- **Format**: JSON or CSV, max 7 days per query
- **Endpoint pattern**: https://www.infoclimat.fr/opendata/?method=get&user=USER&key=KEY&...
- **Note**: API key needed — must use as optional/fallback source

## Météo-France Official API (portail-api.meteofrance.fr)
- **URL**: https://public-api.meteofrance.fr/public/DPObs/
- **Auth**: OAuth2 Bearer token (free registration on portail-api.meteofrance.fr)
- **Endpoints**:
  - `/liste-stations` — list all MF stations
  - `/station/infrahoraire-6m?id_station=XXXXXXXX` — 6-min observations
  - `/station/horaire?id_station=XXXXXXXX` — hourly observations
  - `/v1/synop?format=json` — SYNOP tri-hourly all stations
- **Data retention**: 24h only
- **Note**: Requires OAuth2 token — use as optional/fallback

## Open-Meteo (free, no key)
- **Current weather**: https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&current=temperature_2m,...
- **Historical**: https://archive-api.open-meteo.com/v1/archive
- **No station list API** — returns grid point data only
- **Already integrated** in stationService.ts

## OpenDataSoft SYNOP (free, no key)
- **URL**: https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/donnees-synop-essentielles-omm/records
- **Filter**: lat/lon bounding box
- **Already integrated** in stationService.ts as fetchMeteoFranceStations

## Meteostat (RapidAPI)
- **URL**: https://meteostat.p.rapidapi.com
- **Auth**: RapidAPI key (500 free calls/month)
- **Endpoints**: /stations/nearby?lat=X&lon=Y&radius=R, /stations/hourly?station=ID
- **Note**: Very useful for nearby station discovery with historical data

## APRS/CWOP (free)
- **URL**: https://api.aprs.fi/api/get?name=CW&what=wx&apikey=KEY&format=json
- **Note**: Requires free APRS.fi API key

## Netatmo (OAuth2)
- **URL**: https://api.netatmo.com/api/getpublicdata
- **Auth**: OAuth2 (free developer account)
- **Params**: lat_ne, lon_ne, lat_sw, lon_sw (bounding box)
- **Note**: Requires OAuth2 — use as optional

## Strategy for Implementation
Since most APIs require keys, use a tiered approach:
1. **Free/no-key**: Open-Meteo grid + OpenDataSoft SYNOP (already working)
2. **With API keys (optional)**: Météo-France OAuth2, Netatmo OAuth2, Meteostat RapidAPI
3. **Simulation for missing sources**: Generate realistic nearby stations based on real geographic data
4. **Best approach**: Use Open-Meteo's `nearby_weather_stations` feature + multiple grid points around the location to simulate a station network
