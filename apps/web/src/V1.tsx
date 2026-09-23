import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  dayKey,
  localInput,
  major,
  minor,
  money,
  type Data,
  type Row,
  type User,
} from "./lib";
export type V1Page = "Planner" | "Habits" | "Goals" | "Insights" | "Settings";
type State = {
  projects: Row[];
  tasks: Row[];
  habits: Row[];
  goals: Row[];
  dashboard: any;
  analytics: any;
  privacy: any;
  imports: Row[];
};
const empty: State = {
  projects: [],
  tasks: [],
  habits: [],
  goals: [],
  dashboard: null,
  analytics: null,
  privacy: null,
  imports: [],
};
const label = (title: string, control: React.ReactNode) => (
  <label className="field">
    <span>{title}</span>
    {control}
  </label>
);
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button type="button" aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
const toIso = (v: FormDataEntryValue | null) =>
  v ? new Date(String(v)).toISOString() : null;
const asDate = (v: string | null) => (v ? localInput(v) : "");
const currentDay = (user: User) =>
  dayKey(new Date().toISOString(), user.timezone);
function Progress({
  value,
  max,
  title,
}: {
  value: number;
  max: number;
  title: string;
}) {
  return <progress aria-label={title} max={max} value={Math.min(value, max)} />;
}
export function OverviewExtras({
  user,
  onNavigate,
}: {
  user: User;
  onNavigate: (p: V1Page) => void;
}) {
  const [dashboard, setDashboard] = useState<any>(null);
  useEffect(() => {
    void api("/dashboard")
      .then(setDashboard)
      .catch(() => {});
  }, [user.id]);
  if (!dashboard) return null;
  return (
    <div className="v1-overview">
      <section className="panel">
        <div className="section-heading">
          <h2>Tasks needing attention</h2>
          <button className="text-button" onClick={() => onNavigate("Planner")}>
            Open planner →
          </button>
        </div>
        {dashboard.due_tasks.length ? (
          dashboard.due_tasks.slice(0, 4).map((t: Row) => (
            <article className="v1-row" key={t.id}>
              <span className="v1-mark">□</span>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {t.priority} priority · Due{" "}
                  {new Date(t.due_at).toLocaleDateString(user.locale, {
                    timeZone: user.timezone,
                  })}
                </small>
              </span>
            </article>
          ))
        ) : (
          <p className="muted">No tasks due today or overdue.</p>
        )}
        {dashboard.alerts?.length > 0 && (
          <>
            <h3>Worth a look</h3>
            {dashboard.alerts.slice(0, 5).map((a: Row) => (
              <p className="v1-alert" key={a.id}>
                {a.title}
              </p>
            ))}
          </>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Habits & goals</h2>
          <button className="text-button" onClick={() => onNavigate("Goals")}>
            See goals →
          </button>
        </div>
        {dashboard.habits.slice(0, 3).map((h: Row) => (
          <article className="v1-row" key={h.id}>
            <span className="v1-mark">✦</span>
            <span>
              <strong>{h.name}</strong>
              <small>
                {h.week_count}/{h.week_target} this week · {h.streak}{" "}
                {h.cadence === "weekly" ? "week" : "day"} streak
              </small>
            </span>
          </article>
        ))}
        {dashboard.goals.slice(0, 3).map((g: Row) => (
          <article className="v1-row" key={g.id}>
            <span className="v1-mark">↗</span>
            <span>
              <strong>{g.title}</strong>
              <small>
                {Math.round(g.ratio * 100)}% complete ·{" "}
                {g.status.replace("_", " ")}
              </small>
            </span>
          </article>
        ))}
        {!dashboard.habits.length && !dashboard.goals.length && (
          <p className="muted">Add a habit or a goal to see progress here.</p>
        )}
      </section>
    </div>
  );
}
export default function V1({
  page,
  user,
  finance,
  onAccountDeleted,
  onDataChanged,
}: {
  page: V1Page;
  user: User;
  finance: Data;
  onAccountDeleted: () => void;
  onDataChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<State>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<{
      resource: "projects" | "tasks" | "habits" | "goals";
      row?: Row;
    } | null>(null),
    [insight, setInsight] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [taskFilter, setTaskFilter] = useState("open"),
    [source, setSource] = useState("bank_csv"),
    [preview, setPreview] = useState<any>(null),
    [fileName, setFileName] = useState("");
  async function reload() {
    const names = [
      "projects",
      "tasks",
      "habits",
      "goals",
      "dashboard",
      "analytics",
      "privacy/status",
      "imports",
    ];
    const results = await Promise.all(names.map((n) => api("/" + n)));
    setState({
      projects: results[0],
      tasks: results[1],
      habits: results[2],
      goals: results[3],
      dashboard: results[4],
      analytics: results[5],
      privacy: results[6],
      imports: results[7],
    });
  }
  useEffect(() => {
    void reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user.id]);
  async function mutate(
    action: () => Promise<any>,
    message = "Saved",
    closeEditor = false,
  ) {
    setBusy(true);
    setError("");
    try {
      await action();
      await reload();
      if (closeEditor) setEditor(null);
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(resource: string, row: Row) {
    if (
      !window.confirm(
        `Delete ${row.name || row.title || "this record"}? Linked records may need to be removed first.`,
      )
    )
      return;
    await mutate(
      () => api(`/${resource}/${row.id}`, "DELETE"),
      "Record deleted",
    );
  }
  const actions = (
    resource: "projects" | "tasks" | "habits" | "goals",
    row: Row,
  ) => (
    <div className="row-actions">
      <button onClick={() => setEditor({ resource, row })}>Edit</button>
      <button className="delete" onClick={() => void remove(resource, row)}>
        Delete
      </button>
    </div>
  );
  const account = (id: string) => finance.accounts.find((a) => a.id === id);
  const formatGoal = (goal: Row, value: number) =>
    goal.metric === "account_balance"
      ? money(
          value,
          account(goal.linked_account_id)?.currency || user.currency,
          user.locale,
        )
      : `${value.toLocaleString(user.locale)}${goal.metric === "activity_minutes" ? " min" : ""}`;
  async function ask(question: string) {
    setBusy(true);
    setError("");
    try {
      setInsight(await api("/insights/ask", "POST", { question }));
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function readFile(file: File | null) {
    if (!file) return;
    setPreview(null);
    setError("");
    setFileName(file.name);
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a CSV smaller than 2 MB");
      const input = parseCsv(await file.text());
      const result = mapRows(source, input, finance);
      const data = await api("/imports/preview", "POST", {
        source,
        name: file.name,
        rows: result,
      });
      setPreview({ ...data, rows: result });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <section className="panel">Loading your {page.toLowerCase()}…</section>
    );
  return (
    <div className="v1-page">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          ✓ {notice}
        </p>
      )}
      {page === "Planner" && (
        <>
          <div className="v1-grid">
            <section className="panel">
              <div className="section-heading">
                <h2>Projects</h2>
                <button
                  className="secondary"
                  onClick={() => setEditor({ resource: "projects" })}
                >
                  ＋ Project
                </button>
              </div>
              {state.projects.length ? (
                state.projects.map((p) => (
                  <article className="v1-row" key={p.id}>
                    <span className="v1-mark">▤</span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.description ||
                          `${state.tasks.filter((t) => t.project_id === p.id && !t.completed_at).length} open tasks`}
                      </small>
                    </span>
                    {actions("projects", p)}
                  </article>
                ))
              ) : (
                <p className="muted">
                  Group related tasks into your first project.
                </p>
              )}
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Tasks</h2>
                <button
                  className="primary"
                  onClick={() => setEditor({ resource: "tasks" })}
                >
                  ＋ Task
                </button>
              </div>
              <div className="tabs">
                <button
                  className={taskFilter === "open" ? "selected" : ""}
                  onClick={() => setTaskFilter("open")}
                >
                  Open
                </button>
                <button
                  className={taskFilter === "done" ? "selected" : ""}
                  onClick={() => setTaskFilter("done")}
                >
                  Completed
                </button>
              </div>
              {state.tasks
                .filter((t) =>
                  taskFilter === "open" ? !t.completed_at : !!t.completed_at,
                )
                .sort((a, b) =>
                  String(a.due_at || "9999").localeCompare(
                    String(b.due_at || "9999"),
                  ),
                )
                .map((t) => (
                  <article className="v1-row" key={t.id}>
                    <button
                      className="v1-check"
                      aria-label={`Complete ${t.title}`}
                      disabled={!!t.completed_at || busy}
                      onClick={() =>
                        void mutate(
                          () => api(`/tasks/${t.id}/complete`, "POST"),
                          "Task completed",
                        )
                      }
                    >
                      {t.completed_at ? "✓" : "○"}
                    </button>
                    <span>
                      <strong>{t.title}</strong>
                      <small>
                        {t.priority} priority
                        {t.due_at
                          ? ` · Due ${new Date(t.due_at).toLocaleDateString(user.locale, { timeZone: user.timezone })}`
                          : ""}
                        {t.recurrence !== "none" ? ` · ${t.recurrence}` : ""}
                        {t.project_id
                          ? ` · ${state.projects.find((p) => p.id === t.project_id)?.name || ""}`
                          : ""}
                      </small>
                      {t.reminder_at &&
                        !t.completed_at &&
                        new Date(t.reminder_at) <= new Date() && (
                          <small className="negative">Reminder due</small>
                        )}
                    </span>
                    {actions("tasks", t)}
                  </article>
                ))}
              {!state.tasks.filter((t) =>
                taskFilter === "open" ? !t.completed_at : !!t.completed_at,
              ).length && (
                <p className="muted">
                  {taskFilter === "open"
                    ? "No open tasks. Add one to plan what matters."
                    : "No completed tasks yet."}
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {page === "Habits" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Everyday habits</h2>
            <button
              className="primary"
              onClick={() => setEditor({ resource: "habits" })}
            >
              ＋ Habit
            </button>
          </div>
          {state.dashboard?.habits.length ? (
            state.dashboard.habits.map((h: Row) => (
              <article className="habit-card" key={h.id}>
                <div>
                  <h3>{h.name}</h3>
                  <p>
                    {h.cadence === "daily"
                      ? "Daily"
                      : `${h.target_per_week} times a week`}{" "}
                    · {h.streak} {h.cadence === "weekly" ? "week" : "day"}{" "}
                    streak
                  </p>
                  <p>
                    {h.week_count}/{h.week_target} check-ins this week
                  </p>
                  <Progress
                    value={h.week_count}
                    max={h.week_target}
                    title={`${h.name} weekly consistency`}
                  />
                </div>
                <div className="habit-actions">
                  <button
                    className={h.completed_today ? "secondary" : "primary"}
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () =>
                          api(
                            `/habits/${h.id}/check${h.completed_today ? "/" + currentDay(user) : ""}`,
                            h.completed_today ? "DELETE" : "POST",
                            h.completed_today
                              ? undefined
                              : { day: currentDay(user) },
                          ),
                        h.completed_today
                          ? "Check-in removed"
                          : "Habit checked in",
                      )
                    }
                  >
                    {h.completed_today ? "✓ Done today" : "Mark today"}
                  </button>
                  {actions("habits", h)}
                </div>
              </article>
            ))
          ) : (
            <div className="empty">
              <h3>Start a rhythm</h3>
              <p>
                A small habit, checked in regularly, becomes a visible pattern.
              </p>
            </div>
          )}
        </section>
      )}
      {page === "Goals" && (
        <>
          <div className="section-heading">
            <h2>Measurable goals</h2>
            <button
              className="primary"
              onClick={() => setEditor({ resource: "goals" })}
            >
              ＋ Goal
            </button>
          </div>
          <div className="account-grid">
            {state.dashboard?.goals.map((g: Row) => (
              <section className="panel goal-card" key={g.id}>
                <div className="section-heading">
                  <h3>{g.title}</h3>
                  <span className="pill">{g.status.replace("_", " ")}</span>
                </div>
                <strong>
                  {formatGoal(g, g.progress)}{" "}
                  <small>of {formatGoal(g, Number(g.target))}</small>
                </strong>
                <Progress
                  value={g.progress}
                  max={Number(g.target)}
                  title={`${g.title} progress`}
                />
                <p>
                  {Math.round(g.ratio * 100)}% complete
                  {g.due_at
                    ? ` · Due ${new Date(g.due_at).toLocaleDateString(user.locale, { timeZone: user.timezone })}`
                    : ""}
                </p>
                {actions("goals", g)}
              </section>
            ))}
            {!state.goals.length && (
              <div className="empty">
                <h3>What are you working toward?</h3>
                <p>
                  Set a target and link it to an account, a habit, your activity
                  time or completed tasks.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {page === "Insights" && (
        <>
          <div className="v1-grid">
            <section className="panel">
              <div className="section-heading">
                <h2>Spending & income</h2>
                <span className="pill">{user.currency}</span>
              </div>
              {state.analytics?.spending.map((m: Row) => {
                const scale = Math.max(
                  ...state.analytics.spending.map((x: Row) =>
                    Math.max(Number(x.income), Number(x.expense)),
                  ),
                  1,
                );
                return (
                  <div className="bar-row" key={m.month}>
                    <small>{m.month}</small>
                    <div>
                      <div
                        className="bar income"
                        style={{ width: `${(100 * m.income) / scale}%` }}
                        title={`Income ${money(m.income, user.currency, user.locale)}`}
                      />
                      <div
                        className="bar expense"
                        style={{ width: `${(100 * m.expense) / scale}%` }}
                        title={`Expense ${money(m.expense, user.currency, user.locale)}`}
                      />
                    </div>
                    <small>
                      {money(m.expense, user.currency, user.locale)}
                    </small>
                  </div>
                );
              })}
              <p className="muted">Green: income · Terracotta: expenses</p>
              <h3>Top spending this month</h3>
              {state.analytics?.categories.length ? (
                state.analytics.categories.map((c: Row) => (
                  <p className="metric-line" key={c.name}>
                    <span>{c.name}</span>
                    <strong>
                      {money(c.total, user.currency, user.locale)}
                    </strong>
                  </p>
                ))
              ) : (
                <p className="muted">No spending recorded this month.</p>
              )}
            </section>
            <section className="panel">
              <h2>Time, consistency & progress</h2>
              <p className="metric-line">
                <span>Open tasks</span>
                <strong>{state.analytics?.tasks.open}</strong>
              </p>
              <p className="metric-line">
                <span>Completed this week</span>
                <strong>{state.analytics?.tasks.completed_this_week}</strong>
              </p>
              <p className="metric-line">
                <span>Due or overdue</span>
                <strong>{state.analytics?.tasks.overdue}</strong>
              </p>
              <h3>Activities, past 7 days</h3>
              {state.analytics?.activities.length ? (
                state.analytics.activities.map((a: Row) => (
                  <p className="metric-line" key={a.name}>
                    <span>{a.name}</span>
                    <strong>{a.minutes} min</strong>
                  </p>
                ))
              ) : (
                <p className="muted">No activities logged this week.</p>
              )}
              <h3>Habits</h3>
              {state.analytics?.habits.map((h: Row) => (
                <p className="metric-line" key={h.id}>
                  <span>{h.name}</span>
                  <strong>
                    {h.week_count}/{h.week_target}
                  </strong>
                </p>
              ))}
              <h3>Goals</h3>
              {state.analytics?.goals.map((g: Row) => (
                <p className="metric-line" key={g.id}>
                  <span>{g.title}</span>
                  <strong>{Math.round(g.ratio * 100)}%</strong>
                </p>
              ))}
            </section>
          </div>
          <section className="panel insight-panel">
            <div className="section-heading">
              <div>
                <h2>Ask about your data</h2>
                <p>
                  Answers use your recorded figures and show their source
                  records.
                </p>
              </div>
              <span className="pill">Private calculations</span>
            </div>
            {!state.privacy?.ai_consent ? (
              <div className="consent-box">
                <p>
                  Enable insights to ask questions about your Nomi data.
                  Questions are processed within your account on this server; no
                  external AI provider receives them.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    void mutate(
                      () =>
                        api("/privacy/ai-consent", "PUT", { enabled: true }),
                      "Insights enabled",
                    )
                  }
                >
                  Enable data insights
                </button>
              </div>
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = new FormData(e.currentTarget).get("question");
                    void ask(String(q));
                  }}
                >
                  {label(
                    "Your question",
                    <input
                      name="question"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder="How much did I spend this month?"
                    />,
                  )}
                  <button className="primary" disabled={busy}>
                    Ask Nomi
                  </button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void ask("Give me my weekly summary")}
                  >
                    Weekly summary
                  </button>
                </form>
                <div className="question-chips">
                  {[
                    "How much did I spend this month?",
                    "How much time did I spend on exercise?",
                    "How are my goals?",
                    "What tasks are due?",
                  ].map((q) => (
                    <button
                      className="secondary"
                      key={q}
                      onClick={() => void ask(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                {insight && (
                  <div className="insight-answer" role="status">
                    <h3>Based on your records</h3>
                    <p>{insight.answer}</p>
                    <small>{insight.method}</small>
                    <details>
                      <summary>
                        {insight.sources.length} supporting records
                      </summary>
                      <ul>
                        {insight.sources.map(
                          (s: { type: string; id: string }, i: number) => (
                            <li key={i}>
                              {s.type} · {s.id}
                            </li>
                          ),
                        )}
                      </ul>
                    </details>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
      {page === "Settings" && (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Data and privacy</h2>
              <span className="pill">Your control</span>
            </div>
            <p className="muted">
              Nomi stores records you enter or explicitly import. Imports and
              data questions require your action. No external AI service
              receives your data.
            </p>
            <p className="metric-line">
              <span>Data insights consent</span>
              <button
                className="secondary"
                onClick={() =>
                  void mutate(
                    () =>
                      api("/privacy/ai-consent", "PUT", {
                        enabled: !state.privacy?.ai_consent,
                      }),
                    state.privacy?.ai_consent
                      ? "Insights disabled"
                      : "Insights enabled",
                  )
                }
              >
                {state.privacy?.ai_consent
                  ? "Enabled · turn off"
                  : "Off · turn on"}
              </button>
            </p>
            <div className="privacy-counts">
              {Object.entries(state.privacy?.counts || {}).map(
                ([name, count]) => (
                  <span key={name}>
                    {name.replace("_", " ")}: <strong>{String(count)}</strong>
                  </span>
                ),
              )}
            </div>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const result = await api("/privacy/export");
                  const blob = new Blob([JSON.stringify(result, null, 2)], {
                    type: "application/json",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "nomi-export.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Download my data
            </button>{" "}
            <button
              className="secondary"
              onClick={() =>
                void mutate(
                  () => api("/insights/history", "DELETE"),
                  "Question history deleted",
                )
              }
            >
              Clear question history
            </button>
            <p className="muted">
              To permanently delete this account and all its records, enter the
              confirmation phrase below.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const phrase = String(
                  new FormData(e.currentTarget).get("confirm"),
                );
                if (phrase !== "DELETE MY ACCOUNT") {
                  setError("Enter the exact confirmation phrase");
                  return;
                }
                void mutate(async () => {
                  await api("/privacy/account", "DELETE", { confirm: phrase });
                  onAccountDeleted();
                }, "Account deleted");
              }}
            >
              {label(
                "Type DELETE MY ACCOUNT",
                <input name="confirm" autoComplete="off" required />,
              )}
              <button className="danger" disabled={busy}>
                Delete my account and data
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Import your records</h2>
              <span className="pill">Optional</span>
            </div>
            <p className="muted">
              Review a CSV before saving. A bank export adds transactions;
              calendar and fitness exports add activities. You can remove an
              entire import at any time.
            </p>
            {label(
              "Import type",
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="bank_csv">Bank transactions CSV</option>
                <option value="calendar_csv">Calendar activities CSV</option>
                <option value="fitness_csv">Fitness activities CSV</option>
              </select>,
            )}
            <p className="muted">
              {source === "bank_csv"
                ? "Columns: title, type, amount, occurred_at, account, category, notes. Amount is in the account currency."
                : "Columns: title, occurred_at, duration, category, location, notes, tags. Duration is minutes."}{" "}
              Dates must include a timezone offset. Match account and category
              names already in Nomi.
            </p>
            {label(
              "Choose CSV file",
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void readFile(e.target.files?.[0] || null)}
              />,
            )}
            {preview && (
              <div className="import-preview">
                <h3>Preview: {fileName}</h3>
                <p>{preview.count} records ready to import</p>
                <ul>
                  {preview.sample.map((r: Row, i: number) => (
                    <li key={i}>
                      {r.title} · {r.occurred_at}
                    </li>
                  ))}
                </ul>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(async () => {
                      await api("/imports", "POST", {
                        source,
                        name: fileName,
                        rows: preview.rows,
                        consent: true,
                      });
                      await onDataChanged();
                      setPreview(null);
                    }, "Import complete")
                  }
                >
                  Import these {preview.count} records
                </button>
              </div>
            )}
            <h3>Previous imports</h3>
            {state.imports.length ? (
              state.imports.map((i) => (
                <article className="v1-row" key={i.id}>
                  <span className="v1-mark">⇣</span>
                  <span>
                    <strong>{i.name}</strong>
                    <small>
                      {i.source.replace("_", " ")} · {i.record_count} records ·{" "}
                      {new Date(i.created_at).toLocaleDateString(user.locale)}
                    </small>
                  </span>
                  <button
                    className="delete"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${i.name} and its imported records?`,
                        )
                      )
                        void mutate(async () => {
                          await api(`/imports/${i.id}`, "DELETE");
                          await onDataChanged();
                        }, "Import and its records removed");
                    }}
                  >
                    Remove
                  </button>
                </article>
              ))
            ) : (
              <p className="muted">No data imports yet.</p>
            )}
          </section>
        </>
      )}
      {editor && (
        <V1Editor
          resource={editor.resource}
          row={editor.row}
          user={user}
          state={state}
          finance={finance}
          busy={busy}
          error={error}
          onClose={() => {
            setEditor(null);
            setError("");
          }}
          onSubmit={async (payload) => {
            await mutate(
              () =>
                api(
                  `/${editor.resource}${editor.row ? "/" + editor.row.id : ""}`,
                  editor.row ? "PUT" : "POST",
                  payload,
                ),
              "Saved",
              true,
            );
          }}
        />
      )}
    </div>
  );
}
function V1Editor({
  resource,
  row,
  user,
  state,
  finance,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  resource: "projects" | "tasks" | "habits" | "goals";
  row?: Row;
  user: User;
  state: State;
  finance: Data;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, any>) => Promise<void>;
}) {
  const [metric, setMetric] = useState(row?.metric || "manual"),
    [cadence, setCadence] = useState(row?.cadence || "daily"),
    [accountId, setAccountId] = useState(
      row?.linked_account_id || finance.accounts[0]?.id || "",
    );
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data: Record<string, any> = Object.fromEntries(f);
    if (resource === "projects")
      return onSubmit({ name: data.name, description: data.description });
    if (resource === "habits")
      return onSubmit({
        name: data.name,
        cadence,
        target_per_week: cadence === "daily" ? 7 : Number(data.target_per_week),
      });
    if (resource === "tasks")
      return onSubmit({
        title: data.title,
        notes: data.notes,
        priority: data.priority,
        project_id: data.project_id || null,
        goal_id: data.goal_id || null,
        due_at: toIso(f.get("due_at")),
        reminder_at: toIso(f.get("reminder_at")),
        recurrence: data.recurrence,
        completed_at: row?.completed_at || null,
      });
    const c =
      finance.accounts.find((a) => a.id === accountId)?.currency ||
      user.currency;
    return onSubmit({
      title: data.title,
      metric,
      target:
        metric === "account_balance"
          ? minor(String(data.target), c)
          : Number(data.target),
      manual_progress: metric === "manual" ? Number(data.manual_progress) : 0,
      linked_account_id: metric === "account_balance" ? accountId : null,
      linked_habit_id:
        metric === "habit_completions" ? data.linked_habit_id || null : null,
      due_at: toIso(f.get("due_at")),
    });
  }
  return (
    <Dialog
      title={`${row ? "Edit" : "Add"} ${resource.slice(0, -1)}`}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={(e) => void save(e)}>
        {label(
          resource === "projects" || resource === "habits" ? "Name" : "Title",
          <input
            autoFocus
            name={
              resource === "projects" || resource === "habits"
                ? "name"
                : "title"
            }
            required
            maxLength={160}
            defaultValue={row?.name || row?.title || ""}
          />,
        )}
        {resource === "projects" &&
          label(
            "Description",
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={row?.description || ""}
            />,
          )}
        {resource === "tasks" && (
          <>
            {label(
              "Notes",
              <textarea
                name="notes"
                rows={3}
                maxLength={4000}
                defaultValue={row?.notes || ""}
              />,
            )}
            {label(
              "Priority",
              <select name="priority" defaultValue={row?.priority || "medium"}>
                <option>low</option>
                <option>medium</option>
                <option>high</option>
              </select>,
            )}
            {label(
              "Project",
              <select name="project_id" defaultValue={row?.project_id || ""}>
                <option value="">No project</option>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>,
            )}
            {label(
              "Goal",
              <select name="goal_id" defaultValue={row?.goal_id || ""}>
                <option value="">No goal</option>
                {state.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>,
            )}
            {label(
              "Due date and time",
              <input
                type="datetime-local"
                name="due_at"
                defaultValue={asDate(row?.due_at)}
              />,
            )}
            {label(
              "Reminder date and time",
              <input
                type="datetime-local"
                name="reminder_at"
                defaultValue={asDate(row?.reminder_at)}
              />,
            )}
            <small>
              Reminders appear in the planner when due; browser push
              notifications are not enabled.
            </small>
            {label(
              "Repeat",
              <select
                name="recurrence"
                defaultValue={row?.recurrence || "none"}
              >
                <option value="none">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>,
            )}
          </>
        )}
        {resource === "habits" && (
          <>
            {label(
              "Cadence",
              <select
                name="cadence"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>,
            )}
            {cadence === "weekly" &&
              label(
                "Target days per week",
                <input
                  name="target_per_week"
                  type="number"
                  min={1}
                  max={7}
                  defaultValue={row?.target_per_week || 3}
                />,
              )}
          </>
        )}
        {resource === "goals" && (
          <>
            {label(
              "Measure progress by",
              <select
                name="metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="manual">Manual amount</option>
                <option value="account_balance">Account balance</option>
                <option value="activity_minutes">
                  Linked activity minutes
                </option>
                <option value="habit_completions">Habit completions</option>
                <option value="tasks_completed">Completed linked tasks</option>
              </select>,
            )}
            {metric === "account_balance" &&
              label(
                "Account",
                <select
                  name="linked_account_id"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  <option value="">Choose account</option>
                  {finance.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </select>,
              )}
            {metric === "habit_completions" &&
              label(
                "Habit",
                <select
                  name="linked_habit_id"
                  defaultValue={row?.linked_habit_id || ""}
                  required
                >
                  <option value="">Choose habit</option>
                  {state.habits.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>,
              )}
            {label(
              `Target ${metric === "account_balance" ? `(${finance.accounts.find((a) => a.id === accountId)?.currency || user.currency})` : metric === "activity_minutes" ? "(minutes)" : "(count)"}`,
              <input
                name="target"
                required
                inputMode="decimal"
                defaultValue={
                  row?.target
                    ? metric === "account_balance"
                      ? major(
                          row.target,
                          finance.accounts.find((a) => a.id === accountId)
                            ?.currency || user.currency,
                        )
                      : row.target
                    : ""
                }
              />,
            )}
            {metric === "manual" &&
              label(
                "Current progress",
                <input
                  name="manual_progress"
                  required
                  type="number"
                  min={0}
                  defaultValue={row?.manual_progress || 0}
                />,
              )}
            {label(
              "Target date",
              <input
                name="due_at"
                type="datetime-local"
                defaultValue={asDate(row?.due_at)}
              />,
            )}
            <small>
              Activity and task goals count only entries explicitly linked to
              this goal.
            </small>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Save {resource.slice(0, -1)}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quotes && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quotes = !quotes;
    } else if (char === "," && !quotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quotes) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quotes) throw new Error("CSV has an unclosed quote");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2)
    throw new Error("CSV needs a header and at least one record");
  const headers = rows.shift()!.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^\ufeff/, ""),
  );
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be nonempty and unique");
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(
        `CSV row ${i + 1} has ${values.length} cells; expected ${headers.length}`,
      );
    return Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]));
  });
}
function mapRows(
  source: string,
  rows: Record<string, string>[],
  finance: Data,
) {
  if (rows.length > 500) throw new Error("Import at most 500 rows at once");
  return rows.map((r, i) => {
    const category = finance.categories.find(
      (c) =>
        c.name.toLowerCase() === r.category?.toLowerCase() &&
        c.kind === (source === "bank_csv" ? r.type : "activity"),
    );
    if (!category)
      throw new Error(
        `Row ${i + 1}: category "${r.category || ""}" does not match a Nomi category`,
      );
    if (
      !r.occurred_at ||
      !Number.isFinite(Date.parse(r.occurred_at)) ||
      !/(Z|[+-]\d\d:\d\d)$/.test(r.occurred_at)
    )
      throw new Error(
        `Row ${i + 1}: occurred_at needs a date with timezone offset`,
      );
    const base = {
      title: r.title,
      category_id: category.id,
      occurred_at: new Date(r.occurred_at).toISOString(),
      notes: r.notes || "",
    };
    if (source === "bank_csv") {
      const account = finance.accounts.find(
        (a) => a.name.toLowerCase() === r.account?.toLowerCase(),
      );
      if (!account)
        throw new Error(`Row ${i + 1}: account "${r.account || ""}" not found`);
      return {
        ...base,
        account_id: account.id,
        type: r.type,
        amount: minor(r.amount, account.currency),
      };
    }
    const duration = Number(r.duration);
    if (!Number.isInteger(duration) || duration < 1)
      throw new Error(`Row ${i + 1}: duration must be whole minutes`);
    return {
      ...base,
      duration,
      location: r.location || "",
      tags: r.tags || "",
    };
  });
}
