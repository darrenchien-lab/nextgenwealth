'use strict'

// What the help assistant knows about the app: every page it may point to, and
// a plain description of how things work. Keep this in step with the app: the
// assistant answers only from this text.

const PAGES = {
  '/dashboard': 'Dashboard',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/bills': 'Bills',
  '/goals': 'Goals',
  '/investments': 'Investments',
  '/reports': 'Reports',
  '/insights': 'Insights',
  '/settings': 'Settings'
}

const GUIDE = `
NextGen Wealth is a personal finance app for tracking money, spending, budgets, bills, savings goals and investments in one place. A round "Help" button at the bottom right of every page opens a chat that answers questions about using the app. The menu on the left has: Dashboard, Accounts, Transactions, Budgets, Bills, Goals, Investments, Reports, Insights, Settings and Log out. The top of the menu greets the person by name; clicking it opens Settings.

BUDGET CYCLES
- The app counts months as "budget cycles" that start on a day the person chooses (1 to 31) in Settings > Preferences > "Budget cycle starts on". Someone paid on the 25th can start their cycle on the 25th. If a month is shorter than the chosen day, the cycle starts on that month's last day.
- Budgets, the dashboard, reports and insights all follow the cycle, not the calendar month. On the Dashboard, "This Month" and "Last Month" switch between the current and the previous cycle.

ACCOUNTS (menu: Accounts)
- An account is anywhere money sits: bank, e-wallet, cash or credit card. Add one with "New Account" (name, type, currency, starting balance). Accounts can be in different currencies.
- "New Transfer" moves money between two of the person's accounts. A transfer is not income or expense. A transfer can be undone from the transfers list if it was a mistake.
- Opening an account shows its statement: every movement with a running balance, filterable by date range.
- An account's balance can be corrected by editing its balance, with a date. Accounts that are no longer used can be archived instead of deleted, and restored later. Archived accounts are left out of totals.

TRANSACTIONS (menu: Transactions)
- A transaction is one income or expense. Add one with "New Transaction": type, amount, account, category, date and an optional note. A smaller quick form is on the Dashboard ("Add" in the Recent transactions card).
- Categories group spending (Food & Drink, Transport and so on). A new category can be created while adding a transaction.
- Filters narrow the list by cycle, account, type and category. The list shows which account each transaction belongs to.
- A transaction can be split into several parts with different categories ("Split Transaction"), and edited later.
- "Count in next cycle": a transaction (for example a salary received a few days before the cycle starts) can be set to count in the next cycle instead of the one its date falls in.

QUICK ADD (Dashboard button "Quick add")
- The person types what they did in their own words, for example "lunch 45k from my e-wallet, salary 8M into my bank account, bought 10 lots of BBCA at 9,200". The AI turns it into entries (income, expense, transfer, buy or sell). The person reviews and can edit every entry, then saves. Nothing is saved until they confirm. "k" means thousand, "jt" or "M" means million in the person's wording, and 1 lot of an Indonesian stock is 100 shares.

BUDGETS (menu: Budgets)
- A budget is a spending limit for one category in one cycle. Add one with "Add" or "Create": pick the category, set the limit, choose the cycle. The page shows how much of each limit is used. The Dashboard's Spending Pace card also tracks spending against budgets (the "Budget" tab) and shows whether the person is on pace.

BILLS (menu: Bills)
- "New Bill" records something that must be paid by a date, with an amount, an optional account and an optional category. Upcoming bills show on the Dashboard. A bill past its due date is marked overdue. Choosing "Pay" marks it paid and records the expense from the linked account.

GOALS (menu: Goals)
- A savings goal has a name, a target amount and an optional target date. A goal can be tracked by hand (add or take out money yourself) or linked to the accounts or investments where its money really is, so progress follows their balances. Each goal shows progress, how much is still to go, the time left and a suggested plan. Cards at the top of the page summarise all goals: how many are in progress or reached, the total saved against the total target, and the nearest target date. Goals still in progress are listed by target date, and reached goals are listed apart. When creating a new goal, the person is offered an emergency-fund amount of 3 or 6 months of their usual spending, which fills in the target.

INVESTMENTS (menu: Investments)
- Each investment is a "holding": a stock, mutual fund, crypto, ETF, bond, gold, property or other. Add one with "Add Holding": name, type, quantity, price or total paid, currency and date. Linking it to an account takes the money from that account.
- Use the Trade menu on a holding to Buy more or Sell. Both record quantity, price, date and optionally an account, and keep the profit figures up to date.
- Holdings of a stock, ETF, crypto or mutual fund can be linked to a market listing so the price updates by itself ("Update prices" refreshes now). Otherwise the price is entered by hand.
- The page shows the portfolio value, profit or loss without fees, yearly return, a value chart over a chosen range, and the history of trades. Reports also has a target allocation card comparing the person's mix of assets against targets they set.

DASHBOARD
- Net Worth at the top is all accounts plus investments, with links to each. The eye icon hides amounts. Income, Expense and Savings Rate cover the chosen cycle, with a small trend line of recent cycles. Asset Allocation shows how wealth is split. Cash Flow shows income against expense for the last six cycles. Spending Pace compares spending with the previous cycle and with budgets. Recent transactions, Expense Breakdown, Upcoming Bills and Goal Progress sit below. A yellow strip appears when something needs attention and leads to Insights.

REPORTS (menu: Reports)
- Savings rate over the last 12 cycles, top spending categories compared with last cycle, a calendar of spending by day, comparison of any two cycles, currency exposure, target versus actual allocation, and net worth history with a line or bar chart and range buttons.
- "Export PDF" saves a report of this cycle or the last cycle.

INSIGHTS (menu: Insights)
- Plain-language findings about the current cycle, grouped as needs attention, good to know and going well: spending pace, categories running high, unusual big purchases, repeating charges, budgets, bills, goals and savings rate. Each links to the page where it can be acted on. A "Personal summary" switch lets AI write a short summary; it is off by default because the AI reads the findings (with amounts); the AI model runs on the app's own server.

SETTINGS (menu: Settings)
- Preferences: Display currency (the currency totals are shown in) and "Budget cycle starts on".
- Appearance: light or dark theme. The theme button next to the greeting in the menu also switches it.
- Privacy and security: "Hide amounts by default" (amounts show as dots until the person taps the eye), change password, and "Sign out of all devices" (ends every session, including the current one).
- Account: "Your name" (shown in the greeting), the email the person signs in with, and "Delete account" which permanently deletes all their data and cannot be undone.
- After several wrong password attempts, signing in is paused for a short while. "Forgot password" on the sign-in page sends a reset link by email.
`.trim()

module.exports = { PAGES, GUIDE }
