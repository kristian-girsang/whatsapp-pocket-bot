# WhatsApp AI Expense Tracker

Bot WhatsApp lokal untuk pencatatan keuangan dengan parser hybrid (rule + Groq), SQLite, multi dompet, budget tracking, analytics, dan scheduled report.

## Fitur

- Input transaksi natural language (bot juga menerima instruksi bebas), termasuk typo umum: `makan 25rb`, `maksn25k`, `gaji 10jt`
- Multi-user whitelist (`ALLOWED_USERS`)
- Multi dompet per user (termasuk hapus dompet)
- Budget tracking bulanan per kategori (`budget`)
- Analytics bulanan (`analytics`) dan insight AI (`analisa`)
- Scheduled report (`jadwal harian`, `jadwal bulanan`)
- Edit/hapus transaksi (`edit`, `hapus`)
- Daftar transaksi (`transaksi list`)
- Rule kategori custom (`kategori rule`)
- Health endpoint: `GET /health`

## Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Isi `.env` minimal:

- `GEMINI_API_KEY`
- `ALLOWED_USERS` (pisahkan dengan koma)

Contoh:

```env
GEMINI_MODEL=gemini-1.5-flash
ALLOWED_USERS=6281262142952,133646564499629
```

3. Jalankan lokal:

```bash
npm install
npm run dev
```

## Command cepat

- `update` -> kirim update hari ini lalu follow-up (`minggu ini` / `bulan ini` / `selesai`)
- `bantuan`
- `hari ini`, `minggu ini`, `bulan ini`
- `list transaksi`, `transaksi hari ini`, `transaksi minggu ini`, `transaksi bulan ini`
- `dompet tambah <nama>`, `dompet list`, `dompet pakai <nama>`, `dompet hapus <nama>`
- `budget <kategori> <nominal>`, `budget list`
- `analisa`, `analytics`
- `edit <id> <nominal>`, `hapus <id>`

Catatan: saat `dompet` dihapus, semua transaksi yang terhubung dengan dompet itu ikut dihapus.

## Test

```bash
npm test
```
