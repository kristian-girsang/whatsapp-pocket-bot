const { formatRupiah } = require('../utils/currency');

function buildAnalyticsReport(transactions, summary, topTransactions) {
  if (!transactions.length) {
    return 'Belum ada data transaksi untuk analytics bulan ini.';
  }

  const expenseOnly = transactions.filter((t) => t.type === 'expense');
  const avgExpense = expenseOnly.length
    ? Math.round(expenseOnly.reduce((acc, t) => acc + Number(t.amount || 0), 0) / expenseOnly.length)
    : 0;

  const accountTotals = {};
  for (const trx of transactions) {
    const accountName = trx.account_name || 'utama';
    accountTotals[accountName] = (accountTotals[accountName] || 0) + Number(trx.amount || 0) * (trx.type === 'income' ? 1 : -1);
  }

  const lines = [
    'Analytics Bulan Ini',
    '',
    `Total Pengeluaran: ${formatRupiah(summary.expenseTotal)}`,
    `Total Pemasukan: ${formatRupiah(summary.incomeTotal)}`,
    `Net Cashflow: ${formatRupiah(summary.net)}`,
    `Rata-rata pengeluaran/transaksi: ${formatRupiah(avgExpense)}`,
    '',
    'Top transaksi:',
  ];

  for (const trx of topTransactions.slice(0, 5)) {
    lines.push(`- [${trx.type}] ${trx.category} ${formatRupiah(trx.amount)} (${trx.description})`);
  }

  lines.push('', 'Cashflow per akun:');
  for (const [accountName, total] of Object.entries(accountTotals)) {
    lines.push(`- ${accountName}: ${formatRupiah(total)}`);
  }

  return lines.join('\n');
}

module.exports = {
  buildAnalyticsReport,
};
