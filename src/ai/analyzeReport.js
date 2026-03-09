const { generateText } = require('./geminiClient');
const { formatRupiah } = require('../utils/currency');

function buildFallback(summary, topTransactions) {
  const lines = [
    'Analisa Bulan Ini (fallback lokal)',
    '',
    `Pengeluaran: ${formatRupiah(summary.expenseTotal)}`,
    `Pemasukan: ${formatRupiah(summary.incomeTotal)}`,
    `Net: ${formatRupiah(summary.net)}`,
  ];

  if (topTransactions.length) {
    lines.push('', 'Transaksi terbesar:');
    for (const trx of topTransactions) {
      lines.push(`- ${trx.category} (${trx.type}) ${formatRupiah(trx.amount)} - ${trx.description}`);
    }
  }

  lines.push('', 'Saran: fokus kurangi satu kategori pengeluaran terbesar minggu ini.');
  return lines.join('\n');
}

async function analyzeMonthlySummary(config, summary, topTransactions) {
  const prompt = {
    summary,
    top_transactions: topTransactions,
    instruction: 'Berikan analisa pengeluaran bulan ini dalam Bahasa Indonesia. Maks 6 baris, ringkas, dan 2 saran aksi.',
  };

  try {
    const content = await generateText(
      config,
      [
        {
          role: 'system',
          content: 'Kamu adalah asisten keuangan pribadi. Jawaban harus ringkas, praktis, sopan, dan Bahasa Indonesia.',
        },
        {
          role: 'user',
          content: JSON.stringify(prompt),
        },
      ],
      { temperature: 0.2 }
    );

    if (!content) {
      throw new Error('Empty analysis from Gemini');
    }

    return content.trim();
  } catch (error) {
    return buildFallback(summary, topTransactions);
  }
}

module.exports = {
  analyzeMonthlySummary,
};
