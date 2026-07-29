# Runtime Modes Matrix

This document is the **single source of truth** for Xelma Backend's runtime
mode flags. Refer to it when setting up a local environment, debugging unexpected
endpoint behavior, or choosing the right flags for a deployment profile.

> **Startup tip:** The server logs the active mode flags at boot. Look for
> `Active DATA_MODE=...`, `Bet mode: ...`, and `ROUNDS_MOCK_MODE=...` in the
> console output. Each log line references this document:
> `Runtime modes documented at docs/runtime-modes.md`.

---

## Quick-reference table

| Flag | Config key / env var | Values | Default | Where parsed |
|---|---|---|---|---|
| `DATA_MODE` | `config.app.dataMode` | `live`, `mock` | `live` | `src/config/index.ts` |
| `DATA_STORE` | `config.app.dataStore` | `postgres`, `memory` | auto (see below) | `src/config/index.ts` |
| `BET_STUB_MODE` | `process.env.BET_STUB_MODE` | `true`, `false` | `true` | `src/services/bet.service.ts` |
| `ROUNDS_MOCK_MODE` | `config.app.roundsMockMode` | `true`, `false` | `false` | `src/config/index.ts` |
| `API_ONLY` | `process.env.API_ONLY` | `true`, `false` | `false` | `src/index.ts` |

### DATA_STORE auto-derivation

When `DATA_MODE=mock`, the config defaults `DATA_STORE` to `memory`.
You can override it explicitly: `DATA_MODE=mock DATA_STORE=postgres` is valid.
When `DATA_MODE=live`, `DATA_STORE` defaults to `postgres`.

---

## Flag-by-flag behavior matrix

### DATA_MODE

Controls whether **price** and **stats** data come from live external APIs
or from in-memory mock data. This is the highest-level mode switch.

| Endpoint | `DATA_MODE=live` (default) | `DATA_MODE=mock` |
|---|---|---|
| `GET /api/prices` | CoinGecko (30 s cache), falls back to stale cache, then static defaults | Static in-memory array (`mockData.prices`) |
| `GET /api/rounds` | Drizzle / Postgres (`hackathon_rounds` table) | **Same** — Drizzle is always used for rounds |
| `GET /api/leaderboard` | Drizzle / Postgres leaderboard table | In-memory seed (`mockLeaderboard`) when `DATA_STORE=memory` |
| `GET /api/stats` | Prisma / Postgres aggregation | `MOCK_PLATFORM_STATS` constants (zero-value defaults) |
| `GET /api/health` | Live Soroban RPC readiness check | Soroban `isReady()` flag only (no RPC call) |

**Implementation:** `src/services/priceService.ts` reads `config.app.dataMode`;
`src/services/stats.service.ts` falls back to `MOCK_PLATFORM_STATS` when the DB
is empty or unreachable.

### BET_STUB_MODE

Controls whether `/api/bets` endpoints submit transactions **on-chain** via
Soroban or just record the intent **locally**.

| `BET_STUB_MODE` | Behavior | Use case |
|---|---|---|
| `true` (default) | Bets recorded locally; no on-chain calls. Returns `{ state: "stub" }`. | Local dev, demos, hackathon — no Soroban keypairs needed |
| `false` | Bets submitted to Soroban smart contract via `sorobanService.placeBet` / `placePrecisionBet`. | Production or Stellar testnet with deployed contract |

**Affected endpoints:** `POST /api/bets/up-down`, `POST /api/bets/precision`

**Implementation:** `src/services/bet.service.ts` (`recordUpDownBet`, `recordPrecisionBet`)

> The active mode is logged at startup:
> `Bet mode: STUB (no on-chain calls)` or `Bet mode: ON-CHAIN (Soroban)`.

### ROUNDS_MOCK_MODE

Controls whether the **round listing** endpoint skips Soroban and the database
and returns mock data immediately.

| `ROUNDS_MOCK_MODE` | Behavior |
|---|---|
| `false` (default) | Fallback chain: **Soroban → Database → Mock**. Tries on-chain first, falls back to DB, then mock data as last resort. |
| `true` | Skips Soroban and database entirely. Returns mock rounds from `getMockRounds()` immediately. |

