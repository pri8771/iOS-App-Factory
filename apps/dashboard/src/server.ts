import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { CommandClient } from "@app-factory/command-client";
import {
  AttemptIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  ProjectLifecycleStageV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  type AttemptId,
} from "@app-factory/contracts";
import { z } from "zod";

const MAX_BODY_BYTES = 64 * 1024;
const SESSION_COOKIE = "factory_dashboard";
const DEFAULT_PORTFOLIO_TIMEOUT_MS = 5_000;
const NonNegativeIntegerSchema = z.number().int().nonnegative().safe();
const DashboardPortfolioProjectV1Schema = z.strictObject({
  projectId: ProjectIdSchema,
  slug: StableKeySchema,
  displayName: z.string().min(1).max(200),
  lifecycleStage: ProjectLifecycleStageV1Schema,
  activeAttemptCount: NonNegativeIntegerSchema,
  blockerCount: NonNegativeIntegerSchema,
  openPullRequestCount: NonNegativeIntegerSchema,
  jiraTodoCount: NonNegativeIntegerSchema,
  jiraInProgressCount: NonNegativeIntegerSchema,
  unresolvedP0: NonNegativeIntegerSchema,
  unresolvedP1: NonNegativeIntegerSchema,
  releaseStage: z.string().min(1).max(100).nullable(),
  lastDeliveryAt: IsoInstantSchema.nullable(),
  health: z.enum(["healthy", "attention", "blocked", "unknown"]),
  healthReasons: z
    .array(
      z.enum([
        "unresolved-p0",
        "delivery-blocker",
        "unresolved-p1",
        "analytics-stale",
        "analytics-unavailable",
      ]),
    )
    .max(5),
  analyticsFreshness: z.enum(["fresh", "stale", "unavailable"]),
});
const DashboardPortfolioTotalsV1Schema = z.strictObject({
  projects: NonNegativeIntegerSchema,
  activeAttempts: NonNegativeIntegerSchema,
  blockers: NonNegativeIntegerSchema,
  openPullRequests: NonNegativeIntegerSchema,
  unresolvedP0: NonNegativeIntegerSchema,
  unresolvedP1: NonNegativeIntegerSchema,
});
const DashboardPortfolioSourceV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: IsoInstantSchema,
  projects: z.array(DashboardPortfolioProjectV1Schema).max(1_000),
  totals: DashboardPortfolioTotalsV1Schema,
  sourceSnapshotDigest: Sha256DigestSchema,
});

export type DashboardCommandPort = Readonly<{
  doctor(): Promise<unknown>;
  status(attemptId: AttemptId): Promise<unknown>;
  events(
    attemptId: AttemptId,
    options: Readonly<{ afterSequence: number; limit: number }>,
  ): Promise<unknown>;
  pause(attemptId: AttemptId, reason: string | null): Promise<unknown>;
  resume(attemptId: AttemptId, reason: string | null): Promise<unknown>;
  cancel(attemptId: AttemptId, reason: string | null): Promise<unknown>;
  reconcile(attemptId: AttemptId | null): Promise<unknown>;
  close(): void;
}>;

export type DashboardPortfolioPort = Readonly<{
  snapshot(signal: AbortSignal): Promise<unknown>;
}>;

export type StartDashboardServerOptions = Readonly<{
  commandPort: DashboardCommandPort;
  portfolioPort?: DashboardPortfolioPort;
  browserToken: string;
  csrfToken?: string;
  sessionToken?: string;
  port?: number;
  portfolioTimeoutMs?: number;
}>;

export type DashboardServer = Readonly<{
  origin: string;
  launchUrl: string;
  close(): Promise<void>;
}>;

export class DashboardServerError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DashboardServerError";
  }
}

function secureToken(value: string, label: string): string {
  if (value.length < 32 || value.length > 512 || value.includes("\0")) {
    throw new TypeError(`${label} must be 32-512 characters`);
  }
  return value;
}

