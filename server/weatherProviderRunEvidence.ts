import { createHash } from "node:crypto";
import type {
  ShadowProviderRunEvidence,
  ShadowRunEvidenceScope,
} from "../shared/weatherDataHub";
import { fetchWeather } from "./weatherFetch";

type MetadataTarget = {
  path: string;
  scope: Extract<ShadowRunEvidenceScope, "model_exact" | "model_family">;
};

const OPEN_METEO_METADATA_BASE = "https://api.open-meteo.com/data";
const METADATA_TARGET_BY_SOURCE_KEY: Record<string, MetadataTarget> = {
  openmeteo_arome_france_hd: { path: "meteofrance_arome_france_hd", scope: "model_exact" },
  openmeteo_arpege_europe: { path: "meteofrance_arpege_europe", scope: "model_exact" },
  openmeteo_icon_eu: { path: "dwd_icon_eu", scope: "model_exact" },
  openmeteo_ecmwf_ifs025: { path: "ecmwf_ifs025", scope: "model_exact" },
  openmeteo_gfs_seamless: { path: "ncep_gfs013", scope: "model_family" },
  openmeteo_gem_seamless: { path: "cmc_gem_gdps_15km", scope: "model_family" },
  openmeteo_ukmo_seamless: { path: "ukmo_global_deterministic_10km", scope: "model_family" },
};

type OpenMeteoRunMetadata = {
  last_run_initialisation_time?: unknown;
  last_run_modification_time?: unknown;
  last_run_availability_time?: unknown;
  temporal_resolution_seconds?: unknown;
  update_interval_seconds?: unknown;
};

function secondsToMilliseconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value * 1_000)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evidenceHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createUnknownRunEvidence(input: {
  observedAt?: number;
  scope?: Extract<ShadowRunEvidenceScope, "aggregator_unresolved" | "none">;
  detail: string;
  sourceUrl?: string | null;
}): ShadowProviderRunEvidence {
  return {
    status: "UNKNOWN",
    scope: input.scope ?? "none",
    providerRunTime: null,
    providerAvailableAt: null,
    providerModifiedAt: null,
    observedAt: input.observedAt ?? Date.now(),
    sourceUrl: input.sourceUrl ?? null,
    evidenceHash: null,
    detail: input.detail,
    evidence: null,
  };
}

export function parseOpenMeteoRunMetadata(input: {
  payload: OpenMeteoRunMetadata;
  sourceUrl: string;
  scope: MetadataTarget["scope"];
  observedAt?: number;
}): ShadowProviderRunEvidence {
  const observedAt = input.observedAt ?? Date.now();
  const providerRunTime = secondsToMilliseconds(input.payload.last_run_initialisation_time);
  if (providerRunTime == null) {
    return createUnknownRunEvidence({
      observedAt,
      detail: "La réponse de métadonnées ne contient pas d’heure d’initialisation exploitable.",
      sourceUrl: input.sourceUrl,
    });
  }

  const evidence = {
    lastRunInitialisationTime: providerRunTime,
    lastRunAvailabilityTime: secondsToMilliseconds(input.payload.last_run_availability_time),
    lastRunModificationTime: secondsToMilliseconds(input.payload.last_run_modification_time),
    temporalResolutionSeconds: finiteNumber(input.payload.temporal_resolution_seconds),
    updateIntervalSeconds: finiteNumber(input.payload.update_interval_seconds),
  };

  return {
    status: "OPEN_METEO_METADATA",
    scope: input.scope,
    providerRunTime,
    providerAvailableAt: evidence.lastRunAvailabilityTime,
    providerModifiedAt: evidence.lastRunModificationTime,
    observedAt,
    sourceUrl: input.sourceUrl,
    evidenceHash: evidenceHash(evidence),
    detail: input.scope === "model_exact"
      ? "Dernier run déclaré par l’API de métadonnées du modèle. La liaison exacte au payload Forecast reste non garantie."
      : "Dernier run déclaré pour la famille sous-jacente d’un alias seamless. La liaison exacte au payload Forecast reste non garantie.",
    evidence,
  };
}

export function createScheduleDerivedRunEvidence(input: {
  observedAt?: number;
  detail: string;
}): ShadowProviderRunEvidence {
  return {
    status: "SCHEDULE_DERIVED",
    scope: "schedule_only",
    providerRunTime: null,
    providerAvailableAt: null,
    providerModifiedAt: null,
    observedAt: input.observedAt ?? Date.now(),
    sourceUrl: null,
    evidenceHash: null,
    detail: input.detail,
    evidence: null,
  };
}

export async function fetchProviderRunEvidence(
  sourceKey: string,
  observedAt = Date.now(),
): Promise<ShadowProviderRunEvidence> {
  if (sourceKey === "openmeteo_best_match") {
    return createUnknownRunEvidence({
      observedAt,
      scope: "aggregator_unresolved",
      detail: "Best Match peut sélectionner ou assembler plusieurs modèles selon le lieu et l’échéance ; aucun run unique n’est attribué.",
    });
  }

  const target = METADATA_TARGET_BY_SOURCE_KEY[sourceKey];
  if (!target) {
    return createUnknownRunEvidence({
      observedAt,
      detail: `Aucune cible de métadonnées P2 n’est déclarée pour ${sourceKey}.`,
    });
  }

  const sourceUrl = `${OPEN_METEO_METADATA_BASE}/${target.path}/static/meta.json`;
  try {
    const response = await fetchWeather(sourceUrl, {}, {
      timeoutMs: 3_000,
      attempts: 1,
      cacheTtlMs: 15 * 60_000,
    });
    if (!response.ok) {
      return createUnknownRunEvidence({
        observedAt,
        detail: `Métadonnées P2 indisponibles : HTTP ${response.status}.`,
        sourceUrl,
      });
    }
    return parseOpenMeteoRunMetadata({
      payload: await response.json() as OpenMeteoRunMetadata,
      sourceUrl,
      scope: target.scope,
      observedAt,
    });
  } catch (error) {
    return createUnknownRunEvidence({
      observedAt,
      detail: `Métadonnées P2 indisponibles : ${error instanceof Error ? error.message : String(error)}.`,
      sourceUrl,
    });
  }
}

export async function fetchProviderRunEvidenceMap(
  sourceKeys: readonly string[],
  observedAt = Date.now(),
): Promise<Map<string, ShadowProviderRunEvidence>> {
  const uniqueSourceKeys = Array.from(new Set(sourceKeys));
  const entries = await Promise.all(uniqueSourceKeys.map(async sourceKey => [
    sourceKey,
    await fetchProviderRunEvidence(sourceKey, observedAt),
  ] as const));
  return new Map(entries);
}

