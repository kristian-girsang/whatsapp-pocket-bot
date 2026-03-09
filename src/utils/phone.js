function normalizePhone(raw) {
  if (!raw) {
    return '';
  }

  const cleaned = String(raw).replace(/\D/g, '');
  if (!cleaned) {
    return '';
  }

  if (cleaned.startsWith('0')) {
    return `62${cleaned.slice(1)}`;
  }

  if (cleaned.startsWith('62')) {
    return cleaned;
  }

  return cleaned;
}

function phoneFromWhatsAppId(from) {
  if (!from) {
    return '';
  }

  const numberPart = String(from).split('@')[0];
  return normalizePhone(numberPart);
}

module.exports = {
  normalizePhone,
  phoneFromWhatsAppId,
};
