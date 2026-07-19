# User Payout Management System

A Low-Level Design + working implementation of a payout engine for affiliate sales — handles
advance payouts, post-reconciliation final payouts, withdrawal restrictions, and failed-payout
recovery.

---
## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- dotenv
- Nodemon

## 1. Problem Recap

- Every sale starts as `pending`.
- A `pending` sale is eligible for an **advance payout of 10% of its earning**.
- Later, an admin reconciles each sale to `approved` or `rejected`.
- On reconciliation:
  - **Approved** → user gets `earning - advanceAmount`
  - **Rejected** → the advance already paid is **recovered** (negative adjustment)
- A user can withdraw only **once every 24 hours**.
- If a withdrawal later fails/is cancelled/rejected, the amount must be **credited back** to the
  user's withdrawable balance, and the user must be able to withdraw it again.

---

## 2. High-Level Architecture

```
Client / Admin
      │
      ▼
Express Routes  →  Controllers  →  Services  →  Mongoose Models  →  MongoDB
                                       │
                                       └── all business logic lives here
```

- **Routes** — thin, just map HTTP verb/path to controller.
- **Controllers** — parse request, call service, shape HTTP response, forward errors to the
  central error handler.
- **Services** — all business rules (advance calculation, reconciliation, withdrawal rules) live
  here, independent of Express.
- **Models** — Mongoose schemas, one per entity, with light validation and useful indexes.

This separation means the core payout logic (`advancePayoutService`, `reconciliationService`,
`withdrawalService`) can be unit-tested or reused (e.g. from a cron job) without touching HTTP at
all.


---

## Error Handling

Controllers do not send error responses directly. Instead, they forward exceptions using `next(err)`.

A centralized Express error middleware handles all uncaught errors and returns a consistent JSON response:

```json
{
  "success": false,
  "message": "Error message"
}
```
This keeps controllers focused on request handling, avoids duplicated error-handling code, and ensures a consistent API response format across the application.

## 3. Entities & Relationships

```
User (1) ──── (1) Wallet
User (1) ──── (N) Sale
User (1) ──── (N) Withdrawal
User/Sale (1) ── (N) Transaction     (immutable ledger of every money movement)
```

### User
| Field | Type | Notes |
|---|---|---|
| name | String | required |
| email | String | required, unique |

### Wallet
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId → User | unique (1:1 with User) |
| withdrawableBalance | Number | current spendable balance, default 0 |

Kept **separate from User** deliberately — balance changes far more often than profile data, and
keeping it isolated makes it easy to lock/version just the money-relevant document later (e.g.
via `findOneAndUpdate` + `$inc`, or transactions) without touching user profile writes.

### Sale
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId → User | indexed |
| brand | String | free text (schema allows any brand; can be constrained to an enum if the brand list is fixed) |
| earning | Number | ≥ 0 |
| status | enum: `pending` \| `approved` \| `rejected` | indexed, default `pending` |
| advancePaid | Boolean | default `false` — guards against double advance payout |
| advanceAmount | Number | default `0` — snapshot of what was actually advanced, used at reconciliation time |
| reconciled | Boolean | default `false` — guards against double reconciliation |

**Why `advanceAmount` is stored on the sale itself, not recomputed:** the 10% rate is applied
*at the moment the advance job runs*. If the business rate ever changes later, recomputing
`earning * 0.10` at reconciliation time would silently use the *new* rate on old advances and
produce wrong numbers. Storing the actual amount paid makes reconciliation rate-change-proof.

### Withdrawal
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId → User | |
| amount | Number | |
| status | enum: `SUCCESS` \| `FAILED` | default `SUCCESS` |

### Transaction (ledger)
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId → User | |
| saleId | ObjectId → Sale | optional (withdrawals/refunds have no sale) |
| type | enum: `ADVANCE` \| `FINAL` \| `RECOVERY` \| `WITHDRAWAL` \| `REFUND` | |
| amount | Number | can be negative (e.g. `RECOVERY`) |
| description | String | human-readable audit note |

Every balance-affecting event writes a `Transaction` row. This is the audit trail — wallet
balance is a *derived, cached* number; the transaction ledger is the source of truth for "how did
we get to this balance," and lets support/finance reconstruct any user's history.

---

## Class / Module Design

The system follows a layered architecture:

- Routes → define HTTP endpoints.
- Controllers → validate requests and delegate work.
- Services → contain business rules and workflows.
- Models → Mongoose schemas representing User, Wallet, Sale, Withdrawal, and Transaction.
- Middleware → centralized error handling.

This separation keeps business logic independent of Express and improves maintainability and testability.

