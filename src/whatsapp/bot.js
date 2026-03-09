const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phone');
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
const { getTodayRange, getCurrentWeekRange, getCurrentMonthRange } = require('../utils/time');
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

function isLikelyPhone(value) {
  return /^62\d{8,13}$/.test(String(value || ''));
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

function fuzzyWord(input, targets, maxDistance = 2) {
  const word = String(input || '').trim().toLowerCase();
  if (!word) return null;

  let best = null;
  let bestDistance = Infinity;

  for (const target of targets) {
    const dist = levenshtein(word, target);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = target;
    }
  }

  return bestDistance <= maxDistance ? best : null;
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

function normalizeIntent(command) {
  const directMap = {
    'hari ini': 'hari ini',
    'bulan ini': 'bulan ini',
    'minggu ini': 'minggu ini',
    bantuan: 'bantuan',
    help: 'bantuan',
    update: 'update',
    analisa: 'analisa',
    analytics: 'analytics',
  };

  if (directMap[command]) return directMap[command];

  if (!command.includes(' ')) {
    const fuzzy = fuzzyWord(command, ['bantuan', 'update', 'analisa', 'analytics']);
    if (fuzzy) return fuzzy;
  }

  return command;
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

function buildHelpText() {
  return [
    'Command inti:',
    '- update',
    '- hari ini | minggu ini | bulan ini',
    '- dompet tambah/list/pakai <nama>',
    '- budget <kategori> <nominal> | budget list',
    '- analisa | analytics',
    '- edit <id> <nominal> | hapus <id>',
    '',
    'Contoh transaksi: "makan 25rb", "maksn25k", "dompet bca makan 10rb"',
  ].join('\n');
}

function extractWalletHint(text) {
  const withColon = String(text || '').match(/^(dompet|akun)\s+([a-z0-9_-]+)\s*:\s*(.+)$/i);
  if (withColon) {
    return { walletName: withColon[2].toLowerCase(), cleanText: withColon[3] };
  }

  const noColon = String(text || '').match(/^(dompet|akun)\s+([a-z0-9_-]+)\s+(.+)$/i);
  if (noColon) {
    const actionWord = noColon[3].trim().toLowerCase();
    if (['tambah', 'list', 'pakai'].includes(actionWord.split(' ')[0])) {
      return { walletName: null, cleanText: text };
    }

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

async function handleReport(db, userId, mode) {
  const range = mode === 'today' ? getTodayRange() : mode === 'week' ? getCurrentWeekRange() : getCurrentMonthRange();
  const label = mode === 'today' ? 'Laporan Hari Ini' : mode === 'week' ? 'Laporan Minggu Ini' : 'Laporan Bulan Ini';

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

  return { type: 'set', category: setMatch[1].toLowerCase(), amount: parseAmountToken(setMatch[2]) };
}

function parseWalletCommand(text) {
  const add = text.match(/^(dompet|akun)\s+tambah\s+([a-z0-9_-]+)$/i);
  if (add) return { type: 'add', name: add[2].toLowerCase() };

  const list = text.match(/^(dompet|akun)\s+list$/i);
  if (list) return { type: 'list' };

  const use = text.match(/^(dompet|akun)\s+pakai\s+([a-z0-9_-]+)$/i);
  if (use) return { type: 'use', name: use[2].toLowerCase() };

  const alternateAdd = text.match(/^tambah\s+dompet\s+([a-z0-9_-]+)$/i);
  if (alternateAdd) return { type: 'add', name: alternateAdd[1].toLowerCase() };

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

function looksLikeTransaction(text) {
  return /\d/.test(text) || /\b(rb|jt|k)\b/.test(text);
}

function createBot({ config, db }) {
  ensurePath(config.whatsappSessionPath);

  const authPath = path.resolve(config.whatsappSessionPath);
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  const scheduler = createReportScheduler({ client, db, config });
  const pendingUpdateFlow = new Map();

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
    const command = normalizeIntent(normalizeCommand(rawText));

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
      await message.reply('Nomor/ID kamu belum terdaftar di whitelist bot.');
      logger.warn('blocked_non_whitelist', { phone: identity.resolvedPhone, rawId: identity.rawId });
      return;
    }

    try {
      const user = await getOrCreateUserByPhone(db, identity.resolvedPhone || identity.rawId);
      await getDefaultAccount(db, user.id);

      const pending = pendingUpdateFlow.get(user.id);
      if (pending?.step === 'scope') {
        if (command === 'minggu ini') {
          await message.reply(await handleReport(db, user.id, 'week'));
          pendingUpdateFlow.delete(user.id);
          return;
        }

        if (command === 'bulan ini') {
          await message.reply(await handleReport(db, user.id, 'month'));
          pendingUpdateFlow.delete(user.id);
          return;
        }

        if (command === 'selesai' || command === 'tidak') {
          await message.reply('Oke, update selesai.');
          pendingUpdateFlow.delete(user.id);
          return;
        }
      }

      if (command === 'help' || command === 'bantuan') {
        await message.reply(buildHelpText());
        return;
      }

      if (command === 'update') {
        const todayReport = await handleReport(db, user.id, 'today');
        await message.reply(`${todayReport}\n\nButuh update lanjutan? Balas: "minggu ini", "bulan ini", atau "selesai".`);
        pendingUpdateFlow.set(user.id, { step: 'scope', createdAt: Date.now() });
        return;
      }

      if (command === 'hari ini') {
        await message.reply(await handleReport(db, user.id, 'today'));
        logger.info('command_executed', { phone: identity.resolvedPhone, command });
        return;
      }

      if (command === 'minggu ini') {
        await message.reply(await handleReport(db, user.id, 'week'));
        logger.info('command_executed', { phone: identity.resolvedPhone, command });
        return;
      }

      if (command === 'bulan ini') {
        await message.reply(await handleReport(db, user.id, 'month'));
        logger.info('command_executed', { phone: identity.resolvedPhone, command });
        return;
      }

      if (command === 'analisa') {
        await message.reply(await handleAnalysis(config, db, user.id));
        logger.info('command_executed', { phone: identity.resolvedPhone, command });
        return;
      }

      if (command === 'analytics') {
        await message.reply(await handleAnalytics(db, user.id));
        logger.info('command_executed', { phone: identity.resolvedPhone, command });
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

      const walletCommand = parseWalletCommand(command);
      if (walletCommand?.type === 'add') {
        const created = await createAccount(db, user.id, walletCommand.name);
        await message.reply(created.error ? created.error : `Dompet ${created.data.name} berhasil ditambahkan.`);
        return;
      }

      if (walletCommand?.type === 'list') {
        const accounts = await getAccounts(db, user.id);
        const lines = accounts.length
          ? accounts.map((a) => `- ${a.name}${a.is_default ? ' (default)' : ''}`)
          : ['Belum ada dompet.'];
        await message.reply(['Daftar Dompet', '', ...lines].join('\n'));
        return;
      }

      if (walletCommand?.type === 'use') {
        const changed = await setDefaultAccount(db, user.id, walletCommand.name);
        await message.reply(changed.error ? changed.error : `Dompet default sekarang: ${changed.data.name}`);
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
        const lines = rules.length ? rules.map((r) => `- ${r.keyword} -> ${r.category}`) : ['Belum ada rule kategori.'];
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

      if (!looksLikeTransaction(command)) {
        await message.reply('Perintah tidak dikenali. Ketik "bantuan" atau "update".');
        return;
      }

      const walletCtx = extractWalletHint(rawText);
      const wallet = await resolveWallet(db, user.id, walletCtx.walletName);

      const parsed = await parseTransaction(config, walletCtx.cleanText);
      const categoryRules = await getCategoryRules(db, user.id);
      const forcedCategory = applyCategoryRule(parsed.transaction.description, categoryRules);
      if (forcedCategory) {
        parsed.transaction.category = forcedCategory;
      }

      logger.info('transaction_parsed', { phone: identity.resolvedPhone, source: parsed.source, wallet: wallet.name });

      const saveResult = await createTransaction(db, user.id, parsed.transaction, wallet.id);
      if (saveResult.error) {
        await message.reply(`Transaksi gagal disimpan: ${saveResult.error}`);
        logger.warn('transaction_save_failed', { phone: identity.resolvedPhone, reason: saveResult.error });
        return;
      }

      const range = getCurrentMonthRange();
      const monthTrx = await getTransactionsByRange(db, user.id, range.start, range.end);
      const monthSummary = summarizeTransactions(monthTrx);
      const monthBudgets = await getBudgets(db, user.id, monthKeyFromDate());
      const budgetAlert = detectBudgetAlert(saveResult.data, monthBudgets, monthSummary.expenseByCategory);

      const confirmation = buildTransactionConfirmation(saveResult.data);
      await message.reply(budgetAlert ? `${confirmation}\n\nPERINGATAN: ${budgetAlert}` : confirmation);
      logger.info('transaction_saved', { phone: identity.resolvedPhone, transactionId: saveResult.data.id, walletId: wallet.id });
    } catch (error) {
      logger.error('message_processing_failed', { error: error.message, phone: identity.resolvedPhone });
      await message.reply('Pesan belum bisa diproses. Ketik "bantuan" atau "update".');
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
