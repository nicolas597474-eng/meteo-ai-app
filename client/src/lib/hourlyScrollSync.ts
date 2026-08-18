export function clampHourIndex(index: number, hourCount: number) {
  return Math.max(0, Math.min(Math.max(hourCount - 1, 0), index));
}

export function getNearestHourIndex(scrollLeft: number, hourStride: number, hourCount: number) {
  if (hourCount <= 1 || hourStride <= 0) return 0;
  return clampHourIndex(Math.round(scrollLeft / hourStride), hourCount);
}

export function getHourScrollLeft(hourIndex: number, hourStride: number, hourCount: number) {
  return clampHourIndex(hourIndex, hourCount) * Math.max(hourStride, 0);
}
