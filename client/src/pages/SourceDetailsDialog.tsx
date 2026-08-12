import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStationDisplayStatus } from "@/lib/stationCandidateStatus";

type SourceSelection = { kind: "station" | "model"; source: any } | null;

function raw(value: number | null | undefined, unit = "", decimals = 1) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(decimals)}${unit}`;
}

function SourceReading({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-[#090b10] px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-100">{value}</p></div>;
}

export function SourceDetailsDialog({ selection, groundTruth, onOpenChange }: { selection: SourceSelection; groundTruth: any; onOpenChange: (open: boolean) => void }) {
  const source = selection?.source;
  const isModel = selection?.kind === "model";
  const contribution = !isModel ? groundTruth?.stationsUsed?.find((item: any) => item.stationId === source?.stationId) : null;
  const displayStatus = !isModel && source ? getStationDisplayStatus(source) : null;
  const participation = isModel
    ? "Référence de modèle : poids de fusion locale 0 %. Son coefficient de cohérence est informatif et ne modifie pas la température locale."
    : displayStatus === "candidate"
      ? "Capteur citoyen en validation : poids de fusion locale 0 %. La mesure est conservée pour contrôle avant toute évaluation historique."
      : contribution
        ? `Station physique utilisée dans la synthèse locale : poids final ${Math.round(Number(contribution.weight) * 1000) / 10} %.`
        : "Cette source ne participe pas au calcul local sur ce cycle : elle est absente, écartée ou ne passe pas les contrôles de qualité.";
  const coherence = isModel && source?.coherenceWeight !== null && source?.coherenceWeight !== undefined
    ? `${Math.round(Number(source.coherenceWeight) * 100)} % (indicateur, pas un poids de fusion)`
    : "Non mesurable sans station physique locale validée";

  return <Dialog open={Boolean(selection)} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto border-slate-700 bg-[#10131a] p-5 text-slate-100 sm:max-w-xl"><DialogHeader><DialogTitle className="pr-8 text-white">{source?.name ?? "Détails de la source"}</DialogTitle><DialogDescription className="text-slate-400">{isModel ? "Référence de modèle au point du lieu — non station" : "Relevé et statut de station pour le lieu actif"}</DialogDescription></DialogHeader>{source && <div className="space-y-4"><section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-blue-200">Rôle dans le calcul global</h3><p className="mt-1.5 text-sm leading-relaxed text-slate-200">{participation}</p>{isModel && <p className="mt-2 text-[11px] text-violet-200">Cohérence locale : {coherence}</p>}</section><section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Données brutes du dernier relevé</h3><div className="grid grid-cols-2 gap-2"><SourceReading label="Température" value={raw(source.temperature, " °C")} /><SourceReading label="Humidité" value={raw(source.humidity, " %", 0)} /><SourceReading label="Pression" value={raw(source.pressure, " hPa", 0)} /><SourceReading label="Vent" value={raw(source.windSpeed, " km/h")} /><SourceReading label="Rafales" value={raw(source.windGust, " km/h")} /><SourceReading label="Direction" value={raw(source.windDirection, "°", 0)} /><SourceReading label="Précipitations" value={raw(source.precipitation, " mm")} /><SourceReading label="Altitude" value={raw(source.altitude, " m", 0)} /></div></section><section className="rounded-xl border border-slate-800 bg-[#090b10] p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Provenance et fraîcheur</h3><dl className="mt-2 space-y-1.5 text-xs"><div className="flex justify-between gap-4"><dt className="text-slate-500">Identifiant</dt><dd className="break-all text-right text-slate-200">{source.stationId ?? source.id ?? "—"}</dd></div>{!isModel && <div className="flex justify-between gap-4"><dt className="text-slate-500">Source</dt><dd className="text-right text-slate-200">{source.source ?? "—"}</dd></div>}<div className="flex justify-between gap-4"><dt className="text-slate-500">Mis à jour</dt><dd className="text-right text-slate-200">{source.updatedAt ? new Date(source.updatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</dd></div>{!isModel && <div className="flex justify-between gap-4"><dt className="text-slate-500">Distance</dt><dd className="text-right text-slate-200">{raw(source.distanceKm, " km")}</dd></div>}</dl></section>{contribution && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Décomposition du poids appliqué</h3><div className="grid grid-cols-2 gap-2"><SourceReading label="Poids final" value={`${(Number(contribution.weight) * 100).toFixed(1)} %`} /><SourceReading label="Distance" value={raw(contribution.distanceWeight, "", 3)} /><SourceReading label="Qualité" value={raw(contribution.qualityWeight, "", 3)} /><SourceReading label="Fraîcheur" value={raw(contribution.freshnessWeight, "", 3)} /></div></section>}</div>}</DialogContent></Dialog>;
}
