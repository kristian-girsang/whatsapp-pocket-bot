const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone');
const { parseTransaction } = require('../ai/parseTransaction');
const { analyzeMonthlySummary } = require('../ai/analyzeReport');
const { understandMessage } = require('../ai/understandMessage');
const { getOrCreateUserByPhone } = require('../services/userService');
const {
  createTransaction,
  getTransactionsByRange,
  listRecentTransactions,
  summarizeTransactions,
  pickTopTransactions,
  updateTransactionAmount,
  deleteTransaction,
} = require('../services/transactionService');
const { buildSummaryReport } = require('../services/reportService');
const { getTodayRange, getCurrentWeekRange, getCurrentMonthRange } = require('../utils/time');
const { formatRupiah, parseAmountToken } = require('../utils/currency');
const {
  getAccounts,
  createAccount,
  getDefaultAccount,
  setDefaultAccount,
  getAccountByName,
  deleteAccount,
} = require('../services/accountService');
const {
  monthKeyFromDate,
  setBudget,
  getBudgets,
  buildBudgetReport,
  detectBudgetAlert,
} = require('../services/budgetService');
const { getCategoryRules, applyCategoryRule } = require('../services/categoryRuleService');
const { createReportScheduler } = require('../scheduler/reportScheduler');
const { buildAnalyticsReport } = require('../services/analyticsService');

