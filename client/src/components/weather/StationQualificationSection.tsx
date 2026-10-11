import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge, type WeatherStatusBadgeTone } from "@/components/weather/WeatherStatusBadge";
import { getStationQualificationBadge } from "@/lib/stationCandidateStatus";

/**
 * Section de transparence « Stations et capteurs autour du lieu » : chaque
 * source porte son badge de qualification réel (Station officielle, Capteur
 * citoyen en validation, Capteur citoyen validé, Exclu), sa source, l’âge de
 * son dernier relevé, sa distance, ses variables présentes et son motif
 * d’exclusion persisté. Aucune valeur n’est fabriquée : une variable absente
 * ne s’affiche pas, un âge inconnu reste « Aucun relevé ».
 */

type StationVariableKey =
  | "temperature"
  | "humidity"
  | "pressure"
  | "windSpeed"
  | "windGust"
  | "windDirection"
  | "precipitation";

type StationQualificationEntry = {
  stationId: string;
  source: string;
  sourceKind: "physical" | "reference";
  name: string;
  distanceKm: number;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  precipitation: number | null;
  updatedAt: string | null;
  isActive: boolean;
  exclusionReason?: string | null;
  qualificationStatus?: "candidate" | "validated" | "excluded";
};

const SOURCE_LABELS: Record<string, string> = {
  meteofrance: "Météo-France",
  synop: "SYNOP/WMO",
  noaa: "NOAA",
  openmeteo: "Open-Meteo",
  opensensemap: "openSenseMap · capteur citoyen",
  netatmo: "Station Netatmo",
  wunderground: "Grille régionale · GFS",
  cwop: "CWOP/MADIS · capteur citoyen",
  davis: "Référence de grille",
  infoclimat: "Grille locale · AROME",
};

const BADGE_TONES: Record<string, WeatherStatusBadgeTone> = {
  official: "success",
  "citizen-candidate": "warning",
  "citizen-validated": "success",
  excluded: "danger",
  netatmo: "neutral",
  reference: "info",
};

const PRESENT_VARIABLES: Array<{ key: StationVariableKey; label: string; unit: string; decimals: number }> = [
  { key: "temperature", label: "Température", unit: " °C", decimals: 1 },
  { key: "humidity", label: "Humidité", unit: " %", decimals: 0 },
  { key: "pressure", label: "Pression", unit: " hPa", decimals: 0 },
  { key: "windSpeed", label: "Vent", unit: " km/h", decimals: 1 },
  { key: "windGust", label: "Rafales", unit: " km/h", decimals: 1 },
  { key: "windDirection", label: "Direction", unit: "°", decimals: 0 },
  { key: "precipitation", label: "Précipitations", unit: " mm", decimals: 1 },
];

function formatAge(minutes: number | null) {
  if (minutes === null) return "Aucun relevé";
  if (minutes < 2) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Il y a ${hours} h ${rest}` : `Il y a ${hours} h`;
}

function minutesSince(updatedAt: string | null | undefined) {
  if (!updatedAt) return null;
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
}

export function StationQualificationSection({
  data,
  isLoading,
  isError,
  locationName,
  radiusKm,
}: {
  data: { stations?: StationQualificationEntry[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  locationName: string;
  radiusKm: number;
}) {
  // Tri par distance croissante : le routeur classe par score de fusion, la
  // transparence autour du lieu se lit du plus proche au plus loin.
  const stations = [...(data?.stations ?? [])].sort(
    (left, right) => Number(left.distanceKm) - Number(right.distanceKm),
  );

  return (
    <MeteoSurface
      tone="inset"
      as="section"
      className="rounded-2xl p-4 sm:p-5"
      aria-labelledby="station-qualification-title"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div>
          <h2
            id="station-qualification-title"
            className="text-sm font-semibold text-slate-100"
          >
            Stations et capteurs autour du lieu
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Chaque source porte son badge de qualification réel : Station
            officielle, Capteur citoyen en validation, Capteur citoyen validé ou
            Exclu. Aucun capteur citoyen n’est étiqueté Netatmo, Weather
            Underground ou station officielle. Aucune donnée n’est fabriquée :
            l’âge affiché est calculé depuis l’heure de relevé transmise par le
            fournisseur, une variable absente ne s’affiche pas, et le motif
            d’exclusion est repris tel quel.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700/70 bg-slate-950/30 px-2.5 py-1 text-[9px] text-slate-500">
          {locationName} · rayon {radiusKm} km
        </span>
      </div>

      {isLoading ? (
        <div
          className="mt-4 h-24 animate-pulse rounded-xl bg-slate-800"
          role="status"
          aria-label="Chargement des stations autour du lieu"
        />
      ) : isError ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">
          Lecture des stations indisponible : aucune donnée n’est estimée en
          remplacement.
        </p>
      ) : stations.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">
          Aucune station ou capteur trouvé dans le rayon de {radiusKm} km.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {stations.map((station) => {
            const badge = getStationQualificationBadge(station);
            const ageMinutes = minutesSince(station.updatedAt);
            const presentVariables = PRESENT_VARIABLES
              .filter((variable) => typeof station[variable.key] === "number" && Number.isFinite(station[variable.key]))
              .map((variable) => `${variable.label} ${station[variable.key]?.toFixed(variable.decimals)}${variable.unit}`);
            return (
              <li
                key={station.stationId}
                className="rounded-xl border border-slate-800 bg-[#090b10] px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-white">
                    {station.name}
                  </span>
                  <WeatherStatusBadge
                    compact
                    tone={BADGE_TONES[badge.kind]}
                    label={badge.label}
                  />
                  <WeatherStatusBadge
                    compact
                    tone="neutral"
                    label={SOURCE_LABELS[station.source] ?? station.source}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {Number(station.distanceKm).toFixed(1)} km · Dernier relevé{" "}
                  {formatAge(ageMinutes)}
                  {presentVariables.length > 0
                    ? ` · Variables présentes : ${presentVariables.join(", ")}`
                    : " · Aucune variable mesurée"}
                </p>
                {badge.detail ? (
                  <p className="mt-1 text-[11px] text-rose-200">
                    Motif d’exclusion : {badge.detail}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </MeteoSurface>
  );
}
