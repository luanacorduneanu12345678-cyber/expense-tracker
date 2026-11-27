import { useState, useEffect, type FormEvent } from "react";
import "./App.css";
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

type Currency = "RON" | "EUR";
type Theme = "blue" | "purple" | "green" | "black" | "white" | "pink" | "yellow" | "brown" | "orange" | "red";

type Expense = {
  id: string;
  amount: number;
  currency: Currency;
  category: string;
  description: string;
  date: string;
};

const categories = [
  "Food",
  "Transport",
  "Shopping",
  "Housing",
  "Entertainment",
  "Healthcare",
  "Education",
  "Other",
];

const currencies: Currency[] = ["RON", "EUR"];

const themes: Theme[] = [
  "blue",
  "purple",
  "green",
  "black",
  "white",
  "pink",
  "yellow",
  "brown",
  "orange",
  "red",
];

function getToday() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function getTotals(expenses: Expense[]): Record<Currency, number> {
  return expenses.reduce(
    (totals, expense) => {
      totals[expense.currency] += expense.amount;
      return totals;
    },
    { RON: 0, EUR: 0 }
  );
}

type Period = "Weekly" | "Monthly" | "Yearly";
const dayMs = 86400000;
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
function shiftDay(s: string, n: number) { return dateKey(new Date(Date.parse(s + "T00:00:00Z") + n * dayMs)); }
function periodBounds(anchor: string, period: Period): [string, string] {
  const d = new Date(anchor + "T00:00:00Z");
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (period === "Weekly") { const start = shiftDay(anchor, -((d.getUTCDay() + 6) % 7)); return [start, shiftDay(start, 6)]; }
  if (period === "Monthly") return [dateKey(new Date(Date.UTC(y,m,1))), dateKey(new Date(Date.UTC(y,m+1,0)))];
  if (period === "Yearly") return [`${y}-01-01`, `${y}-12-31`];
  return [anchor, anchor];
}
function ExpenseAnalysis({ expenses, onClose }: { expenses: Expense[]; onClose: () => void }) {
  const [currency, setCurrency] = useState<Currency>("RON");
  const [period, setPeriod] = useState<Period>("Monthly");
  const [anchor, setAnchor] = useState(getToday);
  const [compareAnchor, setCompareAnchor] = useState(() => shiftDay(periodBounds(getToday(), "Monthly")[0], -1));
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [start,end] = periodBounds(anchor,period);
  const [prevStart,prevEnd] = periodBounds(compareAnchor,period);
  const valid = true;
  const labelPeriod = (d: string) => {
    const fmt = (value: string, opts: Intl.DateTimeFormatOptions) => new Date(value + "T00:00:00Z").toLocaleDateString("en-GB", {...opts, timeZone:"UTC"});
    if (period === "Yearly") return d.slice(0,4);
    if (period === "Monthly") return fmt(d,{month:"long",year:"numeric"});
    const last = shiftDay(d,6);
    return d.slice(0,7) === last.slice(0,7)
      ? `${Number(d.slice(8))}–${fmt(last,{day:"numeric",month:"short",year:"numeric"})}`
      : `${fmt(d,{day:"numeric",month:"short",...(d.slice(0,4)!==last.slice(0,4)?{year:"numeric"}: {})})} – ${fmt(last,{day:"numeric",month:"short",year:"numeric"})}`;
  };
  function movePeriod(d: string, direction: number) {
    if (direction < 0) return shiftDay(periodBounds(d,period)[0],-1);
    return shiftDay(periodBounds(d,period)[1],1);
  }
  function choosePeriod(d: string) {
    setAnchor(d); setCompareAnchor(shiftDay(periodBounds(d,period)[0],-1)); setSelectedCategory(null);
  }
  function periodPicker(label: string, value: string, onChange: (d:string)=>void) {
    return <div className="period-picker"><span>{label}</span><div className="period-navigation">
      <button type="button" aria-label={`Previous ${label.toLowerCase()}`} onClick={()=>onChange(movePeriod(value,-1))}>‹</button>
      <strong>{labelPeriod(value)}</strong>
      <button type="button" aria-label={`Next ${label.toLowerCase()}`} onClick={()=>onChange(movePeriod(value,1))}>›</button>
    </div></div>;
  }
  const money = (n: number) => formatMoney(n,currency);
  const sum = (rows: Expense[]) => rows.reduce((s,e) => s+e.amount,0);
  const rows = valid ? expenses.filter(e => e.currency === currency && e.date >= start && e.date <= end) : [];
  const previous = valid ? expenses.filter(e => e.currency === currency && e.date >= prevStart && e.date <= prevEnd) : [];
  const total = sum(rows), prior = sum(previous);
  const grouped = new Map<string,number>();
  rows.forEach(e => grouped.set(e.category,(grouped.get(e.category) ?? 0)+e.amount));
  const colors = ["#38bdf8","#a78bfa","#34d399","#fbbf24","#fb7185","#60a5fa","#f97316","#2dd4bf"];
  let offset = 0;
  const parts = [...grouped].sort((a,b)=>b[1]-a[1]).map(([name,value],i)=>{const from=offset; offset+=value/total*100; return {name,value,from,to:offset,color:colors[i%colors.length]};});
  const gradient = parts.map(p=>`${p.color} ${p.from}% ${p.to}%`).join(",");
  const monthly = period === "Yearly";
  const bucket = (items:Expense[]) => { const result = new Map<number,number>(); items.forEach(e=>{const k=monthly?Number(e.date.slice(5,7)):period==="Weekly"?Math.round((Date.parse(e.date)-Date.parse(periodBounds(e.date,"Weekly")[0]))/dayMs)+1:Number(e.date.slice(8,10)); result.set(k,(result.get(k)??0)+e.amount);}); return result; };
  const currentBuckets=bucket(rows), previousBuckets=bucket(previous);
  const count=monthly?12:period==="Weekly"?7:Math.max(Number(end.slice(8,10)),Number(prevEnd.slice(8,10)));
  const trend=Array.from({length:count},(_,i)=>({label:monthly?new Date(Date.UTC(2020,i,1)).toLocaleDateString("en-GB",{month:"short",timeZone:"UTC"}):period==="Weekly"?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]:String(i+1),current:currentBuckets.get(i+1)??0,previous:previousBuckets.get(i+1)??0}));
  const max=Math.max(1,...trend.flatMap(t=>[t.current,t.previous]));
  const comparisonMax = Math.max(1,total,prior);
  const delta = total-prior;
  const change = prior > 0 ? `${delta>0?"+":""}${(delta/prior*100).toFixed(1)}%` : "N/A";
  const changeTone = prior === 0 || delta === 0 ? "neutral" : delta > 0 ? "increase" : "decrease";
  const changeLabel = prior === 0 ? "No previous expenses" : delta > 0 ? "Spending increased" : delta < 0 ? "Spending decreased" : "No change";
  function changePeriod(p: Period) { setPeriod(p); setSelectedCategory(null); setCompareAnchor(shiftDay(periodBounds(anchor,p)[0],-1)); }
  return <section className="panel analysis-panel" id="expense-analysis">
    <div className="analysis-heading"><div><h2>Expense Analysis</h2><p>Understand where your money goes.</p></div><button type="button" onClick={onClose}>Close analysis</button></div>
    <div className="analysis-filters">
      <label>Currency<select value={currency} onChange={e=>{setCurrency(e.target.value as Currency);setSelectedCategory(null);}}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Period<select value={period} onChange={e=>changePeriod(e.target.value as Period)}>{["Weekly","Monthly","Yearly"].map(p=><option key={p} value={p}>{p==="Weekly"?"Week":p==="Monthly"?"Month":"Year"}</option>)}</select></label>
      {periodPicker("Selected period",start,choosePeriod)}
      {periodPicker("Compare with",prevStart,setCompareAnchor)}
    </div>
    {!valid ? <p role="alert">Choose valid date ranges.</p> : <>
    <p className="analysis-muted">{labelPeriod(start)} · {currency} · Comparison: {labelPeriod(prevStart)}</p>
    <div className="analysis-stats">{[["Total Expenses",money(total)],["Top Spending Category",parts[0]?.name??"—"]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    <p className="analysis-muted">Transactions in selected period: {rows.length} · All-time transactions (all currencies): {expenses.length}</p>
    <div className="analysis-grid"><div className="analysis-box"><h3>Spending by Category</h3>{parts.length ? <><div className="analysis-donut" role="img" aria-label="Spending by category; values listed below" style={{background:`conic-gradient(${gradient})`}}><span>{money(total)}</span></div><div className="analysis-legend">{parts.map(p=><button type="button" key={p.name} aria-pressed={selectedCategory===p.name} onClick={()=>setSelectedCategory(selectedCategory===p.name?null:p.name)}><i style={{background:p.color}}/><span>{p.name}</span><strong>{money(p.value)} · {(p.value/total*100).toFixed(1)}%</strong></button>)}</div>{selectedCategory && <p className="analysis-muted">{selectedCategory}: {rows.filter(e=>e.category===selectedCategory).length} transactions</p>}</> : <p className="empty">No expenses in this period.</p>}</div>
    <div className="analysis-box"><h3>Expense Comparison</h3>{[["Selected period",total],["Comparison period",prior]].map(([label,value])=><div className="analysis-comparison" key={label}><span>{label}</span><strong>{money(Number(value))}</strong><div><i style={{width:`${Number(value)/comparisonMax*100}%`}}/></div></div>)}<p>Difference: <strong>{money(total-prior)}</strong></p><div className={`spending-change ${changeTone}`}><small>Spending Change</small><strong>{change}</strong><span>{changeLabel}</span></div></div></div>
    <div className="analysis-box analysis-trend"><h3>Spending Trends — Period Comparison</h3><p className="analysis-muted">{monthly?"By month":period==="Weekly"?"By weekday":"By day of month"} · {currency}</p><div className="paired-legend"><span>● {labelPeriod(start)}</span><span>● {labelPeriod(prevStart)}</span></div><div className="paired-scroll"><div className="paired-chart" style={{minWidth:Math.max(280,trend.length*36)}}>{trend.map(t=><div className="paired-column" key={t.label}><div className="paired-bars"><i title={`${t.label}: ${money(t.current)}`} style={{height:`${t.current/max*100}%`}}/><i title={`${t.label}: ${money(t.previous)}`} style={{height:`${t.previous/max*100}%`}}/></div><small>{t.label}</small></div>)}</div></div><details><summary>View exact amounts</summary>{trend.map(t=><p className="analysis-muted" key={t.label}>{t.label}: {money(t.current)} / {money(t.previous)}</p>)}</details></div>
    </>}
  </section>;
}

function ExpenseEditor({ expense, uid }: { expense: Expense; uid: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(expense);
  const [amount, setAmount] = useState(String(expense.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || auth.currentUser?.uid !== uid) return;
    const value = Number(amount.trim().replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !currencies.includes(draft.currency) || !draft.category) {
      setError("Please enter a valid amount, currency, category and date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", uid, "expenses", expense.id), {
        amount: value, currency: draft.currency, category: draft.category,
        description: draft.description.trim(), date: draft.date,
      });
      setEditing(false);
    } catch (err) {
      console.error(err);
      setError("Unable to update expense. Please try again.");
    } finally { setSaving(false); }
  }
  return editing ? <form className="category-editor full-expense-editor" onSubmit={save}>
    <label>Amount<input inputMode="decimal" value={amount} required disabled={saving} onChange={e => setAmount(e.target.value)} /></label>
    <label>Currency<select value={draft.currency} disabled={saving} onChange={e => setDraft({...draft, currency: e.target.value as Currency})}>
      {currencies.map(c => <option key={c}>{c}</option>)}
    </select></label>
    <label>Category<select value={draft.category} disabled={saving} onChange={e => setDraft({...draft, category: e.target.value})}>
      {!categories.includes(draft.category) && <option>{draft.category}</option>}
      {categories.map(c => <option key={c}>{c}</option>)}
    </select></label>
    <label>Description<input value={draft.description} disabled={saving} onChange={e => setDraft({...draft, description: e.target.value})} /></label>
    <label>Expense Date<input type="date" required value={draft.date} disabled={saving} onChange={e => setDraft({...draft, date: e.target.value})} /></label>
    <div className="category-editor-buttons">
      <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
    </div>
    {error && <small role="alert">{error}</small>}
  </form> : <button type="button" className="edit-category-button" onClick={() => { setDraft(expense); setAmount(String(expense.amount)); setError(""); setEditing(true); }}>Edit</button>;
}

function App() {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  // FIREBASE AUTHENTICATION
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [expensesReady, setExpensesReady] = useState(false);

  async function emailLogin(register: boolean) {
    setAuthError("");
    try {
      if (register) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setPassword("");
    } catch (error) {
      console.error(error);
      setAuthError("Authentication failed. Check your email and password (at least 6 characters when registering).");
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // THEME

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("expense-theme");

    if (
      saved === "blue" ||
      saved === "purple" ||
      saved === "green" ||
      saved === "black" ||
      saved === "white" ||
      saved === "pink" ||
      saved === "yellow" ||
      saved === "brown" ||
      saved === "orange" ||
      saved === "red"
    ) {
      return saved;
    }

    return "blue";
  });

  useEffect(() => {
    localStorage.setItem("expense-theme", theme);
  }, [theme]);

  // EXPENSES

  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Nu amestecăm datele între conturi. Firestore este sursa de adevăr.
  useEffect(() => {
    setExpenses([]);
    setExpensesReady(false);
    setSyncError("");
    if (!user) return;

    const expenseCollection = collection(db, "users", user.uid, "expenses");
    const unsubscribe = onSnapshot(
      expenseCollection,
      (snapshot) => {
        const next: Expense[] = snapshot.docs.flatMap((entry) => {
          const item = entry.data();
          if (
            typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0 ||
            typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
          ) return [];
          return [{
            id: entry.id,
            amount: item.amount,
            currency: item.currency === "EUR" ? "EUR" : "RON",
            category: typeof item.category === "string" ? item.category : "Other",
            description: typeof item.description === "string" ? item.description : "",
            date: item.date,
          }];
        });
        setExpenses(next);
        setExpensesReady(true);
        setSyncError("");
      },
      (error) => {
        console.error("Firestore:", error);
        setSyncError("Unable to load expenses. Check your connection and Firestore rules.");
        setExpensesReady(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // FORM

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("RON");
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(getToday());

  const [selectedMonth, setSelectedMonth] = useState(
    getToday().slice(0, 7)
  );

  // ADD EXPENSE

  async function addExpense(e: FormEvent<HTMLFormElement>) {
    if (!user || !expensesReady) return;
    e.preventDefault();

    const normalizedAmount = amount.trim().replace(",", ".");
    const value = Number(normalizedAmount);

    if (
      normalizedAmount === "" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      alert("Please enter a valid amount and date.");
      return;
    }

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      amount: value,
      currency,
      category,
      description: description.trim(),
      date,
    };

    try {
      await setDoc(doc(db, "users", user.uid, "expenses", newExpense.id), newExpense);
    } catch (error) {
      console.error(error);
      alert("Unable to save the expense. Please try again.");
      return;
    }

    setAmount("");
    setDescription("");
    setDate(getToday());
    setSelectedMonth(date.slice(0, 7));
  }

  // DELETE EXPENSE

  async function deleteExpense(id: string) {
    if (!user || !expensesReady) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this expense?"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "users", user.uid, "expenses", id));
    } catch (error) {
      console.error(error);
      alert("Unable to delete the expense. Please try again.");
    }
  }

  // DATE FILTERS

  const today = getToday();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  const todayExpenses = expenses.filter(
    (expense) => expense.date === today
  );

  const monthExpenses = expenses.filter((expense) =>
    expense.date.startsWith(currentMonth)
  );

  const yearExpenses = expenses.filter((expense) =>
    expense.date.startsWith(currentYear)
  );

  const filteredExpenses = expenses
    .filter((expense) => expense.date.startsWith(selectedMonth))
    .sort((a, b) => b.date.localeCompare(a.date));

  // TOTALS

  const todayTotals = getTotals(todayExpenses);
  const monthTotals = getTotals(monthExpenses);
  const yearTotals = getTotals(yearExpenses);
  const selectedMonthTotals = getTotals(filteredExpenses);

  function renderTotals(totals: Record<Currency, number>) {
    return (
      <div className="currency-totals">
        <span>{formatMoney(totals.RON, "RON")}</span>
        <span>{formatMoney(totals.EUR, "EUR")}</span>
      </div>
    );
  }

  const themeControl = (
    <div className="theme-control">
          <label htmlFor="theme">Theme</label>

          <select
            id="theme"
            value={theme}
            onChange={(e) =>
              setTheme(e.target.value as Theme)
            }
          >
            {themes.map((item) => (
              <option key={item} value={item}>
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
        </div>
  );

  return (
    <div className={`app theme-${theme} ${!user ? "login-page" : ""}`}>

      {/* HEADER */}

      <header className="header">
        <h1>Expense Tracker</h1>
        <div className="auth-control">
          {!authReady ? (
            <span>Checking authentication...</span>
          ) : user ? (
            <>
              <span>{user.displayName || user.email}</span>
              <button type="button" onClick={() => signOut(auth)}>Sign out</button>
            </>
          ) : (
            <div className="login-card">
              <p className="login-description">Sign in to view and save your expenses.</p>
              <div className="login-top-row">
              <button className="google-button" type="button" onClick={async () => {
                setAuthError("");
                try { await signInWithPopup(auth, new GoogleAuthProvider()); }
                catch (error) { console.error(error); setAuthError("Google sign-in failed. Check authorized domains in Firebase."); }
              }}>Sign in with Google</button>
              {themeControl}
              </div>
              <div className="login-divider">or</div>
              <h2>Sign in with email</h2>
              <div className="login-email-row">
              <input type="email" aria-label="Email" placeholder="Email address" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <input type="password" aria-label="Password" placeholder="Password" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button className="login-button" type="button" onClick={() => void emailLogin(false)}>Sign in</button>
              </div>
              <p className="register-text">Don’t have an account?</p>
              <button className="register-button" type="button" onClick={() => void emailLogin(true)}>Create account</button>
            </div>
          )}
          {authError && <p role="alert">{authError}</p>}
        </div>
        {(user || !authReady) && themeControl}
      </header>

      <main>
        {user && !expensesReady && !syncError && <p role="status">Loading expenses...</p>}
        {syncError && <p role="alert">{syncError}</p>}

        {/* DASHBOARD */}

        {user && expensesReady && <>
        <section className="dashboard">

          <div className="stat-card">
            <p>Today's Expenses</p>
            {renderTotals(todayTotals)}
          </div>

          <div className="stat-card">
            <p>Monthly Expenses</p>
            {renderTotals(monthTotals)}
          </div>

          <div className="stat-card">
            <p>Yearly Expenses</p>
            {renderTotals(yearTotals)}
          </div>

          <button type="button" className="stat-card analysis-launch" aria-expanded={analysisOpen} onClick={() => setAnalysisOpen(v => !v)}>
            <p>Explore your spending</p>
            <h2>Expense Analysis</h2>
            <span>{analysisOpen ? "Hide analysis ↑" : "View analysis →"}</span>
          </button>

        </section>

        {analysisOpen && <ExpenseAnalysis key={user.uid} expenses={expenses} onClose={() => setAnalysisOpen(false)} />}

        {/* MAIN CONTENT */}

        <section className="content-grid">

          {/* ADD EXPENSE */}

          <div className="panel">
            <h2>Add Expense</h2>

            <form onSubmit={addExpense}>

              <label htmlFor="amount">Amount</label>

              <input
                id="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />

              <label htmlFor="currency">Currency</label>

              <select
                id="currency"
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value as Currency)
                }
              >
                {currencies.map((item) => (
                  <option key={item} value={item}>
                    {item === "RON"
                      ? "RON - Romanian Leu"
                      : "EUR - Euro"}
                  </option>
                ))}
              </select>

              <label htmlFor="category">Category</label>

              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <label htmlFor="description">Description</label>

              <input
                id="description"
                type="text"
                autoComplete="off"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <label htmlFor="date">Expense Date</label>

              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />

              <button className="add-button" type="submit">
                + Save Expense
              </button>

            </form>
          </div>

          {/* EXPENSE HISTORY */}

          <div className="panel">

            <div className="history-header">
              <h2>Expense History</h2>

              <input
                type="month"
                aria-label="Select Month"
                value={selectedMonth}
                onChange={(e) =>
                  setSelectedMonth(e.target.value)
                }
              />
            </div>

            <div className="month-total">
              <span>Selected Month Total:</span>
              {renderTotals(selectedMonthTotals)}
            </div>

            {filteredExpenses.length === 0 ? (
              <p className="empty">
                No expenses recorded for this month.
              </p>
            ) : (
              <div className="expense-list">
                {filteredExpenses.map((expense) => (
                  <div
                    className="expense-item"
                    key={`${user.uid}:${expense.id}`}
                  >
                    <div>
                      <strong>{expense.category}</strong>

                      <p>
                        {expense.description || "No description"}
                      </p>

                      <small>{expense.date}</small>
                      <ExpenseEditor expense={expense} uid={user.uid} />
                    </div>

                    <div className="expense-actions">
                      <strong>
                        {formatMoney(
                          expense.amount,
                          expense.currency
                        )}
                      </strong>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => deleteExpense(expense.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>
        </>}
      </main>

      <footer>
        Expense Tracker • Version 1.4.5 • Multi-Currency
      </footer>

    </div>
  );
}

export default App;