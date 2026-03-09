const axios = require('axios');

async function chatCompletion(config, messages, options = {}) {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY belum diatur.');
  }

  const payload = {
    model: options.model || config.groqModel,
    messages,
    temperature: options.temperature ?? 0,
    response_format: options.responseFormat,
  };

  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: config.groqTimeoutMs,
  });

  return response.data;
}

module.exports = {
  chatCompletion,
};
