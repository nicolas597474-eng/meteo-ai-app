import { fromArrayBuffer } from "geotiff";
import { ENV } from "./_core/env";
import { HONDEGHEM } from "./weatherServices";

export const AROME_WCS_PROFILE = "MF-NWP-HIGHRES-AROME-001-FRANCE-WCS";
const AROME_WCS_BASE = `https://public-api.meteofrance.fr/public/arome/1.0/wcs/${AROME_WCS_PROFILE}`;
const METEOFRANCE_TOKEN_URL = "https://portail-api.meteofrance.fr/token";
const OPEN_METEO_SINGLE_RUNS = "https://single-runs-api.open-meteo.com/v1/forecast";
const OPEN_METEO_MODEL = "meteofrance_arome_france_hd";
const MAX_HOURS = 24;
const METRICS = ["temperature", "precipitation", "windSpeed"] as const;
export type AromeShadowMetric = typeof METRICS[number];
export type AromeShadowStatus = "ok" | "partial" | "missing-key" | "authentication-error" | "request-impossible";

const COVERAGE_PATTERNS: Record<AromeShadowMetric, RegExp> = {
  temperature: /^TEMPERATURE__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___/i,
  precipitation: /^TOTAL_WATER_PRECIPITATION__GROUND_OR_WATER_SURFACE___/i,
  windSpeed: /^WIND_SPEED__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___/i,
};
const METRIC_UNITS: Record<AromeShadowMetric, string> = {
  temperature: "°C",
  precipitation: "mm / heure",
  windSpeed: "km/h",
};

export interface AromeShadowMetricValue {
  arome: number | null;
  openMeteoArome: number | null;
  difference: number | null;
  unit: string;
  issue?: string;
}
export interface AromeShadowHour {
  validAt: string;
  metrics: Record<AromeShadowMetric, AromeShadowMetricValue>;
}
export interface AromeShadowDailyMetric {
  arome: number | null;
  openMeteoArome: number | null;
  difference: number | null;
  unit: string;
  hours: number;
}
export interface AromeShadowDaily {
  date: string;
  metrics: Record<AromeShadowMetric, AromeShadowDailyMetric>;
}
export interface AromeHondeghemShadowResult {
  status: AromeShadowStatus;
  message: string;
  location: { name: "Hondeghem"; lat: number; lon: number };
  profile: string;
  openMeteoModel: string;
  run: string | null;
  openMeteoRun: string | null;
  comparedAt: string;
  hourly: AromeShadowHour[];
  daily: AromeShadowDaily[];
  missing: string[];
}

interface CoverageChoice {
  metric: AromeShadowMetric;
  id: string;
  run: string;
  period: string | null;
}
interface CoverageMetadata {
  validAt: string[];
  heights: number[];
  unit: string | null;
  axisLabels: string[];
  axisUnits: Record<string, string>;
}
interface ForecastSeries {
  time: string[];
  temperature: Array<number | null>;
  precipitation: Array<number | null>;
  windSpeed: Array<number | null>;
}
type FetchLike = typeof fetch;

