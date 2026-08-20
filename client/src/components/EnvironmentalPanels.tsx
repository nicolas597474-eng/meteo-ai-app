import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Compass, LocateFixed, Maximize2, Navigation, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { MeteoIcon } from "@/components/MeteoIcon";
import { MapView } from "@/components/Map";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { isNightAtLocalMinutes } from "@/lib/celestialNight";
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

type ApparentBodyPosition = {
  altitudeDeg: number | null;
  azimuthDeg: number | null;
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
  const onMapReady = (map: google.maps.Map) => {
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
  return <div className="mt-3 overflow-hidden rounded-xl border border-slate-600/50 bg-slate-950/40"><div className="flex items-start justify-between gap-3 px-3 py-2.5"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Carte locale d’observation</p><p className="mt-1 text-xs font-semibold text-slate-100">{eventTitle}</p></div><span className="rounded-full border border-slate-500/50 px-2 py-1 text-[9px] text-slate-300">Rayon 25 km</span></div><div data-swipe-exclude><MapView className="h-[190px]" initialCenter={{ lat: center.lat, lng: center.lon }} initialZoom={9} mapTypeId="terrain" mapTypeControl={false} fullscreenControl={false} zoomControl={true} streetViewControl={false} rotateControl={false} onMapReady={onMapReady} /></div><p className="border-t border-slate-700/60 px-3 py-2 text-[9px] leading-relaxed text-slate-400">Le cercle situe le lieu actif et son contexte d’observation. Il ne représente pas la bande géométrique d’une éclipse ; la visibilité dépend aussi de l’horizon, de la météo et de la luminosité locale.</p></div>;
}

function EclipseVisibilityMap({ astronomy, layers }: { astronomy: NonNullable<EnvironmentalData["astronomy"]>; layers: EclipseMapLayer[] }) {
  const [selectedLayerId, setSelectedLayerId] = useState(layers[0]?.eventId ?? "");
  const [isMapExpanded, setIsMapExpanded] = useState(false);
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
  const mapRef = useRef<google.maps.Map | null>(null);
  const compactMapRef = useRef<google.maps.Map | null>(null);
  const expandedMapRef = useRef<google.maps.Map | null>(null);
  const expandedInitialBoundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const soundContextRef = useRef<AudioContext | null>(null);
  const observationAlertFiredRef = useRef(false);
  const isMapOpeningRef = useRef(false);
  const visibilityRectanglesRef = useRef<Array<{ rectangle: google.maps.Rectangle; baseOpacity: number }>>([]);
  const selectedLayer = layers.find((layer) => layer.eventId === selectedLayerId) ?? layers[0];
  if (!selectedLayer) return null;
  const center = astronomy.coordinates;

  const circumstancesQuery = trpc.weather.getEclipseCircumstances.useQuery(
    selectedPoint
      ? { eventId: selectedLayer.eventId as "lunar_partial_2026_08_28" | "solar_partial_2027_08_02", lat: selectedPoint.lat, lon: selectedPoint.lon }
      : { eventId: selectedLayer.eventId as "lunar_partial_2026_08_28" | "solar_partial_2027_08_02", lat: center.lat, lon: center.lon },
    { enabled: Boolean(selectedPoint) },
  );
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

  const onMapReady = (map: google.maps.Map, isExpanded: boolean) => {
    mapRef.current = map;
    if (isExpanded) expandedMapRef.current = map;
    else compactMapRef.current = map;
    map.setOptions({ fullscreenControl: false, streetViewControl: isExpanded, cameraControl: false, gestureHandling: "greedy", mapTypeControlOptions: isExpanded ? { position: google.maps.ControlPosition.TOP_RIGHT } : undefined, zoomControlOptions: isExpanded ? { position: google.maps.ControlPosition.RIGHT_CENTER } : undefined, streetViewControlOptions: isExpanded ? { position: google.maps.ControlPosition.RIGHT_BOTTOM } : undefined });
    if (isExpanded) {
      map.addListener("heading_changed", () => setExpandedHeading(map.getHeading() ?? 0));
      map.getStreetView().setOptions({ addressControlOptions: { position: google.maps.ControlPosition.TOP_CENTER } });
    }
    const localPosition = { lat: center.lat, lng: center.lon };
    new google.maps.marker.AdvancedMarkerElement({ map, position: localPosition, title: "Lieu actif" });
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
    if (!bounds.isEmpty()) {
      if (isExpanded) expandedInitialBoundsRef.current = bounds;
      map.fitBounds(bounds, 18);
    }
    if (isExpanded) requestAnimationFrame(() => {
      google.maps.event.trigger(map, "resize");
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
  const astronomicalAzimuthLabel = astronomicalAzimuth == null ? "Azimut de l’astre indisponible" : `Azimut de l’astre : ${astronomicalAzimuth}°${astronomicalDirection ? ` ${astronomicalDirection}` : ""}`;
  const highlightedCompassPoint = nearestCompassRosePoint(astronomicalAzimuth);
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
    const bounds = expandedInitialBoundsRef.current;
    if (!map || !bounds) return;
    map.setHeading(0);
    map.setTilt(0);
    map.fitBounds(bounds, 18);
    setExpandedHeading(0);
  };
  const openExpandedMap = () => {
    if (isMapExpanded || isMapOpeningRef.current) return;
    isMapOpeningRef.current = true;
    setIsMapOpening(true);
    setIsMapExpanded(true);
  };
  const closeExpandedMap = () => {
    isMapOpeningRef.current = false;
    setIsMapOpening(false);
    setIsMapExpanded(false);
  };
  const opacityControl = <div className="absolute bottom-16 left-3 z-20 flex flex-col items-start gap-2" data-swipe-exclude>{isOpacityPanelOpen && <div className="map-opacity-control"><label htmlFor="eclipse-opacity-expanded" className="map-opacity-control__label">Opacité <span>{visibilityOpacity}%</span></label><input id="eclipse-opacity-expanded" type="range" min="25" max="100" step="5" value={visibilityOpacity} onChange={(event) => setVisibilityOpacity(Number(event.target.value))} aria-label="Opacité des zones de visibilité" /></div>}<button type="button" onClick={() => setIsOpacityPanelOpen((open) => !open)} aria-label="Régler l’opacité des zones de visibilité" aria-expanded={isOpacityPanelOpen} title="Opacité des zones" className={`map-control-button ${isOpacityPanelOpen ? "map-control-button--active" : ""}`}><SlidersHorizontal size={21} strokeWidth={2.5} aria-hidden="true" /></button></div>;
  const mapContent = (suffix: string, height: string, isExpanded = false) => (
    <MapView key={`${selectedLayer.eventId}-${suffix}`} className={height} initialCenter={{ lat: center.lat, lng: center.lon }} initialZoom={3} mapTypeId="terrain" mapTypeControl={isExpanded} fullscreenControl={false} zoomControl streetViewControl={isExpanded} rotateControl={isExpanded} onMapReady={(map) => onMapReady(map, isExpanded)}>
      {!isExpanded && <div className="absolute right-3 top-3 z-20 flex flex-col gap-2" data-swipe-exclude><button type="button" onClick={openExpandedMap} disabled={isMapOpening} aria-label={isMapOpening ? "Ouverture de la carte" : "Agrandir la carte"} title={isMapOpening ? "Ouverture de la carte…" : "Agrandir la carte"} aria-busy={isMapOpening} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-700 shadow-md transition-transform active:scale-95 disabled:cursor-wait disabled:opacity-70"><Maximize2 size={21} strokeWidth={2.6} aria-hidden="true" /></button><button type="button" onClick={locateMe} disabled={isLocating} aria-label={isLocating ? "Localisation en cours" : "Me localiser"} title={isLocating ? "Localisation en cours" : "Me localiser"} aria-busy={isLocating} className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-200/80 bg-white/95 text-sky-700 shadow-md transition-transform active:scale-95 disabled:cursor-wait disabled:opacity-70"><LocateFixed size={21} strokeWidth={2.5} aria-hidden="true" /></button></div>}
      {isExpanded && opacityControl}
      {isExpanded && <div className="map-control-cluster absolute left-3 top-3 z-20" data-swipe-exclude><button type="button" onClick={() => setIsCompassDetailsOpen(true)} aria-label={`Rose des vents complète, nord géographique. Ouvrir les détails de la boussole. Orientation ${Math.round(expandedHeading)} degrés. ${astronomicalAzimuthLabel}.${highlightedCompassPoint ? ` Repère mis en évidence : ${highlightedCompassPoint.label}.` : ""}`} aria-haspopup="dialog" aria-expanded={isCompassDetailsOpen} title="Détails de la boussole" className="relative flex h-[78px] w-[78px] items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-700 shadow-md transition-transform active:scale-95"><span className="absolute inset-[8px] rounded-full border border-slate-300/80" aria-hidden="true" />{COMPASS_ROSE_POINTS.map((point) => { const isAstroDirection = highlightedCompassPoint?.label === point.label; return <span key={point.label} aria-hidden="true" className={`absolute left-1/2 top-1/2 text-[8px] leading-none ${isAstroDirection ? "rounded-full bg-amber-300 px-1 font-black text-amber-950 shadow-sm" : point.cardinal ? "font-black text-slate-800" : "font-semibold text-slate-500"} ${point.label === "N" && !isAstroDirection ? "text-rose-600" : ""}`} style={{ transform: `translate(-50%, -50%) rotate(${point.angle - expandedHeading}deg) translateY(-29px) rotate(${expandedHeading - point.angle}deg)` }}>{point.label}</span>; })}<Compass size={30} strokeWidth={2.25} aria-hidden="true" style={{ transform: `rotate(${-expandedHeading}deg)` }} />{astronomicalAzimuth != null && <Navigation className="absolute text-amber-600" size={17} fill="currentColor" aria-hidden="true" style={{ transform: `rotate(${astronomicalAzimuth - expandedHeading}deg) translateY(-13px)` }} />}<span className="absolute -bottom-3 rounded bg-slate-800/90 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white">{astronomicalAzimuth == null ? "Az. —" : `${astronomicalAzimuth}° ${astronomicalDirection ?? ""}`}</span></button></div>}
      {isExpanded && <div className="absolute right-3 top-[116px] z-20" data-swipe-exclude><button type="button" onClick={locateMe} disabled={isLocating} aria-label={isLocating ? "Localisation en cours" : "Me localiser dans la carte agrandie"} title={isLocating ? "Localisation en cours…" : "Me localiser et zoomer"} aria-busy={isLocating} className="map-control-button border-sky-200/80 text-sky-700 disabled:cursor-wait disabled:opacity-70"><LocateFixed size={21} strokeWidth={2.5} aria-hidden="true" /></button></div>}
      {isExpanded && <div className="absolute bottom-[112px] right-3 z-20" data-swipe-exclude>{isSoundHelpOpen && <div id="sound-alert-explanation" role="status" className="absolute bottom-full right-0 mb-3 w-60 rounded-xl border border-sky-300/35 bg-slate-950/95 p-3 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl"><div className="flex items-start justify-between gap-3"><p><span className="font-semibold text-sky-100">Alerte sonore.</span> Activez-la volontairement : un son discret est joué une seule fois lorsque l’astre entre dans sa fenêtre d’observabilité calculée depuis votre position autorisée.</p><button type="button" onClick={() => setIsSoundHelpOpen(false)} className="shrink-0 text-[10px] font-semibold text-sky-200 underline underline-offset-2">Fermer</button></div></div>}<button type="button" onClick={() => { toggleSoundAlert(); setIsSoundHelpOpen(true); }} aria-label={soundAlertEnabled ? "Désactiver l’alerte sonore" : "Activer l’alerte sonore"} aria-describedby={isSoundHelpOpen ? "sound-alert-explanation" : undefined} aria-expanded={isSoundHelpOpen} title="Alerte sonore d’observabilité" aria-pressed={soundAlertEnabled} className={`map-control-button ${soundAlertEnabled ? "map-control-button--active" : ""}`}>{soundAlertEnabled ? <Volume2 size={20} strokeWidth={2.5} aria-hidden="true" /> : <VolumeX size={20} strokeWidth={2.5} aria-hidden="true" />}</button></div>}
      {observationNotice && <div className="map-observability-notice absolute inset-x-3 bottom-3 z-20 flex items-start gap-2 rounded-xl border border-emerald-200/80 bg-emerald-950/95 px-3 py-2 text-emerald-50 shadow-lg" role="alert"><Navigation size={16} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" /><p className="text-[10px] font-semibold leading-snug">{observationNotice}<span className="mt-0.5 block text-[9px] font-normal text-emerald-100/80">Calcul astronomique : vérifiez l’horizon, les nuages et, pour le Soleil, utilisez une protection adaptée.</span></p></div>}
    </MapView>
  );

  return <div className="mt-3 overflow-hidden rounded-xl border border-sky-300/35 bg-slate-950/40"><div className="flex items-start justify-between gap-3 px-3 py-2.5"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Zones de visibilité d’éclipse</p><p className="mt-1 text-xs font-semibold text-slate-100">{selectedLayer.title}</p></div><span className="rounded-full border border-sky-300/35 px-2 py-1 text-[9px] text-sky-100">{selectedLayer.type === "solar" ? "Solaire" : "Lunaire"}</span></div>{layers.length > 1 && <div className="flex gap-2 border-t border-slate-700/60 px-3 py-2" data-swipe-exclude>{layers.map((layer) => <button key={layer.eventId} type="button" onClick={() => { setSelectedLayerId(layer.eventId); setSelectedPoint(null); }} className={`min-h-8 rounded-full border px-2.5 text-[10px] font-medium ${layer.eventId === selectedLayer.eventId ? "border-sky-300/70 bg-sky-400/15 text-sky-100" : "border-slate-600/70 text-slate-400"}`}>{layer.type === "solar" ? "Solaire" : "Lunaire"} · {displayAstronomyDate(layer.date)}</button>)}</div>}<div data-swipe-exclude>{mapContent("compact", "h-[210px]")}</div><div className="border-t border-slate-700/60 px-3 py-2.5 text-[9px] leading-relaxed text-slate-400"><div className="flex flex-wrap gap-x-3 gap-y-1"><span><i className="inline-block h-2 w-2 rounded-sm bg-sky-400/80" /> Événement entièrement visible</span><span><i className="inline-block h-2 w-2 rounded-sm bg-violet-400/80" /> Visibilité partielle</span>{selectedLayer.centralPath && <span><i className="inline-block h-2 w-2 rounded-sm bg-amber-300" /> Bande centrale NASA</span>}</div><div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/50 p-2.5"><p className="text-[10px] font-semibold text-sky-100">{selectedPoint ? `${selectedPoint.label} · ${selectedPoint.lat.toFixed(3)}°, ${selectedPoint.lon.toFixed(3)}°` : "Cliquez sur une zone de visibilité pour voir ses détails."}</p>{circumstancesQuery.isLoading && <p className="mt-1 text-[10px] text-slate-400">Calcul des circonstances locales…</p>}{circumstancesQuery.error && <p className="mt-1 text-[10px] text-rose-200">Calcul indisponible : {circumstancesQuery.error.message}</p>}{circumstances && <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-300"><p className="col-span-2 font-semibold text-slate-100">{visibilityLabel} · {circumstances.label}</p><p>Début : {displayTimeInZone(circumstances.startAt, astronomy.timezone)}</p><p>Maximum : {displayTimeInZone(circumstances.peakAt, astronomy.timezone)}</p><p>Fin : {displayTimeInZone(circumstances.endAt, astronomy.timezone)}</p><p>Durée : {displayMinutes(circumstances.durationMinutes)}</p><p>Hauteur : {circumstances.altitudeDegrees == null ? "—" : `${circumstances.altitudeDegrees}°`}</p><p>Azimut : {circumstances.azimuthDegrees == null ? "—" : `${circumstances.azimuthDegrees}° ${circumstances.azimuthCardinal ?? ""}`}</p><p>Obscuration : {circumstances.obscurationPercent == null ? "—" : `${circumstances.obscurationPercent}%`}</p><p className="col-span-2 text-[9px] text-slate-500">Direction mesurée depuis le nord géographique, dans le sens horaire.</p><p className="col-span-2 mt-1 text-slate-400">{circumstances.detail}</p><p className="col-span-2 text-[9px] text-slate-500">{circumstances.precisionLabel}</p></div>}</div><p className="mt-2">{selectedLayer.precisionLabel}</p><p className="mt-1">Source : <a href={selectedLayer.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-200 underline underline-offset-2">{selectedLayer.sourceLabel}</a>. Le cercle blanc situe seulement le lieu actif et son contexte local.</p><Dialog open={isMapExpanded} onOpenChange={(open) => { if (!open) closeExpandedMap(); }}><DialogContent className="max-h-[calc(100dvh-1.25rem)] overflow-y-auto border-slate-700 bg-[#0b111b] p-0 text-slate-100 sm:max-w-5xl"><DialogHeader className="border-b border-slate-700/70 px-5 pt-5 pb-4 text-left"><DialogTitle className="text-lg text-white">Carte de visibilité d’éclipse</DialogTitle><DialogDescription className="text-xs leading-relaxed text-slate-400">{selectedLayer.title} · utilisez les contrôles de zoom et la flèche de direction pour explorer la carte.</DialogDescription></DialogHeader><div className="px-4 py-4" data-swipe-exclude>{mapContent("expanded", "h-[min(68dvh,620px)]", true)}</div><DialogFooter className="border-t border-slate-700/70 px-5 py-3"><DialogClose className="min-h-10 rounded-xl border border-slate-600 bg-slate-800/70 px-4 text-xs font-medium text-slate-100">Fermer la carte</DialogClose></DialogFooter></DialogContent></Dialog><Dialog open={isCompassDetailsOpen} onOpenChange={setIsCompassDetailsOpen}><DialogContent className="border-slate-700 bg-[#0b111b] text-slate-100 sm:max-w-sm"><DialogHeader className="text-left"><DialogTitle>Détails de la boussole</DialogTitle><DialogDescription className="text-xs leading-relaxed text-slate-400">Orientation de la carte et relèvement calculé de l’astre pour le point sélectionné.</DialogDescription></DialogHeader><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Orientation de la carte" value={`${Math.round(expandedHeading)}°`} /><AstronomyDetail label="Nord" value="Nord géographique" /><AstronomyDetail label="Azimut de l’astre" value={astronomicalAzimuth == null ? "Indisponible" : `${astronomicalAzimuth}°`} /><AstronomyDetail label="Direction cardinale" value={astronomicalDirection ?? "Indisponible"} /><AstronomyDetail label="Repère de rose" value={highlightedCompassPoint?.label ?? "Indisponible"} /></div><div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-amber-100">Comment lire la boussole</p><p className="mt-1">Le repère N indique le nord géographique. La flèche orange montre l’azimut de l’astre, mesuré dans le sens horaire depuis ce nord. Le repère doré est l’arrondi visuel de ce relèvement sur huit directions. L’orientation de la carte peut être tournée indépendamment.</p></div><p className="text-[10px] leading-relaxed text-slate-500">Ce relèvement est calculé pour la position sélectionnée et le maximum de l’événement. Il ne garantit pas un horizon dégagé ni des conditions d’observation réelles.</p></div><DialogFooter><DialogClose className="rounded-xl border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-medium text-slate-100">Fermer</DialogClose></DialogFooter></DialogContent></Dialog>{locationStatus && <p className="mt-2 text-[9px] text-slate-400" role="status">{locationStatus}</p>}</div></div>;
}

function AstronomyOutlookPanel({ astronomy }: { astronomy: EnvironmentalData["astronomy"] }) {
  const outlook = astronomy?.outlook;
  if (!astronomy || !outlook) return null;
  const fullMoon = outlook.moonMilestones.find((milestone) => milestone.id === "full_moon") ?? null;
  const newMoon = outlook.moonMilestones.find((milestone) => milestone.id === "new_moon") ?? null;
  const quarterMilestones = outlook.moonMilestones.filter((milestone) => milestone.id === "first_quarter" || milestone.id === "last_quarter");
  const primaryEclipse = outlook.upcomingEclipses[0] ?? null;
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
    {primaryEclipse && <div className="mt-3 rounded-xl border border-sky-300/25 bg-sky-400/[0.08] p-3"><div className="flex items-start gap-2"><span className="mt-0.5 text-base" aria-hidden="true">◐</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Alerte astronomique</p><p className="mt-1 text-sm font-semibold text-slate-100">{primaryEclipse.title}</p><p className="mt-0.5 text-[11px] text-slate-300">{displayAstronomyDate(primaryEclipse.date)} · dans {daysUntil(primaryEclipse.date)} jours</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{primaryEclipse.visibility}{primaryEclipse.skyOutlook ? ` · ${primaryEclipse.skyOutlook.label} (${primaryEclipse.skyOutlook.cloudCoverMean}% de nuages prévus)` : " · Prévision de ciel trop lointaine ou indisponible"}</p>{primaryEclipse.safetyNote && <p className="mt-2 text-[10px] leading-relaxed text-amber-100">{primaryEclipse.safetyNote}</p>}<p className="mt-2 text-[9px] text-slate-500">Visibilité à confirmer selon l’horizon local · Événement astronomique, distinct des alertes météo · {primaryEclipse.sourceLabel}</p></div></div></div>}
    {outlook.upcomingEclipses.slice(1).length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Autres éclipses référencées : {outlook.upcomingEclipses.slice(1).map((event) => `${event.title} (${displayAstronomyDate(event.date)})`).join(" · ")}.</p>}
    {primaryMeteorShower && <div className="mt-3 rounded-xl border border-violet-300/25 bg-violet-400/[0.07] p-3"><div className="flex items-start gap-2"><span className="mt-0.5 text-base" aria-hidden="true">☄</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">Étoiles filantes</p><p className="mt-1 text-sm font-semibold text-slate-100">{primaryMeteorShower.title}</p><p className="mt-0.5 text-[11px] text-slate-300">Pic {displayAstronomyDate(primaryMeteorShower.date)} · dans {daysUntil(primaryMeteorShower.date)} jours</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{primaryMeteorShower.activeRange} · jusqu’à {primaryMeteorShower.zhr} météores/h au zénith dans des conditions idéales.</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{primaryMeteorShower.observationNote}{primaryMeteorShower.skyOutlook ? ` · ${primaryMeteorShower.skyOutlook.label} (${primaryMeteorShower.skyOutlook.cloudCoverMean}% de nuages prévus)` : " · Prévision de ciel trop lointaine ou indisponible"}</p><p className="mt-2 text-[9px] text-slate-500">Rythme théorique, non garanti localement · {primaryMeteorShower.sourceLabel}</p></div></div></div>}
    {outlook.upcomingMeteorShowers.slice(1).length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Autres essaims à venir : {outlook.upcomingMeteorShowers.slice(1).map((event) => `${event.title} (${displayAstronomyDate(event.date)})`).join(" · ")}.</p>}
    {outlook.eclipseMapLayers && outlook.eclipseMapLayers.length > 0
      ? <EclipseVisibilityMap astronomy={astronomy} layers={outlook.eclipseMapLayers} />
      : (primaryEclipse || primaryMeteorShower) && <AstronomyVisibilityMap astronomy={astronomy} eventTitle={primaryEclipse?.title ?? primaryMeteorShower!.title} eventKind={primaryEclipse ? "eclipse" : "meteor"} />}
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
  const moonAsset = ["Croissant croissant", "Premier quartier"].includes(moonPhase.label) ? "/manus-storage/meteoai-first-quarter-moon-3d-realistic_64387ecc.png" : null;
  const sunMarker = <img src="/manus-storage/meteoai-solar-disc-textured_d3eb7ecc.png" alt="Disque solaire texturé" className="celestial-realistic-sun h-full w-full object-contain" />;
  const moonMarker = moonAsset ? <img src={moonAsset} alt={`Lune représentant ${moonPhase.label}`} className="moon-3d-first-crescent h-full w-full object-contain" style={{ transform: `rotate(${moonPhase.brightLimbAngleDeg}deg)` }} /> : <MeteoIcon name="clear_night" size={40} className="h-10 w-10" />;
  const moonVisual = moonAsset ? <img src={moonAsset} alt={`Lune représentant ${moonPhase.label}`} className="moon-3d-first-crescent h-full w-full object-contain" style={{ transform: `rotate(${moonPhase.brightLimbAngleDeg}deg)` }} /> : moonPhase.symbol;
  const belowHorizon = timelapse.active ? null : [!sunArc ? "Soleil sous l'horizon" : null, !moonArc ? "Lune sous l'horizon" : null].filter(Boolean).join(" · ");
  const details = <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><AstronomyDetail label="Hauteur du Soleil" value={formatAltitude(position.sun.altitudeDeg)} /><AstronomyDetail label="Azimut du Soleil" value={formatAzimuth(position.sun.azimuthDeg)} /><AstronomyDetail label="Hauteur de la Lune" value={formatAltitude(position.moon.altitudeDeg)} /><AstronomyDetail label="Azimut de la Lune" value={formatAzimuth(position.moon.azimuthDeg)} /></div><div className="rounded-xl border border-sky-300/20 bg-sky-400/[0.05] p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-sky-100">Lumière du ciel et repères</p><p className="mt-1">Le fond suit la hauteur apparente du Soleil : jour au-dessus de 6°, crépuscule entre −6° et 6°, nuit au-dessous. Les repères ne sont affichés que lorsqu’ils sont au-dessus de l’horizon.</p></div><p className="text-[10px] text-slate-500">Repères, trajectoires et positions : Astronomy Engine · horaires : Open-Meteo · données environnementales : {source}.</p></div>;
  return <PanelDialog title="Soleil & Lune" description="Repères horaires et lumière du ciel calculés pour le lieu actif." content={details} className={`weather-surface celestial-trajectory-card celestial-trajectory-card--${lightPhase} border-amber-400/20`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center">{sunMarker}</span><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-300/80">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/55 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div><div className={`celestial-arc-scene celestial-arc-scene--${lightPhase} relative mx-auto mt-7 h-40 max-w-[330px] overflow-hidden`}><div className="celestial-arc-backdrop absolute bottom-2 left-0 right-0 h-36 rounded-t-full border-x border-t border-sky-300/60" /><svg aria-hidden="true" className="celestial-trajectory-overlay absolute inset-x-0 bottom-0 h-40 w-full" viewBox="0 0 100 160" preserveAspectRatio="none"><path className="celestial-trajectory celestial-trajectory--sun" d={sunTrajectoryPath} /><path className="celestial-trajectory celestial-trajectory--moon" d={moonTrajectoryPath} />{showTerrain && terrainPath && <path className="celestial-terrain-horizon" d={terrainPath} />}</svg><div className="absolute bottom-2 left-0 right-0 border-t border-sky-100/75" /><div className="celestial-time-markers" aria-label="Repères horaires des trajectoires">{sunTimeMarkers.map((marker) => <span key={`sun-${marker.label}`} className="celestial-time-marker celestial-time-marker--sun" style={{ left: `${marker.left}%`, bottom: `${marker.bottom}px` }}><i /><small>{marker.label}</small></span>)}{moonTimeMarkers.map((marker) => <span key={`moon-${marker.label}`} className="celestial-time-marker celestial-time-marker--moon" style={{ left: `${marker.left}%`, bottom: `${marker.bottom}px` }}><i /><small>{marker.label}</small></span>)}</div>{sunArc && <span aria-label={`Position apparente du Soleil, ${formatAltitude(position.sun.altitudeDeg)}`} className="sun-altitude-marker absolute z-10 grid h-12 w-12 -translate-x-1/2 place-items-center" style={{ left: `${sunArc.left}%`, bottom: `${sunArc.bottom - 24}px` }}>{sunMarker}</span>}{moonArc && <span aria-label={`Position apparente de la Lune, ${formatAltitude(position.moon.altitudeDeg)}`} className="moon-altitude-marker absolute z-20 grid h-10 w-10 -translate-x-1/2 place-items-center" style={{ left: `${moonArc.left}%`, bottom: `${moonArc.bottom - 20}px` }}>{moonMarker}</span>}{belowHorizon && <span className="celestial-below-horizon-label absolute inset-x-3 bottom-3 z-30 text-center text-slate-100">{belowHorizon}</span>}<span className="absolute bottom-0 left-0 text-[11px] text-slate-100">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-sky-100/70">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-100">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-sky-100/70">Coucher</small></span></div><div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-300"><span><b className="text-amber-100">Soleil</b> · {displayTime(astronomy.sunrise)}–{displayTime(astronomy.sunset)}</span><span><b className="text-indigo-100">Lune</b> · {displayTime(astronomy.moonrise)}–{displayTime(astronomy.moonset)}</span></div><div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-sky-100/15 pt-3"><div className="grid h-16 w-16 place-items-center text-2xl">{moonVisual}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-300/80">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><p className="mt-2 text-[10px] text-slate-400">Calculé à {displayTime(position.calculatedAt)} · Astronomy Engine.</p></div></div><div className="mt-3 flex items-center justify-between gap-2"><p className="text-[10px] text-slate-400">{timelapse.active ? `Simulation · ${timelapse.timeLabel} UTC · ${timelapse.progress}%` : `Repères · fond ${lightPhase === "day" ? "diurne" : lightPhase === "twilight" ? "crépusculaire" : "nocturne"} · Astronomy Engine + Open-Meteo.`}</p><div className="z-20 flex shrink-0 gap-1.5"><button type="button" onClick={(e) => { e.stopPropagation(); timelapse.toggle(); }} className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors ${timelapse.active ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-slate-600/60 bg-slate-800/50 text-slate-400"}`} aria-label={timelapse.playing ? "Mettre en pause la simulation" : timelapse.active ? "Reprendre la simulation" : "Simuler le parcours 24 h"}>{timelapse.playing ? "⏸" : timelapse.active ? "▶" : "24 h"}</button>{timelapse.active && <button type="button" onClick={(e) => { e.stopPropagation(); timelapse.stop(); }} className="shrink-0 rounded-full border border-slate-600/60 bg-slate-800/50 px-2 py-0.5 text-[9px] font-medium text-slate-400 transition-colors" aria-label="Arrêter la simulation">✕</button>}<button type="button" onClick={(e) => { e.stopPropagation(); setShowTerrain((v) => !v); }} className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors ${showTerrain ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-slate-600/60 bg-slate-800/50 text-slate-400"}`} aria-label={showTerrain ? "Masquer le relief local" : "Afficher le relief local"}>{showTerrain ? "Relief ✓" : "Relief"}</button></div></div>{timelapse.active && <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}><input type="range" min={0} max={timelapse.totalFrames - 1} value={timelapse.frameIndex} onChange={(e) => timelapse.seek(Number(e.target.value))} className="celestial-timelapse-slider h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400" aria-label="Curseur de simulation 24 h" /><span className="shrink-0 text-[9px] text-amber-200/80">{timelapse.timeLabel ?? "00:00"}</span></div>}{showTerrain && terrainQuery.data && <p className="mt-1 text-[9px] text-slate-500">Profil estimé · résolution {terrainQuery.data.resolutionM} m · altitude {terrainQuery.data.observerElevationM} m · {terrainQuery.data.source}.</p>}<DetailHint /></PanelDialog>;
}

export function EnvironmentalPanels({ data, isLoading }: { data: EnvironmentalData | null | undefined; isLoading?: boolean }) {
  if (isLoading && !data) return <div className="grid gap-3 sm:grid-cols-2"><div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" /><div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" /></div>;
  return <section className="grid gap-3 sm:grid-cols-2" aria-label="Qualité de l’air, soleil et lune"><AirQualityPanel air={data?.air ?? null} source={data?.source ?? "Open-Meteo / CAMS"} /><div className="space-y-3"><SunMoonPanelTemporal astronomy={data?.astronomy ?? null} source={data?.source ?? "Open-Meteo"} /><AstronomyOutlookPanel astronomy={data?.astronomy ?? null} /></div></section>;
}