---

## 4. Core Business Logic

### 4.1 Advance Payout (`advancePayoutService.runAdvancePayout`)

1. Find all sales where `status = pending AND advancePaid = false`.
2. Group by user.
3. For each sale: `advance = earning * 0.10`, mark `advancePaid = true`, store `advanceAmount`,
   write an `ADVANCE` transaction.
4. Credit the user's wallet with the sum of advances for that run.

**Idempotency:** re-running this job is safe — the `advancePaid: false` filter means an already-
advanced sale is never picked up again, even if the job is triggered multiple times (as the spec
explicitly requires).

### 4.2 Reconciliation (`reconciliationService.reconcileSales`)

1. Find all sales where `reconciled = false AND status IN (approved, rejected)`.
   *(Note: this intentionally does **not** filter on `advancePaid` — see Edge Cases §5.1.)*
2. Group by user.
3. For each sale:
   - `approved` → `amount = earning - advanceAmount`, type `FINAL`
   - `rejected` → `amount = -advanceAmount`, type `RECOVERY`
4. Mark `reconciled = true`, write the transaction, accumulate the adjustment.
5. Apply the total adjustment to the user's wallet.

Verified against the spec's worked example:

| Sale | Earning | Advance | Adjustment |
|---|---|---|---|
| Rejected | ₹40 | ₹4 | −₹4 |
| Approved | ₹40 | ₹4 | +₹36 |
| Approved | ₹40 | ₹4 | +₹36 |
| **Total** | | | **₹68** ✅ |

### 4.3 Withdrawals (`withdrawalService`)

- `createWithdrawal(userId, amount)`:
  1. Check the user's **last successful** withdrawal timestamp — reject if < 24h ago.
  2. Atomically deduct balance only if `withdrawableBalance >= amount` (single
     `findOneAndUpdate` with `$gte` + `$inc` — no separate read/check/write steps).
  3. Create the `Withdrawal` record and a `WITHDRAWAL` transaction.
- `failWithdrawal(withdrawalId)`:
  1. Atomically flip the withdrawal from `SUCCESS → FAILED` (only if it is currently `SUCCESS` —
     this makes double-failing the same withdrawal a no-op error instead of a double-refund).
  2. Credit the amount back to the wallet via atomic `$inc`.
  3. Write a `REFUND` transaction.

---

## 5. Edge Cases & Failure Scenarios Considered

### 5.1 Sale reconciled before the advance job ever ran
If a sale is created and reconciled (approved/rejected) *before* `runAdvancePayout` ever touches
it, `advancePaid` is still `false` and `advanceAmount` is still `0`. Because reconciliation no
longer filters on `advancePaid`, this sale is still picked up: an approved sale correctly pays out
the **full earning** (`earning - 0`), and a rejected sale correctly recovers **₹0** (nothing was
advanced, so nothing to claw back). Without this, such sales would be silently skipped and the
user's money permanently lost.

### 5.2 Advance-payout job run twice on the same data
Handled by the `advancePaid: false` filter — second run finds nothing for already-processed
sales. No double payment.

### 5.3 Withdrawal request larger than the wallet balance
`findOneAndUpdate` includes `withdrawableBalance: { $gte: amount }` in its filter. If the balance
is insufficient, the update matches nothing, returns `null`, and the service throws
`"Insufficient balance"` — the wallet is never touched.

### 5.4 Two withdrawal requests fired concurrently (double-spend attempt)
The balance check-and-deduct is a **single atomic MongoDB operation**
(`findOneAndUpdate` with `$gte` + `$inc`), not a separate read-then-write. MongoDB guarantees
this is applied atomically per document, so two concurrent requests cannot both pass the balance
check against the same stale balance and jointly overdraw the wallet.

*(Known residual gap: the 24-hour cooldown check and the atomic balance deduction are still two
separate steps, so two concurrent requests could in theory both pass the cooldown check before
either withdrawal is recorded — over-frequent withdrawals, not overdraw. Closing this fully would
require wrapping the whole flow in a multi-document transaction — see §6.)*

### 5.5 A withdrawal is later reported as cancelled/failed
`failWithdrawal` credits the wallet back via atomic `$inc` and flips status to `FAILED` in one
conditional atomic update (`findOneAndUpdate` with `status: "SUCCESS"` in the filter). This means:
- Calling `failWithdrawal` twice on the same withdrawal throws an error the second time
  (filter no longer matches → no double-refund).
- The user's **next `createWithdrawal` call is not blocked by the 24h rule because of the failed
  withdrawal** — the cooldown check only looks at withdrawals with `status: "SUCCESS"`.

