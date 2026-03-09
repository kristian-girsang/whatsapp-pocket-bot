# WhatsApp AI Expense Tracker

Bot WhatsApp lokal untuk pencatatan keuangan dengan AI-first conversation (Gemini), SQLite, multi dompet, budget tracking, analytics, dan scheduled report.

## Gaya Interaksi

Bot tidak lagi bergantung pada command kaku. Kamu bisa pakai bahasa natural.

Contoh:
- `halo`
- `tambah dompet baru dengan nama bca`
- `tambahkan dompet baru bri`
- `baru makan siang 12k pake bri`
- `tolong tampilkan transaksi minggu ini`
- `hapus dompet bri`

Bot akan menginterpretasi intent user via AI dan tetap fokus pada tujuan utama: tracking pemasukan dan pengeluaran.

## Fitur

- Input transaksi natural language, termasuk typo umum
- Multi-user whitelist (`ALLOWED_USERS`)
- Multi dompet per user (termasuk hapus dompet + hapus transaksi terkait)
- Budget tracking bulanan per kategori
- Analytics bulanan (`analytics`) dan insight AI (`analisa`)
- Scheduled report
- Edit/hapus transaksi
- Daftar transaksi
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

## Test

```bash
npm test
```
