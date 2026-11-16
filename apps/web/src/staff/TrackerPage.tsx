/**
 * /tracker: the project tracker (routers/tracker.py), with no sign-in.
 *
 * One calm column: the title, one bar of progress by stage (To do, In progress, Waiting, Done,
 * Committed, Deployed), then Tasks or Deployments. Tasks are one checklist, not split by area
 * (founder, 16 Nov 2026): what is still to finish, then what was finished, by day. Tick a
 * task done (it stays in view, ticked), change its stage, or open it for its notes, steps and
 * history. Anyone with the link reads it; a signed-in admin, or the edit link (?key=…), changes it.
 * Committed tasks become Deployed by themselves when a deployment is recorded.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { IconChevronRight } from '../prep/icons.js';
import '../prep/prep.css';
import './tracker.css';

type Status = 'todo' | 'doing' | 'waiting' | 'done' | 'committed' | 'deployed';

interface Item {
  id: string;
  title: string;
  area: string;
  status: Status;
  owner: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  updated_by: string | null;
  /** The day it is planned for ("2026-11-16"): under Today from then until it is finished. */
  planned_for: string | null;
  steps: number;
  steps_done: number;
}
interface Deployment {
  id: string;
  sha: string;
  target: string;
  deployed_at: string;
  changes: string[];
}
interface Detail {
  item: Item;
  steps: { id: string; text: string; done: boolean }[];
  activity: { at: string; by_name: string | null; what: string }[];
}

/** The stages, in the order work moves through them. */
const STATUS: { value: Status; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
  { value: 'committed', label: 'Committed' },
  { value: 'deployed', label: 'Deployed' },
];
const WORD = Object.fromEntries(STATUS.map((s) => [s.value, s.label])) as Record<Status, string>;
const FINISHED: Status[] = ['done', 'committed', 'deployed'];
const finished = (s: Status) => FINISHED.includes(s);
/** The bar's order: what is out first, what is still to start last. */
const BAR: Status[] = ['deployed', 'committed', 'done', 'doing', 'waiting', 'todo'];
/** Within an area: what is moving first, what is out last. */
const ROW_ORDER: Record<Status, number> = { doing: 0, waiting: 1, todo: 2, done: 3, committed: 4, deployed: 5 };
const BASE = '/v1/public/tracker';

/* ------------------------------------------------------------------ the edit key and name */

const KEY_STORE = 'tracker-key';
const NAME_STORE = 'tracker-name';
function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: kept for this visit only */
  }
}

/** The key from the edit link, kept on this device and taken out of the address bar. */
function useEditKey(): [string | null, () => void] {
  const [key, setKey] = useState<string | null>(() => {
    const url = new URL(window.location.href);
    const fromLink = url.searchParams.get('key');
    if (fromLink) {
      store(KEY_STORE, fromLink);
      url.searchParams.delete('key');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      return fromLink;
    }
    return stored(KEY_STORE);
  });
  return [
    key,
    () => {
      store(KEY_STORE, null);
      setKey(null);
    },
  ];
}

