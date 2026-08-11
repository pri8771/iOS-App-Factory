import {
  parseCredentialReference,
  type AdapterPreflightReportV1,
  type CredentialReferenceV1,
  type EffectReconciliationInput,
  type EffectReconciliationResult,
  type EffectSendResult,
  type ExternalProviderAdapter,
} from "@app-factory/adapter-sdk";
import {
  ExternalResourceV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  type ExternalEffectV1,
  type ExternalResourceV1,
  type IsoInstant,
} from "@app-factory/contracts";
import {
  canonicalJson,
  digestCanonical,
  parseJiraIssueSnapshot,
  parseJiraProjectSnapshot,
  type CorrelationQueryV1,
  type JiraIssueSnapshotV1,
  type JiraProjectSnapshotV1,
  type ProviderResourceObservationV1,
  type ReadOnlyCorrelationPort,
} from "@app-factory/work-tracking-integrations";

import {
  createProviderHttpRequest,
  headerValue,
  performProviderHttpRequest,
  providerBaseUrl,
  providerUrl,
  type BoundedProviderHttpTransport,
  type ProviderHttpHeaderV1,
  type ProviderHttpMethod,
  type ValidatedProviderHttpResponse,
} from "./http.js";
import {
  readVerifiedEffectPayloadJson,
  requireEffectPayloadReader,
  type EffectPayloadReader,
} from "./payload.js";
import {
  array,
  bool,
  boundedIdentifier,
  enumeration,
  exact,
  fail,
  integer,
  isoInstant,
  issueKey,
  jsonBytes,
  operationMarker,
  parseJsonBytes,
  projectKey,
  record,
  safeUrl,
  sha256Canonical,
  text,
  zeroBytes,
} from "./validation.js";

const ADAPTER_ID = "jira.cloud-rest";
const ADAPTER_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RECONCILE_DELAY_MS = 30_000;
const MAX_PAGES = 20;
const PAGE_SIZE = 50;
const PROPERTY_KEY = "com.app-factory.operation-marker";
const MARKER_PREFIX = "App Factory operation: ";

export type JiraProviderClock = Readonly<{ now(): Date }>;

export type JiraReadObserverOptions = Readonly<{
  transport: BoundedProviderHttpTransport;
  siteUrl: string;
  siteId: string;
  credentialReference: CredentialReferenceV1;
  projectLeadAccountId: string;
  projectTemplateKey: string;
  clock?: JiraProviderClock;
  requestTimeoutMs?: number;
  reconcileDelayMs?: number;
}>;

export type JiraCloudHttpAdapterOptions = JiraReadObserverOptions &
  Readonly<{ payloadReader: EffectPayloadReader }>;

export type JiraReadObserver = Readonly<{
  observeProject(projectKey: string, signal: AbortSignal): Promise<JiraProjectSnapshotV1>;
  observeIssue(issueKey: string, signal: AbortSignal): Promise<JiraIssueSnapshotV1>;
}> &
  ReadOnlyCorrelationPort;

type JiraContext = Readonly<{
  transport: BoundedProviderHttpTransport;
  base: URL;
  siteId: string;
  credentialReference: CredentialReferenceV1;
  projectLeadAccountId: string;
  projectTemplateKey: string;
  clock: JiraProviderClock;
  requestTimeoutMs: number;
  reconcileDelayMs: number;
}>;

type JiraMutationContext = JiraContext & Readonly<{ payloadReader: EffectPayloadReader }>;

type JiraHttpResult = Readonly<{
  status: number;
  etag: string | null;
  value: unknown;
}>;

type MarkerProperty = Readonly<{
  schemaVersion: 1;
  marker: string;
  resourceType: "jira.issue";
  projectId: string;
  logicalKey: string;
  payloadDigest: ExternalEffectV1["payloadDigest"];
  expectedFieldsDigest: ExternalEffectV1["payloadDigest"];
}>;

type ParsedIssue = Readonly<{
  id: string;
  key: string;
  self: string;
  version: number;
  projectKey: string;
  issueType: "epic" | "story" | "task" | "bug";
  summary: string;
  description: string | null;
  status: string;
  labels: readonly string[];
  updatedAt: string;
  parentKey: string | null;
  observedFieldsDigest: ExternalEffectV1["payloadDigest"];
  marker: MarkerProperty;
}>;

function boundedMilliseconds(value: number, label: string, maximum = 120_000): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > maximum) {
    fail(`${label} must be an integer from 100 through ${String(maximum)}`);
  }
  return value;
}

function createContext(options: JiraReadObserverOptions): JiraContext {
  return {
    transport: options.transport,
    base: providerBaseUrl(options.siteUrl, "Jira site URL"),
    siteId: boundedIdentifier(options.siteId, "Jira site ID", 160),
    credentialReference: parseCredentialReference(options.credentialReference),
    projectLeadAccountId: text(options.projectLeadAccountId, "Jira project lead account ID", 160),
    projectTemplateKey: text(options.projectTemplateKey, "Jira project template key", 300),
    clock: options.clock ?? { now: () => new Date() },
    requestTimeoutMs: boundedMilliseconds(
      options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "Jira request timeout",
    ),
    reconcileDelayMs: boundedMilliseconds(
      options.reconcileDelayMs ?? DEFAULT_RECONCILE_DELAY_MS,
      "Jira reconciliation delay",
      24 * 60 * 60 * 1_000,
    ),
  };
}

function createMutationContext(options: JiraCloudHttpAdapterOptions): JiraMutationContext {
  return {
    ...createContext(options),
    payloadReader: requireEffectPayloadReader(options.payloadReader),
  };
}

function deadline(context: JiraContext): IsoInstant {
  return IsoInstantSchema.parse(
    new Date(context.clock.now().getTime() + context.requestTimeoutMs).toISOString(),
  );
}

function later(context: JiraContext): IsoInstant {
  return IsoInstantSchema.parse(
    new Date(context.clock.now().getTime() + context.reconcileDelayMs).toISOString(),
  );
}

