import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPointFromGeoTiffBytes, runHondeghemAromeShadowComparison } from "./aromeHondeghemShadow";

const RUN = "2026-09-29T00:00:00Z";
const coverageIds = [
  "TEMPERATURE__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___2026-09-29T00.00.00Z",
  "TOTAL_WATER_PRECIPITATION__GROUND_OR_WATER_SURFACE___2026-09-29T00.00.00Z_PT1H",
  "WIND_SPEED__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___2026-09-29T00.00.00Z",
];
const capabilities = (ids = coverageIds, includeGeoTiff = true) => `<wcs:Capabilities><ows:OperationsMetadata><ows:Operation name="GetCoverage"><ows:Parameter name="format"><ows:AllowedValues>${includeGeoTiff ? "<ows:Value>image/tiff</ows:Value>" : ""}<ows:Value>application/wmo-grib</ows:Value></ows:AllowedValues></ows:Parameter></ows:Operation></ows:OperationsMetadata><wcs:Contents>${ids.map((id) => `<wcs:CoverageSummary><wcs:CoverageId>${id}</wcs:CoverageId></wcs:CoverageSummary>`).join("")}</wcs:Contents></wcs:Capabilities>`;
const coverageDescription = (metric: "temperature" | "precipitation" | "windSpeed") => {
  const unit = metric === "temperature" ? "K" : metric === "windSpeed" ? "m s-1" : "kg m-2";
  const heights = metric === "temperature" ? "2" : metric === "windSpeed" ? "10" : "0";
  return `<wcs:CoverageDescriptions><wcs:CoverageDescription><gml:boundedBy><gml:EnvelopeWithTimePeriod axisLabels="long lat height time" uomLabels="deg deg m ISO8601"><gml:beginPosition>${RUN}</gml:beginPosition><gml:endPosition>2026-09-29T02:00:00Z</gml:endPosition></gml:EnvelopeWithTimePeriod></gml:boundedBy><gml:domainSet><gmlrgrid:ReferenceableGridByVectors><gmlrgrid:generalGridAxis><gmlrgrid:GeneralGridAxis><gmlrgrid:offsetVector srsDimension="4" axisLabels="long lat height time" uomLabels="deg deg m s"/><gmlrgrid:gridAxesSpanned>height</gmlrgrid:gridAxesSpanned><gmlrgrid:coefficients>${heights}</gmlrgrid:coefficients></gmlrgrid:GeneralGridAxis></gmlrgrid:generalGridAxis><gmlrgrid:generalGridAxis><gmlrgrid:GeneralGridAxis><gmlrgrid:offsetVector srsDimension="4" axisLabels="long lat height time" uomLabels="deg deg m s"/><gmlrgrid:gridAxesSpanned>time</gmlrgrid:gridAxesSpanned><gmlrgrid:coefficients>0 3600 7200</gmlrgrid:coefficients></gmlrgrid:GeneralGridAxis></gmlrgrid:generalGridAxis></gmlrgrid:ReferenceableGridByVectors></gml:domainSet><swe:rangeType><swe:DataRecord><swe:field><swe:Quantity><swe:uom code="${unit}"/></swe:Quantity></swe:field></swe:DataRecord></swe:rangeType></wcs:CoverageDescription></wcs:CoverageDescriptions>`;
};
const openMeteo = {
  hourly: {
    time: ["2026-09-29T00:00", "2026-09-29T01:00", "2026-09-29T02:00"],
    temperature_2m: [11, 12, 13],
    precipitation: [1.5, 0.5, 0],
    wind_speed_10m: [20, 21, 22],
  },
};

