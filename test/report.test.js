const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSummaryReport } = require('../src/services/reportService');

test('report text contains totals and category lines', () => {
  const output = buildSummaryReport('Laporan Hari Ini', {
    expenseTotal: 75000,
    incomeTotal: 1000000,
    net: 925000,
    count: 3,
    categoryTotals: {
      'expense:food': 50000,
      'expense:transport': 25000,
      'income:gaji': 1000000,
    },
  });

  assert.match(output, /Laporan Hari Ini/);
  assert.match(output, /Total Pengeluaran/);
  assert.match(output, /Total Pemasukan/);
  assert.match(output, /Net/);
  assert.match(output, /Pengeluaran - food/);
  assert.match(output, /Pemasukan - gaji/);
});
