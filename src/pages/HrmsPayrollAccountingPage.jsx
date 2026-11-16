import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Save, Plus, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, Clock, Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  createHrmsSettlementApi,
  getHrmsClaimsReportApi,
  getHrmsEmployeePayableReconciliationApi,
  getHrmsEmployeePayablesApi,
  getHrmsSettlementsApi,
  getHrmsIntegrationAdminDataApi,
  getHrmsIntegrationCompanyDataApi,
  getHrmsIntegrationMappingsApi,
  saveHrmsIntegrationMappingsApi,
  reverseHrmsSettlementApi,
} from "../apis/hrmsIntegrationApi";

const emptyMappings = () => ({
  currency: "INR",
  closedThroughDate: "",
  bankAccountIds: [],
  payroll: {
    salaryExpenseAccountId: "",
    outstandingSalaryAccountId: "",
    deductions: [],
    benefits: {
      epfExpenseAccountId: "",
      epfPayableAccountId: "",
      mediclaimExpenseAccountId: "",
      mediclaimPayableAccountId: "",
      gratuityExpenseAccountId: "",
      gratuityPayableAccountId: "",
    },
  },
  claims: { payableAccountId: "", categoryMappings: [] },
});

const accountFields = [
  ["payroll.salaryExpenseAccountId", "Salary expense"],
  ["payroll.outstandingSalaryAccountId", "Outstanding Salary control"],
  ["payroll.benefits.epfExpenseAccountId", "Employer EPF expense"],
  ["payroll.benefits.epfPayableAccountId", "Employer EPF payable"],
  ["payroll.benefits.mediclaimExpenseAccountId", "Mediclaim expense"],
  ["payroll.benefits.mediclaimPayableAccountId", "Mediclaim payable"],
  ["payroll.benefits.gratuityExpenseAccountId", "Gratuity expense"],
  ["payroll.benefits.gratuityPayableAccountId", "Gratuity payable"],
  ["claims.payableAccountId", "Employee claims payable"],
];

const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((current, key) => current[key], object);
  target[last] = value;
  return object;
};
const toCurrency = (minorUnits, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format((minorUnits || 0) / 100);
const toMinorUnits = (value) => Math.round(Number(value || 0) * 100);
const dateValue = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

function LedgerSelect({ label, value, accounts, onChange, required = false }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        required={required}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Select ledger</option>
        {accounts.map((account) => (
          <option key={account._id} value={account._id}>
            {account.code} — {account.name} ({account.groupName})
          </option>
        ))}
      </select>
    </label>
  );
}

