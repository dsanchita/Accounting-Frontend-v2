# HRMS Payroll and Claims → Accounting Integration Roadmap

**Status:** Implementation baseline exists; production rollout remains gated on the controls and open items below.  
**Repositories:** HRMS backend/frontend and Accounting backend/frontend. The active Accounting backend checkout is `Accounting_Backend_v2`.  
**Transport decision:** Direct HTTPS REST, HMAC-SHA256 server-to-server authentication, no Entra access token, no message broker.

> The accountant/CA must approve the ledger mapping and opening-balance reconciliation before production posting. Do not treat this implementation document as statutory or tax advice.

## 1. Accounting model

The existing Salary (expense) and Outstanding Salary (current liability) accounts are an appropriate starting point. Keep Outstanding Salary as a single GL control account and maintain employee balances in an employee payable subledger linked to posted journal lines. Do not create a GL account per employee or misuse client/vendor links.

### Payroll accrual

For each employee, Accounting posts:

- Debit mapped salary expense for gross salary.
- Credit Outstanding Salary for employee net payable, with employee-level subledger allocations.
- Credit a separately mapped liability for every supplied employee deduction component.
- For employer EPF, mediclaim, and gratuity, debit the mapped employer expense and credit the mapped payable.

Payroll must reconcile per employee: **gross = net payable + all supplied employee deductions**. Reject mismatches; do not create a balancing plug. HRMS currently adjusts net for attendance/leave while some deduction fields remain template values, so runs that do not reconcile will be rejected until HRMS supplies explicit accounting deduction data.

Nonzero tracker `extraPay` (Bonus, Due, Suspension Cut, Excess) is rejected. It is not safe to silently treat all types as salary expense, deduction, or payable. Add per-type accounting behavior only after accountant approval and explicit mappings.

### Claim recognition

On final HRMS claim approval, debit the explicitly mapped expense account for the HRMS category and credit Employee Claims Payable, with employee and claim details. The accounting date is the final claim approval date. Intermediate, rejected, and cancelled claims must not post. Claim payment is a separate settlement.

### Settlement

Accounting records actual bank payment evidence: payment date, reference/UTR, selected configured bank ledger, and employee/claim allocations. Debit the employee payable and credit bank. Partial and multiple-employee settlements are supported. A posted payment reversal is a new linked journal and restores only the reversed employee payable balances; never delete or overwrite a posted entry.

### Confirmed policy and scope

- One Accounting company mapping for the first release; company/account scope is enforced on the server.
- One configured currency per company; API uses integer minor units and rejects currency mismatch. No foreign-exchange conversion.
- Payroll posting date is payroll period month-end. Claim posting date is final approval date. Payment uses the actual Accounting-entered payment date.
- Closed-through dates reject posting; no silent shifting into a later period.
- HRMS approval/legacy `Paid` is not proof of bank settlement. Accounting is authoritative for payment settlement.
- Accounting admins configure mappings; users with existing JOURNAL VIEW/CREATE permission view payables/reconcile and post settlements.
- A liability ledger must be selected for each HRMS deduction key. Account names and IDs are configured, never hard-coded.

## 2. Current implementation baseline

### Accounting backend

- HMAC middleware verifies exact raw-body requests, timestamp, nonce, and signature; replay nonces are stored under a TTL/unique index.
- Service endpoints post payroll/claim accruals and return persistent event status.
- Event uniqueness and journal source uniqueness protect idempotency; journal header/lines, employee payable subledger, and event result are committed in a MongoDB transaction.
- Mapping endpoints validate account ownership and account-group nature.
- Employee payable settlement supports partial/multiple allocations and actual bank references. Linked full/partial settlement reversals create new journals.
- Reconciliation endpoint compares employee subledger open balances to the control-account GL balance.
- MongoDB deployment must support transactions (replica set or compatible cluster). Validate database transaction behavior and index creation in staging.

### HRMS backend/frontend

- Payroll-run completion creates an immutable outbox snapshot and a worker retries REST delivery; the HRMS UI shows accrual and settlement statuses.
- Final claim approval creates the claim outbox event; HRMS stores Accounting journal and status fields.
- The old direct HRMS `/pay` operation no longer marks trackers settled; HRMS approver status is distinct from Accounting settlement.
- Outbox snapshots include a list of tracker IDs for status updates and aggregate tracker amounts per employee.

### Accounting frontend

- HRMS Payroll & Claims screen provides company mappings, open payable allocations, partial/multiple employee settlements, settlement reversals, and GL/subledger reconciliation.
- Browser calls Accounting's authenticated user APIs only. It never signs or sends HMAC requests.

## 3. HMAC REST contract

HRMS server settings:

- `ACCOUNTING_INTEGRATION_URL` — Accounting origin, e.g. `https://accounting.example.com`; local `http://localhost:8000`.
- `HRMS_ACCOUNTING_HMAC_SECRET` — high-entropy secret, minimum 32 bytes.

Accounting server setting:

- `HRMS_ACCOUNTING_HMAC_SECRET` — same secret.

Store production values in Azure App Service settings/Key Vault references. Use separate secrets for local, test, staging, and production. Never use a `VITE_*` setting, commit a secret, or log request headers. Production HRMS refuses a non-HTTPS URL. Secret rotation requires a coordinated cutover; overlapping secrets are not yet supported.

Each request has `x-integration-timestamp`, `x-integration-nonce`, and `x-integration-signature`. HMAC-SHA256 signs:

