import { describe, expect, it } from "vitest";
import { conditionFromWeatherValues } from "./weatherConditionLabels";

describe("conditionFromWeatherValues", () => {
  it("utilise les mêmes seuils de nébulosité que le régime étendu", () => {
    expect(conditionFromWeatherValues(0, 0)).toBe("Ensoleillé");
    expect(conditionFromWeatherValues(0, 36)).toBe("Peu nuageux");
    expect(conditionFromWeatherValues(0, 60)).toBe("Partiellement nuageux");
    expect(conditionFromWeatherValues(0, 90)).toBe("Ciel couvert");
  });

  it("conserve la priorité aux précipitations", () => {
    expect(conditionFromWeatherValues(2, 36)).toBe("Averses");
  });
});
