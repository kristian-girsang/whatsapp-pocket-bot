const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDb, initDatabase } = require('../src/db/database');
const { getOrCreateUserByPhone } = require('../src/services/userService');
const { getDefaultAccount, createAccount, setDefaultAccount } = require('../src/services/accountService');
const { setBudget, getBudgets } = require('../src/services/budgetService');
const {
  createTransaction,
  getTransactionsByRange,
  summarizeTransactions,
} = require('../src/services/transactionService');

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-expense-test-'));
  return path.join(dir, 'test.db');
}

test('multi-user transactions are isolated by user id', async () => {
  const db = createDb(makeTempDbPath());
  await initDatabase(db);

  const userA = await getOrCreateUserByPhone(db, '6281111111111');
  const userB = await getOrCreateUserByPhone(db, '6282222222222');
  const accountA = await getDefaultAccount(db, userA.id);
  const accountB = await getDefaultAccount(db, userB.id);

  await createTransaction(
    db,
    userA.id,
    {
      type: 'expense',
      category: 'food',
      amount: 20000,
      description: 'makan',
    },
    accountA.id
  );

  await createTransaction(
    db,
    userB.id,
    {
      type: 'income',
      category: 'gaji',
      amount: 5000000,
      description: 'gaji bulanan',
    },
    accountB.id
  );

  const start = new Date(2000, 0, 1).toISOString();
  const end = new Date(2100, 0, 1).toISOString();

  const rowsA = await getTransactionsByRange(db, userA.id, start, end);
  const rowsB = await getTransactionsByRange(db, userB.id, start, end);

  assert.equal(rowsA.length, 1);
  assert.equal(rowsB.length, 1);
  assert.equal(rowsA[0].user_id, userA.id);
  assert.equal(rowsB[0].user_id, userB.id);

  await db.close();
});

test('summary includes expense, income, and net', async () => {
  const transactions = [
    { type: 'expense', category: 'food', amount: 50000 },
    { type: 'expense', category: 'transport', amount: 25000 },
    { type: 'income', category: 'gaji', amount: 1000000 },
  ];

  const summary = summarizeTransactions(transactions);

  assert.equal(summary.expenseTotal, 75000);
  assert.equal(summary.incomeTotal, 1000000);
  assert.equal(summary.net, 925000);
  assert.equal(summary.categoryTotals['expense:food'], 50000);
  assert.equal(summary.categoryTotals['income:gaji'], 1000000);
});

test('account default switching works', async () => {
  const db = createDb(makeTempDbPath());
  await initDatabase(db);

  const user = await getOrCreateUserByPhone(db, '6283333333333');
  const defaultAccount = await getDefaultAccount(db, user.id);
  assert.equal(defaultAccount.name, 'utama');

  const extra = await createAccount(db, user.id, 'bca');
  assert.equal(extra.error, undefined);

  const switched = await setDefaultAccount(db, user.id, 'bca');
  assert.equal(switched.error, undefined);
  assert.equal(switched.data.name, 'bca');

  const current = await getDefaultAccount(db, user.id);
  assert.equal(current.name, 'bca');

  await db.close();
});

test('budget upsert works for month', async () => {
  const db = createDb(makeTempDbPath());
  await initDatabase(db);

  const user = await getOrCreateUserByPhone(db, '6284444444444');
  const monthKey = '2026-03';

  const first = await setBudget(db, user.id, 'food', 500000, monthKey);
  assert.equal(first.error, undefined);

  const second = await setBudget(db, user.id, 'food', 700000, monthKey);
  assert.equal(second.error, undefined);

  const budgets = await getBudgets(db, user.id, monthKey);
  assert.equal(budgets.length, 1);
  assert.equal(Number(budgets[0].limit_amount), 700000);

  await db.close();
});
