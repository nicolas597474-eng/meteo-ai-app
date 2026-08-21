import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EnvironmentalPanels.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const apparentSunMoonSource = source.slice(source.indexOf("function SunMoonPanelApparent"), source.indexOf("export function EnvironmentalPanels"));
const trajectorySunMoonSource = source.slice(source.indexOf("function SunMoonPanelTrajectory"), source.indexOf("export function EnvironmentalPanels"));
const temporalSunMoonSource = source.slice(source.indexOf("function SunMoonPanelTemporal"), source.indexOf("export function EnvironmentalPanels"));

describe("EnvironmentalPanels", () => {
  it("présente la qualité de l’air avec ses mesures réelles et son attribution", () => {
    expect(source).toContain("Qualité de l’air");
    expect(source).toContain("PM2.5");
    expect(source).toContain("Prévision de qualité de l’air");
    expect(source).toContain("Prochaines 24 h");
  });

  it("présente les éphémérides Soleil et Lune sans substituer de données", () => {
    expect(source).toContain("Soleil & Lune");
    expect(source).toContain("Éphémérides locales du jour");
    expect(source).toContain("Éclairage");
    expect(apparentSunMoonSource).toContain("Hauteur apparente");
    expect(apparentSunMoonSource).toContain("Mise à jour automatique toutes les minutes avec Astronomy Engine");
    expect(apparentSunMoonSource).toContain("La Lune reste fixe à sa coordonnée calculée");
    expect(apparentSunMoonSource).toContain("Lecture et limites");
    expect(source).toContain("Éphémérides réelles temporairement indisponibles");
    expect(source).toContain("Prochains repères astronomiques");
    expect(source).toContain("Prochaine pleine lune");
    expect(source).toContain("Autres phases");
    expect(source).toContain("Alerte astronomique");
    expect(source).toContain("Visibilité à confirmer selon l’horizon local");
    expect(source).toContain("distinct des alertes météo");
    expect(source).toContain("Étoiles filantes");
    expect(source).toContain("météores/h au zénith dans des conditions idéales");
    expect(source).toContain("Carte locale d’observation");
    expect(source).toContain("Il ne représente pas la bande géométrique d’une éclipse");
    expect(source).toContain("Zones de visibilité d’éclipse");
    expect(source).toContain("Bande centrale NASA");
    expect(source).toContain("eclipseMapLayers");
    expect(source).toContain("Agrandir la carte");
    expect(source).toContain("Carte de visibilité d’éclipse");
    expect(source).toContain("map.setOptions({ fullscreenControl: false, streetViewControl: isExpanded");
    expect(source).toContain("cameraControl: false");
    expect(source).toContain("addressControlOptions: { position: google.maps.ControlPosition.TOP_CENTER }");
    expect(source).toContain('strokeColor: isFull ? "#0284c7" : "#7c3aed"');
    expect(source).toContain("fillOpacity: baseOpacity * (visibilityOpacity / 100)");
    expect(source).toContain("zIndex: isFull ? 4 : 3");
    expect(source).toContain("visibilityOpacity");
    expect(source).toContain("Opacité des zones de visibilité");
    expect(source).toContain("Opacité <span>{visibilityOpacity}%</span>");
    expect(source).toContain("{isExpanded && opacityControl}");
    expect(source).toContain("SlidersHorizontal");
    expect(source).toContain("isOpacityPanelOpen");
    expect(source).toContain("absolute bottom-16 left-3");
    expect(source).toContain("Régler l’opacité des zones de visibilité");
    expect(source).toContain("openExpandedMap");
    expect(source).toContain("isMapOpeningRef");
    expect(source).toContain('google.maps.event.trigger(map, "resize")');
    expect(styles).toContain("map-opacity-control");
    expect(source).toContain('gestureHandling: "greedy"');
    expect(source).toContain("Me localiser");
    expect(source).toContain("getEclipseCircumstances");
    expect(source).toContain("Cliquez sur une zone de visibilité");
    expect(source).toContain("Azimut :");
    expect(source).toContain("nord géographique");
    expect(source).toContain("Localisation en cours");
    expect(source).toContain("eclipse-user-location-marker");
    expect(source).toContain("Me localiser dans la carte agrandie");
    expect(source).toContain("right-3 top-[116px]");
    expect(source).toContain("bottom-[112px] right-3");
    expect(source).toContain("bottom-full right-0 mb-3 w-60");
    expect(source).not.toContain("flex flex-col items-end gap-3");
    expect(source).toContain("expandedMapRef.current ?? mapRef.current");
    expect(source).toContain("setZoom(Math.max(activeMap.getZoom() ?? 4, 9))");
    expect(source).toContain("Maximize2");
    expect(source).toContain("LocateFixed");
    expect(source).toContain("streetViewControl={isExpanded}");
    expect(source).toContain('gestureHandling: "greedy"');
    expect(source).toContain("utilisez les contrôles de zoom et la flèche de direction");
    expect(source).toContain("Rose des vents complète, nord géographique");
    expect(source).toContain("COMPASS_ROSE_POINTS");
    expect(source).toContain('label: "NE"');
    expect(source).toContain('label: "SO"');
    expect(source).toContain("Rose des vents complète");
    expect(source).toContain("nearestCompassRosePoint");
    expect(source).toContain("bg-amber-300");
    expect(source).toContain("Repère de rose");
    expect(source).toContain("Détails de la boussole");
    expect(source).toContain("Ouvrir les détails de la boussole");
    expect(source).toContain("isCompassDetailsOpen");
    expect(source).toContain("Comment lire la boussole");
    expect(source).not.toContain("Recentrer sur la zone initiale de l’éclipse");
    expect(source).not.toContain("RotateCcw");
    expect(source).toContain("astronomicalAzimuthLabel");
    expect(source).toContain("Azimut de l’astre");
    expect(source).toContain("astronomicalDirection");
    expect(source).toContain("isAstroObservableNow");
    expect(source).toContain("fenêtre calculée d’observabilité");
    expect(source).toContain("Calcul astronomique : vérifiez l’horizon, les nuages");
    expect(source).toContain("Ma position actuelle");
    expect(source).toContain("soundAlertEnabled");
    expect(source).toContain("Activer l’alerte sonore");
    expect(source).toContain("Alerte sonore d’observabilité");
    expect(source).toContain("un son discret est joué une seule fois");
    expect(source).toContain("isSoundHelpOpen");
    expect(source).toContain("setIsSoundHelpOpen(true)");
    expect(source).toContain('role="status"');
    expect(source).toContain("Alerte sonore.");
    expect(source).not.toContain("RotateCcw");
    expect(source).toContain("observationAlertFiredRef");
    expect(source).toContain("map-control-cluster");
    expect(styles).toContain("Groupes de commandes flottantes");
    expect(source).toContain("data-swipe-exclude");
    expect(source).toContain("🌕 Prochaine pleine lune");
    expect(source).toContain("Icône d’éclipse");
    expect(source).toContain("Icône de pluie de météores");
    expect(source).toContain("Icône de pleine lune");
    expect(source).toContain("astronomy-outlook-panel");
    expect(styles).toContain("Alertes astronomiques : les informations secondaires restent lisibles");
  });

  it("ouvre des modales de détail accessibles depuis les deux panneaux", () => {
    expect(source).toContain("DialogTrigger");
    expect(source).toContain("Voir les détails");
    expect(source).toContain("Détails de l’indice et des polluants");
    expect(source).toContain("À propos</span>{description}");
    expect(source).toContain("uppercase tracking-[0.12em] text-sky-200/75");
    expect(source).toContain('aria-label="Fermer l’aide"');
    expect(apparentSunMoonSource).toContain("Positions apparentes réelles et actualisées localement pour le lieu actif.");
  });

  it("préserve l’arche complète du cycle solaire sur mobile", () => {
    expect(source).toContain("rounded-t-full");
    expect(styles).toContain("Qualité de l’air, soleil et lune");
    expect(styles).toContain("height: 12rem !important");
    expect(styles).toContain("aspect-ratio: 2 / 1");
    expect(styles).toContain("ratio 2:1 évite le sommet aplati");
    expect(styles).toContain("bottom: 1.15rem !important");
    expect(styles).toContain("top: calc(100% + 0.75rem)");
    expect(styles).toContain("text-amber-100");
    expect(styles).toContain("text-indigo-100");
    expect(styles).toContain("celestial-solar-disc-breathe");
    expect(styles).toContain("prefers-reduced-motion: no-preference");
  });

  it("distingue les positions du Soleil et de la Lune à partir de coordonnées apparentes réelles", () => {
    expect(apparentSunMoonSource).toContain("getApparentAstronomyPosition.useQuery");
    expect(apparentSunMoonSource).toContain("refetchInterval: 60_000");
    expect(apparentSunMoonSource).toContain("projectApparentBodyOnArc");
    expect(source).toContain("left: 50 - 42 * Math.sin(azimuthRadians)");
    expect(source).toContain("Math.sin(altitudeRadians)");
    expect(apparentSunMoonSource).toContain("sunArc");
    expect(apparentSunMoonSource).toContain("moonArc");
    expect(apparentSunMoonSource).toContain("formatAzimuth(apparentPosition.sun.azimuthDeg)");
    expect(apparentSunMoonSource).toContain("formatAzimuth(apparentPosition.moon.azimuthDeg)");
    expect(apparentSunMoonSource).toContain('MeteoIcon name="clear_night" size={40}');
    expect(apparentSunMoonSource).toContain("celestial-night-marker");
    expect(apparentSunMoonSource).toContain('relative mx-auto mt-7 h-40');
    expect(apparentSunMoonSource).toContain("Position apparente de la Lune");
    expect(apparentSunMoonSource).not.toContain("celestial-moon-axis-rotation");
    expect(styles).not.toContain("@keyframes celestial-moon-axis-rotation");
    expect(styles).not.toContain("rotateY(360deg)");
    expect(apparentSunMoonSource).toContain("h-12 w-12");
    expect(styles).not.toContain('content: "Nuit locale"');
  });

  it("trace les parcours réels du Soleil et de la Lune sur un ciel crépusculaire sans rotation lunaire", () => {
    expect(source).toContain("buildTrajectoryPath");
    expect(trajectorySunMoonSource).toContain("position.trajectory?.sun");
    expect(trajectorySunMoonSource).toContain("position.trajectory?.moon");
    expect(trajectorySunMoonSource).toContain("celestial-trajectory--sun");
    expect(trajectorySunMoonSource).toContain("celestial-trajectory--moon");
    expect(trajectorySunMoonSource).toContain("celestial-arc-backdrop");
    expect(trajectorySunMoonSource).toContain("Lune réaliste fixe");
    expect(trajectorySunMoonSource).toContain("sans rotation");
    expect(styles).toContain("celestial-trajectory-card");
    expect(styles).toContain("celestial-trajectory--sun");
    expect(styles).toContain("celestial-trajectory--moon");
    expect(styles).toContain("stroke-dasharray");
  });

  it("place des repères horaires visibles et adapte le ciel à la hauteur réelle du Soleil", () => {
    expect(source).toContain("selectTrajectoryTimeMarkers");
    expect(source).toContain("getCelestialLightPhase");
    expect(temporalSunMoonSource).toContain("sunTimeMarkers");
    expect(temporalSunMoonSource).toContain("moonTimeMarkers");
    expect(temporalSunMoonSource).toContain('celestial-time-marker--sun');
    expect(temporalSunMoonSource).toContain('celestial-time-marker--moon');
    expect(temporalSunMoonSource).toContain('celestial-trajectory-card--${lightPhase}');
    expect(temporalSunMoonSource).toContain('celestial-arc-scene--${lightPhase}');
    expect(styles).toContain("celestial-trajectory-card--day");
    expect(styles).toContain("celestial-trajectory-card--twilight");
    expect(styles).toContain("celestial-trajectory-card--night");
    expect(styles).toContain("celestial-time-markers");
  });

  it("affiche la phase, l’éclairage et l’orientation issus du calcul géométrique lunaire", () => {
    expect(temporalSunMoonSource).toContain("position.lunar");
    expect(temporalSunMoonSource).toContain("brightLimbAngleDeg");
    expect(temporalSunMoonSource).toContain("illuminationPct");
    expect(temporalSunMoonSource).toContain("displayTimeInZone(value, astronomy.timezone)");
    expect(source).toContain("Visibilité locale");
    expect(source).toContain("getEclipseCircumstances.useQuery");
    expect(source).toContain("isEclipseInProgress");
    expect(source).toContain("eclipse-visibility-live");
    expect(source).toContain("Suivi plein écran");
    expect(source).toContain("Quitter le plein écran");
    expect(temporalSunMoonSource).toContain("<RealisticMoon phase={moonPhase}");
    expect(source).toContain("rotate(${phase.brightLimbAngleDeg}deg)");
    expect(temporalSunMoonSource).toContain("moon: { label: position.lunar.label");
  });

  it("utilise une texture réaliste pour toute phase lunaire visible", () => {
    expect(source).toContain("meteoai-realistic-moon-surface_f2f79daf.png");
    expect(source).toContain("function RealisticMoon");
    expect(source).toContain("radial-gradient(ellipse at ${highlightPosition}");
    expect(source).toContain("Lune réaliste représentant ${moonPhase.label}");
    expect(styles).toContain("Premier croissant : seul l’astre est visible");
    expect(styles).toContain("background: transparent !important");
  });

  it("anime une lueur lunaire discrète sans l’imposer aux préférences de mouvement réduit", () => {
    expect(source).toContain("realistic-moon-glow");
    expect(styles).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(styles).toContain("meteoai-lunar-glow");
    expect(styles).toContain("--moon-glow-opacity");
    expect(styles).toContain("filter: brightness(1.08)");
  });
});
