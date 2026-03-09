async function upsertCategoryRule(db, userId, keyword, category) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const normalizedCategory = String(category || '').trim().toLowerCase();

  if (!normalizedKeyword || !normalizedCategory) {
    return { error: 'Keyword dan kategori wajib diisi.' };
  }

  await db.run(
    `
    INSERT INTO category_rules (user_id, keyword, category)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, keyword)
    DO UPDATE SET category = excluded.category
    `,
    [userId, normalizedKeyword, normalizedCategory]
  );

  return { data: { keyword: normalizedKeyword, category: normalizedCategory } };
}

async function getCategoryRules(db, userId) {
  return db.all(`SELECT id, keyword, category FROM category_rules WHERE user_id = ? ORDER BY keyword ASC`, [userId]);
}

function applyCategoryRule(description, rules) {
  const text = String(description || '').toLowerCase();
  for (const rule of rules) {
    if (text.includes(String(rule.keyword || '').toLowerCase())) {
      return String(rule.category || '').toLowerCase();
    }
  }

  return null;
}

module.exports = {
  upsertCategoryRule,
  getCategoryRules,
  applyCategoryRule,
};
