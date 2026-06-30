# PayOnProof (POP)

PayOnProof is a Stellar-powered payment orchestration layer for cross-border transfers.
It compares available anchor routes, starts real SEP-10 / SEP-24 flows, lets the user
sign with Freighter, and generates a verifiable Proof of Payment backed by on-chain data.

POP is not a bank, not a marketplace, and not a custodial wallet. It is the layer that
helps small businesses and freelancers see the real cost of a transfer before they send it.

## The Problem

Small businesses and freelancers in Latin America often lose **3% to 8% per international
payment** because the real cost of a transfer is fragmented across:

- Hidden FX spreads
- Correspondent banking fees
- Slow and unpredictable settlement times
- Poor visibility into the final received amount
- Manual reconciliation after the payment is complete

Stellar anchors can offer better rails, but integrating each anchor separately is too
technical for most teams. Every anchor can expose different assets, SEP support, KYC
requirements, geographic coverage, limits, and transaction states.

The result is simple: teams overpay, wait longer, and still have to prove that a payment
actually happened.

## The POP Approach

POP gives the user one clear flow:

```text
Choose corridor -> Compare anchor routes -> Sign with Freighter -> Complete anchor steps -> Verify on-chain proof
```

Behind that simple flow, POP:

- Reads supported countries and currencies from the live anchor catalog.
- Compares available routes by fee, expected time, asset, and network.
- Runs SEP-10 authentication with selected anchors.
- Starts SEP-24 interactive deposit / withdrawal flows.
- Uses Freighter for user-controlled Stellar signatures.
- Polls anchor status until a Stellar transaction is available.
- Generates a Proof of Payment from the final transaction hash.

## Current Release

The current app is focused on **Stellar testnet execution** with real anchor flows.
The most reliable tested route is:

```text
OwlPay Harbor Stage -> OwlPay Harbor Stage
```

The demo flow supports:

- Testnet route discovery
- Freighter wallet connection and signing
- Anchor-hosted KYC / bank information screens
- SEP-24 transaction status polling
- On-chain transaction verification
- Proof-of-payment display and download/share actions
- Admin anchor catalog management

## Product Flow

1. The user selects origin country, destination country, and amount.
2. POP loads available anchor routes from the API.
3. The user picks a route.
4. POP prepares SEP-10 challenges and any required trustline transaction.
5. The user signs with Freighter.
6. POP opens the origin deposit and destination withdrawal anchor links.
7. The user completes the anchor-hosted steps.
8. POP checks anchor status.
9. If an anchor requires an on-chain user payment, POP prepares a Freighter transaction.
10. POP submits the signed transaction and generates a verifiable payment proof.

## Architecture

```text
payonproof/
  services/
    web/                  Next.js frontend
      app/                App routes
      components/         UI and feature components
      hooks/              React hooks
      lib/                API clients, wallet helpers, shared types
      public/             Static assets

    api/                  Vercel serverless API
      api/                HTTP endpoints
      lib/                Stellar, Supabase, CORS, route logic
      scripts/            Anchor import/export/sync tooling
      sql/                Supabase schema migrations
```

### Service Responsibilities

| Service | Path | Responsibility |
| --- | --- | --- |
| Web | `services/web` | User interface, route selection, wallet connection, Freighter signing, proof display |
| API | `services/api` | Anchor catalog, SEP-10, SEP-24, route comparison, transaction submission, proof generation |
| Supabase | external | Anchor catalog, callback events, remittance records |
| Stellar | external | Testnet/mainnet settlement and transaction verification |

## Key Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | API health check |
| `/api/env-check` | `GET` | Deployment/env diagnostic summary |
| `/api/anchors/countries` | `GET` | List supported countries from active anchors |
| `/api/anchors/catalog` | `GET` | Inspect active anchor catalog entries |
| `/api/anchors/diagnostics` | `GET` | Anchor capability diagnostics |
| `/api/anchors/ops` | `GET/POST` | Anchor sync/ops endpoint |
| `/api/compare-routes` | `POST` | Compare available transfer routes |
| `/api/execute-transfer` | `POST` | Prepare, authorize, poll, and submit transfer flow |
| `/api/generate-proof` | `POST` | Generate proof from a Stellar transaction |
| `/api/admin/[...admin]` | `POST/GET` | Admin login/session/catalog operations |
| `/api/anchors/sep24/callback` | `POST` | Anchor callback receiver |

## Local Development

