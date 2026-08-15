import { describe, expect, it } from "vitest";

import {
  LEGAL_ATTEMPT_STATE_TRANSITIONS,
  TERMINAL_ATTEMPT_STATES,
  isTerminalAttemptState,
} from "../src/state-machine.js";

describe("isTerminalAttemptState", () => {
  it("matches exactly the states with no legal outgoing transition", () => {
    for (const [state, transitions] of Object.entries(LEGAL_ATTEMPT_STATE_TRANSITIONS)) {
      expect(isTerminalAttemptState(state)).toBe(transitions.length === 0);
    }
  });

  it("agrees with the fixed terminal-state list", () => {
    for (const state of TERMINAL_ATTEMPT_STATES) {
      expect(isTerminalAttemptState(state)).toBe(true);
    }
    for (const state of ["queued", "running", "paused", "blocked"]) {
      expect(isTerminalAttemptState(state)).toBe(false);
    }
  });

  it("fails closed on a value that is not a legal attempt state", () => {
    expect(() => isTerminalAttemptState("done")).toThrow();
    expect(() => isTerminalAttemptState(null)).toThrow();
    expect(() => isTerminalAttemptState(undefined)).toThrow();
  });
});
