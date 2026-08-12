/**
 * Catégorisation française unique du ciel. Les seuils sont identiques au moteur
 * de régimes : >80 couvert, >50 partiellement nuageux, >20 peu nuageux.
 */
export function cloudCoverLabel(cloudCover: number | null | undefined): string {
  const cloudValue = cloudCover ?? 0;
  if (cloudValue > 80) return "Ciel couvert";
  if (cloudValue > 50) return "Partiellement nuageux";
  if (cloudValue > 20) return "Peu nuageux";
  return "Ensoleillé";
}

export function conditionFromWeatherValues(precipitation: number | null | undefined, cloudCover: number | null | undefined): string {
  const precipitationValue = precipitation ?? 0;
  if (precipitationValue > 5) return "Pluie forte";
  if (precipitationValue > 1) return "Averses";
  if (precipitationValue > 0.2) return "Pluie légère";
  return cloudCoverLabel(cloudCover);
}
