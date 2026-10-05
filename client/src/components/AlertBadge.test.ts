import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/MeteoIcon", () => ({ MeteoIcon: () => null }));
vi.stubGlobal("React", React);
import { AlertBadge, isDangerousRegime } from "./AlertBadge";

describe("AlertBadge — preuve de pluie verglaçante", () => {
  it("ne déclenche pas d’alerte verglas en l’absence de preuve de phase", () => {
    expect(isDangerousRegime("freezing_rain")).toBe(false);
    expect(
      renderToStaticMarkup(
        createElement(AlertBadge, {
          regimeId: "freezing_rain",
          confidence: 100,
        })
      )
    ).toBe("");
    expect(isDangerousRegime("freezing_rain", true)).toBe(true);
    expect(
      renderToStaticMarkup(
        createElement(AlertBadge, {
          regimeId: "freezing_rain",
          confidence: 100,
          freezingRainPhaseConfirmed: true,
        })
      )
    ).toContain("Alerte Verglas");
  });

  it("ne transforme pas le régime hivernal à phase incertaine en alerte dangereuse", () => {
    expect(isDangerousRegime("winter_precipitation_uncertain")).toBe(false);
    expect(
      renderToStaticMarkup(
        createElement(AlertBadge, {
          regimeId: "winter_precipitation_uncertain",
          confidence: 100,
        })
      )
    ).toBe("");
  });

  it("ne traite pas une vague de froid ponctuelle comme une alerte", () => {
    expect(isDangerousRegime("cold_wave")).toBe(false);
    expect(
      renderToStaticMarkup(
        createElement(AlertBadge, {
          regimeId: "cold_wave",
          confidence: 100,
        })
      )
    ).toBe("");
  });
});