function sameSecret(actual: string, expected: string): boolean {
  const left = createHash("sha256").update(actual).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function securityHeaders(response: ServerResponse, contentType: string): void {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  securityHeaders(response, "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(`${JSON.stringify(value)}\n`);
}

function text(response: ServerResponse, status: number, contentType: string, value: string): void {
  securityHeaders(response, contentType);
  response.statusCode = status;
  response.end(value);
}

function cookies(request: IncomingMessage): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const pair of (request.headers.cookie ?? "").split(";")) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    result[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return result;
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let length = 0;
    request.on("data", (chunk: Buffer) => {
      length += chunk.byteLength;
      if (length > MAX_BODY_BYTES) {
        rejectPromise(new DashboardServerError("request body exceeds the limit"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once("error", rejectPromise);
    request.once("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch (error) {
        rejectPromise(new DashboardServerError("request body is not valid JSON", { cause: error }));
      }
    });
  });
}

function actionBody(value: unknown): Readonly<{
  action: "pause" | "resume" | "cancel" | "reconcile";
  attemptId: AttemptId | null;
  reason: string | null;
}> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DashboardServerError("action body must be an object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    record.action !== "pause" &&
    record.action !== "resume" &&
    record.action !== "cancel" &&
    record.action !== "reconcile"
  ) {
    throw new DashboardServerError("action is unsupported");
  }
  const attemptId = record.attemptId === null ? null : AttemptIdSchema.parse(record.attemptId);
  if (record.action !== "reconcile" && attemptId === null) {
    throw new DashboardServerError("attemptId is required for this action");
  }
  if (
    record.reason !== null &&
    (typeof record.reason !== "string" || record.reason.length < 1 || record.reason.length > 2_000)
  ) {
    throw new DashboardServerError("reason is invalid");
  }
  return { action: record.action, attemptId, reason: record.reason as string | null };
}

function positiveTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new TypeError("portfolioTimeoutMs must be between 1 and 60000 milliseconds");
  }
  return value;
}

function canonical(value: unknown): string {
  const normalized = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalized);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalized(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalized(value));
}

function portfolioProjection(value: unknown): unknown {
  const snapshot = DashboardPortfolioSourceV1Schema.parse(value);
  if (
    new Set(snapshot.projects.map((project) => project.projectId)).size !==
      snapshot.projects.length ||
    new Set(snapshot.projects.map((project) => project.slug)).size !== snapshot.projects.length
  ) {
    throw new DashboardServerError("portfolio projects must have unique identities");
  }
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  for (const project of snapshot.projects) {
    if (project.lastDeliveryAt !== null && Date.parse(project.lastDeliveryAt) > generatedAtMs) {
      throw new DashboardServerError("portfolio contains a future delivery timestamp");
    }
    const healthReasons: Array<(typeof project.healthReasons)[number]> = [];
    if (project.unresolvedP0 > 0) healthReasons.push("unresolved-p0");
    if (project.blockerCount > 0) healthReasons.push("delivery-blocker");
    if (project.unresolvedP1 > 0) healthReasons.push("unresolved-p1");
    if (project.analyticsFreshness === "stale") healthReasons.push("analytics-stale");
    if (project.analyticsFreshness === "unavailable") {
      healthReasons.push("analytics-unavailable");
    }
    const health =
      project.unresolvedP0 > 0 || project.blockerCount > 0
        ? "blocked"
        : project.unresolvedP1 > 0 || project.analyticsFreshness === "stale"
          ? "attention"
          : project.analyticsFreshness === "unavailable"
            ? "unknown"
            : "healthy";
    if (
      project.health !== health ||
      canonical(project.healthReasons) !== canonical(healthReasons)
    ) {
      throw new DashboardServerError("portfolio health does not match its counters");
    }
  }
  const totals = {
    projects: snapshot.projects.length,
    activeAttempts: snapshot.projects.reduce((sum, project) => sum + project.activeAttemptCount, 0),
    blockers: snapshot.projects.reduce((sum, project) => sum + project.blockerCount, 0),
    openPullRequests: snapshot.projects.reduce(
      (sum, project) => sum + project.openPullRequestCount,
      0,
    ),
    unresolvedP0: snapshot.projects.reduce((sum, project) => sum + project.unresolvedP0, 0),
    unresolvedP1: snapshot.projects.reduce((sum, project) => sum + project.unresolvedP1, 0),
  };
  if (
    Object.values(totals).some((item) => !Number.isSafeInteger(item)) ||
    canonical(totals) !== canonical(snapshot.totals)
  ) {
    throw new DashboardServerError("portfolio totals do not match its projects");
  }
  const envelope = {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    projects: snapshot.projects,
    totals: snapshot.totals,
    sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
  };
  return {
    ...envelope,
    projectionDigest: `sha256:${createHash("sha256").update(canonical(envelope)).digest("hex")}`,
  };
}

