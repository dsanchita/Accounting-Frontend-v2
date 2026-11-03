# HRMS and Accounting: User Guide

## What this integration does

The integration transfers approved payroll and claim accounting information from HRMS to Accounting so that accountants can see the related expense and amounts owed. The transfer happens securely between the two systems; users do not need to copy payroll totals into a journal by hand.

The integration does **not** make a bank payment. Posting a payroll or approved claim creates an accounting liability. The liability is reduced only when the payment is recorded and confirmed in Accounting.

## Payroll: what users should expect

1. HR prepares and checks the payroll in HRMS.
2. The authorized approver approves/finalizes the payroll run.
3. When HRMS completes the payroll run, it freezes the payroll snapshot and queues it for Accounting. HRMS approval/legacy `Paid` is not proof of settlement.
4. Accounting validates the company's account mappings and accounting period, then records the payroll journal.
5. The journal creates an amount due to each employee in the Outstanding Salary employee detail. Any statutory amounts are recorded separately according to the accountant-approved setup.
6. When salary is actually paid, an Accounting user records the employee allocations, actual bank ledger, date, and bank reference in **HRMS Payroll & Claims**. A partial payment leaves the unpaid balance open.

Payroll is rejected if each employee's gross does not equal net pay plus every supplied deduction. The accountant must map each deduction component to its own liability ledger. Bonus, Due, Suspension Cut, or Excess extraPay currently blocks payroll posting until its accounting treatment has been configured.

### Simple example

If approved payroll creates ₹7,00,000 of salary expense, Accounting records the debit to the configured salary expense account and credits the correct liabilities. In the simple case with no deductions, Outstanding Salary is credited by ₹7,00,000 and employee-wise detail shows how much is owed to each person.

If there are deductions, the employee payable is generally the approved net amount—not automatically the gross salary. Statutory deductions and employer costs follow the accountant-approved mappings. The example is not a calculation of your actual payroll.

When ₹2,00,000 of that amount is later paid, Accounting debits Outstanding Salary by ₹2,00,000 and credits Bank by ₹2,00,000. The remaining payable stays outstanding.

## Claims and reimbursements

1. The employee submits a claim in HRMS with the required details and evidence.
2. The claim follows the existing HR approval steps.
3. Once it receives the configured final approval, Accounting records the mapped expense/asset and an amount due to the employee in Employee Claims Payable.
4. When the reimbursement is actually paid, an Accounting user records the payment against the claim and bank account from **HRMS Payroll & Claims**.

Claims are kept separate from salary payables. A claim that is approved but not paid remains payable. Rejected or cancelled claims should not create a payable. If the category is not mapped for accounting, the claim will need an administrator/accountant to resolve the mapping before it can be posted.

## Status meanings

The exact labels may differ in the finished screens. The important distinction is:

| Status concept | Meaning |
|---|---|
| **Needs HR approval** | The source is not yet authorized for accounting posting. |
| **Ready / sending to Accounting** | The finalized source is being submitted. Do not submit a second copy while this is in progress. |
| **Posted to Accounting** | Accounting created the journal. This means the liability is recorded; it does not mean the employee was paid. |
| **Action required** | Accounting could not post it—for example, a missing account mapping, a closed period, or incorrect source data. Ask the designated HR/Accounting administrator to correct it. |
| **Partially paid** | Some of the recorded payable has been settled; the remainder is still owed. |
| **Paid / settled** | Accounting has a payment posting for the amount due. Use this only when the actual payment has been recorded, not merely when a payroll approval is complete. |
| **Reversed / adjusted** | A prior posted entry was corrected with a linked accounting entry. The original record remains in the audit history. |

## What users need to do

- Complete HR approval and resolve payroll/claim errors before requesting accounting posting.
- Check the company, payroll period, employee list, and totals before final approval.
- Use the Accounting journal link/number to review the resulting entry.
- HRMS shows separate Accounting accrual and settlement statuses. If the settlement status is `OPEN` or `PARTIAL`, an amount remains due. `SETTLED` means Accounting has recorded the allocated payment; it is not automatic confirmation that the bank statement has been matched.
- For payment, record the employees and amounts actually paid, the correct bank account, payment date, and available bank reference.
- For a payment failure, partial payment, or correction, tell Accounting which payment failed and which employees/amounts are affected. Do not mark the entire run paid unless all payments are settled.
- If an item shows **Sending**, **Action required**, or an uncertain result, do not create a manual duplicate journal or repeatedly click post. Ask the integration administrator to check the event status first.
- Never share passwords or authentication codes to make the integration work. The server-to-server connection is managed by the IT team.

## Common questions

### Do I need to log in to another service or buy a subscription?

No additional messaging service is needed. The HRMS and Accounting servers communicate directly over HTTPS using an HMAC-signed request. Users continue working in HRMS and Accounting. The technical team stores and protects the shared secret on the servers; it must never be placed in a browser setting.

### If payroll says “Posted to Accounting,” has the money been sent?

No. Posting records that the company owes the salary. Bank settlement is a separate step, and the payable remains open until the payment is recorded in Accounting.

### What if an Accounting journal is wrong?

Do not delete or edit the posted journal by hand. Contact the accountant/authorized Accounting user. They should correct it using the approved adjustment or reversal process, which keeps the original entry and its audit trail.

### Who should resolve a blocked posting?

HR should confirm the payroll/claim source and approvals. The accountant or Accounting administrator should confirm ledger mappings, accounting period, and journal requirements. The integration administrator should investigate connection, identity, or repeated delivery errors.

## Important accounting control

The total employee-wise outstanding salary should match the Outstanding Salary general-ledger balance for the same company and currency. Employee Claims Payable should be reconciled separately. Differences must be investigated before period close; users should not force the balances to match by changing a posted journal without an approved adjustment.
