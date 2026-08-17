import { AttemptRepository } from "@app-factory/kernel";
import type Database from "better-sqlite3";

import type { FactoryActivityPort } from "./quota-governor.js";

/**
 * Real `FactoryActivityPort`: "any running attempt" is read straight off the
 * kernel's own `attempts` table via `AttemptRepository.list({ scope: "active" })`
 * -- the same non-terminal-state query (`state NOT IN ('succeeded', 'failed',
 * 'cancelled')`) the daemon's `attempt.list` command already exposes over
 * the wire. Deliberately coarse (any non-terminal attempt counts as
 * "activity", not just ones actually mid-execution this instant): the
 * `QuotaGovernorPort` this feeds is a simple priority stub, not a scheduler.
 */
export function createKernelAttemptActivityPort(database: Database.Database): FactoryActivityPort {
  const attempts = new AttemptRepository(database);
  return {
    hasRunningAttempt(): boolean {
      const page = attempts.list({ scope: "active", projectId: null, after: null, limit: 1 });
      return page.attempts.length > 0;
    },
  };
}
