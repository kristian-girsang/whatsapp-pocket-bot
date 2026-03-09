async function findByPhone(db, phoneNumber) {
  return db.get(
    "SELECT id, phone_number, created_at FROM users WHERE phone_number = ?",
    [phoneNumber],
  );
}

async function getOrCreateUserByPhone(db, phoneNumber) {
  const existing = await findByPhone(db, phoneNumber);
  if (existing) {
    return existing;
  }

  const insertResult = await db.run(
    "INSERT INTO users (phone_number) VALUES (?)",
    [phoneNumber],
  );
  return db.get("SELECT id, phone_number, created_at FROM users WHERE id = ?", [
    insertResult.lastID,
  ]);
}

module.exports = {
  findByPhone,
  getOrCreateUserByPhone,
};
