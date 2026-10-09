import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { securityHeaders } from "./security";

describe("securityHeaders", () => {
  it("autorise l’API de géocodage utilisée par la recherche de villes", () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: vi.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
      removeHeader: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    securityHeaders({} as Request, response, next);

    expect(headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self' https://geocoding-api.open-meteo.com"
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
