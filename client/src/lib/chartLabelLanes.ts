export function getLabelAboveCurveY(curveY: number, tempZoneTop: number, offset = 10): number {
  return Math.max(tempZoneTop + 16, curveY - offset);
}

export function getLabelBelowCurveY(
  curveY: number,
  tempZoneTop: number,
  windZoneTop: number,
  offset = 14,
  windClearance = 24,
): number {
  return Math.min(Math.max(curveY + offset, tempZoneTop + 32), windZoneTop - windClearance);
}

export function getFeltLabelY(windZoneTop: number): number {
  return windZoneTop - 8;
}
