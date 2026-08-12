/** Classes critiques de la ligne de température. Elles maintiennent une colonne
 * de droite non réductible pour les extrêmes sur les écrans étroits. */
export const dashboardTemperatureLayout = {
  content: "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 sm:gap-x-5",
  currentValue: "whitespace-nowrap text-[clamp(3.25rem,16vw,4.5rem)] sm:text-8xl font-bold leading-none tracking-tight",
  extremes: "flex shrink-0 flex-col gap-1.5 pt-1 text-right",
  extremeValue: "whitespace-nowrap text-xl sm:text-3xl font-bold",
} as const;
