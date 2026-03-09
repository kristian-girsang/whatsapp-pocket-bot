function parseTime(input) {
  const match = String(input || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function createDailySchedule(db, userId, chatId, timeHhmm) {
  const time = parseTime(timeHhmm);
  if (!time) {
    return { error: 'Format waktu harus HH:MM, contoh 07:30' };
  }

  const insert = await db.run(
    `INSERT INTO scheduled_reports (user_id, chat_id, frequency, day_of_month, time_hhmm) VALUES (?, ?, 'daily', NULL, ?)`,
    [userId, chatId, time]
  );

  const row = await db.get(`SELECT * FROM scheduled_reports WHERE id = ?`, [insert.lastID]);
  return { data: row };
}

async function createMonthlySchedule(db, userId, chatId, dayOfMonth, timeHhmm) {
  const day = Number(dayOfMonth);
  const time = parseTime(timeHhmm);

  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return { error: 'Tanggal bulanan harus 1-28.' };
  }

  if (!time) {
    return { error: 'Format waktu harus HH:MM, contoh 07:30' };
  }

  const insert = await db.run(
    `INSERT INTO scheduled_reports (user_id, chat_id, frequency, day_of_month, time_hhmm) VALUES (?, ?, 'monthly', ?, ?)`,
    [userId, chatId, day, time]
  );

  const row = await db.get(`SELECT * FROM scheduled_reports WHERE id = ?`, [insert.lastID]);
  return { data: row };
}

async function listSchedules(db, userId) {
  return db.all(
    `SELECT id, frequency, day_of_month, time_hhmm, enabled FROM scheduled_reports WHERE user_id = ? ORDER BY id DESC`,
    [userId]
  );
}

async function deleteSchedule(db, userId, scheduleId) {
  const id = Number(scheduleId);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: 'ID jadwal tidak valid.' };
  }

  const result = await db.run(`DELETE FROM scheduled_reports WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!result.changes) {
    return { error: 'Jadwal tidak ditemukan.' };
  }

  return { data: { id } };
}

async function getDueSchedules(db) {
  return db.all(`
    SELECT sr.id, sr.user_id, sr.chat_id, sr.frequency, sr.day_of_month, sr.time_hhmm, sr.last_sent_key, u.phone_number
    FROM scheduled_reports sr
    INNER JOIN users u ON u.id = sr.user_id
    WHERE sr.enabled = 1
  `);
}

async function markScheduleSent(db, scheduleId, sentKey) {
  await db.run(`UPDATE scheduled_reports SET last_sent_key = ? WHERE id = ?`, [sentKey, scheduleId]);
}

function getLocalDateParts(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hhmm: `${map.hour}:${map.minute}`,
    dateKey: `${map.year}-${map.month}-${map.day}`,
    monthKey: `${map.year}-${map.month}`,
  };
}

function computeDueKey(schedule, timezone, date = new Date()) {
  const local = getLocalDateParts(timezone, date);
  if (local.hhmm !== schedule.time_hhmm) {
    return null;
  }

  if (schedule.frequency === 'daily') {
    return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  }

  if (schedule.frequency === 'monthly' && Number(schedule.day_of_month) === local.day) {
    return `${local.year}-${String(local.month).padStart(2, '0')}`;
  }

  return null;
}

module.exports = {
  createDailySchedule,
  createMonthlySchedule,
  listSchedules,
  deleteSchedule,
  getDueSchedules,
  markScheduleSent,
  computeDueKey,
};
