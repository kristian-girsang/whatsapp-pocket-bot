const { chatCompletion } = require("./groqClient");
const {
  parseTransactionRuleBased,
  normalizeMessageForParsing,
} = require("./ruleParser");
const { validateTransactionInput } = require("../services/transactionService");

function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (parseError) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }

    throw parseError;
  }
}

function normalizeType(rawType) {
  const value = String(rawType || "")
    .toLowerCase()
    .trim();
  if (["expense", "pengeluaran", "keluar", "spend"].includes(value))
    return "expense";
  if (["income", "pemasukan", "masuk", "salary"].includes(value))
    return "income";
  return value;
}

async function parseViaGroq(config, messageText) {
  const systemPrompt = [
    "Anda adalah asisten AI yang sangat akurat untuk mem-parsing transaksi keuangan dari pesan chat berbahasa Indonesia.",
    'Tugas Anda adalah menganalisis pesan pengguna (yang mungkin mengandung typo, slang, singkatan, atau kata yang menyatu seperti "maksn25k" atau "belidonat45rb") dan mengekstrak SATU transaksi, lalu mengembalikan hasilnya sebagai objek JSON dengan tepat empat kunci: "type", "category", "amount", dan "description".',
    "",
    "Instruksi penting:",
    '1. Koreksi typo secara diam-diam dan normalisasi slang/singkatan dalam deskripsi. Contoh: "maksn" → "makan", "trasport" → "transportasi".',
    "2. Ekstrak nominal uang dari pesan. Nominal bisa dalam berbagai format:",
    "   - Angka biasa: 45000, 15000",
    '   - Dengan "rb" atau "ribu": 5rb = 5000, 25ribu = 25000, 100rb = 100000',
    '   - Dengan "k": 2k = 2000, 10k = 10000',
    "   - Slang: goceng = 5000, ceban = 10000, pek = 100000, dst.",
    '   - Menyatu dengan kata: "belidonat45rb" berarti "beli donat" dan nominal 45000.',
    "3. Konversi nominal menjadi integer (dalam Rupiah).",
    '4. Hapus nominal dari deskripsi. Deskripsi hanya berisi teks yang sudah dibersihkan (tanpa nominal). Contoh: dari "makan 25k" → deskripsi: "makan".',
    "5. Tentukan tipe transaksi:",
    '   - "expense" untuk pengeluaran (misal: makan, beli, bayar, isi bensin, jajan, dll.)',
    '   - "income" untuk pemasukan (misal: gaji, bonus, honor, kiriman, dll.) Gunakan kata kunci sebagai petunjuk.',
    "6. Tentukan kategori yang logis dalam huruf kecil. Kategori umum: makanan, transportasi, kesehatan, belanja, hiburan, gaji, lainnya. Pilih yang paling sesuai berdasarkan deskripsi.",
    "7. Jika pesan mengandung lebih dari satu angka, anggap angka pertama sebagai nominal transaksi dan sisanya (setelah angka pertama) sebagai bagian deskripsi. Asumsikan hanya satu transaksi per pesan.",
    '8. Jika tidak ditemukan nominal, set amount = 0 dan perlakukan seluruh pesan sebagai deskripsi (setelah koreksi typo). Tentukan type = "expense" (default) dan category = "lainnya".',
    '9. Jangan menambahkan informasi apa pun yang tidak ada di pesan asli. Contoh: jika pengguna berkata "donat", deskripsi tetap "donat", bukan "obat" atau lainnya.',
    "10. Output HARUS berupa objek JSON yang valid, TANPA teks tambahan, komentar, atau format markdown (misalnya jangan dibungkus dengan ```json). Gunakan tanda kutip ganda untuk kunci dan nilai string.",
    "",
    "Contoh:",
    '- Input: "maksn 25k" → Output: {"type": "expense", "category": "makanan", "amount": 25000, "description": "makan"}',
    '- Input: "beli donat 45000" → Output: {"type": "expense", "category": "makanan", "amount": 45000, "description": "beli donat"}',
    '- Input: "gaji 5jt" → Output: {"type": "income", "category": "gaji", "amount": 5000000, "description": "gaji"}',
    '- Input: "trasport gojek 15rb" → Output: {"type": "expense", "category": "transportasi", "amount": 15000, "description": "gojek"}',
    '- Input: "belanja bulanan 200rb" → Output: {"type": "expense", "category": "belanja", "amount": 200000, "description": "belanja bulanan"}',
    '- Input: "bonus 1jt" → Output: {"type": "income", "category": "bonus", "amount": 1000000, "description": "bonus"}',
    '- Input: "makan siang 30k" → Output: {"type": "expense", "category": "makanan", "amount": 30000, "description": "makan siang"}',
    '- Input: "beli obat 50rb" → Output: {"type": "expense", "category": "kesehatan", "amount": 50000, "description": "beli obat"}',
    '- Input: "isi bensin 100k" → Output: {"type": "expense", "category": "transportasi", "amount": 100000, "description": "isi bensin"}',
    '- Input: "goceng buahnaga" (atau jika menyatu "gocengbuahnaga") → Output: {"type": "expense", "category": "makanan", "amount": 5000, "description": "buah naga"}',
    '- Input: "maksn25k" → Output: {"type": "expense", "category": "makanan", "amount": 25000, "description": "makan"}',
    '- Input: "belidonat45rb" → Output: {"type": "expense", "category": "makanan", "amount": 45000, "description": "beli donat"}',
    '- Input: "trasportgojek15rb" → Output: {"type": "expense", "category": "transportasi", "amount": 15000, "description": "gojek"}',
    '- Input: (tanpa nominal) "beli nasi" → Output: {"type": "expense", "category": "lainnya", "amount": 0, "description": "beli nasi"}',
    "",
    "Sekarang, proses pesan pengguna berikut dan kembalikan JSON-nya.",
  ].join("\n");

  const data = await chatCompletion(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: messageText },
    ],
    { temperature: 0 },
  );

  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("LLM tidak mengembalikan JSON yang bisa diparse.");
  }

  return parsed;
}

async function parseTransaction(config, messageText) {
  const ruleResult = parseTransactionRuleBased(messageText);

  if (ruleResult.status === "ok" && ruleResult.confidence >= 0.8) {
    const validationError = validateTransactionInput(ruleResult.data);
    if (!validationError) {
      return {
        source: "rule",
        transaction: ruleResult.data,
      };
    }
  }

  const llmData = await parseViaGroq(config, messageText);
  const normalized = {
    type: normalizeType(llmData.type),
    category: String(llmData.category || "")
      .trim()
      .toLowerCase(),
    amount: Number(llmData.amount),
    description: normalizeMessageForParsing(
      String(llmData.description || "").trim() ||
        String(messageText || "").trim(),
    ),
  };

  const validationError = validateTransactionInput(normalized);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    source: "ai",
    transaction: normalized,
  };
}

module.exports = {
  parseTransaction,
  extractJsonObject,
};