function ensurePath(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isLikelyPhone(value) {
  return /^62\d{8,13}$/.test(String(value || ''));
}

async function resolveSenderIdentity(message) {
  const rawFrom = String(message.from || '').split('@')[0];
  const candidates = [normalizePhone(rawFrom), rawFrom].filter(Boolean);

  try {
    const contact = await message.getContact();
    const contactNumber = normalizePhone(contact?.number || '');
    const contactUser = normalizePhone(contact?.id?.user || '');
    if (contactNumber) candidates.unshift(contactNumber);
    if (contactUser) candidates.unshift(contactUser);
  } catch (_error) {
    // ignore contact lookup failure
  }

  const preferredPhone = candidates.find((x) => isLikelyPhone(x));
  const resolvedPhone = preferredPhone || normalizePhone(rawFrom);

  return {
    resolvedPhone,
    rawId: rawFrom,
    candidates: [...new Set(candidates)],
  };
}

function isWhitelisted(config, identity) {
  if (config.allowedUsers.size === 0) {
    return false;
  }

  if (config.allowedUsers.has(identity.resolvedPhone)) return true;
  if (config.allowedUsers.has(identity.rawId)) return true;
  return identity.candidates.some((candidate) => config.allowedUsers.has(candidate));
}

function normalizeCommand(text) {
  return String(text || '').trim().toLowerCase();
}

function extractWalletHint(text) {
  const withColon = String(text || '').match(/^(dompet|akun)\s+([a-z0-9_-]+)\s*:\s*(.+)$/i);
  if (withColon) {
    return { walletName: withColon[2].toLowerCase(), cleanText: withColon[3] };
  }

  const noColon = String(text || '').match(/^(dompet|akun)\s+([a-z0-9_-]+)\s+(.+)$/i);
  if (noColon) {
    return { walletName: noColon[2].toLowerCase(), cleanText: noColon[3] };
  }

  return { walletName: null, cleanText: text };
}

async function resolveWallet(db, userId, walletHint) {
  if (walletHint) {
    const found = await getAccountByName(db, userId, walletHint);
    if (found) return found;

    const created = await createAccount(db, userId, walletHint);
    if (created.error) throw new Error(created.error);
    return created.data;
  }

  return getDefaultAccount(db, userId);
}

function buildTransactionConfirmation(transaction) {
  const typeLabel = transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  return [
    'Transaksi tersimpan.',
    `${typeLabel}: ${formatRupiah(transaction.amount)}`,
    `Kategori: ${transaction.category}`,
    `Dompet: ${transaction.account_name || 'utama'}`,
    `Deskripsi: ${transaction.description}`,
    `ID: ${transaction.id}`,
  ].join('\n');
}

function buildTransactionListText(title, transactions) {
  if (!transactions.length) {
    return `${title}\n\nBelum ada transaksi.`;
  }

  const lines = transactions.map((trx) => {
    const type = trx.type === 'income' ? 'IN' : 'OUT';
    const account = trx.account_name || 'utama';
    return `#${trx.id} [${type}] ${formatRupiah(Number(trx.amount))} | ${trx.category} | ${account} | ${trx.description}`;
  });

  return [title, '', ...lines].join('\n');
}

async function handleReport(db, userId, mode) {
  const range = mode === 'today' ? getTodayRange() : mode === 'week' ? getCurrentWeekRange() : getCurrentMonthRange();
  const label = mode === 'today' ? 'Laporan Hari Ini' : mode === 'week' ? 'Laporan Minggu Ini' : 'Laporan Bulan Ini';

  const transactions = await getTransactionsByRange(db, userId, range.start, range.end);
  const summary = summarizeTransactions(transactions);

  return buildSummaryReport(label, summary, transactions);
}

async function handleTransactionList(db, userId, mode) {
  if (mode === 'all') {
    const rows = await listRecentTransactions(db, userId, 20);
    return buildTransactionListText('Daftar Transaksi Terbaru', rows);
  }

  const range = mode === 'today' ? getTodayRange() : mode === 'week' ? getCurrentWeekRange() : getCurrentMonthRange();
  const label = mode === 'today' ? 'Daftar Transaksi Hari Ini' : mode === 'week' ? 'Daftar Transaksi Minggu Ini' : 'Daftar Transaksi Bulan Ini';
  const rows = await getTransactionsByRange(db, userId, range.start, range.end);
  return buildTransactionListText(label, rows.slice(0, 30));
}

async function handleAnalysis(config, db, userId) {
  const range = getCurrentMonthRange();
  const transactions = await getTransactionsByRange(db, userId, range.start, range.end);
  const summary = summarizeTransactions(transactions);
  const topTransactions = pickTopTransactions(transactions, 5);
  return analyzeMonthlySummary(config, summary, topTransactions);
}

async function handleAnalytics(db, userId) {
  const range = getCurrentMonthRange();
  const transactions = await getTransactionsByRange(db, userId, range.start, range.end);
  const summary = summarizeTransactions(transactions);
  const topTransactions = pickTopTransactions(transactions, 5);
  return buildAnalyticsReport(transactions, summary, topTransactions);
}

async function buildIntroText(db, userId) {
  const report = await handleReport(db, userId, 'month');
  return [
    'Halo, saya Pocket Bot.',
    'Fokus saya membantu kamu mencatat pemasukan dan pengeluaran secara natural, mengelola dompet, dan memberi ringkasan keuangan.',
    '',
    report,
  ].join('\n');
}

async function executeAiIntent({ intent, rawText, ai, db, config, user, identity, message }) {
  const accounts = await getAccounts(db, user.id);

  if (intent === 'greeting' || intent === 'smalltalk') {
    if (ai.responseText) {
      return message.reply(`${ai.responseText}\n\n${await buildIntroText(db, user.id)}`);
    }
    return message.reply(await buildIntroText(db, user.id));
  }

  if (intent === 'add_wallet') {
    if (!ai.walletName) {
      return message.reply('Nama dompet belum jelas. Contoh: "tambah dompet baru dengan nama bca".');
    }

    const created = await createAccount(db, user.id, ai.walletName);
    return message.reply(created.error ? created.error : `Dompet ${created.data.name} berhasil ditambahkan.`);
  }

  if (intent === 'list_wallets') {
    const lines = accounts.length
      ? accounts.map((a) => `- ${a.name}${a.is_default ? ' (default)' : ''}`)
      : ['Belum ada dompet.'];
    return message.reply(['Daftar Dompet', '', ...lines].join('\n'));
  }

  if (intent === 'set_default_wallet') {
    if (!ai.walletName) {
      return message.reply('Nama dompet belum jelas. Contoh: "pakai dompet bca".');
    }

    const changed = await setDefaultAccount(db, user.id, ai.walletName);
    return message.reply(changed.error ? changed.error : `Dompet default sekarang: ${changed.data.name}`);
  }

  if (intent === 'delete_wallet') {
    if (!ai.walletName) {
      return message.reply('Nama dompet yang ingin dihapus belum jelas.');
    }

    const removed = await deleteAccount(db, user.id, ai.walletName);
    return message.reply(
      removed.error
        ? removed.error
        : `Dompet ${removed.data.name} dihapus. ${removed.data.removedTransactions} transaksi terkait ikut dihapus.`
    );
  }

  if (intent === 'report') {
    const mode = ai.period === 'week' ? 'week' : ai.period === 'month' ? 'month' : 'today';
    return message.reply(await handleReport(db, user.id, mode));
  }

  if (intent === 'list_transactions') {
    const mode = ai.period === 'today' || ai.period === 'week' || ai.period === 'month' ? ai.period : 'all';
    return message.reply(await handleTransactionList(db, user.id, mode));
  }

  if (intent === 'analysis') {
    return message.reply(await handleAnalysis(config, db, user.id));
  }

  if (intent === 'budget_list') {
    const monthKey = monthKeyFromDate();
    const budgets = await getBudgets(db, user.id, monthKey);
    const monthRange = getCurrentMonthRange();
    const transactions = await getTransactionsByRange(db, user.id, monthRange.start, monthRange.end);
    const summary = summarizeTransactions(transactions);
    return message.reply(buildBudgetReport(budgets, summary.expenseByCategory));
  }

  if (intent === 'budget_set') {
    if (!ai.category || !Number.isInteger(ai.amount) || ai.amount <= 0) {
      return message.reply('Budget belum lengkap. Contoh: "set budget makan 500rb".');
    }

    const saved = await setBudget(db, user.id, ai.category, ai.amount, monthKeyFromDate());
    return message.reply(
      saved.error
        ? saved.error
        : `Budget ${saved.data.category} diset ke ${formatRupiah(saved.data.limitAmount)} untuk ${saved.data.monthKey}.`
    );
  }

  if (intent === 'update_transaction') {
    const trxId = ai.transactionId;
    const amount = ai.amount;
    if (!Number.isInteger(trxId) || trxId <= 0 || !Number.isInteger(amount) || amount <= 0) {
      return message.reply('Format update transaksi belum jelas. Contoh: "ubah transaksi 12 jadi 35rb".');
    }

    const updated = await updateTransactionAmount(db, user.id, trxId, amount);
    return message.reply(
      updated.error
        ? updated.error
        : `Transaksi #${updated.data.id} diperbarui. Nominal baru: ${formatRupiah(updated.data.amount)}`
    );
  }

  if (intent === 'delete_transaction') {
    const trxId = ai.transactionId;
    if (!Number.isInteger(trxId) || trxId <= 0) {
      return message.reply('ID transaksi yang ingin dihapus belum jelas.');
    }

    const removed = await deleteTransaction(db, user.id, trxId);
    return message.reply(removed.error ? removed.error : `Transaksi #${removed.data.id} dihapus.`);
  }

  if (intent === 'record_transaction') {
    const transactionText = ai.transactionText || rawText;
    const walletFromText = ai.walletName || extractWalletHint(rawText).walletName;
    const wallet = await resolveWallet(db, user.id, walletFromText);

    const parsed = await parseTransaction(config, transactionText);
    const categoryRules = await getCategoryRules(db, user.id);
    const forcedCategory = applyCategoryRule(parsed.transaction.description, categoryRules);
    if (forcedCategory) {
      parsed.transaction.category = forcedCategory;
    }

    const saveResult = await createTransaction(db, user.id, parsed.transaction, wallet.id);
    if (saveResult.error) {
      return message.reply(`Transaksi gagal disimpan: ${saveResult.error}`);
    }

    const range = getCurrentMonthRange();
    const monthTrx = await getTransactionsByRange(db, user.id, range.start, range.end);
    const monthSummary = summarizeTransactions(monthTrx);
    const monthBudgets = await getBudgets(db, user.id, monthKeyFromDate());
    const budgetAlert = detectBudgetAlert(saveResult.data, monthBudgets, monthSummary.expenseByCategory);

    const confirmation = buildTransactionConfirmation(saveResult.data);
    return message.reply(budgetAlert ? `${confirmation}\n\nPeringatan: ${budgetAlert}` : confirmation);
  }

  logger.info('unknown_intent_fallback', { phone: identity.resolvedPhone, aiIntent: intent, aiConfidence: ai.confidence });

  const command = normalizeCommand(rawText);
  if (/\d/.test(command)) {
    const walletCtx = extractWalletHint(rawText);
    const wallet = await resolveWallet(db, user.id, walletCtx.walletName);
    const parsed = await parseTransaction(config, walletCtx.cleanText);
    const saveResult = await createTransaction(db, user.id, parsed.transaction, wallet.id);
    if (saveResult.error) {
      return message.reply(`Transaksi gagal disimpan: ${saveResult.error}`);
    }
    return message.reply(buildTransactionConfirmation(saveResult.data));
  }

  return message.reply('Saya siap bantu catat transaksi, kelola dompet, dan kasih laporan. Coba tulis kebutuhanmu dengan kalimat biasa.');
}

function createBot({ config, db }) {
  ensurePath(config.whatsappSessionPath);

  const authPath = path.resolve(config.whatsappSessionPath);
  const puppeteerConfig = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: puppeteerConfig,
  });

  const scheduler = createReportScheduler({ client, db, config });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    logger.info('whatsapp_qr_generated');
  });

  client.on('ready', () => {
    scheduler.start();
    logger.info('whatsapp_client_ready');
  });

  client.on('auth_failure', (msg) => {
    logger.error('whatsapp_auth_failure', { msg });
  });

  client.on('message', async (message) => {
    const rawText = message.body || '';

    if (!rawText || !message.from || message.from.includes('@g.us')) {
      return;
    }

    const identity = await resolveSenderIdentity(message);

    logger.info('incoming_message', {
      phone: identity.resolvedPhone,
      raw_id: identity.rawId,
      candidates: identity.candidates,
      text: rawText,
    });

    if (!isWhitelisted(config, identity)) {
      await message.reply('Nomor atau ID kamu belum terdaftar di whitelist bot.');
      logger.warn('blocked_non_whitelist', { phone: identity.resolvedPhone, rawId: identity.rawId });
      return;
    }

    try {
      const user = await getOrCreateUserByPhone(db, identity.resolvedPhone || identity.rawId);
      const accounts = await getAccounts(db, user.id);
      const defaultWallet = accounts.find((a) => a.is_default === 1)?.name || (await getDefaultAccount(db, user.id)).name;

      const ai = await understandMessage(config, {
        text: rawText,
        wallets: accounts.map((a) => a.name),
        defaultWallet,
      });

      await executeAiIntent({
        intent: ai.intent,
        rawText,
        ai,
        db,
        config,
        user,
        identity,
        message,
      });
    } catch (error) {
      logger.error('message_processing_failed', { error: error.message, phone: identity.resolvedPhone });
      await message.reply('Pesan belum bisa diproses. Coba ulangi dengan kalimat yang lebih jelas.');
    }
  });

  return {
    async initialize() {
      await client.initialize();
    },
    async destroy() {
      scheduler.stop();
      await client.destroy();
    },
  };
}

module.exports = {
  createBot,
};