function credentialsMatch(left: CredentialReferenceV1 | null, right: CredentialReferenceV1) {
  return (
    left !== null &&
    left.kind === right.kind &&
    left.schemaVersion === right.schemaVersion &&
    left.service === right.service &&
    left.account === right.account
  );
}

function requestHeaders(hasBody: boolean): readonly ProviderHttpHeaderV1[] {
  return [
    { name: "accept", value: "application/json" },
    ...(hasBody ? [{ name: "content-type", value: "application/json" }] : []),
  ];
}

async function request(
  context: JiraContext,
  input: Readonly<{
    method: ProviderHttpMethod;
    path: string;
    query?: URLSearchParams;
    body?: unknown;
    signal: AbortSignal;
    deadline: IsoInstant;
  }>,
): Promise<JiraHttpResult> {
  const body = input.body === undefined ? null : jsonBytes(input.body);
  let response: ValidatedProviderHttpResponse | undefined;
  try {
    const outbound = createProviderHttpRequest({
      method: input.method,
      url: providerUrl(context.base, input.path, input.query),
      headers: requestHeaders(body !== null),
      body,
      credentialReference: context.credentialReference,
      credentialOrigin: context.base.origin,
      deadline: input.deadline,
      signal: input.signal,
    });
    response = await performProviderHttpRequest(context.transport, outbound);
    const value =
      response.body.byteLength === 0 ? null : parseJsonBytes(response.body, "Jira HTTP response");
    return { status: response.status, etag: headerValue(response, "etag"), value };
  } finally {
    if (body !== null) zeroBytes(body);
    if (response !== undefined) zeroBytes(response.body);
  }
}

function detail(value: Readonly<Record<string, unknown>>): Uint8Array {
  return jsonBytes({ schemaVersion: 1, ...value });
}

function rejected(code: string, retryable = false): EffectSendResult {
  return {
    kind: "rejected",
    code: NamespacedCodeSchema.parse(code),
    retryable,
    detail: detail({ kind: "rejected", code }),
  };
}

function ambiguous(context: JiraContext, code: string, correlationKey: string): EffectSendResult {
  return {
    kind: "ambiguous",
    correlationKey,
    reconcileAfter: later(context),
    detail: detail({ kind: "ambiguous", code }),
  };
}

function markerProperty(
  effect: ExternalEffectV1,
  projectId: string,
  logicalKey: string,
  expectedFieldsDigest: ExternalEffectV1["payloadDigest"],
): MarkerProperty {
  return {
    schemaVersion: 1,
    marker: operationMarker(effect.operationMarker),
    resourceType: "jira.issue",
    projectId: boundedIdentifier(projectId, "project ID", 80),
    logicalKey: boundedIdentifier(logicalKey, "Jira logical key", 80),
    payloadDigest: effect.payloadDigest,
    expectedFieldsDigest,
  };
}

function parseMarkerProperty(value: unknown): MarkerProperty {
  const source = record(value, "Jira operation marker property");
  exact(
    source,
    [
      "schemaVersion",
      "marker",
      "resourceType",
      "projectId",
      "logicalKey",
      "payloadDigest",
      "expectedFieldsDigest",
    ],
    "Jira operation marker property",
  );
  if (source.schemaVersion !== 1 || source.resourceType !== "jira.issue") {
    fail("Jira operation marker property schema is unsupported");
  }
  return {
    schemaVersion: 1,
    marker: operationMarker(source.marker),
    resourceType: "jira.issue",
    projectId: boundedIdentifier(source.projectId, "project ID", 80),
    logicalKey: boundedIdentifier(source.logicalKey, "Jira logical key", 80),
    payloadDigest: Sha256DigestSchema.parse(source.payloadDigest),
    expectedFieldsDigest: Sha256DigestSchema.parse(source.expectedFieldsDigest),
  };
}

function parseProjectPayload(value: unknown) {
  const source = record(value, "Jira project payload");
  exact(
    source,
    ["projectId", "projectSlug", "displayName", "key", "name", "projectType"],
    "Jira project payload",
  );
  if (source.projectType !== "software") fail("Jira project type is unsupported");
  return {
    projectId: boundedIdentifier(source.projectId, "project ID", 80),
    projectSlug: text(source.projectSlug, "project slug", 80),
    displayName: text(source.displayName, "project display name", 160),
    key: projectKey(source.key),
    name: text(source.name, "Jira project name", 160),
  };
}

function parseEpicPayload(value: unknown) {
  const source = record(value, "Jira epic payload");
  exact(
    source,
    ["projectId", "projectKey", "logicalId", "summary", "description"],
    "Jira epic payload",
  );
  return {
    projectId: boundedIdentifier(source.projectId, "project ID", 80),
    projectKey: projectKey(source.projectKey),
    logicalId: boundedIdentifier(source.logicalId, "epic logical ID", 80),
    summary: text(source.summary, "Jira epic summary", 240),
    description: text(source.description, "Jira epic description", 10_000),
  };
}

function parseIssuePayload(value: unknown) {
  const source = record(value, "Jira issue payload");
  exact(
    source,
    [
      "projectId",
      "projectKey",
      "epicLogicalId",
      "logicalId",
      "summary",
      "description",
      "issueType",
      "estimatePoints",
      "acceptanceCriteria",
      "dependsOnLogicalIds",
    ],
    "Jira issue payload",
  );
  const acceptanceCriteria = array(source.acceptanceCriteria, "acceptance criteria", 8).map(
    (item) => text(item, "acceptance criterion", 500),
  );
  const dependsOn = array(source.dependsOnLogicalIds, "Jira dependencies", 40).map((item) =>
    boundedIdentifier(item, "Jira dependency logical ID", 80),
  );
  if (new Set(acceptanceCriteria).size !== acceptanceCriteria.length) {
    fail("Jira acceptance criteria must be unique");
  }
  if (new Set(dependsOn).size !== dependsOn.length) fail("Jira dependencies must be unique");
  return {
    projectId: boundedIdentifier(source.projectId, "project ID", 80),
    projectKey: projectKey(source.projectKey),
    epicLogicalId: boundedIdentifier(source.epicLogicalId, "epic logical ID", 80),
    logicalId: boundedIdentifier(source.logicalId, "issue logical ID", 80),
    summary: text(source.summary, "Jira issue summary", 240),
    description: text(source.description, "Jira issue description", 10_000),
    issueType: enumeration(source.issueType, ["story", "task", "bug"] as const, "Jira issue type"),
    estimatePoints: integer(source.estimatePoints, "Jira estimate", 1, 3),
    acceptanceCriteria,
    dependsOn,
  };
}

