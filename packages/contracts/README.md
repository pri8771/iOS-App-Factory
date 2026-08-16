# Contracts

Versioned runtime schemas, checked-in portable JSON Schemas, and generated
TypeScript types for trust boundaries. The V1 local command protocol carries a
transport `requestId` separately from the durable business `commandId`.

The project lifecycle vocabulary (six stages, seven typed gates, pure
advance/regression rules) lives in `src/v1/lifecycle.ts`; see
[ADR 0005](../../docs/architecture/0005-lifecycle-reconciliation.md).
