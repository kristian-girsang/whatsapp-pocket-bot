const { generateText } = require('./geminiClient');

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch (_err2) {
        return null;
      }
    }

    return null;
  }
}

function normalizeIntent(value) {
  return String(value || '').trim().toLowerCase();
}

async function understandMessage(config, input) {
  const systemPrompt = [
    'You are the intent router for an Indonesian WhatsApp finance bot.',
    'Main purpose: track expense and income transactions naturally.',
    'Interpret user message into one actionable intent and parameters.',
    'Return JSON only with keys:',
    'intent, confidence, response_text, wallet_name, period, transaction_text, amount, category, transaction_id.',
    'Allowed intents:',
    'greeting, smalltalk, add_wallet, list_wallets, set_default_wallet, delete_wallet,',
    'record_transaction, report, list_transactions, analysis, budget_set, budget_list,',
    'update_transaction, delete_transaction, unknown.',
    'Rules:',
    '- If user greets (hello/hai/pagi/malam), use greeting and give concise intro about bot purpose.',
    '- If user asks create wallet like "tambah dompet baru dengan nama BCA", intent add_wallet and wallet_name=bca.',
    '- If user says "baru makan siang 12k pake BRI", intent record_transaction, wallet_name=bri, transaction_text="makan siang 12k".',
    '- period should be one of: today, week, month, all.',
    '- confidence is 0..1.',
    '- Use unknown if not confident.',
  ].join(' ');

  const context = {
    wallets: input.wallets || [],
    default_wallet: input.defaultWallet || null,
    user_text: input.text,
  };

  const responseText = await generateText(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(context) },
    ],
    { temperature: 0.1 }
  );

  const parsed = extractJsonObject(responseText) || {};

  return {
    intent: normalizeIntent(parsed.intent),
    confidence: Number(parsed.confidence || 0),
    responseText: String(parsed.response_text || '').trim(),
    walletName: String(parsed.wallet_name || '').trim().toLowerCase(),
    period: String(parsed.period || '').trim().toLowerCase(),
    transactionText: String(parsed.transaction_text || '').trim(),
    amount: Number(parsed.amount || 0),
    category: String(parsed.category || '').trim().toLowerCase(),
    transactionId: Number(parsed.transaction_id || 0),
  };
}

module.exports = {
  understandMessage,
};