type ParsedProjectPayload = ReturnType<typeof parseProjectPayload>;
type ParsedEpicPayload = ReturnType<typeof parseEpicPayload>;
type ParsedTaskPayload = ReturnType<typeof parseIssuePayload>;
type ParsedIssueIntentPayload = ParsedEpicPayload | ParsedTaskPayload;

async function readAuthoritativePayload(
  context: JiraMutationContext,
  effect: ExternalEffectV1,
  signal: AbortSignal,
  operationDeadline: IsoInstant,
  label: string,
): Promise<unknown> {
  return await readVerifiedEffectPayloadJson(context.payloadReader, {
    payloadDigest: effect.payloadDigest,
    deadline: operationDeadline,
    signal,
    label,
  });
}

function validateProjectPayloadIntent(
  context: JiraContext,
  effect: ExternalEffectV1,
  payload: ParsedProjectPayload,
): ExternalEffectV1["payloadDigest"] {
  if (
    effect.action !== "jira.project.ensure" ||
    effect.target.resourceType !== "jira.project" ||
    effect.target.resourceKey !== `${context.siteId}:${payload.key}` ||
    payload.projectId !== effect.subject.projectId ||
    !effect.operationMarker.startsWith("app-factory:v1:jira:project.ensure:")
  ) {
    fail("Jira project payload does not match the effect intent");
  }
  return projectExpectation({
    key: payload.key,
    name: payload.name,
    projectTypeKey: "software",
    displayName: payload.displayName,
  });
}

function validateIssuePayloadIntent(
  context: JiraContext,
  effect: ExternalEffectV1,
  payload: ParsedIssueIntentPayload,
  epic: boolean,
): void {
  const actionName = epic ? "epic.ensure" : "issue.ensure";
  const expectedKey = `${context.siteId}:${payload.projectKey}:${epic ? "epic" : "issue"}:${payload.logicalId}`;
  if (
    effect.action !== (epic ? "jira.epic.ensure" : "jira.issue.ensure") ||
    effect.target.resourceType !== "jira.issue" ||
    effect.target.resourceKey !== expectedKey ||
    payload.projectId !== effect.subject.projectId ||
    !effect.operationMarker.startsWith(`app-factory:v1:jira:${actionName}:`)
  ) {
    fail("Jira issue payload does not match the effect intent");
  }
}

function markerDescription(description: string, marker: string): string {
  return `${description}\n\n${MARKER_PREFIX}${marker}`;
}

function adfDescription(input: {
  description: string;
  estimatePoints?: number;
  acceptanceCriteria?: readonly string[];
}): Readonly<Record<string, unknown>> {
  const content: Readonly<Record<string, unknown>>[] = [
    {
      type: "paragraph",
      content: [{ type: "text", text: input.description }],
    },
  ];
  if (input.estimatePoints !== undefined) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: `Estimate: ${String(input.estimatePoints)} points` }],
    });
  }
  if (input.acceptanceCriteria !== undefined) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Acceptance criteria" }],
    });
    content.push({
      type: "bulletList",
      content: input.acceptanceCriteria.map((criterion) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: criterion }],
          },
        ],
      })),
    });
  }
  return { type: "doc", version: 1, content };
}

function issueFieldsExpectation(input: {
  summary: string;
  issueType: "epic" | "story" | "task" | "bug";
  description: unknown;
  parentKey: string | null;
  hasFactoryLabel: boolean;
}) {
  return sha256Canonical({
    summary: input.summary,
    issueType: input.issueType,
    description: input.description,
    parentKey: input.parentKey,
    hasFactoryLabel: input.hasFactoryLabel,
  });
}

function expectedIssueFields(
  effect: ExternalEffectV1,
  payload: ParsedIssueIntentPayload,
  epic: boolean,
  parentKey: string | null,
) {
  const task = epic ? null : (payload as ParsedTaskPayload);
  const descriptionInput =
    task === null
      ? { description: payload.description }
      : {
          description: markerDescription(task.description, effect.operationMarker),
          estimatePoints: task.estimatePoints,
          acceptanceCriteria: task.acceptanceCriteria,
        };
  const issueType = epic ? "epic" : (task?.issueType ?? "task");
  const description = adfDescription(descriptionInput);
  return {
    issueType,
    description,
    expectedFieldsDigest: issueFieldsExpectation({
      summary: payload.summary,
      issueType,
      description,
      parentKey,
      hasFactoryLabel: true,
    }),
  };
}

function parseCreateIdentity(value: unknown, label: string) {
  const source = record(value, label);
  exact(source, ["id", "key", "self"], label);
  return {
    id: boundedIdentifier(source.id, `${label} ID`, 160),
    key: text(source.key, `${label} key`, 32),
    self: safeUrl(source.self, `${label} URL`),
  };
}

function providerRevision(etag: string | null, body: unknown): string {
  return etag ?? digestCanonical(body);
}

function resourceFor(
  effect: ExternalEffectV1,
  identity: Readonly<{ id: string; url: string | null }>,
  revision: string,
  observedAt: IsoInstant,
): ExternalResourceV1 {
  return ExternalResourceV1Schema.parse({
    schemaVersion: 1,
    effectId: effect.effectId,
    target: effect.target,
    providerResourceId: identity.id,
    providerUrl: identity.url,
    providerVersion: revision,
    observedDigest: sha256Canonical({ identity, marker: effect.operationMarker, revision }),
    observedAt,
  });
}

