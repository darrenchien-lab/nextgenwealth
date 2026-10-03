# NextGen Wealth

A full-stack personal finance manager for tracking accounts, spending, budgets, bills, savings goals and investments across multiple currencies, all in one net-worth view.

Built with **Next.js**, **Express** and **PostgreSQL**.

## Screenshots

![Dashboard](docs/screenshots/dashboard.jpg)

| Investments | Reports |
|---|---|
| ![Investments](docs/screenshots/investments.jpg) | ![Reports](docs/screenshots/reports.jpg) |

> Screenshots use the fictional demo account. See [Demo data](#demo-data).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts, Lucide icons |
| Backend | Node.js, Express 4, REST API |
| Database | PostgreSQL with plain SQL (`pg`), no ORM, versioned schema migrations |
| Auth | JWT with server-side revocation on logout, bcrypt password hashing |
| Email | Nodemailer (Gmail) for email verification and password reset |
| Background jobs | `node-cron` for daily exchange rates, snapshots, recurring transactions and overdue bills |
| Exports | PDFKit (PDF) and ExcelJS (Excel) |
| Testing | Node's built-in test runner (`node:test`) + Supertest, against a separate test database |

## Features

**Accounts and security**
- Register, log in and log out, with logged-out tokens revoked server-side
- Email verification required before first login, plus a resend option
- Forgot-password flow with single-use, expiring reset links
- Light and dark theme

**Accounts and transactions**
- Multiple accounts (bank, e-wallet, cash, credit card), each in its own currency
- Archive or unarchive accounts, adjust balances manually, and reconcile cached balances against the ledger
- Income and expense transactions with default and custom (nested) categories
- Recurring transactions, generated automatically when due
- Split one transaction across several categories
- Transfers between accounts, including cross-currency transfers and reversals

**Budgets and bills**
- Monthly budgets per category with usage tracking and an end-of-period forecast
- Configurable budget cycle start day (for example, aligned to payday)
- Recurring bills with pending, overdue and paid states, payment from a linked account, and upcoming-bill reminders

**Savings and investments**
- Savings goals with target dates, contributions and withdrawals
- Investment portfolio (stocks, ETFs, mutual funds, crypto, gold and more): buy, sell, update prices, and track unrealized and realized gains
- Target asset allocation vs. actual allocation, and portfolio CAGR vs. a target CAGR
- Daily history of total portfolio value and of each holding

**Reports and insights**
- Dashboard with income, expenses, savings rate, net worth and a financial health score, compared against the previous period
- Cash flow, expense breakdown, monthly trends, asset allocation and net worth history
- Report export to PDF and Excel
- Rule-based financial insights, with an optional external AI provider (bring your own API key)

**Multi-currency**
- Exchange rates refreshed daily, with an alert when cached rates go stale
- Every total is converted into the user's chosen display currency

## Engineering Highlights

- **Data isolation:** every query is scoped to the signed-in user. Requests for another user's records return `404` rather than `403`, so record existence is never leaked. This is covered by tests.
- **Consistent balances:** balance changes are written in the same database transaction as the record that causes them, and a reconcile endpoint detects any drift.
- **Correct money math across currencies:** amounts are converted via cached daily rates. History charts are converted into the *current* display currency, so changing currency never creates a fake jump in the chart.
- **SQL kept out of the code:** queries live in their own `.sql` files under `backend/sql/`, and the schema is built from ordered migrations in `backend/schema/`.

## Project Structure

```
backend/
  routes/      HTTP endpoints
  services/    business logic
  sql/         one .sql file per query
  schema/      ordered database migrations
  jobs/        scheduled background jobs
  scripts/     database setup and demo data
  tests/       API tests
frontend/
  app/         Next.js pages (App Router)
  components/  shared UI components
  lib/         API client and formatting helpers
start-app.bat  starts backend and frontend together (Windows)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 20.9 or later
- [PostgreSQL](https://www.postgresql.org)
- A Gmail account with an [App Password](https://myaccount.google.com/apppasswords), used to send verification emails. Without it, new accounts can't verify and log in. You can still use the [demo account](#demo-data).

### 1. Install dependencies

```bash
git clone https://github.com/darrenchien-lab/nextgenwealth.git
cd nextgenwealth

cd backend && npm install
cd ../frontend && npm install
```

### 2. Create the database

```sql
CREATE DATABASE financeflow;
CREATE DATABASE financeflow_test; -- optional, only needed for running tests
```

### 3. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

`backend/.env`:

| Variable | Description |
|---|---|
| `PORT` | Backend port (default `3000`) |
| `DATABASE_URL` | PostgreSQL connection string, for example `postgres://USER:PASSWORD@localhost:5432/financeflow` |
| `JWT_SECRET` | A long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Login session lifetime (default `1h`) |
| `BILL_REMINDER_WINDOW_DAYS` | How many days ahead a bill counts as upcoming |
| `EXCHANGE_RATE_STALENESS_ALERT_DAYS` | Logs an alert when exchange rates are older than this many days |
| `FRONTEND_URL` | Frontend address, used for links in emails (default `http://localhost:3001`) |
| `GMAIL_USER` | Gmail address used to send emails |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not your regular Gmail password) |

`frontend/.env.local` only needs the backend address:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### 4. Create the tables

```bash
cd backend
npm run setup-db
```

### 5. Run the app

**Windows:** double-click `start-app.bat`. It starts both servers and opens the browser.

**Any OS:** run each part in its own terminal:

```bash
cd backend && npm run dev     # API on http://localhost:3000
cd frontend && npm run dev    # app on http://localhost:3001
```

Open **http://localhost:3001**.

## Demo Data

To explore the app without entering data by hand, load the demo account:

```bash
cd backend
npm run seed-demo
```

Then log in with:

- **Email:** `demo@example.com`
- **Password:** `DemoPass123!`

It creates about six months of fictional activity: five accounts in IDR and USD, about 600 transactions, transfers, budgets, bills, savings goals, an investment portfolio, and daily net worth and portfolio history for the charts. Running it again rebuilds the demo account from scratch without touching any other user. An internet connection is needed to fetch exchange rates.

## Running Tests

Create `backend/.env.test`:

```
NODE_ENV=test
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/financeflow_test
```

Then run:

```bash
cd backend
npm run setup-db:test
npm test
```

As a safety check, tests refuse to run unless the database name contains `test`, so your main database can never be wiped by accident.