/** Today on this device, as the API writes a date: "2026-11-16". */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** "2026-11-14" as "Sat 14 Nov". */
function dateText(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The day a moment fell on, on this device: "2026-11-16". */
function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** A finished day's heading: Today, Yesterday, else "Sat 14 Nov". */
function finishedHeading(dayIso: string, today: string): string {
  if (dayIso === today) return 'Finished today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dayIso === localDay(y.toISOString())) return 'Finished yesterday';
  return `Finished ${dateText(dayIso)}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ the page */

type Show = 'active' | 'finished' | 'all';

export function PublicTracker() {
  const [key, forgetKey] = useEditKey();
  const [name, setName] = useState<string | null>(() => stored(NAME_STORE));
  const [askName, setAskName] = useState<null | (() => void)>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [deploys, setDeploys] = useState<Deployment[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<'tasks' | 'deploys'>('tasks');
  const [show, setShow] = useState<Show>('active');
  const [area, setArea] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Tasks changed on this visit stay in view whatever the filter, so a tick never makes one vanish.
  const [kept, setKept] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = 'Project tracker · Stack Prep';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);
  // A new filter is a fresh look: what was kept in view goes back to following it.
  useEffect(() => setKept(new Set()), [show, area]);

  // The name is read when a change is sent, so a change made right after giving it carries it.
  const nameNow = useRef(name);
  nameNow.current = name;
  const headers = useCallback(
    (): Record<string, string> => ({
      ...(key ? { 'X-Tracker-Key': key } : {}),
      ...(nameNow.current ? { 'X-Tracker-Name': nameNow.current } : {}),
    }),
    [key],
  );

  const load = useCallback(() => {
    request<{ can_edit: boolean; editor_name: string | null; items: Item[]; deployments: Deployment[] }>(BASE, {
      headers: headers(),
    })
      .then((page) => {
        setItems(page.items);
        setDeploys(page.deployments);
        setCanEdit(page.can_edit);
        setAdminName(page.editor_name);
      })
      .catch((error) => setProblem(friendly(error)));
  }, [headers]);
  useEffect(load, [load]);

  /** Runs a change once the editor's name is known (asked once, kept on this device). */
  const asEditor = (run: () => void) => {
    if (name || adminName) run();
    else setAskName(() => run);
  };

  const send = useCallback(
    <T,>(path: string, method: string, body?: unknown) =>
      request<T>(`${BASE}${path}`, {
        method,
        headers: headers(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    [headers],
  );

  const replace = (next: Item) => setItems((now) => now?.map((i) => (i.id === next.id ? next : i)) ?? now);

  const setStatus = (item: Item, status: Status) =>
    asEditor(() => {
      setKept((now) => new Set(now).add(item.id));
      replace({ ...item, status });
      send<Detail>(`/items/${item.id}`, 'PATCH', { status })
        .then((d) => replace(d.item))
        .catch((error) => {
          setProblem(friendly(error));
          load();
        });
    });

  const today = todayIso();
  const all = items ?? [];
  // Today: planned for today or before and not finished (it carries over), and whatever was
  // finished today, planned or not.
  const todayList = all
    .filter((i) =>
      finished(i.status)
        ? i.done_at !== null && localDay(i.done_at) === today
        : i.planned_for !== null && i.planned_for <= today,
    )
    .sort((x, y) => ROW_ORDER[x.status] - ROW_ORDER[y.status] || (x.planned_for ?? '').localeCompare(y.planned_for ?? ''));
  const todayDone = todayList.filter((i) => finished(i.status)).length;
  const areas = useMemo(() => [...new Set(all.map((i) => i.area))].sort(), [all]);
  const count = (s: Status) => all.filter((i) => i.status === s).length;
  const doneCount = all.filter((i) => finished(i.status)).length;
  const wanted = (i: Item) =>
    kept.has(i.id) ||
    ((area === 'all' || i.area === area) &&
      (show === 'all' || (show === 'finished' ? finished(i.status) : !finished(i.status))));
  // One list, not split by area: what is still to do, then what was finished, by the day it was.
  const activeList = all
    .filter((i) => wanted(i) && !finished(i.status) && !todayList.includes(i))
    .sort((x, y) => ROW_ORDER[x.status] - ROW_ORDER[y.status] || (x.planned_for ?? '9').localeCompare(y.planned_for ?? '9'));
  const doneDays = useMemo(() => {
    const byDay = new Map<string, Item[]>();
    for (const i of all) {
      if (!wanted(i) || !finished(i.status)) continue;
      const dayIso = i.done_at ? localDay(i.done_at) : '';
      byDay.set(dayIso, [...(byDay.get(dayIso) ?? []), i]);
    }
    return [...byDay.entries()]
      .sort(([x], [y]) => y.localeCompare(x))
      .map(([dayIso, list]) => ({
        day: dayIso,
        title: dayIso ? finishedHeading(dayIso, today) : 'Finished earlier',
        list: list.sort((x, y) => (y.done_at ?? '').localeCompare(x.done_at ?? '')),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, show, area, kept, today]);
  const rowFor = (i: Item) => (
    <TaskRow
      key={i.id}
      item={i}
      today={today}
      canEdit={canEdit}
      onTick={() => setStatus(i, finished(i.status) ? 'todo' : 'done')}
      onOpen={() => setOpen(i.id)}
    />
  );

  return (
    <div className="sj tk">
      <main className="tk-main">
        <header className="tk-head">
          <div>
            <span className="tk-eyebrow">Stack Prep</span>
            <h1>Project tracker</h1>
          </div>
          <div className="tk-who">
            {canEdit ? (
              <>
                <span className="tk-mode edit">Editing{adminName ? ` as ${adminName}` : name ? ` as ${name}` : ''}</span>
                {name && !adminName ? (
                  <button type="button" className="tk-link" onClick={() => setAskName(() => () => undefined)}>
                    Change name
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <span className="tk-mode">View only</span>
                {key ? (
                  <button type="button" className="tk-link" onClick={forgetKey}>
                    Forget the edit key
                  </button>
                ) : null}
              </>
            )}
          </div>
        </header>

        {problem ? (
          <p className="tk-problem" role="alert">
            {problem}{' '}
            <button type="button" className="tk-link" onClick={() => setProblem(null)}>
              Dismiss
            </button>
          </p>
        ) : null}

        {items === null ? (
          <p className="tk-muted">Loading the tracker…</p>
        ) : (
          <>
            <section className="tk-summary" aria-label="Progress">
              <p className="tk-big">
                <b>{doneCount}</b> of {all.length} finished
              </p>
              <span className="tk-stack" aria-hidden="true">
                {BAR.map((s) =>
                  count(s) ? <i key={s} className={s} style={{ flexGrow: count(s) }} title={`${WORD[s]}: ${count(s)}`} /> : null,
                )}
              </span>
              <ul className="tk-legend">
                {BAR.map((s) => (
                  <li key={s}>
                    <i className={s} aria-hidden="true" />
                    {WORD[s]} <b>{count(s)}</b>
                  </li>
                ))}
              </ul>
            </section>

            <nav className="tk-tabs" aria-label="Show">
              <button type="button" className={tab === 'tasks' ? 'on' : undefined} onClick={() => setTab('tasks')}>
                Tasks
              </button>
              <button type="button" className={tab === 'deploys' ? 'on' : undefined} onClick={() => setTab('deploys')}>
                Deployments {deploys.length ? <span>{deploys.length}</span> : null}
              </button>
            </nav>

            {tab === 'tasks' ? (
              <section className="tk-tasks" aria-label="Tasks">
                <div className="tk-toolbar">
                  <div className="tk-seg" role="tablist" aria-label="Which tasks">
                    {(
                      [
                        ['active', 'Active'],
                        ['finished', 'Finished'],
                        ['all', 'All'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={show === value}
                        className={show === value ? 'on' : undefined}
                        onClick={() => setShow(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Select
                    aria-label="Area"
                    size="sm"
                    className="tk-areapick"
                    value={area}
                    onChange={setArea}
                    options={[{ value: 'all', label: 'Every area' }, ...areas.map((a) => ({ value: a, label: a }))]}
                  />
                  {canEdit ? (
                    <button type="button" className="sj-btn sm tk-new" onClick={() => setAdding(true)}>
                      New task
                    </button>
                  ) : null}
                </div>

                <section className="tk-today" aria-labelledby="tk-today-title">
                  <h2 id="tk-today-title">
                    Today
                    <span>
                      {dateText(today)}
                      {todayList.length ? ` · ${todayDone} of ${todayList.length} done` : ''}
                    </span>
                  </h2>
                  {todayList.length ? (
                    <ul className="tk-list">
                      {todayList.map((i) => (
                        <TaskRow
                          key={i.id}
                          item={i}
                          today={today}
                          inToday
                          canEdit={canEdit}
                          onTick={() => setStatus(i, finished(i.status) ? 'todo' : 'done')}
                                          onOpen={() => setOpen(i.id)}
                                            />
                      ))}
                    </ul>
                  ) : (
                    <p className="tk-muted tk-today-empty">
                      Nothing planned for today.{canEdit ? ' Use “Today” on any task below, or plan a new one.' : ''}
                    </p>
                  )}
                </section>

                {activeList.length === 0 && doneDays.length === 0 ? <p className="tk-muted tk-none">Nothing here.</p> : null}
                {activeList.length ? (
                  <div className="tk-group">
                    <h2>
                      Still to finish
                      <span>{activeList.length}</span>
                    </h2>
                    <ul className="tk-list">{activeList.map(rowFor)}</ul>
                  </div>
                ) : null}
                {doneDays.map((g) => (
                  <div key={g.day || 'earlier'} className="tk-group">
                    <h2>
                      {g.title}
                      <span>{g.list.length}</span>
                    </h2>
                    <ul className="tk-list">{g.list.map(rowFor)}</ul>
                  </div>
                ))}
              </section>
            ) : (
              <Deployments list={deploys} />
            )}
          </>
        )}
      </main>

      {open ? (
        <TaskPanel
          id={open}
          areas={areas}
          canEdit={canEdit}
          send={send}
          asEditor={asEditor}
          onClose={() => setOpen(null)}
          onChanged={(d) => {
            setKept((now) => new Set(now).add(d.item.id));
            replace(d.item);
          }}
          onRemoved={(id) => {
            setItems((now) => now?.filter((i) => i.id !== id) ?? now);
            setOpen(null);
          }}
          onProblem={setProblem}
        />
      ) : null}

      {adding ? (
        <NewTaskDialog
          areas={areas}
          defaultArea={area === 'all' ? null : area}
          onCancel={() => setAdding(false)}
          onAdd={(body) =>
            asEditor(() => {
              send<Detail>('/items', 'POST', body)
                .then((d) => {
                  setItems((now) => [d.item, ...(now ?? [])]);
                  setKept((now) => new Set(now).add(d.item.id));
                  setAdding(false);
                })
                .catch((error) => setProblem(friendly(error)));
            })
          }
        />
      ) : null}

      {askName ? (
        <NameDialog
          current={name}
          onCancel={() => setAskName(null)}
          onSave={(value) => {
            store(NAME_STORE, value);
            nameNow.current = value;
            setName(value);
            const run = askName;
            setAskName(null);
            run();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ adding a task */

/** One task in a list: the tick, the title (opens it), Today, and its stage. */
function TaskRow({
  item: i,
  today,
  inToday = false,
  canEdit,
  onTick,
  onOpen,
}: {
  item: Item;
  today: string;
  inToday?: boolean;
  canEdit: boolean;
  onTick: () => void;
  onOpen: () => void;
}) {
  const planned = i.planned_for !== null && i.planned_for <= today && !finished(i.status);
  const carried = inToday && i.planned_for !== null && i.planned_for < today;
  return (
    <li className={`tk-row ${finished(i.status) ? 'finished' : ''}`}>
      <button
        type="button"
        className={`tk-tick ${finished(i.status) ? 'on' : ''}`}
        aria-label={finished(i.status) ? `Mark “${i.title}” not done` : `Mark “${i.title}” done`}
        aria-pressed={finished(i.status)}
        disabled={!canEdit}
        onClick={onTick}
      />
      <button type="button" className="tk-row-main" onClick={onOpen}>
        <span className="tk-row-title">{i.title}</span>
        <span className="tk-row-meta">
          <span className={`tk-stagetag ${i.status}`}>{WORD[i.status]}</span>
          <span>{i.area}</span>
          {carried ? <span className="tk-carried">from {dateText(i.planned_for!)}</span> : planned && !inToday ? <span className="tk-carried">Today</span> : null}
          {i.owner ? <span>{i.owner}</span> : null}
          {i.steps ? (
            <span>
              {i.steps_done}/{i.steps} steps
            </span>
          ) : null}
        </span>
      </button>
      <IconChevronRight size={16} className="tk-row-go" aria-hidden="true" />
    </li>
  );
}

/* ------------------------------------------------------------------ adding a task */

interface NewTaskBody {
  title: string;
  area: string;
  status: Status;
  owner: string | null;
  note: string | null;
  planned_for: string | null;
}

/** A new task, in a popup: what it is, its area (or a new one), stage, who, notes, and today. */
function NewTaskDialog({
  areas,
  defaultArea,
  onAdd,
  onCancel,
}: {
  areas: string[];
  defaultArea: string | null;
  onAdd: (body: NewTaskBody) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState(defaultArea ?? areas[0] ?? 'General');
  const [newArea, setNewArea] = useState('');
  const [status, setStatus] = useState<Status>('todo');
  const [owner, setOwner] = useState('');
  const [note, setNote] = useState('');
  const [today, setToday] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const areaName = area === '__new' ? newArea.trim() : area;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !areaName) return;
    setBusy(true);
    onAdd({
      title: title.trim(),
      area: areaName,
      status,
      owner: owner.trim() || null,
      note: note.trim() || null,
      planned_for: today && !finished(status) ? todayIso() : null,
    });
  };
  return (
    <div className="tk-scrim center" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <form className="tk-modal" onSubmit={submit} aria-label="New task">
        <h2>New task</h2>
        <label className="tk-label">
          <span>What needs doing?</span>
          <textarea
            id="tk-new-title"
            autoFocus
            rows={2}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e as unknown as FormEvent);
              }
            }}
          />
        </label>
        <div className="tk-two">
          <label className="tk-label">
            <span>Area</span>
            <Select
              aria-label="Area"
              value={area}
              onChange={setArea}
              options={[...areas.map((a) => ({ value: a, label: a })), { value: '__new', label: 'A new area…' }]}
            />
          </label>
          <label className="tk-label">
            <span>Stage</span>
            <Select aria-label="Stage" value={status} onChange={setStatus} options={STATUS} />
          </label>
        </div>
        {area === '__new' ? (
          <label className="tk-label">
            <span>New area</span>
            <input id="tk-new-area" value={newArea} maxLength={60} onChange={(e) => setNewArea(e.target.value)} />
          </label>
        ) : null}
        <label className="tk-label">
          <span>Who is on it (optional)</span>
          <input id="tk-new-owner" value={owner} maxLength={80} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <label className="tk-label">
          <span>Notes (optional)</span>
          <textarea id="tk-new-note" rows={3} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="tk-check">
          <input type="checkbox" checked={today && !finished(status)} disabled={finished(status)} onChange={(e) => setToday(e.target.checked)} />
          <span>Plan it for today</span>
        </label>
        <div className="tk-save">
          <button type="button" className="sj-btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="sj-btn sm" disabled={busy || !title.trim() || !areaName}>
            {busy ? 'Adding…' : 'Add the task'}
          </button>
        </div>
      </form>
    </div>
  );
}


/* ------------------------------------------------------------------ one task */

function TaskPanel({
  id,
  areas,
  canEdit,
  send,
  asEditor,
  onClose,
  onChanged,
  onRemoved,
  onProblem,
}: {
  id: string;
  areas: string[];
  canEdit: boolean;
  send: <T>(path: string, method: string, body?: unknown) => Promise<T>;
  asEditor: (run: () => void) => void;
  onClose: () => void;
  onChanged: (d: Detail) => void;
  onRemoved: (id: string) => void;
  onProblem: (text: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('');
  const [newArea, setNewArea] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    request<Detail>(`${BASE}/items/${id}`)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setTitle(d.item.title);
        setOwner(d.item.owner ?? '');
        setNote(d.item.note ?? '');
      })
      .catch((error) => {
        onProblem(friendly(error));
        onClose();
      });
    return () => {
      live = false;
    };
  }, [id, onProblem]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apply = (path: string, method: string, body?: unknown) =>
    asEditor(() => {
      send<Detail>(path, method, body)
        .then((d) => {
          setDetail(d);
          onChanged(d);
        })
        .catch((error) => onProblem(friendly(error)));
    });

  const item = detail?.item;
  const dirty = item && (title.trim() !== item.title || (owner.trim() || null) !== item.owner || (note.trim() || null) !== item.note);

  return (
    <div className="tk-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="tk-panel" role="dialog" aria-modal="true" aria-label="Task" tabIndex={-1} ref={panel}>
        <header className="tk-panel-head">
          {item ? <span className={`tk-pill ${item.status}`}>{WORD[item.status]}</span> : <span />}
          <button type="button" className="tk-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {!item ? (
          <p className="tk-muted">Loading…</p>
        ) : (
          <div className="tk-panel-body">
            {canEdit ? (
              <textarea className="tk-title-edit" rows={2} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Task" />
            ) : (
              <h2 className="tk-title">{item.title}</h2>
            )}

            <dl className="tk-fields">
              <Field label="Status">
                {canEdit ? (
                  <Select aria-label="Status" size="sm" value={item.status} onChange={(s) => apply(`/items/${id}`, 'PATCH', { status: s })} options={STATUS} />
                ) : (
                  WORD[item.status]
                )}
              </Field>
              <Field label="Today">
                {canEdit && !finished(item.status) ? (
                  <button
                    type="button"
                    className={`tk-today-btn ${item.planned_for && item.planned_for <= todayIso() ? 'on' : ''}`}
                    onClick={() =>
                      apply(`/items/${id}`, 'PATCH', {
                        planned_for: item.planned_for && item.planned_for <= todayIso() ? null : todayIso(),
                      })
                    }
                  >
                    {item.planned_for && item.planned_for <= todayIso() ? 'On today’s list · take it off' : 'Plan it for today'}
                  </button>
                ) : item.planned_for ? (
                  dateText(item.planned_for)
                ) : (
                  '—'
                )}
              </Field>
              <Field label="Area">
                {canEdit ? (
                  <Select
                    aria-label="Area"
                    size="sm"
                    value={item.area}
                    onChange={(a) => (a === '__new' ? setNewArea(' ') : apply(`/items/${id}`, 'PATCH', { area: a }))}
                    options={[...areas.map((a) => ({ value: a, label: a })), { value: '__new', label: 'A new area…' }]}
                  />
                ) : (
                  item.area
                )}
              </Field>
              {newArea ? (
                <Field label="New area">
                  <form
                    className="tk-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newArea.trim()) apply(`/items/${id}`, 'PATCH', { area: newArea.trim() });
                      setNewArea('');
                    }}
                  >
                    <input autoFocus value={newArea.trimStart()} maxLength={60} onChange={(e) => setNewArea(e.target.value)} aria-label="New area" />
                    <button type="submit" className="sj-btn sm">
                      Save
                    </button>
                  </form>
                </Field>
              ) : null}
              <Field label="Who is on it">
                {canEdit ? (
                  <input value={owner} maxLength={80} placeholder="Nobody yet" onChange={(e) => setOwner(e.target.value)} aria-label="Who is on it" />
                ) : (
                  item.owner ?? 'Nobody yet'
                )}
              </Field>
              <Field label="Added">{day(item.created_at)}</Field>
              {item.done_at ? <Field label="Done">{day(item.done_at)}</Field> : null}
            </dl>

            <section className="tk-sec">
              <h3>Notes</h3>
              {canEdit ? (
                <textarea className="tk-note-edit" rows={4} value={note} maxLength={4000} placeholder="Anything worth knowing about this task" onChange={(e) => setNote(e.target.value)} aria-label="Notes" />
              ) : item.note ? (
                <p className="tk-note">{item.note}</p>
              ) : (
                <p className="tk-muted">No notes.</p>
              )}
              {canEdit && dirty ? (
                <div className="tk-save">
                  <button
                    type="button"
                    className="sj-btn ghost sm"
                    onClick={() => {
                      setTitle(item.title);
                      setOwner(item.owner ?? '');
                      setNote(item.note ?? '');
                    }}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="sj-btn sm"
                    disabled={!title.trim()}
                    onClick={() => apply(`/items/${id}`, 'PATCH', { title: title.trim(), owner: owner.trim() || null, note: note.trim() || null })}
                  >
                    Save changes
                  </button>
                </div>
              ) : null}
            </section>

            <section className="tk-sec">
              <h3>
                Steps
                {detail.steps.length ? (
                  <span>
                    {detail.steps.filter((s) => s.done).length} of {detail.steps.length}
                  </span>
                ) : null}
              </h3>
              {detail.steps.length ? (
                <ul className="tk-steps">
                  {detail.steps.map((s) => (
                    <li key={s.id} className={s.done ? 'done' : undefined}>
                      <button
                        type="button"
                        className={`tk-tick small ${s.done ? 'on' : ''}`}
                        aria-pressed={s.done}
                        aria-label={s.done ? `Untick “${s.text}”` : `Tick “${s.text}”`}
                        disabled={!canEdit}
                        onClick={() => apply(`/steps/${s.id}`, 'PATCH', { done: !s.done })}
                      />
                      <span>{s.text}</span>
                      {canEdit ? (
                        <button type="button" className="tk-step-x" aria-label={`Remove “${s.text}”`} onClick={() => apply(`/steps/${s.id}`, 'DELETE')}>
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tk-muted">No steps.</p>
              )}
              {canEdit ? (
                <form
                  className="tk-inline"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!step.trim()) return;
                    apply(`/items/${id}/steps`, 'POST', { text: step.trim() });
                    setStep('');
                  }}
                >
                  <input value={step} maxLength={300} placeholder="Add a step…" onChange={(e) => setStep(e.target.value)} aria-label="New step" />
                  <button type="submit" className="sj-btn ghost sm" disabled={!step.trim()}>
                    Add
                  </button>
                </form>
              ) : null}
            </section>

            <section className="tk-sec">
              <h3>History</h3>
              <ol className="tk-history">
                {detail.activity.map((a, n) => (
                  <li key={n}>
                    <span>{a.what}</span>
                    <small>
                      {a.by_name ?? 'Someone'} · {when(a.at)}
                    </small>
                  </li>
                ))}
              </ol>
            </section>

            {canEdit ? (
              <footer className="tk-panel-foot">
                {confirmRemove ? (
                  <>
                    <span>Remove this task for everyone?</span>
                    <button type="button" className="sj-btn ghost sm" onClick={() => setConfirmRemove(false)}>
                      Keep it
                    </button>
                    <button
                      type="button"
                      className="sj-btn sm tk-danger"
                      onClick={() =>
                        asEditor(() => {
                          send<void>(`/items/${id}`, 'DELETE')
                            .then(() => onRemoved(id))
                            .catch((error) => onProblem(friendly(error)));
                        })
                      }
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button type="button" className="tk-link tk-danger-link" onClick={() => setConfirmRemove(true)}>
                    Remove the task
                  </button>
                )}
              </footer>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tk-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ deployments */

function Deployments({ list }: { list: Deployment[] }) {
  if (list.length === 0) {
    return <p className="tk-muted tk-none">No deployments recorded yet. Each one adds itself here.</p>;
  }
  return (
    <ol className="tk-deploys">
      {list.map((d, n) => (
        <li key={d.id}>
          <details open={n === 0}>
            <summary>
              <span className="tk-dot" aria-hidden="true" />
              <b>{when(d.deployed_at)}</b>
              <span className="tk-target">{d.target}</span>
              <code>{d.sha.slice(0, 7)}</code>
              <span className="tk-muted">{d.changes.length === 1 ? '1 change' : `${d.changes.length} changes`}</span>
            </summary>
            <ul>
              {d.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ the editor's name */

function NameDialog({ current, onCancel, onSave }: { current: string | null; onCancel: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(current ?? '');
  return (
    <div className="tk-scrim center" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <form
        className="tk-name"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <h2>Your name</h2>
        <p className="tk-muted">So the team can see who changed what. It stays on this device.</p>
        <input autoFocus value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} aria-label="Your name" />
        <div className="tk-save">
          <button type="button" className="sj-btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="sj-btn sm" disabled={!value.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
