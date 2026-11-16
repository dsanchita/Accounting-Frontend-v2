# HRMS–Accounting Integration: Developer Guide

## Architecture

Both systems are Node.js services on Azure App Service. HRMS owns payroll/claim calculation and approval; Accounting owns the general ledger, mapping configuration, posting, settlement, and reconciliation. The browser never posts to the service integration endpoint and never receives the shared HMAC secret.

```text
HRMS payroll run / final claim approval
  -> immutable source snapshot + durable HRMS outbox
  -> App Service worker signs HTTPS request with HMAC-SHA256
  -> Accounting validates source, mappings, period, and totals
  -> MongoDB transaction: journal + lines + employee subledger + event result
  -> HRMS stores journal status and periodically syncs settlement status
```

No Entra token or message broker is used. Direct REST is authenticated; this is not an unauthenticated/private-network trust model.

## Server-side configuration

| Service | Setting | Purpose |
|---|---|---|
| HRMS backend | `ACCOUNTING_INTEGRATION_URL` | Accounting origin, e.g. `https://accounting.example.com`; local `http://localhost:8000`. Do not add `/api`. |
| HRMS backend | `HRMS_ACCOUNTING_HMAC_SECRET` | Shared random secret, at least 32 bytes. |
| Accounting backend | `HRMS_ACCOUNTING_HMAC_SECRET` | Same secret. |

Use distinct local/test/staging/production secrets. Store production values in Azure App Service settings backed by Key Vault references; never in a frontend `VITE_*` setting, source control, logs, or tickets. Restrict who can read/update the secret. This release has one active secret, so rotate with a coordinated two-App-Service cutover. Production HRMS configuration rejects a non-HTTPS Accounting URL.

The secret identifies the HRMS service, not an individual employee. HMAC does not provide non-repudiation; anyone who obtains the secret can impersonate the service. Azure access restrictions, VNet/private endpoints, Key Vault, and monitoring are defense in depth.

## HMAC request signing

Each request includes:

```http
x-integration-timestamp: <Unix seconds>
x-integration-nonce: <unique random value>
x-integration-signature: <hex HMAC-SHA256>
```

Sign the exact UTF-8 bytes of this canonical string:

```text
<timestamp>\n<nonce>\n<UPPERCASE_METHOD>\n<req.originalUrl>\n<exact_raw_body>
```

For `GET`, the body is empty. The nonce and timestamp are new for every retry and status lookup; the event ID and payload remain stable. Accounting checks a five-minute clock-skew window, compares signatures in constant time, and stores nonces under a unique index with TTL expiry. Both App Services need synchronized clocks. Do not parse/re-serialize a body before signing.

## API endpoints

Current Accounting routes are mounted at `/api/integrations/hrms`:

| Method and route | Authentication / purpose |
|---|---|
| `POST /api/integrations/hrms/payroll-accruals` | HMAC; post a payroll-run accrual. |
| `POST /api/integrations/hrms/claim-accruals` | HMAC; post a finally approved claim. |
| `GET /api/integrations/hrms/events/:eventId` | HMAC; retrieve posting and settlement status after delivery/timeout. |
| `GET /api/integrations/hrms/company/:companyId` | Accounting user with company-scoped JOURNAL VIEW; safe config/account lookup. |
| `GET /api/integrations/hrms/admin/:companyId/mappings` | Accounting administrator with company scope. |
| `PUT /api/integrations/hrms/admin/:companyId/mappings` | Accounting administrator; save mappings. |
| `GET /api/integrations/hrms/payables?companyId=...` | Accounting user with JOURNAL VIEW. |
| `GET /api/integrations/hrms/reconciliation?companyId=...` | Accounting user with JOURNAL VIEW. |
| `POST /api/integrations/hrms/settlements` | Accounting user with JOURNAL CREATE. |
| `GET /api/integrations/hrms/settlements?companyId=...` | Accounting user with JOURNAL VIEW. |
| `POST /api/integrations/hrms/settlements/:settlementId/reversals` | Accounting user with JOURNAL CREATE. |

The service derives its Accounting company from the single active HRMS mapping. It does not trust a company ID from the HRMS payload. Accounting user routes require user authentication, role/permission, and company scope; mapping writes are restricted to Accounting admins.

### Payroll event shape

```json
{
  "eventId": "hrms-payroll-<history-id>",
  "currency": "INR",
  "source": {
    "payrollRunId": "<history-id>",
    "payrollId": "HRMS payroll reference",
    "trackerIds": ["<tracker-id>"]
  },
  "period": { "year": 2026, "month": 9 },
  "employees": [
    {
      "employeeId": "<stable HRMS employee object ID>",
      "employeeCode": "EMP-0042",
      "employeeName": "Frozen employee display name",
      "grossSalaryMinorUnits": 7000000,
      "netPayableMinorUnits": 6200000,
      "deductionsMinorUnits": {
        "pf": 500000,
        "professionalTax": 100000,
        "incomeTax": 200000,
        "leaveWithoutPayDeduction": 0
      },
      "employerBenefitsMinorUnits": {
        "epf": 0,
        "mediclaim": 0,
        "gratuity": 0
      },
      "extraPayMinorUnits": 0
    }
  ]
}
```

