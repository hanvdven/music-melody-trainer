import { spawn } from "child_process";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { Plugin, ViteDevServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Cloudflare R2 ─────────────────────────────────────────────────────────────
let _r2: S3Client | null = null;

// All env reads are lazy (inside functions) to avoid ESM import-hoist / dotenv timing issues
function r2Bucket(): string { return process.env.CLOUDFLARE_R2_BUCKET_NAME || "cyanluna-kanban-images"; }
function r2PublicUrl(): string { return (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, ""); }

function getR2(): S3Client {
  if (_r2) return _r2;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 env vars missing (CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY)");
  }
  _r2 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  return _r2;
}

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await getR2().send(new PutObjectCommand({ Bucket: r2Bucket(), Key: key, Body: buffer, ContentType: contentType }));
}

async function deleteFromR2(key: string): Promise<void> {
  try { await getR2().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key })); } catch { /* ok */ }
}

// PGlite is Postgres-in-WASM with a `.query(text, params)` signature compatible
// with `pg.Pool`, so the entire downstream API (~25 SQL queries, RETURNING,
// ON CONFLICT, json_agg, FILTER, window fns) works unchanged. The only swap is
// in getSql() below. Local-only DB; no DATABASE_URL or pg connection needed.
type Sql = PGlite;
// Han's pipeline (2026-06-26, post-merge): preplan is folded into design
// (model/effort logged as the first step of design); impl_review is folded
// into test (renamed "UAT" in the UI). 10 underlying statuses; the board
// renders 6 visual columns (top row = my work, bottom row = Han's reviews).
// on_hold + cancelled share a "Parking" column with per-card labels.
const BOARD_STATUSES = [
  "todo", "design", "design_review",
  "plan", "plan_review", "impl", "test", "done",
  "on_hold", "cancelled",
] as const;

// Typed query helper: returns T[]
async function q<T>(sql: Sql, text: string, params?: any[]): Promise<T[]> {
  const r = await sql.query(text, params);
  return r.rows as T[];
}

function parseJsonArray(raw: string | null): any[] {
  if (!raw || raw === "null") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLastStatus(raw: string | null): string | null {
  const entries = parseJsonArray(raw);
  const last = entries[entries.length - 1];
  return typeof last?.status === "string" ? last.status : null;
}

function createEtag(parts: Array<string | null | undefined>): string {
  const raw = parts.map((part) => part ?? "").join("|");
  return `W/"${Buffer.from(raw).toString("base64url")}"`;
}

function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (typeof header !== "string" || !header.trim()) return false;
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag);
}

function summarizeBoardTask(task: Task) {
  return {
    id: task.id,
    project: task.project,
    title: task.title,
    status: task.status,
    priority: task.priority,
    level: task.level,
    current_agent: task.current_agent,
    plan_review_count: task.plan_review_count,
    impl_review_count: task.impl_review_count,
    rank: task.rank,
    tags: task.tags,
    created_at: task.created_at,
    completed_at: task.completed_at,
    note_count: parseJsonArray(task.notes).length,
    dependency_count: parseJsonArray(task.dependencies).length,
    last_review_status: getLastStatus(task.review_comments),
    last_plan_review_status: getLastStatus(task.plan_review_comments),
    // #269: surface rework state in the compact board so the red banner shows
    // without fetching the full task.
    needs_reanalysis: !!task.needs_reanalysis,
    open_feedback_count: parseJsonArray(task.rework_feedback).filter((f: any) => !f.addressed).length,
    unmet_criteria_count: parseJsonArray(task.acceptance_criteria).filter((c: any) => !c.verified).length,
  };
}

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

async function readBoardMeta(sql: Sql, projectParam: string | null) {
  if (projectParam) {
    const safe = sanitizeProject(projectParam);
    const [row] = await q<{ total: number | string; updated_at: string | null }>(sql, `
      SELECT COUNT(*)::int AS total, MAX(updated_at) AS updated_at
      FROM tasks
      WHERE project = $1
    `, [safe]);
    const total = Number(row?.total || 0);
    const updatedAt = normalizeTimestamp(row?.updated_at);
    return { total, updated_at: updatedAt, version: `${updatedAt || "0"}:${total}` };
  }

  const [row] = await q<{ total: number | string; updated_at: string | null }>(sql, `
    SELECT COUNT(*)::int AS total, MAX(updated_at) AS updated_at
    FROM tasks
  `);
  const total = Number(row?.total || 0);
  const updatedAt = normalizeTimestamp(row?.updated_at);
  return { total, updated_at: updatedAt, version: `${updatedAt || "0"}:${total}` };
}

async function readBoardCounts(sql: Sql, projectParam: string | null) {
  let rows: Array<{ status: string; total: number | string }>;
  if (projectParam) {
    const safe = sanitizeProject(projectParam);
    rows = await q(sql, `
      SELECT status, COUNT(*)::int AS total
      FROM tasks
      WHERE project = $1
      GROUP BY status
    `, [safe]);
  } else {
    rows = await q(sql, `
      SELECT status, COUNT(*)::int AS total
      FROM tasks
      GROUP BY status
    `);
  }

  const counts = Object.fromEntries(BOARD_STATUSES.map((status) => [status, 0])) as Record<string, number>;
  for (const row of rows) {
    if (BOARD_STATUSES.includes(row.status as typeof BOARD_STATUSES[number])) {
      counts[row.status] = Number(row.total || 0);
    }
  }
  return counts;
}

function sortBoardGroup<T extends { completed_at?: string | null; rank?: number; id?: number }>(status: string, tasks: T[]): T[] {
  const sorted = [...tasks];
  if (status === "done") {
    return sorted.sort((a, b) => {
      const completedOrder = String(b.completed_at || "").localeCompare(String(a.completed_at || ""));
      if (completedOrder !== 0) return completedOrder;
      return Number(a.rank || 0) - Number(b.rank || 0) || Number(a.id || 0) - Number(b.id || 0);
    });
  }
  return sorted.sort((a, b) =>
    Number(b.rank || 0) - Number(a.rank || 0) || Number(b.id || 0) - Number(a.id || 0)
  );
}

// #269: the linear pipeline order, used ONLY to detect BACKWARD moves (a
// bounce-back). Parking states (on_hold/cancelled) are not part of the order.
// A move whose target index is lower than the source index, where the source is
// a review/test gate, means Han is sending work back — which must trigger
// re-analysis. This does NOT restrict movement (see getTransitions below);
// it only classifies the direction so feedback is never silently skipped.
const PIPELINE_ORDER = [
  "todo", "design", "design_review", "plan", "plan_review", "impl", "test", "done",
] as const;
// The gates Han bounces FROM. A backward move out of any of these means rework.
const REVIEW_GATES = new Set(["design_review", "plan_review", "test"]);
function isBackwardBounce(from: string, to: string): boolean {
  if (!REVIEW_GATES.has(from)) return false;
  const fi = PIPELINE_ORDER.indexOf(from as typeof PIPELINE_ORDER[number]);
  const ti = PIPELINE_ORDER.indexOf(to as typeof PIPELINE_ORDER[number]);
  if (fi < 0 || ti < 0) return false; // parking moves are neutral
  return ti < fi;
}