function projectExpectation(value: {
  key: string;
  name: string;
  projectTypeKey: "software";
  displayName: string;
}) {
  return sha256Canonical(value);
}

function projectDescription(
  displayName: string,
  effect: ExternalEffectV1,
  expectedFieldsDigest: ExternalEffectV1["payloadDigest"],
): string {
  return `${displayName}\n${MARKER_PREFIX}${effect.operationMarker}; intent: ${effect.payloadDigest}; expected: ${expectedFieldsDigest}`;
}

function parseProjectMetadata(description: string) {
  const separator = description.lastIndexOf("\n");
  if (separator < 1) fail("Jira project metadata is missing");
  const displayName = description.slice(0, separator);
  const metadata = description.slice(separator + 1);
  const match = /^App Factory operation: ([^;]+); intent: ([^;]+); expected: ([^;]+)$/.exec(
    metadata,
  );
  if (match === null) fail("Jira project metadata is malformed");
  return {
    displayName: text(displayName, "Jira project display name", 160),
    marker: operationMarker(match[1]),
    payloadDigest: Sha256DigestSchema.parse(match[2]),
    expectedFieldsDigest: Sha256DigestSchema.parse(match[3]),
  };
}

function parseProjectResponse(value: unknown) {
  const source = record(value, "Jira project response");
  exact(
    source,
    ["id", "key", "name", "projectTypeKey", "self", "description"],
    "Jira project response",
  );
  if (source.projectTypeKey !== "software") fail("Jira project response has the wrong type");
  return {
    id: boundedIdentifier(source.id, "Jira project ID", 160),
    key: projectKey(source.key),
    name: text(source.name, "Jira project name", 160),
    self: safeUrl(source.self, "Jira project URL"),
    description: text(source.description, "Jira project description", 1_000),
    projectTypeKey: "software" as const,
  };
}

function currentProjectMetadata(project: ReturnType<typeof parseProjectResponse>) {
  const metadata = parseProjectMetadata(project.description);
  if (
    metadata.expectedFieldsDigest !==
    projectExpectation({
      key: project.key,
      name: project.name,
      projectTypeKey: project.projectTypeKey,
      displayName: metadata.displayName,
    })
  ) {
    fail("Jira project fields drifted from their bound metadata");
  }
  return metadata;
}

function parseIssueType(value: unknown): "epic" | "story" | "task" | "bug" {
  const source = record(value, "Jira issue type");
  exact(source, ["name"], "Jira issue type");
  const name = text(source.name, "Jira issue type name", 80).toLowerCase();
  return enumeration(name, ["epic", "story", "task", "bug"] as const, "Jira issue type");
}

function parseIssue(value: unknown): ParsedIssue {
  const source = record(value, "Jira issue response");
  exact(source, ["id", "key", "self", "version", "fields", "properties"], "Jira issue response");
  const fields = record(source.fields, "Jira issue fields");
  exact(
    fields,
    ["project", "summary", "description", "status", "labels", "updated", "issuetype", "parent"],
    "Jira issue fields",
  );
  const project = record(fields.project, "Jira issue project");
  exact(project, ["key"], "Jira issue project");
  const status = record(fields.status, "Jira issue status");
  exact(status, ["name"], "Jira issue status");
  const properties = record(source.properties, "Jira issue properties");
  exact(properties, [PROPERTY_KEY], "Jira issue properties");
  const labels = array(fields.labels, "Jira issue labels", 100).map((item) =>
    boundedIdentifier(item, "Jira issue label", 255),
  );
  if (new Set(labels).size !== labels.length) fail("Jira issue labels must be unique");
  let parentKey: string | null = null;
  if (fields.parent !== null) {
    const parent = record(fields.parent, "Jira issue parent");
    exact(parent, ["key"], "Jira issue parent");
    parentKey = issueKey(parent.key);
  }
  const parsedIssueType = parseIssueType(fields.issuetype);
  const summary = text(fields.summary, "Jira issue summary", 240);
  const marker = parseMarkerProperty(properties[PROPERTY_KEY]);
  return {
    id: boundedIdentifier(source.id, "Jira issue ID", 160),
    key: issueKey(source.key),
    self: safeUrl(source.self, "Jira issue URL"),
    version: integer(source.version, "Jira issue version", 1),
    projectKey: projectKey(project.key),
    issueType: parsedIssueType,
    summary,
    description: fields.description === null ? null : canonicalJson(fields.description).trimEnd(),
    status: text(status.name, "Jira issue status", 80),
    labels: [...labels].sort(),
    updatedAt: isoInstant(fields.updated, "Jira issue update time"),
    parentKey,
    observedFieldsDigest: issueFieldsExpectation({
      summary,
      issueType: parsedIssueType,
      description: fields.description,
      parentKey,
      hasFactoryLabel: labels.includes("app-factory"),
    }),
    marker,
  };
}

function markerJql(project: string, field: "marker" | "logicalKey", value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `project = ${projectKey(project)} AND issue.property[${PROPERTY_KEY}].${field} = "${escaped}" ORDER BY key ASC`;
}

async function searchIssues(
  context: JiraContext,
  input: Readonly<{
    projectKey: string;
    field: "marker" | "logicalKey";
    value: string;
    signal: AbortSignal;
    deadline: IsoInstant;
  }>,
): Promise<Readonly<{ issues: readonly ParsedIssue[]; revision: string }>> {
  const issues: ParsedIssue[] = [];
  let startAt = 0;
  let combinedRevision = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      jql: markerJql(input.projectKey, input.field, input.value),
      startAt: String(startAt),
      maxResults: String(PAGE_SIZE),
      fields: "project,summary,description,status,labels,updated,issuetype,parent",
      properties: PROPERTY_KEY,
    });
    const result = await request(context, {
      method: "GET",
      path: "/rest/api/3/search",
      query,
      signal: input.signal,
      deadline: input.deadline,
    });
    if (result.status !== 200) fail("Jira issue search failed");
    const source = record(result.value, "Jira issue search response");
    exact(source, ["startAt", "maxResults", "total", "issues"], "Jira issue search response");
    const observedStart = integer(source.startAt, "Jira search start", 0);
    const maximum = integer(source.maxResults, "Jira search page size", 1, PAGE_SIZE);
    const total = integer(source.total, "Jira search total", 0, MAX_PAGES * PAGE_SIZE);
    if (observedStart !== startAt) fail("Jira search returned the wrong page");
    const pageIssues = array(source.issues, "Jira search issues", maximum).map(parseIssue);
    issues.push(...pageIssues);
    combinedRevision += `${providerRevision(result.etag, source)}\n`;
    startAt += pageIssues.length;
    if (startAt >= total) {
      return {
        issues,
        revision: digestCanonical({ pages: combinedRevision, issueCount: issues.length }),
      };
    }
    if (pageIssues.length === 0) fail("Jira pagination stopped before the declared total");
  }
  fail("Jira issue search exceeded the pagination limit");
}

