/** Libellé français partagé pour les conditions déduites des paramètres météo.
 * Les seuils de nébulosité sont volontairement identiques à detectExtendedRegime.
 */
export function conditionFromWeatherValues(precipitation: number | null | undefined, cloudCover: number | null | undefined): string {
  const precipitationValue = precipitation ?? 0;
  const cloudValue = cloudCover ?? 0;

  if (precipitationValue > 5) return "Pluie forte";
  if (precipitationValue > 1) return "Averses";
  if (precipitationValue > 0.2) return "Pluie légère";
  if (cloudValue > 80) return "Ciel couvert";
  if (cloudValue > 50) return "Partiellement nuageux";
  if (cloudValue > 20) return "Peu nuageux";
  return "Ensoleillé";
}
