import { MeteoIcon } from "@/components/MeteoIcon";

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
  } | null;
  source: string;
};

const aqiPalette = {
  emerald: { text: "text-emerald-200", line: "#34d399", soft: "border-emerald-400/20 bg-emerald-400/[0.04]" },
  lime: { text: "text-lime-200", line: "#a3e635", soft: "border-lime-400/20 bg-lime-400/[0.04]" },
  amber: { text: "text-amber-200", line: "#fbbf24", soft: "border-amber-400/20 bg-amber-400/[0.04]" },
  orange: { text: "text-orange-200", line: "#fb923c", soft: "border-orange-400/20 bg-orange-400/[0.04]" },
  rose: { text: "text-rose-200", line: "#fb7185", soft: "border-rose-400/20 bg-rose-400/[0.04]" },
  slate: { text: "text-slate-300", line: "#64748b", soft: "border-slate-600/30 bg-slate-800/30" },
};

function displayTime(value: string | null) {
  return value?.match(/T(\d{2}:\d{2})/)?.[1] ?? "—";
}

function displayDuration(value: number | null) {
  if (value == null) return "—";
  const minutes = Math.round(value / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function AirQualityPanel({ air, source }: { air: EnvironmentalData["air"]; source: string }) {
  if (!air) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="wind_moderate" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Qualité de l’air</h2><p className="mt-1 text-xs text-slate-400">Données réelles temporairement indisponibles. Aucune valeur n’est estimée.</p></div></div></section>;
  const palette = aqiPalette[air.descriptor.tone];
  const ringValue = Math.min(100, Math.max(0, air.aqi ?? 0));
  return <section className={`weather-surface rounded-[22px] border p-4 ${palette.soft}`} aria-labelledby="air-quality-title">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><MeteoIcon name="wind_moderate" size={30} /><div><h2 id="air-quality-title" className="text-base font-semibold text-slate-100">Qualité de l’air</h2><p className="text-[11px] text-slate-400">Indice européen AQI · {displayTime(air.observedAt)}</p></div></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${palette.soft} ${palette.text}`}>{air.descriptor.label}</span></div>
    <div className="mt-4 flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-[5px]" style={{ background: `conic-gradient(${palette.line} ${ringValue * 3.6}deg, rgba(71,85,105,.38) 0deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-[#0a0f17]"><span className={`text-2xl font-light ${palette.text}`}>{air.aqi ?? "—"}</span><span className="text-[9px] uppercase tracking-wide text-slate-500">AQI</span></div></div><p className="max-w-[210px] text-xs leading-relaxed text-slate-400">L’indice synthétise le polluant le plus défavorable parmi les particules et gaz suivis.</p></div>
    <div className="mt-4 grid grid-cols-4 gap-2 text-center"><Metric label="PM2.5" value={air.pm25} unit="µg/m³" /><Metric label="PM10" value={air.pm10} unit="µg/m³" /><Metric label="NO₂" value={air.nitrogenDioxide} unit="µg/m³" /><Metric label="O₃" value={air.ozone} unit="µg/m³" /></div>
    {air.hourly.length > 0 && <div className="mt-4"><div className="flex h-14 items-end gap-1 border-b border-slate-600/35 px-1">{air.hourly.map((point) => <span key={point.time} title={`${displayTime(point.time)} · AQI ${Math.round(point.value)}`} className="min-w-0 flex-1 rounded-t-sm" style={{ height: `${Math.max(12, Math.min(100, point.value))}%`, background: point.value <= 20 ? "linear-gradient(to top, #064e3b, #34d399)" : point.value <= 40 ? "linear-gradient(to top, #3f6212, #a3e635)" : "linear-gradient(to top, #78350f, #fbbf24)" }} />)}</div><div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>{displayTime(air.hourly[0].time)}</span><span>Prochaines 24 h</span><span>{displayTime(air.hourly.at(-1)?.time ?? null)}</span></div></div>}
    <p className="mt-3 text-[10px] text-slate-500">Prévision de qualité de l’air : {source}. Elle n’influence pas la prévision météo officielle.</p>
  </section>;
}

function Metric({ label, value, unit }: { label: string; value: number | null; unit: string }) { return <div className="rounded-xl border border-white/5 bg-black/10 py-2"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 text-xs font-semibold text-slate-200">{value == null ? "—" : value.toFixed(0)}</p><p className="text-[8px] text-slate-500">{unit}</p></div>; }

function SunMoonPanel({ astronomy, source }: { astronomy: EnvironmentalData["astronomy"]; source: string }) {
  if (!astronomy) return <section className="weather-surface rounded-[22px] border border-slate-700/60 p-4"><div className="flex items-center gap-3"><MeteoIcon name="sunny" size={30} /><div><h2 className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="mt-1 text-xs text-slate-400">Éphémérides réelles temporairement indisponibles.</p></div></div></section>;
  const sunPosition = astronomy.dayProgress == null ? 50 : Math.round(10 + astronomy.dayProgress * 80);
  return <section className="weather-surface rounded-[22px] border border-amber-400/15 bg-gradient-to-br from-amber-400/[0.05] via-slate-950/10 to-indigo-500/[0.06] p-4" aria-labelledby="sun-moon-title">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><MeteoIcon name="sunny" size={30} /><div><h2 id="sun-moon-title" className="text-base font-semibold text-slate-100">Soleil & Lune</h2><p className="text-[11px] text-slate-400">Éphémérides locales du jour</p></div></div><span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-100">Jour {displayDuration(astronomy.daylightDurationSeconds)}</span></div>
    <div className="relative mx-auto mt-5 h-28 max-w-[310px] overflow-hidden"><div className="absolute bottom-2 left-5 right-5 h-[132px] rounded-t-full border-x border-t border-sky-300/30 bg-gradient-to-b from-blue-400/30 via-blue-400/10 to-transparent" /><div className="absolute bottom-2 left-5 right-5 border-t border-slate-300/50" /><span className="absolute bottom-[8px] h-5 w-5 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_22px_rgba(251,191,36,.75)]" style={{ left: `${sunPosition}%`, bottom: `${24 + Math.sin((sunPosition / 100) * Math.PI) * 60}px` }} /><span className="absolute bottom-0 left-0 text-[11px] text-slate-300">{displayTime(astronomy.sunrise)}<small className="block text-[9px] text-slate-500">Lever</small></span><span className="absolute bottom-0 right-0 text-right text-[11px] text-slate-300">{displayTime(astronomy.sunset)}<small className="block text-[9px] text-slate-500">Coucher</small></span></div>
    <div className="mt-3 grid grid-cols-[80px_1fr] items-center gap-3 border-t border-slate-600/25 pt-3"><div className="grid h-16 w-16 place-items-center rounded-full border border-slate-500/35 bg-[radial-gradient(circle_at_36%_28%,#64748b_0%,#1e293b_46%,#05070a_100%)] text-2xl text-slate-200">{astronomy.moon.symbol}</div><div><p className="text-sm font-semibold text-slate-100">{astronomy.moon.label}</p><p className="mt-0.5 text-xs text-slate-400">Éclairage {astronomy.moonIllumination == null ? "—" : `${astronomy.moonIllumination}%`}</p><div className="mt-2 flex gap-4 text-[10px] text-slate-500"><span>Lever <b className="font-medium text-slate-300">{displayTime(astronomy.moonrise)}</b></span><span>Coucher <b className="font-medium text-slate-300">{displayTime(astronomy.moonset)}</b></span></div></div></div>
    <p className="mt-3 text-[10px] text-slate-500">Source des éphémérides : {source}.</p>
  </section>;
}

export function EnvironmentalPanels({ data, isLoading }: { data: EnvironmentalData | null | undefined; isLoading?: boolean }) {
  if (isLoading && !data) return <div className="grid gap-3 sm:grid-cols-2"><div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" /><div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" /></div>;
  return <section className="grid gap-3 sm:grid-cols-2" aria-label="Qualité de l’air, soleil et lune"><AirQualityPanel air={data?.air ?? null} source={data?.source ?? "Open-Meteo / CAMS"} /><SunMoonPanel astronomy={data?.astronomy ?? null} source={data?.source ?? "Open-Meteo"} /></section>;
}
