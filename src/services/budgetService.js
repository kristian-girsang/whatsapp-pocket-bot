const { formatRupiah } = require('../utils/currency');

function monthKeyFromDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function setBudget(db, userId, category, limitAmount, monthKey = monthKeyFromDate()) {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  const amount = Number(limitAmount);

  if (!normalizedCategory) {
    return { error: 'Kategori budget wajib diisi.' };
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: 'Nominal budget harus bilangan bulat positif.' };
  }

  await db.run(
    `
    INSERT INTO budgets (user_id, month_key, category, limit_amount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, month_key, category)
    DO UPDATE SET limit_amount = excluded.limit_amount
    `,
    [userId, monthKey, normalizedCategory, amount]
  );

  return { data: { monthKey, category: normalizedCategory, limitAmount: amount } };
}

async function getBudgets(db, userId, monthKey = monthKeyFromDate()) {
  return db.all(
    `SELECT id, user_id, month_key, category, limit_amount FROM budgets WHERE user_id = ? AND month_key = ? ORDER BY category ASC`,
    [userId, monthKey]
  );
}

function buildBudgetReport(budgets, expenseByCategory) {
  if (!budgets.length) {
    return 'Belum ada budget bulan ini. Tambahkan dengan format: budget <kategori> <nominal>';
  }

  const lines = ['Status Budget Bulan Ini', ''];

  for (const budget of budgets) {
    const spent = Number(expenseByCategory[budget.category] || 0);
    const remaining = Number(budget.limit_amount) - spent;
    const status = remaining >= 0 ? 'aman' : 'lewat';

    lines.push(
      `- ${budget.category}: ${formatRupiah(spent)} / ${formatRupiah(Number(budget.limit_amount))} (${status}, sisa ${formatRupiah(
        remaining
      )})`
    );
  }

  return lines.join('\n');
}

function detectBudgetAlert(transaction, budgets, expenseByCategory) {
  if (transaction.type !== 'expense') {
    return null;
  }

  const budget = budgets.find((b) => b.category === transaction.category);
  if (!budget) {
    return null;
  }

  const spent = Number(expenseByCategory[transaction.category] || 0);
  if (spent <= Number(budget.limit_amount)) {
    return null;
  }

  const exceeded = spent - Number(budget.limit_amount);
  return `Budget kategori ${transaction.category} terlewati ${formatRupiah(exceeded)}.`;
}

module.exports = {
  monthKeyFromDate,
  setBudget,
  getBudgets,
  buildBudgetReport,
  detectBudgetAlert,
};