function response(body: string | ArrayBuffer, status = 200): Response {
  return new Response(body, { status });
}
function createFetchMock(options?: { missingPrecip?: boolean; authStatus?: number; coverageFailure?: number; openMeteoStatus?: number; noGeoTiff?: boolean }) {
  let currentCoverage = "";
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input.toString());
    requests.push({ url, init });
    if (url.pathname.endsWith("/GetCapabilities")) {
      return options?.authStatus ? response("", options.authStatus) : response(capabilities(options?.missingPrecip ? coverageIds.filter((id) => !id.startsWith("TOTAL_WATER")) : coverageIds, !options?.noGeoTiff));
    }
    if (url.hostname === "single-runs-api.open-meteo.com") return response(JSON.stringify(openMeteo), options?.openMeteoStatus ?? 200);
    if (url.pathname.endsWith("/DescribeCoverage")) {
      const id = url.searchParams.get("coverageID") ?? "";
      return response(coverageDescription(id.startsWith("TEMPERATURE") ? "temperature" : id.startsWith("WIND_SPEED") ? "windSpeed" : "precipitation"));
    }
    if (url.pathname.endsWith("/GetCoverage")) {
      currentCoverage = url.searchParams.get("coverageid") ?? "";
      if (options?.coverageFailure) return response("", options.coverageFailure);
      return response(new Uint8Array([1, 2, 3, 4]).buffer);
    }
    throw new Error(`Unexpected test URL: ${url.origin}${url.pathname}`);
  });
  const decodePoint = vi.fn(async (_buffer: ArrayBuffer, latitude: number, longitude: number) => {
    expect(latitude).toBeCloseTo(50.7567);
    expect(longitude).toBeCloseTo(2.5204);
    if (currentCoverage.startsWith("TEMPERATURE")) return 283.15;
    if (currentCoverage.startsWith("WIND_SPEED")) return 5;
    return 2;
  });
  return { fetchImpl, requests, decodePoint };
}