### 5.6 Duplicate sale statuses / re-reconciling
`Sale.status` can only move `pending → approved` or `pending → rejected` (the sale controller
rejects status updates on a sale that isn't currently `pending`). Once `reconciled = true`, the
reconciliation query's `reconciled: false` filter excludes it from being processed again.

### 5.7 Negative/garbage input
`Sale.earning` has `min: 0` at the schema level. `Wallet.withdrawableBalance` intentionally does
**not** have a `min: 0` constraint — see §6 for why negative balances are a valid "amount owed"
state. `Sale.status` and `Withdrawal.status` are constrained via `enum`.

---

## 6. Known Trade-offs (things deliberately not done, and why)

- **No multi-document DB transactions.** `runAdvancePayout` and `reconcileSales` update several
  `Sale` documents and then the `Wallet` document as separate writes. If the process crashes
  mid-loop, a sale could end up marked `advancePaid`/`reconciled` without the wallet balance
  reflecting it. The fully correct fix is wrapping each user's batch in a MongoDB session
  (`session.withTransaction`), but that requires MongoDB to be running as a **replica set**
  (transactions aren't supported on a standalone `mongod`). This was consciously skipped to keep
  local setup/deployment simple for this assignment; in a production system handling real money,
  this would not be an acceptable trade-off and should be added.
- **Withdrawal atomicity is single-document only** (see §5.4's residual gap), for the same reason.
- **Brand is a free-text field**, not constrained to `brand_1/2/3`. The assignment explicitly
  allows modifying the reference schema, and hardcoding brand IDs seemed like premature
  restriction; can trivially be changed to an `enum` if the brand list is genuinely fixed.
- **No authentication/authorization layer.** Out of scope for the assignment's LLD focus, but a
  real system would need to ensure only admins can call `/sales/:id/status` and
  `/payouts/reconcile`, and users can only withdraw from their own wallet.
- **Wallet balance can go negative.** If a user has already withdrawn an advance and the
  corresponding sale is later rejected, the recovery adjustment can push
  `withdrawableBalance` below zero. This is treated as an intentional "amount owed" state
  rather than an error — the `min: 0` constraint was deliberately removed from the Wallet
  schema so reconciliation never fails mid-way. The withdrawal flow's `$gte: amount` check
  still prevents any new withdrawal while the balance is negative, so this can't be
  exploited — it just means future advances/final payouts will first offset the debt.
---

## 7. API Reference

### Users
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/users` | `{ name, email }` | Create a user (also provisions their Wallet) |

### Sales
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/sales` | `{ userId, brand, earning }` | Create a sale (starts as `pending`) |
| GET | `/sales` | — | List all sales |
| PATCH | `/sales/:id/status` | `{ status: "approved" \| "rejected" }` | Reconcile a single sale's status |

### Payouts
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/payouts/advance` | — | Run the advance-payout job across all eligible pending sales |
| POST | `/payouts/reconcile` | — | Run reconciliation across all approved/rejected, not-yet-reconciled sales |

### Withdrawals
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/withdrawals` | `{ userId, amount }` | Request a withdrawal (subject to 24h rule + balance check) |
| PATCH | `/withdrawals/:id/fail` | — | Mark a withdrawal as failed/cancelled and refund the wallet |

---

## 8. Setup

```bash
npm install
cp .env.example .env   # set MONGO_URI, PORT
npm run dev             # nodemon, local dev
npm start                # production
```

### Worked example (matches the assignment's sample scenario)

```bash
# 1. Create a user
curl -X POST localhost:5000/users -d '{"name":"John","email":"john@x.com"}' -H "Content-Type: application/json"

# 2. Create 3 pending sales of ₹40 each for that user (repeat with the returned userId)
curl -X POST localhost:5000/sales -d '{"userId":"<id>","brand":"brand_1","earning":40}' -H "Content-Type: application/json"

# 3. Run advance payout → wallet credited ₹12 (10% of ₹120 total)
curl -X POST localhost:5000/payouts/advance

# 4. Reconcile: 1 rejected, 2 approved
curl -X PATCH localhost:5000/sales/<saleId1>/status -d '{"status":"rejected"}' -H "Content-Type: application/json"
curl -X PATCH localhost:5000/sales/<saleId2>/status -d '{"status":"approved"}' -H "Content-Type: application/json"
curl -X PATCH localhost:5000/sales/<saleId3>/status -d '{"status":"approved"}' -H "Content-Type: application/json"

# 5. Run reconciliation → wallet balance becomes ₹68 total final payout
curl -X POST localhost:5000/payouts/reconcile
```