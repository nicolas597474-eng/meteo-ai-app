import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import { Compass, LocateFixed, Maximize2, Navigation, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { MeteoIcon } from "@/components/MeteoIcon";
import { MapControlButton, MapTypeToggle, MapZoomControl } from "@/components/MapControls";
import { MapView } from "@/components/Map";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { isNightAtLocalMinutes } from "@/lib/celestialNight";
import { isEclipseInProgress } from "@/lib/eclipseStatus";
import { isEclipseStartDue } from "@/lib/eclipseStartAlert";
import { getLunarGlowStrength } from "@/lib/lunarGlow";
import { trpc } from "@/lib/trpc";

type EnvironmentalData = {
  air: {
    aqi: number | null;
    descriptor: { label: string; tone: "emerald" | "lime" | "amber" | "orange" | "rose" | "slate" };
    pm25: number | null;
    pm10: number | null;
    nitrogenDioxide: number | null;
    ozone: number | null;
    observedAt: string | null;
    hourly: Array<{ time: string; value: number }>;
  } | null;
  astronomy: {
    sunrise: string | null;
    sunset: string | null;
    daylightDurationSeconds: number | null;
    moonrise: string | null;
    moonset: string | null;
    moon: { label: string; symbol: string };
    moonIllumination: number | null;
    dayProgress: number | null;
    sunAltitudeDeg: number | null;
    moonAltitudeDeg: number | null;
    sunAzimuthDeg: number | null;
    moonAzimuthDeg: number | null;
    sunAboveHorizon: boolean;
    moonAboveHorizon: boolean;
    altitudeCalculatedAt: string;
    timezone: string;
    cloudCover: number | null;
    outlook?: {
      moonMilestones: Array<{ id: "new_moon" | "first_quarter" | "full_moon" | "last_quarter"; label: string; date: string }>;
      nextSolarMilestone: { label: string; date: string } | null;
      daylightChangeTomorrowSeconds: number | null;
      upcomingEclipses: Array<{
        id: string;
        title: string;
        date: string;
        visibility: string;
        safetyNote: string | null;
        sourceLabel: string;
        sourceUrl: string;
        skyOutlook: { cloudCoverMean: number; label: string; moonIllumination: number | null } | null;
      }>;
      eclipseMapLayers?: EclipseMapLayer[];
      upcomingMeteorShowers: Array<{
        id: string;
        title: string;
        date: string;
        activeRange: string;
        zhr: number;
        observationNote: string;
        sourceLabel: string;
        sourceUrl: string;
        skyOutlook: { cloudCoverMean: number; label: string; moonIllumination: number | null } | null;
      }>;
    };
    coordinates: { lat: number; lon: number };
  } | null;
  source: string;
};

type EclipseMapLayer = {
  eventId: string;
  title: string;
  date: string;
  type: "solar" | "lunar";
  sourceLabel: string;
  sourceUrl: string;
  precisionLabel: string;
  visibilityCells: Array<{ north: number; south: number; east: number; west: number; visibility: "full_event" | "partial" }>;
  centralPath?: {
    northLimit: Array<{ lat: number; lng: number }>;
    southLimit: Array<{ lat: number; lng: number }>;
    centerLine: Array<{ lat: number; lng: number }>;
    attribution: string;
  };
};

const COMPASS_ROSE_POINTS = [
  { label: "N", angle: 0, cardinal: true },
  { label: "NE", angle: 45, cardinal: false },
  { label: "E", angle: 90, cardinal: true },
  { label: "SE", angle: 135, cardinal: false },
  { label: "S", angle: 180, cardinal: true },
  { label: "SO", angle: 225, cardinal: false },
  { label: "O", angle: 270, cardinal: true },
  { label: "NO", angle: 315, cardinal: false },
] as const;

const MOON_ALIGNMENT_TOLERANCE_DEG = 7;
// Un léger rapprochement évite les tuiles incomplètes aux extrémités de la vue immersive mobile.
const ECLIPSE_IMMERSIVE_WORLD_ZOOM = 2.35;

function getAngularDistance(firstAngle: number, secondAngle: number) {
  return Math.abs(((firstAngle - secondAngle + 540) % 360) - 180);
}

function nearestCompassRosePoint(azimuth: number | null) {
  if (azimuth == null) return null;
  return COMPASS_ROSE_POINTS.reduce((nearest, point) => {
    const distance = Math.abs(((azimuth - point.angle + 540) % 360) - 180);
    const nearestDistance = Math.abs(((azimuth - nearest.angle + 540) % 360) - 180);
    return distance < nearestDistance ? point : nearest;
  });
}

const aqiPalette = {
  emerald: { text: "text-emerald-200", line: "#34d399", soft: "border-emerald-400/20 bg-emerald-400/[0.04]" },
  lime: { text: "text-lime-200", line: "#a3e635", soft: "border-lime-400/20 bg-lime-400/[0.04]" },
  amber: { text: "text-amber-200", line: "#fbbf24", soft: "border-amber-400/20 bg-amber-400/[0.04]" },
  orange: { text: "text-orange-200", line: "#fb923c", soft: "border-orange-400/20 bg-orange-400/[0.04]" },
  rose: { text: "text-rose-200", line: "#fb7185", soft: "border-rose-400/20 bg-rose-400/[0.04]" },
  slate: { text: "text-slate-300", line: "#64748b", soft: "border-slate-600/30 bg-slate-800/30" },
};

function displayTime(value: string | null) { return value?.match(/T(\d{2}:\d{2})/)?.[1] ?? "—"; }
function displayTimeInZone(value: string | null, timeZone: string) { return value ? new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—"; }
function displayMinutes(value: number | null) { return value == null ? "—" : `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, "0")} min`; }
function displayDuration(value: number | null) { if (value == null) return "—"; const minutes = Math.round(value / 60); return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`; }
function displayAstronomyDate(value: string) { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function daysUntil(value: string) { return Math.max(0, Math.ceil((new Date(`${value}T12:00:00Z`).getTime() - Date.now()) / 86_400_000)); }
function DetailHint() { return <p className="mt-3 flex items-center gap-1 text-[10px] font-medium text-sky-200/90"><span>Voir les détails</span><span aria-hidden="true">→</span></p>; }
function formatAltitude(altitude: number | null) { return altitude == null ? "Altitude —" : `Altitude ${altitude >= 0 ? "+" : ""}${altitude.toFixed(1)}°`; }
function formatAzimuth(azimuth: number | null) { return azimuth == null ? "Azimut —" : `Azimut ${azimuth.toFixed(1)}°`; }
function formatLunarDistance(distanceKm: number | null | undefined) { return distanceKm == null ? "—" : `${new Intl.NumberFormat("fr-FR").format(Math.round(distanceKm))} km`; }
function formatAstronomyTime(value: string | null | undefined) { return value == null ? "—" : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

type ApparentBodyPosition = {
  altitudeDeg: number | null;
  azimuthDeg: number | null;
  distanceKm?: number | null;
  aboveHorizon: boolean;
};

type ApparentTrajectoryPoint = ApparentBodyPosition & {
  at: string;
};

type ApparentAstronomyPosition = {
  sun: ApparentBodyPosition;
  moon: ApparentBodyPosition;
  lunar?: { angleDeg: number; label: string; symbol: string; waxing: boolean; illuminationPct: number; brightLimbAngleDeg: number };
  events?: { sun: { rise: string | null; culmination: string | null; set: string | null }; moon: { rise: string | null; culmination: string | null; set: string | null } };
  trajectory?: {
    sun: ApparentTrajectoryPoint[];
    moon: ApparentTrajectoryPoint[];
  };
  calculatedAt: string;
};

/** Projection horizontale : Est à gauche, Sud au sommet, Ouest à droite. */
function projectApparentBodyOnArc(position: ApparentBodyPosition) {
  if (!position.aboveHorizon || position.altitudeDeg == null || position.azimuthDeg == null) return null;
  const altitudeRadians = position.altitudeDeg * Math.PI / 180;
  const azimuthRadians = position.azimuthDeg * Math.PI / 180;
  return {
    left: 50 - 42 * Math.sin(azimuthRadians),
    bottom: 16 + Math.max(0, Math.sin(altitudeRadians)) * 124,
  };
}

function buildTrajectoryPath(points: ApparentTrajectoryPoint[]) {
  let hasVisiblePoint = false;
  return points.reduce((path, point) => {
    const projected = projectApparentBodyOnArc(point);
    if (!projected) {
      hasVisiblePoint = false;
      return path;
    }
    const command = hasVisiblePoint ? "L" : "M";
    hasVisiblePoint = true;
    return `${path}${command}${projected.left.toFixed(2)} ${(160 - projected.bottom).toFixed(2)} `;
  }, "").trim();
}

function selectTrajectoryTimeMarkers(points: ApparentTrajectoryPoint[], hours: number[]) {
  return hours.flatMap((hour) => {
    const point = points.find((candidate) => new Date(candidate.at).getUTCHours() === hour && new Date(candidate.at).getUTCMinutes() === 0);
    const projected = point ? projectApparentBodyOnArc(point) : null;
    return projected ? [{ ...projected, label: `${String(hour).padStart(2, "0")}h` }] : [];
  });
}

function getCelestialLightPhase(sun: ApparentBodyPosition): "day" | "twilight" | "night" {
  const altitude = sun.altitudeDeg;
  if (altitude == null) return "night";
  if (altitude >= 6) return "day";
  return altitude > -6 ? "twilight" : "night";
}

/** Mode accéléré avec lecture, pause, reprise et curseur interactif. */
function useTimelapseSimulation(sunTrajectory: ApparentTrajectoryPoint[], moonTrajectory: ApparentTrajectoryPoint[]) {
  const [playing, setPlaying] = useState(false);
  const [opened, setOpened] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalFrames = Math.max(sunTrajectory.length, moonTrajectory.length, 1);
  const FRAME_DURATION_MS = Math.round(10_000 / totalFrames);

  const play = useCallback(() => { setOpened(true); setPlaying(true); }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => { if (!opened) { setOpened(true); setFrameIndex(0); setPlaying(true); } else { setPlaying((p) => !p); } }, [opened]);
  const stop = useCallback(() => { setPlaying(false); setOpened(false); setFrameIndex(0); }, []);
  const seek = useCallback((index: number) => { setFrameIndex(Math.max(0, Math.min(index, totalFrames - 1))); setOpened(true); }, [totalFrames]);

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setFrameIndex((prev) => {
        if (prev + 1 >= totalFrames) { setPlaying(false); return prev; }
        return prev + 1;
      });
    }, FRAME_DURATION_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, totalFrames, FRAME_DURATION_MS]);

  const active = opened;
  const sunFrame = opened ? (sunTrajectory[Math.min(frameIndex, sunTrajectory.length - 1)] ?? null) : null;
  const moonFrame = opened ? (moonTrajectory[Math.min(frameIndex, moonTrajectory.length - 1)] ?? null) : null;
  const progress = opened ? Math.round((frameIndex / Math.max(totalFrames - 1, 1)) * 100) : 0;
  const timeLabel = opened && sunFrame ? new Date(sunFrame.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : null;

  return { active, playing, play, pause, toggle, stop, seek, frameIndex, totalFrames, sunFrame, moonFrame, progress, timeLabel };
}

type TerrainHorizonPoint = { azimuthDeg: number; elevationDeg: number };
type TerrainHorizonProfile = { points: TerrainHorizonPoint[]; observerElevationM: number; resolutionM: number; source: string };

function buildTerrainPath(points: TerrainHorizonPoint[]) {
  if (!points.length) return "";
  const sorted = [...points].sort((a, b) => a.azimuthDeg - b.azimuthDeg);
  const project = (p: TerrainHorizonPoint) => {
    const azRad = p.azimuthDeg * Math.PI / 180;
    const left = 50 - 42 * Math.sin(azRad);
    const altRad = Math.max(0, p.elevationDeg) * Math.PI / 180;
    const bottom = 16 + Math.sin(altRad) * 124;
    return { x: left, y: 160 - bottom };
  };
  const first = project(sorted[0]);
  let d = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 1; i < sorted.length; i++) {
    const p = project(sorted[i]);
    d += ` L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  d += ` L100 158 L0 158 Z`;
  return d;
}

function minutesNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function timeToMinutes(value: string | null) {
  const match = value?.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Positionne l’astre selon ses propres heures de lever/coucher, sans estimation hors horizon. */
function celestialArcPosition(rise: string | null, set: string | null, now: number) {
  const riseMinutes = timeToMinutes(rise);
  const setMinutes = timeToMinutes(set);
  if (riseMinutes == null || setMinutes == null) return null;
  if (setMinutes >= riseMinutes) {
    if (now < riseMinutes || now > setMinutes) return null;
    return 10 + ((now - riseMinutes) / Math.max(1, setMinutes - riseMinutes)) * 80;
  }
  if (now >= riseMinutes) return 10 + ((now - riseMinutes) / Math.max(1, setMinutes + 1440 - riseMinutes)) * 80;
  if (now <= setMinutes) return 10 + ((now + 1440 - riseMinutes) / Math.max(1, setMinutes + 1440 - riseMinutes)) * 80;
  return null;
}

/** Arc de cercle : hauteur maximale cohérente avec le demi-cercle affiché. */
function arcBottom(position: number) { return 18 + Math.sin((position / 100) * Math.PI) * 140; }

/** Garde les astres dans le canevas, avec une zone haute réservée au titre du panneau. */
function safeArcMarkerBottom(position: number, lift = 0) {
  return Math.min(arcBottom(position) + lift, 118);
}

function PanelDialog({ title, description, children, content, className }: { title: string; description: string; children: ReactNode; content: ReactNode; className: string }) {
  return <Dialog><section className={`relative rounded-[22px] border p-4 ${className}`} aria-label={`${title} — ouvrir les détails`}><DialogTrigger asChild><button type="button" className="absolute inset-0 z-10 rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080a0f]"><span className="sr-only">Ouvrir les détails : {title}</span></button></DialogTrigger>{children}</section><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-slate-700 bg-[#0b111b] p-0 text-slate-100 sm:max-w-lg"><DialogHeader className="relative border-b border-slate-700/70 px-5 pt-5 pb-4 pr-12 text-left"><DialogTitle className="text-lg text-white">{title}</DialogTitle><DialogDescription className="text-xs leading-relaxed text-slate-400"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/75">À propos</span>{description}</DialogDescription><DialogClose aria-label="Fermer l’aide" className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-700/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-4 w-4" /></DialogClose></DialogHeader><div className="px-5 py-4">{content}</div><DialogFooter className="border-t border-slate-700/70 px-5 py-3"><DialogClose className="rounded-xl border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-medium text-slate-100">Fermer</DialogClose></DialogFooter></DialogContent></Dialog>;
}

function Metric({ label, value, unit }: { label: string; value: number | null; unit: string }) { return <div className="rounded-xl border border-white/5 bg-black/10 py-2"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 text-xs font-semibold text-slate-200">{value == null ? "—" : value.toFixed(0)}</p><p className="text-[8px] text-slate-500">{unit}</p></div>; }
function PollutantDetail({ label, value, description }: { label: string; value: number | null; description: string }) { return <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3"><p className="text-[10px] font-semibold text-slate-200">{label}</p><p className="mt-1 text-lg font-light text-white">{value == null ? "—" : value.toFixed(0)} <span className="text-[10px] text-slate-500">µg/m³</span></p><p className="mt-2 text-[10px] leading-relaxed text-slate-500">{description}</p></div>; }
function AstronomyDetail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-100">{value}</p></div>; }

function AstronomyVisibilityMap({ astronomy, eventTitle, eventKind }: { astronomy: NonNullable<EnvironmentalData["astronomy"]>; eventTitle: string; eventKind: "eclipse" | "meteor" }) {
  const center = astronomy.coordinates;
  const accent = eventKind === "eclipse" ? "#7dd3fc" : "#c084fc";
  const mapRef = useRef<google.maps.Map | null>(null);
  const adjustMapZoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const currentZoom = map.getZoom() ?? 9;
    map.setZoom(Math.max(3, Math.min(18, currentZoom + delta)));
  };
  const onMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    const position = { lat: center.lat, lng: center.lon };
    new google.maps.marker.AdvancedMarkerElement({ map, position, title: "Lieu actif" });
    new google.maps.Circle({
      map,
      center: position,
      radius: 25_000,
      strokeColor: accent,
      strokeOpacity: 0.85,
      strokeWeight: 2,
      fillColor: accent,
      fillOpacity: 0.12,
      clickable: false,
    });
  };
  return <div className="mt-3 overflow-hidden rounded-xl border border-slate-600/50 bg-slate-950/40"><div className="flex items-start justify-between gap-3 px-3 py-2.5"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Carte locale d’observation</p><p className="mt-1 text-xs font-semibold text-slate-100">{eventTitle}</p></div><span className="rounded-full border border-slate-500/50 px-2 py-1 text-[9px] text-slate-300">Rayon 25 km</span></div><div data-swipe-exclude><MapView className="h-[190px]" initialCenter={{ lat: center.lat, lng: center.lon }} initialZoom={9} mapTypeId="terrain" mapTypeControl={false} fullscreenControl={false} zoomControl={false} streetViewControl={false} rotateControl={false} onMapReady={onMapReady}><div className="absolute right-3 top-3 z-20" data-swipe-exclude><MapZoomControl onZoomIn={() => adjustMapZoom(1)} onZoomOut={() => adjustMapZoom(-1)} /></div></MapView></div><p className="border-t border-slate-700/60 px-3 py-2 text-[9px] leading-relaxed text-slate-400">Le cercle situe le lieu actif et son contexte d’observation. Il ne représente pas la bande géométrique d’une éclipse ; la visibilité dépend aussi de l’horizon, de la météo et de la luminosité locale.</p></div>;
}

function EclipseVisibilityMap({ astronomy, layers }: { astronomy: NonNullable<EnvironmentalData["astronomy"]>; layers: EclipseMapLayer[] }) {
  const [selectedLayerId, setSelectedLayerId] = useState(layers[0]?.eventId ?? "");
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [expandedMapType, setExpandedMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [expandedHeading, setExpandedHeading] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [soundAlertEnabled, setSoundAlertEnabled] = useState(false);
  const [isSoundHelpOpen, setIsSoundHelpOpen] = useState(false);
  const [visibilityOpacity, setVisibilityOpacity] = useState(100);
  const [isOpacityPanelOpen, setIsOpacityPanelOpen] = useState(false);
  const [isCompassDetailsOpen, setIsCompassDetailsOpen] = useState(false);
  const [isMapOpening, setIsMapOpening] = useState(false);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [orientationStatus, setOrientationStatus] = useState<"idle" | "waiting" | "tracking" | "no-data" | "denied" | "unsupported">("idle");
  const [headingSource, setHeadingSource] = useState<"none" | "absolute" | "relative">("none");
  const [relativeHeadingOffset, setRelativeHeadingOffset] = useState(0);
  const [isRelativeHeadingCalibrated, setIsRelativeHeadingCalibrated] = useState(false);
  const [displayedArrowRotation, setDisplayedArrowRotation] = useState(0);
  const headingSourceRef = useRef<"none" | "absolute" | "relative">("none");
  const mapRef = useRef<google.maps.Map | null>(null);
  const compactMapRef = useRef<google.maps.Map | null>(null);
  const expandedMapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const soundContextRef = useRef<AudioContext | null>(null);
  const observationAlertFiredRef = useRef(false);
  const isMapOpeningRef = useRef(false);
  const displayedArrowRotationRef = useRef(0);
  const moonAlignmentHapticRef = useRef(false);
  const visibilityRectanglesRef = useRef<Array<{ rectangle: google.maps.Rectangle; baseOpacity: number }>>([]);
  const selectedLayer = layers.find((layer) => layer.eventId === selectedLayerId) ?? layers[0];
  if (!selectedLayer) return null;
  const center = astronomy.coordinates;
  const compassHeading = deviceHeading == null ? expandedHeading : (deviceHeading + (headingSource === "relative" ? relativeHeadingOffset : 0) + 360) % 360;
  const isDeviceCompassActive = orientationStatus === "tracking" && deviceHeading != null;

  const circumstancesQuery = trpc.weather.getEclipseCircumstances.useQuery(
    selectedPoint
      ? { eventId: selectedLayer.eventId as "lunar_partial_2026_08_28" | "solar_partial_2027_08_02", lat: selectedPoint.lat, lon: selectedPoint.lon }
      : { eventId: selectedLayer.eventId as "lunar_partial_2026_08_28" | "solar_partial_2027_08_02", lat: center.lat, lon: center.lon },
    { enabled: Boolean(selectedPoint) },
  );
  const moonObservationCoordinates = useMemo(() => selectedPoint ? { lat: selectedPoint.lat, lon: selectedPoint.lon } : { lat: center.lat, lon: center.lon }, [center.lat, center.lon, selectedPoint]);
  const moonObservationQuery = trpc.weather.getApparentAstronomyPosition.useQuery(moonObservationCoordinates, {
    enabled: isMapExpanded && selectedLayer.type === "lunar",
    staleTime: 45_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const moonObservation = moonObservationQuery.data ?? null;
  const observationWindowStart = circumstancesQuery.data?.startAt ? new Date(circumstancesQuery.data.startAt).getTime() : null;
  const observationWindowEnd = circumstancesQuery.data?.endAt ? new Date(circumstancesQuery.data.endAt).getTime() : null;
  useEffect(() => {
    const nextBoundary = [observationWindowStart, observationWindowEnd]
      .filter((value): value is number => value != null && value > currentTimestamp)
      .sort((left, right) => left - right)[0];
    if (nextBoundary == null) return;
    const timeoutId = window.setTimeout(() => setCurrentTimestamp(Date.now()), Math.min(2_147_000_000, Math.max(0, nextBoundary - currentTimestamp + 250)));
    return () => window.clearTimeout(timeoutId);
  }, [currentTimestamp, observationWindowEnd, observationWindowStart]);

  const requestCircumstances = (lat: number, lon: number, label: string) => {
    setSelectedPoint({ lat, lon, label });
  };
  useEffect(() => {
    mapRef.current = isMapExpanded ? expandedMapRef.current : compactMapRef.current;
  }, [isMapExpanded]);
  useEffect(() => {
    const scale = visibilityOpacity / 100;
    visibilityRectanglesRef.current.forEach(({ rectangle, baseOpacity }) => rectangle.setOptions({ fillOpacity: baseOpacity * scale }));
  }, [visibilityOpacity]);
  useEffect(() => {
    if (!isMapExpanded || (orientationStatus !== "waiting" && orientationStatus !== "tracking") || typeof window === "undefined") return;
    const onDeviceOrientation = (event: DeviceOrientationEvent, absoluteEvent = false) => {
      const compassEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
      const safariHeading = compassEvent.webkitCompassHeading;
      const hasAbsoluteHeading = typeof safariHeading === "number" || absoluteEvent || event.absolute === true;
      if (!hasAbsoluteHeading && headingSourceRef.current === "absolute") return;
      const rawHeading = typeof safariHeading === "number" ? safariHeading : event.alpha == null ? null : 360 - event.alpha;
      if (rawHeading == null || !Number.isFinite(rawHeading)) return;
      const screenAngle = window.screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
      const correctedHeading = (rawHeading + screenAngle) % 360;
      setDeviceHeading((correctedHeading + 360) % 360);
      const nextSource = hasAbsoluteHeading ? "absolute" : "relative";
      const previousSource = headingSourceRef.current;
      headingSourceRef.current = nextSource;
      setHeadingSource(nextSource);
      if (nextSource === "relative" && previousSource === "none") {
        setLocationStatus("Cap relatif détecté : le téléphone suit bien vos rotations, mais ce navigateur ne fournit pas encore le nord magnétique. Activez l’orientation absolue si votre navigateur la propose.");
      }
      setOrientationStatus("tracking");
    };
    const onAbsoluteOrientation = (event: Event) => onDeviceOrientation(event as DeviceOrientationEvent, true);
    window.addEventListener("deviceorientation", onDeviceOrientation, true);
    window.addEventListener("deviceorientationabsolute", onAbsoluteOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", onDeviceOrientation, true);
      window.removeEventListener("deviceorientationabsolute", onAbsoluteOrientation, true);
    };
  }, [isMapExpanded, orientationStatus]);
  useEffect(() => {
    if (orientationStatus !== "waiting") return;
    const timeoutId = window.setTimeout(() => setOrientationStatus((status) => status === "waiting" ? "no-data" : status), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [orientationStatus]);

  const onMapReady = (map: google.maps.Map, isExpanded: boolean) => {
    mapRef.current = map;
    if (isExpanded) expandedMapRef.current = map;
    else compactMapRef.current = map;
    map.setMapTypeId(isExpanded ? expandedMapType : "terrain");
    map.setOptions({ fullscreenControl: false, streetViewControl: isExpanded, cameraControl: false, gestureHandling: isExpanded ? "greedy" : "none", draggable: isExpanded, scrollwheel: isExpanded, disableDoubleClickZoom: !isExpanded, keyboardShortcuts: isExpanded, mapTypeControlOptions: isExpanded ? { position: google.maps.ControlPosition.TOP_RIGHT } : undefined, zoomControlOptions: isExpanded ? { position: google.maps.ControlPosition.RIGHT_CENTER } : undefined, streetViewControlOptions: isExpanded ? { position: google.maps.ControlPosition.RIGHT_BOTTOM } : undefined });
    if (isExpanded) {
      map.addListener("heading_changed", () => setExpandedHeading(map.getHeading() ?? 0));
      map.getStreetView().setOptions({ addressControlOptions: { position: google.maps.ControlPosition.TOP_CENTER } });
    }
    const localPosition = { lat: center.lat, lng: center.lon };
    const localMarkerContent = document.createElement("div");
    localMarkerContent.className = "eclipse-user-location-marker";
    localMarkerContent.setAttribute("role", "img");
    localMarkerContent.setAttribute("aria-label", "Lieu actif");
    localMarkerContent.innerHTML = '<span class="eclipse-user-location-marker__pulse"></span><span class="eclipse-user-location-marker__core"></span>';
    new google.maps.marker.AdvancedMarkerElement({ map, position: localPosition, title: "Lieu actif", content: localMarkerContent });
    new google.maps.Circle({ map, center: localPosition, radius: 25_000, strokeColor: "#f8fafc", strokeOpacity: 0.65, strokeWeight: 1, fillColor: "#e2e8f0", fillOpacity: 0.06, clickable: false });
    const bounds = new google.maps.LatLngBounds();
    selectedLayer.visibilityCells.forEach((cell) => {
      const isFull = cell.visibility === "full_event";
      const baseOpacity = isFull ? 0.46 : 0.30;
      const rectangle = new google.maps.Rectangle({ map, bounds: { north: cell.north, south: cell.south, east: cell.east, west: cell.west }, strokeColor: isFull ? "#0284c7" : "#7c3aed", strokeOpacity: isFull ? 0.96 : 0.88, strokeWeight: isFull ? 2.5 : 2, fillColor: isFull ? "#0ea5e9" : "#8b5cf6", fillOpacity: baseOpacity * (visibilityOpacity / 100), clickable: true, zIndex: isFull ? 4 : 3 });
      visibilityRectanglesRef.current.push({ rectangle, baseOpacity });
      rectangle.addListener("click", (event: google.maps.MapMouseEvent) => {
        const lat = event.latLng?.lat() ?? (cell.north + cell.south) / 2;
        const lon = event.latLng?.lng() ?? (cell.east + cell.west) / 2;
        requestCircumstances(lat, lon, isFull ? "Zone entièrement visible" : "Zone de visibilité partielle");
      });
      bounds.extend({ lat: cell.north, lng: cell.east });
      bounds.extend({ lat: cell.south, lng: cell.west });
    });
    if (selectedLayer.centralPath) {
      const band = [...selectedLayer.centralPath.northLimit, ...selectedLayer.centralPath.southLimit.slice().reverse()];
      const polygon = new google.maps.Polygon({ map, paths: band, strokeColor: "#fbbf24", strokeOpacity: 0.95, strokeWeight: 2, fillColor: "#fbbf24", fillOpacity: 0.28, clickable: true });
      polygon.addListener("click", (event: google.maps.MapMouseEvent) => { if (event.latLng) requestCircumstances(event.latLng.lat(), event.latLng.lng(), "Bande centrale NASA"); });
      new google.maps.Polyline({ map, path: selectedLayer.centralPath.centerLine, strokeColor: "#fff7cc", strokeOpacity: 0.95, strokeWeight: 2, clickable: false });
      selectedLayer.centralPath.northLimit.forEach((point) => bounds.extend(point));
      selectedLayer.centralPath.southLimit.forEach((point) => bounds.extend(point));
    }
    bounds.extend(localPosition);
    if (!bounds.isEmpty() && isExpanded) {
      // Le cadrage de toutes les cellules peut tomber trop loin sur mobile et
      // laisser des bandes sans tuile. La vue immersive part donc du lieu actif
      // avec un léger rapprochement qui remplit durablement le viewport.
      map.setCenter(localPosition);
      map.setZoom(ECLIPSE_IMMERSIVE_WORLD_ZOOM);
    }
    if (!isExpanded) {
      map.setCenter(localPosition);
      map.setZoom(5);
    }
    if (isExpanded) requestAnimationFrame(() => {
      google.maps.event.trigger(map, "resize");
      map.setCenter(localPosition);
      map.setZoom(ECLIPSE_IMMERSIVE_WORLD_ZOOM);
      if (expandedMapRef.current === map) {
        isMapOpeningRef.current = false;
        setIsMapOpening(false);
      }
    });
  };
  const locateMe = () => {
    if (!navigator.geolocation) { setLocationStatus("La géolocalisation n’est pas disponible sur cet appareil."); return; }
    setIsLocating(true);
    setLocationStatus("Localisation en cours…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        setIsLocating(false);
        setLocationStatus("Position actuelle utilisée pour le calcul.");
        const activeMap = expandedMapRef.current ?? mapRef.current;
        activeMap?.panTo(point);
        activeMap?.setZoom(Math.max(activeMap.getZoom() ?? 4, 9));
        if (userMarkerRef.current) userMarkerRef.current.map = null;
        const markerContent = document.createElement("div");
        markerContent.className = "eclipse-user-location-marker";
        markerContent.setAttribute("role", "img");
        markerContent.setAttribute("aria-label", "Votre position actuelle");
        markerContent.innerHTML = '<span class="eclipse-user-location-marker__pulse"></span><span class="eclipse-user-location-marker__core"></span>';
        userMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({ map: activeMap ?? undefined, position: point, title: "Ma position actuelle", content: markerContent });
        requestCircumstances(point.lat, point.lng, "Ma position actuelle");
      },
      () => { setIsLocating(false); setLocationStatus("Position non disponible ou autorisation refusée. Le lieu actif reste affiché."); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  const circumstances = circumstancesQuery.data;
  const visibilityLabel = circumstances?.visibility === "full_event" ? "Événement entièrement visible" : circumstances?.visibility === "partial" ? "Visibilité partielle" : circumstances?.visibility === "not_visible" ? "Non visible à cette position" : null;
  const astronomicalAzimuth = circumstances?.azimuthDegrees ?? null;
  const astronomicalDirection = circumstances?.azimuthCardinal ?? null;
  const rawAstronomicalRotation = astronomicalAzimuth == null ? null : astronomicalAzimuth - compassHeading;
  useEffect(() => {
    if (rawAstronomicalRotation == null) return;
    const previousRotation = displayedArrowRotationRef.current;
    const shortestRotation = ((rawAstronomicalRotation - previousRotation + 540) % 360) - 180;
    const nextRotation = previousRotation + shortestRotation;
    displayedArrowRotationRef.current = nextRotation;
    setDisplayedArrowRotation(nextRotation);
  }, [rawAstronomicalRotation]);
  const astronomicalBodyLabel = selectedLayer.type === "solar" ? "Soleil" : "Lune";
  const astronomicalAzimuthLabel = astronomicalAzimuth == null ? "Azimut de l’astre indisponible" : `Azimut de l’astre : ${astronomicalAzimuth}°${astronomicalDirection ? ` ${astronomicalDirection}` : ""}`;
  const highlightedCompassPoint = nearestCompassRosePoint(astronomicalAzimuth);
  const hasReliableCompassHeading = isDeviceCompassActive && (headingSource === "absolute" || isRelativeHeadingCalibrated);
  const moonAlignmentDeltaDeg = selectedLayer.type === "lunar" && astronomicalAzimuth != null && hasReliableCompassHeading ? getAngularDistance(compassHeading, astronomicalAzimuth) : null;
  const isMoonGuidanceActive = moonAlignmentDeltaDeg != null && moonAlignmentDeltaDeg < 42;
  const isMoonAligned = moonAlignmentDeltaDeg != null && moonAlignmentDeltaDeg <= MOON_ALIGNMENT_TOLERANCE_DEG;
  const moonAlignmentProximity = moonAlignmentDeltaDeg == null ? 0 : Math.max(0, 1 - Math.min(moonAlignmentDeltaDeg, 42) / 42);
  const moonAlignmentStyle = {
    "--moon-alignment-proximity": moonAlignmentProximity.toFixed(3),
    "--moon-guidance-opacity": (0.10 + moonAlignmentProximity * 0.82).toFixed(3),
    "--moon-guidance-scale": (0.84 + moonAlignmentProximity * 0.16).toFixed(3),
  } as CSSProperties;
  const isUsingAuthorizedPosition = selectedPoint?.label === "Ma position actuelle";
  const isAstronomicalWindowOpen = observationWindowStart != null && observationWindowEnd != null && currentTimestamp >= observationWindowStart && currentTimestamp <= observationWindowEnd;
  const isAstroObservableNow = isUsingAuthorizedPosition && circumstances?.visibility !== "not_visible" && circumstances?.altitudeDegrees != null && circumstances.altitudeDegrees > 0 && isAstronomicalWindowOpen;
  const observationNotice = isAstroObservableNow ? `${selectedLayer.type === "solar" ? "Le Soleil" : "La Lune"} est dans sa fenêtre calculée d’observabilité depuis votre position.` : null;
  const toggleSoundAlert = () => {
    if (soundAlertEnabled) {
      setSoundAlertEnabled(false);
      observationAlertFiredRef.current = false;
      return;
    }
    if (typeof AudioContext === "undefined") {
      setLocationStatus("L’alerte sonore n’est pas prise en charge par ce navigateur.");
      return;
    }
    const context = soundContextRef.current ?? new AudioContext();
    soundContextRef.current = context;
    void context.resume();
    observationAlertFiredRef.current = false;
    setSoundAlertEnabled(true);
  };
  useEffect(() => () => { void soundContextRef.current?.close(); }, []);
  useEffect(() => {
    if (!isMoonAligned) {
      moonAlignmentHapticRef.current = false;
      return;
    }
    if (moonAlignmentHapticRef.current || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(18);
    moonAlignmentHapticRef.current = true;
  }, [isMoonAligned]);
  useEffect(() => {
    if (!isAstroObservableNow) {
      observationAlertFiredRef.current = false;
      return;
    }
    if (!soundAlertEnabled || observationAlertFiredRef.current || !soundContextRef.current) return;
    const context = soundContextRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(880, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
    observationAlertFiredRef.current = true;
  }, [isAstroObservableNow, soundAlertEnabled]);
  const recenterExpandedMap = () => {
    const map = expandedMapRef.current;
    if (!map) return;
    map.setHeading(0);
    map.setTilt(0);
    map.setCenter({ lat: center.lat, lng: center.lon });
    map.setZoom(ECLIPSE_IMMERSIVE_WORLD_ZOOM);
    setExpandedHeading(0);
  };
  const adjustExpandedZoom = (delta: number) => {
    const map = expandedMapRef.current;
    if (!map) return;
    const currentZoom = map.getZoom() ?? 4;
    map.setZoom(Math.max(ECLIPSE_IMMERSIVE_WORLD_ZOOM, Math.min(20, currentZoom + delta)));
  };
  const openExpandedMap = () => {
    if (isMapExpanded || isMapOpeningRef.current) return;
    isMapOpeningRef.current = true;
    setIsMapOpening(true);
    setIsMapExpanded(true);
    if (typeof document !== "undefined" && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        setLocationStatus("Le plein écran du navigateur n’est pas disponible. La carte reste ouverte en vue immersive intégrée.");
      });
    }
  };
  const closeExpandedMap = () => {
    if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen();
    isMapOpeningRef.current = false;
    setIsMapOpening(false);
    setIsMapExpanded(false);
  };
  const compassButtonClassName = `eclipse-compass-shell relative h-[124px] w-[124px]${isMoonAligned ? " eclipse-moon-aligned" : ""}`;
  const compassButtonAriaLabel = isDeviceCompassActive
    ? `Boussole du téléphone active. Cap ${Math.round(compassHeading)} degrés.${isMoonAligned ? " Lune dans l’axe de visée." : ""} Ouvrir les détails.`
    : "Activer la boussole du téléphone depuis la rose des vents";
  const enableDeviceCompass = async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setOrientationStatus("unsupported");
      return;
    }
    const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    try {
      if (typeof orientationEvent.requestPermission === "function") {
        const permission = await orientationEvent.requestPermission();
        if (permission !== "granted") {
          setOrientationStatus("denied");
          return;
        }
      }
      setDeviceHeading(null);
      setHeadingSource("none");
      headingSourceRef.current = "none";
      setRelativeHeadingOffset(0);
      setIsRelativeHeadingCalibrated(false);
      setOrientationStatus("waiting");
    } catch {
      setOrientationStatus("denied");
    }
  };
  const opacityControl = <div className="absolute bottom-16 left-3 z-20 flex flex-col items-start gap-2" data-swipe-exclude>{isOpacityPanelOpen && <div className="map-opacity-control"><label htmlFor="eclipse-opacity-expanded" className="map-opacity-control__label">Opacité <span>{visibilityOpacity}%</span></label><input id="eclipse-opacity-expanded" type="range" min="0" max="100" step="1" value={visibilityOpacity} onChange={(event) => setVisibilityOpacity(Number(event.target.value))} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); const bounds = event.currentTarget.getBoundingClientRect(); setVisibilityOpacity(Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100)); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setVisibilityOpacity(Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100)); }} onPointerUp={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onTouchStart={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()} aria-label="Opacité des zones de visibilité" /></div>}<MapControlButton onClick={() => setIsOpacityPanelOpen((open) => !open)} aria-label="Régler l’opacité des zones de visibilité" aria-expanded={isOpacityPanelOpen} title="Opacité des zones" active={isOpacityPanelOpen}><SlidersHorizontal size={21} strokeWidth={2.3} aria-hidden="true" /></MapControlButton></div>;
  const mapContent = (suffix: string, height: string, isExpanded = false) => (
    <MapView key={`${selectedLayer.eventId}-${suffix}`} className={isExpanded ? "eclipse-map-viewport" : height} initialCenter={{ lat: center.lat, lng: center.lon }} initialZoom={3} mapTypeId={isExpanded ? expandedMapType : "terrain"} mapTypeControl={false} fullscreenControl={false} zoomControl={false} streetViewControl={isExpanded} rotateControl={isExpanded} allowPageScroll={!isExpanded} onMapReady={(map) => onMapReady(map, isExpanded)}>
      {!isExpanded && <div className="absolute right-3 top-3 z-20 flex flex-col gap-2" data-swipe-exclude><MapControlButton shape="square" onClick={openExpandedMap} disabled={isMapOpening} aria-label={isMapOpening ? "Ouverture de la carte" : "Agrandir la carte"} title={isMapOpening ? "Ouverture de la carte…" : "Agrandir la carte"} aria-busy={isMapOpening} className="h-11 w-11"><Maximize2 size={21} strokeWidth={2.35} aria-hidden="true" /></MapControlButton><MapControlButton onClick={locateMe} disabled={isLocating} aria-label={isLocating ? "Localisation en cours" : "Me localiser"} title={isLocating ? "Localisation en cours" : "Me localiser"} aria-busy={isLocating} className="h-11 w-11 text-sky-200"><LocateFixed size={21} strokeWidth={2.25} aria-hidden="true" /></MapControlButton></div>}
      {!isExpanded && <div className="absolute bottom-3 right-3 z-20" data-swipe-exclude><MapZoomControl onZoomIn={() => { const map = compactMapRef.current; if (map) map.setZoom(Math.min(20, (map.getZoom() ?? 3) + 1)); }} onZoomOut={() => { const map = compactMapRef.current; if (map) map.setZoom(Math.max(2, (map.getZoom() ?? 3) - 1)); }} /></div>}
      {isExpanded && opacityControl}
      {isExpanded && <div className="map-control-cluster absolute left-3 top-3 z-20" data-swipe-exclude><MapControlButton onClick={() => { if (isDeviceCompassActive) setIsCompassDetailsOpen(true); else void enableDeviceCompass(); }} aria-label={compassButtonAriaLabel} aria-haspopup={isDeviceCompassActive ? "dialog" : undefined} aria-expanded={isDeviceCompassActive ? isCompassDetailsOpen : undefined} title={isMoonAligned ? "Lune dans l’axe de visée" : isDeviceCompassActive ? "Boussole orientée par le téléphone" : "Touchez pour orienter la boussole"} shape="circle" active={isDeviceCompassActive} className={compassButtonClassName} data-moon-aligned={isMoonAligned ? "true" : "false"}><span className="eclipse-compass-ring absolute inset-[6px] rounded-full" aria-hidden="true" /><span className="eclipse-compass-orbit absolute inset-[14px] rounded-full" aria-hidden="true" />{isMoonGuidanceActive && <span className="eclipse-moon-alignment-ring absolute left-1/2 top-1/2" aria-hidden="true" style={moonAlignmentStyle} />}{[0, 90, 180, 270].map((angle) => <span key={`cardinal-arrow-${angle}`} className="eclipse-compass-cardinal-arrow absolute left-1/2 top-1/2" aria-hidden="true" style={{ transform: `translate(-50%, -50%) rotate(${angle - compassHeading}deg) translateY(-56px)` }} />)}{COMPASS_ROSE_POINTS.map((point) => { const isAstroDirection = highlightedCompassPoint?.label === point.label; return <span key={point.label} aria-hidden="true" className={`eclipse-compass-label ${point.cardinal ? "eclipse-compass-label--cardinal" : "eclipse-compass-label--intercardinal"} absolute left-1/2 top-1/2 leading-none ${isAstroDirection ? "rounded-full bg-amber-300 px-1 font-black text-amber-950 shadow-sm" : ""} ${point.label === "N" && !isAstroDirection ? "text-rose-300" : ""}`} style={{ transform: `translate(-50%, -50%) rotate(${point.angle - compassHeading}deg) translateY(-50px) rotate(${compassHeading - point.angle}deg)` }}>{point.label}</span>; })}{astronomicalAzimuth != null && <svg className="eclipse-astro-guidance-arrow absolute inset-[6px]" viewBox="0 0 100 100" aria-hidden="true" style={{ transform: `rotate(${displayedArrowRotation}deg)` }}><defs><linearGradient id={`eclipse-guidance-${suffix}`} x1="50" y1="62" x2="50" y2="10" gradientUnits="userSpaceOnUse"><stop stopColor="#1d4ed8" stopOpacity="0.22" /><stop offset="0.6" stopColor="#38bdf8" /><stop offset="1" stopColor="#dbeafe" /></linearGradient></defs><path className="eclipse-astro-guidance-arrow__beam" d="M50 63V28" stroke={`url(#eclipse-guidance-${suffix})`} /><path className="eclipse-astro-guidance-arrow__head" d="M50 9 L62 34 L50 29 L38 34 Z" fill={`url(#eclipse-guidance-${suffix})`} /><circle className="eclipse-astro-guidance-arrow__core" cx="50" cy="62" r="4.3" /></svg>}<span className="eclipse-compass-center-pulse absolute left-1/2 top-1/2" aria-hidden="true" /><span className="eclipse-compass-center absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" aria-hidden="true"><Compass size={20} strokeWidth={2.3} style={{ transform: `rotate(${-compassHeading}deg)` }} /></span>{isMoonAligned && <span className="eclipse-moon-alignment-label absolute left-1/2 top-1/2" aria-hidden="true">Lune alignée</span>}<span className="eclipse-astro-bearing absolute -bottom-4" aria-hidden="true"><small>{astronomicalBodyLabel}</small><strong>{astronomicalAzimuth == null ? "Az. —" : `${astronomicalAzimuth}° ${astronomicalDirection ?? ""}`}</strong></span></MapControlButton></div>}
      {isExpanded && <div className="map-compass-status absolute left-3 top-[208px] z-20 w-[188px]" data-swipe-exclude><div className="w-full rounded-xl border border-slate-500/60 bg-[#111c2b]/95 px-2.5 py-2 text-left text-[10px] font-semibold leading-snug text-slate-100 shadow-lg"><p>{orientationStatus === "denied" ? "Capteur refusé" : orientationStatus === "unsupported" ? "Capteur indisponible" : orientationStatus === "waiting" ? "Bougez le téléphone" : orientationStatus === "no-data" ? "Aucun cap reçu" : isDeviceCompassActive ? `Cap ${Math.round(compassHeading)}°${headingSource === "relative" ? isRelativeHeadingCalibrated ? " calibré" : " relatif" : ""}` : "Touchez la rose des vents"}</p>{!isDeviceCompassActive && orientationStatus !== "waiting" && orientationStatus !== "unsupported" && <p className="mt-1 border-t border-slate-600/70 pt-1.5 text-[9px] font-medium text-sky-100">Autorisez Mouvement et orientation dans les réglages du navigateur.</p>}</div></div>}
      {isExpanded && selectedLayer.type === "lunar" && <aside className="lunar-live-panel absolute right-3 z-20" style={{ bottom: observationNotice ? "4.7rem" : "0.75rem" }} aria-label="Informations lunaires actuelles" data-swipe-exclude><div className="lunar-live-panel__glow" aria-hidden="true" /><div className="lunar-live-panel__content"><div className="flex items-start justify-between gap-3"><div><p className="lunar-live-panel__eyebrow">Lune actuelle</p><p className="lunar-live-panel__phase"><span aria-hidden="true">{moonObservation?.lunar?.symbol ?? astronomy.moon.symbol}</span>{moonObservation?.lunar?.label ?? astronomy.moon.label}</p></div><span className="lunar-live-panel__illumination">{moonObservation?.lunar?.illuminationPct ?? astronomy.moonIllumination ?? "—"}%</span></div><div className="lunar-live-panel__metric"><span>Distance Terre–Lune</span><strong>{formatLunarDistance(moonObservation?.moon.distanceKm)}</strong></div><p className="lunar-live-panel__updated">Calcul réel · {formatAstronomyTime(moonObservation?.calculatedAt)}</p></div></aside>}
      {isExpanded && <div className="absolute left-[calc(50%+39px)] top-3 z-20 -translate-x-1/2" data-swipe-exclude><MapTypeToggle value={expandedMapType} onChange={(value) => { setExpandedMapType(value); expandedMapRef.current?.setMapTypeId(value); }} /></div>}
      {isExpanded && <MapControlButton onClick={closeExpandedMap} aria-label="Fermer la carte agrandie" title="Fermer la carte" className="absolute right-3 top-3 z-20"><X aria-hidden="true" className="h-6 w-6" strokeWidth={2.2} /></MapControlButton>}
      {isExpanded && <div className="absolute right-3 top-[calc(28%+2.5rem)] z-20 flex flex-col items-center gap-4" data-swipe-exclude><MapControlButton onClick={locateMe} disabled={isLocating} aria-label={isLocating ? "Localisation en cours" : "Centrer la carte sur ma position"} title={isLocating ? "Localisation en cours…" : "Centrer sur ma position"} aria-busy={isLocating} className="text-sky-200"><LocateFixed aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} /></MapControlButton><MapZoomControl onZoomIn={() => adjustExpandedZoom(1)} onZoomOut={() => adjustExpandedZoom(-1)} /></div>}
      {observationNotice && <div className="map-observability-notice absolute inset-x-3 bottom-3 z-20 flex items-start gap-2 rounded-xl border border-emerald-200/80 bg-emerald-950/95 px-3 py-2 text-emerald-50 shadow-lg" role="alert"><Navigation size={16} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" /><p className="text-[10px] font-semibold leading-snug">{observationNotice}<span className="mt-0.5 block text-[9px] font-normal text-emerald-100/80">Calcul astronomique : vérifiez l’horizon, les nuages et, pour le Soleil, utilisez une protection adaptée.</span></p></div>}
    </MapView>
  );

  return <div className="mt-3 overflow-hidden rounded-xl border border-sky-300/35 bg-slate-950/40"><div className="flex items-start justify-between gap-3 px-3 py-2.5"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Zones de visibilité d’éclipse</p><p className="mt-1 text-xs font-semibold text-slate-100">{selectedLayer.title}</p></div><span className="rounded-full border border-sky-300/35 px-2 py-1 text-[9px] text-sky-100">{selectedLayer.type === "solar" ? "Solaire" : "Lunaire"}</span></div>{layers.length > 1 && <div className="flex gap-2 border-t border-slate-700/60 px-3 py-2" data-swipe-exclude>{layers.map((layer) => <button key={layer.eventId} type="button" onClick={() => { setSelectedLayerId(layer.eventId); setSelectedPoint(null); }} className={`min-h-8 rounded-full border px-2.5 text-[10px] font-medium ${layer.eventId === selectedLayer.eventId ? "border-sky-300/70 bg-sky-400/15 text-sky-100" : "border-slate-600/70 text-slate-400"}`}>{layer.type === "solar" ? "Solaire" : "Lunaire"} · {displayAstronomyDate(layer.date)}</button>)}</div>}<div data-swipe-exclude>{mapContent("compact", "h-[280px]")}</div><div className="border-t border-slate-700/60 px-3 py-2.5 text-[9px] leading-relaxed text-slate-400"><div className="flex flex-wrap gap-x-3 gap-y-1"><span><i className="inline-block h-2 w-2 rounded-sm bg-sky-400/80" /> Événement entièrement visible</span><span><i className="inline-block h-2 w-2 rounded-sm bg-violet-400/80" /> Visibilité partielle</span>{selectedLayer.centralPath && <span><i className="inline-block h-2 w-2 rounded-sm bg-amber-300" /> Bande centrale NASA</span>}</div><div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/50 p-2.5"><p className="text-[10px] font-semibold text-sky-100">{selectedPoint ? `${selectedPoint.label} · ${selectedPoint.lat.toFixed(3)}°, ${selectedPoint.lon.toFixed(3)}°` : "Cliquez sur une zone de visibilité pour voir ses détails."}</p>{circumstancesQuery.isLoading && <p className="mt-1 text-[10px] text-slate-400">Calcul des circonstances locales…</p>}{circumstancesQuery.error && <p className="mt-1 text-[10px] text-rose-200">Calcul indisponible : {circumstancesQuery.error.message}</p>}{circumstances && <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-300"><p className="col-span-2 font-semibold text-slate-100">{visibilityLabel} · {circumstances.label}</p><p>Début : {displayTimeInZone(circumstances.startAt, astronomy.timezone)}</p><p>Maximum : {displayTimeInZone(circumstances.peakAt, astronomy.timezone)}</p><p>Fin : {displayTimeInZone(circumstances.endAt, astronomy.timezone)}</p><p>Durée : {displayMinutes(circumstances.durationMinutes)}</p><p>Hauteur : {circumstances.altitudeDegrees == null ? "—" : `${circumstances.altitudeDegrees}°`}</p><p>Azimut : {circumstances.azimuthDegrees == null ? "—" : `${circumstances.azimuthDegrees}° ${circumstances.azimuthCardinal ?? ""}`}</p><p>Obscuration : {circumstances.obscurationPercent == null ? "—" : `${circumstances.obscurationPercent}%`}</p><p className="col-span-2 text-[9px] text-slate-500">Direction mesurée depuis le nord géographique, dans le sens horaire.</p><p className="col-span-2 mt-1 text-slate-400">{circumstances.detail}</p><p className="col-span-2 text-[9px] text-slate-500">{circumstances.precisionLabel}</p></div>}</div><p className="mt-2">{selectedLayer.precisionLabel}</p><p className="mt-1">Source : <a href={selectedLayer.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-200 underline underline-offset-2">{selectedLayer.sourceLabel}</a>. Le cercle blanc situe seulement le lieu actif et son contexte local.</p><Dialog open={isMapExpanded} onOpenChange={(open) => { if (!open) closeExpandedMap(); }}><DialogContent className="max-h-[calc(100dvh-1.25rem)] overflow-y-auto border-slate-700 bg-[#0b111b] p-0 text-slate-100 sm:max-w-5xl"><DialogHeader className="border-b border-slate-700/70 px-5 pt-5 pb-4 text-left"><DialogTitle className="text-lg text-white">Carte de visibilité d’éclipse</DialogTitle><DialogDescription className="text-xs leading-relaxed text-slate-400">{selectedLayer.title} · utilisez les contrôles de zoom et la flèche de direction pour explorer la carte.</DialogDescription></DialogHeader><div className="px-4 py-4" data-swipe-exclude>{mapContent("expanded", "h-[min(68dvh,620px)]", true)}</div><DialogFooter className="border-t border-slate-700/70 px-5 py-3"><DialogClose className="min-h-10 rounded-xl border border-slate-600 bg-slate-800/70 px-4 text-xs font-medium text-slate-100">Fermer la carte</DialogClose></DialogFooter></DialogContent></Dialog><Dialog open={isCompassDetailsOpen} onOpenChange={setIsCompassDetailsOpen}><DialogContent className="border-slate-700 bg-[#0b111b] text-slate-100 sm:max-w-sm"><DialogHeader className="text-left"><DialogTitle>Détails de la boussole</DialogTitle><DialogDescription className="text-xs leading-relaxed text-slate-400">Orientation de la carte et relèvement calculé de l’astre pour le point sélectionné.</DialogDescription></DialogHeader><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Orientation de la carte" value={`${Math.round(expandedHeading)}°`} /><AstronomyDetail label="Nord" value="Nord géographique" /><AstronomyDetail label="Azimut de l’astre" value={astronomicalAzimuth == null ? "Indisponible" : `${astronomicalAzimuth}°`} /><AstronomyDetail label="Direction cardinale" value={astronomicalDirection ?? "Indisponible"} /><AstronomyDetail label="Repère de rose" value={highlightedCompassPoint?.label ?? "Indisponible"} /></div>{headingSource === "relative" && deviceHeading != null && <div className="rounded-xl border border-sky-300/25 bg-sky-300/[0.06] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-sky-100">Calibrer le nord</p><p className="mt-1">Le navigateur fournit un cap relatif : la rose suit vos rotations, mais son zéro peut être décalé. Ouvrez la boussole native du téléphone, tenez l’appareil à plat avec le haut dirigé vers le nord, revenez ici sans le tourner puis calibrez.</p><button type="button" onClick={() => { setRelativeHeadingOffset((360 - deviceHeading) % 360); setIsRelativeHeadingCalibrated(true); setLocationStatus("Boussole relative calibrée sur le nord : la rose conserve maintenant cet alignement tant que le suivi reste actif."); }} className="mt-3 min-h-10 rounded-lg border border-sky-300/50 bg-sky-300/15 px-3 text-xs font-semibold text-sky-50 transition hover:bg-sky-300/25 active:scale-[0.97]">Calibrer sur le nord</button></div>}<div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-amber-100">Comment lire la boussole</p><p className="mt-1">Le repère N indique le nord géographique. La flèche orange montre l’azimut de l’astre, mesuré dans le sens horaire depuis ce nord. Le repère doré est l’arrondi visuel de ce relèvement sur huit directions. L’orientation de la carte peut être tournée indépendamment.</p></div><p className="text-[10px] leading-relaxed text-slate-500">Ce relèvement est calculé pour la position sélectionnée et le maximum de l’événement. Il ne garantit pas un horizon dégagé ni des conditions d’observation réelles.</p></div><DialogFooter><DialogClose className="rounded-xl border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-medium text-slate-100">Fermer</DialogClose></DialogFooter></DialogContent></Dialog>{locationStatus && <p className="mt-2 text-[9px] text-slate-400" role="status">{locationStatus}</p>}</div></div>;
}

function AstronomyOutlookPanel({ astronomy }: { astronomy: EnvironmentalData["astronomy"] }) {
  const [isEventFullscreen, setIsEventFullscreen] = useState(false);
  const [visualEclipseAlertEnabled, setVisualEclipseAlertEnabled] = useState(false);
  const [soundEclipseAlertEnabled, setSoundEclipseAlertEnabled] = useState(false);
  const [isEclipseStartAlertVisible, setIsEclipseStartAlertVisible] = useState(false);
  const eclipseStartAlertFiredRef = useRef<string | null>(null);
  const eclipseSoundContextRef = useRef<AudioContext | null>(null);
  const outlook = astronomy?.outlook;
  if (!astronomy || !outlook) return null;
  const fullMoon = outlook.moonMilestones.find((milestone) => milestone.id === "full_moon") ?? null;
  const newMoon = outlook.moonMilestones.find((milestone) => milestone.id === "new_moon") ?? null;
  const quarterMilestones = outlook.moonMilestones.filter((milestone) => milestone.id === "first_quarter" || milestone.id === "last_quarter");
  const primaryEclipse = outlook.upcomingEclipses[0] ?? null;
  const localEclipseEventId: "lunar_partial_2026_08_28" | "solar_partial_2027_08_02" | null = primaryEclipse?.id === "lunar_partial_2026_08_28" || primaryEclipse?.id === "solar_partial_2027_08_02" ? primaryEclipse.id : null;
  const localEclipseQuery = trpc.weather.getEclipseCircumstances.useQuery({ eventId: localEclipseEventId ?? "lunar_partial_2026_08_28", lat: astronomy.coordinates.lat, lon: astronomy.coordinates.lon }, { enabled: localEclipseEventId != null, staleTime: 300_000 });
  const localEclipse = localEclipseQuery.data;
  const [eclipseClock, setEclipseClock] = useState(() => Date.now());
  useEffect(() => {
    if (!localEclipse?.startAt || !localEclipse?.endAt) return;
    const interval = window.setInterval(() => setEclipseClock(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [localEclipse?.startAt, localEclipse?.endAt]);
  const eclipseInProgress = isEclipseInProgress(localEclipse?.startAt, localEclipse?.endAt, eclipseClock);
  const triggerEclipseTone = useCallback(() => {
    const context = eclipseSoundContextRef.current;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.44);
  }, []);
  const toggleEclipseSoundAlert = () => {
    if (soundEclipseAlertEnabled) {
      setSoundEclipseAlertEnabled(false);
      return;
    }
    if (typeof AudioContext === "undefined") return;
    const context = eclipseSoundContextRef.current ?? new AudioContext();
    eclipseSoundContextRef.current = context;
    void context.resume();
    setSoundEclipseAlertEnabled(true);
  };
  useEffect(() => () => { void eclipseSoundContextRef.current?.close(); }, []);
  useEffect(() => {
    const startAt = localEclipse?.startAt;
    const endAt = localEclipse?.endAt;
    const eventKey = startAt && endAt ? `${startAt}:${endAt}` : null;
    if (!startAt || !endAt || !eventKey || (!visualEclipseAlertEnabled && !soundEclipseAlertEnabled)) return;
    const fire = () => {
      if (eclipseStartAlertFiredRef.current === eventKey || !isEclipseStartDue(startAt, endAt)) return;
      if (visualEclipseAlertEnabled) setIsEclipseStartAlertVisible(true);
      if (soundEclipseAlertEnabled) triggerEclipseTone();
      eclipseStartAlertFiredRef.current = eventKey;
    };
    const delay = Math.max(0, Date.parse(startAt) - Date.now());
    const timer = window.setTimeout(fire, delay);
    fire();
    return () => window.clearTimeout(timer);
  }, [localEclipse?.startAt, localEclipse?.endAt, visualEclipseAlertEnabled, soundEclipseAlertEnabled, triggerEclipseTone]);
  const localVisibility = localEclipseQuery.isLoading ? { label: "Calcul local en cours", tone: "text-slate-300 border-slate-500/40 bg-slate-800/45", detail: "Les circonstances sont calculées depuis les coordonnées du lieu actif." }
    : localEclipseQuery.error || !localEclipse ? { label: "Visibilité locale indisponible", tone: "text-slate-300 border-slate-500/40 bg-slate-800/45", detail: "Aucune estimation n’est affichée tant que les circonstances locales ne sont pas disponibles." }
      : localEclipse.visibility === "full_event" ? { label: eclipseInProgress ? "Éclipse en cours · visible intégralement" : "Visible intégralement", tone: "text-emerald-100 border-emerald-300/35 bg-emerald-400/[0.10]", detail: `${localEclipse.label} : astre au-dessus de l’horizon pendant toute la phase calculée. Maximum à ${displayTimeInZone(localEclipse.peakAt, astronomy.timezone)}.` }
        : localEclipse.visibility === "partial" ? { label: "Visible en partie", tone: "text-amber-100 border-amber-300/35 bg-amber-400/[0.10]", detail: `${localEclipse.label} : astre visible au maximum, mais pas pendant toute la phase. Maximum à ${displayTimeInZone(localEclipse.peakAt, astronomy.timezone)}.` }
          : { label: "Non visible localement", tone: "text-rose-100 border-rose-300/35 bg-rose-400/[0.10]", detail: `${localEclipse.label} : l’astre est sous l’horizon au maximum pour le lieu actif.` };
  const primaryMeteorShower = outlook.upcomingMeteorShowers[0] ?? null;
  const daylightTrend = outlook.daylightChangeTomorrowSeconds == null
    ? "Variation demain indisponible"
    : outlook.daylightChangeTomorrowSeconds === 0
      ? "Durée du jour stable demain"
      : `${outlook.daylightChangeTomorrowSeconds > 0 ? "+" : "−"}${Math.abs(Math.round(outlook.daylightChangeTomorrowSeconds / 60))} min de jour demain`;

  return <section className="astronomy-outlook-panel weather-surface border border-violet-300/20 bg-gradient-to-br from-indigo-500/[0.10] via-slate-950/35 to-sky-500/[0.07] p-4" aria-label="Prochains repères astronomiques">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">Ciel à venir</p><h3 className="mt-1 text-base font-semibold text-slate-100">Prochains repères astronomiques</h3></div><span className="text-xl" aria-hidden="true">✦</span></div>
    <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-slate-300"><span className="inline-flex items-center gap-1 rounded-full border border-indigo-300/30 bg-indigo-400/[0.08] px-2 py-1" role="img" aria-label="Icône de pleine lune">🌕 <span>Pleine lune</span></span><span className="inline-flex items-center gap-1 rounded-full border border-sky-300/30 bg-sky-400/[0.08] px-2 py-1" role="img" aria-label="Icône d’éclipse">◐ <span>Éclipse</span></span><span className="inline-flex items-center gap-1 rounded-full border border-violet-300/30 bg-violet-400/[0.08] px-2 py-1" role="img" aria-label="Icône de pluie de météores">☄ <span>Étoiles filantes</span></span></div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <AstronomyDetail label="🌕 Prochaine pleine lune" value={fullMoon ? displayAstronomyDate(fullMoon.date) : "Indisponible"} />
      <AstronomyDetail label="Prochaine nouvelle lune" value={newMoon ? displayAstronomyDate(newMoon.date) : "Indisponible"} />
    </div>
    {quarterMilestones.length > 0 && <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Autres phases : {quarterMilestones.map((milestone) => `${milestone.label} · ${displayAstronomyDate(milestone.date)}`).join(" · ")}.</p>}
    <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100">Soleil</p><p className="mt-1 text-xs font-semibold text-slate-100">{outlook.nextSolarMilestone ? `${outlook.nextSolarMilestone.label} · ${displayAstronomyDate(outlook.nextSolarMilestone.date)}` : "Prochain jalon solaire indisponible"}</p><p className="mt-1 text-[10px] text-slate-400">{daylightTrend}</p></div>
    {primaryEclipse && <div role="status" className={`mt-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${localVisibility.tone} ${eclipseInProgress ? "eclipse-visibility-live" : ""}`}><div><p className="text-[9px] font-semibold uppercase tracking-wide">Visibilité locale</p><p className="mt-0.5 text-xs font-semibold">{localVisibility.label}</p></div><span tabIndex={0} role="img" aria-label={`Informations sur la visibilité locale : ${localVisibility.detail}`} title={localVisibility.detail} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-current/35 text-sm font-bold outline-none transition-transform focus-visible:scale-110">i</span></div>}
    {primaryEclipse && <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setVisualEclipseAlertEnabled((enabled) => !enabled)} aria-pressed={visualEclipseAlertEnabled} className={`min-h-9 rounded-xl border px-2 text-[10px] font-semibold transition-colors ${visualEclipseAlertEnabled ? "border-sky-300/55 bg-sky-400/15 text-sky-100" : "border-slate-600/70 bg-slate-900/50 text-slate-300"}`}>Alerte visuelle</button><button type="button" onClick={toggleEclipseSoundAlert} aria-pressed={soundEclipseAlertEnabled} className={`min-h-9 rounded-xl border px-2 text-[10px] font-semibold transition-colors ${soundEclipseAlertEnabled ? "border-amber-300/55 bg-amber-400/15 text-amber-100" : "border-slate-600/70 bg-slate-900/50 text-slate-300"}`}>Alerte sonore</button></div>}
    {isEclipseStartAlertVisible && <div role="alert" className="eclipse-start-alert mt-2 rounded-xl border border-sky-200/55 bg-sky-400/15 p-3 text-sky-50"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold">L’éclipse commence maintenant</p><p className="mt-1 text-[10px] leading-relaxed text-sky-100/85">{primaryEclipse?.title} · vérifiez l’horizon et les conditions locales d’observation.</p></div><button type="button" onClick={() => setIsEclipseStartAlertVisible(false)} aria-label="Fermer l’alerte de début d’éclipse" className="shrink-0 rounded-full border border-sky-100/35 px-2 py-1 text-[10px] font-semibold">Fermer</button></div></div>}
    {primaryEclipse && <button type="button" onClick={() => setIsEventFullscreen(true)} aria-haspopup="dialog" aria-label="Ouvrir le suivi plein écran de l’éclipse" className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-sky-300/35 bg-sky-400/[0.10] px-3 text-[10px] font-semibold text-sky-100 transition-transform active:scale-[0.98]"><Maximize2 size={15} aria-hidden="true" />Suivi plein écran</button>}
    {primaryEclipse && <div className="mt-3 rounded-xl border border-sky-300/25 bg-sky-400/[0.08] p-3"><div className="flex items-start gap-2"><span className="mt-0.5 text-base" aria-hidden="true">◐</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Alerte astronomique</p><p className="mt-1 text-sm font-semibold text-slate-100">{primaryEclipse.title}</p><p className="mt-0.5 text-[11px] text-slate-300">{displayAstronomyDate(primaryEclipse.date)} · dans {daysUntil(primaryEclipse.date)} jours</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{primaryEclipse.visibility}{primaryEclipse.skyOutlook ? ` · ${primaryEclipse.skyOutlook.label} (${primaryEclipse.skyOutlook.cloudCoverMean}% de nuages prévus)` : " · Prévision de ciel trop lointaine ou indisponible"}</p>{primaryEclipse.safetyNote && <p className="mt-2 text-[10px] leading-relaxed text-amber-100">{primaryEclipse.safetyNote}</p>}<p className="mt-2 text-[9px] text-slate-500">Visibilité à confirmer selon l’horizon local · Événement astronomique, distinct des alertes météo · {primaryEclipse.sourceLabel}</p></div></div></div>}
    {outlook.upcomingEclipses.slice(1).length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Autres éclipses référencées : {outlook.upcomingEclipses.slice(1).map((event) => `${event.title} (${displayAstronomyDate(event.date)})`).join(" · ")}.</p>}
    {primaryMeteorShower && <div className="mt-3 rounded-xl border border-violet-300/25 bg-violet-400/[0.07] p-3"><div className="flex items-start gap-2"><span className="mt-0.5 text-base" aria-hidden="true">☄</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">Étoiles filantes</p><p className="mt-1 text-sm font-semibold text-slate-100">{primaryMeteorShower.title}</p><p className="mt-0.5 text-[11px] text-slate-300">Pic {displayAstronomyDate(primaryMeteorShower.date)} · dans {daysUntil(primaryMeteorShower.date)} jours</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{primaryMeteorShower.activeRange} · jusqu’à {primaryMeteorShower.zhr} météores/h au zénith dans des conditions idéales.</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{primaryMeteorShower.observationNote}{primaryMeteorShower.skyOutlook ? ` · ${primaryMeteorShower.skyOutlook.label} (${primaryMeteorShower.skyOutlook.cloudCoverMean}% de nuages prévus)` : " · Prévision de ciel trop lointaine ou indisponible"}</p><p className="mt-2 text-[9px] text-slate-500">Rythme théorique, non garanti localement · {primaryMeteorShower.sourceLabel}</p></div></div></div>}
    {outlook.upcomingMeteorShowers.slice(1).length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Autres essaims à venir : {outlook.upcomingMeteorShowers.slice(1).map((event) => `${event.title} (${displayAstronomyDate(event.date)})`).join(" · ")}.</p>}
    {outlook.eclipseMapLayers && outlook.eclipseMapLayers.length > 0
      ? <EclipseVisibilityMap astronomy={astronomy} layers={outlook.eclipseMapLayers} />
      : (primaryEclipse || primaryMeteorShower) && <AstronomyVisibilityMap astronomy={astronomy} eventTitle={primaryEclipse?.title ?? primaryMeteorShower!.title} eventKind={primaryEclipse ? "eclipse" : "meteor"} />}
    {primaryEclipse && <Dialog open={isEventFullscreen} onOpenChange={setIsEventFullscreen}><DialogContent className="fixed inset-0 h-[100dvh] w-[100vw] max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-[#050a13] p-0 text-slate-100 sm:left-0 sm:top-0 sm:max-w-none"><DialogHeader className="border-b border-sky-300/20 bg-gradient-to-br from-sky-950/70 via-slate-950 to-indigo-950/60 px-5 pt-12 pb-5 text-left"><DialogTitle className="text-xl text-white">Suivi immersif de l’éclipse</DialogTitle><DialogDescription className="mt-1 text-xs leading-relaxed text-sky-100/75">{primaryEclipse.title} · {displayAstronomyDate(primaryEclipse.date)} · lieu actif</DialogDescription></DialogHeader><div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5 py-8"><div className={`rounded-[28px] border p-5 ${localVisibility.tone} ${eclipseInProgress ? "eclipse-visibility-live" : ""}`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Visibilité locale</p><p className="mt-2 text-2xl font-bold">{localVisibility.label}</p><p className="mt-3 text-sm leading-relaxed opacity-90">{localVisibility.detail}</p>{localEclipse && <div className="mt-6 grid grid-cols-2 gap-3 border-t border-current/20 pt-5 text-xs"><AstronomyDetail label="Début" value={displayTimeInZone(localEclipse.startAt, astronomy.timezone)} /><AstronomyDetail label="Maximum" value={displayTimeInZone(localEclipse.peakAt, astronomy.timezone)} /><AstronomyDetail label="Fin" value={displayTimeInZone(localEclipse.endAt, astronomy.timezone)} /><AstronomyDetail label="Hauteur" value={localEclipse.altitudeDegrees == null ? "Indisponible" : `${localEclipse.altitudeDegrees}°`} /><AstronomyDetail label="Azimut" value={localEclipse.azimuthDegrees == null ? "Indisponible" : `${localEclipse.azimuthDegrees}° ${localEclipse.azimuthCardinal ?? ""}`} /><AstronomyDetail label="Obscuration" value={localEclipse.obscurationPercent == null ? "Indisponible" : `${localEclipse.obscurationPercent}%`} /></div>}<p className="mt-6 text-[11px] leading-relaxed opacity-75">La visibilité est astronomique et locale : vérifiez aussi votre horizon réel, les obstacles et la nébulosité.</p></div></div><DialogFooter className="border-t border-sky-300/15 bg-slate-950 px-5 py-4"><DialogClose className="min-h-11 w-full rounded-xl border border-slate-500/60 bg-slate-800/80 px-4 text-xs font-semibold text-white">Quitter le plein écran</DialogClose></DialogFooter></DialogContent></Dialog>}
  </section>;
}

function AirQualityPanel({ air, source }: { air: EnvironmentalData["air"]; source: string }) {
  if (!air) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="wind_moderate" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Qualité de l’air</h2><p className="mt-1 text-xs text-slate-400">Données réelles temporairement indisponibles. Aucune valeur n’est estimée.</p></div></div></section>;
  const palette = aqiPalette[air.descriptor.tone];
  const ringValue = Math.min(100, Math.max(0, air.aqi ?? 0));
  const peak = air.hourly.length > 0 ? Math.max(...air.hourly.map((point) => point.value)) : null;
  const content = <div className="space-y-4"><div className={`rounded-2xl border p-4 ${palette.soft}`}><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Indice européen AQI</p><p className={`mt-1 text-3xl font-light ${palette.text}`}>{air.aqi ?? "—"}</p></div><span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${palette.soft} ${palette.text}`}>{air.descriptor.label}</span></div><p className="mt-3 text-xs leading-relaxed text-slate-400">L’AQI européen reflète le polluant le plus défavorable parmi les particules et gaz suivis. Une valeur basse traduit une qualité de l’air plus favorable.</p></div><div className="grid grid-cols-2 gap-2"><PollutantDetail label="PM2.5" value={air.pm25} description="Particules fines pouvant pénétrer profondément dans les voies respiratoires." /><PollutantDetail label="PM10" value={air.pm10} description="Particules inhalables plus larges, souvent liées à la poussière ou aux émissions." /><PollutantDetail label="NO₂" value={air.nitrogenDioxide} description="Gaz principalement associé au trafic et aux combustions." /><PollutantDetail label="O₃" value={air.ozone} description="Ozone au sol, plus présent lors des périodes ensoleillées." /></div><div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3"><p className="text-xs font-semibold text-slate-200">Tendance des prochaines 24 h</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">{peak == null ? "Aucune tendance horaire disponible." : `Indice maximal prévu : ${Math.round(peak)} AQI.`} Les barres du panneau principal correspondent aux points horaires de cette prévision.</p></div><p className="text-[10px] leading-relaxed text-slate-500">Données de qualité de l’air : {source}. Elles sont affichées séparément et n’influencent pas la prévision météo officielle.</p></div>;
  return <PanelDialog title="Qualité de l’air" description="Détails de l’indice et des polluants pour le lieu actif." content={content} className={`weather-surface ${palette.soft}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><MeteoIcon name="wind_moderate" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Qualité de l’air</h2><p className="text-[11px] text-slate-400">Indice européen AQI · {displayTime(air.observedAt)}</p></div></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${palette.soft} ${palette.text}`}>{air.descriptor.label}</span></div><div className="mt-4 flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-[5px]" style={{ background: `conic-gradient(${palette.line} ${ringValue * 3.6}deg, rgba(71,85,105,.38) 0deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#0a0f17]"><span className={`text-2xl font-light ${palette.text}`}>{air.aqi ?? "—"}</span><span className="text-[9px] uppercase tracking-wide text-slate-500">AQI</span></div></div><p className="max-w-[210px] text-xs leading-relaxed text-slate-400">L’indice synthétise le polluant le plus défavorable parmi les particules et gaz suivis.</p></div><div className="mt-4 grid grid-cols-4 gap-2 text-center"><Metric label="PM2.5" value={air.pm25} unit="µg/m³" /><Metric label="PM10" value={air.pm10} unit="µg/m³" /><Metric label="NO₂" value={air.nitrogenDioxide} unit="µg/m³" /><Metric label="O₃" value={air.ozone} unit="µg/m³" /></div>{air.hourly.length > 0 && <div className="mt-4"><div className="flex h-14 items-end gap-1 border-b border-slate-600/35 px-1">{air.hourly.map((point) => <span key={point.time} title={`${displayTime(point.time)} · AQI ${Math.round(point.value)}`} className="min-w-0 flex-1 rounded-t-sm" style={{ height: `${Math.max(12, Math.min(100, point.value))}%`, background: point.value <= 20 ? "linear-gradient(to top, #064e3b, #34d399)" : point.value <= 40 ? "linear-gradient(to top, #3f6212, #a3e635)" : "linear-gradient(to top, #78350f, #fbbf24)" }} />)}</div><div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>{displayTime(air.hourly[0].time)}</span><span>Prochaines 24 h</span><span>{displayTime(air.hourly.at(-1)?.time ?? null)}</span></div></div>}<p className="mt-3 text-[10px] text-slate-500">Prévision de qualité de l’air : {source}. Elle n’influence pas la prévision météo officielle.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanel({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;
  const localMinutes = minutesNow(astronomy.timezone);
  const sunPosition = celestialArcPosition(astronomy.sunrise, astronomy.sunset, localMinutes) ?? (astronomy.dayProgress == null ? 50 : Math.round(10 + astronomy.dayProgress * 80));
  const moonPosition = celestialArcPosition(astronomy.moonrise, astronomy.moonset, localMinutes);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, localMinutes);
  const firstCrescentAsset = astronomy.moon.label === "Premier croissant" ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const moonVisual = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D représentant le premier croissant" className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = <>{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}{firstCrescentAsset ? <img src={firstCrescentAsset} alt="Position actuelle de la Lune" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />}</>;
  const content = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Lever du soleil" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher du soleil" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Durée du jour" value={displayDuration(astronomy.daylightDurationSeconds)} /><AstronomyDetail label="Progression" value={astronomy.dayProgress == null ? "—" : `${Math.round(astronomy.dayProgress * 100)} %`} /></div><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full border border-slate-500/40 bg-slate-900 text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever de lune" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher de lune" value={displayTime(astronomy.moonset)} /></div></div><p className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3 text-[11px] leading-relaxed text-slate-400">Les heures sont converties pour le lieu actif dans le fuseau {astronomy.timezone}. Les éphémérides servent à informer l’utilisateur et n’ajustent pas les prévisions officielles.</p><p className="text-[10px] text-slate-500">Source des éphémérides : {source}.</p></div>;
  return <PanelDialog title="Soleil & Lune" description="Éphémérides locales, altitudes réelles et état actuel du cycle jour-nuit." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-5 h-36 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-4 right-4 h-[164px] rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-4 right-4 border-t border-slate-300/60" /><span aria-label="Position actuelle du Soleil" className="sun-altitude-marker absolute grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 2}px` }}><MeteoIcon name="sunny" size={48} className="h-12 w-12" /><span className="sr-only">Soleil 3D</span></span><span className="absolute -translate-x-1/2 text-[9px] font-semibold text-amber-100" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 16}px` }}>Soleil · {formatAltitude(astronomy.sunAltitudeDeg)}</span>{moonPosition != null ? <><span aria-label="Position actuelle de la Lune" className="moon-altitude-marker absolute grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonPosition}%`, bottom: `${arcBottom(moonPosition) - 1}px` }}>{moonMarker}</span><span className="absolute -translate-x-1/2 text-[9px] font-semibold text-indigo-100" style={{ left: `${moonPosition}%`, bottom: `${arcBottom(moonPosition) - 15}px` }}>Lune · {formatAltitude(astronomy.moonAltitudeDeg)}</span></> : <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-slate-400">Lune sous l’horizon · {formatAltitude(astronomy.moonAltitudeDeg)}</span>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {formatAltitude(astronomy.sunAltitudeDeg)} · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {formatAltitude(astronomy.moonAltitudeDeg)} · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center rounded-full border border-slate-500/45 bg-[radial-gradient(circle_at_36%_28%,#64748b_0%,#1e293b_46%,#05070a_100%)] text-2xl text-slate-200">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span>Lever <b className="font-medium text-slate-300">{displayTime(astronomy.moonrise)}</b></span><span>Coucher <b className="font-medium text-slate-300">{displayTime(astronomy.moonset)}</b></span></div></div></div><p className="mt-3 text-[10px] text-slate-500">Altitudes calculées à {displayTime(astronomy.altitudeCalculatedAt)} · Source des éphémérides : {source}.</p><DetailHint /></PanelDialog>;
}

function LegacySunMoonPanel({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) {
    return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;
  }

  const localMinutes = minutesNow(astronomy.timezone);
  const sunPosition = celestialArcPosition(astronomy.sunrise, astronomy.sunset, localMinutes) ?? (astronomy.dayProgress == null ? 50 : Math.round(10 + astronomy.dayProgress * 80));
  const moonPosition = celestialArcPosition(astronomy.moonrise, astronomy.moonset, localMinutes);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, localMinutes);
  const firstCrescentAsset = astronomy.moon.label === "Premier croissant" ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunAsset = "/manus-storage/meteoai-realistic-sun-3d-clean_e4a6a1ea.png";
  const sunMarker = <img src={sunAsset} alt="Position actuelle du Soleil" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonVisual = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D représentant le premier croissant" className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Position actuelle de la Lune" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const content = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Lever du soleil" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher du soleil" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Durée du jour" value={displayDuration(astronomy.daylightDurationSeconds)} /><AstronomyDetail label="Progression" value={astronomy.dayProgress == null ? "—" : `${Math.round(astronomy.dayProgress * 100)} %`} /></div><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever de lune" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher de lune" value={displayTime(astronomy.moonset)} /></div></div><p className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3 text-[11px] leading-relaxed text-slate-400">Les heures sont converties pour le lieu actif dans le fuseau Europe/Paris. Les éphémérides servent à informer l’utilisateur et n’ajustent pas les prévisions officielles.</p><p className="text-[10px] text-slate-500">Source des éphémérides : {source}.</p></div>;

  return <PanelDialog title="Soleil & Lune" description="Éphémérides locales et état actuel du cycle jour-nuit." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-5 h-36 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-4 right-4 h-[164px] rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-4 right-4 border-t border-slate-300/60" /><span aria-label="Position actuelle du Soleil" className="sun-altitude-marker absolute grid h-14 w-14 -translate-x-1/2 place-items-center" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 4}px` }}>{sunMarker}</span><span className="absolute -translate-x-1/2 text-[9px] font-semibold text-amber-100" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 18}px` }}>Soleil</span>{moonPosition != null ? <><span aria-label="Position actuelle de la Lune" className="moon-altitude-marker absolute grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonPosition}%`, bottom: `${arcBottom(moonPosition) - 1}px` }}>{moonMarker}</span><span className="absolute -translate-x-1/2 text-[9px] font-semibold text-indigo-100" style={{ left: `${moonPosition}%`, bottom: `${arcBottom(moonPosition) - 15}px` }}>Lune</span></> : <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-slate-400">Lune sous l’horizon</span>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span>Lever <b className="font-medium text-slate-300">{displayTime(astronomy.moonrise)}</b></span><span>Coucher <b className="font-medium text-slate-300">{displayTime(astronomy.moonset)}</b></span></div></div></div><p className="mt-3 text-[10px] text-slate-500">Éphémérides relevées à {displayTime(astronomy.altitudeCalculatedAt)} · Source : {source}.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanelModern({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) {
    return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;
  }

  const localMinutes = minutesNow(astronomy.timezone);
  const sunPosition = celestialArcPosition(astronomy.sunrise, astronomy.sunset, localMinutes);
  const moonPosition = celestialArcPosition(astronomy.moonrise, astronomy.moonset, localMinutes);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, localMinutes);
  const firstCrescentAsset = astronomy.moon.label === "Premier croissant" ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunAsset = "/manus-storage/meteoai-realistic-sun-3d-clean_e4a6a1ea.png";
  const sunMarker = <img src={sunAsset} alt="Position actuelle du Soleil" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonVisual = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D représentant le premier croissant" className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Position actuelle de la Lune" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const markersAreClose = sunPosition != null && moonPosition != null && Math.abs(sunPosition - moonPosition) < 14;
  const moonBottom = moonPosition == null ? 0 : arcBottom(moonPosition) + (markersAreClose ? 24 : 0);
  const belowHorizon = [sunPosition == null ? "Soleil sous l’horizon" : null, moonPosition == null ? "Lune sous l’horizon" : null].filter(Boolean).join(" · ");
  const content = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Lever du soleil" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher du soleil" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Durée du jour" value={displayDuration(astronomy.daylightDurationSeconds)} /><AstronomyDetail label="Progression" value={astronomy.dayProgress == null ? "—" : `${Math.round(astronomy.dayProgress * 100)} %`} /></div><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever de lune" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher de lune" value={displayTime(astronomy.moonset)} /></div></div><p className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3 text-[11px] leading-relaxed text-slate-400">Les heures sont converties pour le lieu actif dans le fuseau Europe/Paris. Les éphémérides servent à informer l’utilisateur et n’ajustent pas les prévisions officielles.</p><p className="text-[10px] text-slate-500">Source des éphémérides : {source}.</p></div>;

  return <PanelDialog title="Soleil & Lune" description="Éphémérides locales et positions distinctes des deux astres." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-5 h-36 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-4 right-4 h-[164px] rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-4 right-4 border-t border-slate-300/60" />{sunPosition != null && <><span aria-label="Position actuelle du Soleil" className="sun-altitude-marker absolute z-10 grid h-14 w-14 -translate-x-1/2 place-items-center" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 4}px` }}>{sunMarker}</span><span className="absolute z-10 -translate-x-1/2 text-[9px] font-semibold text-amber-100" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 18}px` }}>Soleil</span></>}{moonPosition != null && <><span aria-label="Position actuelle de la Lune" className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonPosition}%`, bottom: `${moonBottom - 1}px` }}>{moonMarker}</span><span className="absolute z-20 -translate-x-1/2 text-[9px] font-semibold text-indigo-100" style={{ left: `${moonPosition}%`, bottom: `${moonBottom - 15}px` }}>Lune</span></>}{belowHorizon && <span className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap text-[9px] text-slate-400">{belowHorizon}</span>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span>Lever <b className="font-medium text-slate-300">{displayTime(astronomy.moonrise)}</b></span><span>Coucher <b className="font-medium text-slate-300">{displayTime(astronomy.moonset)}</b></span></div></div></div><p className="mt-3 text-[10px] text-slate-500">Éphémérides relevées à {displayTime(astronomy.altitudeCalculatedAt)} · Source : {source}.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanelHorizonAware({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) {
    return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;
  }

  const localMinutes = minutesNow(astronomy.timezone);
  const sunPosition = celestialArcPosition(astronomy.sunrise, astronomy.sunset, localMinutes);
  const moonPosition = celestialArcPosition(astronomy.moonrise, astronomy.moonset, localMinutes);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, localMinutes);
  const firstCrescentAsset = astronomy.moon.label === "Premier croissant" ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunAsset = "/manus-storage/meteoai-realistic-sun-3d-clean_e4a6a1ea.png";
  const sunMarker = <img src={sunAsset} alt="Soleil 3D" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonVisual = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D représentant le premier croissant" className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const markersAreClose = sunPosition != null && moonPosition != null && Math.abs(sunPosition - moonPosition) < 14;
  const moonBottom = moonPosition == null ? 0 : arcBottom(moonPosition) + (markersAreClose ? 24 : 0);
  const sunBelowHorizon = sunPosition == null;
  const moonBelowHorizon = moonPosition == null;
  const content = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Lever du soleil" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher du soleil" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Durée du jour" value={displayDuration(astronomy.daylightDurationSeconds)} /><AstronomyDetail label="Progression" value={astronomy.dayProgress == null ? "—" : `${Math.round(astronomy.dayProgress * 100)} %`} /></div><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever de lune" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher de lune" value={displayTime(astronomy.moonset)} /></div></div><p className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3 text-[11px] leading-relaxed text-slate-400">Les heures sont converties pour le lieu actif dans le fuseau Europe/Paris. Les éphémérides servent à informer l’utilisateur et n’ajustent pas les prévisions officielles.</p><p className="text-[10px] text-slate-500">Source des éphémérides : {source}.</p></div>;

  return <PanelDialog title="Soleil & Lune" description="Éphémérides locales avec positions et états visibles de chaque astre." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-5 h-36 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-4 right-4 h-[164px] rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-4 right-4 border-t border-slate-300/60" />{sunPosition != null && <><span aria-label="Position actuelle du Soleil" className="sun-altitude-marker absolute z-10 grid h-14 w-14 -translate-x-1/2 place-items-center" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 4}px` }}>{sunMarker}</span><span className="absolute z-10 -translate-x-1/2 text-[9px] font-semibold text-amber-100" style={{ left: `${sunPosition}%`, bottom: `${arcBottom(sunPosition) - 18}px` }}>Soleil</span></>}{moonPosition != null && <><span aria-label="Position actuelle de la Lune" className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonPosition}%`, bottom: `${moonBottom - 1}px` }}>{moonMarker}</span><span className="absolute z-20 -translate-x-1/2 text-[9px] font-semibold text-indigo-100" style={{ left: `${moonPosition}%`, bottom: `${moonBottom - 15}px` }}>Lune</span></>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div>{(sunBelowHorizon || moonBelowHorizon) && <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-600/25 pt-2" aria-label="Astres sous l’horizon">{sunBelowHorizon ? <div className="flex min-w-0 items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center">{sunMarker}</span><div><p className="text-[10px] font-semibold text-amber-100">Soleil sous l’horizon</p><p className="text-[9px] text-slate-500">Lever {displayTime(astronomy.sunrise)}</p></div></div> : <div />}{moonBelowHorizon ? <div className="flex min-w-0 items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center">{moonMarker}</span><div><p className="text-[10px] font-semibold text-indigo-100">Lune sous l’horizon</p><p className="text-[9px] text-slate-500">Lever {displayTime(astronomy.moonrise)}</p></div></div> : <div />}</div>}<div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span>Lever <b className="font-medium text-slate-300">{displayTime(astronomy.moonrise)}</b></span><span>Coucher <b className="font-medium text-slate-300">{displayTime(astronomy.moonset)}</b></span></div></div></div><p className="mt-3 text-[10px] text-slate-500">Éphémérides relevées à {displayTime(astronomy.altitudeCalculatedAt)} · Source : {source}.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanelAlwaysVisibleLegacy({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) {
    return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;
  }

  const now = minutesNow(astronomy.timezone);
  const sunPosition = celestialArcPosition(astronomy.sunrise, astronomy.sunset, now);
  const moonPosition = celestialArcPosition(astronomy.moonrise, astronomy.moonset, now);
  const sunRiseMinutes = timeToMinutes(astronomy.sunrise);
  const sunDisplayPosition = sunPosition ?? (sunRiseMinutes != null && now < sunRiseMinutes ? 16 : 84);
  const moonDisplayPosition = moonPosition ?? 43;
  const markersAreClose = Math.abs(sunDisplayPosition - moonDisplayPosition) < 18;
  const sunBottom = safeArcMarkerBottom(sunDisplayPosition, -4);
  const moonBottom = safeArcMarkerBottom(moonDisplayPosition, markersAreClose ? 24 : 0);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, now);
  const firstCrescentAsset = astronomy.moon.label === "Premier croissant" ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunAsset = "/manus-storage/meteoai-solar-disc-textured_d3eb7ecc.png";
  const sunMarker = <img src={sunAsset} alt="Disque solaire texturé" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonVisual = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D représentant le premier croissant" className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = firstCrescentAsset ? <img src={firstCrescentAsset} alt="Lune 3D" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const content = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Lever du soleil" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher du soleil" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Durée du jour" value={displayDuration(astronomy.daylightDurationSeconds)} /><AstronomyDetail label="Progression" value={astronomy.dayProgress == null ? "—" : `${Math.round(astronomy.dayProgress * 100)} %`} /></div><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever de lune" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher de lune" value={displayTime(astronomy.moonset)} /></div></div><p className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3 text-[11px] leading-relaxed text-slate-400">Les heures sont converties pour le lieu actif dans le fuseau Europe/Paris. Les éphémérides servent à informer l’utilisateur et n’ajustent pas les prévisions officielles.</p><p className="text-[10px] text-slate-500">Source des éphémérides : {source}.</p></div>;

  return <PanelDialog title="Soleil & Lune" description="Les deux astres restent visibles et distincts sur l’arche des éphémérides." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-7 h-40 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-0 right-0 h-36 rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-0 right-0 border-t border-slate-300/60" /><span aria-label="Position du Soleil sur l’arche" className="sun-altitude-marker absolute z-10 grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunDisplayPosition}%`, bottom: `${sunBottom}px` }}>{sunMarker}</span><span className="absolute z-10 -translate-x-1/2 text-[9px] font-semibold text-amber-100" style={{ left: `${sunDisplayPosition}%`, bottom: `${sunBottom - 14}px` }}>Soleil</span><span aria-label="Position de la Lune sur l’arche" className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonDisplayPosition}%`, bottom: `${moonBottom - 1}px` }}>{moonMarker}</span><span className="absolute z-20 -translate-x-1/2 text-[9px] font-semibold text-indigo-100" style={{ left: `${moonDisplayPosition}%`, bottom: `${moonBottom - 15}px` }}>Lune</span><span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span>Lever <b className="font-medium text-slate-300">{displayTime(astronomy.moonrise)}</b></span><span>Coucher <b className="font-medium text-slate-300">{displayTime(astronomy.moonset)}</b></span></div></div></div><p className="mt-3 text-[10px] text-slate-500">Éphémérides relevées à {displayTime(astronomy.altitudeCalculatedAt)} · Source : {source}.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanelAlwaysVisible({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;

  const now = minutesNow(astronomy.timezone);
  const sunPosition = celestialArcPosition(astronomy.sunrise, astronomy.sunset, now);
  const moonPosition = celestialArcPosition(astronomy.moonrise, astronomy.moonset, now);
  const sunriseMinutes = timeToMinutes(astronomy.sunrise);
  const sunDisplayPosition = sunPosition ?? (sunriseMinutes != null && now < sunriseMinutes ? 16 : 84);
  const moonDisplayPosition = moonPosition ?? 43;
  const markersAreClose = Math.abs(sunDisplayPosition - moonDisplayPosition) < 18;
  const sunBottom = safeArcMarkerBottom(sunDisplayPosition, -4);
  const moonBottom = safeArcMarkerBottom(moonDisplayPosition, markersAreClose ? 24 : 0);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, now);
  const realisticMoonAsset = ["Premier croissant", "Premier quartier"].includes(astronomy.moon.label) ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunMarker = <img src="/manus-storage/meteoai-solar-disc-textured_d3eb7ecc.png" alt="Disque solaire texturé" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonVisual = realisticMoonAsset ? <img src={realisticMoonAsset} alt={`Lune 3D réaliste représentant ${astronomy.moon.label}`} className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = realisticMoonAsset ? <img src={realisticMoonAsset} alt="Lune 3D réaliste" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const content = <div className="space-y-4">
    <section><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100">Soleil</p><div className="mt-2 grid grid-cols-2 gap-2"><AstronomyDetail label="Lever" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Durée du jour" value={displayDuration(astronomy.daylightDurationSeconds)} /><AstronomyDetail label="Progression" value={astronomy.dayProgress == null ? "—" : `${Math.round(astronomy.dayProgress * 100)} %`} /><AstronomyDetail label="Hauteur actuelle" value={formatAltitude(astronomy.sunAltitudeDeg)} /><AstronomyDetail label="Calculée à" value={displayTime(astronomy.altitudeCalculatedAt)} /></div></section>
    <section className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-100">Lune</p><div className="mt-2 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher" value={displayTime(astronomy.moonset)} /><AstronomyDetail label="Hauteur actuelle" value={formatAltitude(astronomy.moonAltitudeDeg)} /><AstronomyDetail label="Fuseau du lieu" value={astronomy.timezone} /></div></section>
    <section className="rounded-xl border border-sky-300/20 bg-sky-400/[0.05] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-sky-100">Lecture et limites</p><p className="mt-1">Une hauteur positive place l’astre au-dessus de l’horizon géométrique ; une hauteur négative le place sous l’horizon. Relief, bâtiments, végétation, réfraction, nuages et pollution lumineuse restent hors du calcul.</p><p className="mt-2">Les horaires, la durée du jour, la phase et l’éclairage viennent d’Open-Meteo. Les hauteurs instantanées sont calculées localement avec Astronomy Engine pour le lieu actif. Ces éphémérides n’ajustent jamais la prévision météo officielle.</p></section>
    <p className="text-[10px] leading-relaxed text-slate-500">Sources des éphémérides : Open-Meteo (horaires, durée du jour, phase) · Astronomy Engine (hauteurs). Données environnementales : {source}.</p>
  </div>;

  return <PanelDialog title="Soleil & Lune" description="Détails locaux des horaires, phases, hauteurs et limites d’observation." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-7 h-40 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-0 right-0 h-36 rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-0 right-0 border-t border-slate-300/60" /><span aria-label="Position actuelle du Soleil sur l’arche" className="sun-altitude-marker absolute z-10 grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunDisplayPosition}%`, bottom: `${sunBottom}px` }}>{sunMarker}</span><span className="absolute z-10 -translate-x-1/2 text-[9px] font-semibold text-amber-100" style={{ left: `${sunDisplayPosition}%`, bottom: `${sunBottom - 14}px` }}>Soleil</span><span aria-label="Position actuelle de la Lune sur l’arche, rotation continue sur son axe" className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonDisplayPosition}%`, bottom: `${moonBottom - 1}px` }}><span className="celestial-moon-axis-rotation">{moonMarker}</span></span><span className="absolute z-20 -translate-x-1/2 text-[9px] font-semibold text-indigo-100" style={{ left: `${moonDisplayPosition}%`, bottom: `${moonBottom - 15}px` }}>Lune</span><span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><p className="mt-2 text-[10px] text-slate-500">Touchez « Voir les détails » pour les hauteurs, le calcul et les limites.</p></div></div><p className="mt-3 text-[10px] text-slate-500">Éphémérides relevées à {displayTime(astronomy.altitudeCalculatedAt)} · Source : Open-Meteo + Astronomy Engine.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanelApparent({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  const coordinates = astronomy?.coordinates ?? { lat: 0, lon: 0 };
  const apparentPositionQuery = trpc.weather.getApparentAstronomyPosition.useQuery(coordinates, {
    enabled: astronomy != null,
    staleTime: 45_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  if (!astronomy) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;

  const initialPosition: ApparentAstronomyPosition = {
    sun: { altitudeDeg: astronomy.sunAltitudeDeg, azimuthDeg: astronomy.sunAzimuthDeg, aboveHorizon: astronomy.sunAboveHorizon },
    moon: { altitudeDeg: astronomy.moonAltitudeDeg, azimuthDeg: astronomy.moonAzimuthDeg, aboveHorizon: astronomy.moonAboveHorizon },
    calculatedAt: astronomy.altitudeCalculatedAt,
  };
  const apparentPosition = apparentPositionQuery.data ?? initialPosition;
  const sunArc = projectApparentBodyOnArc(apparentPosition.sun);
  const moonArc = projectApparentBodyOnArc(apparentPosition.moon);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, minutesNow(astronomy.timezone));
  const realisticMoonAsset = ["Premier croissant", "Premier quartier"].includes(astronomy.moon.label) ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunMarker = <img src="/manus-storage/meteoai-solar-disc-textured_d3eb7ecc.png" alt="Disque solaire texturé" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonVisual = realisticMoonAsset ? <img src={realisticMoonAsset} alt={`Lune 3D réaliste représentant ${astronomy.moon.label}`} className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const moonMarker = realisticMoonAsset ? <img src={realisticMoonAsset} alt="Lune 3D réaliste" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const belowHorizon = [!sunArc ? `Soleil sous l’horizon · ${formatAltitude(apparentPosition.sun.altitudeDeg)}` : null, !moonArc ? `Lune sous l’horizon · ${formatAltitude(apparentPosition.moon.altitudeDeg)}` : null].filter((value): value is string => value != null);
  const content = <div className="space-y-4"><section><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100">Soleil</p><div className="mt-2 grid grid-cols-2 gap-2"><AstronomyDetail label="Lever" value={displayTime(astronomy.sunrise)} /><AstronomyDetail label="Coucher" value={displayTime(astronomy.sunset)} /><AstronomyDetail label="Hauteur apparente" value={formatAltitude(apparentPosition.sun.altitudeDeg)} /><AstronomyDetail label="Azimut apparent" value={formatAzimuth(apparentPosition.sun.azimuthDeg)} /><AstronomyDetail label="Horizon" value={apparentPosition.sun.aboveHorizon ? "Au-dessus" : "Sous l’horizon"} /><AstronomyDetail label="Calculée à" value={displayTime(apparentPosition.calculatedAt)} /></div></section><section className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.05] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-100">Lune</p><div className="mt-2 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center text-2xl">{moonVisual}</span><div><p className="font-semibold text-slate-100">{astronomy.moon.label}</p><p className="text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p></div></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3"><AstronomyDetail label="Lever" value={displayTime(astronomy.moonrise)} /><AstronomyDetail label="Coucher" value={displayTime(astronomy.moonset)} /><AstronomyDetail label="Hauteur apparente" value={formatAltitude(apparentPosition.moon.altitudeDeg)} /><AstronomyDetail label="Azimut apparent" value={formatAzimuth(apparentPosition.moon.azimuthDeg)} /><AstronomyDetail label="Horizon" value={apparentPosition.moon.aboveHorizon ? "Au-dessus" : "Sous l’horizon"} /><AstronomyDetail label="Fuseau du lieu" value={astronomy.timezone} /></div></section><section className="rounded-xl border border-sky-300/20 bg-sky-400/[0.05] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-sky-100">Lecture et limites</p><p className="mt-1">L’arche positionne les astres avec leur azimut et leur hauteur topocentriques apparentes : Est à gauche, Sud au sommet, Ouest à droite. Un astre sous l’horizon n’est pas dessiné dans le ciel visible.</p><p className="mt-2">La Lune reste fixe à sa coordonnée calculée, sans rotation ni animation décorative. L’horizon réel, les bâtiments, les reliefs, les nuages et la pollution lumineuse ne sont pas modélisés.</p></section><p className="text-[10px] leading-relaxed text-slate-500">Mise à jour automatique toutes les minutes avec Astronomy Engine. Horaires, durée du jour et phase : Open-Meteo. Données environnementales : {source}.</p></div>;

  return <PanelDialog title="Soleil & Lune" description="Positions apparentes réelles et actualisées localement pour le lieu actif." content={content} className="weather-surface border-amber-400/20 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06]"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/30 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="relative mx-auto mt-7 h-40 max-w-[330px] overflow-hidden"><div className="absolute bottom-2 left-0 right-0 h-36 rounded-t-full border-x border-t border-sky-300/35 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-0 right-0 border-t border-slate-300/60" />{sunArc && <span aria-label={`Position apparente du Soleil, ${formatAltitude(apparentPosition.sun.altitudeDeg)}, ${formatAzimuth(apparentPosition.sun.azimuthDeg)}`} className="sun-altitude-marker absolute z-10 grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunArc.left}%`, bottom: `${sunArc.bottom - 24}px` }}>{sunMarker}</span>}{moonArc && <span aria-label={`Position apparente fixe de la Lune, ${formatAltitude(apparentPosition.moon.altitudeDeg)}, ${formatAzimuth(apparentPosition.moon.azimuthDeg)}`} className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonArc.left}%`, bottom: `${moonArc.bottom - 20}px` }}>{moonMarker}</span>}{belowHorizon.length > 0 && <div className="absolute inset-x-3 bottom-9 z-30 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-[9px] text-slate-400" aria-label="Astres sous l’horizon">{belowHorizon.map((label) => <span key={label}>{label}</span>)}</div>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span><b className="text-amber-100">Soleil</b> · {formatAltitude(apparentPosition.sun.altitudeDeg)} · {formatAzimuth(apparentPosition.sun.azimuthDeg)}</span><span><b className="text-indigo-100">Lune</b> · {formatAltitude(apparentPosition.moon.altitudeDeg)} · {formatAzimuth(apparentPosition.moon.azimuthDeg)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><p className="mt-2 text-[10px] text-slate-500">Position fixe calculée à {displayTime(apparentPosition.calculatedAt)} · sans rotation.</p></div></div><p className="mt-3 text-[10px] text-slate-500">Coordonnées apparentes actualisées chaque minute · Astronomy Engine + Open-Meteo.</p><DetailHint /></PanelDialog>;
}

function SunMoonPanelTrajectory({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  const coordinates = astronomy?.coordinates ?? { lat: 0, lon: 0 };
  const positionQuery = trpc.weather.getApparentAstronomyPosition.useQuery(coordinates, { enabled: astronomy != null, staleTime: 45_000, refetchInterval: 60_000, refetchOnWindowFocus: true });
  if (!astronomy) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;

  const fallback: ApparentAstronomyPosition = { sun: { altitudeDeg: astronomy.sunAltitudeDeg, azimuthDeg: astronomy.sunAzimuthDeg, aboveHorizon: astronomy.sunAboveHorizon }, moon: { altitudeDeg: astronomy.moonAltitudeDeg, azimuthDeg: astronomy.moonAzimuthDeg, aboveHorizon: astronomy.moonAboveHorizon }, calculatedAt: astronomy.altitudeCalculatedAt };
  const position = positionQuery.data ?? fallback;
  const sunArc = projectApparentBodyOnArc(position.sun);
  const moonArc = projectApparentBodyOnArc(position.moon);
  const sunTrajectoryPath = buildTrajectoryPath(position.trajectory?.sun ?? []);
  const moonTrajectoryPath = buildTrajectoryPath(position.trajectory?.moon ?? []);
  const isNight = isNightAtLocalMinutes(astronomy.sunrise, astronomy.sunset, minutesNow(astronomy.timezone));
  const moonAsset = ["Premier croissant", "Premier quartier"].includes(astronomy.moon.label) ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunMarker = <img src="/manus-storage/meteoai-solar-disc-textured_d3eb7ecc.png" alt="Disque solaire texturé" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonMarker = moonAsset ? <img src={moonAsset} alt="Lune réaliste fixe" className="moon-3d-first-crescent h-full w-full object-contain" /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const moonVisual = moonAsset ? <img src={moonAsset} alt={`Lune réaliste représentant ${astronomy.moon.label}`} className="moon-3d-first-crescent h-full w-full object-contain" /> : astronomy.moon.symbol;
  const belowHorizon = [!sunArc ? "Soleil sous l’horizon" : null, !moonArc ? "Lune sous l’horizon" : null].filter(Boolean).join(" · ");
  const details = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Hauteur du Soleil" value={formatAltitude(position.sun.altitudeDeg)} /><AstronomyDetail label="Azimut du Soleil" value={formatAzimuth(position.sun.azimuthDeg)} /><AstronomyDetail label="Hauteur de la Lune" value={formatAltitude(position.moon.altitudeDeg)} /><AstronomyDetail label="Azimut de la Lune" value={formatAzimuth(position.moon.azimuthDeg)} /></div><div className="rounded-xl border border-sky-300/20 bg-sky-400/[0.05] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-sky-100">Trajectoires apparentes</p><p className="mt-1">Les pointillés suivent des coordonnées topocentriques calculées toutes les trente minutes pour le lieu actif. Le tracé s’interrompt sous l’horizon, tandis que la Lune reste fixe sur sa position courante, sans rotation.</p></div><p className="text-[10px] text-slate-500">Éphémérides : Open-Meteo · trajectoires et positions : Astronomy Engine · données environnementales : {source}.</p></div>;

  return <PanelDialog title="Soleil & Lune" description="Trajectoires apparentes, positions actuelles et éphémérides locales." content={details} className="weather-surface celestial-trajectory-card border-amber-400/20"><div className="flex items-center justify-between gap-3">{isNight && <span className="celestial-night-marker sr-only">Thème nocturne actif</span>}<div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-300/80">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/55 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className="celestial-arc-scene relative mx-auto mt-7 h-40 max-w-[330px] overflow-hidden"><div className="celestial-arc-backdrop absolute bottom-2 left-0 right-0 h-36 rounded-t-full border-x border-t border-sky-300/60" /><svg aria-hidden="true" className="celestial-trajectory-overlay absolute inset-x-0 bottom-0 h-40 w-full" viewBox="0 0 100 160" preserveAspectRatio="none"><path className="celestial-trajectory celestial-trajectory--sun" d={sunTrajectoryPath} /><path className="celestial-trajectory celestial-trajectory--moon" d={moonTrajectoryPath} /></svg><div className="absolute bottom-2 left-0 right-0 border-t border-sky-100/75" />{sunArc && <span aria-label={`Position apparente du Soleil, ${formatAltitude(position.sun.altitudeDeg)}, ${formatAzimuth(position.sun.azimuthDeg)}`} className="sun-altitude-marker absolute z-10 grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunArc.left}%`, bottom: `${sunArc.bottom - 24}px` }}>{sunMarker}</span>}{moonArc && <span aria-label={`Position apparente fixe de la Lune, ${formatAltitude(position.moon.altitudeDeg)}, ${formatAzimuth(position.moon.azimuthDeg)}`} className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonArc.left}%`, bottom: `${moonArc.bottom - 20}px` }}>{moonMarker}</span>}{belowHorizon && <span className="absolute inset-x-3 bottom-9 z-30 text-center text-[9px] text-slate-200/85">{belowHorizon}</span>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-100">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-sky-100/70">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-100">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-sky-100/70">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-300"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-sky-100/15 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-300/80">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><p className="mt-2 text-[10px] text-slate-400">Position fixe calculée à {displayTime(position.calculatedAt)} · sans rotation.</p></div></div><p className="mt-3 text-[10px] text-slate-400">Trajectoires en pointillés · coordonnées actualisées chaque minute · Astronomy Engine + Open-Meteo.</p><DetailHint /></PanelDialog>;
}

const REALISTIC_MOON_SURFACE = "/manus-storage/meteoai-realistic-moon-surface_f2f79daf.png";

function RealisticMoon({ phase, size, alt, cloudCover }: { phase: { label: string; illuminationPct: number; brightLimbAngleDeg: number }; size: "marker" | "detail"; alt: string; cloudCover: number | null }) {
  const illumination = Math.max(0, Math.min(100, Number(phase.illuminationPct) || 0));
  const diameter = size === "marker" ? "h-10 w-10" : "h-16 w-16";
  const glow = getLunarGlowStrength(cloudCover);
  const glowStyle = { "--moon-glow-opacity": String(glow.opacity) } as CSSProperties;
  
  // Calculer l'angle éclairé en degrés (0-360)
  const illuminatedAngle = illumination * 3.6;
  
  // Créer un masque conique où :
  // - La partie éclairée (illuminatedAngle degrés) est transparente (on voit la lune)
  // - La partie sombre est opaque avec un léger voile (on ne voit pas la lune)
  // Le gradient part de brightLimbAngleDeg (direction du limbe lumineux)
  // et crée un secteur transparent de illuminatedAngle degrés
  return <span className={`realistic-moon-glow relative block ${diameter} overflow-hidden rounded-full`} data-cloud-cover={glow.cloudCover ?? "unknown"} style={glowStyle}><img src={REALISTIC_MOON_SURFACE} alt={alt} className="h-full w-full object-contain" /><span aria-hidden="true" className="absolute inset-0 rounded-full" style={{
    background: `conic-gradient(from ${phase.brightLimbAngleDeg}deg at 50% 50%, rgba(2, 6, 23, 0) 0deg ${illuminatedAngle}deg, rgba(2, 6, 23, 0.85) ${illuminatedAngle}deg 360deg)`
  }} /></span>;
}

function SunMoonPanelTemporal({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  const coordinates = astronomy?.coordinates ?? { lat: 0, lon: 0 };
  const query = trpc.weather.getApparentAstronomyPosition.useQuery(coordinates, { enabled: astronomy != null, staleTime: 45_000, refetchInterval: 60_000, refetchOnWindowFocus: true });
  const terrainQuery = trpc.weather.getTerrainHorizonProfile.useQuery(coordinates, { enabled: astronomy != null, staleTime: 3_600_000 });
  const [showTerrain, setShowTerrain] = useState(false);
  const terrainPath = useMemo(() => buildTerrainPath(terrainQuery.data?.points ?? []), [terrainQuery.data]);
  if (!astronomy) return <SunMoonPanelTrajectory astronomy={astronomy} source={source} />;
  const fallback: ApparentAstronomyPosition = { sun: { altitudeDeg: astronomy.sunAltitudeDeg, azimuthDeg: astronomy.sunAzimuthDeg, aboveHorizon: astronomy.sunAboveHorizon }, moon: { altitudeDeg: astronomy.moonAltitudeDeg, azimuthDeg: astronomy.moonAzimuthDeg, aboveHorizon: astronomy.moonAboveHorizon }, calculatedAt: astronomy.altitudeCalculatedAt };
  const position = query.data ?? fallback;
  if (position.lunar) astronomy = { ...astronomy, moon: { label: position.lunar.label, symbol: position.lunar.symbol }, moonIllumination: position.lunar.illuminationPct };
  const timelapse = useTimelapseSimulation(position.trajectory?.sun ?? [], position.trajectory?.moon ?? []);
  const liveSunArc = projectApparentBodyOnArc(position.sun);
  const liveMoonArc = projectApparentBodyOnArc(position.moon);
  const tlSunArc = timelapse.sunFrame ? projectApparentBodyOnArc(timelapse.sunFrame) : null;
  const tlMoonArc = timelapse.moonFrame ? projectApparentBodyOnArc(timelapse.moonFrame) : null;
  const sunArc = timelapse.active ? tlSunArc : liveSunArc;
  const moonArc = timelapse.active ? tlMoonArc : liveMoonArc;
  const sunTrajectoryPath = buildTrajectoryPath(position.trajectory?.sun ?? []);
  const moonTrajectoryPath = buildTrajectoryPath(position.trajectory?.moon ?? []);
  const sunTimeMarkers = selectTrajectoryTimeMarkers(position.trajectory?.sun ?? [], [9, 12, 15, 18]);
  const moonTimeMarkers = selectTrajectoryTimeMarkers(position.trajectory?.moon ?? [], [18, 21, 0, 3]);
  const lightPhase = getCelestialLightPhase(position.sun);
  const moonPhase = position.lunar ?? { label: astronomy.moon.label, symbol: astronomy.moon.symbol, illuminationPct: astronomy.moonIllumination ?? 0, brightLimbAngleDeg: 0 };
  const sunMarker = <img src="/manus-storage/meteoai-solar-disc-textured_d3eb7ecc.png" alt="Disque solaire texturé" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonMarker = <RealisticMoon phase={moonPhase} size="marker" cloudCover={astronomy.cloudCover} alt={`Lune réaliste représentant ${moonPhase.label}`} />;
  const moonVisual = <RealisticMoon phase={moonPhase} size="detail" cloudCover={astronomy.cloudCover} alt={`Lune réaliste représentant ${moonPhase.label}`} />;
  const belowHorizon = timelapse.active ? null : [!sunArc ? "Soleil sous l'horizon" : null, !moonArc ? "Lune sous l'horizon" : null].filter(Boolean).join(" · ");
  const displayTime = (value: string | null) => displayTimeInZone(value, astronomy.timezone);
  const details = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Hauteur du Soleil" value={formatAltitude(position.sun.altitudeDeg)} /><AstronomyDetail label="Azimut du Soleil" value={formatAzimuth(position.sun.azimuthDeg)} /><AstronomyDetail label="Hauteur de la Lune" value={formatAltitude(position.moon.altitudeDeg)} /><AstronomyDetail label="Azimut de la Lune" value={formatAzimuth(position.moon.azimuthDeg)} /></div><div className="rounded-xl border border-sky-300/20 bg-sky-400/[0.05] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-sky-100">Lumière du ciel et repères</p><p className="mt-1">Le fond suit la hauteur apparente du Soleil : jour au-dessus de 6°, crépuscule entre −6° et 6°, nuit au-dessous. Les repères ne sont affichés que lorsqu’ils sont au-dessus de l’horizon.</p></div><p className="text-[10px] text-slate-500">Repères, trajectoires et positions : Astronomy Engine · horaires : Open-Meteo · données environnementales : {source}.</p></div>;
  return <PanelDialog title="Soleil & Lune" description="Repères horaires et lumière du ciel calculés pour le lieu actif." content={details} className={`weather-surface celestial-trajectory-card celestial-trajectory-card--${lightPhase} border-amber-400/20`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-300/80">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/55 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className={`celestial-arc-scene celestial-arc-scene--${lightPhase} relative mx-auto mt-7 h-40 max-w-[330px] overflow-hidden`}><div className="celestial-arc-backdrop absolute bottom-2 left-0 right-0 h-36 rounded-t-full border-x border-t border-sky-300/60" /><svg aria-hidden="true" className="celestial-trajectory-overlay absolute inset-x-0 bottom-0 h-40 w-full" viewBox="0 0 100 160" preserveAspectRatio="none"><path className="celestial-trajectory celestial-trajectory--sun" d={sunTrajectoryPath} /><path className="celestial-trajectory celestial-trajectory--moon" d={moonTrajectoryPath} />{showTerrain && terrainPath && <path className="celestial-terrain-horizon" d={terrainPath} />}</svg><div className="absolute bottom-2 left-0 right-0 border-t border-sky-100/75" /><div className="celestial-time-markers" aria-label="Repères horaires des trajectoires">{sunTimeMarkers.map((marker) => <span key={`sun-${marker.label}`} className="celestial-time-marker celestial-time-marker--sun" style={{ left: `${marker.left}%`, bottom: `${marker.bottom}px` }}><i /><small>{marker.label}</small></span>)}{moonTimeMarkers.map((marker) => <span key={`moon-${marker.label}`} className="celestial-time-marker celestial-time-marker--moon" style={{ left: `${marker.left}%`, bottom: `${marker.bottom}px` }}><i /><small>{marker.label}</small></span>)}</div>{sunArc && <span aria-label={`Position apparente du Soleil, ${formatAltitude(position.sun.altitudeDeg)}`} className="sun-altitude-marker absolute z-10 grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunArc.left}%`, bottom: `${sunArc.bottom - 24}px` }}>{sunMarker}</span>}{moonArc && <span aria-label={`Position apparente de la Lune, ${formatAltitude(position.moon.altitudeDeg)}`} className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonArc.left}%`, bottom: `${moonArc.bottom - 20}px` }}>{moonMarker}</span>}{belowHorizon && <span className="celestial-below-horizon-label absolute inset-x-3 bottom-3 z-30 text-center text-slate-100">{belowHorizon}</span>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-100">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-sky-100/70">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-100">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-sky-100/70">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-300"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-sky-100/15 pt-3"><div className="grid h-16 w-16 place-items-center">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-300/80">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><p className="mt-2 text-[10px] text-slate-400">Calculé à {displayTime(position.calculatedAt)} · Astronomy Engine.</p></div></div><div className="mt-3 flex items-center justify-between gap-2"><p className="text-[10px] text-slate-400">{timelapse.active ? `Simulation · ${timelapse.timeLabel} UTC · ${timelapse.progress}%` : `Repères · fond ${lightPhase === "day" ? "diurne" : lightPhase === "twilight" ? "crépusculaire" : "nocturne"} · Astronomy Engine + Open-Meteo.`}</p><div className="z-20 flex shrink-0 gap-1.5"><button type="button" onClick={(e) => { e.stopPropagation(); timelapse.toggle(); }} className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors ${timelapse.active ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-slate-600/60 bg-slate-800/50 text-slate-400"}`} aria-label={timelapse.playing ? "Mettre en pause la simulation" : timelapse.active ? "Reprendre la simulation" : "Simuler le parcours 24 h"}>{timelapse.playing ? "⏸" : timelapse.active ? "▶" : "24 h"}</button>{timelapse.active && <button type="button" onClick={(e) => { e.stopPropagation(); timelapse.stop(); }} className="shrink-0 rounded-full border border-slate-600/60 bg-slate-800/50 px-2 py-0.5 text-[9px] font-medium text-slate-400 transition-colors" aria-label="Arrêter la simulation">✕</button>}<button type="button" onClick={(e) => { e.stopPropagation(); setShowTerrain((v) => !v); }} className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors ${showTerrain ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-slate-600/60 bg-slate-800/50 text-slate-400"}`} aria-label={showTerrain ? "Masquer le relief local" : "Afficher le relief local"}>{showTerrain ? "Relief ✓" : "Relief"}</button></div></div>{timelapse.active && <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}><input type="range" min={0} max={timelapse.totalFrames - 1} value={timelapse.frameIndex} onChange={(e) => timelapse.seek(Number(e.target.value))} className="celestial-timelapse-slider h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400" aria-label="Curseur de simulation 24 h" /><span className="shrink-0 text-[9px] text-amber-200/80">{timelapse.timeLabel ?? "00:00"}</span></div>}{showTerrain && terrainQuery.data && <p className="mt-1 text-[9px] text-slate-500">Profil estimé · résolution {terrainQuery.data.resolutionM} m · altitude {terrainQuery.data.observerElevationM} m · {terrainQuery.data.source}.</p>}<DetailHint /></PanelDialog>;
}

export function EnvironmentalPanels({ data, isLoading }: { data: EnvironmentalData | null | undefined; isLoading?: boolean }) {
  if (isLoading && !data) return <div className="grid gap-3 sm:grid-cols-2"><div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" /><div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" /></div>;
  return <section className="grid gap-3 sm:grid-cols-2" aria-label="Qualité de l’air, soleil et lune"><AirQualityPanel air={data?.air ?? null} source={data?.source ?? "Open-Meteo / CAMS"} /><div className="space-y-3"><SunMoonPanelTemporal astronomy={data?.astronomy ?? null} source={data?.source ?? "Open-Meteo"} /><AstronomyOutlookPanel astronomy={data?.astronomy ?? null} /></div></section>;
}
