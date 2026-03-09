const { formatRupiah } = require('../utils/currency');

function formatCategoryLines(categoryTotals) {
  const entries = Object.entries(categoryTotals);
  if (entries.length === 0) {
    return ['Belum ada data kategori.'];
  }

  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([key, total]) => {
      const [type, category] = key.split(':');
      const typeLabel = type === 'expense' ? 'Pengeluaran' : 'Pemasukan';
      return `${typeLabel} - ${category}: ${formatRupiah(total)}`;
    });
}

function formatAccountLines(transactions) {
  const totals = {};
  for (const trx of transactions) {
    const key = trx.account_name || 'utama';
    const signed = trx.type === 'income' ? Number(trx.amount || 0) : -Number(trx.amount || 0);
    totals[key] = (totals[key] || 0) + signed;
  }

  const entries = Object.entries(totals);
  if (!entries.length) {
    return ['Belum ada data akun.'];
  }

  return entries.sort((a, b) => b[1] - a[1]).map(([account, total]) => `- ${account}: ${formatRupiah(total)}`);
}

function buildSummaryReport(label, summary, transactions = []) {
  const lines = [
    `${label}`,
    '',
    `Total Pengeluaran: ${formatRupiah(summary.expenseTotal)}`,
    `Total Pemasukan: ${formatRupiah(summary.incomeTotal)}`,
    `Net: ${formatRupiah(summary.net)}`,
    `Jumlah Transaksi: ${summary.count}`,
    '',
    'Rincian Kategori:',
    ...formatCategoryLines(summary.categoryTotals),
    '',
    'Ringkasan Per Akun:',
    ...formatAccountLines(transactions),
  ];

  return lines.join('\n');
}

module.exports = {
  buildSummaryReport,
};
