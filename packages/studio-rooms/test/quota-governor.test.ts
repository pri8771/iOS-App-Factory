import { RoomProviderSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import { PriorityQuotaGovernor, unlimitedQuotaGovernor } from "../src/index.js";
import { FakeClock } from "./helpers.js";

const OLLAMA = RoomProviderSchema.parse("ollama");

describe("PriorityQuotaGovernor", () => {
  it("lets factory use the whole window while rooms are capped at their share", () => {
    const clock = new FakeClock();
    const governor = new PriorityQuotaGovernor({
      windowMs: 60_000,
      capacityTokens: 10_000,
      roomsShareFraction: 0.4,
      clock,
    });
    const rooms1 = governor.reserve({
      priority: "rooms",
      provider: OLLAMA,
      tokens: 3_000,
      now: clock.now(),
    });
    expect(rooms1.granted).toBe(true);
    const rooms2 = governor.reserve({
      priority: "rooms",
      provider: OLLAMA,
      tokens: 2_000,
      now: clock.now(),
    });
    // 3000 + 2000 > 4000 rooms ceiling -> throttled with the instant the blocking charge expires.
    expect(rooms2).toEqual({
      granted: false,
      retryAt: new Date(Date.parse("2026-08-16T10:01:00.000Z")),
    });
    const factory = governor.reserve({
      priority: "factory",
      provider: OLLAMA,
      tokens: 6_500,
      now: clock.now(),
    });
    expect(factory.granted).toBe(true);
    expect(governor.usage()).toBe(9_500);
    // Factory now blocked above capacity too.
    expect(
      governor.reserve({ priority: "factory", provider: OLLAMA, tokens: 1_000, now: clock.now() })
        .granted,
    ).toBe(false);
  });

  it("settles reservations down to actual usage and releases unused ones", () => {
    const clock = new FakeClock();
    const governor = new PriorityQuotaGovernor({
      windowMs: 60_000,
      capacityTokens: 1_000,
      roomsShareFraction: 1,
      clock,
    });
    const first = governor.reserve({
      priority: "rooms",
      provider: OLLAMA,
      tokens: 800,
      now: clock.now(),
    });
    if (!first.granted) throw new Error("expected grant");
    expect(
      governor.reserve({ priority: "rooms", provider: OLLAMA, tokens: 300, now: clock.now() })
        .granted,
    ).toBe(false);
    first.reservation.settle(100);
    expect(governor.usage()).toBe(100);
    // Settling twice, or settling above the reservation, cannot inflate usage.
    first.reservation.settle(5_000);
    expect(governor.usage()).toBe(100);
    const second = governor.reserve({
      priority: "rooms",
      provider: OLLAMA,
      tokens: 900,
      now: clock.now(),
    });
    if (!second.granted) throw new Error("expected grant");
    second.reservation.release();
    expect(governor.usage()).toBe(100);
    clock.advance(60_001);
    expect(governor.usage()).toBe(0);
  });

  it("reports a retryAt of one window when a request can never fit the class ceiling", () => {
    const clock = new FakeClock();
    const governor = new PriorityQuotaGovernor({
      windowMs: 1_000,
      capacityTokens: 100,
      roomsShareFraction: 0.5,
      clock,
    });
    expect(
      governor.reserve({ priority: "rooms", provider: OLLAMA, tokens: 60, now: clock.now() }),
    ).toEqual({
      granted: false,
      retryAt: new Date(Date.parse("2026-08-16T10:00:01.000Z")),
    });
  });

  it("validates its configuration and rejects zero-token reservations", () => {
    const clock = new FakeClock();
    expect(
      () =>
        new PriorityQuotaGovernor({ windowMs: 0, capacityTokens: 1, roomsShareFraction: 1, clock }),
    ).toThrow(TypeError);
    expect(
      () =>
        new PriorityQuotaGovernor({ windowMs: 1, capacityTokens: 1, roomsShareFraction: 0, clock }),
    ).toThrow(TypeError);
    const governor = new PriorityQuotaGovernor({
      windowMs: 1,
      capacityTokens: 1,
      roomsShareFraction: 1,
      clock,
    });
    expect(() =>
      governor.reserve({ priority: "rooms", provider: OLLAMA, tokens: 0, now: clock.now() }),
    ).toThrow(TypeError);
    expect(
      unlimitedQuotaGovernor.reserve({
        priority: "rooms",
        provider: OLLAMA,
        tokens: 1,
        now: clock.now(),
      }).granted,
    ).toBe(true);
  });
});
