// The Savings tab's fixed set of funds — not a configurable collection.
// finance_savings docs store `fund` as one of these exact strings; any
// aggregation over the collection (SavingsPage's own totals, the Accounts
// Hub summary card) must filter through this list so stray/legacy fund
// names never sneak into a "Total Savings" figure.
export const SAVINGS_FUNDS = ['Emergency Fund', 'Reserve Fund', 'GS Fund']
