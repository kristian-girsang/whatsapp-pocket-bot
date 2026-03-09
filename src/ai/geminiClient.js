const axios = require('axios');

function extractGeminiText(data) {
  const candidates = data?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    const text = parts.map((p) => p?.text || '').join('').trim();
    if (text) {
      return text;
    }
  }

  return '';
}

async function generateText(config, messages, options = {}) {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY belum diatur.');
  }

  const model = options.model || config.geminiModel;
  const timeout = options.timeoutMs || config.geminiTimeoutMs;

  const systemMessages = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const userText = nonSystemMessages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');

  const payload = {
    systemInstruction: systemMessages ? { parts: [{ text: systemMessages }] } : undefined,
    contents: [
      {
        role: 'user',
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await axios.post(url, payload, {
    params: { key: config.geminiApiKey },
    headers: { 'Content-Type': 'application/json' },
    timeout,
  });

  return extractGeminiText(response.data);
}

module.exports = {
  generateText,
};
