const { parseAmountToken } = require("../utils/currency");

const INCOME_KEYWORDS = [
  "gaji",
  "bonus",
  "dapat",
  "dapet",
  "income",
  "pemasukan",
  "transfer masuk",
  "dibayar",
  "dibayarin",
  "refund",
];
const EXPENSE_KEYWORDS = [
  "beli",
  "bayar",
  "makan",
  "minum",
  "order",
  "pesan",
  "topup",
  "isi",
  "transfer",
  "donasi",
  "langganan",
  "belanja",
  "bayarin",
];
const CATEGORY_KEYWORDS = {
  food: [
    "makan",
    "kopi",
    "ayam",
    "nasi",
    "mie",
    "bakso",
    "resto",
    "kfc",
    "mcd",
    "starbucks",
    "gofood",
    "grabfood",
    "jajan",
    "minum",
    "warteg",
  ],
  transport: [
    "bensin",
    "pertalite",
    "pertamax",
    "tol",
    "parkir",
    "grab",
    "gojek",
    "taksi",
    "transport",
    "bus",
    "kereta",
  ],
  shopping: [
    "belanja",
    "tokopedia",
    "shopee",
    "lazada",
    "baju",
    "sepatu",
    "barang",
    "elektronik",
  ],
  entertainment: [
    "netflix",
    "spotify",
    "bioskop",
    "game",
    "steam",
    "ps",
    "hiburan",
    "nonton",
  ],
  utilities: ["listrik", "pln", "wifi", "internet", "air", "indihome"],
  health: ["obat", "dokter", "rumah sakit", "vitamin", "apotek"],
  education: ["kursus", "kelas", "buku", "sekolah", "kuliah"],
};
const DEFAULT_EXPENSE_CATEGORY = "other";
const STOPWORDS = [
  "di",
  "ke",
  "yang",
  "dan",
  "dari",
  "untuk",
  "sama",
  "buat",
  "dengan",
  "pada",
  "ini",
  "itu",
];

const TYPO_VOCAB = [
  ...INCOME_KEYWORDS,
  ...EXPENSE_KEYWORDS,
  ...Object.values(CATEGORY_KEYWORDS).flat(),
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
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
  const compact = String(text || "")
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])(rb|ribu|k|jt|juta|m|ribu|k)\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return "";
  }

  return compact
    .split(" ")
    .filter((t) => !STOPWORDS.includes(t))
    .map((token) => token.replace(/[^a-z0-9.]/g, ""))
    .filter(Boolean)
    .map((token) => maybeFixTypoToken(token))
    .join(" ")
    .trim();
}

function extractAmount(text) {
  const tokens = String(text || "").split(" ");

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const parsed = parseAmountToken(tokens[i]);
    if (parsed) {
      return { amount: parsed, tokenIndex: i, token: tokens[i] };
    }
  }

  return null;
}

function inferType(text) {
  return INCOME_KEYWORDS.some((keyword) => text.includes(keyword))
    ? "income"
    : "expense";
}

function inferCategory(text, type) {
  if (type === "income") {
    return "income"; // We assign default income category
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return category;
    }
  }

  return DEFAULT_EXPENSE_CATEGORY;
}

function parseTransactionRuleBased(text) {
  const cleanText = normalizeMessageForParsing(text);

  if (!cleanText) {
    return {
      status: "invalid",
      reason: "Pesan kosong.",
      confidence: 0,
    };
  }

  const extractedAmount = extractAmount(cleanText);
  if (!extractedAmount) {
    return {
      status: "ambiguous",
      reason: "Nominal tidak ditemukan.",
      confidence: 0.2,
    };
  }

  const { amount, token } = extractedAmount;
  const type = inferType(cleanText);
  const category = inferCategory(cleanText, type);
  const confidence = /\d/.test(cleanText) ? 0.95 : 0.65;

  const description = cleanText.replace(token, "").trim() || cleanText;

  return {
    status: "ok",
    confidence,
    data: {
      type,
      category,
      amount,
      description,
    },
    normalizedText: cleanText,
  };
}

module.exports = {
  parseTransactionRuleBased,
  normalizeMessageForParsing,
};
