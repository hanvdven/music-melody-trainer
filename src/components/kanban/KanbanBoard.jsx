import React, { useEffect, useState, useCallback } from 'react';
import bundledData from '../../../kanban.json';
import logger from '../../utils/logger';
import './KanbanBoard.css';

// In-app kanban board (Han 2026-06-22: "via debug -> kanban en een terugknop").
//
// Standalone viewer/editor of the repo-root kanban.json ("Los: bord = kanban.json"). Follows the
// cyanluna MODEL (7-column pipeline, status ids, rank scheme, compatible schema) but is a clean-room
// React implementation — it does NOT use cyanluna's Postgres-backed board code.
//
// Data flow:
//   load   : GET /api/kanban (dev server, authoritative live file) → else localStorage cache → else
//            the bundled kanban.json imported at build time.
//   persist: POST /api/kanban (dev) → else localStorage cache (read-only persistence in a static build).
//
// §3a (debug hit boxes): this whole board is itself a debug-only surface. Its interactive elements
// are plain HTML cards/columns that ARE their own visible hit regions (no invisible SVG hit targets
// to visualise), so the rule is satisfied by construction.

const LS_KEY = 'kanban-board-cache';
const RANK_GAP = 1000;   // cyanluna rank scheme: gaps let cards be inserted without renumbering

const PRIORITY_COLOR = { high: '#e06c6c', medium: '#d6a84e', low: '#7a8a99' };

// Load order: live dev file → localStorage cache → bundled build-time copy.
async function loadBoard() {
  try {
    const r = await fetch('/api/kanban', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch {
    // dev API absent (static build) — fall through to cache/bundle
  }
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // ignore corrupt cache
  }
  return bundledData;
}

// Persist one card move via the dev API. The server writes to the active store (cyanluna agent DB
// when present, else kanban.json) and tells us which via `store`. If the API is absent (static
// build) we cache the whole board to localStorage so the move survives a reload.
async function patchTask(id, status, rank, boardForCache) {
  try {
    const r = await fetch(`/api/kanban/task/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rank }),
    });
    if (r.ok) {
      const body = await r.json().catch(() => ({}));
      return body.store || 'file';     // 'db' | 'json'
    }
  } catch {
    // fall through to localStorage
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(boardForCache));
    return 'local';
  } catch (err) {
    logger.error('KanbanBoard', 'E021-KANBAN-PERSIST', err);
    return 'error';
  }
}

// initialData lets tests inject a board synchronously and skip the async load.
const KanbanBoard = ({ onBack, initialData = null }) => {
  const [board, setBoard] = useState(initialData);
  const [saveState, setSaveState] = useState('');   // '', 'file', 'local', 'error'
  const [dragId, setDragId] = useState(null);

  useEffect(() => {
    if (initialData) return;            // test / preloaded path
    let alive = true;
    loadBoard().then((b) => { if (alive) setBoard(b); });
    return () => { alive = false; };
  }, [initialData]);

  const moveTask = useCallback((taskId, targetStatus) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const task = prev.tasks.find((t) => t.id === taskId);
      if (!task || task.status === targetStatus) return prev;
      // Append to the bottom of the target column using the rank-gap scheme (cyanluna model).
      const maxRank = prev.tasks
        .filter((t) => t.status === targetStatus)
        .reduce((m, t) => Math.max(m, t.rank || 0), 0);
      const newRank = maxRank + RANK_GAP;
      const tasks = prev.tasks.map((t) =>
        t.id === taskId ? { ...t, status: targetStatus, rank: newRank } : t
      );
      const next = { ...prev, tasks };
      patchTask(taskId, targetStatus, newRank, next).then(setSaveState);
      return next;
    });
  }, []);

  if (!board) {
    return (
      <div className="kanban-overlay">
        <div className="kanban-bar">
          <button className="kanban-back" onClick={onBack}>← Terug</button>
          <span className="kanban-title">Kanban</span>
        </div>
        <div className="kanban-loading">Laden…</div>
      </div>
    );
  }

  const columns = board.columns || [];
  const tasks = board.tasks || [];

  return (
    <div className="kanban-overlay">
      <div className="kanban-bar">
        <button className="kanban-back" onClick={onBack}>← Terug</button>
        <span className="kanban-title">Kanban — {board.project}</span>
        <span className="kanban-meta">
          {tasks.length} taken · bron: {board.store === 'db' ? 'agent-DB (live)' : 'kanban.json'}
          {saveState === 'db' && ' · opgeslagen → agent-DB'}
          {saveState === 'json' && ' · opgeslagen → kanban.json'}
          {saveState === 'local' && ' · lokaal opgeslagen (geen dev-server)'}
          {saveState === 'error' && ' · opslaan mislukt'}
        </span>
      </div>

      <div className="kanban-columns">
        {columns.map((col) => {
          const colTasks = tasks
            .filter((t) => t.status === col.id)
            .sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.id - b.id);
          return (
            <div
              key={col.id}
              className="kanban-column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragId != null) moveTask(dragId, col.id); setDragId(null); }}
            >
              <div className="kanban-col-head">
                <span className="kanban-col-title">{col.title}</span>
                <span className="kanban-col-count">{colTasks.length}</span>
              </div>
              <div className="kanban-col-body">
                {colTasks.map((t) => (
                  <div
                    key={t.id}
                    className="kanban-card"
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="kanban-card-top">
                      <span
                        className="kanban-prio"
                        style={{ background: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium }}
                        title={t.priority}
                      />
                      <span className="kanban-card-title">{t.title}</span>
                    </div>
                    {t.description && <div className="kanban-card-desc">{t.description}</div>}
                    {Array.isArray(t.tags) && t.tags.length > 0 && (
                      <div className="kanban-tags">
                        {t.tags.map((tag) => (
                          <span key={tag} className="kanban-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KanbanBoard;