export default function HrmsPayrollAccountingPage() {
  const { user, company, hasPermission } = useAuth();
  const companyId =
    company?._id || JSON.parse(localStorage.getItem("selectedCompany") || "{}")._id;
  const isAdmin = ["admin", "superAdmin"].includes(user?.role);
  const canSettle = hasPermission("JOURNAL", "CREATE");
  const [accounts, setAccounts] = useState([]);
  const [mappings, setMappings] = useState(emptyMappings);
  const [payables, setPayables] = useState([]);
  const [reconciliation, setReconciliation] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");
  const [settlementType, setSettlementType] = useState("PAYROLL");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankReference, setBankReference] = useState("");
  const [allocations, setAllocations] = useState({});
  const [settlementRequest, setSettlementRequest] = useState(null);
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().slice(0, 10));
  const [reversalReference, setReversalReference] = useState("");
  const [reversalAllocations, setReversalAllocations] = useState({});
  const [reversalRequests, setReversalRequests] = useState({});
  const [claimsReport, setClaimsReport] = useState(null);
  const [claimsSearch, setClaimsSearch] = useState("");
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const currency = mappings.currency || "INR";
  const bankAccounts = useMemo(
    () => accounts.filter((account) => account.groupId?.nature === "Asset"),
    [accounts]
  );

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const [adminResponse, mappingResponse] = await Promise.all([
        isAdmin ? getHrmsIntegrationAdminDataApi(companyId) : getHrmsIntegrationCompanyDataApi(companyId),
        isAdmin ? getHrmsIntegrationMappingsApi(companyId) : Promise.resolve(null),
      ]);
      const adminData = adminResponse.data?.data;
      setAccounts(adminData?.accounts || []);
      const saved = mappingResponse?.data?.data || adminData?.config;
      setMappings({
        ...emptyMappings(),
        ...(saved || {}),
        closedThroughDate: dateValue(saved?.closedThroughDate),
        payroll: { ...emptyMappings().payroll, ...(saved?.payroll || {}) },
        claims: { ...emptyMappings().claims, ...(saved?.claims || {}) },
      });
      const [payableResult, reconciliationResult, settlementResult, claimsReportResult] = await Promise.allSettled([
        getHrmsEmployeePayablesApi(companyId),
        getHrmsEmployeePayableReconciliationApi(companyId),
        getHrmsSettlementsApi(companyId),
        getHrmsClaimsReportApi(companyId),
      ]);
      setPayables(payableResult.status === "fulfilled" ? payableResult.value.data?.data || [] : []);
      setReconciliation(reconciliationResult.status === "fulfilled" ? reconciliationResult.value.data?.data || [] : []);
      setSettlements(settlementResult.status === "fulfilled" ? settlementResult.value.data?.data || [] : []);
      setClaimsReport(claimsReportResult.status === "fulfilled" ? claimsReportResult.value.data?.data || null : null);
      if (!adminData?.config) setError("Save the HRMS ledger mappings before payables can be posted.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load HRMS accounting data");
    } finally {
      setLoading(false);
    }
  }, [companyId, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateMapping = (path, value) => {
    setMappings((current) => setPath(structuredClone(current), path, value));
  };

  const autoPopulateStandardCategories = () => {
    const tourAcc = accounts.find(
      (a) =>
        a.name?.toLowerCase().includes("tour") ||
        a.name?.toLowerCase().includes("travel") ||
        a.code === "TOURTRAVELEXP"
    );
    const officeAcc = accounts.find(
      (a) => a.name?.toLowerCase().includes("office") || a.code === "OFFICEEXPENS"
    );
    const miscAcc = accounts.find(
      (a) =>
        a.name?.toLowerCase().includes("misc") ||
        a.code === "MISCEXP" ||
        a.code === "MISCELLANEOUS"
    );

    const standard = [
      {
        categoryId: "69ae6963242d7b93ddc7478d",
        categoryName: "Travel Allowance",
        expenseAccountId: tourAcc?._id || "",
      },
      {
        categoryId: "69d39cd417c33ab5608e129c",
        categoryName: "Food Expenses for travel",
        expenseAccountId: tourAcc?._id || "",
      },
      {
        categoryId: "69afe3e9d2064e6b3aa80ae3",
        categoryName: "Shift Allowance",
        expenseAccountId: officeAcc?._id || "",
      },
      {
        categoryId: "69d391a017c33ab5608e0faf",
        categoryName: "Recharge of Internet",
        expenseAccountId: officeAcc?._id || "",
      },
      {
        categoryId: "69afe7cb7a1905fc9e9865e2",
        categoryName: "Food",
        expenseAccountId: officeAcc?._id || "",
      },
      {
        categoryId: "69ce2d01c1ea9c95e2c0bb3f",
        categoryName: "Miscellaneous",
        expenseAccountId: miscAcc?._id || "",
      },
    ];

    updateMapping("claims.categoryMappings", standard);
  };

  const saveMappings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveHrmsIntegrationMappingsApi(companyId, mappings);
      await loadData();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not save ledger mappings");
    } finally {
      setSaving(false);
    }
  };

  const visiblePayables = payables.filter((item) => item.sourceType === settlementType);
  const selectedTotal = visiblePayables.reduce(
    (sum, item) => sum + toMinorUnits(allocations[item._id]),
    0
  );

  const submitSettlement = async (event) => {
    event.preventDefault();
    const selected = visiblePayables
      .filter((item) => toMinorUnits(allocations[item._id]) > 0)
      .map((item) => ({
        payableId: item._id,
        amountMinorUnits: toMinorUnits(allocations[item._id]),
      }));
    if (!selected.length) {
      setError("Enter an amount for at least one employee payable");
      return;
    }
    setSettling(true);
    setError("");
    try {
      const requestPayload = {
        companyId,
        settlementType,
        bankAccountId,
        paymentDate,
        bankReference: bankReference.trim(),
        allocations: selected,
      };
      const fingerprint = JSON.stringify(requestPayload);
      const eventId = settlementRequest?.fingerprint === fingerprint
        ? settlementRequest.eventId
        : `accounting-settlement-${crypto.randomUUID()}`;
      setSettlementRequest({ fingerprint, eventId });
      await createHrmsSettlementApi({ ...requestPayload, eventId });
      setAllocations({});
      setBankReference("");
      setSettlementRequest(null);
      await loadData();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not record salary/claim settlement");
    } finally {
      setSettling(false);
    }
  };

  const submitReversal = async (settlement) => {
    const selected = settlement.allocations
      .map((item) => ({
        payableId: String(item.payableId),
        amountMinorUnits: toMinorUnits(reversalAllocations[`${settlement._id}:${item.payableId}`]),
      }))
      .filter((item) => item.amountMinorUnits > 0);
    if (!selected.length) {
      setError("Enter a reversal amount for at least one original employee allocation");
      return;
    }
    const requestPayload = {
      companyId,
      paymentDate: reversalDate,
      bankReference: reversalReference.trim(),
      allocations: selected,
    };
    const fingerprint = JSON.stringify(requestPayload);
    const previousRequest = reversalRequests[settlement._id];
    const eventId = previousRequest?.fingerprint === fingerprint
      ? previousRequest.eventId
      : `accounting-reversal-${crypto.randomUUID()}`;
    setReversalRequests((current) => ({
      ...current,
      [settlement._id]: { fingerprint, eventId },
    }));
    setSettling(true);
    setError("");
    try {
      await reverseHrmsSettlementApi(settlement._id, {
        ...requestPayload,
        eventId,
      });
      setReversalReference("");
      setReversalAllocations({});
      setReversalRequests((current) => {
        const next = { ...current };
        delete next[settlement._id];
        return next;
      });
      await loadData();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not reverse this settlement");
    } finally {
      setSettling(false);
    }
  };

  const updateDeduction = (index, key, value) => {
    setMappings((current) => {
      const next = structuredClone(current);
      next.payroll.deductions[index][key] = value;
      return next;
    });
  };

  if (!companyId) return <div className="rounded-xl bg-white p-6">Select an accounting company first.</div>;
  if (loading) return <div className="rounded-xl bg-white p-6">Loading HRMS accounting integration…</div>;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounting</p>
          <h1 className="text-2xl font-bold text-slate-900">HRMS payroll and claims</h1>
          <p className="mt-1 text-sm text-slate-600">Accruals, employee payables, settlements, and control-account reconciliation.</p>
        </div>
        <button type="button" onClick={loadData} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {isAdmin && (
        <form onSubmit={saveMappings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Company-scoped ledger mappings</h2>
            <p className="text-sm text-slate-600">Posting is rejected unless every required ledger is active and has the correct account nature.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Currency</span>
              <input required maxLength={3} value={mappings.currency} onChange={(event) => updateMapping("currency", event.target.value.toUpperCase())} className="w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Closed through date</span>
              <input type="date" value={mappings.closedThroughDate || ""} onChange={(event) => updateMapping("closedThroughDate", event.target.value || null)} className="w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Allowed bank ledgers</span>
              <select multiple value={(mappings.bankAccountIds || []).map(String)} onChange={(event) => updateMapping("bankAccountIds", [...event.target.selectedOptions].map((option) => option.value))} className="h-24 w-full rounded-lg border px-3 py-2 text-sm">
                {bankAccounts.map((account) => <option key={account._id} value={account._id}>{account.code} — {account.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {accountFields.map(([path, label]) => (
              <LedgerSelect key={path} label={label} required accounts={accounts} value={getPath(mappings, path)} onChange={(value) => updateMapping(path, value)} />
            ))}
          </div>

          <section className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <div><h3 className="font-semibold">Payroll deductions</h3><p className="text-xs text-slate-500">Map every deduction key delivered by HRMS to its liability ledger.</p></div>
              <button type="button" onClick={() => updateMapping("payroll.deductions", [...(mappings.payroll.deductions || []), { key: "", label: "", accountId: "" }])} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Plus size={15} /> Add</button>
            </div>
            {(mappings.payroll.deductions || []).map((item, index) => (
              <div key={`${item.key}-${index}`} className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
                <input required placeholder="HRMS key (e.g. pf)" value={item.key} onChange={(event) => updateDeduction(index, "key", event.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                <input required placeholder="Display label" value={item.label} onChange={(event) => updateDeduction(index, "label", event.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                <LedgerSelect required label="Liability ledger" accounts={accounts} value={item.accountId} onChange={(value) => updateDeduction(index, "accountId", value)} />
                <button type="button" aria-label="Remove deduction mapping" onClick={() => updateMapping("payroll.deductions", mappings.payroll.deductions.filter((_, itemIndex) => itemIndex !== index))} className="self-end rounded-lg border p-2 text-red-600"><Trash2 size={16} /></button>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Claim category mappings</h3>
                <p className="text-xs text-slate-500">Group HRMS claim categories into the 3 expense accounts (Office Expense, Tour & Travel Expenses, Miscellaneous).</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={autoPopulateStandardCategories} className="inline-flex items-center gap-1 rounded-lg border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Auto-fill standard 6 categories
                </button>
                <button type="button" onClick={() => updateMapping("claims.categoryMappings", [...(mappings.claims.categoryMappings || []), { categoryId: "", categoryName: "", expenseAccountId: "" }])} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Plus size={15} /> Add</button>
              </div>
            </div>
            {(mappings.claims.categoryMappings || []).map((item, index) => (
              <div key={`${item.categoryId}-${index}`} className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
                <input required placeholder="HRMS category ID" value={item.categoryId} onChange={(event) => {
                  const next = structuredClone(mappings);
                  next.claims.categoryMappings[index].categoryId = event.target.value;
                  setMappings(next);
                }} className="rounded-lg border px-3 py-2 text-sm" />
                <input required placeholder="Category name" value={item.categoryName} onChange={(event) => {
                  const next = structuredClone(mappings);
                  next.claims.categoryMappings[index].categoryName = event.target.value;
                  setMappings(next);
                }} className="rounded-lg border px-3 py-2 text-sm" />
                <LedgerSelect required label="Expense ledger" accounts={accounts} value={item.expenseAccountId} onChange={(value) => {
                  const next = structuredClone(mappings);
                  next.claims.categoryMappings[index].expenseAccountId = value;
                  setMappings(next);
                }} />
                <button type="button" aria-label="Remove claim category mapping" onClick={() => updateMapping("claims.categoryMappings", mappings.claims.categoryMappings.filter((_, itemIndex) => itemIndex !== index))} className="self-end rounded-lg border p-2 text-red-600"><Trash2 size={16} /></button>
              </div>
            ))}
          </section>
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            Payroll containing Bonus, Due, Suspension Cut, or Excess extraPay is blocked until each type receives an approved accounting treatment.
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
            <Save size={16} /> {saving ? "Saving…" : "Save mappings"}
          </button>
        </form>
      )}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">Employee payable settlements</h2><p className="text-sm text-slate-600">Record only actual payments; partial settlements are supported.</p></div>
          <select value={settlementType} onChange={(event) => { setSettlementType(event.target.value); setAllocations({}); }} className="rounded-lg border px-3 py-2">
            <option value="PAYROLL">Salary</option>
            <option value="CLAIM">Claims</option>
          </select>
        </div>
        <form onSubmit={submitSettlement} className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm"><span>Bank ledger</span><select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="w-full rounded-lg border px-3 py-2"><option value="">Select bank</option>{bankAccounts.filter((item) => (mappings.bankAccountIds || []).includes(String(item._id))).map((account) => <option key={account._id} value={account._id}>{account.code} — {account.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Payment date</span><input required type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="w-full rounded-lg border px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Bank reference / UTR</span><input required value={bankReference} onChange={(event) => setBankReference(event.target.value)} className="w-full rounded-lg border px-3 py-2" /></label>
          <div className="flex items-end"><button disabled={settling || !visiblePayables.length || !canSettle} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{settling ? "Posting…" : `Post ${toCurrency(selectedTotal, currency)}`}</button></div>
          {visiblePayables.length === 0 ? (
            <p className="text-sm text-slate-500 md:col-span-4">No open {settlementType === "PAYROLL" ? "salary" : "claim"} payables for this company.</p>
          ) : (
            <div className="overflow-x-auto md:col-span-4">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Employee</th><th>Payment ID</th><th>Source</th><th>Original</th><th>Remaining</th><th>Payment now</th></tr></thead>
                <tbody>{visiblePayables.map((item) => {
                  const remaining = item.originalAmountMinorUnits - item.settledAmountMinorUnits;
                  return <tr key={item._id} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      {item.employeeName}
                      <span className="block text-xs text-slate-500">{item.employeeCode || item.employeeId}</span>
                      {item.employeeDepartment && <span className="block text-[11px] text-slate-400">{item.employeeDepartment}</span>}
                    </td>
                    <td>
                      <span className="inline-block rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700">
                        {item.paymentId || "—"}
                      </span>
                    </td>
                    <td>{item.sourceType}: {item.sourceId}</td>
                    <td>{toCurrency(item.originalAmountMinorUnits, item.currency)}</td>
                    <td>{toCurrency(remaining, item.currency)}</td>
                    <td><input type="number" min="0" max={remaining / 100} step="0.01" value={allocations[item._id] || ""} onChange={(event) => setAllocations((current) => ({ ...current, [item._id]: event.target.value }))} className="w-36 rounded-lg border px-2 py-1.5" /></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </form>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div><h2 className="text-lg font-bold">Subledger to control-account reconciliation</h2><p className="text-sm text-slate-600">Difference should be zero. Differences include manual journals or unmatched legacy balances.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Control account</th><th>Subledger open</th><th>GL balance</th><th>Difference</th><th>Items</th></tr></thead>
            <tbody>{reconciliation.map((item) => <tr key={item.accountId} className="border-b last:border-0">
              <td className="py-3 font-medium">{item.accountCode} — {item.accountName}</td>
              <td>{toCurrency(item.employeeSubledgerMinorUnits, currency)}</td>
              <td>{toCurrency(item.generalLedgerMinorUnits, currency)}</td>
              <td className={item.differenceMinorUnits === 0 ? "text-emerald-700" : "font-semibold text-red-700"}>{toCurrency(item.differenceMinorUnits, currency)}</td>
              <td>{item.itemCount}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {/* Consolidated Employee Claims Report */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Consolidated Employee Claims Report</h2>
            <p className="text-sm text-slate-600">
              Consolidated view of claims raised by employees, total approved, paid, and outstanding balances.
            </p>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search claimant or code..."
              value={claimsSearch}
              onChange={(e) => setClaimsSearch(e.target.value)}
              className="rounded-lg border py-1.5 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {/* KPI Cards */}
        {claimsReport?.summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-xs text-slate-500">Total Claimants</span>
              <p className="text-xl font-bold text-slate-800">{claimsReport.summary.totalEmployees}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <span className="text-xs text-blue-700">Total Approved</span>
              <p className="text-xl font-bold text-blue-800">
                {toCurrency(claimsReport.summary.totalApprovedMinorUnits, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <span className="text-xs text-emerald-700">Total Paid (Settled)</span>
              <p className="text-xl font-bold text-emerald-800">
                {toCurrency(claimsReport.summary.totalSettledMinorUnits, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              <span className="text-xs text-amber-700">Pending Liability</span>
              <p className="text-xl font-bold text-amber-800">
                {toCurrency(claimsReport.summary.totalPendingMinorUnits, currency)}
              </p>
            </div>
          </div>
        )}

        {/* Employees Table */}
        {!claimsReport?.employees || claimsReport.employees.length === 0 ? (
          <p className="text-sm text-slate-500">No approved claims found in Accounting.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
                  <th className="py-2.5">Employee</th>
                  <th>Claims</th>
                  <th>Total Approved</th>
                  <th>Total Paid</th>
                  <th>Pending Balance</th>
                  <th>Status</th>
                  <th className="text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {claimsReport.employees
                  .filter((emp) => {
                    if (!claimsSearch.trim()) return true;
                    const q = claimsSearch.toLowerCase();
                    return (
                      emp.employeeName?.toLowerCase().includes(q) ||
                      emp.employeeCode?.toLowerCase().includes(q) ||
                      emp.employeeDepartment?.toLowerCase().includes(q)
                    );
                  })
                  .map((emp) => {
                    const isExpanded = expandedEmployee === emp.employeeId;
                    const isFullySettled = emp.totalPendingAmountMinorUnits === 0;
                    const isPartiallySettled =
                      emp.totalSettledAmountMinorUnits > 0 && emp.totalPendingAmountMinorUnits > 0;

                    return (
                      <Fragment key={emp.employeeId || emp.employeeName}>
                        <tr className="border-b last:border-0 hover:bg-slate-50/60">
                          <td className="py-3 font-medium">
                            {emp.employeeName}
                            <span className="block text-xs text-slate-500">
                              {emp.employeeCode || emp.employeeId || "—"}
                            </span>
                            {emp.employeeDepartment && (
                              <span className="block text-[11px] text-slate-400">
                                {emp.employeeDepartment}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {emp.claimsCount}
                            </span>
                          </td>
                          <td className="font-semibold text-slate-800">
                            {toCurrency(emp.totalApprovedAmountMinorUnits, currency)}
                          </td>
                          <td className="font-semibold text-emerald-700">
                            {toCurrency(emp.totalSettledAmountMinorUnits, currency)}
                          </td>
                          <td
                            className={`font-semibold ${
                              emp.totalPendingAmountMinorUnits > 0
                                ? "text-amber-700"
                                : "text-slate-400"
                            }`}
                          >
                            {toCurrency(emp.totalPendingAmountMinorUnits, currency)}
                          </td>
                          <td>
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                isFullySettled
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isPartiallySettled
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {isFullySettled ? "Paid" : isPartiallySettled ? "Partial" : "Pending"}
                            </span>
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedEmployee(isExpanded ? null : emp.employeeId)
                              }
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                            >
                              {isExpanded ? (
                                <>
                                  Hide <ChevronUp size={13} />
                                </>
                              ) : (
                                <>
                                  View Claims ({emp.claims.length}) <ChevronDown size={13} />
                                </>
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Claim Details Drilldown */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={7} className="p-3">
                              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                  Claims Breakdown for {emp.employeeName}
                                </h4>
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b text-slate-400">
                                      <th className="py-1">Claim ID / Payment ID</th>
                                      <th>Posting Date</th>
                                      <th>Journal #</th>
                                      <th>Approved Amount</th>
                                      <th>Settled Amount</th>
                                      <th>Pending</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {emp.claims.map((claim, idx) => (
                                      <tr key={claim.payableId || idx} className="border-b last:border-0">
                                        <td className="py-1.5 font-mono text-slate-700">
                                          {claim.paymentId || claim.claimId}
                                        </td>
                                        <td>
                                          {new Date(claim.postingDate).toLocaleDateString("en-IN")}
                                        </td>
                                        <td className="font-mono text-blue-600">
                                          {claim.journalNumber || "—"}
                                        </td>
                                        <td className="font-semibold">
                                          {toCurrency(claim.originalAmountMinorUnits, currency)}
                                        </td>
                                        <td className="text-emerald-700">
                                          {toCurrency(claim.settledAmountMinorUnits, currency)}
                                        </td>
                                        <td
                                          className={
                                            claim.remainingAmountMinorUnits > 0
                                              ? "font-semibold text-amber-700"
                                              : "text-slate-400"
                                          }
                                        >
                                          {toCurrency(claim.remainingAmountMinorUnits, currency)}
                                        </td>
                                        <td>
                                          <span
                                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                              claim.status === "SETTLED"
                                                ? "bg-emerald-100 text-emerald-800"
                                                : claim.status === "PARTIAL"
                                                ? "bg-blue-100 text-blue-800"
                                                : "bg-amber-100 text-amber-800"
                                            }`}
                                          >
                                            {claim.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">Settlement history and reversals</h2>
          <p className="text-sm text-slate-600">Reversals are linked adjustment journals; posted settlements are never deleted or overwritten.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Reversal date</span><input type="date" value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} className="w-full rounded-lg border px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Actual bank reversal reference</span><input value={reversalReference} onChange={(event) => setReversalReference(event.target.value)} className="w-full rounded-lg border px-3 py-2" /></label>
        </div>
        {settlements.length === 0 ? <p className="text-sm text-slate-500">No settlements have been recorded.</p> : settlements.map((settlement) => (
          <div key={settlement._id} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-semibold">{settlement.settlementType} · {settlement.bankReference}</span>
              <span className="text-slate-500">{new Date(settlement.paymentDate).toLocaleDateString("en-IN")} · {settlement.eventId}</span>
            </div>
            <div className="grid gap-3">
              {settlement.allocations.map((item) => {
                const openToReverse = item.amountMinorUnits - (item.reversedAmountMinorUnits || 0);
                return <div key={String(item.payableId)} className="grid items-center gap-2 text-sm md:grid-cols-[1fr_auto_auto]">
                  <span>{item.employee?.employeeName || "Employee"} ({item.employee?.employeeCode || item.employee?.employeeId || "—"})</span>
                  <span>Paid {toCurrency(item.amountMinorUnits, currency)} · reversed {toCurrency(item.reversedAmountMinorUnits || 0, currency)}</span>
                  {openToReverse > 0 ? (
                    <input type="number" min="0" max={openToReverse / 100} step="0.01" value={reversalAllocations[`${settlement._id}:${item.payableId}`] || ""} onChange={(event) => setReversalAllocations((current) => ({ ...current, [`${settlement._id}:${item.payableId}`]: event.target.value }))} placeholder={`Max ${toCurrency(openToReverse, currency)}`} className="w-44 rounded-lg border px-2 py-1.5" />
                  ) : <span className="text-xs font-semibold text-emerald-700">Fully reversed</span>}
                </div>;
              })}
            </div>
            {settlement.allocations.some((item) => item.amountMinorUnits > (item.reversedAmountMinorUnits || 0)) && (
              <button type="button" disabled={settling || !reversalReference.trim() || !canSettle} onClick={() => submitReversal(settlement)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
                {settling ? "Posting reversal…" : "Post selected reversal"}
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