// Han's rule (2026-06-26): tickets can move back to ANY previous stage at
// any time. So we collapse the transition map: every state can transition to
// every other state. Forward flow is encouraged by the visual ordering, not
// enforced. Drag-accidents are accepted as the cost of full freedom.
const ALL_STATUSES: readonly string[] = [...BOARD_STATUSES];
function getTransitions(_level: number): Record<string, string[]> {
  return Object.fromEntries(
    ALL_STATUSES.map((s) => [s, ALL_STATUSES.filter((other) => other !== s)])
  ) as Record<string, string[]>;
}

const STATUS_ALIASES: Record<string, string> = {
  inprogress: "impl",
  review: "impl_review",
};

function normalizeStatus(s: string): string {
  return STATUS_ALIASES[s] || s;
}

function sanitizeProject(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────
const sseClients = new Set<import("http").ServerResponse>();

function broadcast() {
  for (const res of sseClients) {
    try { res.write("data: refresh\n\n"); }
    catch { sseClients.delete(res); }
  }
}

let _sql: Sql | null = null;
let _schemaReady: Promise<void> | null = null;

function getSql(): Sql {
  if (_sql) return _sql;
  // Persistent Postgres-in-WASM (PGlite). Data lives outside the repo so it
  // never pollutes git history. Override location with KANBAN_DB_DIR if needed.
  const dbDir = process.env.KANBAN_DB_DIR
    || path.join(os.homedir(), ".claude", "kanban-board-data");
  mkdirSync(dbDir, { recursive: true });
  _sql = new PGlite(dbDir);
  return _sql;
}

async function initializeSchema(sql: Sql): Promise<void> {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      description TEXT,
      plan TEXT,
      implementation_notes TEXT,
      tags TEXT,
      review_comments TEXT,
      plan_review_comments TEXT,
      test_results TEXT,
      agent_log TEXT,
      current_agent TEXT,
      plan_review_count INTEGER NOT NULL DEFAULT 0,
      impl_review_count INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 3,
      attachments TEXT,
      notes TEXT,
      decision_log TEXT,
      done_when TEXT,
      -- Task dependencies (Han 2026-06-27, ticket #246). JSON array of
      -- { id, targetId, type, createdAt }. type is 's-f' (start-finish: this
      -- task cannot finish until target STARTS) or 'f-f' (finish-finish: this
      -- task cannot finish until target FINISHES). Advisory only — surfaced in
      -- the UI; transitions are not hard-blocked so movement stays unrestricted.
      dependencies TEXT,
      -- #244: interview questions set by Claude during design phase.
      -- JSON array of { id, question, options[], selectedOption?, freeText? }.
      -- Han answers inline in the task card during design_review.
      interviews TEXT,
      -- #269 (Han 2026-06-27): closed-loop feedback so rework is NEVER ignored.
      -- acceptance_criteria: JSON [{ id, text, verified:bool, comment, verifiedAt }]
      --   seeded by the design agent, checked off by Han during UAT.
      acceptance_criteria TEXT,
      -- rework_feedback: JSON [{ id, text, fromStatus, toStatus, addressed:bool,
      --   addressedNote, addressedBy, createdAt, addressedAt }]. Han's bounce-back
      --   feedback lives HERE (not buried in notes); every item must be addressed
      --   before the ticket may re-enter test.
      rework_feedback TEXT,
      -- test_report: free text UAT report Han writes himself during test.
      test_report TEXT,
      -- consistency_requirements: JSON [{ id, text, confirmed:bool }] — the
      --   canonical renderers / fonts / constants this ticket MUST reuse (e.g.
      --   "noteheads via renderMelodyNotes, not hand-rolled Maestro glyphs").
      --   Populated in design/plan; impl agent confirms each before test.
      consistency_requirements TEXT,
      -- needs_reanalysis: set TRUE automatically whenever a ticket moves BACKWARD
      --   out of a review/test stage. Forces the next agent to read rework_feedback
      --   and re-analyse before doing anything. Cleared via /reanalyzed endpoint.
      needs_reanalysis BOOLEAN NOT NULL DEFAULT false,
      rank INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      planned_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ,
      tested_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )
  `);

  const migrations = [
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_comments TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS implementation_notes TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_review_comments TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS test_results TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_log TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_agent TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_review_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS impl_review_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_at TIMESTAMPTZ`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tested_at TIMESTAMPTZ`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 3`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS decision_log TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_when TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    // #246: task dependencies (s-f / f-f). Additive; existing rows get NULL.
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies TEXT`,
    // #244: interview questions. JSON array; answered inline in design_review.
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS interviews TEXT`,
    // #269: closed-loop feedback / acceptance / consistency / re-analysis.
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rework_feedback TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS test_report TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS consistency_requirements TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needs_reanalysis BOOLEAN NOT NULL DEFAULT false`,
  ];
  for (const m of migrations) await sql.query(m);

  await sql.query(`
    UPDATE tasks
    SET updated_at = COALESCE(updated_at, completed_at, tested_at, reviewed_at, planned_at, started_at, created_at, NOW())
    WHERE updated_at IS NULL
  `);

  await sql.query(`
    UPDATE tasks SET rank = sub.new_rank
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (PARTITION BY project, status ORDER BY id) * 1000 AS new_rank
      FROM tasks WHERE rank = 0
    ) sub
    WHERE tasks.id = sub.id AND tasks.rank = 0
  `);
  await sql.query(`UPDATE tasks SET priority = 'high'      WHERE priority = '높음'`);
  await sql.query(`UPDATE tasks SET priority = 'medium'    WHERE priority = '중간'`);
  await sql.query(`UPDATE tasks SET priority = 'low'       WHERE priority = '낮음'`);
  await sql.query(`UPDATE tasks SET status = 'impl'        WHERE status = 'inprogress'`);
  await sql.query(`UPDATE tasks SET status = 'impl_review' WHERE status = 'review'`);

  // ── projects + project_links tables ──
  await sql.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      purpose TEXT,
      stack TEXT,
      brief TEXT,
      status TEXT DEFAULT 'active',
      category TEXT,
      repo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sql.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief TEXT`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS project_settings (
      project TEXT PRIMARY KEY,
      worklog_type TEXT NOT NULL DEFAULT 'work',
      eob_project_id TEXT,
      eob_product_line_id TEXT,
      default_work_type_code TEXT DEFAULT 'ENG-SW',
      label TEXT
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS project_links (
      source_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      target_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      PRIMARY KEY (source_id, target_id, relation)
    )
  `);
}

function ensureSchema(sql: Sql): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = initializeSchema(sql).catch((err) => {
      console.error("[kanban] Schema init failed:", err.message);
      _schemaReady = null;
    });
  }
  return _schemaReady!;
}

async function renumberRanks(sql: Sql, project: string, status: string): Promise<void> {
  await sql.query(`
    UPDATE tasks SET rank = sub.new_rank
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY rank, id) * 1000 AS new_rank
      FROM tasks WHERE project = $1 AND status = $2
    ) sub
    WHERE tasks.id = sub.id
  `, [project, status]);
}

interface ProjectSettings {
  project: string;
  worklog_type: string;
  eob_project_id: string | null;
  eob_product_line_id: string | null;
  default_work_type_code: string;
  label: string | null;
}

interface Task {
  id: number;
  project: string;
  title: string;
  status: string;
  priority: string;
  rank: number;
  description: string | null;
  plan: string | null;
  implementation_notes: string | null;
  tags: string | null;
  review_comments: string | null;
  plan_review_comments: string | null;
  test_results: string | null;
  agent_log: string | null;
  current_agent: string | null;
  plan_review_count: number;
  impl_review_count: number;
  level: number;
  attachments: string | null;
  notes: string | null;
  decision_log: string | null;
  done_when: string | null;
  dependencies: string | null;
  // #244: interview questions; JSON array of { id, question, options[], selectedOption?, freeText? }
  interviews: string | null;
  // #269: closed-loop feedback fields
  acceptance_criteria: string | null;
  rework_feedback: string | null;
  test_report: string | null;
  consistency_requirements: string | null;
  needs_reanalysis: boolean;
  created_at: string;
  started_at: string | null;
  planned_at: string | null;
  reviewed_at: string | null;
  tested_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

interface Board {
  version?: string;
  updated_at?: string | null;
  total?: number;
  counts?: Partial<Record<typeof BOARD_STATUSES[number], number>>;
  todo: Task[];
  design: Task[];
  design_review: Task[];
  plan: Task[];
  plan_review: Task[];
  impl: Task[];
  test: Task[];
  done: Task[];
  on_hold: Task[];
  cancelled: Task[];
  projects: string[];
  project_settings: Record<string, ProjectSettings>;
}

export function kanbanApiPlugin(): Plugin {
  return {
    name: "kanban-api",
    configureServer(server: ViteDevServer) {
      const sql = getSql();
      ensureSchema(sql);

      function parseBody(req: any): Promise<any> {
        return new Promise((resolve) => {
          let body = "";
          req.on("data", (chunk: string) => (body += chunk));
          req.on("end", () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
          });
        });
      }

      server.middlewares.use(async (req, res, next) => {
        const reqUrl = new URL(req.url || "/", "http://localhost");
        const pathname = reqUrl.pathname;

        if (pathname.startsWith("/api/")) {
          await ensureSchema(sql);
        }

        // GET /api/events — SSE stream
        if (pathname === "/api/events" && req.method === "GET") {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.writeHead(200);
          res.write(": connected\n\n");
          sseClients.add(res);
          const keepAlive = setInterval(() => {
            try { res.write(": ping\n\n"); }
            catch { clearInterval(keepAlive); sseClients.delete(res); }
          }, 30000);
          req.on("close", () => { clearInterval(keepAlive); sseClients.delete(res); });
          return;
        }

        // GET /api/info
        if (pathname === "/api/info") {
          // KANBAN_CALLER_PROJECT is set by scripts/start-kanban.mjs in the
          // launching repo so the UI can auto-select the right project on
          // first boot. Falls back to the kanban-board's parent dir name.
          const projectName = process.env.KANBAN_CALLER_PROJECT
            || path.basename(path.resolve(__dirname, "..", ".."));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ projectName }));
          return;
        }

        if (pathname === "/api/board/version" && req.method === "GET") {
          const projectParam = reqUrl.searchParams.get("project");
          const meta = await readBoardMeta(sql, projectParam);
          const etag = createEtag(["board-version", projectParam || "*", meta.version]);
          res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
          res.setHeader("ETag", etag);
          if (etagMatches(req.headers["if-none-match"], etag)) {
            res.statusCode = 304;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            project: projectParam || null,
            ...meta,
          }));
          return;
        }

        // GET /api/board?project=xxx[&summary=true]
        if (pathname === "/api/board") {
          const projectParam = reqUrl.searchParams.get("project");
          const summary = reqUrl.searchParams.get("summary") === "true";
          const compactBoard = summary && reqUrl.searchParams.get("compact") === "board";
          const todoLimit = compactBoard ? Math.max(0, Number.parseInt(reqUrl.searchParams.get("todo_limit") || "10", 10) || 10) : null;
          const doneLimit = compactBoard ? Math.max(0, Number.parseInt(reqUrl.searchParams.get("done_limit") || "10", 10) || 10) : null;
          const fields = summary
            ? `id, project, title, status, priority, level, current_agent,
               plan_review_count, impl_review_count, rank, tags,
               created_at, completed_at,
               review_comments, plan_review_comments, notes, dependencies,
               rework_feedback, acceptance_criteria, needs_reanalysis`
            : `*`;
          const meta = await readBoardMeta(sql, projectParam);
          const counts = await readBoardCounts(sql, projectParam);
          const projectsMeta = projectParam ? await readBoardMeta(sql, null) : meta;
          const etag = createEtag([
            "board",
            summary ? "summary" : "full",
            compactBoard ? "compact-board" : "full-board",
            projectParam || "*",
            compactBoard ? String(todoLimit) : "",
            compactBoard ? String(doneLimit) : "",
            meta.version,
            projectsMeta.version,
          ]);
          res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
          res.setHeader("ETag", etag);
          if (etagMatches(req.headers["if-none-match"], etag)) {
            res.statusCode = 304;
            res.end();
            return;
          }

          const projectRows = await q<{ project: string }>(sql,
            "SELECT DISTINCT project FROM tasks ORDER BY project"
          );
          const projects = projectRows.map((r) => r.project);

          let tasks: Task[];
          if (projectParam) {
            const safe = sanitizeProject(projectParam);
            tasks = await q<Task>(sql,
              `SELECT ${fields} FROM tasks WHERE project = $1 ORDER BY rank DESC, id DESC`, [safe]
            );
          } else {
            tasks = await q<Task>(sql, `SELECT ${fields} FROM tasks ORDER BY rank DESC, id DESC`);
          }

          const boardTasks = summary ? tasks.map(summarizeBoardTask) : tasks;

          const grouped = new Map<string, any[]>();
          for (const t of boardTasks) {
            const arr = grouped.get(t.status);
            if (arr) arr.push(t);
            else grouped.set(t.status, [t]);
          }
          const groupedBoard = Object.fromEntries(
            BOARD_STATUSES.map((status) => {
              const tasksForStatus = sortBoardGroup(status, grouped.get(status) || []);
              if (compactBoard && status === "todo") {
                return [status, tasksForStatus.slice(0, todoLimit ?? 10)];
              }
              if (compactBoard && status === "done") {
                return [status, tasksForStatus.slice(0, doneLimit ?? 10)];
              }
              return [status, tasksForStatus];
            })
          );
          const settingsRows = await q<ProjectSettings>(sql, "SELECT * FROM project_settings ORDER BY project");
          const projectSettingsMap = Object.fromEntries(
            settingsRows.map((row) => [row.project, row])
          ) as Record<string, ProjectSettings>;
          const board: Board = {
            version: meta.version,
            updated_at: meta.updated_at,
            total: meta.total,
            counts,
            todo: groupedBoard.todo || [],
            design: groupedBoard.design || [],
            design_review: groupedBoard.design_review || [],
            plan: groupedBoard.plan || [],
            plan_review: groupedBoard.plan_review || [],
            impl: groupedBoard.impl || [],
            test: groupedBoard.test || [],
            done: groupedBoard.done || [],
            on_hold: groupedBoard.on_hold || [],
            cancelled: groupedBoard.cancelled || [],
            projects,
            project_settings: projectSettingsMap,
          };

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(board));
          return;
        }

        // /api/task/:id
        const taskMatch = pathname.match(/^\/api\/task\/(\d+)$/);
        if (taskMatch) {
          const id = taskMatch[1];
          const projectParam = reqUrl.searchParams.get("project");

          // GET — look up by ID only; project param is ignored for reads
          // (migrated tasks may have project names that differ from sanitized form)
          if (req.method === "GET") {
            const ALLOWED_FIELDS = new Set([
              "id","project","title","status","priority","description","plan",
              "implementation_notes","tags","review_comments","plan_review_comments",
              "test_results","agent_log","current_agent","plan_review_count",
              "impl_review_count","level","attachments","notes","decision_log",
              "done_when","dependencies","interviews",
              "acceptance_criteria","rework_feedback","test_report","consistency_requirements","needs_reanalysis",
              "rank","created_at","started_at","planned_at",
              "reviewed_at","tested_at","completed_at","updated_at",
            ]);
            const fieldsParam = reqUrl.searchParams.get("fields");
            const fields = fieldsParam
              ? ["id", "project", "status",
                  ...fieldsParam.split(",").map(f => f.trim()).filter(f => ALLOWED_FIELDS.has(f))
                ].filter((f, i, a) => a.indexOf(f) === i).join(", ")
              : "*";
            const rows = await q<Task>(sql, `SELECT ${fields} FROM tasks WHERE id = $1`, [id]);
            if (!rows[0]) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "Not found" }));
              return;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(rows[0]));
            return;
          }

          // PATCH
          if (req.method === "PATCH") {
            if (!projectParam) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "project query param required" }));
              return;
            }
            const safe = sanitizeProject(projectParam);
            const body = await parseBody(req);
            if (body.status !== undefined) body.status = normalizeStatus(body.status);

            // #269: read the CURRENT row up front so we can (a) validate the
            // transition and (b) classify a backward bounce for re-analysis.
            let prevStatus: string | null = null;
            let prevRework: any[] = [];
            if (body.status !== undefined) {
              const [task] = await q<{ status: string; level: number; rework_feedback: string | null }>(sql,
                "SELECT status, level, rework_feedback FROM tasks WHERE id = $1", [id]
              );
              if (task) {
                prevStatus = task.status;
                prevRework = parseJsonArray(task.rework_feedback);
                const allowed = getTransitions(task.level)[task.status];
                if (allowed && !allowed.includes(body.status)) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({
                    error: `Invalid transition: ${task.status} -> ${body.status} (L${task.level})`,
                    allowed,
                  }));
                  return;
                }
              }
            }

            const sets: string[] = [];
            const vals: any[] = [];
            let p = 1;

            if (body.status !== undefined) {
              sets.push(`status = $${p++}`); vals.push(body.status);
              // Timestamp side-effects: work starts at design (preplan merged in);
              // plan_review/test/done unchanged.
              if (body.status === "design")           sets.push("started_at = COALESCE(started_at, NOW())");
              else if (body.status === "plan_review") sets.push("planned_at = NOW()");
              else if (body.status === "test")        sets.push("tested_at = NOW()");
              else if (body.status === "done")        sets.push("completed_at = NOW()");
              else if (body.status === "todo")        sets.push("started_at = NULL, planned_at = NULL, completed_at = NULL, reviewed_at = NULL, tested_at = NULL");

              // #269 — BOUNCE DETECTION. If Han sends a ticket BACKWARD out of a
              // review/test gate, flag it for mandatory re-analysis so the next
              // agent CANNOT skip his feedback. Optional `rework_reason` in the
              // body is captured straight into rework_feedback (the dedicated
              // channel) instead of being lost in notes.
              if (prevStatus && isBackwardBounce(prevStatus, body.status)) {
                sets.push("needs_reanalysis = true");
                if (typeof body.rework_reason === "string" && body.rework_reason.trim()) {
                  prevRework.push({
                    id: Date.now(),
                    text: body.rework_reason.trim(),
                    fromStatus: prevStatus,
                    toStatus: body.status,
                    addressed: false,
                    addressedNote: null,
                    addressedBy: null,
                    createdAt: new Date().toISOString(),
                    addressedAt: null,
                  });
                  sets.push(`rework_feedback = $${p++}`); vals.push(JSON.stringify(prevRework));
                }
              }
              // Reaching `done` retires any stale re-analysis flag.
              if (body.status === "done") sets.push("needs_reanalysis = false");
            }
            const j = (v: any) => typeof v === "string" ? v : JSON.stringify(v);
            if (body.title !== undefined)       { sets.push(`title = $${p++}`); vals.push(body.title); }
            if (body.priority !== undefined)    { sets.push(`priority = $${p++}`); vals.push(body.priority); }
            if (body.description !== undefined) { sets.push(`description = $${p++}`); vals.push(body.description); }
            if (body.plan !== undefined)        { sets.push(`plan = $${p++}`); vals.push(body.plan); }
            if (body.implementation_notes !== undefined) { sets.push(`implementation_notes = $${p++}`); vals.push(body.implementation_notes); }
            if (body.tags !== undefined)              { sets.push(`tags = $${p++}`); vals.push(j(body.tags)); }
            if (body.review_comments !== undefined)   { sets.push(`review_comments = $${p++}`); vals.push(j(body.review_comments)); }
            if (body.plan_review_comments !== undefined) { sets.push(`plan_review_comments = $${p++}`); vals.push(j(body.plan_review_comments)); }
            if (body.test_results !== undefined)  { sets.push(`test_results = $${p++}`); vals.push(j(body.test_results)); }
            if (body.agent_log !== undefined)     { sets.push(`agent_log = $${p++}`); vals.push(j(body.agent_log)); }
            if (body.current_agent !== undefined) { sets.push(`current_agent = $${p++}`); vals.push(body.current_agent); }
            if (body.reviewed_at !== undefined)   { sets.push(`reviewed_at = $${p++}`); vals.push(body.reviewed_at); }
            if (body.rank !== undefined)          { sets.push(`rank = $${p++}`); vals.push(body.rank); }
            if (body.level !== undefined)         { sets.push(`level = $${p++}`); vals.push(body.level); }
            if (body.decision_log !== undefined)  { sets.push(`decision_log = $${p++}`); vals.push(body.decision_log); }
            if (body.done_when !== undefined)     { sets.push(`done_when = $${p++}`); vals.push(body.done_when); }
            if (body.dependencies !== undefined)  { sets.push(`dependencies = $${p++}`); vals.push(j(body.dependencies)); }
            if (body.interviews !== undefined)    { sets.push(`interviews = $${p++}`); vals.push(j(body.interviews)); }
            // #269: closed-loop feedback fields.
            if (body.acceptance_criteria !== undefined)      { sets.push(`acceptance_criteria = $${p++}`); vals.push(j(body.acceptance_criteria)); }
            if (body.rework_feedback !== undefined)          { sets.push(`rework_feedback = $${p++}`); vals.push(j(body.rework_feedback)); }
            if (body.test_report !== undefined)              { sets.push(`test_report = $${p++}`); vals.push(body.test_report); }
            if (body.consistency_requirements !== undefined) { sets.push(`consistency_requirements = $${p++}`); vals.push(j(body.consistency_requirements)); }
            if (body.needs_reanalysis !== undefined)         { sets.push(`needs_reanalysis = $${p++}`); vals.push(!!body.needs_reanalysis); }

            if (sets.length > 0) {
              sets.push("updated_at = NOW()");
              vals.push(id, safe);
              await sql.query(
                `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${p++} AND project = $${p}`,
                vals
              );
            }

            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // DELETE
          if (req.method === "DELETE") {
            if (!projectParam) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "project query param required" }));
              return;
            }
            const safe = sanitizeProject(projectParam);
            const [task] = await q<{ attachments: string | null }>(sql,
              "SELECT attachments FROM tasks WHERE id = $1 AND project = $2", [id, safe]
            );
            if (task?.attachments) {
              try {
                for (const a of JSON.parse(task.attachments)) {
                  await deleteFromR2(a.storedName);
                }
              } catch { /* ok */ }
            }
            await sql.query("DELETE FROM tasks WHERE id = $1 AND project = $2", [id, safe]);
            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }

        // PATCH /api/task/:id/reorder
        const reorderMatch = pathname.match(/^\/api\/task\/(\d+)\/reorder$/);
        if (reorderMatch && req.method === "PATCH") {
          const id = parseInt(reorderMatch[1]);
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "project query param required" }));
            return;
          }
          const body = await parseBody(req);
          if (body.status !== undefined) body.status = normalizeStatus(body.status);

          const [task] = await q<Task>(sql, "SELECT * FROM tasks WHERE id = $1", [id]);
          if (!task) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Not found" }));
            return;
          }

          const targetStatus = body.status || task.status;

          if (targetStatus !== task.status) {
            const allowed = getTransitions(task.level)[task.status];
            if (allowed && !allowed.includes(targetStatus)) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                error: `Invalid transition: ${task.status} -> ${targetStatus} (L${task.level})`,
                allowed,
              }));
              return;
            }
            const sets = [`status = $1`];
            if (targetStatus === "design")            sets.push("started_at = COALESCE(started_at, NOW())");
            else if (targetStatus === "plan_review")  sets.push("planned_at = NOW()");
            else if (targetStatus === "test")         sets.push("tested_at = NOW()");
            else if (targetStatus === "done")         sets.push("completed_at = NOW()");
            else if (targetStatus === "todo")         sets.push("started_at = NULL, planned_at = NULL, completed_at = NULL, reviewed_at = NULL, tested_at = NULL");
            // #269: a backward DRAG out of a review/test gate is a bounce —
            // flag for mandatory re-analysis (same rule as the PATCH path, so
            // the drag workflow can't silently skip Han's feedback).
            if (isBackwardBounce(task.status, targetStatus)) sets.push("needs_reanalysis = true");
            else if (targetStatus === "done")               sets.push("needs_reanalysis = false");
            await sql.query(`UPDATE tasks SET ${sets.join(", ")} WHERE id = $2`, [targetStatus, id]);
          }

          const afterId = body.afterId as number | null;
          const beforeId = body.beforeId as number | null;
          let newRank: number;

          if (afterId && beforeId) {
            const [above] = await q<{ rank: number }>(sql, "SELECT rank FROM tasks WHERE id = $1", [afterId]);
            const [below] = await q<{ rank: number }>(sql, "SELECT rank FROM tasks WHERE id = $1", [beforeId]);
            if (above && below) {
              newRank = Math.floor((above.rank + below.rank) / 2);
              if (newRank === above.rank) {
                await renumberRanks(sql, task.project, targetStatus);
                const [a2] = await q<{ rank: number }>(sql, "SELECT rank FROM tasks WHERE id = $1", [afterId]);
                const [b2] = await q<{ rank: number }>(sql, "SELECT rank FROM tasks WHERE id = $1", [beforeId]);
                newRank = Math.floor((a2.rank + b2.rank) / 2);
              }
            } else { newRank = 1000; }
          } else if (afterId) {
            // afterId = visually above = higher rank in DESC order
            // Drop at bottom: need rank LOWER than afterId
            const [above] = await q<{ rank: number }>(sql, "SELECT rank FROM tasks WHERE id = $1", [afterId]);
            if (above) {
              newRank = above.rank - 1000;
            } else { newRank = 1000; }
          } else if (beforeId) {
            // beforeId = visually below = lower rank in DESC order
            // Drop at top: need rank HIGHER than beforeId
            const [below] = await q<{ rank: number }>(sql, "SELECT rank FROM tasks WHERE id = $1", [beforeId]);
            newRank = below ? below.rank + 1000 : 1000;
          } else { newRank = 1000; }

          await sql.query("UPDATE tasks SET rank = $1, updated_at = NOW() WHERE id = $2", [newRank, id]);

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, rank: newRank }));
          return;
        }

        // POST /api/task
        if (pathname === "/api/task" && req.method === "POST") {
          const body = await parseBody(req);
          if (!body.project) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "body.project is required" }));
            return;
          }
          const safe = sanitizeProject(body.project);
          const title = body.title || "Untitled";
          const priority = body.priority || "medium";
          const description = body.description || null;
          const tags = body.tags !== undefined
            ? (typeof body.tags === "string" ? body.tags : JSON.stringify(body.tags))
            : null;
          const level = body.level !== undefined ? parseInt(body.level) || 3 : 3;

          const [maxRow] = await q<{ maxrank: number | null }>(sql,
            "SELECT MAX(rank) AS maxrank FROM tasks WHERE project = $1 AND status = 'todo'", [safe]
          );
          const rank = (maxRow?.maxrank ?? 0) + 1;

          const [row] = await q<{ id: number }>(sql,
            `INSERT INTO tasks (project, title, priority, description, tags, rank, level)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [safe, title, priority, description, tags, rank, level]
          );

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, id: row.id }));
          return;
        }

        // POST /api/task/:id/review
        const reviewMatch = pathname.match(/^\/api\/task\/(\d+)\/review$/);
        if (reviewMatch && req.method === "POST") {
          const id = reviewMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);

          const [task] = await q<{ review_comments: string | null; impl_review_count: number; level: number }>(sql,
            "SELECT review_comments, impl_review_count, level FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const comments = task.review_comments ? JSON.parse(task.review_comments) : [];
          const newComment = { reviewer: body.reviewer || "claude-review-agent", status: body.status, comment: body.comment, timestamp: new Date().toISOString() };
          comments.push(newComment);

          const approvedTarget = task.level <= 2 ? "done" : "test";
          const newStatus = body.status === "approved" ? approvedTarget : "impl";
          let updateQ = `UPDATE tasks SET review_comments = $1, reviewed_at = NOW(), updated_at = NOW(), status = $2, impl_review_count = $3`;
          const vals: any[] = [JSON.stringify(comments), newStatus, task.impl_review_count + 1];
          if (newStatus === "test") updateQ += ", tested_at = NOW()";
          else if (newStatus === "done") updateQ += ", completed_at = NOW()";
          await sql.query(updateQ + " WHERE id = $4 AND project = $5", [...vals, id, safe]);

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, newStatus, comment: newComment }));
          return;
        }

        // POST /api/task/:id/plan-review
        const planReviewMatch = pathname.match(/^\/api\/task\/(\d+)\/plan-review$/);
        if (planReviewMatch && req.method === "POST") {
          const id = planReviewMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);

          const [task] = await q<{ plan_review_comments: string | null; plan_review_count: number }>(sql,
            "SELECT plan_review_comments, plan_review_count FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const comments = task.plan_review_comments ? JSON.parse(task.plan_review_comments) : [];
          const newComment = { reviewer: body.reviewer || "plan-review-agent", status: body.status, comment: body.comment, timestamp: new Date().toISOString() };
          comments.push(newComment);

          const newStatus = body.status === "approved" ? "impl" : "plan";
          await sql.query(
            "UPDATE tasks SET plan_review_comments = $1, updated_at = NOW(), status = $2, plan_review_count = $3 WHERE id = $4 AND project = $5",
            [JSON.stringify(comments), newStatus, task.plan_review_count + 1, id, safe]
          );

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, newStatus, comment: newComment }));
          return;
        }

        // POST /api/task/:id/test-result
        const testResultMatch = pathname.match(/^\/api\/task\/(\d+)\/test-result$/);
        if (testResultMatch && req.method === "POST") {
          const id = testResultMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);

          const [task] = await q<{ test_results: string | null }>(sql,
            "SELECT test_results FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const results = task.test_results ? JSON.parse(task.test_results) : [];
          const newResult = { tester: body.tester || "test-runner-agent", status: body.status, lint: body.lint || null, build: body.build || null, tests: body.tests || null, comment: body.comment || null, timestamp: new Date().toISOString() };
          results.push(newResult);

          const newStatus = body.status === "pass" ? "done" : "impl";
          let updateQ = `UPDATE tasks SET test_results = $1, updated_at = NOW(), status = $2`;
          if (newStatus === "done") updateQ += ", completed_at = NOW()";
          await sql.query(updateQ + " WHERE id = $3 AND project = $4", [JSON.stringify(results), newStatus, id, safe]);

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, newStatus, result: newResult }));
          return;
        }

        // ── #269: closed-loop feedback endpoints ──────────────────────────────
        // POST /api/task/:id/feedback
        // Body: { text, author?, fromStatus?, toStatus? }
        // Han (or the UI) records a piece of rework feedback in the DEDICATED
        // channel (not notes) and the ticket is flagged needs_reanalysis. Every
        // such item must later be marked addressed before the ticket re-enters test.
        const feedbackMatch = pathname.match(/^\/api\/task\/(\d+)\/feedback$/);
        if (feedbackMatch && req.method === "POST") {
          const id = feedbackMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);
          if (!body.text || !String(body.text).trim()) { res.statusCode = 400; res.end(JSON.stringify({ error: "text required" })); return; }
          const [task] = await q<{ rework_feedback: string | null }>(sql,
            "SELECT rework_feedback FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }
          const items = parseJsonArray(task.rework_feedback);
          const item = {
            id: Date.now(),
            text: String(body.text).trim(),
            author: body.author || "han",
            fromStatus: body.fromStatus || null,
            toStatus: body.toStatus || null,
            addressed: false,
            addressedNote: null,
            addressedBy: null,
            createdAt: new Date().toISOString(),
            addressedAt: null,
          };
          items.push(item);
          await sql.query(
            "UPDATE tasks SET rework_feedback = $1, needs_reanalysis = true, updated_at = NOW() WHERE id = $2 AND project = $3",
            [JSON.stringify(items), id, safe]
          );
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, item }));
          return;
        }

        // POST /api/task/:id/feedback/:fid/address
        // Body: { addressedBy, addressedNote }
        // An agent marks ONE feedback item resolved, recording HOW it was
        // addressed. This is the audit trail proving Han's point was handled.
        const addrMatch = pathname.match(/^\/api\/task\/(\d+)\/feedback\/(\d+)\/address$/);
        if (addrMatch && req.method === "POST") {
          const id = addrMatch[1];
          const fid = Number(addrMatch[2]);
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);
          const [task] = await q<{ rework_feedback: string | null }>(sql,
            "SELECT rework_feedback FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }
          const items = parseJsonArray(task.rework_feedback);
          const target = items.find((f: any) => f.id === fid);
          if (!target) { res.statusCode = 404; res.end(JSON.stringify({ error: `feedback item ${fid} not found` })); return; }
          target.addressed = true;
          target.addressedNote = body.addressedNote || null;
          target.addressedBy = body.addressedBy || "claude";
          target.addressedAt = new Date().toISOString();
          await sql.query(
            "UPDATE tasks SET rework_feedback = $1, updated_at = NOW() WHERE id = $2 AND project = $3",
            [JSON.stringify(items), id, safe]
          );
          const openLeft = items.filter((f: any) => !f.addressed).length;
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, item: target, open_feedback_count: openLeft }));
          return;
        }

        // POST /api/task/:id/reanalyzed
        // Body: { by, summary }
        // An agent acknowledges it has RE-READ the rework feedback + acceptance
        // criteria and re-analysed before working. Clears needs_reanalysis and
        // appends an audit note. Refuses to clear while feedback is still open.
        const reanalyzedMatch = pathname.match(/^\/api\/task\/(\d+)\/reanalyzed$/);
        if (reanalyzedMatch && req.method === "POST") {
          const id = reanalyzedMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);
          const [task] = await q<{ notes: string | null }>(sql,
            "SELECT notes FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }
          const notes = parseJsonArray(task.notes);
          notes.push({
            id: Date.now(),
            text: `[re-analysis] ${body.summary || "Re-read rework feedback + acceptance criteria before working."}`,
            author: body.by || "claude",
            timestamp: new Date().toISOString(),
          });
          await sql.query(
            "UPDATE tasks SET needs_reanalysis = false, notes = $1, updated_at = NOW() WHERE id = $2 AND project = $3",
            [JSON.stringify(notes), id, safe]
          );
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // POST /api/task/:id/note
        const noteMatch = pathname.match(/^\/api\/task\/(\d+)\/note$/);
        if (noteMatch && req.method === "POST") {
          const id = noteMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);

          const [task] = await q<{ notes: string | null }>(sql,
            "SELECT notes FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const notes = task.notes ? JSON.parse(task.notes) : [];
          const note = { id: Date.now(), text: body.text || "", author: body.author || "user", timestamp: new Date().toISOString() };
          notes.push(note);

          await sql.query("UPDATE tasks SET notes = $1, updated_at = NOW() WHERE id = $2 AND project = $3", [JSON.stringify(notes), id, safe]);
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, note }));
          return;
        }

        // DELETE /api/task/:id/note/:noteId
        const noteDeleteMatch = pathname.match(/^\/api\/task\/(\d+)\/note\/(\d+)$/);
        if (noteDeleteMatch && req.method === "DELETE") {
          const id = noteDeleteMatch[1];
          const noteId = parseInt(noteDeleteMatch[2]);
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);

          const [task] = await q<{ notes: string | null }>(sql,
            "SELECT notes FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const notes = (task.notes ? JSON.parse(task.notes) : []).filter((n: any) => n.id !== noteId);
          await sql.query("UPDATE tasks SET notes = $1, updated_at = NOW() WHERE id = $2 AND project = $3", [JSON.stringify(notes), id, safe]);
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // POST /api/task/:id/dependency  (#246)
        // Body: { targetId, type }  type ∈ {'s-f','f-f'}
        //   s-f = start-finish : this task can't finish until target STARTS
        //   f-f = finish-finish: this task can't finish until target FINISHES
        const depMatch = pathname.match(/^\/api\/task\/(\d+)\/dependency$/);
        if (depMatch && req.method === "POST") {
          const id = depMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);
          const body = await parseBody(req);

          const type = String(body.type || "");
          if (type !== "s-f" && type !== "f-f") {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "type must be 's-f' or 'f-f'" }));
            return;
          }
          const targetId = parseInt(body.targetId, 10);
          if (!Number.isFinite(targetId)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "targetId required (number)" }));
            return;
          }
          // A task may not depend on itself — that's never satisfiable.
          if (String(targetId) === String(id)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "a task cannot depend on itself" }));
            return;
          }

          const [task] = await q<{ dependencies: string | null }>(sql,
            "SELECT dependencies FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }
          // Target must exist (project param ignored for the existence check, to
          // match GET semantics where migrated tasks may carry a different project).
          const [target] = await q<{ id: number }>(sql, "SELECT id FROM tasks WHERE id = $1", [targetId]);
          if (!target) { res.statusCode = 400; res.end(JSON.stringify({ error: `target task #${targetId} not found` })); return; }

          const deps = task.dependencies ? JSON.parse(task.dependencies) : [];
          // Idempotent: don't add a duplicate (same target + type).
          if (!deps.some((d: any) => d.targetId === targetId && d.type === type)) {
            deps.push({ id: Date.now(), targetId, type, createdAt: new Date().toISOString() });
          }
          await sql.query("UPDATE tasks SET dependencies = $1, updated_at = NOW() WHERE id = $2 AND project = $3", [JSON.stringify(deps), id, safe]);
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, dependencies: deps }));
          return;
        }

        // DELETE /api/task/:id/dependency/:depId  (#246)
        const depDeleteMatch = pathname.match(/^\/api\/task\/(\d+)\/dependency\/(\d+)$/);
        if (depDeleteMatch && req.method === "DELETE") {
          const id = depDeleteMatch[1];
          const depId = parseInt(depDeleteMatch[2], 10);
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);

          const [task] = await q<{ dependencies: string | null }>(sql,
            "SELECT dependencies FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const deps = (task.dependencies ? JSON.parse(task.dependencies) : []).filter((d: any) => d.id !== depId);
          await sql.query("UPDATE tasks SET dependencies = $1, updated_at = NOW() WHERE id = $2 AND project = $3", [JSON.stringify(deps), id, safe]);
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, dependencies: deps }));
          return;
        }

        // POST /api/task/:id/attachment
        const attachmentMatch = pathname.match(/^\/api\/task\/(\d+)\/attachment$/);
        if (attachmentMatch && req.method === "POST") {
          const id = attachmentMatch[1];
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);

          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          await new Promise<void>((resolve) => req.on("end", resolve));
          let body: any;
          try { body = JSON.parse(Buffer.concat(chunks).toString()); }
          catch { res.statusCode = 400; res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

          const [task] = await q<{ attachments: string | null }>(sql,
            "SELECT attachments FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const filename = (body.filename || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_");
          const ext = path.extname(filename) || ".png";
          const safeName = `${id}_${Date.now()}${ext}`;
          const mimeTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
          const contentType = mimeTypes[ext.toLowerCase()] || "application/octet-stream";
          const buffer = Buffer.from(body.data.replace(/^data:[^;]+;base64,/, ""), "base64");
          await uploadToR2(safeName, buffer, contentType);

          const attachments = task.attachments ? JSON.parse(task.attachments) : [];
          attachments.push({ filename: body.filename || "image.png", storedName: safeName, url: `${r2PublicUrl()}/${safeName}`, size: buffer.byteLength, uploaded_at: new Date().toISOString() });
          await sql.query("UPDATE tasks SET attachments = $1, updated_at = NOW() WHERE id = $2 AND project = $3", [JSON.stringify(attachments), id, safe]);

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, attachment: attachments[attachments.length - 1] }));
          return;
        }

        // DELETE /api/task/:id/attachment/:filename
        const attachmentDeleteMatch = pathname.match(/^\/api\/task\/(\d+)\/attachment\/([^/]+)$/);
        if (attachmentDeleteMatch && req.method === "DELETE") {
          const id = attachmentDeleteMatch[1];
          const storedName = decodeURIComponent(attachmentDeleteMatch[2]);
          const projectParam = reqUrl.searchParams.get("project");
          if (!projectParam) { res.statusCode = 400; res.end(JSON.stringify({ error: "project query param required" })); return; }
          const safe = sanitizeProject(projectParam);

          const [task] = await q<{ attachments: string | null }>(sql,
            "SELECT attachments FROM tasks WHERE id = $1 AND project = $2", [id, safe]
          );
          if (!task) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

          const attachments = task.attachments ? JSON.parse(task.attachments) : [];
          const idx = attachments.findIndex((a: any) => a.storedName === storedName);
          if (idx >= 0) {
            const [removed] = attachments.splice(idx, 1);
            await deleteFromR2(removed.storedName);
            await sql.query("UPDATE tasks SET attachments = $1, updated_at = NOW() WHERE id = $2 AND project = $3", [JSON.stringify(attachments), id, safe]);
          }

          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // GET /api/project-settings — list all project settings
        if (pathname === "/api/project-settings" && req.method === "GET") {
          const rows = await q<ProjectSettings>(sql, "SELECT * FROM project_settings ORDER BY project");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(rows));
          return;
        }

        // GET/PUT /api/project-settings/:project
        const settingsMatch = pathname.match(/^\/api\/project-settings\/(.+)$/);
        if (settingsMatch) {
          const project = sanitizeProject(decodeURIComponent(settingsMatch[1]));

          if (req.method === "GET") {
            const [row] = await q<ProjectSettings>(sql, "SELECT * FROM project_settings WHERE project = $1", [project]);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(row || {
              project,
              worklog_type: "work",
              eob_project_id: null,
              eob_product_line_id: null,
              default_work_type_code: "ENG-SW",
              label: null,
            }));
            return;
          }

          if (req.method === "PUT") {
            const body = await parseBody(req);
            await sql.query(`
              INSERT INTO project_settings (project, worklog_type, eob_project_id, eob_product_line_id, default_work_type_code, label)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (project) DO UPDATE SET
                worklog_type = EXCLUDED.worklog_type,
                eob_project_id = EXCLUDED.eob_project_id,
                eob_product_line_id = EXCLUDED.eob_product_line_id,
                default_work_type_code = EXCLUDED.default_work_type_code,
                label = EXCLUDED.label
            `, [
              project,
              body.worklog_type || "work",
              body.eob_project_id || null,
              body.eob_product_line_id || null,
              body.default_work_type_code || "ENG-SW",
              body.label || null,
            ]);
            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }

        // GET /api/uploads/:filename — redirect to R2 public URL
        const uploadsMatch = pathname.match(/^\/api\/uploads\/([^/]+)$/);
        if (uploadsMatch && req.method === "GET") {
          const safeName = decodeURIComponent(uploadsMatch[1]).replace(/[^a-zA-Z0-9._-]/g, "_");
          res.statusCode = 302;
          res.setHeader("Location", `${r2PublicUrl()}/${safeName}`);
          res.end();
          return;
        }

        // ── Projects API ──────────────────────────────────────────────────────

        // GET /api/projects — List all with links
        if (pathname === "/api/projects" && req.method === "GET") {
          const rows = await q(sql, `
            SELECT p.*,
              COALESCE(json_agg(json_build_object(
                'source_id', pl.source_id, 'target_id', pl.target_id, 'relation', pl.relation
              )) FILTER (WHERE pl.source_id IS NOT NULL), '[]') AS links
            FROM projects p
            LEFT JOIN project_links pl ON p.id = pl.source_id OR p.id = pl.target_id
            GROUP BY p.id
            ORDER BY p.category, p.name
          `);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ projects: rows }));
          return;
        }

        // POST /api/projects — Create/Upsert
        if (pathname === "/api/projects" && req.method === "POST") {
          const body = await parseBody(req);
          if (!body.id || !body.name) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "id and name are required" }));
            return;
          }
          const [row] = await q(sql, `
            INSERT INTO projects (id, name, purpose, stack, brief, status, category, repo_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              purpose = COALESCE(EXCLUDED.purpose, projects.purpose),
              stack = COALESCE(EXCLUDED.stack, projects.stack),
              brief = COALESCE(EXCLUDED.brief, projects.brief),
              status = COALESCE(EXCLUDED.status, projects.status),
              category = COALESCE(EXCLUDED.category, projects.category),
              repo_url = COALESCE(EXCLUDED.repo_url, projects.repo_url),
              updated_at = NOW()
            RETURNING *
          `, [body.id, body.name, body.purpose || null, body.stack || null, body.brief || null, body.status || 'active', body.category || null, body.repo_url || null]);
          res.setHeader("Content-Type", "application/json");
          broadcast();
          res.end(JSON.stringify({ success: true, project: row }));
          return;
        }

        // /api/projects/:id routes
        const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (projectMatch) {
          const projectId = decodeURIComponent(projectMatch[1]);

          // GET /api/projects/:id — Single project with task stats
          if (req.method === "GET") {
            const [project] = await q(sql, "SELECT * FROM projects WHERE id = $1", [projectId]);
            if (!project) {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Project not found" }));
              return;
            }
            const taskCounts = await q<{ status: string; count: number }>(sql, "SELECT status, COUNT(*)::int AS count FROM tasks WHERE project = $1 GROUP BY status", [projectId]);
            const links = await q(sql, "SELECT * FROM project_links WHERE source_id = $1 OR target_id = $1", [projectId]);
            const counts: Record<string, number> = {};
            for (const row of taskCounts) {
              counts[row.status] = row.count;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ...project, task_counts: counts, links }));
            return;
          }

          // PATCH /api/projects/:id — Update
          if (req.method === "PATCH") {
            const body = await parseBody(req);
            const sets: string[] = [];
            const values: any[] = [];
            let position = 1;
            const assign = (field: string, value: any) => {
              if (value === undefined) return;
              sets.push(`${field} = $${position++}`);
              values.push(value);
            };
            assign("name", body.name);
            assign("purpose", body.purpose);
            assign("stack", body.stack);
            assign("brief", body.brief);
            assign("status", body.status);
            assign("category", body.category);
            assign("repo_url", body.repo_url);
            if (sets.length === 0) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "No fields to update" }));
              return;
            }
            sets.push("updated_at = NOW()");
            values.push(projectId);
            await sql.query(`UPDATE projects SET ${sets.join(", ")} WHERE id = $${position}`, values);
            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // DELETE /api/projects/:id
          if (req.method === "DELETE") {
            await sql.query("DELETE FROM projects WHERE id = $1", [projectId]);
            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }

        // /api/projects/:id/links routes
        const projectLinksMatch = pathname.match(/^\/api\/projects\/([^/]+)\/links$/);
        if (projectLinksMatch) {
          const projectId = decodeURIComponent(projectLinksMatch[1]);

          // GET /api/projects/:id/links
          if (req.method === "GET") {
            const links = await q(sql, "SELECT * FROM project_links WHERE source_id = $1 OR target_id = $1", [projectId]);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ links }));
            return;
          }

          // POST /api/projects/:id/links
          if (req.method === "POST") {
            const body = await parseBody(req);
            if (!body.target_id || !body.relation) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "target_id and relation are required" }));
              return;
            }
            await sql.query(
              "INSERT INTO project_links (source_id, target_id, relation) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
              [projectId, body.target_id, body.relation]
            );
            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }

          // DELETE /api/projects/:id/links
          if (req.method === "DELETE") {
            const body = await parseBody(req);
            if (!body.target_id || !body.relation) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "target_id and relation are required" }));
              return;
            }
            await sql.query(
              "DELETE FROM project_links WHERE source_id = $1 AND target_id = $2 AND relation = $3",
              [projectId, body.target_id, body.relation]
            );
            res.setHeader("Content-Type", "application/json");
            broadcast();
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }

        // ── Bitbucket PR Webhook ──────────────────────────────
        const webhookLog: Array<{ ts: string; event: string; repo: string; prId: number; prUrl: string; status: string }> =
          (globalThis as any).__webhookLog ??= [];

        if (pathname === "/api/webhook/bitbucket" && req.method === "POST") {
          const eventKey = req.headers["x-event-key"] as string || "";
          const body = await parseBody(req);

          if (!eventKey.startsWith("pullrequest:")) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, skipped: true, reason: `unhandled event: ${eventKey}` }));
            return;
          }

          const pr = body?.pullrequest;
          const prUrl = pr?.links?.html?.href;
          if (!prUrl) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "missing pullrequest.links.html.href" }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, event: eventKey, prUrl }));

          const entry = { ts: new Date().toISOString(), event: eventKey, repo: body?.repository?.slug ?? "unknown", prId: pr?.id ?? 0, prUrl, status: "spawned" };
          webhookLog.unshift(entry);
          if (webhookLog.length > 50) webhookLog.length = 50;

          const child = spawn("claude", ["-p", `/javis-review-pr ${prUrl}`], {
            cwd: path.resolve(os.homedir(), "Dev", "jarvis.gerald"),
            detached: true, stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, HOME: os.homedir() },
          });
          let stdout = "", stderr = "";
          child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
          child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
          child.on("close", (code: number | null) => {
            entry.status = code === 0 ? "done" : `exit:${code}`;
            if (stderr) console.error(`[webhook] stderr: ${stderr.slice(0, 500)}`);
            if (stdout) console.log(`[webhook] stdout: ${stdout.slice(-500)}`);
          });
          child.on("error", (err: Error) => { entry.status = `error: ${err.message}`; });
          child.unref();
          return;
        }

        if (pathname === "/api/webhook/log" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(webhookLog));
          return;
        }

        next();
      });
    },
  };
}