async function boundedPortfolioSnapshot(
  port: DashboardPortfolioPort,
  request: IncomingMessage,
  response: ServerResponse,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const abort = (): void => controller.abort();
  request.once("aborted", abort);
  response.once("close", abort);
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new DashboardServerError("portfolio source timed out"));
    }, timeoutMs);
  });
  try {
    const value = await Promise.race([port.snapshot(controller.signal), timeoutPromise]);
    if (controller.signal.aborted)
      throw new DashboardServerError("portfolio request was cancelled");
    return portfolioProjection(value);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    request.removeListener("aborted", abort);
    response.removeListener("close", abort);
  }
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="factory-csrf" content="__CSRF__">
  <title>App Factory Command Center</title>
  <meta name="description" content="Local command center for App Factory projects, attempts, quality and releases.">
  <link rel="stylesheet" href="/dashboard.css">
</head>
<body>
  <main>
    <header class="masthead">
      <div><p class="eyebrow">LOCAL CONTROL PLANE</p><h1>App Factory</h1></div>
      <div id="health" class="health pending"><span></span>Connecting</div>
    </header>
    <section class="hero">
      <p>One authoritative view from task intake to verified delivery.</p>
      <div class="metrics">
        <article><span>Daemon</span><strong id="daemon-state">—</strong></article>
        <article><span>Attempt</span><strong id="attempt-state">Not selected</strong></article>
        <article><span>Evidence</span><strong id="event-count">—</strong></article>
      </div>
    </section>
    <section class="workspace">
      <nav aria-label="Factory sections">
        <button id="nav-run" class="nav-active">Run monitor</button><button id="nav-portfolio">Portfolio</button><button disabled>Quality</button><button disabled>Releases</button>
      </nav>
      <div class="content">
        <section class="panel lookup">
          <div><p class="label">ATTEMPT ID</p><h2>Inspect active work</h2></div>
          <form id="lookup-form"><input id="attempt-id" autocomplete="off" placeholder="00000000-0000-4000-8000-000000000000" aria-label="Attempt ID"><button>Load</button></form>
        </section>
        <section id="empty" class="panel empty"><div class="orb"></div><h2>No attempt selected</h2><p>Paste an attempt ID to see its durable state, blocker, and exact event timeline.</p></section>
        <section id="attempt" class="attempt hidden">
          <article class="panel summary"><p class="label">CURRENT STATE</p><h2 id="attempt-title">Attempt</h2><div id="attempt-detail" class="detail"></div><div class="actions"><button data-action="pause">Pause</button><button data-action="resume">Resume</button><button data-action="reconcile">Reconcile</button><button data-action="cancel" class="danger">Cancel</button></div></article>
          <article class="panel timeline"><p class="label">DURABLE TIMELINE</p><ol id="events"></ol></article>
        </section>
        <section id="portfolio" class="panel hidden"><div class="section-head"><div><p class="label">ALL PRODUCTS</p><h2>Portfolio health</h2></div><button id="refresh-portfolio">Refresh</button></div><div id="portfolio-totals" class="portfolio-totals"></div><div id="portfolio-projects" class="project-grid"></div></section>
      </div>
    </section>
  </main>
  <script src="/dashboard.js" defer></script>
