import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge, type WeatherStatusBadgeTone } from "@/components/weather/WeatherStatusBadge";

/**
 * Section « Impact à blanc des capteurs citoyens validés » : rejoue la
 * pondération de la synthèse physique sur l’historique archivé et mesure
 * l’écart à la médiane des stations officielles, avec et sans les capteurs
 * validés. Aucune donnée n’est fabriquée : une métrique absente reste « — »,
 * un verdict insuffisant affiche les effectifs mesurés, et la fusion locale
 * n’est jamais modifiée par cette évaluation.
 */

type CitizenFusionImpactData = {
  status: "no-validated-citizens" | "insufficient-history" | "improves" | "no-improvement";
  reason: string;
  comparisons: number;
  distinctDays: number;
  windowDays: number;
  officialStationsUsed: string[];
  physicalStationsUsed: string[];
  validatedCitizenStations: string[];
  baselineMaeC: number | null;
  withCitizenMaeC: number | null;
  improvementC: number | null;
  firstComparedAt: string | null;
  lastComparedAt: string | null;
  activation: CitizenFusionActivationData | null;
};

type CitizenFusionActivationData = {
  status: "activated" | "not-activated";
  reason: string;
  evaluatedAt: number;
};

const STATUS_LABELS: Record<CitizenFusionImpactData["status"], { tone: WeatherStatusBadgeTone; label: string }> = {
  improves: { tone: "success", label: "AMÉLIORATION MESURÉE" },
  "no-improvement": { tone: "danger", label: "AUCUNE AMÉLIORATION MESURÉE" },
  "no-validated-citizens": { tone: "neutral", label: "AUCUN CAPTEUR VALIDÉ" },
  "insufficient-history": { tone: "warning", label: "HISTORIQUE INSUFFISANT" },
};

const ACTIVATION_LABELS: Record<CitizenFusionActivationData["status"], { tone: WeatherStatusBadgeTone; label: string }> = {
  activated: { tone: "success", label: "ACTIFS DANS LA TEMPÉRATURE LOCALE" },
  "not-activated": { tone: "danger", label: "HORS DE LA TEMPÉRATURE LOCALE" },
};

const activationDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

function formatActivationDate(value: number) {
  return Number.isFinite(value) ? activationDateFormatter.format(new Date(value)) : "—";
}

function formatCelsius(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)} °C`
    : "—";
}

export function CitizenFusionImpactSection({
  data,
  isLoading,
  isError,
  locationName,
}: {
  data: CitizenFusionImpactData | undefined;
  isLoading: boolean;
  isError: boolean;
  locationName: string;
}) {
  const status = data?.status ? STATUS_LABELS[data.status] : null;

  return (
    <MeteoSurface
      tone="inset"
      as="section"
      className="rounded-2xl p-4 sm:p-5"
      aria-labelledby="citizen-fusion-impact-title"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div>
          <h2
            id="citizen-fusion-impact-title"
            className="text-sm font-semibold text-slate-100"
          >
            Impact à blanc des capteurs citoyens validés
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Rejoue la pondération de la synthèse physique (distance 50 %,
            priorité de source 30 %, fraîcheur 20 %) sur l’historique archivé
            et mesure l’écart à la médiane des stations officielles, avec et
            sans les capteurs validés. Les deux bras partagent le même cadre
            d’alignement : heure de mesure propre à la température, deux
            stations officielles minimum et une station physique dans la même
            heure. Aucune donnée n’est fabriquée : l’heure d’archive n’est
            jamais un substitut.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700/70 bg-slate-950/30 px-2.5 py-1 text-[9px] text-slate-500">
          {locationName} · évaluation à blanc
        </span>
      </div>

      {isLoading ? (
        <div
          className="mt-4 h-24 animate-pulse rounded-xl bg-slate-800"
          role="status"
          aria-label="Chargement de l’évaluation à blanc des capteurs validés"
        />
      ) : isError ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">
          Lecture de l’évaluation indisponible : aucune donnée n’est estimée en
          remplacement.
        </p>
      ) : !data ? null : data.status === "no-validated-citizens" ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">
          Aucun capteur citoyen validé archivé pour ce lieu : rien n’est évalué,
          aucune valeur n’est inventée.
        </p>
      ) : data.status === "insufficient-history" ? (
        <div className="mt-4 space-y-2">
          {status ? (
            <WeatherStatusBadge compact tone={status.tone} label={status.label} />
          ) : null}
          <p className="text-xs leading-relaxed text-slate-400">{data.reason}</p>
          {data.comparisons > 0 ? (
            <p className="text-[11px] text-slate-500">
              Comparaisons alignées : {data.comparisons} sur {data.distinctDays} jour(s)
              distinct(s), fenêtre de {data.windowDays} jours.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {status ? (
            <WeatherStatusBadge compact tone={status.tone} label={status.label} />
          ) : null}
          <p className="text-xs leading-relaxed text-slate-400">{data.reason}</p>
          <dl className="grid gap-2 rounded-xl border border-slate-800 bg-[#090b10] px-3 py-3 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                MAE synthèse physique seule
              </dt>
              <dd className="text-sm font-medium text-white">
                {formatCelsius(data.baselineMaeC)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                MAE avec capteurs validés
              </dt>
              <dd className="text-sm font-medium text-white">
                {formatCelsius(data.withCitizenMaeC)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Amélioration moyenne mesurée
              </dt>
              <dd className="text-sm font-medium text-white">
                {formatCelsius(data.improvementC)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Comparaisons alignées
              </dt>
              <dd className="text-sm font-medium text-white">
                {data.comparisons} sur {data.distinctDays} jour(s) distinct(s)
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-slate-500">
            Référence : médiane de {data.officialStationsUsed.length} station(s)
            officielle(s) · synthèse physique : {data.physicalStationsUsed.length}{" "}
            station(s) · capteurs validés évalués :{" "}
            {data.validatedCitizenStations.length}. Fenêtre de {data.windowDays} jours.
          </p>
        </div>
      )}

      {data ? (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Décision d’activation archivée
            </h3>
            {data.activation ? (
              <WeatherStatusBadge
                compact
                tone={ACTIVATION_LABELS[data.activation.status].tone}
                label={ACTIVATION_LABELS[data.activation.status].label}
              />
            ) : null}
          </div>
          {data.activation ? (
            <p className="text-xs leading-relaxed text-slate-400">{data.activation.reason}</p>
          ) : (
            <p className="text-[11px] leading-relaxed text-slate-500">
              Ce lieu n’a encore aucune décision d’activation archivée : le
              cycle planifié archive la décision dès qu’un capteur citoyen
              validé existe pour ce lieu, et la synthèse live reste
              strictement physique jusqu’à une décision activée.
            </p>
          )}
          {data.activation ? (
            <p className="text-[11px] text-slate-500">
              Évaluée le {formatActivationDate(data.activation.evaluatedAt)} · réévaluée à chaque cycle planifié.
            </p>
          ) : null}
        </div>
      ) : null}

      {data && data.status !== "no-validated-citizens" ? (
        <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
          Évaluation à blanc : le rapport mesure l’écart des deux bras, il ne
          modifie rien. La participation des capteurs citoyens validés à la
          synthèse de température locale suit la décision d’activation
          persistée, réévaluée à chaque cycle planifié ; la vérité terrain
          horaire archivée reste physique uniquement.
        </p>
      ) : null}
    </MeteoSurface>
  );
}
