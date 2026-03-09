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

function sanitizeText(text) {
  return String(text || '').trim().toLowerCase();
}

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

function normalizeTypos(text) {
  return text
    .split(/\s+/)
    .map((token) => maybeFixTypoToken(token.replace(/[^a-z0-9]/g, '')))
    .join(' ')
    .trim();
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
  const normalized = sanitizeText(text);
  const typoFixed = normalizeTypos(normalized);

  if (!typoFixed) {
    return {
      status: 'invalid',
      reason: 'Pesan kosong.',
      confidence: 0,
    };
  }

  const extractedAmount = extractAmount(typoFixed);
  if (!extractedAmount) {
    return {
      status: 'ambiguous',
      reason: 'Nominal tidak ditemukan.',
      confidence: 0.2,
    };
  }

  const { amount } = extractedAmount;
  const type = inferType(typoFixed);
  const category = inferCategory(typoFixed, type);
  const description = normalized;
  const confidence = /\d/.test(typoFixed) ? 0.95 : 0.65;

  return {
    status: 'ok',
    confidence,
    data: {
      type,
      category,
      amount,
      description,
    },
    normalizedText: typoFixed,
  };
}

module.exports = {
  parseTransactionRuleBased,
  normalizeTypos,
};
