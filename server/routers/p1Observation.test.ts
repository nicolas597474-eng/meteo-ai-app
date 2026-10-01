import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

const closeP1ObservationWindow = vi.hoisted(() => vi.fn());
vi.mock("../weatherP1Closure", async importOriginal => {
  const original = await importOriginal<typeof import("../weatherP1Closure")>();
  return { ...original, closeP1ObservationWindow };
});

import { p1ObservationRouter } from "./p1Observation";

function caller(role: "admin" | "user" | null) {
  const ctx = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: role ? { id: 5, role } : null,
  } as TrpcContext;
  return p1ObservationRouter.createCaller(ctx);
}

afterEach(() => closeP1ObservationWindow.mockReset());

describe("p1Observation.close access control", () => {
  it("rejects unauthenticated users and non-admins before calling the closure service", async () => {
    await expect(
      caller(null).close({ lat: 50.756, lon: 2.52 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("user").close({ lat: 50.756, lon: 2.52 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(closeP1ObservationWindow).not.toHaveBeenCalled();
  });

  it("forwards the derived location and authenticated admin id only for an admin", async () => {
    closeP1ObservationWindow.mockResolvedValue({
      closure: { id: 1 },
      repeated: false,
    });
    await caller("admin").close({ lat: 50.756, lon: 2.52 });
    expect(closeP1ObservationWindow).toHaveBeenCalledWith({
      locationKey: "50.756_2.52",
      validatedByUserId: 5,
    });
  });

  it("exposes unmet business criteria as a precondition rejection", async () => {
    const { P1ObservationClosureRejectedError } = await import(
      "../weatherP1Closure"
    );
    closeP1ObservationWindow.mockRejectedValue(
      new P1ObservationClosureRejectedError(["7/7 jours requis"])
    );
    await expect(
      caller("admin").close({ lat: 50.756, lon: 2.52 })
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      caller("admin").close({ lat: 50.756, lon: 2.52 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