describe("AROME Hondeghem shadow comparison", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not send any request when the server key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await runHondeghemAromeShadowComparison({ apiKey: "", fetchImpl: fetchImpl as typeof fetch });
    expect(result.status).toBe("missing-key");
    expect(result.message).toContain("AROME_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the advertised GeoTIFF format, samples Hondeghem and compares the exact common run with units converted", async () => {
    const { fetchImpl, requests, decodePoint } = createFetchMock();
    const result = await runHondeghemAromeShadowComparison({
      apiKey: "synthetic-test-key",
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-09-29T01:00:00Z"),
      sleep: async () => undefined,
      decodePoint,
    });

    expect(result.status, result.message).toBe("ok");
    expect(result.run).toBe(RUN);
    expect(result.openMeteoRun).toBe("2026-09-29T00:00");
    expect(result.hourly).toHaveLength(3);
    expect(result.hourly[0]).toMatchObject({
      validAt: "2026-09-29T00:00:00.000Z",
      metrics: {
        temperature: { arome: 10, openMeteoArome: 11, difference: -1, unit: "°C" },
        precipitation: { arome: 2, openMeteoArome: 1.5, difference: 0.5, unit: "mm / heure" },
        windSpeed: { arome: 18, openMeteoArome: 20, difference: -2, unit: "km/h" },
      },
    });
    expect(result.daily).toHaveLength(1);
    const singleRunsRequest = requests.find(({ url }) => url.hostname === "single-runs-api.open-meteo.com")!;
    expect(singleRunsRequest.url.searchParams.get("run")).toBe("2026-09-29T00:00");
    expect(singleRunsRequest.url.searchParams.get("models")).toBe("meteofrance_arome_france_hd");
    expect(singleRunsRequest.url.searchParams.get("temperature_unit")).toBe("celsius");
    expect(singleRunsRequest.url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(singleRunsRequest.url.searchParams.get("precipitation_unit")).toBe("mm");
    const tempCoverage = requests.find(({ url }) => url.pathname.endsWith("/GetCoverage") && url.searchParams.get("coverageid")?.startsWith("TEMPERATURE"))!;
    const windCoverage = requests.find(({ url }) => url.pathname.endsWith("/GetCoverage") && url.searchParams.get("coverageid")?.startsWith("WIND_SPEED"))!;
    const precipCoverage = requests.find(({ url }) => url.pathname.endsWith("/GetCoverage") && url.searchParams.get("coverageid")?.startsWith("TOTAL_WATER"))!;
    expect(tempCoverage.url.searchParams.get("format")).toBe("image/tiff");
    expect(tempCoverage.url.searchParams.getAll("subset")).toContain("height(2)");
    expect(windCoverage.url.searchParams.getAll("subset")).toContain("height(10)");
    expect(precipCoverage.url.searchParams.getAll("subset")).toContain("height(0)");
    for (const getCoverage of [tempCoverage, windCoverage]) {
      expect(getCoverage.url.searchParams.getAll("subset")).toContain("lat(50.7167,50.7967)");
      expect(getCoverage.url.searchParams.getAll("subset")).toContain("long(2.4804,2.5604)");
      expect(getCoverage.url.toString()).not.toContain("synthetic-test-key");
      expect((getCoverage.init?.headers as Record<string, string>).apikey).toBe("synthetic-test-key");
    }
    expect(decodePoint).toHaveBeenCalledTimes(9);
  });

  it("returns an explicit authentication error instead of falling back to another run", async () => {
    const { fetchImpl } = createFetchMock({ authStatus: 401 });
    const result = await runHondeghemAromeShadowComparison({ apiKey: "synthetic-test-key", fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined });
    expect(result.status).toBe("authentication-error");
    expect(result.run).toBeNull();
    expect(result.message).toContain("401");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not substitute another model/run when Single Runs has no copy of the WCS run", async () => {
    const { fetchImpl, requests } = createFetchMock({ openMeteoStatus: 404 });
    const result = await runHondeghemAromeShadowComparison({ apiKey: "synthetic-test-key", fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined });
    expect(result.status).toBe("request-impossible");
    expect(result.hourly).toHaveLength(0);
    expect(result.message).toContain("aucun autre run n’a été substitué");
    expect(requests.some(({ url }) => url.pathname.endsWith("/GetCoverage"))).toBe(false);
  });

  it("does not invent a GeoTIFF media type when WCS does not advertise one", async () => {
    const { fetchImpl, requests } = createFetchMock({ noGeoTiff: true });
    const result = await runHondeghemAromeShadowComparison({ apiKey: "synthetic-test-key", fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined });
    expect(result.status).toBe("request-impossible");
    expect(result.message).toContain("n’annonce aucun format GeoTIFF");
    expect(requests.some(({ url }) => url.hostname === "single-runs-api.open-meteo.com")).toBe(false);
  });

  it("reports unavailable hourly precipitation metadata rather than comparing an unknown accumulation period", async () => {
    const { fetchImpl, decodePoint } = createFetchMock({ missingPrecip: true });
    const result = await runHondeghemAromeShadowComparison({ apiKey: "synthetic-test-key", fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined, decodePoint });
    expect(result.status).toBe("partial");
    expect(result.missing.some((item) => item.includes("PT1H"))).toBe(true);
    expect(result.hourly[0].metrics.precipitation.arome).toBeNull();
    expect(result.hourly[0].metrics.precipitation.openMeteoArome).toBe(1.5);
  });

  it("marks WCS 403 unavailable coverage per valid time rather than treating it as a key error", async () => {
    const { fetchImpl, decodePoint } = createFetchMock({ coverageFailure: 403 });
    const result = await runHondeghemAromeShadowComparison({ apiKey: "synthetic-test-key", fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined, decodePoint });
    expect(result.status).toBe("partial");
    expect(result.hourly).toHaveLength(3);
    expect(result.hourly[0].metrics.temperature.arome).toBeNull();
    expect(result.hourly[0].metrics.temperature.openMeteoArome).toBe(11);
    expect(result.missing.some((item) => item.includes("HTTP 403"))).toBe(true);
  });

  it("uses GeoTIFF georeferencing to sample the point pixel, rejects a different CRS and preserves nodata", async () => {
    const readRasters = vi.fn(async (options: { window: number[] }) => {
      expect(options.window).toEqual([2, 4, 3, 5]);
      return [new Float32Array([142])];
    });
    const image = {
      getGeoKeys: () => ({ GeographicTypeGeoKey: 4326 }),
      getOrigin: () => [2.5, 50.8, 0],
      getResolution: () => [0.01, -0.01, 0],
      getWidth: () => 10,
      getHeight: () => 10,
      pixelIsArea: () => true,
      readRasters,
      getGDALNoData: () => -9999,
    };
    const openTiff = vi.fn(async () => ({ getImage: async () => image }) as any);
    expect(await getPointFromGeoTiffBytes(new ArrayBuffer(8), 50.7567, 2.5204, undefined, openTiff as any)).toBe(142);
    expect(readRasters).toHaveBeenCalledTimes(1);

    const projectedTiff = vi.fn(async () => ({ getImage: async () => ({ ...image, getGeoKeys: () => ({ GeographicTypeGeoKey: 3857 }) }) }) as any);
    await expect(getPointFromGeoTiffBytes(new ArrayBuffer(8), 50.7567, 2.5204, undefined, projectedTiff as any)).rejects.toThrow("crs-not-wgs84");

    const nodataTiff = vi.fn(async () => ({ getImage: async () => ({ ...image, readRasters: async () => [new Float32Array([-9999])] }) }) as any);
    expect(await getPointFromGeoTiffBytes(new ArrayBuffer(8), 50.7567, 2.5204, undefined, nodataTiff as any)).toBeNull();
  });
});
