import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  CommandClientError,
  type CommandClient,
  type CommandIdentity,
  type RetryableCommandIdentity,
} from "@app-factory/command-client";
import {
  AttemptIdSchema,
  AttemptListPageV1Schema,
  AttemptListQueryV1Schema,
  CommandIdSchema,
  IsoInstantSchema,
  PortfolioReadModelV1Schema,
  canonicalPortfolioReadModelDigestInputV1,
  type AttemptId,
  type AttemptListPageV1,
  type AttemptListQueryV1,
} from "@app-factory/contracts";

const MAX_BODY_BYTES = 64 * 1024;
const SESSION_COOKIE = "factory_dashboard";
const DEFAULT_PORTFOLIO_TIMEOUT_MS = 5_000;
export type DashboardCommandPort = Readonly<{
  doctor(): Promise<unknown>;
  listAttempts(query: AttemptListQueryV1, signal?: AbortSignal): Promise<unknown>;
  status(attemptId: AttemptId): Promise<unknown>;
  events(
    attemptId: AttemptId,
    options: Readonly<{ afterSequence: number; limit: number }>,
  ): Promise<unknown>;
  pause(
    attemptId: AttemptId,
    reason: string | null,
    retryIdentity: RetryableCommandIdentity | null,
  ): Promise<unknown>;
  resume(
    attemptId: AttemptId,
    reason: string | null,
    retryIdentity: RetryableCommandIdentity | null,
  ): Promise<unknown>;
  cancel(
    attemptId: AttemptId,
    reason: string | null,
    retryIdentity: RetryableCommandIdentity | null,
  ): Promise<unknown>;
  reconcile(
    attemptId: AttemptId | null,
    retryIdentity: RetryableCommandIdentity | null,
  ): Promise<unknown>;
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
  retryIdentity: RetryableCommandIdentity | null;
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
  if ((record.commandId === undefined) !== (record.issuedAt === undefined)) {
    throw new DashboardServerError("commandId and issuedAt must be provided together");
  }
  const retryIdentity =
    record.commandId === undefined || record.issuedAt === undefined
      ? null
      : {
          commandId: CommandIdSchema.parse(record.commandId),
          issuedAt: IsoInstantSchema.parse(record.issuedAt),
        };
  const expectedKeys = new Set(["action", "attemptId", "reason", "commandId", "issuedAt"]);
  if (Object.keys(record).some((key) => !expectedKeys.has(key))) {
    throw new DashboardServerError("action body contains an unexpected field");
  }
  return {
    action: record.action,
    attemptId,
    reason: record.reason as string | null,
    retryIdentity,
  };
}

function positiveTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new TypeError("portfolioTimeoutMs must be between 1 and 60000 milliseconds");
  }
  return value;
}

function attemptListQuery(url: URL): AttemptListQueryV1 {
  const allowedKeys = new Set(["scope", "projectId", "limit", "updatedAt", "attemptId"]);
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new DashboardServerError("attempt list query is invalid");
    }
  }

  const updatedAt = url.searchParams.get("updatedAt");
  const attemptId = url.searchParams.get("attemptId");
  if ((updatedAt === null) !== (attemptId === null)) {
    throw new DashboardServerError("updatedAt and attemptId must be provided together");
  }

  const rawLimit = url.searchParams.get("limit");
  if (rawLimit !== null && !/^(?:[1-9][0-9]*)$/.test(rawLimit)) {
    throw new DashboardServerError("attempt list limit is invalid");
  }

  return AttemptListQueryV1Schema.parse({
    scope: url.searchParams.get("scope") ?? "active",
    projectId: url.searchParams.get("projectId"),
    after: updatedAt === null ? null : { updatedAt, attemptId },
    limit: rawLimit === null ? 50 : Number(rawLimit),
  });
}

function attemptListProjection(value: unknown): AttemptListPageV1 {
  return AttemptListPageV1Schema.parse(value);
}

