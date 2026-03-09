const path = require('path');

function parseAllowedUsers(raw) {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((phone) => phone.replace(/\D/g, ''))
  );
}

function getEnvConfig() {
  const port = Number(process.env.PORT || 3000);
  const dbPath = process.env.DB_PATH || './data/expense-tracker.db';
  const whatsappSessionPath = process.env.WHATSAPP_SESSION_PATH || './data/whatsapp-session';

  return {
    port,
    dbPath: path.resolve(dbPath),
    whatsappSessionPath: path.resolve(whatsappSessionPath),
    timezone: process.env.TZ || 'Asia/Jakarta',
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || process.env.GROQ_MODEL || 'gemini-1.5-flash',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || process.env.GROQ_TIMEOUT_MS || 15000),
    allowedUsers: parseAllowedUsers(process.env.ALLOWED_USERS || ''),
  };
}

module.exports = {
  getEnvConfig,
  parseAllowedUsers,
};