function emptyMetric(metric: AromeShadowMetric, issue?: string): AromeShadowMetricValue {
  return { arome: null, openMeteoArome: null, difference: null, unit: METRIC_UNITS[metric], ...(issue ? { issue } : {}) };
}
function baseResult(status: AromeShadowStatus, message: string, comparedAt: string): AromeHondeghemShadowResult {
  return {
    status,
    message,
    location: { name: "Hondeghem", lat: HONDEGHEM.lat, lon: HONDEGHEM.lon },
    profile: AROME_WCS_PROFILE,
    openMeteoModel: OPEN_METEO_MODEL,
    run: null,
    openMeteoRun: null,
    comparedAt,
    hourly: [],
    daily: [],
    missing: [],
  };
}
function localTagText(xml: string, localName: string): string[] {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:(?:[\\w.-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escaped}\\s*>`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) values.push(match[1].replace(/<[^>]*>/g, "").trim());
  return values;
}
function decodeXml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function localTagBlocks(xml: string, localName: string): string[] {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:(?:[\\w.-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escaped}\\s*>`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) values.push(match[1]);
  return values;
}
function parseRunFromCoverageId(id: string): { run: string; period: string | null } | null {
  const match = id.match(/___(\d{4}-\d{2}-\d{2}T\d{2}\.\d{2}\.\d{2}Z)(?:_(P[T\dHMS]+))?$/i);
  if (!match) return null;
  const run = match[1].replace(/(\d{2})\.(\d{2})\.(\d{2})Z$/, "$1:$2:$3Z");
  return Number.isFinite(Date.parse(run)) ? { run, period: match[2] ?? null } : null;
}
function chooseLatestRun(coverageIds: string[]): { run: string; choices: Partial<Record<AromeShadowMetric, CoverageChoice>> } | null {
  const byRun = new Map<string, Partial<Record<AromeShadowMetric, CoverageChoice>>>();
  for (const id of coverageIds) {
    const parsedRun = parseRunFromCoverageId(id);
    if (!parsedRun) continue;
    const metric = METRICS.find((candidate) => COVERAGE_PATTERNS[candidate].test(id));
    if (!metric) continue;
    if (metric === "precipitation" && parsedRun.period !== "PT1H") continue;
    const choices = byRun.get(parsedRun.run) ?? {};
    if (!choices[metric]) choices[metric] = { metric, id: decodeXml(id), run: parsedRun.run, period: parsedRun.period };
    byRun.set(parsedRun.run, choices);
  }
  const candidates = Array.from(byRun.entries())
    .filter(([, choices]) => choices.temperature || choices.windSpeed || choices.precipitation)
    .sort(([a], [b]) => Date.parse(b) - Date.parse(a));
  return candidates.length ? { run: candidates[0][0], choices: candidates[0][1] } : null;
}
function advertisedGeoTiffFormat(xml: string): string | null {
  const supported: string[] = [...localTagText(xml, "formatSupported")];
  const parameterPattern = /<(?:[\w.-]+:)?Parameter\b[^>]*\bname=["']format["'][^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Parameter\s*>/gi;
  let parameterMatch: RegExpExecArray | null;
  while ((parameterMatch = parameterPattern.exec(xml)) !== null) supported.push(...localTagText(parameterMatch[1], "Value"));
  const normalized = supported.map(decodeXml).map((value) => value.trim()).filter((value) => /(?:geo)?tiff|tif/i.test(value));
  const preferred = ["image/tiff", "image/geotiff", "application/geotiff"];
  return preferred.find((format) => normalized.some((candidate) => candidate.toLowerCase() === format))
    ?? normalized.find((candidate) => /tiff|geotiff/i.test(candidate))
    ?? null;
}
function axisValues(xml: string, axisName: string): number[] {
  const axes = localTagBlocks(xml, "GeneralGridAxis");
  for (const axis of axes) {
    if (localTagText(axis, "gridAxesSpanned").some((name) => name.trim().toLowerCase() === axisName.toLowerCase())) {
      const coefficientText = localTagText(axis, "coefficients")[0] ?? "";
      return coefficientText.split(/[\s,]+/).map(Number).filter(Number.isFinite);
    }
  }
  return [];
}
function parseCoverageMetadata(xml: string, run: string): CoverageMetadata {
  const axisLabelAttributes = /\baxisLabels=["']([^"']+)["']/gi;
  let axisLabelMatch: RegExpExecArray | null;
  let axisLabels: string[] = [];
  while ((axisLabelMatch = axisLabelAttributes.exec(xml)) !== null) {
    const labels = decodeXml(axisLabelMatch[1]).split(/\s+/).filter(Boolean).map((label) => label.toLowerCase());
    if (labels.length > axisLabels.length) axisLabels = labels;
  }
  const unitCandidates: string[][] = [];
  const unitAttributes = /\buomLabels=["']([^"']+)["']/gi;
  let unitMatch: RegExpExecArray | null;
  while ((unitMatch = unitAttributes.exec(xml)) !== null) unitCandidates.push(decodeXml(unitMatch[1]).split(/\s+/).filter(Boolean).map((unit) => unit.toLowerCase()));
  const secondsUnit = (unit: string | undefined) => ["s", "sec", "second", "seconds"].includes((unit ?? "").toLowerCase());
  const timeIndex = axisLabels.indexOf("time");
  const axisUnitCandidate = unitCandidates
    .filter((units) => units.length === axisLabels.length)
    .sort((a, b) => Number(secondsUnit(b[timeIndex])) - Number(secondsUnit(a[timeIndex])))[0] ?? [];
  const axisUnits: Record<string, string> = {};
  axisLabels.forEach((label, index) => { axisUnits[label] = axisUnitCandidate[index] ?? ""; });
  const timeAxis = axisValues(xml, "time");
  const unitNode = xml.match(/<(?:[\w.-]+:)?uom\b[^>]*\b(?:code|href)=["']([^"']+)["'][^>]*\/?\s*>/i);
  const unit = unitNode?.[1] ?? null;
  const heights = axisValues(xml, "height");
  const validAt = timeAxis.map((seconds) => new Date(Date.parse(run) + seconds * 1000).toISOString());
  return { validAt, heights, unit, axisLabels, axisUnits };
}
function convertOfficialValue(metric: AromeShadowMetric, value: number, unit: string): number | null {
  const normalized = unit.toLowerCase().replace(/[\s_]/g, "").replace(/−/g, "-");
  if (!Number.isFinite(value)) return null;
  if (metric === "temperature") {
    if (["k", "kelvin"].includes(normalized)) return value - 273.15;
    if (["°c", "c", "degc", "celsius", "cel"].includes(normalized)) return value;
    return null;
  }
  if (metric === "windSpeed") {
    if (["m/s", "ms-1", "m.s-1", "ms^-1"].includes(normalized)) return value * 3.6;
    if (["km/h", "kmh-1", "km.h-1", "kmh", "km/hours"].includes(normalized)) return value;
    return null;
  }
  if (["mm", "kg/m2", "kgm-2", "kgm^-2", "kgm−2", "kgm−2"].includes(normalized)) return value;
  if (["m", "meter", "metre"].includes(normalized)) return value * 1000;
  return null;
}
function toSingleRunTime(run: string): string {
  return run.slice(0, 16);
}
function resultStatus(result: AromeHondeghemShadowResult): AromeShadowStatus {
  if (!result.hourly.length) return "request-impossible";
  return result.missing.length > 0 || result.hourly.some((hour) => METRICS.some((metric) => hour.metrics[metric].arome == null || hour.metrics[metric].openMeteoArome == null))
    ? "partial"
    : "ok";
}
function dailyAggregate(hours: AromeShadowHour[]): AromeShadowDaily[] {
  const grouped = new Map<string, AromeShadowHour[]>();
  for (const hour of hours) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(hour.validAt));
    grouped.set(day, [...(grouped.get(day) ?? []), hour]);
  }
  const aggregate = (values: number[], metric: AromeShadowMetric): number | null => {
    if (!values.length) return null;
    if (metric === "precipitation") return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
  };
  return Array.from(grouped.entries()).map(([date, entries]) => {
    const metrics = {} as Record<AromeShadowMetric, AromeShadowDailyMetric>;
    for (const metric of METRICS) {
      const aromeValues = entries.map((entry) => entry.metrics[metric].arome).filter((value): value is number => value != null);
      const openValues = entries.map((entry) => entry.metrics[metric].openMeteoArome).filter((value): value is number => value != null);
      const arome = aggregate(aromeValues, metric);
      const openMeteoArome = aggregate(openValues, metric);
      metrics[metric] = {
        arome,
        openMeteoArome,
        difference: arome != null && openMeteoArome != null ? Math.round((arome - openMeteoArome) * 100) / 100 : null,
        unit: metric === "precipitation" ? "mm cumulés sur les heures comparées" : metric === "temperature" ? "°C · moyenne horaire" : "km/h · moyenne horaire",
        hours: Math.min(aromeValues.length, openValues.length),
      };
    }
    return { date, metrics };
  });
}
export function getPointFromGeoTiffBytes(
  buffer: ArrayBuffer,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
  openTiff: typeof fromArrayBuffer = fromArrayBuffer,
): Promise<number | null> {
  return (async () => {
    const tiff = await openTiff(buffer);
    const image = await tiff.getImage();
    const keys = image.getGeoKeys();
    const geographicCrs = keys?.GeographicTypeGeoKey;
    if (geographicCrs !== 4326) throw new Error("crs-not-wgs84");
    const [originX, originY] = image.getOrigin();
    const [resolutionX, resolutionY] = image.getResolution();
    const width = image.getWidth();
    const height = image.getHeight();
    if (![originX, originY, resolutionX, resolutionY].every(Number.isFinite) || resolutionX === 0 || resolutionY === 0) {
      throw new Error("invalid-georeferencing");
    }
    const pixelOffset = image.pixelIsArea() ? 0.5 : 0;
    const column = Math.round((longitude - originX) / resolutionX - pixelOffset);
    const row = Math.round((latitude - originY) / resolutionY - pixelOffset);
    if (column < 0 || row < 0 || column >= width || row >= height) throw new Error("point-outside-coverage");
    const raster = await image.readRasters({ window: [column, row, column + 1, row + 1], samples: [0], signal });
    const value = Number(raster[0]?.[0]);
    const noData = image.getGDALNoData();
    if (!Number.isFinite(value) || (noData != null && Object.is(value, noData))) return null;
    return value;
  })();
}
function buildSingleRunsUrl(run: string): string {
  const start = new Date(run);
  const end = new Date(start.getTime() + MAX_HOURS * 60 * 60 * 1000);
  const url = new URL(OPEN_METEO_SINGLE_RUNS);
  url.searchParams.set("latitude", String(HONDEGHEM.lat));
  url.searchParams.set("longitude", String(HONDEGHEM.lon));
  url.searchParams.set("run", toSingleRunTime(run));
  url.searchParams.set("models", OPEN_METEO_MODEL);
  url.searchParams.set("hourly", "temperature_2m,precipitation,wind_speed_10m");
  url.searchParams.set("start_hour", toSingleRunTime(start.toISOString()));
  url.searchParams.set("end_hour", toSingleRunTime(end.toISOString()));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  return url.toString();
}
function parseOpenMeteoSeries(payload: any): ForecastSeries | null {
  const hourly = payload?.hourly;
  if (!Array.isArray(hourly?.time)) return null;
  const toNumbers = (values: unknown): Array<number | null> => Array.isArray(values)
    ? values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null)
    : hourly.time.map(() => null);
  return {
    time: hourly.time.map(String).map((time: string) => time.length === 16 ? `${time}:00Z` : time),
    temperature: toNumbers(hourly.temperature_2m),
    precipitation: toNumbers(hourly.precipitation),
    windSpeed: toNumbers(hourly.wind_speed_10m),
  };
}
function forecastValue(series: ForecastSeries | null, metric: AromeShadowMetric, validAt: string): number | null {
  if (!series) return null;
  const target = Date.parse(validAt);
  const index = series.time.findIndex((time) => Date.parse(time) === target);
  if (index < 0) return null;
  return series[metric][index] ?? null;
}

