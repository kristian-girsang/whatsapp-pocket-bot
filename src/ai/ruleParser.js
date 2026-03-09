const { parseAmountToken } = require('../utils/currency');

const INCOME_KEYWORDS = ['gaji', 'bonus', 'dapat', 'pendapatan', 'income', 'masuk'];
const DEFAULT_EXPENSE_CATEGORY = 'lainnya';

function sanitizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function extractAmount(text) {
  const compact = text.replace(/\s+/g, ' ');
  const tokens = compact.split(' ');

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i].replace(/[!?,]/g, '');
    const parsed = parseAmountToken(token);
    if (parsed) {
      return { amount: parsed, tokenIndex: i };
    }
  }

  return null;
}

function inferType(text) {
  return INCOME_KEYWORDS.some((keyword) => text.includes(keyword)) ? 'income' : 'expense';
}

function inferCategory(text, type) {
  if (type === 'income') {
    if (text.includes('gaji')) return 'gaji';
    if (text.includes('bonus')) return 'bonus';
    return 'pemasukan-lain';
  }

  if (text.includes('makan') || text.includes('kopi') || text.includes('minum')) return 'food';
  if (text.includes('bensin') || text.includes('transport') || text.includes('ojek')) return 'transport';
  if (text.includes('internet') || text.includes('pulsa')) return 'utilities';

  return DEFAULT_EXPENSE_CATEGORY;
}

function parseTransactionRuleBased(text) {
  const normalized = sanitizeText(text);
  if (!normalized) {
    return {
      status: 'invalid',
      reason: 'Pesan kosong.',
      confidence: 0,
    };
  }

  const extractedAmount = extractAmount(normalized);
  if (!extractedAmount) {
    return {
      status: 'ambiguous',
      reason: 'Nominal tidak ditemukan.',
      confidence: 0.2,
    };
  }

  const { amount } = extractedAmount;
  const type = inferType(normalized);
  const category = inferCategory(normalized, type);
  const description = normalized;
  const confidence = /\d/.test(normalized) ? 0.92 : 0.6;

  return {
    status: 'ok',
    confidence,
    data: {
      type,
      category,
      amount,
      description,
    },
  };
}

module.exports = {
  parseTransactionRuleBased,
};