HRMS groups rows per employee and freezes the data in the outbox when a payroll history is created. Payroll month is 1-based in this event, and Accounting posts on the period's month-end. Amounts are integer minor units (paisa for INR). Accounting requires each employee's gross to equal net payable plus all supplied employee deductions. Every positive deduction key needs its own liability mapping. Employer EPF, mediclaim, and gratuity are each mapped to an expense and liability. Nonzero `extraPayMinorUnits` is rejected until Bonus, Due, Suspension Cut, and Excess accounting treatment is explicitly approved and configured. The current system uses one currency per configured Accounting company; no FX conversion is performed.

### Claim event

The claim event includes `eventId`, `currency`, `source.claimId`, and a `claim` object containing the HRMS claim ID/reference, employee ID/code/name, HRMS category ID/name, amount in minor units, and final approval timestamp. Claim accrual date is the final approval date. Only final `approved` claims are enqueued.

Account IDs are never sent by HRMS or hard-coded. Accounting admins explicitly map Salary expense, Outstanding Salary, each HRMS deduction key, employer cost/payable pairs, claim payable, claim categories, and allowed bank ledgers. Every mapped account must belong to the configured company and have the expected account-group nature.

## Delivery, idempotency, and status

The HRMS database stores an immutable event snapshot, stable event ID, source ID, attempt state, and journal/status fields. An App Service timer worker claims events with a database lease, signs each REST request, applies exponential retry backoff capped at one hour, and queries event status after timeouts. The source event and payload remain unchanged on every retry.

Accounting stores event ID, source type/ID, payload hash, and result. Unique event/source indexes and a unique HRMS journal source index protect concurrent requests. Journal header, lines, employee payable rows, and `POSTED` event state are written in one MongoDB transaction. MongoDB deployment must support transactions (replica set or compatible cluster); validate this in local/test/staging before enabling production. Transaction/index prerequisites and existing duplicate data must be checked before release.

Responses:

- `201`: newly posted; response includes journal reference.
- `200`: duplicate identical event; original result is returned.
- `202`: same event is processing; poll the same event ID.
- `400/422`: invalid payload, missing mapping, closed period, unreconciled payroll, unmapped extra pay, invalid currency/amount.
- `401`: invalid/stale/replayed HMAC request.
- `403`: company or user authorization denied.
- `409`: event/source idempotency conflict.
- `5xx`/network timeout: outcome may be unknown; query status, then retry with the same event and payload.

Event status includes the posted journal ID/number and payable totals. HRMS polls this endpoint to display `OPEN`, `PARTIAL`, `SETTLED`, or `NOT_APPLICABLE` settlement state. HRMS approval does not mean payment. The old HRMS direct `/pay` status update now returns a conflict; payment must be entered in Accounting.

Accounting settlement creates a payment journal (debit employee payable allocations, credit the selected configured bank asset account), captures payment date/reference and supports partial/multiple employee allocations. Partial/full reversals create linked, new journals; posted journals and allocations are not deleted or overwritten. The reconciliation view compares the open employee subledger to its control-account GL balance. Differences require investigation; no balancing plug is created.

## Operational monitoring and tests

Log event ID, source type, attempt, outcome, duration, and journal ID; never log secret headers, full payroll payloads, employee tax identifiers, or receipt content. Alert on stale outbox items, repeated auth/config/validation failures, idempotency conflicts, transaction/index errors, and nonzero subledger-to-GL differences.

Minimum automated coverage:

1. Gross/net/deduction reconciliation, all supplied deduction keys, invalid amounts, extra-pay rejection, balanced/unbalanced journals.
2. Same event retry, concurrent delivery, same event ID with changed body, timeout after commit and status lookup.
3. Missing/wrong-company/wrong-nature mappings, currency mismatch, closed period, invalid source uniqueness.
4. Final claim approval versus intermediate/rejected/cancelled status.
5. Partial/multiple employee settlement, idempotent settlement, partial/full reversal, and GL/subledger reconciliation.
6. HMAC invalid signature, timestamp expiry, nonce replay, company-scope/permission denial.

## Rollout and rollback

1. Provision separate non-production HMAC secrets and HTTPS URLs; confirm Accounting MongoDB transactions and indexes work.
2. Accounting admin selects one company, currency, closed-through date, allowed bank ledgers, every payroll/benefit/claim account, and a liability ledger for each HRMS deduction key.
3. Reconcile existing Outstanding Salary and Claims Payable opening balances to employees/claims before posting new events. No automatic backfill is performed.
4. Test with a non-production payroll and claim. Confirm event-to-journal references, settlements, reversals, and zero reconciliation differences.
5. During rollout, avoid posting the same HRMS run manually and through integration. Monitor outbox and status polling. Start with one company and a controlled period.
6. To roll back, disable the HRMS outbox worker/configuration. Do not delete posted entries. Investigate and post linked reversals/adjustments where needed.

## Known release boundaries

- One active Accounting company mapping and one currency per company.
- Payroll with nonzero extraPay is blocked pending accountant treatment/mapping.
- Historical payroll/claims are not backfilled automatically.
- Payroll snapshot/outbox creation is tied to current payroll-run completion; broader HRMS run-approval locking and immutable edit/version workflows need review before production use.
- HMAC secret rotation requires a coordinated cutover; overlapping key rotation is not implemented.
- Current automated tests cover the pure payroll/journal rules and canonical HMAC signing only. Database transaction/concurrency, timeout-after-commit, settlements/reversals, authorization, and GL/subledger reconciliation still require integration tests before production.
- New collections and unique/TTL indexes must be provisioned after checking for duplicate source/event data. No production index migration or historical subledger backfill script is included.
