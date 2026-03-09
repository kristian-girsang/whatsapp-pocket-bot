function parseAmountToken(token) {
  if (!token) {
    return null;
  }

  const normalized = String(token).toLowerCase().replace(/\./g, '').replace(/,/g, '.').trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(jt|rb|k)?$/);

  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }

  const suffix = match[2] || '';
  let multiplier = 1;

  if (suffix === 'k' || suffix === 'rb') {
    multiplier = 1000;
  } else if (suffix === 'jt') {
    multiplier = 1000000;
  }

  return Math.round(base * multiplier);
}

function formatRupiah(amount) {
  const safeAmount = Number(amount) || 0;
  return `Rp${safeAmount.toLocaleString('id-ID')}`;
}

module.exports = {
  parseAmountToken,
  formatRupiah,
};
