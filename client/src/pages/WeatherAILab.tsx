import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { Link } from "wouter";
import { AlertTriangle, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleDashed, CircleHelp, ClipboardCheck, Database, FlaskConical, ListTree, MapPinned, MapPin, RefreshCw, SlidersHorizontal, X, Zap } from "lucide-react";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { getValidationModelSource } from "@/lib/validationModelSource";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function IndicatorHelp({ title, children }: { title: string; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><button type="button" aria-label={`Comprendre le calcul : ${title}`} className="grid h-6 w-6 place-items-center rounded-full border border-slate-700/70 bg-slate-950/30 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><CircleHelp className="h-3.5 w-3.5" /></button></PopoverTrigger><PopoverContent side="bottom" align="center" sideOffset={8} collisionPadding={12} className="z-[80] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-600 bg-[#101622] px-3 py-3 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/75">Calcul de l’indicateur</p><p className="mt-1 text-sm font-semibold text-white">{title}</p></div><PopoverClose type="button" aria-label="Fermer l’aide" className="-mt-0.5 -mr-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-700/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-3.5 w-3.5" /></PopoverClose></div><div className="mt-2.5 space-y-2 text-slate-200">{children}</div></PopoverContent></Popover>;
}

function HelpDetail({ label, children }: { label: string; children: ReactNode }) {
  return <p><span className="font-semibold text-sky-100">{label} · </span>{children}</p>;
}

type SimulationStep = {
  id: string;
  title: string;
  summary: string;
  detail: ReactNode;
  status: "complete" | "partial" | "waiting";
};

function SimulationStatusIcon({ status }: { status: SimulationStep["status"] }) {
  if (status === "complete") return <CircleCheck className="h-4 w-4 text-emerald-300" />;
  if (status === "partial") return <CircleAlert className="h-4 w-4 text-amber-300" />;
  return <CircleDashed className="h-4 w-4 text-slate-500" />;
}

function FusionSimulation({ steps, snapshotLabel }: { steps: SimulationStep[]; snapshotLabel: string }) {
  const [activeStep, setActiveStep] = useState(0);
  const current = steps[Math.min(activeStep, Math.max(steps.length - 1, 0))];
  if (!current) return null;
  const goTo = (index: number) => setActiveStep(Math.max(0, Math.min(steps.length - 1, index)));
  return <section className="rounded-2xl border border-sky-400/25 bg-[linear-gradient(135deg,rgba(14,116,144,0.10),rgba(13,19,29,0.98)_42%)] p-4" aria-labelledby="fusion-simulation-title"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><ListTree className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" /><div><h2 id="fusion-simulation-title" className="text-sm font-semibold text-slate-100">Simulation de la fusion</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Parcours de la trace réellement disponible : chaque étape décrit le snapshot, sans rejouer ni inventer de données.</p></div></div><span className="shrink-0 rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-1 text-[9px] font-semibold text-sky-100">{snapshotLabel}</span></div><div className="mt-4 grid grid-cols-[minmax(90px,0.72fr)_minmax(0,1.5fr)] gap-3 sm:grid-cols-[126px_minmax(0,1fr)]"><div className="relative space-y-1.5 before:absolute before:bottom-4 before:left-3 before:top-4 before:w-px before:bg-sky-300/20" aria-label="Étapes de la simulation">{steps.map((step, index) => <button key={step.id} type="button" onClick={() => goTo(index)} aria-current={index === activeStep ? "step" : undefined} className={`relative z-10 flex min-h-9 w-full items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${index === activeStep ? "border-sky-300/55 bg-sky-400/15" : "border-transparent bg-slate-950/20 hover:border-slate-700"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${index === activeStep ? "border-sky-200 bg-sky-300 text-slate-950" : "border-slate-600 bg-[#101722] text-slate-200"}`}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-[9px] font-semibold leading-tight text-slate-200">{step.title}</span><span className="mt-0.5 flex items-center gap-1 text-[8px] text-slate-500"><SimulationStatusIcon status={step.status} /><span>{step.status === "complete" ? "Trace" : step.status === "partial" ? "Partiel" : "Attente"}</span></span></span></button>)}</div><div className="min-w-0"><article className="min-h-[246px] rounded-xl border border-slate-700/80 bg-[#080d14]/80 p-3" aria-live="polite"><div className="flex items-start gap-2"><SimulationStatusIcon status={current.status} /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/75">Étape {activeStep + 1} sur {steps.length}</p><h3 className="mt-1 text-sm font-semibold text-slate-100">{current.title}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-300">{current.summary}</p></div></div><div className="mt-3 border-t border-slate-700/70 pt-3 text-[11px] leading-relaxed text-slate-400">{current.detail}</div></article><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => goTo(activeStep - 1)} disabled={activeStep === 0} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-2 text-[10px] font-medium text-slate-300 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Précédent</button><button type="button" onClick={() => goTo(activeStep + 1)} disabled={activeStep === steps.length - 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-sky-400/35 bg-sky-400/10 px-2 text-[10px] font-semibold text-sky-100 disabled:opacity-40">Suivant<ChevronRight className="h-3.5 w-3.5" /></button></div></div></div></section>;
}

function StationSimulation({ steps }: { steps: SimulationStep[] }) {
  const [activeStep, setActiveStep] = useState(0);
  const current = steps[Math.min(activeStep, Math.max(steps.length - 1, 0))];
  if (!current) return null;
  const goTo = (index: number) => setActiveStep(Math.max(0, Math.min(steps.length - 1, index)));
  return <section className="rounded-2xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(5,150,105,0.10),rgba(13,19,29,0.98)_42%)] p-4" aria-labelledby="station-simulation-title"><div className="flex items-start gap-2"><MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><h2 id="station-simulation-title" className="text-sm font-semibold text-slate-100">Branche complémentaire · Stations locales</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Parcours des observations physiques : recherche, filtrage, synthèse locale et niveau de preuve. Cette branche ne modifie pas la prévision fusionnée.</p></div></div><div className="mt-4 grid grid-cols-[minmax(90px,0.72fr)_minmax(0,1.5fr)] gap-3 sm:grid-cols-[126px_minmax(0,1fr)]"><div className="relative space-y-1.5 before:absolute before:bottom-4 before:left-3 before:top-4 before:w-px before:bg-emerald-300/20" aria-label="Étapes des stations locales">{steps.map((step, index) => <button key={step.id} type="button" onClick={() => goTo(index)} aria-current={index === activeStep ? "step" : undefined} className={`relative z-10 flex min-h-9 w-full items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${index === activeStep ? "border-emerald-300/55 bg-emerald-400/15" : "border-transparent bg-slate-950/20 hover:border-slate-700"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${index === activeStep ? "border-emerald-200 bg-emerald-300 text-slate-950" : "border-slate-600 bg-[#101722] text-slate-200"}`}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-[9px] font-semibold leading-tight text-slate-200">{step.title}</span><span className="mt-0.5 flex items-center gap-1 text-[8px] text-slate-500"><SimulationStatusIcon status={step.status} /><span>{step.status === "complete" ? "Trace" : step.status === "partial" ? "Partiel" : "Attente"}</span></span></span></button>)}</div><div className="min-w-0"><article className="min-h-[222px] rounded-xl border border-slate-700/80 bg-[#080d14]/80 p-3" aria-live="polite"><div className="flex items-start gap-2"><SimulationStatusIcon status={current.status} /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/75">Étape {activeStep + 1} sur {steps.length}</p><h3 className="mt-1 text-sm font-semibold text-slate-100">{current.title}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-300">{current.summary}</p></div></div><div className="mt-3 border-t border-slate-700/70 pt-3 text-[11px] leading-relaxed text-slate-400">{current.detail}</div></article><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => goTo(activeStep - 1)} disabled={activeStep === 0} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-2 text-[10px] font-medium text-slate-300 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Précédent</button><button type="button" onClick={() => goTo(activeStep + 1)} disabled={activeStep === steps.length - 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-2 text-[10px] font-semibold text-emerald-100 disabled:opacity-40">Suivant<ChevronRight className="h-3.5 w-3.5" /></button></div></div></div></section>;
}

function stationFreshnessLabel(updatedAt: Date | string | null | undefined) {
  if (!updatedAt) return "Heure de mise à jour indisponible";
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return "Heure de mise à jour indisponible";
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 2) return "Mise à jour il y a moins de 2 min";
  if (elapsedMinutes < 60) return `Mise à jour il y a ${elapsedMinutes} min`;
  return `Mise à jour à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`;
}

function Stat({ label, value, tone = "text-slate-100", help }: { label: string; value: string; tone?: string; help?: ReactNode }) {
  return <MeteoSurface tone="lab" className="relative rounded-xl bg-black/20 px-2 py-2.5 text-center">{help ? <span className="absolute right-1.5 top-1.5">{help}</span> : null}<p className={`text-xl font-bold ${tone}`}>{value}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</p></MeteoSurface>;
}

function Divergence({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const ratio = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  const level = ratio < 30 ? "Faible" : ratio < 60 ? "Modéré" : "Élevé";
  const tone = ratio < 30 ? "text-emerald-400" : ratio < 60 ? "text-amber-300" : "text-red-300";
  return <div className="space-y-1"><div className="flex justify-between gap-2 text-xs"><span className="text-slate-400">{label}</span><span className="font-semibold text-slate-200">{value} {unit} <span className={tone}>· {level}</span></span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${ratio}%` }} /></div></div>;
}

const AI_LAB_GLOSSARY = [
  {
    title: "Fusion et indicateurs du haut",
    entries: [
      ["Fusion officielle", "Prévision combinée à partir des modèles actifs qui ont fourni une donnée exploitable. Les modèles candidats en validation restent exclus de cette fusion."],
      ["Snapshot", "Une photo enregistrée à un moment précis : elle garde les modèles reçus, leurs poids et le résultat calculé à cet instant. Un snapshot « archivé » est cette photo conservée après une collecte ; un calcul « direct » est une photo créée pour la consultation actuelle. Ce n’est ni une nouvelle observation ni une promesse pour plus tard."],
      ["Confiance", "Indice sur 100 combinant l’accord des modèles (40 %), la performance historique qualifiée si elle existe (30 %), la cohérence de stations physiques si elle existe (20 %) et l’échéance (10 %). Les éléments absents ne sont pas inventés et limitent l’indice."],
      ["Stabilité des modèles", "Mesure la dispersion entre contributeurs : 60 % provient de la variabilité des températures maximales et 40 % de celle des précipitations. Une valeur élevée signifie que les modèles sont proches, non que la météo sera forcément calme."],
      ["Modèles appliqués", "Nombre de modèles présents dans la trace de fusion actuelle. Ce compteur ne mesure ni leur qualité ni le nombre de stations."],
    ],
  },
  {
    title: "Poids, paramètres et régime",
    entries: [
      ["Poids appliqué", "Part attribuée à un modèle pour un paramètre donné dans la fusion. Les poids sont des coefficients de calcul ; ils ne sont ni une probabilité ni une observation de station."],
      ["Sources appliquées par paramètre", "Liste distincte pour température, précipitations et vent. Un modèle peut contribuer différemment selon le paramètre si ses données ou ses preuves disponibles diffèrent."],
      ["Régime de prévision dominant", "Scénario météorologique du créneau horaire, déduit des prévisions de température, précipitations et vent. Il est volontairement distinct du phénomène immédiatement observé sur le Dashboard."],
      ["Pastilles T°, Pluie, Vent, Nuages", "Importance relative des paramètres pour le régime actuel. Elles ne sont pas les poids des modèles et servent à lire la priorité du scénario."],
    ],
  },
  {
    title: "Accord, tableaux et collecte",
    entries: [
      ["Accord des modèles", "Écart entre la valeur minimale et la valeur maximale des seuls contributeurs tracés. Faible écart signifie accord relatif ; il ne garantit pas une prévision exacte."],
      ["Prévisions quotidiennes des contributeurs", "Valeurs journalières fournies par chaque modèle participant, avec leurs poids moyens affichés. Ce tableau présente des prévisions, pas des relevés observés."],
      ["Dernière collecte vérifiable", "Bilan du cycle le plus récent : stations physiques réellement trouvées, modèles journaliers et horaires réellement récupérés, et éventuelles indisponibilités."],
      ["Modèles en validation", "Candidats archivés séparément pour comparaison. Ils n’influencent ni la fusion, ni les poids, ni les compteurs actifs avant décision explicite fondée sur des preuves qualifiées."],
      ["Données insuffisantes / —", "Aucune valeur n’est affichée lorsqu’il manque une trace, plusieurs contributeurs ou des preuves physiques qualifiées. Ce n’est pas une note nulle."],
    ],
  },
  {
    title: "Fiabilité, erreurs et horizons",
    entries: [
      ["Horizon de prévision", "Délai entre le calcul et l’heure ou le jour prévus. L’indice de confiance applique un facteur de 95 pour 0–6 h, 85 pour 6–24 h, 75 pour 1–3 jours, 60 pour 4–7 jours et 45 pour 8–15 jours : plus l’échéance est lointaine, plus l’incertitude compte."],
      ["MAE", "Erreur absolue moyenne : moyenne des écarts, sans signe, entre une prévision et une observation physique alignée. Plus elle est faible, plus la prévision a été proche des observations comparées."],
      ["RMSE", "Racine de l’erreur quadratique moyenne. Les grands écarts sont d’abord mis au carré, donc cette mesure pénalise davantage les erreurs importantes que le MAE."],
      ["Biais", "Tendance moyenne d’un modèle à surestimer ou sous-estimer. Un biais positif signifie que la prévision est trop élevée ; un biais négatif qu’elle est trop basse."],
      ["Taille d’échantillon", "Nombre de paires prévision–observation physiques réellement comparables. Une valeur élevée améliore la maturité statistique, mais ne garantit pas à elle seule qu’un modèle est meilleur dans tous les contextes."],
      ["Seuils de décision", "Le calcul de fiabilité exige au moins 18 comparaisons physiques alignées sur 2 jours. Un classement public demande 30 comparaisons sur 7 jours ; la confiance statistique devient moyenne à 72 comparaisons sur 7 jours et élevée à 180 sur 30 jours."],
    ],
  },
  {
    title: "Stations, corrections et limites locales",
    entries: [
      ["Station physique", "Relevé local issu d’un capteur, distinct d’un modèle. Une station n’est retenue que si sa mesure, sa fraîcheur et ses contrôles de qualité sont suffisants ; une donnée absente, trop ancienne, incohérente ou peu fiable est écartée."],
      ["Fraîcheur, distance et continuité", "La fraîcheur indique l’ancienneté d’un relevé, la distance son éloignement du lieu, et la continuité sa régularité dans le temps. Ces éléments aident à qualifier une station ; ils ne changent pas une prévision en observation réelle."],
      ["Correction de biais", "Ajustement prudent d’une prévision à partir d’un écart historique mesuré. La correction est atténuée à 70 % et ne s’applique que si le biais dépasse 0,1 °C pour la température, 0,2 mm pour la pluie ou 1 km/h pour le vent."],
      ["Dispersion", "Amplitude des différences entre les modèles contributeurs. Elle rend visible le désaccord, mais ne désigne pas le bon modèle et ne remplace pas une vérification par observation physique."],
      ["Source active ou en validation", "Un modèle actif peut contribuer à la fusion. Un modèle en validation est collecté et comparé séparément ; il reste hors fusion jusqu’à une décision explicite fondée sur des preuves qualifiées."],
      ["Maille et microclimat", "Un modèle représente une zone de calcul, pas chaque rue ou jardin. Relief, urbanisation, littoral ou capteurs rares peuvent créer des écarts locaux. L’AI Lab signale cette limite plutôt que d’inventer un ajustement microclimatique non corroboré."],
    ],
  },
  {
    title: "Sources, provenance et cartes",
    entries: [
      ["Prévisions des modèles", "La fusion s’appuie sur les flux des modèles actifs AROME, ARPEGE, ICON, ECMWF, GFS, GEM, UKMET et Open-Meteo lorsqu’ils répondent pour le lieu et le cycle. La trace indique les contributeurs effectivement appliqués ; un flux absent n’est pas remplacé par une valeur inventée."],
      ["Qualité de l’air", "L’indice européen AQI, les PM2.5, PM10, NO₂ et O₃ proviennent du service Air Quality d’Open-Meteo, qui s’appuie notamment sur CAMS. Cette information environnementale reste distincte de la fusion météo."],
      ["Stations locales", "Les stations personnelles proviennent uniquement de Netatmo Weather API après autorisation. Elles sont filtrées selon leur fraîcheur, leur distance et leurs contrôles de qualité avant de pouvoir servir de preuve physique."],
      ["Cartes interactives", "Les cartes et leurs contrôles utilisent Google Maps JavaScript API. La carte fournit le fond et l’interaction ; elle ne calcule pas les prévisions, les éclipses ni la fiabilité."],
      ["Soleil, Lune et phases", "Les heures de lever, coucher et durée du jour sont fournies par les éphémérides quotidiennes disponibles. La phase réelle, l’éclairage, l’azimut, la hauteur et les trajectoires apparentes du Soleil et de la Lune sont calculés pour le lieu actif avec Astronomy Engine."],
      ["Éclipses et essaims", "Les dates et informations de référence sont attribuées événement par événement à NASA, ESA ou Timeanddate. Les liens de la page astronomique permettent de consulter la référence associée."],
      ["Visibilité d’éclipse", "Les cellules bleues et violettes sont calculées localement avec Astronomy Engine. La bande centrale jaune de l’éclipse solaire 2027 est séparément attribuée à la NASA ; aucune grille calculée ne remplace une carte officielle de trajectoire."],
      ["Limites de source", "Les sites ou applications mentionnés à titre comparatif ne sont pas automatiquement des sources actives. Une référence affichée dans l’interface n’est prise en compte par la fusion que si elle apparaît dans sa trace."],
    ],
  },
  {
    title: "Astronomie locale et trajectoires",
    entries: [
      ["Coordonnées topocentriques", "Azimut et hauteur calculés depuis les coordonnées exactes du lieu actif, pour l’instant affiché. L’azimut décrit la direction sur l’horizon ; la hauteur est l’angle au-dessus ou au-dessous de cet horizon."],
      ["Trajectoire apparente", "Parcours du Soleil ou de la Lune dans le ciel au cours de la journée, échantillonné à partir de positions astronomiques réelles. Les segments sous l’horizon ne sont pas présentés comme visibles."],
      ["Phase lunaire géométrique", "Nom de phase déterminé par la géométrie Soleil–Terre–Lune, et non par le seul pourcentage d’éclairage. Ainsi, un croissant croissant n’est pas confondu avec un Premier quartier."],
      ["Éclairage lunaire", "Part apparente du disque lunaire éclairée par le Soleil. Cette valeur est calculée indépendamment du nom de phase ; deux instants peuvent avoir un éclairage proche sans appartenir exactement à la même phase."],
      ["Lever, culmination et coucher", "Le lever et le coucher correspondent au franchissement de l’horizon astronomique. La culmination est le passage le plus haut de l’astre pour le lieu et la journée concernés ; elle ne signifie pas nécessairement un azimut identique partout."],
      ["Horizon astronomique et relief local", "La ligne d’horizon de l’arche correspond à une hauteur de 0°. L’option Relief affiche en plus un profil terrain estimé par direction, obtenu à partir d’altitudes de terrain ; il indique une gêne possible mais ne remplace pas une étude d’observabilité sur site."],
      ["Simulation 24 h", "Le contrôle 24 h lit les échantillons de trajectoire déjà calculés pour permettre une visualisation accélérée, une pause et un déplacement manuel. Il ne constitue pas une nouvelle prévision et revient à la position actuelle une fois arrêté."],
    ],
  },
  {
    title: "Lecture du Dashboard et contexte local",
    entries: [
      ["Phénomène actuel", "Condition estimée pour l’instant présent, par exemple bruine ou averse. Elle est distincte de la tendance officielle de la journée, qui résume un scénario de prévision plus long."],
      ["Prévision officielle", "Prévision issue de la fusion tracée des modèles actifs. Elle reste distincte des observations physiques locales, qui servent à vérifier la cohérence et à alimenter les évaluations quand leur qualité le permet."],
      ["Modes Local et Ultra-local", "Lectures qui privilégient le contexte des stations et la proximité lorsque des relevés physiques validés sont disponibles. Elles n’inventent pas de mesure entre deux stations et ne remplacent pas la prévision officielle."],
      ["Moyenne locale pondérée", "Synthèse des observations locales disponibles, pondérée par des critères tels que distance, fraîcheur et qualité. Elle décrit le contexte observé, pas une température officielle garantie."],
      ["Prochain changement", "Premier créneau futur dont la condition prévue diffère de la condition actuelle. Cette information est une transition de prévision ; elle peut évoluer lors d’une nouvelle collecte."],
    ],
  },
  {
    title: "Historique, comparaisons et preuves",
    entries: [
      ["Prévision contre observation", "Comparaison entre une valeur prévue archivée et un relevé physique aligné dans le temps et le lieu. Sans paire comparable, aucune erreur ni score n’est affiché comme si la validation avait eu lieu."],
      ["Score qualifié", "Résultat de fiabilité produit seulement lorsque les seuils de couverture et de comparaisons physiques sont atteints. Un score absent signifie que les preuves disponibles ne suffisent pas encore."],
      ["Fenêtre d’analyse", "Période sélectionnée pour la comparaison, par exemple 24 heures, 7 jours ou 30 jours. Elle modifie l’échantillon analysé et ne doit pas être interprétée comme une promesse pour les périodes suivantes."],
      ["Écart station–prévision", "Différence entre une synthèse de stations disponible et la prévision officielle sur un même créneau. Il renseigne sur le contexte local ; il ne prouve pas isolément qu’un modèle est mauvais."],
      ["Rayon de recherche", "Distance maximale utilisée pour rechercher des stations autour du lieu. Augmenter le rayon peut fournir plus de relevés mais peut aussi réduire leur représentativité locale."],
    ],
  },
] as const;

function AILabGlossary() {
  return <details className="group rounded-2xl border border-sky-400/25 bg-sky-400/[0.055]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-2"><BookOpen className="h-4 w-4 shrink-0 text-sky-200" /><span className="min-w-0"><span className="block text-sm font-semibold text-slate-100">Lexique, méthode et sources</span><span className="mt-0.5 block text-[10px] leading-relaxed text-slate-400">Comprendre les indicateurs, les poids, les collectes, les sources et les limites de l’AI Lab.</span></span></span>
      <ChevronDown className="h-4 w-4 shrink-0 text-sky-200 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="space-y-4 border-t border-sky-300/15 px-4 py-4">
      <p className="text-[11px] leading-relaxed text-slate-300">Les explications décrivent les calculs affichés pour le lieu et la trace en cours. Elles ne transforment jamais une prévision, une estimation ou une donnée manquante en observation réelle.</p>
      {AI_LAB_GLOSSARY.map((group) => <section key={group.title} className="rounded-xl border border-white/8 bg-black/15 p-3"><h2 className="text-xs font-semibold text-sky-100">{group.title}</h2><dl className="mt-2.5 space-y-2.5">{group.entries.map(([term, definition]) => <div key={term}><dt className="text-[11px] font-semibold text-slate-100">{term}</dt><dd className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{definition}</dd></div>)}</dl></section>)}
      <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3 text-[10px] leading-relaxed text-amber-100"><b>À retenir :</b> un modèle peut être présent dans un tableau sans être « meilleur », un poids n’est pas une probabilité, et un accord entre modèles ne remplace pas une validation par observation physique.</p>
    </div>
  </details>;
}

export default function WeatherAILab() {
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const input = activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined;
  const { data, isLoading, isFetching, error, refetch } = trpc.weather.getAILab.useQuery(input, { staleTime: 60_000, refetchOnWindowFocus: true });
  const stationInput = { lat: activeLocation?.lat, lon: activeLocation?.lon, radiusKm: 20 };
  const { data: stationData, isLoading: stationsLoading, error: stationsError } = trpc.weather.searchStations.useQuery(stationInput, { staleTime: 60_000, refetchOnWindowFocus: true });
  const { data: stationEvidence } = trpc.weather.getEvidenceStatus.useQuery({ lat: activeLocation?.lat, lon: activeLocation?.lon }, { staleTime: 60_000, refetchOnWindowFocus: true });
  const refreshFusion = trpc.weather.refreshManualFusion.useMutation({
    onSuccess: async () => { await refetch(); },
  });

  if (isLoading) return <div className="mx-auto max-w-2xl space-y-3 px-3 py-4">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-800" />)}</div>;
  if (error || !data) return <div className="mx-auto max-w-2xl px-3 py-5"><div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center"><AlertTriangle className="mx-auto h-6 w-6 text-red-300" /><p className="mt-2 text-sm text-red-100">Impossible de charger la traçabilité de cette prévision.</p><button onClick={() => refetch()} className="mt-3 text-xs font-semibold text-red-200 underline">Réessayer</button></div></div>;

  const hasTrace = data.appliedModelWeights.length > 0;
  const hasSnapshot = Boolean(data.calculatedAt);
  const isArchivedSnapshot = data.snapshotStatus === "archived";
  const isLiveSnapshot = data.snapshotStatus === "live";
  const confidenceTone = data.confidenceScore >= 80 ? "text-emerald-300" : data.confidenceScore >= 60 ? "text-amber-300" : "text-red-300";
  const updatedAt = data.calculatedAt ? new Date(data.calculatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : null;
  const snapshotDateLabel = data.snapshotDate ? new Date(`${data.snapshotDate}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;
  const collection = data.latestStationCollection;
  const validationSource = getValidationModelSource(data.sources);
  const fusionParameters = [
    { key: "temperature", label: "Température", tone: "text-orange-200", background: "bg-orange-400/10" },
    { key: "precipitation", label: "Précipitations", tone: "text-blue-200", background: "bg-blue-400/10" },
    { key: "wind", label: "Vent", tone: "text-cyan-200", background: "bg-cyan-400/10" },
  ].map(({ key, label, tone, background }) => ({
    key,
    label,
    tone,
    background,
    sources: (((data.trace as any)?.parameterSources?.[key] ?? []) as any[])
      .filter((source) => source.type === "model" && Number.isFinite(source.finalWeight) && source.finalWeight > 0),
  }));
  const contributors = data.modelIndicator?.contributors ?? [];
  const agreementScore = Math.max(0, Math.round(Math.min(
    100 - data.divergence.tempRange * 8,
    100 - data.divergence.precipRange * 15,
    100 - data.divergence.windRange * 3,
  )));
  const snapshotLabel = isArchivedSnapshot ? "Snapshot archivé" : isLiveSnapshot ? "Calcul direct" : hasSnapshot ? "Snapshot officiel" : "Snapshot indisponible";
  const verifiedModels = Array.from(new Set([...(collection?.dailyCollectedModels ?? []), ...(collection?.hourlyCollectedModels ?? [])]));
  const missingModels = Array.from(new Set([...(collection?.dailyMissingModels ?? []), ...(collection?.hourlyMissingModels ?? [])]));
  const physicalStations = (stationData?.stations ?? []).filter((station) => station.sourceKind === "physical");
  const activePhysicalStations = physicalStations.filter((station) => station.isActive);
  const stationContext = stationData?.groundTruth ?? null;
  const simulationSteps: SimulationStep[] = [
    {
      id: "snapshot",
      title: "Snapshot retenu",
      summary: hasSnapshot ? `${snapshotLabel} du ${snapshotDateLabel ?? "jour disponible"}${updatedAt ? ` à ${updatedAt}` : ""}. C’est la photo enregistrée des données et calculs de cet instant.` : "Aucune photo de calcul (snapshot) n’est disponible pour ce lieu.",
      detail: <p>{isArchivedSnapshot ? "Un snapshot est une photo conservée des modèles reçus, de leurs poids et du résultat calculé. Cette photo sert à expliquer le calcul passé ; elle ne remplace pas la prévision actuelle." : isLiveSnapshot ? "Un snapshot est une photo du calcul consultable maintenant pour cette position. Il n’est pas présenté comme une collecte planifiée archivée." : hasSnapshot ? "Un snapshot est une photo enregistrée du calcul : il permet de relire la même trace que la prévision officielle affichée sur cette page." : "Sans snapshot, aucune étape de pondération ou de résultat n’est reconstituée."}</p>,
      status: hasSnapshot ? "complete" : "waiting",
    },
    {
      id: "collection",
      title: "Collecte des modèles",
      summary: collection ? `${collection.dailyModelCount} modèle(s) quotidien(s) et ${collection.hourlyModelCount} horaire(s) réellement reçus lors du dernier bilan.` : "Aucun bilan de collecte vérifiable n’est disponible pour ce lieu.",
      detail: <div className="space-y-1"><p><span className="font-semibold text-sky-100">Reçus · </span>{verifiedModels.length ? verifiedModels.join(" · ") : "Aucun modèle vérifié dans le bilan disponible."}</p>{missingModels.length ? <p className="text-amber-200"><span className="font-semibold">Indisponibles · </span>{missingModels.join(" · ")}</p> : collection ? <p className="text-emerald-200">Aucun modèle manquant n’est signalé dans ce bilan.</p> : null}</div>,
      status: collection ? missingModels.length ? "partial" : "complete" : "waiting",
    },
    {
      id: "contributors",
      title: "Données exploitables",
      summary: hasTrace ? `${data.modelsUsed} modèle(s) possèdent un poids final positif dans la trace.` : "Aucun contributeur n’est affiché sans trace de poids final.",
      detail: contributors.length ? <div className="space-y-1">{contributors.map((model) => <p key={model.name}><span className="font-semibold text-violet-200">{model.name}</span> · poids moyen {Math.round(model.averageWeight * 100)} %.</p>)}</div> : <p>Les modèles reçus ne sont pas automatiquement considérés comme appliqués : une trace de contribution est requise.</p>,
      status: hasTrace ? "complete" : "waiting",
    },
    {
      id: "regime",
      title: "Régime détecté",
      summary: `${data.regimeLabel} ${data.regimeEmoji} : ${data.regimeDescription}`,
      detail: <p>Ce régime rend visibles les priorités du scénario : température {Math.round(data.weights.temp * 100)} %, précipitations {Math.round(data.weights.precip * 100)} %, vent {Math.round(data.weights.wind * 100)} % et conditions {Math.round(data.weights.condition * 100)} %.</p>,
      status: hasSnapshot ? "complete" : "partial",
    },
    {
      id: "weights",
      title: "Pondération finale",
      summary: fusionParameters.some((parameter) => parameter.sources.length > 0) ? "Les poids sont lus séparément pour chaque paramètre disponible." : "Aucune pondération détaillée n’est disponible pour ce snapshot.",
      detail: fusionParameters.some((parameter) => parameter.sources.length > 0) ? <div className="space-y-1">{fusionParameters.filter((parameter) => parameter.sources.length > 0).map((parameter) => <p key={parameter.key}><span className={`font-semibold ${parameter.tone}`}>{parameter.label}</span> · {parameter.sources.map((source) => `${source.name} ${Math.round(source.finalWeight * 100)} %`).join(" · ")}</p>)}</div> : <p>La page ne déduit pas de poids décoratif lorsqu’une trace détaillée est absente.</p>,
      status: fusionParameters.some((parameter) => parameter.sources.length > 0) ? "complete" : "waiting",
    },
    {
      id: "agreement",
      title: "Accord des modèles",
      summary: hasTrace && data.modelsUsed > 1 ? `Accord lisible ${agreementScore}/100, limité par le paramètre le plus dispersé.` : "L’accord inter-modèles nécessite plusieurs contributeurs réellement tracés.",
      detail: <p>Écarts constatés entre contributeurs : {data.divergence.tempRange} °C en température, {data.divergence.precipRange} mm en précipitations et {data.divergence.windRange} km/h en vent.</p>,
      status: hasTrace && data.modelsUsed > 1 ? "complete" : "partial",
    },
    {
      id: "confidence",
      title: "Confiance et stabilité",
      summary: hasSnapshot ? `Confiance ${Math.round(data.confidenceScore)}/100 · stabilité ${Math.round(data.stabilityScore)}/100.` : "Aucun score n’est présenté sans snapshot de fusion.",
      detail: <p>La confiance combine l’accord, la performance historique qualifiée lorsqu’elle existe, la cohérence des stations physiques lorsqu’elle existe et l’échéance. La stabilité mesure la dispersion des températures et précipitations entre contributeurs.</p>,
      status: hasSnapshot ? "complete" : "waiting",
    },
    {
      id: "official-result",
      title: "Résultat officiel",
      summary: hasSnapshot ? `Prévision fusionnée : ${data.officialForecast.tempMax ?? "—"}° max · ${data.officialForecast.tempMin ?? "—"}° min · ${data.officialForecast.precipitation ?? "—"} mm.` : "Aucun résultat officiel n’est disponible pour ce snapshot.",
      detail: <p>Ce résultat est une prévision fusionnée. Les stations locales présentées ensuite restent des observations de contexte distinctes.</p>,
      status: hasSnapshot ? "complete" : "waiting",
    },
  ];
  const stationSteps: SimulationStep[] = [
    {
      id: "station-search",
      title: "Recherche locale",
      summary: stationData ? `${stationData.totalFound} station(s) trouvée(s) dans un rayon de ${stationData.radiusKm} km.` : stationsError ? "Les stations locales ne sont pas disponibles pour cette consultation." : "Recherche des stations locales en cours.",
      detail: <p>La recherche lit les stations réellement retournées autour du lieu actif. Une station trouvée n’est pas automatiquement retenue comme observation physique ni comme preuve de fiabilité.</p>,
      status: stationData ? "complete" : stationsError ? "partial" : "waiting",
    },
    {
      id: "station-filter",
      title: "Filtre physique",
      summary: stationData ? `${physicalStations.length} station(s) physique(s) identifiée(s), dont ${activePhysicalStations.length} active(s).` : "Aucun filtre n’est appliqué sans résultat de recherche.",
      detail: <div className="space-y-1"><p>Le filtre conserve uniquement les observations de type physique, puis applique leur statut d’activité et les contrôles de qualité disponibles.</p>{stationData?.physicalStationDiagnostics.exclusionReasons.length ? <p className="text-amber-200"><span className="font-semibold">Motifs relevés · </span>{stationData.physicalStationDiagnostics.exclusionReasons.join(" · ")}</p> : stationData ? <p className="text-emerald-200">Aucun motif d’exclusion n’est remonté dans le diagnostic courant.</p> : null}</div>,
      status: activePhysicalStations.length > 0 ? "complete" : physicalStations.length > 0 ? "partial" : "waiting",
    },
    {
      id: "station-synthesis",
      title: "Synthèse locale",
      summary: stationContext?.stationCount ? `${stationContext.stationCount} station(s) participe(nt) au contexte local courant.` : "Aucune synthèse locale pondérée n’est disponible.",
      detail: stationContext?.stationCount ? <div className="space-y-1"><p>Température locale : {stationContext.temperature == null ? "indisponible" : `${Number(stationContext.temperature).toFixed(1)}°`} · confiance locale : {stationContext.confidenceScore == null ? "indisponible" : `${Math.round(stationContext.confidenceScore)}/100`}.</p><p>Stations retenues : {stationContext.stationsUsed.length ? stationContext.stationsUsed.map((station) => `${station.name} ${Math.round(station.weight * 100)} %`).join(" · ") : "aucune"}.</p></div> : <p>Sans station retenue, aucune moyenne locale n’est fabriquée et la prévision officielle reste distincte.</p>,
      status: stationContext?.stationCount ? "complete" : activePhysicalStations.length ? "partial" : "waiting",
    },
    {
      id: "station-evidence",
      title: "Preuve qualifiée",
      summary: stationEvidence?.date ? `${stationEvidence.coverageHours}/${stationEvidence.requiredCoverageHours} heures physiques pour le ${stationEvidence.date} ; ${stationEvidence.qualifiedScoreCount} score(s) qualifié(s).` : "Aucune journée physique archivée ne permet encore de qualifier une preuve.",
      detail: stationEvidence?.date ? <div className="space-y-1"><p>{stationEvidence.isEligible ? "La couverture de 18 heures physiques est atteinte pour cette journée." : "La couverture de 18 heures physiques n’est pas encore atteinte pour cette journée."}</p><p>Un score qualifié reste distinct de la prévision : il compare une prévision archivée à une observation physique alignée.</p></div> : <p>La branche ne qualifie pas une preuve à partir d’une station vue en direct ; une couverture archivée est nécessaire.</p>,
      status: stationEvidence?.isEligible && stationEvidence.qualifiedScoreCount > 0 ? "complete" : stationEvidence?.date ? "partial" : "waiting",
    },
  ];

  return <main className="weather-page-sky min-h-screen mx-auto max-w-2xl space-y-3 px-3 py-3 pb-24 sm:px-6 sm:py-6" style={pageSkyStyle}>
    <header className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15"><FlaskConical className="h-5 w-5 text-blue-300" /></div><div className="min-w-0"><h1 className="text-base font-bold text-slate-100">AI Lab · traçabilité</h1><p className="truncate text-xs text-slate-500">{activeLocation?.name ?? "Lieu actif"}{updatedAt ? isArchivedSnapshot ? ` · dernière fusion du ${snapshotDateLabel} à ${updatedAt}` : ` · calcul à ${updatedAt}` : " · snapshot indisponible"}</p></div></div>
      <div className="flex shrink-0 gap-1"><button onClick={() => refetch()} disabled={isFetching || refreshFusion.isPending} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-blue-400/30 bg-blue-400/10 px-2.5 text-xs font-semibold text-blue-200 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />Actualiser</button>{activeLocation?.favoriteId ? <button onClick={() => refreshFusion.mutate({ favoriteId: activeLocation.favoriteId! })} disabled={refreshFusion.isPending || isFetching} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-xs font-semibold text-emerald-100 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshFusion.isPending ? "animate-spin" : ""}`} />{refreshFusion.isPending ? "Fusion…" : "Relancer"}</button> : null}</div>
    </header>

    {refreshFusion.isError && <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-100">La relance n’a pas abouti : {refreshFusion.error.message}</p>}
    {refreshFusion.data?.status === "cooldown" && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Une fusion vient déjà d’être calculée. Réessayez dans environ {refreshFusion.data.retryAfterSeconds} s.</p>}
    {refreshFusion.data?.status === "refreshed" && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">Fusion relancée avec {refreshFusion.data.modelCount} modèles ; la trace vient d’être actualisée.</p>}

    <AILabGlossary />

    <FusionSimulation steps={simulationSteps} snapshotLabel={snapshotLabel} />

    <StationSimulation steps={stationSteps} />

    <section className="grid grid-cols-3 gap-2"><Stat label="Confiance prévision" value={hasSnapshot ? `${Math.round(data.confidenceScore)}%` : "—"} tone={hasSnapshot ? confidenceTone : "text-slate-500"} help={<IndicatorHelp title="Confiance prévision"><p>Valeur affichée : <strong>{hasSnapshot ? `${Math.round(data.confidenceScore)}/100` : "indisponible"}</strong>.</p><HelpDetail label="Formule">40 % accord des modèles, 30 % performance historique qualifiée si disponible, 20 % cohérence de stations physiques si disponible et 10 % échéance.</HelpDetail><HelpDetail label="Accord observé">Écarts du snapshot : {data.divergence.tempRange} °C en température, {data.divergence.precipRange} mm en pluie et {data.divergence.windRange} km/h en vent ; le score d’accord le plus contraignant lisible ici est {agreementScore}/100.</HelpDetail><HelpDetail label="Échéance">Le calcul de ce snapshot utilise la tranche 6–24 h, notée 85/100.</HelpDetail><p className="border-t border-slate-700/80 pt-2 text-slate-400">Lorsque seules certaines preuves existent, les poids disponibles sont renormalisés. L’absence de preuve historique ou physique peut plafonner le score afin de ne pas simuler une précision non mesurée.</p></IndicatorHelp>} /><Stat label="Stabilité modèles" value={hasSnapshot ? `${Math.round(data.stabilityScore)}%` : "—"} tone={hasSnapshot ? "text-sky-300" : "text-slate-500"} help={<IndicatorHelp title="Stabilité modèles"><p>Valeur affichée : <strong>{hasSnapshot ? `${Math.round(data.stabilityScore)}/100` : "indisponible"}</strong>.</p><HelpDetail label="Formule">60 % de stabilité des températures maximales et 40 % de stabilité des précipitations. Chaque partie diminue lorsque la dispersion entre modèles augmente.</HelpDetail><HelpDetail label="Pourquoi ce résultat">Dans ce snapshot, l’écart entre contributeurs est de {data.divergence.tempRange} °C pour la température et de {data.divergence.precipRange} mm pour la pluie.</HelpDetail><p className="border-t border-slate-700/80 pt-2 text-slate-400">Cet indice mesure l’accord interne des modèles, pas la certitude que la météo sera calme ou exacte.</p></IndicatorHelp>} /><Stat label="Modèles appliqués" value={hasTrace ? String(data.modelsUsed) : "—"} tone={hasTrace ? "text-violet-300" : "text-slate-500"} help={<IndicatorHelp title="Modèles appliqués"><p>Valeur affichée : <strong>{hasTrace ? `${data.modelsUsed} contributeur${data.modelsUsed > 1 ? "s" : ""}` : "trace indisponible"}</strong>.</p><HelpDetail label="Règle">Le compteur retient uniquement les modèles ayant un poids final strictement positif pour la température, la pluie ou le vent dans la trace de fusion.</HelpDetail>{contributors.length > 0 ? <div className="border-t border-slate-700/80 pt-2"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-200/80">Contributeurs de ce snapshot</p>{contributors.map((model) => <p key={model.name} className="flex justify-between gap-3"><span className="truncate">{model.name}</span><span className="shrink-0 text-violet-200">poids moyen {Math.round(model.averageWeight * 100)} %</span></p>)}</div> : <p className="border-t border-slate-700/80 pt-2 text-slate-400">Aucun modèle n’est présenté sans trace de poids réellement appliquée.</p>}<p className="text-slate-400">Un modèle candidat ou seulement archivé ne compte pas tant qu’il ne contribue pas à la fusion.</p></IndicatorHelp>} /></section>

    <section className="rounded-2xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(5,150,105,0.10),rgba(13,19,29,0.98)_48%)] p-4" aria-labelledby="local-stations-title"><div className="flex items-start gap-2"><MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><h2 id="local-stations-title" className="text-sm font-semibold text-slate-100">Résultat final · contexte des stations locales</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Observations physiques distinctes de la prévision fusionnée. Elles décrivent le contexte local et peuvent servir de preuve lorsque leur qualité le permet.</p></div></div>{stationsLoading ? <div className="mt-3 h-28 animate-pulse rounded-xl bg-slate-800/80" /> : stationsError ? <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-amber-100">Les stations locales ne sont pas disponibles pour le moment. La prévision officielle reste affichée séparément, sans observation de remplacement.</p> : <><div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-xl border border-emerald-400/15 bg-black/20 px-2 py-2"><p className="text-[9px] uppercase tracking-wide text-slate-500">Actives</p><p className="mt-0.5 text-sm font-bold text-emerald-200">{activePhysicalStations.length}</p></div><div className="rounded-xl border border-emerald-400/15 bg-black/20 px-2 py-2"><p className="text-[9px] uppercase tracking-wide text-slate-500">Température locale</p><p className="mt-0.5 text-sm font-bold text-emerald-200">{stationContext?.temperature == null ? "—" : `${Number(stationContext.temperature).toFixed(1)}°`}</p></div><div className="rounded-xl border border-emerald-400/15 bg-black/20 px-2 py-2"><p className="text-[9px] uppercase tracking-wide text-slate-500">Confiance locale</p><p className="mt-0.5 text-sm font-bold text-emerald-200">{stationContext?.confidenceScore == null ? "—" : `${Math.round(stationContext.confidenceScore)}/100`}</p></div></div>{activePhysicalStations.length ? <div className="mt-3 space-y-2">{activePhysicalStations.slice(0, 6).map((station) => { const contribution = stationContext?.stationsUsed.find((item) => item.stationId === station.stationId); return <article key={station.stationId} className="rounded-xl border border-emerald-400/15 bg-black/15 px-3 py-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-100">{station.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{station.source} · {stationFreshnessLabel(station.updatedAt)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${contribution ? "bg-emerald-400/10 text-emerald-200" : "bg-slate-700/60 text-slate-300"}`}>{contribution ? "Contexte retenu" : "Observation active"}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]"><span className="rounded-md bg-slate-900/70 px-1.5 py-1 text-slate-300">{Number(station.distanceKm).toFixed(1)} km</span><span className="rounded-md bg-slate-900/70 px-1.5 py-1 text-slate-300">T° {station.temperature == null ? "—" : `${Number(station.temperature).toFixed(1)}°`}</span><span className="rounded-md bg-slate-900/70 px-1.5 py-1 text-slate-300">{contribution ? `part ${Math.round(contribution.weight * 100)} %` : "sans part locale"}</span></div></article>; })}</div> : <p className="mt-3 rounded-xl border border-dashed border-emerald-400/20 p-3 text-[11px] leading-relaxed text-slate-400">Aucune station physique locale active n’est disponible dans le rayon interrogé. Aucun résultat local n’est donc substitué à la prévision officielle.</p>}<p className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/30 p-2.5 text-[10px] leading-relaxed text-slate-400"><SlidersHorizontal className="mr-1 inline h-3.5 w-3.5 text-emerald-300" />La synthèse locale repose sur distance, fraîcheur et qualité des mesures disponibles. Elle reste un contexte observé : elle ne transforme pas la prévision fusionnée en relevé réel.</p></>}</section>

    {validationSource && <section className="rounded-2xl border border-dashed border-violet-400/35 bg-violet-400/[0.045] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><h2 className="text-sm font-semibold text-slate-100">Modèles en validation</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Collectés séparément à 05h00 lorsqu’ils sont disponibles. Ils n’influencent ni la prévision officielle, ni les poids, ni les compteurs des modèles actifs.</p></div></div></div><WeatherStatusBadge compact className="w-[104px]" tone="lab" label="Validation" value="Hors fusion" description="Ces modèles sont archivés pour une validation historique. Ils restent hors fusion et n’influencent ni la prévision officielle ni ses poids." /></div><div className="mt-3 flex flex-wrap gap-1.5">{validationSource.models.map((model) => <WeatherStatusBadge key={model} compact tone="lab" label={model} description="Ce modèle candidat est archivé pour la validation historique. Il reste hors fusion officielle tant qu’un gain de fiabilité n’est pas mesuré." />)}</div></section>}

    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-semibold text-slate-100">Régime de prévision dominant</h2></div><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Cette synthèse décrit le scénario dominant du créneau horaire. Le Dashboard indique séparément le phénomène immédiat, comme une bruine ou une averse.</p><div className="mt-3 flex items-start gap-3"><span className="text-3xl">{data.regimeEmoji}</span><div><p className="text-base font-bold text-slate-100">{data.regimeLabel}</p><p className="mt-0.5 text-xs text-slate-400">{data.regimeDescription}</p><p className="mt-1 text-[10px] text-blue-300">{data.regimeSourceLabel}{data.regimeSourceUpdatedAt ? ` · source à ${new Date(data.regimeSourceUpdatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}` : ""}</p></div></div><div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px]"><span className="rounded-lg bg-orange-400/10 py-1.5 text-orange-200">T° {Math.round(data.weights.temp * 100)}%</span><span className="rounded-lg bg-blue-400/10 py-1.5 text-blue-200">Pluie {Math.round(data.weights.precip * 100)}%</span><span className="rounded-lg bg-cyan-400/10 py-1.5 text-cyan-200">Vent {Math.round(data.weights.wind * 100)}%</span><span className="rounded-lg bg-slate-400/10 py-1.5 text-slate-200">Nuages {Math.round(data.weights.condition * 100)}%</span></div></section>

    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-300" /><h2 className="text-sm font-semibold text-slate-100">Accord des modèles appliqués</h2></div>{hasTrace && data.modelDetails.length > 1 ? <><div className="mt-3 space-y-3"><Divergence label="Température" value={data.divergence.tempRange} max={10} unit="°C" color="bg-orange-400" /><Divergence label="Précipitations" value={data.divergence.precipRange} max={20} unit="mm" color="bg-blue-400" /><Divergence label="Vent" value={data.divergence.windRange} max={40} unit="km/h" color="bg-cyan-400" /></div><p className="mt-3 text-[11px] text-slate-500">Écart calculé entre les contributeurs de la trace actuelle.</p></> : <p className="mt-3 text-xs text-slate-500">Données insuffisantes : aucun écart inter-modèles n’est affiché sans plusieurs contributeurs tracés.</p>}</section>

    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-semibold text-slate-100">Prévisions quotidiennes des contributeurs</h2></div>{data.modelDetails.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[380px] text-xs"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="px-1 py-2 text-left font-medium">Modèle</th><th className="px-1 py-2 text-right font-medium">Poids</th><th className="px-1 py-2 text-right font-medium">Max</th><th className="px-1 py-2 text-right font-medium">Min</th><th className="px-1 py-2 text-right font-medium">Vent</th></tr></thead><tbody>{data.modelDetails.map((model) => <tr key={model.name} className="border-b border-slate-800/70 last:border-0"><td className="px-1 py-2 font-semibold text-slate-200">{model.label}</td><td className="px-1 py-2 text-right text-blue-300">{model.averageWeight == null ? "—" : `${Math.round(model.averageWeight * 100)}%`}</td><td className="px-1 py-2 text-right text-orange-200">{model.tempMax == null ? "—" : `${Number(model.tempMax).toFixed(1)}°`}</td><td className="px-1 py-2 text-right text-sky-200">{model.tempMin == null ? "—" : `${Number(model.tempMin).toFixed(1)}°`}</td><td className="px-1 py-2 text-right text-slate-300">{model.windSpeed == null ? "—" : `${Number(model.windSpeed).toFixed(1)}`}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-xs text-slate-500">Aucune prévision quotidienne persistée pour ce lieu.</p>}</section>

    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-emerald-300" /><h2 className="text-sm font-semibold text-slate-100">Dernière collecte vérifiable</h2></div><Link href="/ranking" className="text-xs font-semibold text-blue-300">Fiabilité →</Link></div>{collection ? <><div className="mt-3 grid grid-cols-3 gap-2"><Stat label="Stations physiques" value={String(collection.physicalStationCount)} tone="text-emerald-300" /><Stat label="Modèles jour" value={String(collection.dailyModelCount)} tone="text-blue-300" /><Stat label="Modèles horaires" value={String(collection.hourlyModelCount)} tone="text-cyan-300" /></div><div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-black/15 px-3 py-2.5 text-[11px]"><p className="leading-relaxed text-slate-300"><span className="font-semibold text-blue-200">Jour · </span>{collection.dailyCollectedModels.length ? collection.dailyCollectedModels.join(" · ") : "Aucun modèle journalier vérifié."}</p><p className="leading-relaxed text-slate-300"><span className="font-semibold text-cyan-200">Horaire · </span>{collection.hourlyCollectedModels.length ? collection.hourlyCollectedModels.join(" · ") : "Aucun modèle horaire vérifié."}</p>{collection.dailyMissingModels.length > 0 || collection.hourlyMissingModels.length > 0 ? <p className="leading-relaxed text-amber-200">Indisponibles · {Array.from(new Set([...collection.dailyMissingModels, ...collection.hourlyMissingModels])).join(" · ")}</p> : null}</div><p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400"><MapPin className="h-3 w-3" />Rayon {collection.radiusKm} km · état {collection.status} · {new Date(collection.collectedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</p></> : <p className="mt-3 text-xs text-slate-500">Aucun bilan de collecte n’est disponible pour ce lieu. Les stations ne sont pas présentées comme actives.</p>}</section>
  </main>;
}
