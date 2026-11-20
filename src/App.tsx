import { useState, useEffect, type FormEvent } from "react";
import "./App.css";
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

type Currency = "RON" | "EUR";
type Theme = "ocean" | "lavender" | "emerald" | "midnight";

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
  "ocean",
  "lavender",
  "emerald",
  "midnight",
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

function App() {
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
      setAuthError("Autentificarea a eșuat. Verifică emailul și parola (minimum 6 caractere la înregistrare).");
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
      saved === "ocean" ||
      saved === "lavender" ||
      saved === "emerald" ||
      saved === "midnight"
    ) {
      return saved;
    }

    return "ocean";
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
        setSyncError("Nu putem citi cheltuielile. Verifică regulile Firestore și conexiunea.");
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
      alert("Cheltuiala nu a putut fi salvată. Încearcă din nou.");
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
      alert("Ștergerea nu a reușit. Încearcă din nou.");
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

  return (
    <div className={`app theme-${theme}`}>

      {/* HEADER */}

      <header className="header">
        <h1>Expense Tracker</h1>
        <div className="auth-control">
          {!authReady ? (
            <span>Se verifică autentificarea...</span>
          ) : user ? (
            <>
              <span>{user.displayName || user.email}</span>
              <button type="button" onClick={() => signOut(auth)}>Deconectare</button>
            </>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" onClick={async () => {
                setAuthError("");
                try { await signInWithPopup(auth, new GoogleAuthProvider()); }
                catch (error) { console.error(error); setAuthError("Conectarea Google a eșuat. Verifică domeniile autorizate în Firebase."); }
              }}>Conectare cu Google</button>
              <input type="email" aria-label="Email" placeholder="Email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <input type="password" aria-label="Parolă" placeholder="Parolă" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" onClick={() => void emailLogin(false)}>Intră</button>
              <button type="button" onClick={() => void emailLogin(true)}>Creează cont</button>
            </div>
          )}
          {authError && <p role="alert">{authError}</p>}
        </div>
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
      </header>

      <main>
        {!user && authReady && <p role="status">Conectează-te pentru a vedea și salva cheltuielile tale.</p>}
        {user && !expensesReady && !syncError && <p role="status">Se încarcă cheltuielile...</p>}
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

          <div className="stat-card">
            <p>Total Transactions</p>
            <h2>{expenses.length}</h2>
          </div>

        </section>

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
                    key={expense.id}
                  >
                    <div>
                      <strong>{expense.category}</strong>

                      <p>
                        {expense.description || "No description"}
                      </p>

                      <small>{expense.date}</small>
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
        Expense Tracker • Version 1.2 • Multi-Currency
      </footer>

    </div>
  );
}

export default App;