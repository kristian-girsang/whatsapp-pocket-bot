const { generateText } = require("./geminiClient");

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch (_err2) {
        return null;
      }
    }

    return null;
  }
}

async function inferCommandFromText(config, userText) {
  const systemPrompt = [
    "You map natural Indonesian chat into one supported bot command.",
    'Return JSON only: {"command": "..."} or {"command": ""} if no confident mapping.',
    "Do not invent unsupported commands.",
    "Supported commands patterns:",
    "1) bantuan",
    "2) update",
    "3) hari ini  |  minggu ini  |  bulan ini",
    "4) transaksi list | transaksi hari ini  |  transaksi minggu ini | transaksi bulan ini",
    "5) dompet tambah <nama>  |  dompet list  |  dompet pakai <nama> | dompet hapus <nama>",
    "6) budget list  |  budget <kategori> <nominal>",
    "7) analisa  |  analytics",
    "8) jadwal harian <HH:MM> | jadwal bulanan <1-28> <HH:MM>  |  jadwal list  |  jadwal hapus <id>",
    "9) edit <id> <nominal>  |  hapus <id>",
    'Map synonyms naturally, e.g. "laporan hari ini dong" -> "hari ini".',
    'If user asks to add wallet bca -> "dompet tambah bca".',
    "If unclear/non-actional chat, return empty command.",
  ].join(" ");

  const text = await generateText(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    { temperature: 0 },
  );

  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed.command !== "string") {
    return "";
  }

  return parsed.command.trim().toLowerCase();
}

module.exports = {
  inferCommandFromText,
};
