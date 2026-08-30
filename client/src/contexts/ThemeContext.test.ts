import { describe, expect, it } from "vitest";
import { parseStoredTheme } from "./ThemeContext";

describe("parseStoredTheme", () => {
  it("accepte uniquement les thèmes pris en charge", () => {
    expect(parseStoredTheme("dark", "light")).toBe("dark");
    expect(parseStoredTheme("light", "dark")).toBe("light");
  });

  it("revient au thème par défaut pour une valeur absente ou invalide", () => {
    expect(parseStoredTheme(null, "dark")).toBe("dark");
    expect(parseStoredTheme("system", "light")).toBe("light");
    expect(parseStoredTheme("", "dark")).toBe("dark");
  });
});
