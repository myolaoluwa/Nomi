import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  balance,
  dayKey,
  digits,
  emptyData,
  localInput,
  major,
  minor,
  money,
  type Data,
  type Resource,
  type Row,
  type User,
} from "./lib";
const currencies = [
  "NGN",
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "GHS",
  "KES",
  "ZAR",
  "JPY",
  "INR",
  "KWD",
];
const pages = [
  "Overview",
  "Finance",
  "Activities",
  "Timeline",
  "Settings",
] as const;
type Page = (typeof pages)[number];
const icons = ["◈", "▤", "◷", "≋", "⚙"];
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Currency({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {Array.from(new Set([value, ...currencies])).map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}
function Auth({ onLogin }: { onLogin: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [currency, setCurrency] = useState("NGN");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(`/auth/${register ? "register" : "login"}`, "POST", {
        email: f.get("email"),
        password: f.get("password"),
        ...(register
          ? {
              name: f.get("name"),
              currency,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              locale: navigator.language,
            }
          : {}),
      });
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-story">
        <a className="brand" href="#">
          n<span>o</span>mi<span className="brand-dot">.</span>
        </a>
        <div>
          <p className="eyebrow">A LITTLE CLARITY, EVERY DAY</p>
          <h1>
            Your money.
            <br />
            Your time.
            <br />
            <em>Your life, connected.</em>
          </h1>
          <p>
            A calm place to see where it all goes — and make room for what
            matters.
          </p>
          <div className="orbit">
            <div className="orbit-center">n.</div>
            <span className="orbit-tag tag-one">↗ Money in perspective</span>
            <span className="orbit-tag tag-two">◷ Time with intention</span>
            <span className="orbit-tag tag-three">✦ A clearer picture</span>
          </div>
        </div>
        <small>Made for your everyday.</small>
      </section>
      <section className="auth-form">
        <p className="eyebrow">WELCOME TO NOMI</p>
        <h2>
          {register ? "Make space for clarity." : "Good to see you again."}
        </h2>
        <p>
          {register
            ? "Start with the basics. Build your picture as you go."
            : "Sign in to pick up where you left off."}
        </p>
        <form onSubmit={submit}>
          {register && (
            <Field label="Your name">
              <input name="name" autoComplete="name" required maxLength={160} />
            </Field>
          )}
          <Field label="Email address">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              minLength={10}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </Field>
          {register && (
            <>
              <small>Use at least 10 characters.</small>
              <Field label="Default currency">
                <Currency value={currency} onChange={setCurrency} />
              </Field>
              <small>
                Your timezone starts as{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}. You can
                change it in Settings.
              </small>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Please wait…"
              : register
                ? "Create your account →"
                : "Sign in →"}
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to Nomi?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
        <small className="privacy-note">
          Your records are private to your account. Bank connections are not
          required.
        </small>
      </section>
    </main>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [data, setData] = useState<Data>(emptyData),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState<Page>("Overview"),
    [tab, setTab] = useState<Resource>("accounts"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<{ resource: Resource; row?: Row } | null>(
      null,
    ),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [deleteTarget, setDeleteTarget] = useState<{
      resource: Resource;
      row: Row;
    } | null>(null),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const me = await api("/me");
    const resources = Object.keys(emptyData) as Resource[];
    const results = await Promise.all(resources.map((r) => api("/" + r)));
    setUser(me);
    setData(
      Object.fromEntries(resources.map((r, i) => [r, results[i]])) as Data,
    );
  }
  useEffect(() => {
    void refresh()
      .catch((e) => {
        if (e.message !== "Please sign in to continue") setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    setSearch("");
    setFilter("all");
  }, [page]);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(id);
    }
  }, [notice]);
  if (loading)
    return (
      <div className="loading">
        <span className="brand">nomi.</span>
        <p>Finding your place…</p>
      </div>
    );
  if (!user)
    return (
      <>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Auth onLogin={refresh} />
      </>
    );
  const fmt = (n: number | string, c = user.currency) =>
    money(n, c, user.locale);
  const category = (id: string) => data.categories.find((c) => c.id === id);
  const account = (id: string) => data.accounts.find((a) => a.id === id);
  const today = dayKey(new Date().toISOString(), user.timezone),
    month = today.slice(0, 7);
  const monthTransactions = data.transactions.filter((t) =>
    dayKey(t.occurred_at, user.timezone).startsWith(month),
  );
  const inCurrency = monthTransactions.filter(
    (t) => account(t.account_id)?.currency === user.currency,
  );
  const income = inCurrency
      .filter((t) => t.type === "income")
      .reduce((n, t) => n + Number(t.amount), 0),
    expenses = inCurrency
      .filter((t) => t.type === "expense")
      .reduce((n, t) => n + Number(t.amount), 0);
  const totals: Record<string, number> = Object.fromEntries(
    [...new Set(data.accounts.map((a) => a.currency))].map((c) => [
      c,
      data.accounts
        .filter((a) => a.currency === c)
        .reduce((n, a) => n + balance(a, data.transactions), 0),
    ]),
  );
  const todayActivities = data.activities.filter(
    (a) => dayKey(a.occurred_at, user.timezone) === today,
  );
  const events = [
    ...data.transactions.map((t): Row & { eventType: Resource } => ({
      ...t,
      eventType: "transactions" as Resource,
    })),
    ...data.activities.map((a): Row & { eventType: Resource } => ({
      ...a,
      eventType: "activities" as Resource,
    })),
  ].sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  const filtered = events.filter(
    (e) =>
      (filter === "all" || e.eventType === filter) &&
      `${e.title} ${e.notes} ${e.tags || ""} ${category(e.category_id)?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function open(resource: Resource, row?: Row) {
    setModal({ resource, row });
    setError("");
  }
  function actions(resource: Resource, row: Row) {
    return (
      <div className="row-actions">
        <button
          aria-label={`Edit ${row.name || row.title || "budget"}`}
          onClick={() => open(resource, row)}
        >
          Edit
        </button>
        <button
          className="delete"
          aria-label={`Delete ${row.name || row.title || "budget"}`}
          onClick={() => setDeleteTarget({ resource, row })}
        >
          Delete
        </button>
      </div>
    );
  }
  function empty(title: string, body: string, resource?: Resource) {
    return (
      <div className="empty">
        <span>↗</span>
        <h3>{title}</h3>
        <p>{body}</p>
        {resource && (
          <button className="secondary" onClick={() => open(resource)}>
            Add{" "}
            {resource === "activities"
              ? "an activity"
              : resource === "accounts"
                ? "an account"
                : resource === "transactions"
                  ? "a transaction"
                  : "a budget"}
          </button>
        )}
      </div>
    );
  }
  function eventList(list: typeof events, group = false) {
    let last = "";
    return list.map((e) => {
      const key = dayKey(e.occurred_at, user!.timezone),
        header = group && last !== key;
      last = key;
      const isActivity = e.eventType === "activities";
      const a = isActivity
        ? data.transactions.find((t) => t.id === e.transaction_id)
        : e;
      const c = a ? account(a.account_id)?.currency : undefined;
      return (
        <div key={e.id}>
          {header && (
            <h3 className="day-heading">
              {key === today
                ? "Today"
                : new Date(e.occurred_at).toLocaleDateString(user!.locale, {
                    timeZone: user!.timezone,
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
            </h3>
          )}
          <article className="event">
            <div
              className={`event-icon ${isActivity ? "sand" : e.type === "income" ? "mint" : "rose"}`}
            >
              {isActivity ? "◷" : e.type === "income" ? "↙" : "↗"}
            </div>
            <div className="event-body">
              <strong>{e.title}</strong>
              <p>
                {category(e.category_id)?.name} <span>·</span>{" "}
                {new Date(e.occurred_at).toLocaleTimeString(user!.locale, {
                  timeZone: user!.timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {isActivity && ` · ${e.duration} min`}
                {e.location && ` · ${e.location}`}
              </p>
              {e.notes && <p>{e.notes}</p>}
              {e.tags && (
                <div className="tags">
                  {e.tags
                    .split(",")
                    .filter(Boolean)
                    .map((tag: string, i: number) => (
                      <span key={i}>{tag.trim()}</span>
                    ))}
                </div>
              )}
            </div>
            <div className="event-end">
              {a && c && (
                <strong className={a.type === "income" ? "positive" : ""}>
                  {a.type === "income" ? "+" : "−"}
                  {fmt(a.amount, c)}
                </strong>
              )}
              {isActivity && a && <small>Linked transaction</small>}
              {actions(e.eventType, e)}
            </div>
          </article>
        </div>
      );
    });
  }
  async function remove() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/${deleteTarget.resource}/${deleteTarget.row.id}`, "DELETE");
      setDeleteTarget(null);
      await refresh();
      setNotice("Record deleted");
    } catch (e) {
      setError((e as Error).message);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="layout">
      <aside className="sidebar">
        <a href="#" onClick={() => setPage("Overview")} className="brand">
          n<span>o</span>mi<span className="brand-dot">.</span>
        </a>
        <p className="nav-caption">YOUR EVERYDAY</p>
        <nav>
          {pages.map((p, i) => (
            <button
              key={p}
              aria-label={p}
              className={page === p ? "active" : ""}
              onClick={() => setPage(p)}
            >
              <span>{icons[i]}</span>
              {p}
              {page === p && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <span>✦</span>
            <strong>Small steps. Clearer days.</strong>
            <p>Your everyday adds up to something meaningful.</p>
          </div>
          <button className="profile" onClick={() => setPage("Settings")}>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>Your personal space</small>
            </span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            My workspace <span className="slash">/</span>{" "}
            <strong>{page}</strong>
          </span>
          <span className="top-date">
            {new Date().toLocaleDateString(user.locale, {
              timeZone: user.timezone,
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            <span className="status-dot" /> Personal
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "Overview"
                  ? "YOUR LIFE, AT A GLANCE"
                  : "A LITTLE MORE CLARITY"}
              </p>
              <h1>
                {page === "Overview"
                  ? `Hello, ${user.name.split(" ")[0]}.`
                  : page === "Finance"
                    ? "Money, in perspective."
                    : page === "Activities"
                      ? "Make your time count."
                      : page === "Timeline"
                        ? "Your days, connected."
                        : "Make yourself at home."}
              </h1>
              <p>
                {page === "Overview"
                  ? "A little perspective on your money and your day."
                  : page === "Finance"
                    ? "Keep track of what comes in, what goes out, and what stays."
                    : page === "Activities"
                      ? "Capture the moments that make up your day."
                      : page === "Timeline"
                        ? "Your time and spending, together in one place."
                        : "A few preferences to make Nomi feel like you."}
              </p>
            </div>
            {page !== "Settings" && (
              <button
                className="primary"
                onClick={() => open(page === "Finance" ? tab : "activities")}
              >
                ＋{" "}
                {page === "Finance"
                  ? `Add ${tab === "categories" ? "category" : tab === "accounts" ? "account" : tab === "budgets" ? "budget" : "transaction"}`
                  : "Log activity"}
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void refresh().catch((e) => setError(e.message));
                }}
              >
                Retry
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              ✓ {notice}
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="stats-grid">
                <section className="stat featured">
                  <div>
                    <span>Total balance</span>
                    <span>↗</span>
                  </div>
                  <h2>{fmt(totals[user.currency] || 0)}</h2>
                  <small>
                    {
                      data.accounts.filter((a) => a.currency === user.currency)
                        .length
                    }{" "}
                    accounts in {user.currency}
                  </small>
                </section>
                <section className="stat">
                  <div>
                    <span>Money in</span>
                    <span className="positive">↙</span>
                  </div>
                  <h2>{fmt(income)}</h2>
                  <small>This month · {user.currency}</small>
                </section>
                <section className="stat">
                  <div>
                    <span>Money out</span>
                    <span>↗</span>
                  </div>
                  <h2>{fmt(expenses)}</h2>
                  <small>This month · {user.currency}</small>
                </section>
                <section className="stat">
                  <div>
                    <span>Time logged today</span>
                    <span>◷</span>
                  </div>
                  <h2>
                    {Math.floor(
                      todayActivities.reduce((n, a) => n + a.duration, 0) / 60,
                    )}
                    <small> h </small>
                    {todayActivities.reduce((n, a) => n + a.duration, 0) % 60}
                    <small> m</small>
                  </h2>
                  <small>{todayActivities.length} activities recorded</small>
                </section>
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Your recent days</h2>
                      <p>A shared view of time and money</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("Timeline")}
                    >
                      View timeline →
                    </button>
                  </div>
                  {events.length
                    ? eventList(events.slice(0, 5))
                    : empty(
                        "Your story starts here",
                        "Add an account and log your first activity to bring your day into focus.",
                        "activities",
                      )}
                </section>
                <div className="right-column">
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Quick actions</h2>
                      <span>↗</span>
                    </div>
                    <div className="quick-actions">
                      <button onClick={() => open("transactions")}>
                        <span className="mint">↗</span>
                        <strong>Add transaction</strong>
                        <small>Capture a little money movement</small>
                      </button>
                      <button onClick={() => open("activities")}>
                        <span className="sand">◷</span>
                        <strong>Log an activity</strong>
                        <small>Give your time a little context</small>
                      </button>
                      <button onClick={() => open("accounts")}>
                        <span className="lavender">▤</span>
                        <strong>Add an account</strong>
                        <small>Start building your financial picture</small>
                      </button>
                    </div>
                  </section>
                  <section className="reflection">
                    <p className="eyebrow">A MOMENT OF PERSPECTIVE</p>
                    <h2>
                      Awareness is a<br />
                      good place to start.
                    </h2>
                    <p>
                      Every entry helps you understand your everyday a little
                      better.
                    </p>
                    <span>✳</span>
                  </section>
                </div>
              </div>
            </>
          )}
          {page === "Finance" && (
            <>
              <div className="tabs">
                {(
                  [
                    "accounts",
                    "transactions",
                    "budgets",
                    "categories",
                  ] as Resource[]
                ).map((t) => (
                  <button
                    className={tab === t ? "selected" : ""}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t[0].toUpperCase() + t.slice(1)}{" "}
                    <span>{data[t].length}</span>
                  </button>
                ))}
              </div>
              {tab === "accounts" && (
                <>
                  <div className="balance-strip">
                    {Object.entries(totals).map(([c, n]) => (
                      <span key={c}>
                        Net balance · {c} <strong>{fmt(n, c)}</strong>
                      </span>
                    ))}
                    <small>
                      Balances are kept separate by currency. Credit debt is a
                      negative balance.
                    </small>
                  </div>
                  <div className="account-grid">
                    {data.accounts.map((a) => (
                      <section className="panel account-card" key={a.id}>
                        <div className="section-heading">
                          <span className="account-symbol">▤</span>
                          <span className="pill">{a.type}</span>
                        </div>
                        <h3>{a.name}</h3>
                        <h2>
                          {fmt(balance(a, data.transactions), a.currency)}
                        </h2>
                        <p>
                          {a.currency} · Opening balance{" "}
                          {fmt(a.opening_balance, a.currency)}
                        </p>
                        {actions("accounts", a)}
                      </section>
                    ))}
                  </div>
                  {!data.accounts.length &&
                    empty(
                      "Give your money a home",
                      "Add a bank, cash, savings, or credit account. No bank connection needed.",
                      "accounts",
                    )}
                </>
              )}
              {tab === "transactions" && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>All transactions</h2>
                    <input
                      aria-label="Search transactions"
                      placeholder="Search transactions…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {data.transactions.length
                    ? eventList(
                        events.filter(
                          (e) =>
                            e.eventType === "transactions" &&
                            e.title
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        ),
                        true,
                      )
                    : empty(
                        "Your first money moment",
                        "Record income or an expense to see your balances change.",
                        "transactions",
                      )}
                </section>
              )}
              {tab === "budgets" && (
                <div className="account-grid">
                  {data.budgets.map((b) => {
                    const spent = data.transactions
                      .filter(
                        (t) =>
                          t.category_id === b.category_id &&
                          t.type === "expense" &&
                          account(t.account_id)?.currency === b.currency &&
                          dayKey(t.occurred_at, user.timezone).startsWith(
                            b.month,
                          ),
                      )
                      .reduce((n, t) => n + Number(t.amount), 0);
                    return (
                      <section className="panel budget-card" key={b.id}>
                        <div className="section-heading">
                          <h3>{category(b.category_id)?.name}</h3>
                          <span className="pill">{b.month}</span>
                        </div>
                        <h2>{fmt(spent, b.currency)}</h2>
                        <p>of {fmt(b.amount, b.currency)} budgeted</p>
                        <progress
                          className={spent > Number(b.amount) ? "over" : ""}
                          max={Number(b.amount)}
                          value={spent}
                          aria-label={`${category(b.category_id)?.name} budget spent`}
                        />
                        <p
                          className={
                            spent > Number(b.amount) ? "negative" : "positive"
                          }
                        >
                          {fmt(Math.abs(Number(b.amount) - spent), b.currency)}{" "}
                          {spent > Number(b.amount)
                            ? "over budget"
                            : "remaining"}
                        </p>
                        {actions("budgets", b)}
                      </section>
                    );
                  })}
                  {!data.budgets.length &&
                    empty(
                      "A little intention for your spending",
                      "Set a monthly budget for an expense category.",
                      "budgets",
                    )}
                </div>
              )}
              {tab === "categories" && (
                <section className="panel">
                  <p className="muted">
                    Personalize the categories you use for money and activities.
                  </p>
                  {data.categories.map((c) => (
                    <article className="category-row" key={c.id}>
                      <span
                        className="category-dot"
                        style={{ background: c.color }}
                      />
                      <strong>{c.name}</strong>
                      <span className="pill">{c.kind}</span>
                      {actions("categories", c)}
                    </article>
                  ))}
                </section>
              )}
            </>
          )}
          {(page === "Activities" || page === "Timeline") && (
            <>
              <div className="filter-bar">
                <div className="tabs">
                  {(page === "Timeline"
                    ? ["all", "activities", "transactions"]
                    : ["all"]
                  ).map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f === "all"
                        ? "All moments"
                        : f === "activities"
                          ? "Activities"
                          : "Spending & income"}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Search moments"
                  placeholder="Search titles, notes, or tags…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <p className="timezone-note">Times shown in {user.timezone}</p>
              <section className="panel timeline">
                {filtered.filter(
                  (e) => page !== "Activities" || e.eventType === "activities",
                ).length
                  ? eventList(
                      filtered.filter(
                        (e) =>
                          page !== "Activities" || e.eventType === "activities",
                      ),
                      true,
                    )
                  : empty(
                      search
                        ? "No matching moments"
                        : "Make a little note of today",
                      search
                        ? "Try another title, category, or tag."
                        : "Work, a walk, a good book — give your day some context.",
                      "activities",
                    )}
              </section>
            </>
          )}
          {page === "Settings" && (
            <Settings
              user={user}
              onSave={async () => {
                await refresh();
                setNotice("Preferences saved");
              }}
              onLogout={async () => {
                try {
                  await api("/auth/logout", "POST");
                  setUser(null);
                  setData(emptyData);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}
          <footer>
            Less noise. More perspective.
            <span>Nomi · Your everyday, connected.</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Editor
          resource={modal.resource}
          row={modal.row}
          data={data}
          user={user}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
            setNotice("Saved to your space");
          }}
        />
      )}
      {deleteTarget && (
        <Modal
          title="Delete this record?"
          onClose={() => setDeleteTarget(null)}
        >
          <p>
            This removes{" "}
            {deleteTarget.row.name || deleteTarget.row.title || "this budget"}{" "}
            from your account. Linked records must be unlinked first.
          </p>
          <div className="form-actions">
            <button className="secondary" onClick={() => setDeleteTarget(null)}>
              Keep record
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete record"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Modal({
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
function Editor({
  resource,
  row,
  data,
  user,
  onClose,
  onSaved,
}: {
  resource: Resource;
  row?: Row;
  data: Data;
  user: User;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [currency, setCurrency] = useState(row?.currency || user.currency),
    [kind, setKind] = useState(row?.type || "expense"),
    [categoryKind, setCategoryKind] = useState(row?.kind || "expense"),
    [accountId, setAccountId] = useState(
      row?.account_id || data.accounts[0]?.id || "",
    );
  const selectedCurrency =
    resource === "transactions"
      ? data.accounts.find((a) => a.id === accountId)?.currency || user.currency
      : currency;
  const categoryType =
    resource === "activities"
      ? "activity"
      : resource === "budgets"
        ? "expense"
        : kind;
  const options = data.categories.filter((c) => c.kind === categoryType);
  const resourceName = {
    accounts: "account",
    transactions: "transaction",
    activities: "activity",
    categories: "category",
    budgets: "budget",
  }[resource];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const form = new FormData(e.currentTarget);
      const payload: Record<string, any> = Object.fromEntries(form);
      if (resource === "accounts") {
        payload.currency = currency;
        payload.opening_balance = minor(
          String(payload.opening_balance),
          currency,
        );
      }
      if (resource === "transactions") {
        payload.amount = minor(String(payload.amount), selectedCurrency);
        payload.type = kind;
        payload.account_id = accountId;
      }
      if (resource === "budgets") {
        payload.amount = minor(String(payload.amount), currency);
        payload.currency = currency;
      }
      if (resource === "activities") {
        payload.duration = Number(payload.duration);
        payload.transaction_id = payload.transaction_id || null;
      }
      if (payload.occurred_at)
        payload.occurred_at = new Date(payload.occurred_at).toISOString();
      await api(
        `/${resource}${row ? "/" + row.id : ""}`,
        row ? "PUT" : "POST",
        payload,
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`${row ? "Edit" : "Add"} ${resourceName}`} onClose={onClose}>
      <form onSubmit={submit} className="editor-form">
        {["accounts", "categories"].includes(resource) && (
          <Field label="Name">
            <input
              autoFocus
              name="name"
              required
              defaultValue={row?.name}
              maxLength={160}
            />
          </Field>
        )}
        {["transactions", "activities"].includes(resource) && (
          <Field label="Title">
            <input
              autoFocus
              name="title"
              required
              defaultValue={row?.title}
              maxLength={160}
              placeholder={
                resource === "activities"
                  ? "e.g. A morning walk"
                  : "e.g. Groceries for the week"
              }
            />
          </Field>
        )}
        {resource === "accounts" && (
          <>
            <Field label="Account type">
              <select name="type" defaultValue={row?.type || "bank"}>
                {["bank", "cash", "savings", "credit"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <Currency value={currency} onChange={setCurrency} />
            </Field>
            <Field label="Opening balance">
              <input
                name="opening_balance"
                inputMode="decimal"
                required
                defaultValue={
                  row ? major(row.opening_balance, row.currency) : "0"
                }
              />
            </Field>
            <small>
              For credit accounts, enter outstanding debt as a negative amount.
            </small>
          </>
        )}
        {resource === "transactions" && (
          <>
            <Field label="Transaction type">
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </Field>
            <Field label="Account">
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="" disabled>
                  Select account
                </option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </select>
            </Field>
            {!data.accounts.length && (
              <p className="error">
                Add an account in Finance before recording a transaction.
              </p>
            )}
          </>
        )}
        {["transactions", "activities", "budgets"].includes(resource) && (
          <Field label="Category">
            <select
              name="category_id"
              key={categoryType}
              required
              defaultValue={row?.category_id || ""}
            >
              <option value="" disabled>
                Select category
              </option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {resource === "budgets" && (
          <>
            <Field label="Budget month">
              <input
                name="month"
                type="month"
                required
                defaultValue={
                  row?.month ||
                  dayKey(new Date().toISOString(), user.timezone).slice(0, 7)
                }
              />
            </Field>
            <Field label="Currency">
              <Currency value={currency} onChange={setCurrency} />
            </Field>
          </>
        )}
        {["transactions", "budgets"].includes(resource) && (
          <Field label={`Amount (${selectedCurrency})`}>
            <input
              name="amount"
              inputMode="decimal"
              required
              defaultValue={row ? major(row.amount, selectedCurrency) : ""}
              placeholder={(0).toFixed(digits(selectedCurrency))}
            />
          </Field>
        )}
        {["transactions", "activities"].includes(resource) && (
          <Field
            label={`When (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          >
            <input
              name="occurred_at"
              type="datetime-local"
              required
              defaultValue={localInput(row?.occurred_at)}
            />
          </Field>
        )}
        {resource === "activities" && (
          <>
            <div className="form-grid">
              <Field label="Duration (minutes)">
                <input
                  name="duration"
                  type="number"
                  min={1}
                  max={10080}
                  required
                  defaultValue={row?.duration || 30}
                />
              </Field>
              <Field label="Location (optional)">
                <input
                  name="location"
                  maxLength={200}
                  defaultValue={row?.location}
                />
              </Field>
            </div>
            <Field label="Link a transaction (optional)">
              <select
                name="transaction_id"
                defaultValue={row?.transaction_id || ""}
              >
                <option value="">No linked spending</option>
                {data.transactions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ·{" "}
                    {money(
                      t.amount,
                      data.accounts.find((a) => a.id === t.account_id)
                        ?.currency || user.currency,
                      user.locale,
                    )}
                  </option>
                ))}
              </select>
            </Field>
            <small>
              Link existing spending to give it context. This does not create a
              second charge.
            </small>
            <Field label="Tags (comma separated)">
              <input
                name="tags"
                maxLength={500}
                defaultValue={row?.tags}
                placeholder="outdoors, wellbeing"
              />
            </Field>
          </>
        )}
        {["transactions", "activities"].includes(resource) && (
          <Field label="Notes (optional)">
            <textarea
              name="notes"
              maxLength={4000}
              defaultValue={row?.notes}
              rows={3}
            />
          </Field>
        )}
        {resource === "categories" && (
          <>
            <Field label="Category type">
              <select
                name="kind"
                value={categoryKind}
                onChange={(e) => setCategoryKind(e.target.value)}
              >
                {["expense", "income", "activity"].map((t) => (
                  <option key={t} disabled={!!row && t !== row.kind}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Color">
              <input
                name="color"
                type="color"
                defaultValue={row?.color || "#47796b"}
              />
            </Field>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              busy || (resource === "transactions" && !data.accounts.length)
            }
          >
            {busy ? "Saving…" : `Save ${resourceName}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Settings({
  user,
  onSave,
  onLogout,
}: {
  user: User;
  onSave: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [currency, setCurrency] = useState(user.currency),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/me", "PUT", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        currency,
      });
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings">
      <h2>Your profile</h2>
      <p className="muted">{user.email}</p>
      <form onSubmit={save}>
        <Field label="Name">
          <input
            name="name"
            required
            defaultValue={user.name}
            maxLength={160}
          />
        </Field>
        <Field label="Default currency">
          <Currency value={currency} onChange={setCurrency} />
        </Field>
        <small>
          Used for overview totals. Account currencies remain unchanged.
        </small>
        <Field label="Timezone">
          <input
            name="timezone"
            list="timezones"
            required
            defaultValue={user.timezone}
          />
          <datalist id="timezones">
            {Intl.supportedValuesOf("timeZone").map((t) => (
              <option key={t}>{t}</option>
            ))}
          </datalist>
        </Field>
        <Field label="Locale">
          <select name="locale" defaultValue={user.locale}>
            {Array.from(
              new Set([
                user.locale,
                "en-NG",
                "en-US",
                "en-GB",
                "fr-FR",
                "de-DE",
              ]),
            ).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </form>
      <hr />
      <h3>Your private space</h3>
      <p className="muted">
        Nomi stores the records you enter. No banks or other services are
        connected. You can edit or delete entries from their respective pages.
      </p>
      <button className="secondary" onClick={() => void onLogout()}>
        Sign out
      </button>
    </section>
  );
}
