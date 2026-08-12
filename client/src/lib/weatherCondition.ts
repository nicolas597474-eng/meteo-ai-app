export type HourlyConditionPoint = {
  hour: string;
  condition?: string | null;
};

function normalizeCondition(condition?: string | null) {
  return condition?.trim().toLocaleLowerCase("fr-FR") ?? "";
}

/** Returns the first future hourly slot whose condition differs from now. */
export function findNextConditionChange<T extends HourlyConditionPoint>(
  hours: T[],
  currentHour: string,
): T | null {
  const currentIndex = hours.findIndex((point) => point.hour === currentHour);
  const startIndex = currentIndex >= 0
    ? currentIndex
    : hours.findIndex((point) => point.hour >= currentHour);

  if (startIndex < 0) return null;

  const currentCondition = normalizeCondition(hours[startIndex]?.condition);
  if (!currentCondition) return null;

  for (let index = startIndex + 1; index < hours.length; index += 1) {
    const candidate = hours[index];
    if (normalizeCondition(candidate.condition) && normalizeCondition(candidate.condition) !== currentCondition) {
      return candidate;
    }
  }
  return null;
}
