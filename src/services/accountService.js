async function getAccounts(db, userId) {
  return db.all(
    `SELECT id, user_id, name, is_default, created_at FROM accounts WHERE user_id = ? ORDER BY name ASC`,
    [userId]
  );
}

async function createAccount(db, userId, name) {
  const normalizedName = String(name || '').trim().toLowerCase();
  if (!normalizedName) {
    return { error: 'Nama akun tidak boleh kosong.' };
  }

  const existing = await db.get(`SELECT id FROM accounts WHERE user_id = ? AND name = ?`, [userId, normalizedName]);
  if (existing) {
    return { error: 'Akun sudah ada.' };
  }

  const hasAnyAccount = await db.get(`SELECT id FROM accounts WHERE user_id = ? LIMIT 1`, [userId]);
  const insert = await db.run(`INSERT INTO accounts (user_id, name, is_default) VALUES (?, ?, ?)`, [
    userId,
    normalizedName,
    hasAnyAccount ? 0 : 1,
  ]);

  const account = await db.get(`SELECT id, user_id, name, is_default FROM accounts WHERE id = ?`, [insert.lastID]);
  return { data: account };
}

async function getDefaultAccount(db, userId) {
  let account = await db.get(`SELECT id, user_id, name, is_default FROM accounts WHERE user_id = ? AND is_default = 1`, [
    userId,
  ]);

  if (account) {
    return account;
  }

  const created = await createAccount(db, userId, 'utama');
  if (created.error) {
    throw new Error(created.error);
  }

  account = await db.get(`SELECT id, user_id, name, is_default FROM accounts WHERE id = ?`, [created.data.id]);
  return account;
}

async function setDefaultAccount(db, userId, accountName) {
  const normalizedName = String(accountName || '').trim().toLowerCase();
  const account = await db.get(`SELECT id, user_id, name, is_default FROM accounts WHERE user_id = ? AND name = ?`, [
    userId,
    normalizedName,
  ]);

  if (!account) {
    return { error: 'Akun tidak ditemukan.' };
  }

  await db.run(`UPDATE accounts SET is_default = 0 WHERE user_id = ?`, [userId]);
  await db.run(`UPDATE accounts SET is_default = 1 WHERE id = ?`, [account.id]);

  return { data: { ...account, is_default: 1 } };
}

async function getAccountByName(db, userId, name) {
  const normalizedName = String(name || '').trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  return db.get(`SELECT id, user_id, name, is_default FROM accounts WHERE user_id = ? AND name = ?`, [
    userId,
    normalizedName,
  ]);
}

module.exports = {
  getAccounts,
  createAccount,
  getDefaultAccount,
  setDefaultAccount,
  getAccountByName,
};