```text
<timestamp>\n<nonce>\n<UPPERCASE_METHOD>\n<req.originalUrl>\n<exact_raw_body>
```

For GET, body is empty. The nonce and timestamp change on each retry; the event ID and payload do not. Accounting enforces five-minute clock skew, constant-time signature comparison, and nonce replay prevention. HMAC authenticates the HRMS service but does not provide non-repudiation. Protect the secret and use HTTPS.

Accounting routes mounted under `/api/integrations/hrms`:

| Route | Purpose |
|---|---|
| `POST /payroll-accruals` | Validate and post payroll-run accrual. |
| `POST /claim-accruals` | Validate and post final-approved claim accrual. |
| `GET /events/:eventId` | Return posting and settlement status for timeout recovery and HRMS status sync. |
| `GET /company/:companyId` | Authenticated company-scoped account/config lookup. |
| `GET/PUT /admin/:companyId/mappings` | Accounting administrator mapping read/write. |
| `GET /payables` | List employee payables. |
| `GET /reconciliation` | Compare employee subledger and control-account GL. |
| `POST /settlements` | Record actual full/partial/multiple employee payment allocations. |
| `GET /settlements` | Recent settlement history for reversal review. |
| `POST /settlements/:settlementId/reversals` | Create linked full/partial settlement reversal. |

Payroll event amount fields use integer minor currency units. Example employee shape:

```json
{
  "employeeId": "HRMS employee object ID",
  "employeeCode": "EMP-0042",
  "employeeName": "Frozen employee name",
  "grossSalaryMinorUnits": 7000000,
  "netPayableMinorUnits": 6200000,
  "deductionsMinorUnits": {
    "pf": 500000,
    "professionalTax": 100000,
    "incomeTax": 200000
  },
  "employerBenefitsMinorUnits": {
    "epf": 0,
    "mediclaim": 0,
    "gratuity": 0
  },
  "extraPayMinorUnits": 0
}
```

Payroll's source contains a stable payroll history ID, run reference, and tracker IDs; month is 1-based. Claim source contains stable claim ID/reference and a `claim` object with employee, category, amount, currency, and final approval date. Account IDs/company IDs are not chosen by the HRMS caller.

## 4. Delivery and idempotency

HRMS writes an immutable payload to its outbox, then a timer worker claims it under a database lease. The worker retries with exponential backoff capped at one hour. On an uncertain timeout, it queries Accounting by the same event ID before resending. Accounting hashes the payload and enforces unique event/source keys; an event ID reused with a different payload is a conflict. The Accounting transaction commits journal header, journal lines, employee payable rows, and the event result together.

Accounting returns `201` for a new posting, `200` for an identical posted duplicate, `202` for an event already being processed, and validation/auth/conflict responses as appropriate. HRMS polls event status and mirrors Accounting journal ID, accrual state, and employee-payable `OPEN`/`PARTIAL`/`SETTLED` state. Do not interpret HRMS `Paid` as a payment.

## 5. Production gaps / backfill requirements

1. Confirm with the accountant the exact HRMS payroll deduction keys and their liability ledgers; the current UI supports dynamic deduction keys. Confirm the three employer benefit expense/payable pairs.
2. Resolve HRMS payroll run finalization/edit locking. Current event trigger is payroll-run completion, not a fully modeled accounting approval/immutable version workflow.
3. Decide and configure accounting treatment for Bonus, Due, Suspension Cut, and Excess before allowing runs containing them. Until then, those events reject and retry after mapping/configuration correction.
4. Reconcile historical Outstanding Salary and Claims Payable GL balances employee-by-employee before beginning new subledger postings. There is no automatic legacy backfill.
5. Confirm the MongoDB transaction-capable topology and run migrations/index creation safely. Check for duplicate event/source/settlement keys before adding unique indexes.
6. Confirm the Accounting app's `JOURNAL` permissions and company scope for mapping admins, settlement users, and reconciliation viewers.
7. HMAC overlap/automatic secret rotation and independent audit/alert delivery are not implemented.

## 6. Test and rollout plan

Test balanced gross/net/deduction and employer-benefit postings, dynamic deduction mappings, duplicates/concurrency, timeout/status recovery, extraPay rejection, invalid company/mapping/period/currency, claim approval vs payment, partial/multiple settlements, reversal limits, and GL/subledger reconciliation. Test HMAC invalid signature, timestamp expiry, nonce replay, and normal user permission checks. Run in a non-production company before any live posting.

Roll out in this order:

1. Configure separate non-production HMAC secrets, HTTPS, and transaction-capable MongoDB.
2. Configure company, currency, closed-through date, allowed bank ledgers, all payroll/claim mappings, and every HRMS deduction key.
3. Reconcile existing liability opening balances and decide the go-live period.
4. Run test payroll/claim, settlement, partial payment, and reversal; compare journals and subledgers.
5. Start with one company and one controlled period; monitor outbox, event statuses, and reconciliation.
6. Roll back by disabling HRMS event delivery. Never delete posted journals; use linked reversals/adjustments.

## 7. Implementation prompt for future work

> Continue the HRMS-to-Accounting integration in the current four repositories. Use direct HTTPS REST signed with server-only HMAC-SHA256; do not add Entra tokens or a broker. Preserve unrelated work. Do not post from the browser, create one account per employee, assume HRMS `Paid` proves settlement, or guess account mappings. Before any new journal behavior, confirm missing accounting decisions. Finish the production gaps in this roadmap, add targeted tests, run build/type-check/lint in touched repositories, document migrations and rollback, and do not commit unless explicitly asked.
