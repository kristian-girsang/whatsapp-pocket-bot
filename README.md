# WhatsApp AI Expense Tracker

Bot WhatsApp lokal untuk pencatatan keuangan dengan parser hybrid (rule + Groq), SQLite, multi dompet, budget tracking, analytics, dan scheduled report.

## Fitur

- Input transaksi natural language, termasuk typo umum: `makan 25rb`, `maksn25k`, `gaji 10jt`
- Multi-user whitelist (`ALLOWED_USERS`)
- Multi dompet per user (`dompet tambah`, `dompet pakai`)
- Budget tracking bulanan per kategori (`budget`)
- Analytics bulanan (`analytics`) dan insight AI (`analisa`)
- Scheduled report (`jadwal harian`, `jadwal bulanan`)
- Edit/hapus transaksi (`edit`, `hapus`)
- Rule kategori custom (`kategori rule`)
- Health endpoint: `GET /health`

## Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Isi `.env` minimal:
- `GROQ_API_KEY`
- `ALLOWED_USERS` (pisahkan dengan koma)

Contoh:

```env
GROQ_MODEL=llama-3.1-8b-instant
ALLOWED_USERS=6281262142952,133646564499629
```

Catatan: pada beberapa akun WhatsApp, pengirim bisa terbaca sebagai LID (angka panjang) seperti `133...`. Karena itu whitelist mendukung nomor `62...` maupun LID.

3. Jalankan lokal:

```bash
npm install
npm run dev
```

4. Scan QR WhatsApp di terminal saat startup pertama.

## Command cepat

- `update` -> kirim update hari ini lalu follow-up (`minggu ini` / `bulan ini` / `selesai`)
- `bantuan` -> ringkas daftar command
- `dompet tambah <nama>` / `dompet list` / `dompet pakai <nama>`
- `budget <kategori> <nominal>` / `budget list`
- `analisa` / `analytics`
- `edit <id> <nominal>` / `hapus <id>`

Contoh transaksi:
- `dompet bca makan 10rb`
- `dompet bca: maksn25k`

## Docker

```bash
docker compose up --build
```

## Test

```bash
npm test
```
