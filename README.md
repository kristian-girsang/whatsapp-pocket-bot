# WhatsApp AI Expense Tracker

Bot WhatsApp lokal untuk pencatatan keuangan dengan parser hybrid (rule + Groq), SQLite, multi dompet, budget tracking, analytics, dan scheduled report.

## Fitur

- Input transaksi natural language, termasuk typo umum: `makan 25rb`, `maksn 25rb`, `gaji 10jt`
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
ALLOWED_USERS=6281262142952,133646564499629
```

Catatan: pada beberapa akun WhatsApp, pengirim bisa terbaca sebagai LID (angka panjang) seperti `133...`. Karena itu whitelist mendukung nomor `62...` maupun LID.

3. Jalankan lokal:

```bash
npm install
npm run dev
```

4. Scan QR WhatsApp di terminal saat startup pertama.

## Docker

```bash
docker compose up --build
```

Data DB dan sesi WhatsApp disimpan di `./data`.

## Command utama

- `bantuan`
- `hari ini`
- `bulan ini`
- `analisa`
- `analytics`
- `budget <kategori> <nominal>`
- `budget list`
- `dompet tambah <nama>`
- `dompet list`
- `dompet pakai <nama>`
- `kategori rule <keyword> <kategori>`
- `kategori rules`
- `jadwal harian <HH:MM>`
- `jadwal bulanan <tgl 1-28> <HH:MM>`
- `jadwal list`
- `jadwal hapus <id>`
- `edit <id_transaksi> <nominal_baru>`
- `hapus <id_transaksi>`

Tip multi-dompet transaksi cepat:
- `dompet bca: makan 50rb`

## Test

```bash
npm test
```
