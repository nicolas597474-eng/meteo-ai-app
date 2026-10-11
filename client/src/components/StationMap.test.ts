import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StationMap.tsx", import.meta.url), "utf8");

describe("carte des stations OpenStreetMap", () => {
  it("affiche le lieu actif et les stations sous forme de marqueurs Leaflet interactifs", () => {
    expect(source).toContain("L.circleMarker([center.lat, center.lon]");
    expect(source).toContain("station.ageMinutes !== null && station.ageMinutes <= 90");
    expect(source).toContain("L.circleMarker([station.lat, station.lon]");
    expect(source).toContain(".bindPopup(stationInfoHtml(station)");
    expect(source).toContain(".bindTooltip(`${station.name}");
    expect(source).toContain("markerLayer.clearLayers()");
  });

  it("préserve les détails des relevés et leur code de fraîcheur", () => {
    expect(source).toContain("function stationFreshness");
    expect(source).toContain("Dernier relevé");
    expect(source).toContain("#34d399");
    expect(source).toContain("#fbbf24");
    expect(source).toContain("#fb7185");
    expect(source).toContain("function stationInfoHtml");
    expect(source).toContain("Priorité technique de réseau/source");
    expect(source).toContain("pas une performance météo individuelle mesurée");
    expect(source).not.toContain("Fiabilité mesurée");
  });

  it("conserve le recentrage, le zoom personnalisé, la légende et le plein écran", () => {
    expect(source).toContain("map.setView([center.lat, center.lon], 14)");
    expect(source).toContain("mapRef.current?.setView([center.lat, center.lon], normalZoom)");
    expect(source).toContain("map.setZoom(Math.max(2, Math.min(20, currentZoom + delta)))");
    expect(source).toContain('absolute right-3 top-[28%] z-10 flex flex-col items-center gap-4');
    expect(source).toContain('aria-label="Centrer la carte sur le lieu actif"');
    expect(source).toContain("Niveau de zoom : {zoomLevel}");
    expect(source).toContain("Légende des marqueurs");
    expect(source).toContain("Bleu</strong> — lieu de référence");
    expect(source).toContain("Vert</strong> — station avec relevé de moins de 90 min");
    expect(source).toContain("Ambre</strong> — station avec relevé de plus de 90 min");
    expect(source).toContain("group-open:rotate-180");
    expect(source).toContain("const openImmersiveMap = useCallback");
    expect(source).toContain("const closeImmersiveMap = useCallback");
    expect(source).toContain("document.documentElement.requestFullscreen()");
    expect(source).toContain("createPortal(mapShell, document.body)");
    expect((source.match(/aria-label=\"Fermer la carte agrandie\"/g) ?? []).length).toBe(1);
  });

  it("ajoute des boutons de zoom manuel sur la carte compacte", () => {
    expect(source).toContain("!isExpanded && mapReady");
    expect(source).toContain("Zoom manuel de la carte des stations");
    expect(source).toContain("onZoomIn={() => adjustExpandedZoom(1)}");
    expect(source).toContain("onZoomOut={() => adjustExpandedZoom(-1)}");
  });

  it("ne retire que les capteurs citoyens non qualifiés, jamais l'étalon officiel", () => {
    expect(source).toContain("isUnqualifiedCitizenStation");
    expect(source).toContain("visibleStations.forEach((station) =>");
    // Les stations officielles SYNOP restent : elles définissent la
    // qualification, les masquer retirerait l'étalon et laisserait une carte
    // vide indiscernable d'une carte en panne.
    expect(source).toContain("stations.filter((station) => !isUnqualifiedCitizenStation(station))");
    expect(source).not.toContain("stations.filter((station) => isQualifiedCitizenStation(station))");
    // Le libellé annonce ce qui est retiré, il ne promet pas « uniquement ».
    expect(source).toContain("Masquer les capteurs citoyens non qualifiés");
    expect(source).not.toContain("Capteurs citoyens qualifiés uniquement");
    // L'effectif masqué est annoncé sur le bouton : une station ne disparaît
    // jamais sans que l'utilisateur puisse le constater.
    expect(source).toContain("masquée(s)");
    expect(source).toContain("aria-pressed={qualifiedCitizensOnly}");
    // Le filtre est désactivé par défaut : la carte montre tout au premier rendu.
    expect(source).toContain("const [qualifiedCitizensOnly, setQualifiedCitizensOnly] = useState(false);");
    // Les marqueurs se redessinent quand le filtre change, sinon la carte
    // garderait l'ancien jeu de stations.
    expect(source).toContain("[qualifiedCitizensOnly, stations]");
    expect(source).toContain("[center.lat, center.lon, visibleStations]");
  });

  it("affiche le badge de qualification réel dans l'infobulle", () => {
    expect(source).toContain("getStationQualificationBadge");
    expect(source).toContain("qualification.label");
    // La légende rappelle que la couleur encode la fraîcheur, pas la qualification.
    expect(source).toContain("ne dit <strong");
  });

  it("ne conserve pas les contrôles de fond Satellite ni Street View de Google", () => {
    expect(source).not.toContain("MapTypeToggle");
    expect(source).not.toContain("google.maps");
    expect(source).not.toContain("Street View");
    expect(source).not.toContain("streetViewControl");
  });
});
