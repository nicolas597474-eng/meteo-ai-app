import { MeteoIcon } from "@/components/MeteoIcon";

export function ForecastMetricDefinitions({ className = "" }: { className?: string }) {
  return (
    <section className={`rounded-2xl border border-sky-400/20 bg-sky-400/[0.045] p-3 ${className}`} aria-label="Comprendre stabilité et confiance">
      <div className="flex items-start gap-2.5">
        <MeteoIcon name="confidence" size={23} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-sky-100">Deux indicateurs différents</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-300"><strong className="text-slate-100">Stabilité des modèles</strong> : mesure uniquement leur accord pour l’échéance affichée. <strong className="text-slate-100">Confiance de la prévision</strong> : combine cet accord avec la qualité historique qualifiée, la fraîcheur, l’échéance et la quantité de preuves. Sans preuve suffisante, elle est indiquée comme indisponible plutôt que complétée par défaut.</p>
        </div>
      </div>
    </section>
  );
}
