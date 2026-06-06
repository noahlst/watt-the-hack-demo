# WattNow Backend

Tiny Node.js/Postgres backend for a three minute WattNow demo.

## Run locally

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

The API runs on `http://localhost:4000`. On startup it creates the Postgres table automatically when `AUTO_MIGRATE=true`.

By default the app connects to `postgres://postgres:postgres@localhost:5432/postgres`.
If you do not already have local Postgres running, `docker-compose.yml` provides a matching Postgres service.

## Demo flow

Create a realistic bill ingestion without needing a file:

```bash
curl -X POST http://localhost:4000/api/bills/demo \
  -H "Content-Type: application/json" \
  -d '{"customerEmail":"demo@wattnow.app","postcode":"3066"}'
```

Upload a bill or paste extracted bill text:

```bash
curl -X POST http://localhost:4000/api/bills/upload \
  -F "customerEmail=demo@wattnow.app" \
  -F "provider=Origin Energy" \
  -F "postcode=3066" \
  -F "rawText=Total amount due $328.70. Usage 1248 kWh. Billing period 01/03/2026 to 31/05/2026."
```

Fetch the newest bill and generated coaching notifications:

```bash
curl http://localhost:4000/api/bills/latest
curl http://localhost:4000/api/notifications/demo@wattnow.app
```

## API

- `GET /health` checks the Node process and Postgres connection.
- `POST /api/bills/demo` inserts a polished sample ingestion for the stage demo.
- `POST /api/bills/upload` accepts `multipart/form-data` with optional `bill` file, or normal JSON/form fields.
- `GET /api/bills/latest` returns the newest ingested bill.
- `GET /api/notifications/:customerEmail` returns coaching notifications generated from uploaded bills.

## Table

The main table is `bill_ingestions`. It stores customer identity, bill facts, raw extracted text, a flexible `extracted_data` JSONB payload, and `coaching_notifications` JSONB so the demo can evolve quickly.
