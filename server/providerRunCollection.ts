import { randomUUID } from "node:crypto";
import { OFFICIAL_HOURLY_MODELS } from "./officialModels";
import { fetchWeather } from "./weatherFetch";
import {
  buildSingleRunRequestUrl,
  DIRECT_SINGLE_RUN_METADATA_MODEL_IDS,
  parseProviderRunHourlyResponse,
  resolveProviderRunSelection,
  singleRunMetadataUrl,
  type ProviderModelMetadata,
  type ProviderRunCaptureAttempt,
  type ProviderRunForecastValue,
} from "./providerRunHorizon";

export type ProviderRunCollectionBatch = {
  captures: ProviderRunCaptureAttempt[];
  values: ProviderRunForecastValue[];
};

function emptyAttempt(input: {
  captureRunId: string;
  locationKey: string;
  targetDate: string;
  modelName: string;
  modelId: string;
  status: string;
  reasonCode: string | null;
  metadataUrl?: string | null;
  metadataHttpStatus?: number | null;
}): ProviderRunCaptureAttempt {
  return {
    ...input,
    metadataHttpStatus: input.metadataHttpStatus ?? null,
    metadataUrl: input.metadataUrl ?? null,
    metadataAvailableAt: null,
    providerRunAt: null,
    requestStartedAt: null,
    availableAt: null,
    collectionLatencyMilliseconds: null,
    requestUrl: null,
    responseStatus: null,
    responsePayload: null,
    valuesStored: 0,
    minimumForecastLeadMilliseconds: null,
    maximumForecastLeadMilliseconds: null,
  };
}
function metadataFromJson(value: unknown): ProviderModelMetadata | null {
  return value != null && typeof value === "object" ? value as ProviderModelMetadata : null;
}

/**
 * Best-effort append-only sidecar. It never replaces the existing Forecast API
 * collection and intentionally returns per-model unknown states rather than
 * rejecting the scheduled favorite-location batch.
 */