async function requireLogicalIssue(
  context: JiraContext,
  project: string,
  logicalKey: string,
  signal: AbortSignal,
  operationDeadline: IsoInstant,
): Promise<ParsedIssue> {
  const found = await searchIssues(context, {
    projectKey: project,
    field: "logicalKey",
    value: logicalKey,
    signal,
    deadline: operationDeadline,
  });
  if (found.issues.length !== 1) fail("Jira logical issue lookup was not unique");
  return found.issues[0] as ParsedIssue;
}

function parentMatchesTaskIntent(parent: ParsedIssue, task: ParsedTaskPayload): boolean {
  return (
    parent.issueType === "epic" &&
    parent.projectKey === task.projectKey &&
    parent.marker.marker.startsWith("app-factory:v1:jira:epic.ensure:") &&
    parent.marker.logicalKey === task.epicLogicalId &&
    parent.marker.projectId === task.projectId &&
    parent.marker.expectedFieldsDigest === parent.observedFieldsDigest
  );
}

async function sendProject(
  context: JiraMutationContext,
  input: Parameters<NonNullable<ExternalProviderAdapter["send"]>>[0],
): Promise<EffectSendResult> {
  let payload: ParsedProjectPayload;
  try {
    payload = parseProjectPayload(
      await readAuthoritativePayload(
        context,
        input.effect,
        input.signal,
        input.deadline,
        "Jira project effect payload",
      ),
    );
  } catch {
    return rejected("jira.payload-authority.unavailable");
  }
  let expectedFieldsDigest: ExternalEffectV1["payloadDigest"];
  try {
    expectedFieldsDigest = validateProjectPayloadIntent(context, input.effect, payload);
  } catch {
    return rejected("jira.intent.mismatch");
  }
  const description = projectDescription(payload.displayName, input.effect, expectedFieldsDigest);
  let result: JiraHttpResult;
  try {
    await input.assertActive();
    result = await request(context, {
      method: "POST",
      path: "/rest/api/3/project",
      body: {
        key: payload.key,
        name: payload.name,
        projectTypeKey: "software",
        projectTemplateKey: context.projectTemplateKey,
        description,
        leadAccountId: context.projectLeadAccountId,
        assigneeType: "PROJECT_LEAD",
      },
      signal: input.signal,
      deadline: input.deadline,
    });
  } catch {
    return ambiguous(
      context,
      "jira.project.transport-or-response-unknown",
      input.effect.operationMarker,
    );
  }
  if ([400, 401, 403].includes(result.status)) return rejected("jira.project.rejected");
  if (result.status === 429) return rejected("jira.rate-limited", true);
  if (result.status !== 201) {
    return ambiguous(
      context,
      "jira.project.provider-outcome-unknown",
      input.effect.operationMarker,
    );
  }
  try {
    const created = parseCreateIdentity(result.value, "Jira project creation response");
    if (created.key !== payload.key) fail("Jira created the wrong project key");
    const revision = providerRevision(result.etag, result.value);
    const observedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
    return {
      kind: "observed",
      correlationKey: input.effect.operationMarker,
      resource: resourceFor(
        input.effect,
        { id: created.id, url: created.self },
        revision,
        observedAt,
      ),
      detail: detail({
        kind: "observed",
        resourceId: created.id,
        revision,
        marker: input.effect.operationMarker,
      }),
    };
  } catch {
    return ambiguous(
      context,
      "jira.project.success-response-invalid",
      input.effect.operationMarker,
    );
  }
}

