const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmountToken } = require('../src/utils/currency');
const { parseTransactionRuleBased, normalizeMessageForParsing } = require('../src/ai/ruleParser');
const { parseTransaction } = require('../src/ai/parseTransaction');

test('parse amount shorthand', () => {
  assert.equal(parseAmountToken('25k'), 25000);
  assert.equal(parseAmountToken('25rb'), 25000);
  assert.equal(parseAmountToken('10jt'), 10000000);
});

test('rule parser classifies income and expense', () => {
  const income = parseTransactionRuleBased('gaji 10jt');
  assert.equal(income.status, 'ok');
  assert.equal(income.data.type, 'income');

  const expense = parseTransactionRuleBased('makan siang 25rb');
  assert.equal(expense.status, 'ok');
  assert.equal(expense.data.type, 'expense');
  assert.equal(expense.data.amount, 25000);
});

test('rule parser can handle typo for common words', () => {
  const result = parseTransactionRuleBased('maksn 25rb');
  assert.equal(result.status, 'ok');
  assert.equal(result.data.type, 'expense');
  assert.equal(result.data.category, 'makanan');
  assert.equal(result.data.amount, 25000);
});

test('parser can split merged typo+amount token', () => {
  const normalized = normalizeMessageForParsing('maksn25k');
  assert.equal(normalized, 'makan 25k');

  const result = parseTransactionRuleBased('maksn25k');
  assert.equal(result.status, 'ok');
  assert.equal(result.data.description, 'makan 25k');
  assert.equal(result.data.amount, 25000);
});

test('ambiguous text triggers ai fallback path', async () => {
  await assert.rejects(
    () =>
      parseTransaction(
        {
          groqApiKey: '',
          groqModel: 'llama-3.1-8b-instant',
          groqTimeoutMs: 2000,
        },
        'makan siang enak'
      ),
    /GROQ_API_KEY belum diatur/
  );
});
