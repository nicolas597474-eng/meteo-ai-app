import { describe, expect, it } from "vitest";
import { getTemperatureTone } from "./chartTemperatureTone";

describe("getTemperatureTone", () => {
  it("préserve la couleur normale à 35 °C et à 0 °C", () => {
    expect(getTemperatureTone(35, "maximum").status).toBe("normal");
    expect(getTemperatureTone(0, "minimum").status).toBe("normal");
  });

  it("bascule vers la couleur chaude uniquement au-dessus de 35 °C", () => {
    const tone = getTemperatureTone(35.1, "hourly");
    expect(tone).toMatchObject({ status: "heat", stroke: "#f43f5e", label: "#fecdd3" });
  });

  it("bascule vers la couleur de gel uniquement sous 0 °C", () => {
    const tone = getTemperatureTone(-0.1, "minimum");
    expect(tone).toMatchObject({ status: "frost", stroke: "#22d3ee", label: "#cffafe" });
  });
});
