import React, { useEffect, useMemo, useRef, useState } from 'react';

// Daily Activities Tracker
// - Morning / Noon / Evening buckets
// - Tap to mark completed
// - Templates (auto-fill a new day)
// - 7-day history
// - Persists in localStorage

const STORAGE_KEY = 'daily-activities-tracker:v2';

const BUCKETS = [
  { id: 'morning', label: 'Morning' },
  { id: 'noon', label: 'Noon' },
  { id: 'evening', label: 'Evening' },
];

// ✅ RGB gradient (was missing)
const rgb = 'bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-lime-400';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function cls(...xs) {
  return xs.filter(Boolean).join(' ');
}

function safeJSONParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      version: 2,
      templates: {
        morning: ['Water', 'Stretch', 'Plan day'],
        noon: ['Lunch', '5-min walk'],
        evening: ['Review day', 'Read 10 min'],
      },
      days: {},
    };
  }
  const parsed = safeJSONParse(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  // Minimal migration from v1 to v2 if user used the earlier version
  if (parsed.dateKey && Array.isArray(parsed.items)) {
    const migrated = {
      version: 2,
      templates: { morning: [], noon: [], evening: [] },
      days: { [parsed.dateKey]: parsed.items },
    };
    return migrated;
  }

  if (!parsed.version) parsed.version = 2;
  if (!parsed.templates)
    parsed.templates = { morning: [], noon: [], evening: [] };
  if (!parsed.days) parsed.days = {};
  return parsed;
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function makeItemsFromTemplates(templates) {
  const now = Date.now();
  const items = [];
  for (const b of BUCKETS) {
    const list = Array.isArray(templates?.[b.id]) ? templates[b.id] : [];
    for (const t of list) {
      const text = String(t || '').trim();
      if (!text) continue;
      items.push({
        id: uid(),
        text,
        bucket: b.id,
        done: false,
        createdAt: now,
        fromTemplate: true,
      });
    }
  }
  return items;
}

function normalizeDayItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      id: x.id || uid(),
      text: String(x.text || '').trim(),
      bucket: x.bucket || 'morning',
      done: !!x.done,
      createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
      fromTemplate: !!x.fromTemplate,
    }))
    .filter((x) => x.text);
}

function pruneHistory(daysObj, keep = 7) {
  const keys = Object.keys(daysObj || {}).sort((a, b) => (a < b ? 1 : -1));
  const kept = {};
  for (const k of keys.slice(0, keep)) kept[k] = daysObj[k];
  return kept;
}

