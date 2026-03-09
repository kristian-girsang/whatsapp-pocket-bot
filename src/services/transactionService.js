function validateTransactionInput(input) {
  if (!input || typeof input !== 'object') {
    return 'Format transaksi tidak valid.';
  }

  if (input.type !== 'expense' && input.type !== 'income') {
    return 'Tipe transaksi harus expense atau income.';
  }

  if (!input.category || typeof input.category !== 'string') {
    return 'Kategori transaksi wajib diisi.';
  }

  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    return 'Nominal transaksi harus bilangan bulat positif.';
  }

  if (!input.description || typeof input.description !== 'string') {
    return 'Deskripsi transaksi wajib diisi.';
  }

  return null;
}

async function createTransaction(db, userId, input, accountId = null) {
  const validationError = validateTransactionInput(input);
  if (validationError) {
    return { error: validationError };
  }

  const payload = {
    type: input.type,
    category: input.category.trim().toLowerCase(),
    amount: Number(input.amount),
    description: input.description.trim(),
    accountId,
  };

  const insert = await db.run(
    'INSERT INTO transactions (user_id, account_id, type, category, amount, description) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, payload.accountId, payload.type, payload.category, payload.amount, payload.description]
  );

  const row = await db.get(
    `
    SELECT t.*, a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ?
    `,
    [insert.lastID]
  );
  return { data: row };
}

async function getTransactionById(db, userId, transactionId) {
  return db.get(
    `
    SELECT t.*, a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND t.user_id = ?
    `,
    [transactionId, userId]
  );
}

async function updateTransactionAmount(db, userId, transactionId, amount) {
  const trxId = Number(transactionId);
  const nextAmount = Number(amount);

  if (!Number.isInteger(trxId) || trxId <= 0) {
    return { error: 'ID transaksi tidak valid.' };
  }

  if (!Number.isInteger(nextAmount) || nextAmount <= 0) {
    return { error: 'Nominal harus bilangan bulat positif.' };
  }

  const result = await db.run(`UPDATE transactions SET amount = ? WHERE id = ? AND user_id = ?`, [nextAmount, trxId, userId]);
  if (!result.changes) {
    return { error: 'Transaksi tidak ditemukan.' };
  }

  const updated = await getTransactionById(db, userId, trxId);
  return { data: updated };
}

async function deleteTransaction(db, userId, transactionId) {
  const trxId = Number(transactionId);
  if (!Number.isInteger(trxId) || trxId <= 0) {
    return { error: 'ID transaksi tidak valid.' };
  }

  const result = await db.run(`DELETE FROM transactions WHERE id = ? AND user_id = ?`, [trxId, userId]);
  if (!result.changes) {
    return { error: 'Transaksi tidak ditemukan.' };
  }

  return { data: { id: trxId } };
}

async function getTransactionsByRange(db, userId, start, end) {
  return db.all(
    `
    SELECT t.id, t.user_id, t.account_id, t.type, t.category, t.amount, t.description, t.created_at, a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND t.created_at >= ? AND t.created_at < ?
    ORDER BY t.created_at DESC
    `,
    [userId, start, end]
  );
}

async function listRecentTransactions(db, userId, limit = 10) {
  const safeLimit = Number(limit) > 0 ? Math.min(Number(limit), 50) : 10;
  return db.all(
    `
    SELECT t.id, t.type, t.category, t.amount, t.description, t.created_at, a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
    LIMIT ?
    `,
    [userId, safeLimit]
  );
}

function summarizeTransactions(transactions) {
  const summary = {
    expenseTotal: 0,
    incomeTotal: 0,
    net: 0,
    categoryTotals: {},
    count: transactions.length,
    expenseByCategory: {},
  };

  for (const trx of transactions) {
    const amount = Number(trx.amount) || 0;
    if (trx.type === 'expense') {
      summary.expenseTotal += amount;
      summary.expenseByCategory[trx.category] = (summary.expenseByCategory[trx.category] || 0) + amount;
    }

    if (trx.type === 'income') {
      summary.incomeTotal += amount;
    }

    const key = `${trx.type}:${trx.category}`;
    summary.categoryTotals[key] = (summary.categoryTotals[key] || 0) + amount;
  }

  summary.net = summary.incomeTotal - summary.expenseTotal;
  return summary;
}

function pickTopTransactions(transactions, limit = 5) {
  return [...transactions]
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, limit)
    .map((trx) => ({
      type: trx.type,
      category: trx.category,
      amount: Number(trx.amount),
      description: trx.description,
      created_at: trx.created_at,
      account_name: trx.account_name || 'utama',
    }));
}

module.exports = {
  createTransaction,
  getTransactionsByRange,
  listRecentTransactions,
  summarizeTransactions,
  pickTopTransactions,
  validateTransactionInput,
  updateTransactionAmount,
  deleteTransaction,
  getTransactionById,
};
