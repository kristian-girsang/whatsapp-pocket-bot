const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');
const { phoneFromWhatsAppId } = require('../utils/phone');
const { parseTransaction } = require('../ai/parseTransaction');
const { analyzeMonthlySummary } = require('../ai/analyzeReport');
const { getOrCreateUserByPhone } = require('../services/userService');
const {
  createTransaction,
  getTransactionsByRange,
  summarizeTransactions,
  pickTopTransactions,
  updateTransactionAmount,
  deleteTransaction,
} = require('../services/transactionService');
const { buildSummaryReport } = require('../services/reportService');
const { getTodayRange, getCurrentMonthRange } = require('../utils/time');
const { formatRupiah, parseAmountToken } = require('../utils/currency');
const {
  getAccounts,
  createAccount,
  getDefaultAccount,
  setDefaultAccount,
  getAccountByName,
} = require('../services/accountService');
const {
  monthKeyFromDate,
  setBudget,
  getBudgets,
  buildBudgetReport,
  detectBudgetAlert,
} = require('../services/budgetService');
const { upsertCategoryRule, getCategoryRules, applyCategoryRule } = require('../services/categoryRuleService');
const {
  createDailySchedule,
  createMonthlySchedule,
  listSchedules,
  deleteSchedule,
} = require('../services/scheduleService');
const { createReportScheduler } = require('../scheduler/reportScheduler');
const { buildAnalyticsReport } = require('../services/analyticsService');

