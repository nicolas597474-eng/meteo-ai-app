export type WeightSnapshotOption = { id: number };

export function resolveWeightComparisonSelection(
  history: readonly WeightSnapshotOption[],
  selectedBefore: number | null,
  selectedAfter: number | null,
) {
  const contains = (id: number | null) => id != null && history.some((snapshot) => snapshot.id === id);
  const afterId = contains(selectedAfter) ? selectedAfter : history[0]?.id ?? null;
  const beforeId = contains(selectedBefore) && selectedBefore !== afterId
    ? selectedBefore
    : history.find((snapshot) => snapshot.id !== afterId)?.id ?? null;

  return {
    beforeId,
    afterId,
    canCompare: beforeId != null && afterId != null && beforeId !== afterId,
  };
}