function portfolioProjection(value: unknown): unknown {
  const snapshot = PortfolioReadModelV1Schema.parse(value);
  const expectedDigest = `sha256:${createHash("sha256")
    .update(canonicalPortfolioReadModelDigestInputV1(snapshot), "utf8")
    .digest("hex")}`;
  if (
    !timingSafeEqual(
      Buffer.from(snapshot.sourceSnapshotDigest, "utf8"),
      Buffer.from(expectedDigest, "utf8"),
    )
  ) {
    throw new DashboardServerError("portfolio source digest does not match its contents");
  }
  return snapshot;
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
        <section id="work-queue" class="panel queue">
          <div class="section-head">
            <div><p class="label">WORK QUEUE</p><h2>Recent attempts</h2></div>
            <form id="queue-filter" class="queue-filter">
              <select id="queue-scope" aria-label="Attempt scope"><option value="active">Active</option><option value="all">All</option></select>
              <input id="queue-project" autocomplete="off" placeholder="Optional project UUID" aria-label="Project ID filter">
              <button>Refresh queue</button>
            </form>
          </div>
          <p id="queue-status" class="queue-status" aria-live="polite">Loading authoritative attempts…</p>
          <ul id="attempt-queue" class="attempt-queue"></ul>
          <button id="queue-more" class="queue-more hidden">Load more</button>
        </section>
        <section class="panel lookup">
          <div><p class="label">ATTEMPT ID</p><h2>Inspect active work</h2></div>
          <form id="lookup-form"><input id="attempt-id" autocomplete="off" placeholder="00000000-0000-4000-8000-000000000000" aria-label="Attempt ID"><button>Load</button></form>
        </section>
        <section id="empty" class="panel empty"><div class="orb"></div><h2>No attempt selected</h2><p>Choose an attempt from the work queue or paste its ID to see authoritative state, blockers, and the exact event timeline.</p></section>
        <section id="attempt" class="attempt hidden">
          <article class="panel summary"><p class="label">CURRENT STATE</p><h2 id="attempt-title">Attempt</h2><div id="attempt-detail" class="detail"></div><div class="actions"><button data-action="pause">Pause</button><button data-action="resume">Resume</button><button data-action="reconcile">Reconcile</button><button data-action="cancel" class="danger">Cancel</button></div></article>
          <article class="panel timeline"><p class="label">DURABLE TIMELINE</p><ol id="events"></ol></article>
        </section>
        <section id="portfolio" class="panel hidden"><div class="section-head"><div><p class="label">ALL PRODUCTS</p><h2>Portfolio health</h2></div><button id="refresh-portfolio">Check source</button></div><div id="portfolio-totals" class="portfolio-totals">Authoritative portfolio source not loaded.</div><div id="portfolio-projects" class="project-grid" aria-live="polite"></div></section>
      </div>
    </section>
  </main>
  <script src="/dashboard.js" defer></script>
</body>
</html>`;

const DASHBOARD_CSS = `:root{color-scheme:dark;--bg:#0b0d0e;--panel:#121616;--line:#26302d;--ink:#f2f2eb;--muted:#89938e;--acid:#c9ff49;--red:#ff765e}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 75% -10%,#22331f 0,transparent 32%),var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;min-height:100vh}main{max-width:1240px;margin:auto;padding:32px}.masthead{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px}.eyebrow,.label{color:var(--acid);font:600 11px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em;margin:0 0 8px}.masthead h1{font-size:38px;letter-spacing:-.045em;margin:0}.health{font:600 12px ui-monospace,monospace;color:var(--muted);display:flex;gap:9px;align-items:center}.health span{width:8px;height:8px;border-radius:50%;background:var(--muted)}.health.live{color:var(--acid)}.health.live span{background:var(--acid);box-shadow:0 0 16px var(--acid)}.hero{display:flex;justify-content:space-between;align-items:end;padding:52px 0 34px}.hero>p{font-size:25px;line-height:1.25;letter-spacing:-.025em;max-width:520px;margin:0}.metrics{display:flex;border:1px solid var(--line);border-radius:12px;overflow:hidden}.metrics article{min-width:128px;padding:15px 18px;border-left:1px solid var(--line)}.metrics article:first-child{border-left:0}.metrics span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.1em}.metrics strong{display:block;margin-top:8px;font-size:15px}.workspace{display:grid;grid-template-columns:180px 1fr;gap:24px}nav{display:flex;flex-direction:column;gap:6px}button,input,select{font:inherit}nav button,.actions button,.section-head>button,.queue-more{background:transparent;color:var(--muted);border:1px solid transparent;border-radius:9px;text-align:left;padding:11px 13px}nav .nav-active{background:#172019;color:var(--acid);border-color:#283927}nav button:disabled{opacity:.35}.content{display:grid;gap:18px}.panel{background:linear-gradient(155deg,#151a19,#101312);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 20px 60px #0004}.lookup,.section-head{display:flex;justify-content:space-between;align-items:center;gap:18px}.lookup h2,.summary h2,.section-head h2{margin:0;font-size:22px;letter-spacing:-.025em}.lookup form,.queue-filter{display:flex;gap:8px;min-width:52%}input,select{width:100%;background:#090b0b;color:var(--ink);border:1px solid #343d3a;border-radius:9px;padding:12px}.queue-filter select{width:auto}.queue-filter button,form button{background:var(--acid);color:#111;border:0;border-radius:9px;padding:0 18px;font-weight:700;white-space:nowrap}.queue-status{color:var(--muted);font:12px/1.5 ui-monospace,monospace;margin:20px 0 10px}.attempt-queue{list-style:none;margin:0;padding:0;display:grid;gap:8px}.queue-item{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 18px;text-align:left;background:#0b0e0d;color:var(--ink);border:1px solid var(--line);border-radius:11px;padding:14px 16px;cursor:pointer}.queue-item:hover,.queue-item:focus-visible{border-color:var(--acid);outline:none}.queue-item strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.queue-item .queue-state{color:var(--acid);font:600 11px ui-monospace,monospace;text-transform:uppercase}.queue-item small{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.queue-item .queue-blocker{color:var(--red)}.queue-more{border-color:#39423f;color:var(--ink);cursor:pointer;margin-top:12px}.empty{text-align:center;padding:76px 24px}.empty h2{margin:18px 0 8px}.empty p{color:var(--muted);margin:auto;max-width:450px}.orb{width:48px;height:48px;background:var(--acid);border-radius:50%;margin:auto;box-shadow:0 0 45px #c9ff4966}.attempt{display:grid;grid-template-columns:1fr 1.2fr;gap:18px}.hidden{display:none!important}.detail{display:grid;gap:8px;margin:22px 0;color:var(--muted);font:13px/1.5 ui-monospace,monospace}.actions{display:flex;gap:8px;flex-wrap:wrap}.actions button,.section-head>button{border-color:#39423f;color:var(--ink);cursor:pointer}.actions .danger{color:var(--red);border-color:#58322b}.timeline ol{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:14px}.timeline li{position:relative;padding-left:22px;color:var(--muted);font:12px/1.5 ui-monospace,monospace}.timeline li:before{content:'';position:absolute;left:0;top:5px;width:7px;height:7px;background:var(--acid);border-radius:50%}.timeline b{display:block;color:var(--ink);font-size:13px}.portfolio-totals{color:var(--muted);font:12px/1.5 ui-monospace,monospace;margin:24px 0}.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.project-card{border:1px solid var(--line);border-radius:12px;padding:17px;background:#0b0e0d}.project-card h3{margin:0 0 7px}.project-card p{margin:5px 0;color:var(--muted);font-size:12px}.project-card .healthy{color:var(--acid)}.project-card .blocked{color:var(--red)}.project-card .attention,.project-card .unknown{color:#ffd166}@media(max-width:800px){main{padding:20px}.hero{display:grid;gap:24px}.metrics{width:100%}.metrics article{min-width:0;flex:1}.workspace{grid-template-columns:1fr}nav{flex-direction:row;overflow:auto}.lookup,.section-head{display:grid;gap:18px}.lookup form,.queue-filter{min-width:0;flex-wrap:wrap}.queue-filter select{width:100%}.attempt{grid-template-columns:1fr}.masthead{align-items:center}}`;

const DASHBOARD_JS = `const csrf=document.querySelector('meta[name=factory-csrf]').content;
const health=document.querySelector('#health');
const attemptId=document.querySelector('#attempt-id');
const queue=document.querySelector('#attempt-queue');
const queueStatus=document.querySelector('#queue-status');
const queueScope=document.querySelector('#queue-scope');
const queueProject=document.querySelector('#queue-project');
const queueMore=document.querySelector('#queue-more');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const display=value=>value===null?'unavailable':String(value);
let selected=null;
let queueAfter=null;
let queueLoading=false;
let queueRefreshPending=false;
const retryIdentities=new Map();
function clearRetryIdentitiesForAttempt(value){for(const key of retryIdentities.keys())if(key.startsWith(value+':'))retryIdentities.delete(key)}
async function api(path,options={}){const response=await fetch(path,{...options,headers:{'content-type':'application/json','x-factory-csrf':csrf,...options.headers}});const value=await response.json();if(!response.ok){const error=new Error(value.error?.message||'Request failed');error.retryIdentity=value.error?.retryIdentity||null;throw error}return value}
async function doctor(){try{const value=await api('/api/doctor');health.className='health live';health.innerHTML='<span></span>Operational';document.querySelector('#daemon-state').textContent=value.result.readiness||'Ready'}catch{health.className='health';health.innerHTML='<span></span>Unavailable';document.querySelector('#daemon-state').textContent='Offline'}}
function attemptRow(item){const attempt=item.attempt;const blocker=attempt.blocker?.summary||'No blocker';return '<li><button class="queue-item" data-attempt-id="'+escapeHtml(attempt.attemptId)+'"><strong>'+escapeHtml(item.title)+'</strong><span class="queue-state">'+escapeHtml(attempt.state)+'</span><small>project '+escapeHtml(item.projectId.slice(0,8))+' · updated '+escapeHtml(attempt.updatedAt)+'</small><small class="'+(attempt.blocker?'queue-blocker':'')+'">'+escapeHtml(blocker)+'</small></button></li>'}
function renderAttemptQueue(items,append){const markup=items.map(attemptRow).join('');if(append)queue.innerHTML+=markup;else queue.innerHTML=markup||'<li class="queue-status">No attempts match this view.</li>'}
async function loadAttempts(append=false){if(queueLoading){if(!append)queueRefreshPending=true;return}queueLoading=true;queueMore.disabled=true;if(!append)queueAfter=null;const params=new URLSearchParams();params.set('scope',queueScope.value||'active');params.set('limit','25');const project=queueProject.value.trim();if(project)params.set('projectId',project);if(append&&queueAfter){params.set('updatedAt',queueAfter.updatedAt);params.set('attemptId',queueAfter.attemptId)}queueStatus.textContent=append?'Loading more attempts…':'Refreshing authoritative attempts…';try{const value=await api('/api/attempts?'+params.toString());renderAttemptQueue(value.page.attempts,append);queueAfter=value.page.nextAfter;queueMore.classList.toggle('hidden',!value.page.hasMore);queueStatus.textContent=(append?'Queue extended':'Queue refreshed')+' · '+value.page.attempts.length+' received'+(value.page.hasMore?' · more available':'')}catch(error){if(!append)queue.textContent='';queueStatus.textContent='Work queue unavailable: '+error.message;queueMore.classList.add('hidden')}finally{queueLoading=false;queueMore.disabled=false;if(queueRefreshPending){queueRefreshPending=false;void loadAttempts(false)}}}
async function loadAttempt(candidate=attemptId.value){const requested=String(candidate).trim();if(!requested)return;try{const value=await api('/api/attempt/'+encodeURIComponent(requested));const attempt=value.status.attempt;selected=attempt.attemptId;attemptId.value=selected;clearRetryIdentitiesForAttempt(selected);document.querySelector('#empty').classList.add('hidden');document.querySelector('#attempt').classList.remove('hidden');document.querySelector('#attempt-title').textContent=attempt.state+' · '+attempt.attemptId.slice(0,8);document.querySelector('#attempt-state').textContent=attempt.state;document.querySelector('#event-count').textContent=value.events.events.length+' events';document.querySelector('#attempt-detail').innerHTML='<span>desired: '+escapeHtml(attempt.desiredState)+'</span><span>revision: '+escapeHtml(attempt.revision)+' · fence: '+escapeHtml(attempt.fence)+'</span><span>blocker: '+escapeHtml(attempt.blocker?.summary||'none')+'</span>';document.querySelector('#events').innerHTML=value.events.events.slice().reverse().map(event=>'<li><b>'+escapeHtml(event.type)+'</b>#'+escapeHtml(event.sequence)+' · '+escapeHtml(event.occurredAt)+'</li>').join('')}catch(error){alert(error.message)}}
function show(view){const portfolio=view==='portfolio';document.querySelector('#work-queue').classList.toggle('hidden',portfolio);document.querySelector('.lookup').classList.toggle('hidden',portfolio);document.querySelector('#empty').classList.toggle('hidden',portfolio||selected!==null);document.querySelector('#attempt').classList.toggle('hidden',portfolio||selected===null);document.querySelector('#portfolio').classList.toggle('hidden',!portfolio);document.querySelector('#nav-run').classList.toggle('nav-active',!portfolio);document.querySelector('#nav-portfolio').classList.toggle('nav-active',portfolio)}
async function loadPortfolio(){try{const value=await api('/api/portfolio');const snapshot=value.snapshot;const totals=snapshot.totals;document.querySelector('#portfolio-totals').textContent=totals.projects+' projects · '+totals.attempts+' attempts · '+totals.activeAttempts+' active · '+totals.blockers+' blockers · PRs '+display(totals.openPullRequests)+' · Jira todo '+display(totals.jiraTodo)+' · P0 '+display(totals.unresolvedP0)+' · P1 '+display(totals.unresolvedP1);document.querySelector('#portfolio-projects').innerHTML=snapshot.projects.length===0?'<p>No local projects recorded yet.</p>':snapshot.projects.map(project=>'<article class="project-card"><h3>'+escapeHtml(project.displayName)+'</h3><p class="'+escapeHtml(project.health)+'">'+escapeHtml(project.health)+'</p><p>lifecycle: '+escapeHtml(display(project.lifecycleStage))+'</p><p>attempts: '+escapeHtml(project.attemptCount)+' total · '+escapeHtml(project.activeAttemptCount)+' active · '+escapeHtml(project.blockerCount)+' blocked</p><p>GitHub PRs: '+escapeHtml(display(project.openPullRequestCount))+'</p><p>Jira: '+escapeHtml(display(project.jiraTodoCount))+' todo · '+escapeHtml(display(project.jiraInProgressCount))+' in progress</p><p>quality: '+escapeHtml(display(project.unresolvedP0))+' P0 · '+escapeHtml(display(project.unresolvedP1))+' P1</p><p>release: '+escapeHtml(display(project.releaseStage))+' · analytics: '+escapeHtml(project.analyticsFreshness)+'</p></article>').join('')}catch(error){document.querySelector('#portfolio-totals').textContent='Portfolio unavailable.';document.querySelector('#portfolio-projects').textContent=error.message}}
document.querySelector('#lookup-form').addEventListener('submit',event=>{event.preventDefault();void loadAttempt()});
document.querySelector('#queue-filter').addEventListener('submit',event=>{event.preventDefault();void loadAttempts(false)});
queueScope.addEventListener('change',()=>void loadAttempts(false));
queueMore.addEventListener('click',()=>void loadAttempts(true));
queue.addEventListener('click',event=>{const button=event.target?.closest?.('[data-attempt-id]');if(!button)return;void loadAttempt(button.dataset.attemptId)});
document.querySelector('#nav-run').addEventListener('click',()=>show('run'));
document.querySelector('#nav-portfolio').addEventListener('click',()=>{show('portfolio');void loadPortfolio()});
document.querySelector('#refresh-portfolio').addEventListener('click',()=>void loadPortfolio());
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{if(!selected)return;button.disabled=true;const retryKey=selected+':'+button.dataset.action;const retryIdentity=retryIdentities.get(retryKey)||{};try{await api('/api/action',{method:'POST',body:JSON.stringify({action:button.dataset.action,attemptId:selected,reason:'Dashboard operator action',...retryIdentity})});clearRetryIdentitiesForAttempt(selected);await loadAttempt(selected);await loadAttempts(false)}catch(error){if(error.retryIdentity){retryIdentities.set(retryKey,error.retryIdentity);alert(error.message+' Click the same action again to retry with its original durable identity.')}else alert(error.message)}finally{button.disabled=false}}));
void doctor();void loadAttempts(false);setInterval(doctor,10000);`;

function deliveryIdentity(
  client: CommandClient,
  retryIdentity: RetryableCommandIdentity | null,
): CommandIdentity {
  return retryIdentity === null
    ? client.createIdentity()
    : client.createRetryIdentity(retryIdentity);
}

export function createDashboardCommandPort(client: CommandClient): DashboardCommandPort {
  return {
    doctor: async () => await client.doctor(),
    listAttempts: async (query, signal) =>
      (await client.listAttempts(query, undefined, signal)).page,
    status: async (attemptId) => await client.status(attemptId),
    events: async (attemptId, options) => await client.events(attemptId, options),
    pause: async (attemptId, reason, retryIdentity) =>
      await client.pause(attemptId, reason, deliveryIdentity(client, retryIdentity)),
    resume: async (attemptId, reason, retryIdentity) =>
      await client.resume(attemptId, reason, deliveryIdentity(client, retryIdentity)),
    cancel: async (attemptId, reason, retryIdentity) =>
      await client.cancel(attemptId, reason, deliveryIdentity(client, retryIdentity)),
    reconcile: async (attemptId, retryIdentity) =>
      await client.reconcile(attemptId, deliveryIdentity(client, retryIdentity)),
    close: () => client.close(),
  };
}

export function createDashboardPortfolioPort(client: CommandClient): DashboardPortfolioPort {
  return {
    snapshot: async (signal) => (await client.portfolioSnapshot(undefined, signal)).snapshot,
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
    if (url.pathname === "/api/attempts" && request.method === "GET") {
      const query = attemptListQuery(url);
      const controller = new AbortController();
      const abort = (): void => controller.abort();
      request.once("aborted", abort);
      response.once("close", abort);
      try {
        const page = attemptListProjection(
          await options.commandPort.listAttempts(query, controller.signal),
        );
        return json(response, 200, { page });
      } finally {
        request.removeListener("aborted", abort);
        response.removeListener("close", abort);
      }
    }
    if (url.pathname === "/api/portfolio" && request.method === "GET") {
      if (options.portfolioPort === undefined) {
        return json(response, 503, {
          error: {
            code: "dashboard.portfolio-unavailable",
            message: "Authoritative portfolio source is not configured.",
          },
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
      try {
        let result: unknown;
        if (body.action === "pause")
          result = await options.commandPort.pause(
            body.attemptId as AttemptId,
            body.reason,
            body.retryIdentity,
          );
        else if (body.action === "resume")
          result = await options.commandPort.resume(
            body.attemptId as AttemptId,
            body.reason,
            body.retryIdentity,
          );
        else if (body.action === "cancel")
          result = await options.commandPort.cancel(
            body.attemptId as AttemptId,
            body.reason,
            body.retryIdentity,
          );
        else result = await options.commandPort.reconcile(body.attemptId, body.retryIdentity);
        return json(response, 200, { result });
      } catch (error) {
        if (error instanceof CommandClientError) {
          return json(response, error.retryable ? 503 : 409, {
            error: {
              code: error.code,
              message: error.message,
              retryable: error.retryable,
              ...(error.retryable && error.retryIdentity !== null
                ? { retryIdentity: error.retryIdentity }
                : {}),
            },
          });
        }
        throw error;
      }
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
        options.commandPort.close();
        closePromise = new Promise<void>((resolvePromise, rejectPromise) => {
          server.close((error) => {
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
