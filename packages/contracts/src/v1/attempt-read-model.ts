import { z } from "zod";

import { ExecutionAttemptV1Schema } from "./execution.js";
import {
  AttemptIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
} from "./primitives.js";

export const MAX_ATTEMPT_LIST_ITEMS_V1 = 100 as const;

export const AttemptListScopeV1Schema = z.enum(["active", "all"]);
export type AttemptListScopeV1 = z.infer<typeof AttemptListScopeV1Schema>;

export const AttemptListCursorV1Schema = z.strictObject({
  updatedAt: IsoInstantSchema,
  attemptId: AttemptIdSchema,
});
export type AttemptListCursorV1 = z.infer<typeof AttemptListCursorV1Schema>;

export const AttemptListQueryV1Schema = z.strictObject({
  scope: AttemptListScopeV1Schema,
  projectId: ProjectIdSchema.nullable(),
  after: AttemptListCursorV1Schema.nullable(),
  limit: z.number().int().min(1).max(MAX_ATTEMPT_LIST_ITEMS_V1),
});
export type AttemptListQueryV1 = z.infer<typeof AttemptListQueryV1Schema>;

/**
 * A bounded navigation row. The canonical attempt remains nested so clients do
 * not mistake a flattened subset for authoritative attempt state.
 */
export const AttemptListItemV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  projectId: ProjectIdSchema,
  title: z.string().min(1).max(200),
  attempt: ExecutionAttemptV1Schema,
});
export type AttemptListItemV1 = z.infer<typeof AttemptListItemV1Schema>;

export const AttemptListPageV1Schema = z
  .strictObject({
    attempts: z.array(AttemptListItemV1Schema).max(MAX_ATTEMPT_LIST_ITEMS_V1),
    nextAfter: AttemptListCursorV1Schema.nullable(),
    hasMore: z.boolean(),
  })
  .superRefine((page, context) => {
    if (page.hasMore !== (page.nextAfter !== null)) {
      context.addIssue({
        code: "custom",
        path: ["nextAfter"],
        message: "nextAfter must be present exactly when hasMore is true",
      });
    }
    if (page.hasMore && page.attempts.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["attempts"],
        message: "a page with more results must contain a cursor source row",
      });
    }
    const identities = page.attempts.map(({ attempt }) => attempt.attemptId);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        path: ["attempts"],
        message: "attempt IDs must be unique within a page",
      });
    }
    for (let index = 1; index < page.attempts.length; index += 1) {
      const previous = page.attempts[index - 1]?.attempt;
      const current = page.attempts[index]?.attempt;
      if (
        previous !== undefined &&
        current !== undefined &&
        (previous.updatedAt < current.updatedAt ||
          (previous.updatedAt === current.updatedAt && previous.attemptId <= current.attemptId))
      ) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index],
          message: "attempts must be ordered by updatedAt and attemptId descending",
        });
        break;
      }
    }
    if (page.nextAfter !== null) {
      const finalAttempt = page.attempts.at(-1)?.attempt;
      if (
        finalAttempt === undefined ||
        finalAttempt.updatedAt !== page.nextAfter.updatedAt ||
        finalAttempt.attemptId !== page.nextAfter.attemptId
      ) {
        context.addIssue({
          code: "custom",
          path: ["nextAfter"],
          message: "nextAfter must identify the final returned attempt",
        });
      }
    }
  });
export type AttemptListPageV1 = z.infer<typeof AttemptListPageV1Schema>;
