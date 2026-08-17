import { RoomProviderSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import { createFactoryAwareQuotaGovernor, type FactoryActivityPort } from "../src/index.js";

function activityPort(hasRunningAttempt: boolean): FactoryActivityPort {
  return { hasRunningAttempt: () => hasRunningAttempt };
}

const PROVIDER = RoomProviderSchema.parse("codex");
const NOW = new Date("2026-08-16T10:00:00.000Z");

describe("createFactoryAwareQuotaGovernor", () => {
  it("always grants factory-priority reservations, regardless of activity", () => {
    const governor = createFactoryAwareQuotaGovernor({ activity: activityPort(true) });
    const decision = governor.reserve({
      priority: "factory",
      provider: PROVIDER,
      tokens: 1_000,
      now: NOW,
    });
    expect(decision.granted).toBe(true);
  });

  it("grants room-priority reservations when the factory has no running attempt", () => {
    const governor = createFactoryAwareQuotaGovernor({ activity: activityPort(false) });
    const decision = governor.reserve({
      priority: "rooms",
      provider: PROVIDER,
      tokens: 1_000,
      now: NOW,
    });
    expect(decision.granted).toBe(true);
  });

  it("throttles room-priority reservations whenever the factory has any running attempt", () => {
    const governor = createFactoryAwareQuotaGovernor({
      activity: activityPort(true),
      throttleMs: 45_000,
    });
    const decision = governor.reserve({
      priority: "rooms",
      provider: PROVIDER,
      tokens: 1_000,
      now: NOW,
    });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.retryAt.getTime()).toBe(NOW.getTime() + 45_000);
    }
  });

  it("re-checks activity on every reservation (not cached at construction)", () => {
    let running = false;
    const governor = createFactoryAwareQuotaGovernor({
      activity: { hasRunningAttempt: () => running },
    });
    const first = governor.reserve({
      priority: "rooms",
      provider: PROVIDER,
      tokens: 100,
      now: NOW,
    });
    expect(first.granted).toBe(true);
    running = true;
    const second = governor.reserve({
      priority: "rooms",
      provider: PROVIDER,
      tokens: 100,
      now: NOW,
    });
    expect(second.granted).toBe(false);
  });

  it("settle/release on a granted reservation are inert no-ops", () => {
    const governor = createFactoryAwareQuotaGovernor({ activity: activityPort(false) });
    const decision = governor.reserve({
      priority: "rooms",
      provider: PROVIDER,
      tokens: 500,
      now: NOW,
    });
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(() => decision.reservation.settle(200)).not.toThrow();
      expect(() => decision.reservation.release()).not.toThrow();
    }
  });

  it("rejects an out-of-range throttleMs", () => {
    expect(() =>
      createFactoryAwareQuotaGovernor({ activity: activityPort(true), throttleMs: 0 }),
    ).toThrow(TypeError);
  });
});
