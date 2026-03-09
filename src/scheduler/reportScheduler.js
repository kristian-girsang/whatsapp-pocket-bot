const logger = require('../utils/logger');
const { getCurrentMonthRange, getTodayRange } = require('../utils/time');
const {
  getDueSchedules,
  markScheduleSent,
  computeDueKey,
} = require('../services/scheduleService');
const { getTransactionsByRange, summarizeTransactions } = require('../services/transactionService');
const { buildSummaryReport } = require('../services/reportService');

function buildScheduledReport(mode, summary) {
  const label = mode === 'daily' ? 'Laporan Otomatis Harian' : 'Laporan Otomatis Bulanan';
  return buildSummaryReport(label, summary);
}

function createReportScheduler({ client, db, config }) {
  let intervalId = null;

  const tick = async () => {
    try {
      const schedules = await getDueSchedules(db);
      for (const schedule of schedules) {
        if (!config.allowedUsers.has(schedule.phone_number)) {
          continue;
        }

        const dueKey = computeDueKey(schedule, config.timezone);
        if (!dueKey || dueKey === schedule.last_sent_key) {
          continue;
        }

        const range = schedule.frequency === 'daily' ? getTodayRange() : getCurrentMonthRange();
        const transactions = await getTransactionsByRange(db, schedule.user_id, range.start, range.end);
        const summary = summarizeTransactions(transactions);
        const text = buildScheduledReport(schedule.frequency, summary);

        await client.sendMessage(schedule.chat_id, text);
        await markScheduleSent(db, schedule.id, dueKey);

        logger.info('scheduled_report_sent', {
          scheduleId: schedule.id,
          userId: schedule.user_id,
          frequency: schedule.frequency,
          dueKey,
        });
      }
    } catch (error) {
      logger.error('scheduled_report_failed', { error: error.message });
    }
  };

  return {
    start() {
      if (intervalId) {
        return;
      }

      intervalId = setInterval(tick, 60 * 1000);
      tick();
      logger.info('scheduler_started');
    },
    stop() {
      if (!intervalId) {
        return;
      }

      clearInterval(intervalId);
      intervalId = null;
      logger.info('scheduler_stopped');
    },
  };
}

module.exports = {
  createReportScheduler,
};