export default function App() {
  const [tab, setTab] = useState('today'); // today | templates | history

  const [store, setStore] = useState(() => {
    const s = loadStore();
    return (
      s || {
        version: 2,
        templates: { morning: [], noon: [], evening: [] },
        days: {},
      }
    );
  });

  const [dateKey, setDateKey] = useState(todayKey());
  const [items, setItems] = useState([]);

  // Inputs (Today)
  const [text, setText] = useState('');
  const [bucket, setBucket] = useState('morning');
  const [showDone, setShowDone] = useState(true);
  const inputRef = useRef(null);

  // Inputs (Templates)
  const [tplText, setTplText] = useState('');
  const [tplBucket, setTplBucket] = useState('morning');

  // Initial day load
  useEffect(() => {
    const tk = todayKey();
    setDateKey(tk);

    setStore((prev) => {
      const next = { ...prev, days: { ...(prev.days || {}) } };
      if (!next.days[tk])
        next.days[tk] = makeItemsFromTemplates(next.templates);
      next.days = pruneHistory(next.days, 7);
      saveStore(next);
      return next;
    });
  }, []);

  // Keep items in sync with store + dateKey
  useEffect(() => {
    setItems(normalizeDayItems(store.days?.[dateKey]));
    // only when you switch day/history
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  // Persist current day items back into store
  useEffect(() => {
    setStore((prev) => {
      const next = {
        ...prev,
        days: pruneHistory({ ...(prev.days || {}), [dateKey]: items }, 7),
      };
      saveStore(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Auto-advance day if midnight passes while app stays open
  useEffect(() => {
    const t = setInterval(() => {
      const tk = todayKey();
      setDateKey((prev) => {
        if (prev !== tk) {
          setStore((s) => {
            const next = { ...s, days: { ...(s.days || {}) } };
            if (!next.days[tk])
              next.days[tk] = makeItemsFromTemplates(next.templates);
            next.days = pruneHistory(next.days, 7);
            saveStore(next);
            return next;
          });
          setTab('today');
          return tk;
        }
        return prev;
      });
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const grouped = useMemo(() => {
    const map = { morning: [], noon: [], evening: [] };
    for (const it of items) {
      if (!map[it.bucket]) map[it.bucket] = [];
      map[it.bucket].push(it);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }
    return map;
  }, [items]);

  const total = items.length;
  const doneCount = items.filter((x) => x.done).length;
  const progress = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  function addItem(e) {
    e?.preventDefault?.();
    const trimmed = text.trim();
    if (!trimmed) return;

    const newItem = {
      id: uid(),
      text: trimmed,
      bucket,
      done: false,
      createdAt: Date.now(),
      fromTemplate: false,
    };

    setItems((prev) => [newItem, ...prev]);
    setText('');
    inputRef.current?.focus?.();
  }

  function toggleDone(id) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it))
    );
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function clearCompleted() {
    setItems((prev) => prev.filter((it) => !it.done));
  }

  function resetToday() {
    const tk = todayKey();
    setDateKey(tk);
    setItems(makeItemsFromTemplates(store.templates));
  }

  function markAllDone(bucketId) {
    setItems((prev) =>
      prev.map((it) => (it.bucket === bucketId ? { ...it, done: true } : it))
    );
  }

  // Templates actions
  function addTemplateItem(e) {
    e?.preventDefault?.();
    const trimmed = tplText.trim();
    if (!trimmed) return;

    setStore((prev) => {
      const next = {
        ...prev,
        templates: {
          ...prev.templates,
          [tplBucket]: [trimmed, ...(prev.templates?.[tplBucket] || [])],
        },
      };
      saveStore(next);
      return next;
    });

    setTplText('');
  }

  function removeTemplateItem(bucketId, idx) {
    setStore((prev) => {
      const list = [...(prev.templates?.[bucketId] || [])];
      list.splice(idx, 1);
      const next = {
        ...prev,
        templates: { ...prev.templates, [bucketId]: list },
      };
      saveStore(next);
      return next;
    });
  }

  function applyTemplatesToToday() {
    const tk = todayKey();
    setDateKey(tk);
    setItems(makeItemsFromTemplates(store.templates));
    setTab('today');
  }

  // History
  const historyKeys = useMemo(
    () => Object.keys(store.days || {}).sort((a, b) => (a < b ? 1 : -1)),
    [store.days]
  );

  function openHistoryDay(k) {
    setDateKey(k);
    setTab('today');
  }

  const isToday = dateKey === todayKey();

  const card =
    'rounded-2xl bg-slate-950/60 backdrop-blur p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/10';

  const input =
    'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring-2 placeholder:text-white/30';

  const ghostBtn =
    'rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white/80 ring-1 ring-white/20 hover:bg-white/20';

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight relative inline-block">
                Daily Activities
                <span
                  className={`absolute left-0 -bottom-1 h-1 w-full rounded-full ${rgb}`}
                />
              </h1>
              <p className="mt-2 text-sm text-white/60">
                {dateKey}
                {isToday ? ' • Today' : ''} • Morning / Noon / Evening
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="text-sm text-white/70">
                {doneCount}/{total} done • {progress}%
              </div>
              <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cls(
                    'h-full rounded-full transition-all duration-500',
                    rgb
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'today', label: 'Today' },
              { id: 'templates', label: 'Templates' },
              { id: 'history', label: 'History' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cls(
                  'rounded-xl px-4 py-2 text-sm font-medium transition ring-1',
                  tab === t.id
                    ? `${rgb} text-black ring-transparent`
                    : 'bg-white/10 text-white/70 ring-white/20 hover:bg-white/20'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {tab === 'today' && (
          <>
            <form onSubmit={addItem} className={cls('mb-4', card)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-white/60">
                    Activity
                  </label>
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g., Gym, Study, Meeting, Walk..."
                    className={input}
                  />
                </div>

                <div className="sm:w-40">
                  <label className="mb-1 block text-xs font-medium text-white/60">
                    Time
                  </label>
                  <select
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                    className={input}
                  >
                    {BUCKETS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:pt-6">
                  <button
                    type="submit"
                    className={cls(
                      'w-full rounded-xl px-4 py-2 text-sm font-semibold text-black',
                      rgb,
                      'shadow-[0_0_20px_rgba(0,255,255,0.5)] hover:scale-[1.03] transition sm:w-auto'
                    )}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={showDone}
                    onChange={(e) => setShowDone(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/40"
                  />
                  Show completed
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearCompleted}
                    className={ghostBtn}
                  >
                    Clear completed
                  </button>
                  <button
                    type="button"
                    onClick={resetToday}
                    className={ghostBtn}
                  >
                    Reset today (from templates)
                  </button>
                </div>
              </div>
            </form>

            <main className="grid gap-4 md:grid-cols-3">
              {BUCKETS.map((b) => {
                const list = grouped[b.id] || [];
                const visible = showDone ? list : list.filter((x) => !x.done);
                const bucketDone =
                  list.length === 0
                    ? 0
                    : Math.round(
                        (list.filter((x) => x.done).length / list.length) * 100
                      );

                return (
                  <section
                    key={b.id}
                    className={cls(card, 'relative overflow-hidden')}
                  >
                    <span
                      className={cls('absolute inset-x-0 top-0 h-[2px]', rgb)}
                    />

                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold">{b.label}</h2>
                        <div className="mt-1 text-xs text-white/60">
                          {list.filter((x) => x.done).length}/{list.length} done
                          • {bucketDone}%
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => markAllDone(b.id)}
                        className={ghostBtn}
                      >
                        Mark all done
                      </button>
                    </div>

                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={cls(
                          'h-full rounded-full transition-all duration-500',
                          rgb
                        )}
                        style={{ width: `${bucketDone}%` }}
                      />
                    </div>

                    {visible.length === 0 ? (
                      <p className="text-sm text-white/50">
                        No activities yet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {visible.map((it) => (
                          <li
                            key={it.id}
                            className={cls(
                              'flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2',
                              it.done && 'bg-white/5'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleDone(it.id)}
                              className="flex flex-1 items-center gap-3 text-left"
                              aria-label={
                                it.done
                                  ? 'Mark as not completed'
                                  : 'Mark as completed'
                              }
                            >
                              <span
                                className={cls(
                                  'grid h-5 w-5 place-items-center rounded-md border',
                                  it.done
                                    ? `${rgb} text-black border-transparent`
                                    : 'border-white/20 bg-black/40'
                                )}
                              >
                                {it.done ? '✓' : ''}
                              </span>

                              <div className="min-w-0">
                                <div
                                  className={cls(
                                    'text-sm',
                                    it.done && 'text-white/40 line-through'
                                  )}
                                >
                                  {it.text}
                                </div>
                                {it.fromTemplate && (
                                  <div className="mt-0.5 text-[11px] text-white/40">
                                    From template
                                  </div>
                                )}
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-white/50 hover:bg-white/10 hover:text-white/80"
                              aria-label="Delete activity"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </main>

            <footer className="mt-8 text-xs text-white/40">
              Saved in this browser. New days auto-fill from your Templates and
              keeps the last 7 days in History.
            </footer>
          </>
        )}

        {tab === 'templates' && (
          <>
            <div className={card}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold">Templates</h2>
                  <p className="text-sm text-white/60">
                    These activities auto-add every day.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyTemplatesToToday}
                  className={cls(
                    'rounded-xl px-4 py-2 text-sm font-semibold text-black',
                    rgb,
                    'shadow-[0_0_20px_rgba(0,255,255,0.5)] hover:opacity-95 active:opacity-90'
                  )}
                >
                  Apply templates to today
                </button>
              </div>

              <form
                onSubmit={addTemplateItem}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">
                    Template activity
                  </label>
                  <input
                    value={tplText}
                    onChange={(e) => setTplText(e.target.value)}
                    placeholder="e.g., Meditate 5 min"
                    className={input}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">
                    Time
                  </label>
                  <select
                    value={tplBucket}
                    onChange={(e) => setTplBucket(e.target.value)}
                    className={input}
                  >
                    {BUCKETS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:pt-6">
                  <button
                    type="submit"
                    className={cls(ghostBtn, 'text-sm px-4 py-2')}
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {BUCKETS.map((b) => {
                const list = store.templates?.[b.id] || [];
                return (
                  <section
                    key={b.id}
                    className={cls(card, 'relative overflow-hidden')}
                  >
                    <span
                      className={cls('absolute inset-x-0 top-0 h-[2px]', rgb)}
                    />
                    <h3 className="text-base font-semibold">{b.label}</h3>
                    {list.length === 0 ? (
                      <p className="mt-2 text-sm text-white/50">
                        No template items.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {list.map((t, idx) => (
                          <li
                            key={`${b.id}-${idx}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"
                          >
                            <span className="text-sm text-white/90">{t}</span>
                            <button
                              type="button"
                              onClick={() => removeTemplateItem(b.id, idx)}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-white/50 hover:bg-white/10 hover:text-white/80"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            <footer className="mt-8 text-xs text-white/40">
              Add your routine once here, and each day will start with these
              tasks.
            </footer>
          </>
        )}

        {tab === 'history' && (
          <>
            <div className={card}>
              <h2 className="text-base font-semibold">History (last 7 days)</h2>
              <p className="text-sm text-white/60">
                Tap a date to open it (read/edit).
              </p>

              {historyKeys.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">No history yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {historyKeys.map((k) => {
                    const dayItems = normalizeDayItems(store.days?.[k]);
                    const d = dayItems.filter((x) => x.done).length;
                    const t = dayItems.length;
                    const pct = t === 0 ? 0 : Math.round((d / t) * 100);
                    return (
                      <li
                        key={k}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"
                      >
                        <button
                          type="button"
                          onClick={() => openHistoryDay(k)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div>
                            <div className="text-sm font-medium text-white">
                              {k}
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              {d}/{t} done • {pct}%
                              {k === todayKey() ? ' • Today' : ''}
                            </div>
                          </div>
                          <span className="text-xs font-medium text-white/70">
                            Open →
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="mt-8 text-xs text-white/40">
              Stored locally. If you want cloud sync later, we can add login +
              database.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