export async function collectProviderRunBatch(input: {
  targetDate: string;
  locationKey: string;
  latitude: number;
  longitude: number;
}): Promise<ProviderRunCollectionBatch> {
  const attempts = await Promise.all(OFFICIAL_HOURLY_MODELS.map(async (model) => {
    const captureRunId = randomUUID();
    const directMetadataId = DIRECT_SINGLE_RUN_METADATA_MODEL_IDS[model.name as keyof typeof DIRECT_SINGLE_RUN_METADATA_MODEL_IDS];
    if (!directMetadataId || directMetadataId !== model.modelId) {
      return { capture: emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "unmapped_model_id", reasonCode: "official_metadata_id_unmapped" }), values: [] as ProviderRunForecastValue[] };
    }
    const metadataUrl = singleRunMetadataUrl(directMetadataId);
    if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90
      || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      return { capture: emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "metadata_invalid", reasonCode: "invalid_location_coordinates" }), values: [] as ProviderRunForecastValue[] };
    }

    let metadataResponse: Response;
    try {
      metadataResponse = await fetchWeather(metadataUrl, {}, { timeoutMs: 6_000, attempts: 1, cacheTtlMs: 60_000 });
    } catch {
      return { capture: emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "metadata_unavailable", reasonCode: "official_metadata_request_failed", metadataUrl }), values: [] as ProviderRunForecastValue[] };
    }
    if (!metadataResponse.ok) {
      return { capture: emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "metadata_unavailable", reasonCode: "official_metadata_http_error", metadataUrl, metadataHttpStatus: metadataResponse.status }), values: [] as ProviderRunForecastValue[] };
    }
    let metadata: ProviderModelMetadata | null;
    try {
      metadata = metadataFromJson(await metadataResponse.json());
    } catch {
      return { capture: emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "metadata_invalid", reasonCode: "official_metadata_invalid_json", metadataUrl, metadataHttpStatus: metadataResponse.status }), values: [] as ProviderRunForecastValue[] };
    }

    const selection = resolveProviderRunSelection({ modelName: model.name, modelId: model.modelId, metadata, now: Date.now() });
    if (selection.status !== "selected" || selection.providerRunAt == null || selection.metadataAvailableAt == null) {
      return {
        capture: {
          ...emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: selection.status, reasonCode: selection.reasonCode, metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }),
          metadataAvailableAt: selection.metadataAvailableAt,
        },
        values: [] as ProviderRunForecastValue[],
      };
    }

    let requestUrl: string;
    try {
      requestUrl = buildSingleRunRequestUrl({ modelName: model.name, modelId: model.modelId, latitude: input.latitude, longitude: input.longitude, providerRunAt: selection.providerRunAt });
    } catch {
      return { capture: emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "request_invalid", reasonCode: "single_run_request_invalid", metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }), values: [] as ProviderRunForecastValue[] };
    }

    const requestStartedAt = Date.now();
    let response: Response;
    try {
      response = await fetchWeather(requestUrl, {}, { timeoutMs: 12_000, attempts: 1, cacheTtlMs: 0 });
    } catch {
      return {
        capture: {
          ...emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "request_failed", reasonCode: "single_run_network_error", metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }),
          metadataAvailableAt: selection.metadataAvailableAt,
          providerRunAt: selection.providerRunAt,
          requestStartedAt,
          requestUrl,
        },
        values: [] as ProviderRunForecastValue[],
      };
    }

    if (!response.ok) {
      const availableAt = Date.now();
      return {
        capture: {
          ...emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "request_failed", reasonCode: response.status >= 500 ? "single_run_http_5xx" : "single_run_http_4xx", metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }),
          metadataAvailableAt: selection.metadataAvailableAt,
          providerRunAt: selection.providerRunAt,
          requestStartedAt,
          availableAt,
          collectionLatencyMilliseconds: availableAt - selection.providerRunAt,
          requestUrl,
          responseStatus: response.status,
        },
        values: [] as ProviderRunForecastValue[],
      };
    }

    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch {
      const availableAt = Date.now();
      return {
        capture: {
          ...emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "invalid_response", reasonCode: "single_run_invalid_json", metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }),
          metadataAvailableAt: selection.metadataAvailableAt,
          providerRunAt: selection.providerRunAt,
          requestStartedAt,
          availableAt,
          collectionLatencyMilliseconds: availableAt - selection.providerRunAt,
          requestUrl,
          responseStatus: response.status,
        },
        values: [] as ProviderRunForecastValue[],
      };
    }
    const availableAt = Date.now();
    const parsed = parseProviderRunHourlyResponse({
      responseData,
      captureRunId,
      locationKey: input.locationKey,
      modelName: model.name,
      modelId: model.modelId,
      metadataAvailableAt: selection.metadataAvailableAt,
      providerRunAt: selection.providerRunAt,
      requestStartedAt,
      availableAt,
    });
    if (parsed.values.length === 0) {
      return {
        capture: {
          ...emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: "no_future_valid_times", reasonCode: "single_run_has_no_unexpired_hourly_values", metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }),
          metadataAvailableAt: selection.metadataAvailableAt,
          providerRunAt: selection.providerRunAt,
          requestStartedAt,
          availableAt,
          collectionLatencyMilliseconds: availableAt - selection.providerRunAt,
          requestUrl,
          responseStatus: response.status,
          responsePayload: parsed.responsePayload,
        },
        values: [],
      };
    }
    const leads = parsed.values.map((value) => value.forecastLeadTimeMilliseconds);
    return {
      capture: {
        ...emptyAttempt({ captureRunId, locationKey: input.locationKey, targetDate: input.targetDate, modelName: model.name, modelId: model.modelId, status: parsed.nonNullValueCount > 0 ? "succeeded" : "no_usable_values", reasonCode: parsed.nonNullValueCount > 0 ? null : "single_run_contains_no_finite_values", metadataUrl: selection.metadataUrl, metadataHttpStatus: metadataResponse.status }),
        metadataAvailableAt: selection.metadataAvailableAt,
        providerRunAt: selection.providerRunAt,
        requestStartedAt,
        availableAt,
        collectionLatencyMilliseconds: availableAt - selection.providerRunAt,
        requestUrl,
        responseStatus: response.status,
        responsePayload: parsed.responsePayload,
        valuesStored: parsed.values.length,
        minimumForecastLeadMilliseconds: Math.min(...leads),
        maximumForecastLeadMilliseconds: Math.max(...leads),
      },
      values: parsed.values,
    };
  }));
  return {
    captures: attempts.map((attempt) => attempt.capture),
    values: attempts.flatMap((attempt) => attempt.values),
  };
}