export interface AromeShadowOptions {
  oauthApplicationId?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  decodePoint?: typeof getPointFromGeoTiffBytes;
}

/**
 * Manual, read-only comparison. It uses only the default AROME France HD product at Hondeghem;
 * it never writes to forecasts or lets the AROME result replace the displayed Best Match values.
 */
export async function runHondeghemAromeShadowComparison(options: AromeShadowOptions = {}): Promise<AromeHondeghemShadowResult> {
  const comparedAt = (options.now?.() ?? new Date()).toISOString();
  const oauthApplicationId = options.oauthApplicationId ?? ENV.meteoFranceOAuthApplicationId;
  if (!oauthApplicationId?.trim()) {
    return baseResult("missing-key", "Identifiant d’application OAuth2 METEOFRANCE_API_KEY manquant : aucune requête fournisseur n’a été envoyée.", comparedAt);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const decodePoint = options.decodePoint ?? getPointFromGeoTiffBytes;
  const result = baseResult("request-impossible", "La comparaison n’a pas pu être exécutée.", comparedAt);
  let headers: Record<string, string> = {};
  const getText = async (url: string): Promise<{ ok: boolean; status: number; text: string }> => {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
    return { ok: response.ok, status: response.status, text: response.ok ? await response.text() : "" };
  };
  try {
    const tokenResponse = await fetchImpl(METEOFRANCE_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${oauthApplicationId.trim()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenResponse.ok) {
      if (tokenResponse.status === 401 || tokenResponse.status === 403) {
        return { ...result, status: "authentication-error", message: `Échange OAuth2 Météo-France refusé (HTTP ${tokenResponse.status}); vérifiez l’abonnement AROME et l’identifiant d’application.` };
      }
      return { ...result, message: `Service de jeton OAuth2 Météo-France indisponible (HTTP ${tokenResponse.status}).` };
    }
    const tokenPayload = await tokenResponse.json() as { access_token?: unknown } | null;
    const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token.trim() : "";
    if (!accessToken) return { ...result, message: "Échange OAuth2 Météo-France réussi mais aucun jeton d’accès n’a été retourné." };
    headers = { Authorization: `Bearer ${accessToken}`, accept: "application/xml, application/octet-stream" };

    const capabilitiesUrl = new URL(`${AROME_WCS_BASE}/GetCapabilities`);
    capabilitiesUrl.searchParams.set("service", "WCS");
    capabilitiesUrl.searchParams.set("version", "2.0.1");
    capabilitiesUrl.searchParams.set("language", "fre");
    const capabilities = await getText(capabilitiesUrl.toString());
    if (!capabilities.ok) {
      if (capabilities.status === 401) {
        return { ...result, status: "authentication-error", message: "Authentification AROME refusée (HTTP 401); vérifiez l’identifiant OAuth2 et l’abonnement à l’API AROME." };
      }
      return { ...result, message: `Catalogue WCS AROME indisponible (HTTP ${capabilities.status}).` };
    }
    const coverageIds = localTagText(capabilities.text, "CoverageId").map(decodeXml);
    const selection = chooseLatestRun(coverageIds);
    if (!selection) return { ...result, message: "Le catalogue AROME ne contient aucun run récent avec une couverture de température, vent ou précipitation reconnue." };
    const run = selection.run;
    result.run = run;
    result.openMeteoRun = toSingleRunTime(run);
    const geotiffFormat = advertisedGeoTiffFormat(capabilities.text);
    if (!geotiffFormat) return { ...result, message: "Le catalogue WCS n’annonce aucun format GeoTIFF reconnu; aucun fichier raster n’a été demandé." };

    const openMeteoResponse = await fetchImpl(buildSingleRunsUrl(run), { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" } });
    if (!openMeteoResponse.ok) {
      return { ...result, message: `Open-Meteo Single Runs n’a pas fourni le run AROME ${toSingleRunTime(run)} (HTTP ${openMeteoResponse.status}); aucun autre run n’a été substitué.` };
    }
    const openMeteoSeries = parseOpenMeteoSeries(await openMeteoResponse.json());
    if (!openMeteoSeries) return { ...result, message: "La réponse Open-Meteo Single Runs ne contient pas de série horaire exploitable." };

    const metadata: Partial<Record<AromeShadowMetric, CoverageMetadata>> = {};
    for (const metric of METRICS) {
      const choice = selection.choices[metric];
      if (!choice) {
        result.missing.push(metric === "precipitation" ? "Précipitations : aucune couverture PT1H dans le run AROME sélectionné." : `${metric}: couverture absente du run AROME sélectionné.`);
        continue;
      }
      const describeUrl = new URL(`${AROME_WCS_BASE}/DescribeCoverage`);
      describeUrl.searchParams.set("service", "WCS");
      describeUrl.searchParams.set("version", "2.0.1");
      describeUrl.searchParams.set("coverageID", choice.id);
      const described = await getText(describeUrl.toString());
      if (!described.ok) {
        if (described.status === 401) return { ...result, status: "authentication-error", message: "Authentification AROME refusée pendant DescribeCoverage (HTTP 401)." };
        result.missing.push(`${metric}: métadonnées WCS indisponibles (HTTP ${described.status}).`);
        continue;
      }
      const parsed = parseCoverageMetadata(described.text, run);
      if (!parsed.validAt.length || !parsed.axisLabels.includes("long") || !parsed.axisLabels.includes("lat")) {
        result.missing.push(`${metric}: axes géographiques/temps absents ou non identifiables dans DescribeCoverage.`);
        continue;
      }
      const normalizedAxisUnit = (axis: string) => (parsed.axisUnits[axis] ?? "").toLowerCase().replace(/\s/g, "");
      if (!["deg", "degree", "degrees"].includes(normalizedAxisUnit("long"))
        || !["deg", "degree", "degrees"].includes(normalizedAxisUnit("lat"))) {
        result.missing.push(`${metric}: unités longitude/latitude absentes ou non angulaires dans DescribeCoverage.`);
        continue;
      }
      if (!["s", "sec", "second", "seconds"].includes(normalizedAxisUnit("time"))) {
        result.missing.push(`${metric}: coefficients temporels non confirmés en secondes dans DescribeCoverage.`);
        continue;
      }
      if (parsed.axisLabels.includes("height") && !["m", "meter", "metre", "meters", "metres"].includes(normalizedAxisUnit("height"))) {
        result.missing.push(`${metric}: unité de l’axe height absente ou différente du mètre.`);
        continue;
      }
      if (!parsed.unit || convertOfficialValue(metric, 1, parsed.unit) == null) {
        result.missing.push(`${metric}: unité WCS absente ou non prise en charge (${parsed.unit ?? "non fournie"}).`);
        continue;
      }
      const requiredHeight = metric === "temperature" ? 2 : metric === "windSpeed" ? 10 : null;
      if (requiredHeight != null && !parsed.heights.some((height) => Math.abs(height - requiredHeight) < 0.001)) {
        result.missing.push(`${metric}: l’altitude standard ${requiredHeight} m n’est pas présente dans les métadonnées WCS.`);
        continue;
      }
      if (metric === "precipitation" && choice.period !== "PT1H") {
        result.missing.push("Précipitations : période de cumul WCS différente de PT1H; variable non comparée à la valeur horaire Open-Meteo.");
        continue;
      }
      metadata[metric] = parsed;
    }

    const validTimes = Array.from(new Set(Object.values(metadata).flatMap((item) => item?.validAt ?? [])))
      .filter((time) => Date.parse(time) >= Date.parse(run) && Date.parse(time) < Date.parse(run) + MAX_HOURS * 60 * 60 * 1000)
      .filter((time) => openMeteoSeries.time.some((candidate) => Date.parse(candidate) === Date.parse(time)))
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .slice(0, MAX_HOURS);
    if (!validTimes.length) return { ...result, message: "Aucune échéance valide n’est commune au run AROME WCS et au même run Open-Meteo; aucun autre run n’a été mélangé." };

    const spacingMs = 650;
    let lastCoverageStartedAt = 0;
    for (const validAt of validTimes) {
      const metrics = {} as Record<AromeShadowMetric, AromeShadowMetricValue>;
      for (const metric of METRICS) {
        const choice = selection.choices[metric];
        const info = metadata[metric];
        const openMeteoArome = forecastValue(openMeteoSeries, metric, validAt);
        if (!choice || !info || !info.validAt.some((time) => Date.parse(time) === Date.parse(validAt))) {
          metrics[metric] = emptyMetric(metric, result.missing.find((message) => message.toLowerCase().includes(metric.toLowerCase())) ?? "Échéance absente des métadonnées AROME WCS.");
          metrics[metric].openMeteoArome = openMeteoArome;
          continue;
        }
        if (openMeteoArome == null) {
          metrics[metric] = emptyMetric(metric, "Échéance absente de la série Open-Meteo de ce run.");
          continue;
        }
        const elapsed = Date.now() - lastCoverageStartedAt;
        if (lastCoverageStartedAt && elapsed < spacingMs) await sleep(spacingMs - elapsed);
        lastCoverageStartedAt = Date.now();
        const coverageUrl = new URL(`${AROME_WCS_BASE}/GetCoverage`);
        coverageUrl.searchParams.set("service", "WCS");
        coverageUrl.searchParams.set("version", "2.0.1");
        coverageUrl.searchParams.set("coverageid", choice.id);
        coverageUrl.searchParams.append("subset", `time(${validAt})`);
        if (metric === "temperature") coverageUrl.searchParams.append("subset", "height(2)");
        if (metric === "windSpeed") coverageUrl.searchParams.append("subset", "height(10)");
        if (metric === "precipitation" && info.axisLabels.includes("height") && info.heights.length > 0) {
          const surfaceHeight = info.heights.includes(0) ? 0 : info.heights[0];
          coverageUrl.searchParams.append("subset", `height(${surfaceHeight})`);
        }
        coverageUrl.searchParams.append("subset", `lat(${(HONDEGHEM.lat - 0.04).toFixed(4)},${(HONDEGHEM.lat + 0.04).toFixed(4)})`);
        coverageUrl.searchParams.append("subset", `long(${(HONDEGHEM.lon - 0.04).toFixed(4)},${(HONDEGHEM.lon + 0.04).toFixed(4)})`);
        coverageUrl.searchParams.set("format", geotiffFormat);
        let value: number | null = null;
        let issue: string | undefined;
        try {
          const response = await fetchImpl(coverageUrl.toString(), { headers: { ...headers, accept: "application/octet-stream" }, signal: AbortSignal.timeout(20_000) });
          if (!response.ok) {
            if (response.status === 401) return { ...result, status: "authentication-error", message: "Authentification AROME refusée pendant GetCoverage (HTTP 401)." };
            issue = response.status === 403
              ? "Échéance AROME non encore disponible au backend (HTTP 403)."
              : `GeoTIFF AROME indisponible (HTTP ${response.status}).`;
          } else {
            const rawValue = await decodePoint(await response.arrayBuffer(), HONDEGHEM.lat, HONDEGHEM.lon);
            value = rawValue == null ? null : convertOfficialValue(metric, rawValue, info.unit!);
            if (value == null) issue = rawValue == null ? "Pixel GeoTIFF manquant à Hondeghem." : `Unité GeoTIFF non interprétable : ${info.unit}.`;
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : "decode-error";
          issue = reason === "crs-not-wgs84" ? "GeoTIFF ignoré : CRS différent de WGS84 (EPSG:4326)." : reason === "point-outside-coverage" ? "Hondeghem est hors de l’emprise raster renvoyée." : "Réponse WCS/GeoTIFF illisible ou erreur réseau.";
        }
        const rounded = value == null ? null : Math.round(value * 100) / 100;
        metrics[metric] = {
          arome: rounded,
          openMeteoArome,
          difference: rounded == null ? null : Math.round((rounded - openMeteoArome) * 100) / 100,
          unit: METRIC_UNITS[metric],
          ...(issue ? { issue } : {}),
        };
        if (issue) result.missing.push(`${metric} ${validAt}: ${issue}`);
      }
      result.hourly.push({ validAt, metrics });
    }
    result.daily = dailyAggregate(result.hourly);
    result.status = resultStatus(result);
    result.message = result.status === "ok"
      ? "Comparaison shadow terminée : AROME WCS et Open-Meteo portent le même run. Les prévisions affichées restent inchangées."
      : "Comparaison partielle : seules les valeurs présentes dans les deux sources et conformes aux métadonnées sont comparées; les prévisions affichées restent inchangées.";
    return result;
  } catch (error) {
    const status = error instanceof Error && /401|403/.test(error.message) ? "authentication-error" : "request-impossible";
    return { ...result, status, message: status === "authentication-error" ? "Authentification AROME refusée; vérifiez l’identifiant OAuth2 et l’abonnement AROME." : "Requête fournisseur impossible ou métadonnées inattendues; aucune prévision de production n’a été modifiée." };
  }
}