function ensurePath(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isWhitelisted(config, phone) {
  if (config.allowedUsers.size === 0) {
    return false;
  }

  return config.allowedUsers.has(phone);
}

function normalizeCommand(text) {
  return String(text || '').trim().toLowerCase();
}

function buildTransactionConfirmation(transaction) {
  const typeLabel = transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  return [
    'Transaksi tersimpan.',
    `${typeLabel}: ${formatRupiah(transaction.amount)}`,
    `Kategori: ${transaction.category}`,
    `Akun: ${transaction.account_name || 'utama'}`,
    `Deskripsi: ${transaction.description}`,
    `ID: ${transaction.id}`,
  ].join('\n');
}

function buildHelpText() {
  return [
    'Command tersedia:',
    '- hari ini',
    '- bulan ini',
    '- analisa',
    '- analytics',
    '- budget <kategori> <nominal>',
    '- budget list',
    '- akun tambah <nama>',
    '- akun list',
    '- akun pakai <nama>',
    '- kategori rule <keyword> <kategori>',
    '- kategori rules',
    '- jadwal harian <HH:MM>',
    '- jadwal bulanan <tgl 1-28> <HH:MM>',
    '- jadwal list',
    '- jadwal hapus <id>',
    '- edit <id_transaksi> <nominal_baru>',
    '- hapus <id_transaksi>',
    '',
    'Transaksi biasa: "makan 25rb" atau "gaji 10jt"',
  ].join('\n');
}

function extractAccountHint(text) {
  const match = String(text || '').match(/^akun\s+([a-z0-9_-]+)\s*:\s*(.+)$/i);
  if (!match) {
    return { accountName: null, cleanText: text };
  }

  return {
    accountName: match[1].toLowerCase(),
    cleanText: match[2],
  };
}

async function resolveAccount(db, userId, accountHint) {
  if (accountHint) {
    const found = await getAccountByName(db, userId, accountHint);
    if (found) {
      return found;
    }

    const created = await createAccount(db, userId, accountHint);
    if (created.error) {
      throw new Error(created.error);
    }
    return created.data;
  }

  return getDefaultAccount(db, userId);
}

async function handleReport(db, userId, mode) {
  const range = mode === 'today' ? getTodayRange() : getCurrentMonthRange();
  const label = mode === 'today' ? 'Laporan Hari Ini' : 'Laporan Bulan Ini';

  const transactions = await getTransactionsByRange(db, userId, range.start, range.end);
  const summary = summarizeTransactions(transactions);

  return buildSummaryReport(label, summary, transactions);
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

function parseBudgetCommand(text) {
  const listMatch = text.match(/^budget\s+list$/i);
  if (listMatch) return { type: 'list' };

  const setMatch = text.match(/^budget\s+([a-z0-9_-]+)\s+([0-9.,a-z]+)$/i);
  if (!setMatch) return null;

  return {
    type: 'set',
    category: setMatch[1].toLowerCase(),
    amount: parseAmountToken(setMatch[2]),
  };
}

function parseAccountCommand(text) {
  const add = text.match(/^akun\s+tambah\s+([a-z0-9_-]+)$/i);
  if (add) return { type: 'add', name: add[1].toLowerCase() };

  const list = text.match(/^akun\s+list$/i);
  if (list) return { type: 'list' };

  const use = text.match(/^akun\s+pakai\s+([a-z0-9_-]+)$/i);
  if (use) return { type: 'use', name: use[1].toLowerCase() };

  return null;
}

function parseCategoryCommand(text) {
  const rule = text.match(/^kategori\s+rule\s+([^\s]+)\s+([^\s]+)$/i);
  if (rule) return { type: 'rule', keyword: rule[1], category: rule[2] };

  const rules = text.match(/^kategori\s+rules$/i);
  if (rules) return { type: 'rules' };

  return null;
}

function parseScheduleCommand(text) {
  const daily = text.match(/^jadwal\s+harian\s+(\d{2}:\d{2})$/i);
  if (daily) return { type: 'daily', time: daily[1] };

  const monthly = text.match(/^jadwal\s+bulanan\s+(\d{1,2})\s+(\d{2}:\d{2})$/i);
  if (monthly) return { type: 'monthly', day: Number(monthly[1]), time: monthly[2] };

  const list = text.match(/^jadwal\s+list$/i);
  if (list) return { type: 'list' };

  const del = text.match(/^jadwal\s+hapus\s+(\d+)$/i);
  if (del) return { type: 'delete', id: Number(del[1]) };

  return null;
}

function parseEditCommand(text) {
  const edit = text.match(/^edit\s+(\d+)\s+([0-9.,a-z]+)$/i);
  if (!edit) return null;

  return { id: Number(edit[1]), amount: parseAmountToken(edit[2]) };
}

function parseDeleteCommand(text) {
  const del = text.match(/^hapus\s+(\d+)$/i);
  if (!del) return null;

  return { id: Number(del[1]) };
}

function createBot({ config, db }) {
  ensurePath(config.whatsappSessionPath);

  const authPath = path.resolve(config.whatsappSessionPath);
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
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
    const command = normalizeCommand(rawText);

    if (!rawText || !message.from || message.from.includes('@g.us')) {
      return;
    }

    const phone = phoneFromWhatsAppId(message.from);
    logger.info('incoming_message', { phone, text: rawText });

    if (!isWhitelisted(config, phone)) {
      await message.reply('Nomor kamu belum terdaftar di whitelist bot.');
      logger.warn('blocked_non_whitelist', { phone });
      return;
    }

    try {
      const user = await getOrCreateUserByPhone(db, phone);
      await getDefaultAccount(db, user.id);

      if (command === 'help' || command === 'bantuan') {
        await message.reply(buildHelpText());
        return;
      }

      if (command === 'hari ini') {
        const reportText = await handleReport(db, user.id, 'today');
        await message.reply(reportText);
        logger.info('command_executed', { phone, command });
        return;
      }

      if (command === 'bulan ini') {
        const reportText = await handleReport(db, user.id, 'month');
        await message.reply(reportText);
        logger.info('command_executed', { phone, command });
        return;
      }

      if (command === 'analisa') {
        const analysisText = await handleAnalysis(config, db, user.id);
        await message.reply(analysisText);
        logger.info('command_executed', { phone, command });
        return;
      }

      if (command === 'analytics') {
        const analyticsText = await handleAnalytics(db, user.id);
        await message.reply(analyticsText);
        logger.info('command_executed', { phone, command });
        return;
      }

      const budgetCommand = parseBudgetCommand(command);
      if (budgetCommand?.type === 'list') {
        const monthKey = monthKeyFromDate();
        const budgets = await getBudgets(db, user.id, monthKey);
        const monthRange = getCurrentMonthRange();
        const transactions = await getTransactionsByRange(db, user.id, monthRange.start, monthRange.end);
        const summary = summarizeTransactions(transactions);
        await message.reply(buildBudgetReport(budgets, summary.expenseByCategory));
        return;
      }

      if (budgetCommand?.type === 'set') {
        if (!budgetCommand.amount) {
          await message.reply('Nominal budget tidak valid.');
          return;
        }

        const saved = await setBudget(db, user.id, budgetCommand.category, budgetCommand.amount, monthKeyFromDate());
        if (saved.error) {
          await message.reply(saved.error);
          return;
        }

        await message.reply(`Budget ${saved.data.category} diset ke ${formatRupiah(saved.data.limitAmount)} untuk ${saved.data.monthKey}.`);
        return;
      }

      const accountCommand = parseAccountCommand(command);
      if (accountCommand?.type === 'add') {
        const created = await createAccount(db, user.id, accountCommand.name);
        await message.reply(created.error ? created.error : `Akun ${created.data.name} berhasil ditambahkan.`);
        return;
      }

      if (accountCommand?.type === 'list') {
        const accounts = await getAccounts(db, user.id);
        const lines = accounts.length
          ? accounts.map((a) => `- ${a.name}${a.is_default ? ' (default)' : ''}`)
          : ['Belum ada akun.'];
        await message.reply(['Daftar Akun', '', ...lines].join('\n'));
        return;
      }

      if (accountCommand?.type === 'use') {
        const changed = await setDefaultAccount(db, user.id, accountCommand.name);
        await message.reply(changed.error ? changed.error : `Akun default sekarang: ${changed.data.name}`);
        return;
      }

      const categoryCommand = parseCategoryCommand(command);
      if (categoryCommand?.type === 'rule') {
        const upserted = await upsertCategoryRule(db, user.id, categoryCommand.keyword, categoryCommand.category);
        await message.reply(
          upserted.error
            ? upserted.error
            : `Rule kategori disimpan: keyword "${upserted.data.keyword}" -> ${upserted.data.category}`
        );
        return;
      }

      if (categoryCommand?.type === 'rules') {
        const rules = await getCategoryRules(db, user.id);
        const lines = rules.length
          ? rules.map((r) => `- ${r.keyword} -> ${r.category}`)
          : ['Belum ada rule kategori.'];
        await message.reply(['Rule Kategori', '', ...lines].join('\n'));
        return;
      }

      const scheduleCommand = parseScheduleCommand(command);
      if (scheduleCommand?.type === 'daily') {
        const created = await createDailySchedule(db, user.id, message.from, scheduleCommand.time);
        await message.reply(created.error ? created.error : `Jadwal harian aktif jam ${created.data.time_hhmm}.`);
        return;
      }

      if (scheduleCommand?.type === 'monthly') {
        const created = await createMonthlySchedule(db, user.id, message.from, scheduleCommand.day, scheduleCommand.time);
        await message.reply(
          created.error
            ? created.error
            : `Jadwal bulanan aktif setiap tanggal ${created.data.day_of_month} jam ${created.data.time_hhmm}.`
        );
        return;
      }

      if (scheduleCommand?.type === 'list') {
        const schedules = await listSchedules(db, user.id);
        const lines = schedules.length
          ? schedules.map((s) =>
              `- #${s.id} ${s.frequency}${s.frequency === 'monthly' ? ` tgl ${s.day_of_month}` : ''} ${s.time_hhmm}`
            )
          : ['Belum ada jadwal report.'];
        await message.reply(['Daftar Jadwal', '', ...lines].join('\n'));
        return;
      }

      if (scheduleCommand?.type === 'delete') {
        const deleted = await deleteSchedule(db, user.id, scheduleCommand.id);
        await message.reply(deleted.error ? deleted.error : `Jadwal #${deleted.data.id} dihapus.`);
        return;
      }

      const editCommand = parseEditCommand(command);
      if (editCommand) {
        if (!editCommand.amount) {
          await message.reply('Nominal baru tidak valid.');
          return;
        }

        const updated = await updateTransactionAmount(db, user.id, editCommand.id, editCommand.amount);
        await message.reply(
          updated.error
            ? updated.error
            : `Transaksi #${updated.data.id} diperbarui. Nominal baru: ${formatRupiah(updated.data.amount)}`
        );
        return;
      }

      const deleteCommand = parseDeleteCommand(command);
      if (deleteCommand) {
        const removed = await deleteTransaction(db, user.id, deleteCommand.id);
        await message.reply(removed.error ? removed.error : `Transaksi #${removed.data.id} dihapus.`);
        return;
      }

      const accountCtx = extractAccountHint(rawText);
      const account = await resolveAccount(db, user.id, accountCtx.accountName);

      const parsed = await parseTransaction(config, accountCtx.cleanText);
      const categoryRules = await getCategoryRules(db, user.id);
      const forcedCategory = applyCategoryRule(parsed.transaction.description, categoryRules);
      if (forcedCategory) {
        parsed.transaction.category = forcedCategory;
      }

      logger.info('transaction_parsed', { phone, source: parsed.source, account: account.name });

      const saveResult = await createTransaction(db, user.id, parsed.transaction, account.id);
      if (saveResult.error) {
        await message.reply(`Transaksi gagal disimpan: ${saveResult.error}`);
        logger.warn('transaction_save_failed', { phone, reason: saveResult.error });
        return;
      }

      const range = getCurrentMonthRange();
      const monthTrx = await getTransactionsByRange(db, user.id, range.start, range.end);
      const monthSummary = summarizeTransactions(monthTrx);
      const monthBudgets = await getBudgets(db, user.id, monthKeyFromDate());
      const budgetAlert = detectBudgetAlert(saveResult.data, monthBudgets, monthSummary.expenseByCategory);

      const confirmation = buildTransactionConfirmation(saveResult.data);
      await message.reply(budgetAlert ? `${confirmation}\n\n⚠️ ${budgetAlert}` : confirmation);
      logger.info('transaction_saved', { phone, transactionId: saveResult.data.id, accountId: account.id });
    } catch (error) {
      logger.error('message_processing_failed', { error: error.message, phone });
      await message.reply('Pesan belum bisa diproses. Ketik "bantuan" untuk daftar command.');
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