Run the web and API services in separate terminals.

<details>
<summary>Frontend</summary>

```bash
cd services/web
npm install
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

Required local env file:

```text
services/web/.env.local
```

Start from:

```text
services/web/.env.example
```

</details>

<details>
<summary>API</summary>

```bash
cd services/api
npm install
npm run dev
```

Default local URL:

```text
http://localhost:3001
```

Required local env file:

```text
services/api/.env
```

Start from:

```text
services/api/.env.example
```

</details>

## Environment Notes

Do not commit real secrets. Keep production values in Vercel environment variables.

Important API variables:

```text
POP_ENV
WEB_ORIGIN
CORS_ALLOWED_ORIGINS
SEP10_CLIENT_DOMAIN
SEP10_CLIENT_DOMAIN_SIGNING_SECRET
EXECUTION_STATE_SECRET
ANCHOR_CALLBACK_SECRET
CRON_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
STELLAR_HORIZON_URL
STELLAR_NETWORK_PASSPHRASE
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANCHOR_ALLOWED_ASSETS
ANCHOR_CATALOG_FALLBACK
FX_PROVIDER_URL
FX_FALLBACK_RATE
```

Important web variables:

```text
NEXT_PUBLIC_POP_ENV
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_APP_URL
```

For testnet development, Freighter must be set to Stellar Testnet. For production/mainnet
flows, Freighter must be set to Stellar Mainnet.

## Anchor Catalog

POP uses the `anchors_catalog` table in Supabase as the source of truth for route discovery.

Schema files:

```text
services/api/sql/000_apply_schema.sql
services/api/sql/001_anchors_catalog.sql
services/api/sql/002_anchors_catalog_capabilities.sql
services/api/sql/003_anchor_callback_events.sql
services/api/sql/004_anchors_catalog_network.sql
```

Useful scripts:

```bash
cd services/api

# Import from a curated seed file
npm run anchors:seed:import -- --file ./scripts/anchor-seeds.pop.json --apply

# Import testnet anchors
npm run anchors:seed:import -- --file ./scripts/anchor-seeds.testnet.json --apply

# Try automatic directory sync
npm run anchors:auto:sync -- --apply
```

The API also exposes anchor operations through `/api/anchors/ops`. In Vercel, the API
project runs this endpoint on a scheduled cron defined in `services/api/vercel.json`.

## Security Model

- The frontend never receives Supabase service-role keys.
- The backend never signs user wallet transactions with a backend wallet.
- Freighter remains the signing authority for user-controlled funds.
- SEP-10 challenge signing is done by the user wallet.
- SEP-24 interactive KYC and compliance stay with the selected anchor.
- POP stores operational metadata and proof records, not long-term custody of funds.
- Anchor callbacks are protected with shared callback secrets.
- Admin routes require login credentials configured through environment variables.

## On-Chain vs Off-Chain

| Layer | Data |
| --- | --- |
| On-chain | Stellar transaction hash, source account, destination account, asset, amount, timestamp |
| Off-chain | Route selection, anchor metadata, UI state, proof display, operational logs |

The proof layer links the user-facing payment record to the Stellar transaction that can be
verified independently.

## Testnet Reality Check

Testnet anchors are real integration targets, but they are not always production-quality.
They may enforce test KYC limits, daily quotas, incomplete metadata, or staging-only behavior.

Known practical notes:

- Some anchors expose SEP-24 but do not complete every corridor.
- Some anchors require a wallet/domain allowlist before SEP-10 or SEP-24 works.
- Some test UIs display bank-form fields even when the data is only for sandbox validation.
- A route should be considered working only after POP produces a verified Stellar proof.

## Deployment

This repo is deployed as two Vercel projects:

| Project | Root directory |
| --- | --- |
| Web | `services/web` |
| API | `services/api` |

The web project must point `NEXT_PUBLIC_API_BASE_URL` to the API project URL.
The API project must allow the web origin through `WEB_ORIGIN` and `CORS_ALLOWED_ORIGINS`.

## Validation Commands

```bash
# API
cd services/api
npm run typecheck

# Web
cd services/web
npm run lint
```

## Roadmap

- Expand the number of verified testnet anchors.
- Add clearer per-anchor status messages.
- Improve route scoring using real limits and liquidity signals.
- Add production-ready observability for anchor failures.
- Support more corridors as anchors become operational.
- Harden admin operations and audit logging.

## License

Private project.
