const { parseAmountToken } = require('../utils/currency');

const INCOME_KEYWORDS = ['gaji', 'bonus', 'dapat', 'pendapatan', 'income', 'masuk', 'transfer', 'fee'];
const DEFAULT_EXPENSE_CATEGORY = 'lainnya';

const TYPO_VOCAB = [
  'makan',
  'kopi',
  'minum',
  'sarapan',
  'makanan',
  'bensin',
  'transport',
  'ojek',
  'parkir',
  'tol',
  'internet',
  'pulsa',
  'listrik',
  'air',
  'sewa',
  'kos',
  'belanja',
  'grocery',
  'obat',
  'dokter',
  'kesehatan',
  'hiburan',
  'bioskop',
  'langganan',
  'netflix',
  'spotify',
  'pendidikan',
  'kursus',
  'gaji',
  'bonus',
  'investasi',
  'dividen',
  'hadiah',
];

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

function maybeFixTypoToken(token) {
  if (!token || token.length < 4) {
    return token;
  }

  if (parseAmountToken(token)) {
    return token;
  }

  let bestWord = token;
  let bestDistance = Infinity;

  for (const word of TYPO_VOCAB) {
    const dist = levenshtein(token, word);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestWord = word;
    }
  }

  return bestDistance <= 2 ? bestWord : token;
}

function normalizeMessageForParsing(text) {
  const compact = String(text || '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact) {
    return '';
  }

  return compact
    .split(' ')
    .map((token) => token.replace(/[^a-z0-9.]/g, ''))
    .filter(Boolean)
    .map((token) => maybeFixTypoToken(token))
    .join(' ')
    .trim();
}

function extractAmount(text) {
  const tokens = String(text || '').split(' ');

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const parsed = parseAmountToken(tokens[i]);
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
    if (text.includes('dividen') || text.includes('investasi')) return 'investasi';
    if (text.includes('hadiah')) return 'hadiah';
    return 'pemasukan-lain';
  }

  if (text.includes('makan') || text.includes('kopi') || text.includes('minum') || text.includes('sarapan')) return 'makanan';
  if (text.includes('bensin') || text.includes('transport') || text.includes('ojek') || text.includes('parkir') || text.includes('tol'))
    return 'transport';
  if (text.includes('internet') || text.includes('pulsa') || text.includes('listrik') || text.includes('air') || text.includes('tagihan'))
    return 'tagihan';
  if (text.includes('sewa') || text.includes('kos') || text.includes('kontrak')) return 'hunian';
  if (text.includes('belanja') || text.includes('grocery') || text.includes('supermarket')) return 'belanja';
  if (text.includes('obat') || text.includes('dokter') || text.includes('kesehatan')) return 'kesehatan';
  if (text.includes('hiburan') || text.includes('bioskop') || text.includes('netflix') || text.includes('spotify')) return 'hiburan';
  if (text.includes('pendidikan') || text.includes('kursus') || text.includes('buku')) return 'pendidikan';

  return DEFAULT_EXPENSE_CATEGORY;
}

function parseTransactionRuleBased(text) {
  const cleanText = normalizeMessageForParsing(text);

  if (!cleanText) {
    return {
      status: 'invalid',
      reason: 'Pesan kosong.',
      confidence: 0,
    };
  }

  const extractedAmount = extractAmount(cleanText);
  if (!extractedAmount) {
    return {
      status: 'ambiguous',
      reason: 'Nominal tidak ditemukan.',
      confidence: 0.2,
    };
  }

  const { amount } = extractedAmount;
  const type = inferType(cleanText);
  const category = inferCategory(cleanText, type);
  const confidence = /\d/.test(cleanText) ? 0.95 : 0.65;

  return {
    status: 'ok',
    confidence,
    data: {
      type,
      category,
      amount,
      description: cleanText,
    },
    normalizedText: cleanText,
  };
}

module.exports = {
  parseTransactionRuleBased,
  normalizeMessageForParsing,
};