</body>
</html>`;

const DASHBOARD_CSS = `:root{color-scheme:dark;--bg:#0b0d0e;--panel:#121616;--line:#26302d;--ink:#f2f2eb;--muted:#89938e;--acid:#c9ff49;--red:#ff765e}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 75% -10%,#22331f 0,transparent 32%),var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;min-height:100vh}main{max-width:1240px;margin:auto;padding:32px}.masthead{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px}.eyebrow,.label{color:var(--acid);font:600 11px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em;margin:0 0 8px}.masthead h1{font-size:38px;letter-spacing:-.045em;margin:0}.health{font:600 12px ui-monospace,monospace;color:var(--muted);display:flex;gap:9px;align-items:center}.health span{width:8px;height:8px;border-radius:50%;background:var(--muted)}.health.live{color:var(--acid)}.health.live span{background:var(--acid);box-shadow:0 0 16px var(--acid)}.hero{display:flex;justify-content:space-between;align-items:end;padding:52px 0 34px}.hero>p{font-size:25px;line-height:1.25;letter-spacing:-.025em;max-width:520px;margin:0}.metrics{display:flex;border:1px solid var(--line);border-radius:12px;overflow:hidden}.metrics article{min-width:128px;padding:15px 18px;border-left:1px solid var(--line)}.metrics article:first-child{border-left:0}.metrics span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.1em}.metrics strong{display:block;margin-top:8px;font-size:15px}.workspace{display:grid;grid-template-columns:180px 1fr;gap:24px}nav{display:flex;flex-direction:column;gap:6px}button,input{font:inherit}nav button,.actions button,.section-head button{background:transparent;color:var(--muted);border:1px solid transparent;border-radius:9px;text-align:left;padding:11px 13px}nav .nav-active{background:#172019;color:var(--acid);border-color:#283927}nav button:disabled{opacity:.35}.content{display:grid;gap:18px}.panel{background:linear-gradient(155deg,#151a19,#101312);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 20px 60px #0004}.lookup,.section-head{display:flex;justify-content:space-between;align-items:center}.lookup h2,.summary h2,.section-head h2{margin:0;font-size:22px;letter-spacing:-.025em}.lookup form{display:flex;gap:8px;min-width:52%}input{width:100%;background:#090b0b;color:var(--ink);border:1px solid #343d3a;border-radius:9px;padding:12px}form button{background:var(--acid);color:#111;border:0;border-radius:9px;padding:0 18px;font-weight:700}.empty{text-align:center;padding:76px 24px}.empty h2{margin:18px 0 8px}.empty p{color:var(--muted);margin:auto;max-width:450px}.orb{width:48px;height:48px;background:var(--acid);border-radius:50%;margin:auto;box-shadow:0 0 45px #c9ff4966}.attempt{display:grid;grid-template-columns:1fr 1.2fr;gap:18px}.hidden{display:none!important}.detail{display:grid;gap:8px;margin:22px 0;color:var(--muted);font:13px/1.5 ui-monospace,monospace}.actions{display:flex;gap:8px;flex-wrap:wrap}.actions button,.section-head button{border-color:#39423f;color:var(--ink);cursor:pointer}.actions .danger{color:var(--red);border-color:#58322b}.timeline ol{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:14px}.timeline li{position:relative;padding-left:22px;color:var(--muted);font:12px/1.5 ui-monospace,monospace}.timeline li:before{content:'';position:absolute;left:0;top:5px;width:7px;height:7px;background:var(--acid);border-radius:50%}.timeline b{display:block;color:var(--ink);font-size:13px}.portfolio-totals{color:var(--muted);font:12px/1.5 ui-monospace,monospace;margin:24px 0}.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.project-card{border:1px solid var(--line);border-radius:12px;padding:17px;background:#0b0e0d}.project-card h3{margin:0 0 7px}.project-card p{margin:5px 0;color:var(--muted);font-size:12px}.project-card .healthy{color:var(--acid)}.project-card .blocked{color:var(--red)}.project-card .attention,.project-card .unknown{color:#ffd166}@media(max-width:800px){main{padding:20px}.hero{display:grid;gap:24px}.metrics{width:100%}.metrics article{min-width:0;flex:1}.workspace{grid-template-columns:1fr}nav{flex-direction:row;overflow:auto}.lookup{display:grid;gap:18px}.lookup form{min-width:0}.attempt{grid-template-columns:1fr}.masthead{align-items:center}}`;

const DASHBOARD_JS = `const csrf=document.querySelector('meta[name=factory-csrf]').content;const health=document.querySelector('#health');const attemptId=document.querySelector('#attempt-id');const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));let selected=null;async function api(path,options={}){const response=await fetch(path,{...options,headers:{'content-type':'application/json','x-factory-csrf':csrf,...options.headers}});const value=await response.json();if(!response.ok)throw new Error(value.error?.message||'Request failed');return value}async function doctor(){try{const value=await api('/api/doctor');health.className='health live';health.innerHTML='<span></span>Operational';document.querySelector('#daemon-state').textContent=value.result.readiness||'Ready'}catch{health.className='health';health.innerHTML='<span></span>Unavailable';document.querySelector('#daemon-state').textContent='Offline'}}async function loadAttempt(){if(!attemptId.value)return;selected=attemptId.value;try{const value=await api('/api/attempt/'+encodeURIComponent(selected));document.querySelector('#empty').classList.add('hidden');document.querySelector('#attempt').classList.remove('hidden');const attempt=value.status.attempt;document.querySelector('#attempt-title').textContent=attempt.state+' · '+attempt.attemptId.slice(0,8);document.querySelector('#attempt-state').textContent=attempt.state;document.querySelector('#event-count').textContent=value.events.events.length+' events';document.querySelector('#attempt-detail').innerHTML='<span>desired: '+escapeHtml(attempt.desiredState)+'</span><span>revision: '+escapeHtml(attempt.revision)+' · fence: '+escapeHtml(attempt.fence)+'</span><span>blocker: '+escapeHtml(attempt.blocker?.summary||'none')+'</span>';document.querySelector('#events').innerHTML=value.events.events.slice().reverse().map(event=>'<li><b>'+escapeHtml(event.type)+'</b>#'+escapeHtml(event.sequence)+' · '+escapeHtml(event.occurredAt)+'</li>').join('')}catch(error){alert(error.message)}}function show(view){const portfolio=view==='portfolio';document.querySelector('.lookup').classList.toggle('hidden',portfolio);document.querySelector('#empty').classList.toggle('hidden',portfolio||selected!==null);document.querySelector('#attempt').classList.toggle('hidden',portfolio||selected===null);document.querySelector('#portfolio').classList.toggle('hidden',!portfolio);document.querySelector('#nav-run').classList.toggle('nav-active',!portfolio);document.querySelector('#nav-portfolio').classList.toggle('nav-active',portfolio)}async function loadPortfolio(){try{const value=await api('/api/portfolio');const snapshot=value.snapshot;const totals=snapshot.totals;document.querySelector('#portfolio-totals').textContent=totals.projects+' projects · '+totals.activeAttempts+' active attempts · '+totals.blockers+' blockers · '+totals.openPullRequests+' open PRs';document.querySelector('#portfolio-projects').innerHTML=snapshot.projects.map(project=>'<article class="project-card"><h3>'+escapeHtml(project.displayName)+'</h3><p class="'+escapeHtml(project.health)+'">'+escapeHtml(project.health)+'</p><p>'+escapeHtml(project.lifecycleStage)+' · '+escapeHtml(project.activeAttemptCount)+' active</p><p>'+escapeHtml(project.openPullRequestCount)+' PRs · '+escapeHtml(project.unresolvedP0)+' P0 · '+escapeHtml(project.unresolvedP1)+' P1</p><p>analytics: '+escapeHtml(project.analyticsFreshness)+'</p></article>').join('')}catch(error){document.querySelector('#portfolio-projects').textContent=error.message}}document.querySelector('#lookup-form').addEventListener('submit',event=>{event.preventDefault();loadAttempt()});document.querySelector('#nav-run').addEventListener('click',()=>show('run'));document.querySelector('#nav-portfolio').addEventListener('click',()=>{show('portfolio');loadPortfolio()});document.querySelector('#refresh-portfolio').addEventListener('click',loadPortfolio);document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{if(!selected)return;button.disabled=true;try{await api('/api/action',{method:'POST',body:JSON.stringify({action:button.dataset.action,attemptId:selected,reason:'Dashboard operator action'})});await loadAttempt()}catch(error){alert(error.message)}finally{button.disabled=false}}));doctor();setInterval(doctor,10000);`;

export function createDashboardCommandPort(client: CommandClient): DashboardCommandPort {
  return {
    doctor: async () => await client.doctor(),
    status: async (attemptId) => await client.status(attemptId),
    events: async (attemptId, options) => await client.events(attemptId, options),
    pause: async (attemptId, reason) => await client.pause(attemptId, reason),
    resume: async (attemptId, reason) => await client.resume(attemptId, reason),
    cancel: async (attemptId, reason) => await client.cancel(attemptId, reason),
    reconcile: async (attemptId) => await client.reconcile(attemptId),
    close: () => client.close(),
  };
}

export function createDashboardRequestHandler(
  options: Readonly<{
    commandPort: DashboardCommandPort;
    portfolioPort?: DashboardPortfolioPort;
    browserToken: string;
    csrfToken: string;
    sessionToken: string;
    expectedOrigin: () => string;
    portfolioTimeoutMs: number;
  }>,
) {
  let launchTokenAvailable = true;
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const expectedOrigin = options.expectedOrigin();
    const url = new URL(request.url ?? "/", expectedOrigin);
    const host = request.headers.host ?? "";
    if (host !== new URL(expectedOrigin).host)
      return json(response, 400, {
        error: { code: "dashboard.invalid-host", message: "Invalid Host header." },
      });

    if (url.pathname === "/" && url.searchParams.has("token")) {
      const supplied = url.searchParams.get("token") ?? "";
      if (!launchTokenAvailable || !sameSecret(supplied, options.browserToken))
        return json(response, 403, {
          error: { code: "dashboard.unauthorized", message: "Invalid launch token." },
        });
      launchTokenAvailable = false;
      response.statusCode = 303;
      response.setHeader("Location", "/");
      response.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=${options.sessionToken}; HttpOnly; SameSite=Strict; Path=/`,
      );
      securityHeaders(response, "text/plain; charset=utf-8");
      response.end("Authenticated\n");
      return;
    }
    const session = cookies(request)[SESSION_COOKIE];
    if (session === undefined || !sameSecret(session, options.sessionToken))
      return json(response, 401, {
        error: {
          code: "dashboard.unauthorized",
          message: "Open the tokenized local dashboard URL.",
        },
      });

    if (url.pathname === "/")
      return text(
        response,
        200,
        "text/html; charset=utf-8",
        DASHBOARD_HTML.replace("__CSRF__", options.csrfToken),
      );
    if (url.pathname === "/dashboard.css")
      return text(response, 200, "text/css; charset=utf-8", DASHBOARD_CSS);
    if (url.pathname === "/dashboard.js")
      return text(response, 200, "text/javascript; charset=utf-8", DASHBOARD_JS);
    if (url.pathname === "/api/doctor" && request.method === "GET")
      return json(response, 200, { result: await options.commandPort.doctor() });
    if (url.pathname === "/api/portfolio" && request.method === "GET") {
      if (options.portfolioPort === undefined) {
        return json(response, 503, {
          error: { code: "dashboard.portfolio-unavailable", message: "Portfolio is unavailable." },
        });
      }
      try {
        const snapshot = await boundedPortfolioSnapshot(
          options.portfolioPort,
          request,
          response,
          options.portfolioTimeoutMs,
        );
        return json(response, 200, { snapshot });
      } catch {
        return json(response, 503, {
          error: { code: "dashboard.portfolio-unavailable", message: "Portfolio is unavailable." },
        });
      }
    }
    if (url.pathname.startsWith("/api/attempt/") && request.method === "GET") {
      const attemptId = AttemptIdSchema.parse(
        decodeURIComponent(url.pathname.slice("/api/attempt/".length)),
      );
      const [status, events] = await Promise.all([
        options.commandPort.status(attemptId),
        options.commandPort.events(attemptId, { afterSequence: 0, limit: 500 }),
      ]);
      return json(response, 200, { status, events });
    }
    if (url.pathname === "/api/action" && request.method === "POST") {
      if (
        request.headers.origin !== expectedOrigin ||
        request.headers["x-factory-csrf"] !== options.csrfToken
      ) {
        return json(response, 403, {
          error: { code: "dashboard.csrf", message: "Mutation authorization failed." },
        });
      }
      const body = actionBody(await readBody(request));
      let result: unknown;
      if (body.action === "pause")
        result = await options.commandPort.pause(body.attemptId as AttemptId, body.reason);
      else if (body.action === "resume")
        result = await options.commandPort.resume(body.attemptId as AttemptId, body.reason);
      else if (body.action === "cancel")
        result = await options.commandPort.cancel(body.attemptId as AttemptId, body.reason);
      else result = await options.commandPort.reconcile(body.attemptId);
      return json(response, 200, { result });
    }
    json(response, 404, { error: { code: "dashboard.not-found", message: "Not found." } });
  };
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", rejectPromise);
      const address = server.address();
      if (address === null || typeof address === "string")
        return rejectPromise(new DashboardServerError("dashboard address is invalid"));
      resolvePromise(address.port);
    });
  });
}

export async function startDashboardServer(
  options: StartDashboardServerOptions,
): Promise<DashboardServer> {
  const browserToken = secureToken(options.browserToken, "browserToken");
  const csrfToken = secureToken(options.csrfToken ?? randomBytes(32).toString("hex"), "csrfToken");
  const sessionToken = secureToken(
    options.sessionToken ?? randomBytes(32).toString("hex"),
    "sessionToken",
  );
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw new TypeError("port is invalid");
  const portfolioTimeoutMs = positiveTimeout(
    options.portfolioTimeoutMs ?? DEFAULT_PORTFOLIO_TIMEOUT_MS,
  );
  let origin = "http://127.0.0.1:0";
  const handler = createDashboardRequestHandler({
    commandPort: options.commandPort,
    ...(options.portfolioPort === undefined ? {} : { portfolioPort: options.portfolioPort }),
    browserToken,
    csrfToken,
    sessionToken,
    expectedOrigin: () => origin,
    portfolioTimeoutMs,
  });
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent)
        json(response, 400, {
          error: {
            code: "dashboard.request-failed",
            message: "Dashboard request failed.",
          },
        });
      else response.destroy();
    });
  });
  const actualPort = await listen(server, port);
  origin = `http://127.0.0.1:${String(actualPort)}`;
  let closePromise: Promise<void> | null = null;
  return {
    origin,
    launchUrl: `${origin}/?token=${encodeURIComponent(browserToken)}`,
    close: async () => {
      if (closePromise === null) {
        closePromise = new Promise<void>((resolvePromise, rejectPromise) => {
          server.close((error) => {
            options.commandPort.close();
            if (error === undefined) resolvePromise();
            else rejectPromise(error);
          });
          server.closeIdleConnections();
        });
      }
      return await closePromise;
    },
  };
}