**Affected endpoints:** `GET /api/rounds/active` (production), `GET /api/rounds` (hackathon)

**Implementation:** `src/services/round.service.ts` (`getRoundsForApi`); checked in both
`src/routes/rounds.routes.ts` and `src/routes/rounds.ts`.

---

## Recommended combinations

### 1. Full local development (no external deps)

```env
DATA_MODE=mock
BET_STUB_MODE=true
ROUNDS_MOCK_MODE=true
```

- No CoinGecko calls, no Soroban, no database required.
- All endpoints return mock data.
- Fastest setup for UI prototyping.

### 2. Database-backed local development (no blockchain)

```env
DATA_MODE=live
BET_STUB_MODE=true
ROUNDS_MOCK_MODE=false
DATABASE_URL=postgresql://...
```

- Real DB, real CoinGecko prices, stub bets.
- Good for testing DB migrations and queries locally.

### 3. Full blockchain testnet

```env
DATA_MODE=live
BET_STUB_MODE=false
ROUNDS_MOCK_MODE=false
SOROBAN_CONTRACT_ID=...
SOROBAN_ADMIN_SECRET=...
SOROBAN_ORACLE_SECRET=...
DATABASE_URL=postgresql://...
```

- Live CoinGecko, on-chain bets, real DB.
- Closest to production.

### 4. Hackathon / demo

```env
DATA_MODE=mock
BET_STUB_MODE=true
ROUNDS_MOCK_MODE=true
```

- No infrastructure needed. Run `npm run dev:hackathon`.

### 5. API-only stateless node (split deployment)

```env
API_ONLY=true
DATA_MODE=live
DATABASE_URL=postgresql://...
```

- Skips oracle polling, schedulers, and price ticker.
- Still serves HTTP and WebSocket transport.

---

## How the flags interact

```
┌──────────────────────────────────────────────────────────────────┐
│                        DATA_MODE                                 │
│  ┌─────────────┐                     ┌──────────────────────┐    │
│  │    mock      │                     │        live          │    │
│  │             │                     │                      │    │
│  │ Prices:     │                     │ Prices: CoinGecko    │    │
│  │   mockData  │                     │ Stats:  Prisma/DB    │    │
│  │ Stats:      │                     │                      │    │
│  │   MOCK_     │                     │                      │    │
│  │   PLATFORM_ │                     │                      │    │
│  │   STATS     │                     │                      │    │
│  └──────┬──────┘                     └──────────┬───────────┘    │
│         │                                       │                │
│         └─────── DATA_STORE ────────────────────┘                │
│                  auto: memory              auto: postgres         │
│                  (can override)            (can override)         │
└──────────────────────────────────────────────────────────────────┘

BET_STUB_MODE (independent of DATA_MODE)
  true  → stub bets (no chain)
  false → on-chain bets via Soroban

ROUNDS_MOCK_MODE (independent of DATA_MODE)
  true  → skip soroban + db, return mock rounds
  false → soroban → db → mock fallback chain
```

The three flags are **independent** — you can mix and match them:

- `DATA_MODE=live` + `BET_STUB_MODE=true` = real prices, stub bets
- `DATA_MODE=mock` + `BET_STUB_MODE=false` = mock prices, on-chain bets
- `ROUNDS_MOCK_MODE=true` + `DATA_MODE=live` = mock rounds, real prices/stats
- etc.

This independence lets you isolate exactly which external services are needed
for your current workflow.

---

## Where to find the implementation

| Flag | Primary implementation file(s) |
|---|---|
| `DATA_MODE` | `src/config/index.ts`, `src/services/priceService.ts`, `src/services/stats.service.ts` |
| `DATA_STORE` | `src/config/index.ts`, `src/repositories/` |
| `BET_STUB_MODE` | `src/services/bet.service.ts` |
| `ROUNDS_MOCK_MODE` | `src/config/index.ts`, `src/services/round.service.ts` |
| Mock data | `src/data/mockData.ts` |

---

## Environment file templates

- **`.env.example`** — Full production-ready template with all flags and documentation.
- **`.env.hackathon.example`** — Minimal template for hackathon/demo mode (mock data, no DB).

Both files are in the repository root and include these flags with inline comments.
