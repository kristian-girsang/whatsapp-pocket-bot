const { chatCompletion } = require('./groqClient');
const { parseTransactionRuleBased, normalizeMessageForParsing } = require('./ruleParser');
const { validateTransactionInput } = require('../services/transactionService');

function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (parseError) {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }

    throw parseError;
  }
}

function normalizeType(rawType) {
  const value = String(rawType || '').toLowerCase().trim();
  if (['expense', 'pengeluaran', 'keluar', 'spend'].includes(value)) return 'expense';
  if (['income', 'pemasukan', 'masuk', 'salary'].includes(value)) return 'income';
  return value;
}

async function parseViaGroq(config, messageText) {
  const systemPrompt = [
    'You are a high-accuracy financial transaction parser for Indonesian chat.',
    'User text may contain typos, slang, abbreviations, and merged words like maksn25k.',
    'Fix typos in output fields silently.',
    'Extract one transaction from the user message.',
    'Return JSON only with fields: type, category, amount, description.',
    'type must be exactly expense or income.',
    'amount must be integer in Indonesian Rupiah.',
    'description must be typo-corrected and concise.',
  ].join(' ');

  const data = await chatCompletion(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageText },
    ],
    { temperature: 0 }
  );

  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error('LLM tidak mengembalikan JSON yang bisa diparse.');
  }

  return parsed;
}

async function parseTransaction(config, messageText) {
  const ruleResult = parseTransactionRuleBased(messageText);

  if (ruleResult.status === 'ok' && ruleResult.confidence >= 0.8) {
    const validationError = validateTransactionInput(ruleResult.data);
    if (!validationError) {
      return {
        source: 'rule',
        transaction: ruleResult.data,
      };
    }
  }

  const llmData = await parseViaGroq(config, messageText);
  const normalized = {
    type: normalizeType(llmData.type),
    category: String(llmData.category || '').trim().toLowerCase(),
    amount: Number(llmData.amount),
    description: normalizeMessageForParsing(String(llmData.description || '').trim() || String(messageText || '').trim()),
  };

  const validationError = validateTransactionInput(normalized);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    source: 'ai',
    transaction: normalized,
  };
}

module.exports = {
  parseTransaction,
  extractJsonObject,
};
