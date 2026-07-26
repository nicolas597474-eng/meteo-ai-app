/**
 * Test en direct des APIs météo réelles (OpenWeatherMap + Météo-France via Open-Meteo)
 * Usage: node scripts/test-real-apis.mjs
 */

import { config } from "dotenv";
config({ path: ".env" });

const OWM_KEY = process.env.OPENWEATHERMAP_API_KEY;
const MF_KEY = process.env.METEOFRANCE_API_KEY;

const LAT = 50.7167;
const LON = 2.5667;
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

console.log(`\n🌤  Test APIs météo réelles — ${TODAY}`);
console.log(`📍 Coordonnées : ${LAT}, ${LON} (Hondeghem)\n`);

// ─── OpenWeatherMap ───────────────────────────────────────────────────────────
async function testOWM() {
  if (!OWM_KEY) { console.log("❌ OWM : clé absente"); return; }
  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&appid=${OWM_KEY}&units=metric&lang=fr&cnt=40`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) { console.log(`❌ OWM HTTP ${res.status}: ${data.message}`); return; }

    const list = data.list ?? [];
    console.log(`✅ OWM : ${list.length} tranches reçues`);
    const daySlices = list.filter((item) => item.dt_txt?.startsWith(TOMORROW));
    if (daySlices.length > 0) {
      const temps = daySlices.map((s) => s.main?.temp).filter(Boolean);
      const precips = daySlices.map((s) => (s.rain?.["3h"] ?? 0) + (s.snow?.["3h"] ?? 0));
      const winds = daySlices.map((s) => (s.wind?.speed ?? 0) * 3.6);
      const midday = daySlices.find((s) => s.dt_txt?.includes("12:00:00")) ?? daySlices[0];
      console.log(`   📅 ${TOMORROW} (${daySlices.length} tranches)`);
      console.log(`   🌡  Temp: ${Math.min(...temps).toFixed(1)}°C — ${Math.max(...temps).toFixed(1)}°C`);
      console.log(`   🌧  Précip: ${precips.reduce((a, b) => a + b, 0).toFixed(1)} mm`);
      console.log(`   💨  Vent max: ${Math.max(...winds).toFixed(1)} km/h`);
      console.log(`   ☁️  Condition: ${midday?.weather?.[0]?.description ?? "N/A"}`);
    } else {
      const firstDate = list[0]?.dt_txt?.slice(0, 10);
      const firstSlices = list.filter((s) => s.dt_txt?.startsWith(firstDate));
      const temps = firstSlices.map((s) => s.main?.temp).filter(Boolean);
      console.log(`   📅 Premier jour disponible: ${firstDate}`);
      if (temps.length > 0) console.log(`   🌡  Temp: ${Math.min(...temps).toFixed(1)}°C — ${Math.max(...temps).toFixed(1)}°C`);
    }
  } catch (err) {
    console.log(`❌ OWM erreur: ${err.message}`);
  }
}

// ─── Météo-France via Open-Meteo (ARPEGE/AROME natif) ────────────────────────
async function testMFOpenMeteo() {
  try {
    const url = new URL("https://api.open-meteo.com/v1/meteofrance");
    url.searchParams.set("latitude", LAT.toString());
    url.searchParams.set("longitude", LON.toString());
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,windgusts_10m_max,weathercode,cloudcover_mean");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("forecast_days", "15");

    const res = await fetch(url.toString());
    if (!res.ok) { console.log(`❌ MF-OM HTTP ${res.status}`); return; }

    const data = await res.json();
    const daily = data.daily;
    if (!daily?.time) { console.log("❌ MF-OM : pas de données daily"); return; }

    const idx = daily.time.indexOf(TOMORROW);
    const targetIdx = idx !== -1 ? idx : 1; // J+1 par défaut
    const targetDate = daily.time[targetIdx];

    const wmoCode = daily.weathercode?.[targetIdx] ?? 0;
    const conditions = ["Ensoleillé","Partiellement nuageux","Partiellement nuageux","Couvert","Brouillard","Bruine","Pluie","Neige","Averses","Orages","Orage violent"];
    const condIdx = wmoCode === 0 ? 0 : wmoCode <= 2 ? 1 : wmoCode === 3 ? 3 : wmoCode <= 49 ? 4 : wmoCode <= 59 ? 5 : wmoCode <= 69 ? 6 : wmoCode <= 79 ? 7 : wmoCode <= 84 ? 8 : wmoCode <= 94 ? 9 : 10;

    console.log(`✅ MF via Open-Meteo (ARPEGE/AROME) : ${daily.time.length} jours reçus`);
    console.log(`   📅 ${targetDate}`);
    console.log(`   🌡  Temp: ${daily.temperature_2m_min?.[targetIdx]}°C — ${daily.temperature_2m_max?.[targetIdx]}°C`);
    console.log(`   🌧  Précip: ${daily.precipitation_sum?.[targetIdx]} mm`);
    console.log(`   💨  Vent max: ${daily.windspeed_10m_max?.[targetIdx]} km/h (rafales: ${daily.windgusts_10m_max?.[targetIdx]} km/h)`);
    console.log(`   ☁️  Couverture nuageuse: ${daily.cloudcover_mean?.[targetIdx]}%`);
    console.log(`   🌦  Condition (WMO ${wmoCode}): ${conditions[condIdx]}`);
  } catch (err) {
    console.log(`❌ MF-OM erreur: ${err.message}`);
  }
}

// ─── Météo-France via portail OAuth2 (si clé disponible) ─────────────────────
async function testMFPortail() {
  if (!MF_KEY) { console.log("ℹ️  MF Portail : clé OAuth2 non configurée (fallback Open-Meteo utilisé)"); return; }

  console.log("   🔑 Échange OAuth2 en cours...");
  let bearerToken = null;
  try {
    const tokenRes = await fetch("https://portail-api.meteofrance.fr/token", {
      method: "POST",
      headers: { Authorization: `Basic ${MF_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      bearerToken = tokenData.access_token;
      console.log(`   ✅ Token obtenu (expire dans ${tokenData.expires_in}s)`);
    } else {
      const txt = await tokenRes.text();
      console.log(`   ⚠️  Token exchange HTTP ${tokenRes.status} — fallback Open-Meteo utilisé`);
      console.log(`   Détail: ${txt.slice(0, 150)}`);
      return;
    }
  } catch (err) {
    console.log(`   ⚠️  Token exchange erreur: ${err.message} — fallback Open-Meteo utilisé`);
    return;
  }

  try {
    const url = `https://rpcache-aa.meteofrance.com/internet2018client/2.0/forecast?lat=${LAT}&lon=${LON}&lang=fr`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      const daily = data?.daily_forecast ?? [];
      console.log(`✅ MF Portail (prévisions officielles) : ${daily.length} jours reçus`);
      if (daily.length > 0) {
        const d = daily[0];
        const date = new Date(d.dt * 1000).toISOString().slice(0, 10);
        console.log(`   📅 ${date} | 🌡 ${d.T?.min}°C — ${d.T?.max}°C | 🌧 ${d.precipitation?.["24h"]} mm | ☁️ ${d.weather?.desc}`);
      }
    } else {
      const text = await res.text();
      console.log(`   ⚠️  MF Portail HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`   ⚠️  MF Portail erreur: ${err.message}`);
  }
}

await testOWM();
console.log();
console.log("--- Météo-France ---");
await testMFOpenMeteo();
console.log();
await testMFPortail();
console.log("\n✅ Tests terminés\n");
