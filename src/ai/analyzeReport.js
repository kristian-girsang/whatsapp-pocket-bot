const { chatCompletion } = require('./groqClient');
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

  lines.push('', 'Saran: fokus kurangi 1 kategori pengeluaran terbesar minggu ini.');
  return lines.join('\n');
}

async function analyzeMonthlySummary(config, summary, topTransactions) {
  const prompt = {
    summary,
    top_transactions: topTransactions,
    instruction:
      'Berikan analisa pengeluaran bulan ini dalam Bahasa Indonesia. Maks 6 baris, ringkas, dengan 2 saran aksi.',
  };

  try {
    const data = await chatCompletion(
      config,
      [
        {
          role: 'system',
          content:
            'Kamu adalah asisten keuangan pribadi. Jawaban harus ringkas, praktis, dan Bahasa Indonesia.',
        },
        {
          role: 'user',
          content: JSON.stringify(prompt),
        },
      ],
      { temperature: 0.3 }
    );

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty analysis from Groq');
    }

    return content;
  } catch (error) {
    return buildFallback(summary, topTransactions);
  }
}

module.exports = {
  analyzeMonthlySummary,
};