async function sendIssue(
  context: JiraMutationContext,
  input: Parameters<NonNullable<ExternalProviderAdapter["send"]>>[0],
): Promise<EffectSendResult> {
  const epic = input.effect.action === "jira.epic.ensure";
  let parsed: ParsedIssueIntentPayload;
  try {
    const value = await readAuthoritativePayload(
      context,
      input.effect,
      input.signal,
      input.deadline,
      epic ? "Jira epic effect payload" : "Jira issue effect payload",
    );
    parsed = epic ? parseEpicPayload(value) : parseIssuePayload(value);
  } catch {
    return rejected("jira.payload-authority.unavailable");
  }
  try {
    validateIssuePayloadIntent(context, input.effect, parsed, epic);
  } catch {
    return rejected("jira.intent.mismatch");
  }
  let parent: ParsedIssue | null = null;
  if (!epic) {
    try {
      parent = await requireLogicalIssue(
        context,
        parsed.projectKey,
        (parsed as ParsedTaskPayload).epicLogicalId,
        input.signal,
        input.deadline,
      );
      if (!parentMatchesTaskIntent(parent, parsed as ParsedTaskPayload)) {
        return rejected("jira.issue.parent-intent-mismatch");
      }
    } catch {
      return rejected("jira.issue.parent-unavailable");
    }
  }
  const parentKey = parent?.key ?? null;
  const expected = expectedIssueFields(input.effect, parsed, epic, parentKey);
  const property = markerProperty(
    input.effect,
    parsed.projectId,
    parsed.logicalId,
    expected.expectedFieldsDigest,
  );
  const fields = {
    project: { key: parsed.projectKey },
    issuetype: { name: capitalize(expected.issueType) },
    summary: parsed.summary,
    description: expected.description,
    labels: ["app-factory"],
    ...(parentKey === null ? {} : { parent: { key: parentKey } }),
  };
  let result: JiraHttpResult;
  try {
    await input.assertActive();
    result = await request(context, {
      method: "POST",
      path: "/rest/api/3/issue",
      body: {
        fields,
        properties: [{ key: PROPERTY_KEY, value: property }],
      },
      signal: input.signal,
      deadline: input.deadline,
    });
  } catch {
    return ambiguous(
      context,
      "jira.issue.transport-or-response-unknown",
      input.effect.operationMarker,
    );
  }
  if ([400, 401, 403, 404].includes(result.status)) return rejected("jira.issue.rejected");
  if (result.status === 429) return rejected("jira.rate-limited", true);
  if (result.status !== 201) {
    return ambiguous(context, "jira.issue.provider-outcome-unknown", input.effect.operationMarker);
  }
  try {
    const created = parseCreateIdentity(result.value, "Jira issue creation response");
    if (!created.key.startsWith(`${parsed.projectKey}-`))
      fail("Jira created issue in wrong project");
    const revision = providerRevision(result.etag, result.value);
    const observedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
    return {
      kind: "observed",
      correlationKey: input.effect.operationMarker,
      resource: resourceFor(
        input.effect,
        { id: created.id, url: created.self },
        revision,
        observedAt,
      ),
      detail: detail({
        kind: "observed",
        resourceId: created.id,
        revision,
        marker: input.effect.operationMarker,
      }),
    };
  } catch {
    return ambiguous(context, "jira.issue.success-response-invalid", input.effect.operationMarker);
  }
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

async function reconcileProject(
  context: JiraMutationContext,
  input: EffectReconciliationInput,
): Promise<EffectReconciliationResult> {
  let payload: ParsedProjectPayload;
  try {
    payload = parseProjectPayload(
      await readAuthoritativePayload(
        context,
        input.effect,
        input.signal,
        input.deadline,
        "Jira project effect payload",
      ),
    );
  } catch {
    return manual("jira.payload-authority.unavailable");
  }
  let expectedFieldsDigest: ExternalEffectV1["payloadDigest"];
  try {
    expectedFieldsDigest = validateProjectPayloadIntent(context, input.effect, payload);
  } catch {
    return manual("jira.intent.mismatch");
  }
  let result: JiraHttpResult;
  try {
    result = await request(context, {
      method: "GET",
      path: `/rest/api/3/project/${encodeURIComponent(payload.key)}`,
      signal: input.signal,
      deadline: input.deadline,
    });
  } catch {
    return reconciliationAmbiguous(
      context,
      "jira.reconcile.read-failed",
      input.effect.operationMarker,
    );
  }
  if (result.status === 404) {
    return notFound(context, "jira.project.not-found", input.effect.operationMarker);
  }
  if (result.status !== 200) {
    return reconciliationAmbiguous(
      context,
      "jira.reconcile.read-failed",
      input.effect.operationMarker,
    );
  }
  try {
    const project = parseProjectResponse(result.value);
    const metadata = parseProjectMetadata(project.description);
    if (
      project.key !== payload.key ||
      metadata.marker !== input.effect.operationMarker ||
      metadata.payloadDigest !== input.effect.payloadDigest
    ) {
      return manual("jira.project.marker-collision");
    }
    if (
      metadata.displayName !== payload.displayName ||
      metadata.expectedFieldsDigest !== expectedFieldsDigest ||
      expectedFieldsDigest !==
        projectExpectation({
          key: project.key,
          name: project.name,
          projectTypeKey: project.projectTypeKey,
          displayName: payload.displayName,
        })
    ) {
      return manual("jira.project.intent-drift");
    }
    const revision = providerRevision(result.etag, result.value);
    const observedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
    return {
      kind: "observed",
      correlationKey: input.effect.operationMarker,
      resource: resourceFor(
        input.effect,
        { id: project.id, url: project.self },
        revision,
        observedAt,
      ),
      detail: detail({
        kind: "observed",
        resourceId: project.id,
        revision,
        marker: input.effect.operationMarker,
      }),
    };
  } catch {
    return manual("jira.project.response-invalid");
  }
}

async function reconcileIssue(
  context: JiraMutationContext,
  input: EffectReconciliationInput,
): Promise<EffectReconciliationResult> {
  const epic = input.effect.action === "jira.epic.ensure";
  let payload: ParsedIssueIntentPayload;
  try {
    const value = await readAuthoritativePayload(
      context,
      input.effect,
      input.signal,
      input.deadline,
      epic ? "Jira epic effect payload" : "Jira issue effect payload",
    );
    payload = epic ? parseEpicPayload(value) : parseIssuePayload(value);
  } catch {
    return manual("jira.payload-authority.unavailable");
  }
  try {
    validateIssuePayloadIntent(context, input.effect, payload, epic);
  } catch {
    return manual("jira.intent.mismatch");
  }
  let found: Awaited<ReturnType<typeof searchIssues>>;
  try {
    found = await searchIssues(context, {
      projectKey: payload.projectKey,
      field: "marker",
      value: input.effect.operationMarker,
      signal: input.signal,
      deadline: input.deadline,
    });
  } catch {
    return reconciliationAmbiguous(
      context,
      "jira.reconcile.read-failed",
      input.effect.operationMarker,
    );
  }
  if (found.issues.length === 0) {
    return notFound(context, "jira.issue.not-found", input.effect.operationMarker);
  }
  if (found.issues.length !== 1) return manual("jira.issue.duplicate-marker");
  const issue = found.issues[0] as ParsedIssue;
  if (
    issue.marker.marker !== input.effect.operationMarker ||
    issue.projectKey !== payload.projectKey ||
    issue.marker.logicalKey !== payload.logicalId ||
    issue.marker.projectId !== input.effect.subject.projectId ||
    issue.marker.payloadDigest !== input.effect.payloadDigest
  ) {
    return manual("jira.issue.marker-collision");
  }
  let parentKey: string | null = null;
  if (!epic) {
    const task = payload as ParsedTaskPayload;
    let parent: ParsedIssue;
    try {
      parent = await requireLogicalIssue(
        context,
        task.projectKey,
        task.epicLogicalId,
        input.signal,
        input.deadline,
      );
    } catch {
      return manual("jira.issue.parent-unavailable");
    }
    if (!parentMatchesTaskIntent(parent, task)) {
      return manual("jira.issue.parent-intent-mismatch");
    }
    parentKey = parent.key;
  }
  const expected = expectedIssueFields(input.effect, payload, epic, parentKey);
  if (
    issue.marker.expectedFieldsDigest !== expected.expectedFieldsDigest ||
    issue.observedFieldsDigest !== expected.expectedFieldsDigest
  ) {
    return manual("jira.issue.intent-drift");
  }
  const observedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
  return {
    kind: "observed",
    correlationKey: input.effect.operationMarker,
    resource: resourceFor(
      input.effect,
      { id: issue.id, url: issue.self },
      found.revision,
      observedAt,
    ),
    detail: detail({
      kind: "observed",
      resourceId: issue.id,
      revision: found.revision,
      marker: input.effect.operationMarker,
    }),
  };
}

function manual(code: string): EffectReconciliationResult {
  return {
    kind: "manual-intervention",
    code: NamespacedCodeSchema.parse(code),
    detail: detail({ kind: "manual-intervention", code }),
  };
}

function notFound(
  context: JiraContext,
  code: string,
  correlationKey: string,
): EffectReconciliationResult {
  return {
    kind: "not-found",
    correlationKey,
    reconcileAfter: later(context),
    detail: detail({ kind: "not-found", code }),
  };
}

function reconciliationAmbiguous(
  context: JiraContext,
  code: string,
  correlationKey: string,
): EffectReconciliationResult {
  return {
    kind: "ambiguous",
    correlationKey,
    reconcileAfter: later(context),
    detail: detail({ kind: "ambiguous", code }),
  };
}

function preflightCapabilities(permissions: ReadonlyMap<string, boolean> | null) {
  const definitions = [
    ["jira.project.read", "BROWSE_PROJECTS"],
    ["jira.project.create", "ADMINISTER_PROJECTS"],
    ["jira.issue.read", "BROWSE_PROJECTS"],
    ["jira.issue.create", "CREATE_ISSUES"],
    ["jira.issue.link", "LINK_ISSUES"],
    ["jira.remote-link.create", "LINK_ISSUES"],
  ] as const;
  return definitions.map(([capability, permission]) => {
    const contractBlocker =
      capability === "jira.issue.link"
        ? "jira.issue-link.correlation-contract-unsupported"
        : capability === "jira.remote-link.create"
          ? "jira.remote-link.issue-target-required"
          : null;
    const available = contractBlocker === null && permissions?.get(permission) === true;
    const blockerCode = available
      ? null
      : NamespacedCodeSchema.parse(contractBlocker ?? "jira.permission.unavailable");
    return {
      capability: NamespacedCodeSchema.parse(capability),
      available,
      blockerCode,
      summary: available
        ? `${capability} was reported available by Jira Cloud.`
        : contractBlocker === null
          ? `${capability} was not reported available by Jira Cloud.`
          : `${capability} is blocked by the v1 correlation/target contract.`,
    };
  });
}

function parsePermissions(value: unknown): ReadonlyMap<string, boolean> {
  const root = record(value, "Jira permission response");
  exact(root, ["permissions"], "Jira permission response");
  const permissions = record(root.permissions, "Jira permissions");
  const expected = ["BROWSE_PROJECTS", "ADMINISTER_PROJECTS", "CREATE_ISSUES", "LINK_ISSUES"];
  exact(permissions, expected, "Jira permissions");
  return new Map(
    expected.map((key) => {
      const permission = record(permissions[key], `Jira permission ${key}`);
      exact(
        permission,
        ["id", "key", "name", "type", "description", "havePermission"],
        `Jira permission ${key}`,
      );
      if (permission.key !== key) fail("Jira permission response key mismatch");
      boundedIdentifier(permission.id, "Jira permission ID", 160);
      text(permission.name, "Jira permission name", 160);
      text(permission.type, "Jira permission type", 80);
      text(permission.description, "Jira permission description", 2_000);
      return [key, bool(permission.havePermission, "Jira permission availability")] as const;
    }),
  );
}

export function createJiraCloudHttpAdapter(
  options: JiraCloudHttpAdapterOptions,
): ExternalProviderAdapter {
  const context = createMutationContext(options);
  return {
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    provider: "jira",
    async preflight(signal): Promise<AdapterPreflightReportV1> {
      let permissions: ReadonlyMap<string, boolean> | null = null;
      try {
        const query = new URLSearchParams({
          permissions: "BROWSE_PROJECTS,ADMINISTER_PROJECTS,CREATE_ISSUES,LINK_ISSUES",
        });
        const result = await request(context, {
          method: "GET",
          path: "/rest/api/3/mypermissions",
          query,
          signal,
          deadline: deadline(context),
        });
        if (result.status === 200) permissions = parsePermissions(result.value);
      } catch {
        permissions = null;
      }
      return {
        schemaVersion: 1,
        adapterId: NamespacedCodeSchema.parse(ADAPTER_ID),
        adapterVersion: ADAPTER_VERSION,
        provider: "jira",
        checkedAt: IsoInstantSchema.parse(context.clock.now().toISOString()),
        credentialReference: context.credentialReference,
        capabilities: preflightCapabilities(permissions),
      };
    },
    async send(input): Promise<EffectSendResult> {
      if (!credentialsMatch(input.credentialReference, context.credentialReference)) {
        return rejected("jira.credential-reference-mismatch");
      }
      switch (input.effect.action) {
        case "jira.project.ensure":
          return await sendProject(context, input);
        case "jira.epic.ensure":
        case "jira.issue.ensure":
          return await sendIssue(context, input);
        case "jira.issue-link.ensure":
          // Jira issue links have no entity-property surface. Sending here would
          // violate the plan's declared marker location and make lost-response
          // adoption guesswork, so the adapter refuses before provider I/O.
          return rejected("jira.issue-link.correlation-contract-unsupported");
        case "jira.github.attach":
          // Jira remote links are issue-scoped, while the v1 effect payload has
          // only a project/repository. Selecting an issue would expand approval.
          return rejected("jira.remote-link.issue-target-required");
        default:
          return rejected("jira.action.unsupported");
      }
    },
    async reconcile(input): Promise<EffectReconciliationResult> {
      if (!credentialsMatch(input.credentialReference, context.credentialReference)) {
        return manual("jira.credential-reference-mismatch");
      }
      switch (input.effect.action) {
        case "jira.project.ensure":
          return await reconcileProject(context, input);
        case "jira.epic.ensure":
        case "jira.issue.ensure":
          return await reconcileIssue(context, input);
        case "jira.issue-link.ensure":
          return manual("jira.issue-link.correlation-contract-unsupported");
        case "jira.github.attach":
          return manual("jira.remote-link.issue-target-required");
        default:
          return manual("jira.action.unsupported");
      }
    },
  };
}

function issueSnapshot(
  context: JiraContext,
  issue: ParsedIssue,
  revision: string,
): JiraIssueSnapshotV1 {
  return parseJiraIssueSnapshot({
    schemaVersion: 1,
    siteId: context.siteId,
    issueId: issue.id,
    key: issue.key,
    projectKey: issue.projectKey,
    issueType: issue.issueType,
    summary: issue.summary,
    description: issue.description,
    status: issue.status,
    labels: issue.labels,
    operationMarker: issue.marker.marker,
    version: issue.version,
    providerRevision: revision,
    updatedAt: issue.updatedAt,
    observedAt: context.clock.now().toISOString(),
  });
}

export function createJiraReadObserver(options: JiraReadObserverOptions): JiraReadObserver {
  const context = createContext(options);
  return {
    async observeProject(projectKeyValue, signal): Promise<JiraProjectSnapshotV1> {
      const key = projectKey(projectKeyValue);
      const result = await request(context, {
        method: "GET",
        path: `/rest/api/3/project/${encodeURIComponent(key)}`,
        signal,
        deadline: deadline(context),
      });
      if (result.status !== 200) fail("Jira project observation failed");
      const project = parseProjectResponse(result.value);
      if (project.key !== key) fail("Jira returned the wrong project");
      const metadata = currentProjectMetadata(project);
      return parseJiraProjectSnapshot({
        schemaVersion: 1,
        siteId: context.siteId,
        projectId: project.id,
        key: project.key,
        name: project.name,
        projectType: "software",
        operationMarker: metadata.marker,
        providerRevision: providerRevision(result.etag, result.value),
        observedAt: context.clock.now().toISOString(),
      });
    },
    async observeIssue(issueKeyValue, signal): Promise<JiraIssueSnapshotV1> {
      const key = issueKey(issueKeyValue);
      const query = new URLSearchParams({
        fields: "project,summary,description,status,labels,updated,issuetype,parent",
        properties: PROPERTY_KEY,
      });
      const result = await request(context, {
        method: "GET",
        path: `/rest/api/3/issue/${encodeURIComponent(key)}`,
        query,
        signal,
        deadline: deadline(context),
      });
      if (result.status !== 200) fail("Jira issue observation failed");
      const issue = parseIssue(result.value);
      if (issue.key !== key) fail("Jira returned the wrong issue");
      if (issue.marker.expectedFieldsDigest !== issue.observedFieldsDigest) {
        fail("Jira issue fields drifted from their bound metadata");
      }
      return issueSnapshot(context, issue, providerRevision(result.etag, result.value));
    },
    async findByCorrelation(query: CorrelationQueryV1, signal: AbortSignal) {
      if (query.schemaVersion !== 1 || query.provider !== "jira") {
        fail("Jira correlation query is unsupported");
      }
      if (query.resourceType === "jira.project") {
        const key = projectKey(query.logicalKey);
        const result = await request(context, {
          method: "GET",
          path: `/rest/api/3/project/${encodeURIComponent(key)}`,
          signal,
          deadline: deadline(context),
        });
        if (result.status === 404) return [];
        if (result.status !== 200) fail("Jira project correlation read failed");
        const project = parseProjectResponse(result.value);
        const metadata = currentProjectMetadata(project);
        const observation: ProviderResourceObservationV1 = {
          schemaVersion: 1,
          provider: "jira",
          resourceType: "jira.project",
          providerResourceId: project.id,
          providerUrl: project.self,
          providerRevision: providerRevision(result.etag, result.value),
          operationMarker: metadata.marker,
          containerKey: query.containerKey,
          logicalKey: query.logicalKey,
          observedAt: context.clock.now().toISOString(),
        };
        return [observation];
      }
      if (query.resourceType === "jira.issue") {
        const project = projectKey(
          query.containerKey.slice(query.containerKey.lastIndexOf(":") + 1),
        );
        const found = await searchIssues(context, {
          projectKey: project,
          field: "marker",
          value: query.marker,
          signal,
          deadline: deadline(context),
        });
        return found.issues.map((issue): ProviderResourceObservationV1 => {
          if (issue.marker.expectedFieldsDigest !== issue.observedFieldsDigest) {
            fail("Jira issue correlation fields drifted from their bound metadata");
          }
          return {
            schemaVersion: 1,
            provider: "jira",
            resourceType: "jira.issue",
            providerResourceId: issue.id,
            providerUrl: issue.self,
            providerRevision: found.revision,
            operationMarker: issue.marker.marker,
            containerKey: query.containerKey,
            logicalKey: issue.marker.logicalKey,
            observedAt: context.clock.now().toISOString(),
          };
        });
      }
      // v1 declares entity-property markers for issue links even though Jira
      // provides no such surface, and remote links lack an issue target. A read
      // must fail explicitly instead of pretending absence is proof of safety.
      fail("Jira correlation resource type is not representable by the v1 contract");
    },
  };
}
