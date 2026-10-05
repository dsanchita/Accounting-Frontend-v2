import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Filter,
  IndianRupee,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useFinancialYear } from "../contexts/FinancialYearContext";
import { getClientsApi } from "../apis/clientApi";
import { getAllPurchaseOrdersApi } from "../apis/purchaseOrderApi";
import { getBusinessInsightsReportApi } from "../apis/reportApi";
import {
  getClientTaxReportApi,
  getPOTaxReportApi,
  getTaxSummaryApi,
} from "../apis/invoice.api";

const MONTH_OPTIONS = [
  { label: "All Months", value: "" },
  { label: "April", value: "4" },
  { label: "May", value: "5" },
  { label: "June", value: "6" },
  { label: "July", value: "7" },
  { label: "August", value: "8" },
  { label: "September", value: "9" },
  { label: "October", value: "10" },
  { label: "November", value: "11" },
  { label: "December", value: "12" },
  { label: "January", value: "1" },
  { label: "February", value: "2" },
  { label: "March", value: "3" },
];

const amount = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const percent = (value, total) => {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Number(((value / total) * 100).toFixed(1))));
};

const statusBadge = (status) => {
  const map = {
    paid: "bg-emerald-500 text-white",
    partial: "bg-amber-500 text-white",
    pending: "bg-red-500 text-white",
  };
  return map[status] || "bg-slate-500 text-white";
};

const typeBadge = (type) => {
  if (String(type).toLowerCase() === "payable") {
    return "bg-blue-50 text-blue-600 border-blue-200";
  }
  return "bg-emerald-50 text-emerald-600 border-emerald-200";
};

const ledgerTypeBadge = (type) => {
  const map = {
    client: "bg-emerald-50 text-emerald-700 border-emerald-200",
    vendor: "bg-blue-50 text-blue-700 border-blue-200",
    expense: "bg-amber-50 text-amber-700 border-amber-200",
    income: "bg-violet-50 text-violet-700 border-violet-200",
    cashBank: "bg-sky-50 text-sky-700 border-sky-200",
    general: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return map[type] || map.general;
};

const sourceBadge = (transaction = {}) => {
  if (transaction.sourceType === "PAYMENT" || transaction.voucherType === "RECEIPT") {
    return "bg-emerald-500 text-white";
  }
  if (transaction.sourceType === "INVOICE" || transaction.voucherType === "SALES") {
    return "bg-blue-500 text-white";
  }
  if (transaction.voucherType === "PAYMENT") {
    return "bg-amber-500 text-white";
  }
  return "bg-slate-500 text-white";
};

const formatLedgerTypeLabel = (type = "") => {
  const labels = {
    client: "Client Ledger",
    vendor: "Vendor Ledger",
    expense: "Expense Ledger",
    income: "Income Ledger",
    cashBank: "Cash / Bank",
    general: "General Ledger",
  };

  return labels[type] || "Ledger";
};

const formatTransactionType = (transaction = {}) => {
  if (transaction.sourceType === "PAYMENT" || transaction.voucherType === "RECEIPT") return "Receipt";
  if (transaction.sourceType === "INVOICE" || transaction.voucherType === "SALES") return "Invoice";
  if (transaction.voucherType === "PAYMENT") return "Payment";
  if (transaction.voucherType === "PURCHASE") return "Purchase";
  if (transaction.voucherType === "JOURNAL") return "Journal";
  if (transaction.voucherType === "CONTRA") return "Contra";
  return transaction.sourceType || transaction.voucherType || "Manual";
};

const InputField = ({ label, children }) => (
  <label className="block">
    <span className="mb-2 block text-[11px] font-semibold text-slate-500">{label}</span>
    {children}
  </label>
);

const SelectInput = ({ value, onChange, children }) => (
  <select
    value={value}
    onChange={onChange}
    className="h-10 w-full rounded-lg border border-[#e8dfd2] bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#cdb79c]"
  >
    {children}
  </select>
);

const TextInput = ({ value, onChange, type = "text" }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    className="h-10 w-full rounded-lg border border-[#e8dfd2] bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#cdb79c]"
  />
);

const SummaryCard = ({ title, iconColor, iconBg, icon, children }) => (
  <div className="rounded-2xl border border-[#e7dccd] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="mb-5 flex items-center gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
        {React.cloneElement(icon, { size: 15, className: iconColor })}
      </div>
      <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
    </div>
    {children}
  </div>
);

const TinyMetric = ({ label, value }) => (
  <div className="rounded-xl bg-[#faf7f2] px-4 py-3 text-center">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-xl font-bold text-slate-800">{amount(value)}</div>
  </div>
);

const SummaryRow = ({ label, value, tone = "slate", icon }) => {
  const tones = {
    slate: "text-slate-700",
    green: "text-emerald-600",
    amber: "text-amber-500",
    red: "text-rose-500",
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[13px] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-[15px] font-bold ${tones[tone] || tones.slate}`}>{amount(value)}</div>
    </div>
  );
};

const ProgressBar = ({ value, color = "bg-emerald-500", label }) => (
  <div className="mt-4">
    <div className="h-2 rounded-full bg-[#ece7de]">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
    <div className="mt-2 text-center text-[11px] text-slate-400">{label}</div>
  </div>
);

const FooterStat = ({ title, value, note, tone = "amber" }) => {
  const toneMap = {
    amber: "border-amber-200 bg-amber-50/60 text-amber-600",
    red: "border-rose-200 bg-rose-50/60 text-rose-500",
    green: "border-emerald-200 bg-emerald-50/60 text-emerald-600",
  };

  return (
    <div className={`rounded-2xl border p-5 ${toneMap[tone] || toneMap.amber}`}>
      <div className="text-[12px] font-semibold text-slate-500">{title}</div>
      <div className="mt-2 text-[34px] font-bold leading-none">{value}</div>
      <div className="mt-2 text-[12px] text-slate-500">{note}</div>
    </div>
  );
};

const InvoiceDrilldown = ({ invoices = [] }) => (
  <div className="border-t border-[#eee5d9] bg-[#fcfaf7] px-6 py-4">
    <div className="overflow-hidden rounded-xl border border-[#eee5d9]">
      <table className="min-w-full bg-white text-sm">
        <thead className="bg-[#faf7f2] text-left text-[11px] font-semibold text-slate-500">
          <tr>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">GST</th>
            <th className="px-4 py-3">TDS</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Pending</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.invoiceId} className="border-t border-[#f1ebe2]">
              <td className="px-4 py-3">
                <div className="font-semibold text-slate-800">{invoice.invoiceNo}</div>
                <div className="text-xs text-slate-400">{invoice.status}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{invoice.invoiceDate ? dayjs(invoice.invoiceDate).format("DD MMM YYYY") : "-"}</td>
              <td className="px-4 py-3 text-slate-700">
                <div>GST {amount(invoice.gstGenerated)}</div>
                <div className="text-xs text-slate-400">
                  I {amount(invoice.igstAmount)} C {amount(invoice.cgstAmount)} S {amount(invoice.sgstAmount)}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-700">{amount(invoice.tdsDeducted)}</td>
              <td className="px-4 py-3 font-semibold text-emerald-600">{amount(invoice.paymentInfo?.paidAmount)}</td>
              <td className="px-4 py-3 font-semibold text-rose-500">{amount(invoice.paymentInfo?.pendingAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const LedgerDrilldown = ({ row }) => {
  const title =
    row.ledgerType === "client"
      ? "Incoming receipts and invoice activity"
      : row.ledgerType === "vendor"
        ? "Vendor-linked payment activity"
        : row.groupNature === "Expense"
          ? "Payment allocation and expense breakup"
          : "Ledger activity breakdown";

  const breakdown = row.breakdown || [];
  const transactions = row.transactions || [];

  return (
    <div className="border-t border-[#eee5d9] bg-[#fcfaf7] px-6 py-5">
      <div className="rounded-2xl border border-[#eee5d9] bg-white">
        <div className="border-b border-[#f1ebe2] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">{title}</div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${ledgerTypeBadge(row.ledgerType)}`}>
                  {formatLedgerTypeLabel(row.ledgerType)}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {row.ledgerType === "client"
                  ? "Invoice postings and receipt settlements linked to this client ledger."
                  : row.groupNature === "Expense"
                    ? "Grouped from journal narration and line descriptions to show rent, maintenance, electricity, and other payment heads."
                    : "Detailed entries posted into this ledger for the selected period."}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="rounded-xl bg-[#faf7f2] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entries</div>
                <div className="mt-1 text-lg font-bold text-slate-800">{row.transactionCount || 0}</div>
              </div>
              <div className="rounded-xl bg-[#faf7f2] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Invoices</div>
                <div className="mt-1 text-lg font-bold text-blue-600">{row.invoiceCount || 0}</div>
              </div>
              <div className="rounded-xl bg-[#faf7f2] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Payments</div>
                <div className="mt-1 text-lg font-bold text-emerald-600">{row.paymentCount || 0}</div>
              </div>
              <div className="rounded-xl bg-[#faf7f2] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last Activity</div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {row.lastActivityDate ? dayjs(row.lastActivityDate).format("DD MMM YYYY") : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1.1fr,1.9fr]">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Breakdown</div>
            {breakdown.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#e8dfd2] bg-[#faf7f2] px-4 py-6 text-sm text-slate-500">
                No grouped activity found for this ledger.
              </div>
            ) : (
              <div className="space-y-2">
                {breakdown.map((entry) => (
                  <div key={entry.label} className="rounded-xl border border-[#f1ebe2] bg-[#fcfaf7] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{entry.label}</div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {entry.count} entr{entry.count === 1 ? "y" : "ies"}
                          {entry.sources?.length ? ` • ${entry.sources.join(" / ")}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-rose-500">Cr {amount(entry.credit)}</div>
                        <div className="text-xs font-semibold text-emerald-600">Dr {amount(entry.debit)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Transactions</div>
            <div className="overflow-hidden rounded-xl border border-[#eee5d9]">
              <table className="min-w-full bg-white text-sm">
                <thead className="bg-[#faf7f2] text-left text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No transactions found for this ledger.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((transaction) => (
                      <tr key={transaction.transactionId} className="border-t border-[#f1ebe2] align-top">
                        <td className="px-4 py-3 text-slate-600">
                          {transaction.journalDate ? dayjs(transaction.journalDate).format("DD MMM YYYY") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase ${sourceBadge(transaction)}`}>
                            {formatTransactionType(transaction)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{transaction.label || "Ledger activity"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {transaction.description || transaction.narration || transaction.partyName || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{transaction.externalDocNo || transaction.referenceNumber || "—"}</div>
                          <div className="text-xs text-slate-400">{transaction.journalNumber || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {transaction.debit ? amount(transaction.debit) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-500">
                          {transaction.credit ? amount(transaction.credit) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const mergeClientRowsByName = (rows = []) => {
  const grouped = new Map();

  rows.forEach((row) => {
    const nameKey = String(row.clientName || "Unknown").trim().toLowerCase();
    if (!grouped.has(nameKey)) {
      grouped.set(nameKey, {
        clientId: row.clientId || null,
        clientName: row.clientName || "Unknown",
        totalInvoiceAmount: 0,
        totalGST: 0,
        totalGSTCollected: 0,
        totalIGST: 0,
        totalCGST: 0,
        totalSGST: 0,
        totalTDS: 0,
        totalReceived: 0,
        pendingAmount: 0,
        invoiceCount: 0,
        poCount: 0,
        tdsSectionBreakdown: [],
        poGroups: [],
      });
    }

    const target = grouped.get(nameKey);
    target.clientId = target.clientId || row.clientId || null;
    target.totalInvoiceAmount += Number(row.totalInvoiceAmount || 0);
    target.totalGST += Number(row.totalGST || 0);
    target.totalGSTCollected += Number(row.poGroups?.reduce(
      (sum, group) => sum + Number((group.invoices || []).reduce((invoiceSum, invoice) => invoiceSum + Number(invoice.gstPaid || 0), 0)),
      0
    ) || 0);
    target.totalIGST += Number(row.totalIGST || 0);
    target.totalCGST += Number(row.totalCGST || 0);
    target.totalSGST += Number(row.totalSGST || 0);
    target.totalTDS += Number(row.totalTDS || 0);
    target.totalReceived += Number(row.totalReceived || 0);
    target.pendingAmount += Number(row.pendingAmount || 0);
    target.invoiceCount += Number(row.invoiceCount || 0);

    const sectionMap = new Map(
      (target.tdsSectionBreakdown || []).map((entry) => [entry.section, Number(entry.amount || 0)])
    );
    (row.tdsSectionBreakdown || []).forEach((entry) => {
      sectionMap.set(entry.section, (sectionMap.get(entry.section) || 0) + Number(entry.amount || 0));
    });
    target.tdsSectionBreakdown = Array.from(sectionMap.entries()).map(([section, amount]) => ({
      section,
      amount,
    }));

    const poMap = new Map(
      (target.poGroups || []).map((group) => [`${group.poId || ""}:${group.poNumber || ""}`, { ...group }])
    );
    (row.poGroups || []).forEach((group) => {
      const poKey = `${group.poId || ""}:${group.poNumber || ""}`;
      if (!poMap.has(poKey)) {
        poMap.set(poKey, {
          ...group,
          totalInvoiceAmount: Number(group.totalInvoiceAmount || 0),
          totalPaid: Number(group.totalPaid || 0),
          pendingAmount: Number(group.pendingAmount || 0),
          totalGST: Number(group.totalGST || 0),
          totalTDS: Number(group.totalTDS || 0),
          invoices: [...(group.invoices || [])],
        });
      } else {
        const current = poMap.get(poKey);
        current.totalInvoiceAmount += Number(group.totalInvoiceAmount || 0);
        current.totalPaid += Number(group.totalPaid || 0);
        current.pendingAmount += Number(group.pendingAmount || 0);
        current.totalGST += Number(group.totalGST || 0);
        current.totalTDS += Number(group.totalTDS || 0);
        current.invoices = [...current.invoices, ...(group.invoices || [])];
        poMap.set(poKey, current);
      }
    });

    target.poGroups = Array.from(poMap.values());
    target.poCount = target.poGroups.length;
  });

  return Array.from(grouped.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
};

export default function TaxFlowReportPage() {
  const { user } = useAuth();
  const {
    currentFinancialYearEnding,
    financialYearOptions,
    selectedFinancialYear,
    setSelectedFinancialYearEnding,
  } = useFinancialYear();
  const [filters, setFilters] = useState({
    financialYear: selectedFinancialYear,
    fromDate: "",
    toDate: "",
    month: "",
    clientId: "",
    poId: "",
  });
  const [activeTab, setActiveTab] = useState("po");
  const [clients, setClients] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poReport, setPoReport] = useState({ items: [], summary: {} });
  const [clientReport, setClientReport] = useState({ items: [], summary: {} });
  const [summary, setSummary] = useState({});
  const [meta, setMeta] = useState(null);
  const [businessInsights, setBusinessInsights] = useState({
    summary: {},
    expenseBreakdown: [],
    monthlyPerformance: [],
    ledgerImpactSummary: [],
  });
  const [businessMeta, setBusinessMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});

  const fyOptions = useMemo(
    () => financialYearOptions.map((endingYear) => `${endingYear - 1}-${String(endingYear).slice(-2)}`),
    [financialYearOptions]
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client._id === filters.clientId) || null,
    [clients, filters.clientId]
  );

  useEffect(() => {
    setFilters((current) => {
      if (current.financialYear === selectedFinancialYear) {
        return current;
      }

      return {
        ...current,
        financialYear: selectedFinancialYear,
      };
    });
  }, [selectedFinancialYear]);

  const queryParams = useMemo(() => {
    const params = {
      companyId: user?.company?._id,
      financialYear: filters.financialYear,
    };
    if (filters.month && !filters.fromDate && !filters.toDate) params.month = filters.month;
    if (filters.fromDate) params.fromDate = filters.fromDate;
    if (filters.toDate) params.toDate = filters.toDate;
    if (filters.clientId) params.clientId = filters.clientId;
    if (selectedClient?.clientName) params.clientName = selectedClient.clientName;
    if (filters.poId) params.poId = filters.poId;
    return params;
  }, [filters, selectedClient, user?.company?._id]);

  const loadReport = async () => {
    if (!queryParams.companyId) return;
    setLoading(true);
    try {
      const [poResponse, clientResponse, summaryResponse, businessResponse] = await Promise.all([
        getPOTaxReportApi(queryParams),
        getClientTaxReportApi(queryParams),
        getTaxSummaryApi(queryParams),
        getBusinessInsightsReportApi(queryParams.companyId, {
          financialYear: queryParams.financialYear,
          fromDate: queryParams.fromDate,
          toDate: queryParams.toDate,
          month: queryParams.month,
        }),
      ]);
      setPoReport(poResponse?.data || { items: [], summary: {} });
      setClientReport(clientResponse?.data || { items: [], summary: {} });
      setSummary(summaryResponse?.data || {});
      setMeta(summaryResponse?.meta || poResponse?.meta || null);
      setBusinessInsights(businessResponse?.data || {
        summary: {},
        expenseBreakdown: [],
        monthlyPerformance: [],
        ledgerImpactSummary: [],
      });
      setBusinessMeta(businessResponse?.meta || null);
    } catch (error) {
      console.error("Failed to load tax flow report", error);
      toast.error(error?.response?.data?.message || "Failed to load tax flow report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadFilterOptions = async () => {
      try {
        // Fetch all clients (global master data) - no companyId filter
        const [clientResponse, poResponse] = await Promise.all([
          getClientsApi(),
          getAllPurchaseOrdersApi(user.company._id),
        ]);
        if (!active) return;
        setClients(Array.isArray(clientResponse?.data) ? clientResponse.data : []);
        setPurchaseOrders(Array.isArray(poResponse?.data) ? poResponse.data : []);
      } catch (error) {
        console.error("Failed to load tax report filters", error);
        toast.error("Failed to load tax report filters");
      }
    };

    loadFilterOptions();
    return () => {
      active = false;
    };
  }, [user?.company?._id]);

  useEffect(() => {
    loadReport();
  }, [queryParams]);

  const handleFilterChange = (key, value) => {
    if (key === "financialYear") {
      const endingYear = Number.parseInt(String(value).split("-")[0], 10) + 1;
      if (Number.isInteger(endingYear)) {
        setSelectedFinancialYearEnding(endingYear);
      }
    }

    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "clientId" ? { poId: "" } : {}),
    }));
  };

  const poRows = useMemo(() => poReport?.items || [], [poReport]);
  const clientRows = useMemo(
    () => mergeClientRowsByName(clientReport?.items || []),
    [clientReport]
  );
  const visibleRows = activeTab === "po" ? poRows : clientRows;

  const tdsSettledPct = percent(summary.totalTDSPaid, summary.totalTDSDeducted);
  const collectionPct = percent(summary.totalSettledAmount, summary.totalInvoiceAmount);

  const businessSummary = {
    totalInvoiced: summary.totalInvoiceAmount || 0,
    received: summary.totalSettledAmount || 0,
    pending: summary.totalPendingAmount || 0,
  };

  const gstSummary = {
    igst: summary.totalIGST || 0,
    cgst: summary.totalCGST || 0,
    sgst: summary.totalSGST || 0,
    totalGenerated: summary.totalGSTGenerated || 0,
    collected: summary.totalGSTPaid || 0,
    pending: summary.totalGSTPending || 0,
  };

  const tdsSummary = {
    totalDeducted: summary.totalTDSDeducted || 0,
    settled: summary.totalTDSPaid || 0,
    pending: summary.totalTDSPending || 0,
  };

  const toggleRow = (key) => {
    setExpandedRows((current) => ({ ...current, [key]: !current[key] }));
  };

  const exportReport = () => {
    let rows = [];
    if (activeTab === "po") {
      rows = poRows.map((row) => ({
        "PO Number": row.poNumber,
        Type: row.poType,
        Party: row.clientName,
        "Invoice Amount": row.totalInvoiceAmount,
        "GST Total": row.gstGenerated,
        "GST Collected": row.gstPaid,
        TDS: row.tdsDeducted,
        Paid: row.totalPaid,
        Pending: row.pendingAmount,
      }));
    } else if (activeTab === "client") {
      rows = clientRows.map((row) => ({
        "Client / Vendor": row.clientName,
        "PO Count": row.poCount,
        "Invoice Count": row.invoiceCount,
        "Invoice Amount": row.totalInvoiceAmount,
        "GST Total": row.totalGST,
        "GST Collected": row.totalGSTCollected,
        TDS: row.totalTDS,
        Received: row.totalReceived,
        Pending: row.pendingAmount,
      }));
    } else if (activeTab === "ledger") {
      rows = (businessInsights.ledgerImpactSummary || []).map((row) => ({
        Ledger: row.ledger,
        Group: row.group,
        Debit: row.debit,
        Credit: row.credit,
        "Closing Balance": row.closingBalance,
      }));
    } else {
      rows = (businessInsights.monthlyPerformance || []).map((row) => ({
        Month: row.label,
        Income: row.income,
        Expense: row.expense,
        Profit: row.profit,
      }));
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      activeTab === "po"
        ? "PO Tax Report"
        : activeTab === "client"
          ? "Client Tax Report"
          : activeTab === "ledger"
            ? "Ledger Report"
            : "Business Insights"
    );
    XLSX.writeFile(workbook, `tax-flow-${activeTab}-${dayjs().format("YYYY-MM-DD")}.xlsx`);
  };

  return (
    <div className="min-h-screen  text-slate-800">
      <div className="border-b border-[#eadfce] ">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl border border-[#e4d8c7] bg-white">
              <FileText size={18} className="text-slate-500" />
            </div>
            <div>
              <div className="text-[28px] font-semibold tracking-[-0.02em] text-slate-800">GST &amp; TDS Tax Flow Report</div>
              <div className="text-sm text-slate-500">Track tax generation, collection, and pending amounts</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadReport}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4d8c7] bg-white px-4 text-sm font-medium text-slate-700 hover:bg-[#faf7f2]"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportReport}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4d8c7] bg-white px-4 text-sm font-medium text-slate-700 hover:bg-[#faf7f2]"
            >
              <Download size={15} />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-6 py-5">
        <div className="rounded-2xl border border-[#e7dccd] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-slate-700">
            <Filter size={14} className="text-slate-400" />
            Filters
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <InputField label="Financial Year">
              <SelectInput value={filters.financialYear} onChange={(e) => handleFilterChange("financialYear", e.target.value)}>
                {fyOptions.map((option) => (
                  <option key={option} value={option}>
                    {`FY ${option}`} {Number.parseInt(option.slice(0, 4), 10) + 1 === currentFinancialYearEnding ? "(Current)" : ""}
                  </option>
                ))}
              </SelectInput>
            </InputField>

            <InputField label="Month">
              <SelectInput value={filters.month} onChange={(e) => handleFilterChange("month", e.target.value)}>
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </InputField>

            <InputField label="From Date">
              <TextInput type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} />
            </InputField>

            <InputField label="To Date">
              <TextInput type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} />
            </InputField>

            <InputField label="Client / Vendor">
              <SelectInput value={filters.clientId} onChange={(e) => handleFilterChange("clientId", e.target.value)}>
                <option value="">All Parties</option>
                {clients.map((client) => (
                  <option key={client._id} value={client._id}>
                    {client.clientName}
                  </option>
                ))}
              </SelectInput>
            </InputField>

            <InputField label="PO Number">
              <SelectInput value={filters.poId} onChange={(e) => handleFilterChange("poId", e.target.value)}>
                <option value="">All POs</option>
                {purchaseOrders.map((po) => (
                  <option key={po._id} value={po._id}>
                    {po.poNumber}
                  </option>
                ))}
              </SelectInput>
            </InputField>
          </div>
        </div>

        {(activeTab === "po" || activeTab === "client") ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <SummaryCard
              title="GST Summary"
              icon={<IndianRupee />}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-500"
            >
              <div className="grid grid-cols-3 gap-2">
                <TinyMetric label="IGST" value={gstSummary.igst} />
                <TinyMetric label="CGST" value={gstSummary.cgst} />
                <TinyMetric label="SGST" value={gstSummary.sgst} />
              </div>
              <div className="mt-5 space-y-3">
                <SummaryRow label="Total Generated" value={gstSummary.totalGenerated} tone="slate" icon={<TrendingUp size={12} className="text-slate-400" />} />
                <SummaryRow label="Collected" value={gstSummary.collected} tone="green" icon={<TrendingDown size={12} className="text-emerald-400" />} />
                <SummaryRow label="Pending" value={gstSummary.pending} tone="amber" icon={<CalendarDays size={12} className="text-amber-400" />} />
              </div>
            </SummaryCard>

            <SummaryCard
              title="TDS Summary"
              icon={<FileText />}
              iconBg="bg-sky-50"
              iconColor="text-sky-500"
            >
              <div className="space-y-3">
                <SummaryRow label="Total Deducted" value={tdsSummary.totalDeducted} tone="slate" icon={<TrendingUp size={12} className="text-slate-400" />} />
                <SummaryRow label="Settled" value={tdsSummary.settled} tone="green" icon={<TrendingDown size={12} className="text-emerald-400" />} />
                <SummaryRow label="Pending" value={tdsSummary.pending} tone="amber" icon={<CalendarDays size={12} className="text-amber-400" />} />
              </div>
              <ProgressBar value={tdsSettledPct} color="bg-emerald-500" label={`${tdsSettledPct}% Settled`} />
            </SummaryCard>

            <SummaryCard
              title="Business Summary"
              icon={<IndianRupee />}
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
            >
              <div className="space-y-3">
                <SummaryRow label="Total Invoiced" value={businessSummary.totalInvoiced} tone="slate" icon={<TrendingUp size={12} className="text-slate-400" />} />
                <SummaryRow label="Received" value={businessSummary.received} tone="green" icon={<TrendingDown size={12} className="text-emerald-400" />} />
                <SummaryRow label="Pending" value={businessSummary.pending} tone="red" icon={<CalendarDays size={12} className="text-rose-400" />} />
              </div>
              <ProgressBar value={collectionPct} color="bg-emerald-500" label={`${collectionPct}% Collected`} />
            </SummaryCard>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <SummaryCard title="Total Income" icon={<IndianRupee />} iconBg="bg-emerald-50" iconColor="text-emerald-500">
              <div className="text-3xl font-bold text-slate-800">{amount(businessInsights.summary?.totalIncome)}</div>
              <div className="mt-2 text-sm text-slate-500">Credit entries of income ledgers</div>
            </SummaryCard>
            <SummaryCard title="Total Expense" icon={<IndianRupee />} iconBg="bg-amber-50" iconColor="text-amber-500">
              <div className="text-3xl font-bold text-slate-800">{amount(businessInsights.summary?.totalExpense)}</div>
              <div className="mt-2 text-sm text-slate-500">Debit entries of expense ledgers</div>
            </SummaryCard>
            <SummaryCard title="Net Profit / Loss" icon={<IndianRupee />} iconBg="bg-sky-50" iconColor="text-sky-500">
              <div className={`text-3xl font-bold ${Number(businessInsights.summary?.netProfit) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {amount(businessInsights.summary?.netProfit)}
              </div>
              <div className="mt-2 text-sm text-slate-500">Income minus expense</div>
            </SummaryCard>
            <SummaryCard title="Cash / Bank Balance" icon={<IndianRupee />} iconBg="bg-violet-50" iconColor="text-violet-500">
              <div className="text-3xl font-bold text-slate-800">{amount(businessInsights.summary?.cashBankBalance)}</div>
              <div className="mt-2 text-sm text-slate-500">Optional cash and bank snapshot</div>
            </SummaryCard>
          </div>
        )}

        <div className="mt-5 inline-flex rounded-xl border border-[#e7dccd] bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <button
            type="button"
            onClick={() => setActiveTab("po")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "po" ? "bg-[#f3ece1] text-slate-800" : "text-slate-500"}`}
          >
            PO-Based Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("client")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "client" ? "bg-[#f3ece1] text-slate-800" : "text-slate-500"}`}
          >
            Client / Vendor Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ledger")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "ledger" ? "bg-[#f3ece1] text-slate-800" : "text-slate-500"}`}
          >
            Ledger Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("insights")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "insights" ? "bg-[#f3ece1] text-slate-800" : "text-slate-500"}`}
          >
            Business Insights
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-slate-800">
              {activeTab === "po"
                ? "Purchase Order Tax Report"
                : activeTab === "client"
                  ? "Client / Vendor Tax Report"
                  : activeTab === "ledger"
                    ? "Ledger Impact Report"
                    : "Business Insights"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {activeTab === "po"
                ? "View GST and TDS breakdown by purchase order with invoice drill-down"
                : activeTab === "client"
                  ? "View GST and TDS breakdown by client or vendor with PO consolidation"
                  : activeTab === "ledger"
                    ? "Ledger-level debit, credit, and closing balance summary from accounting journals"
                    : "Simple management summary derived only from journal and ledger data"}
            </p>
          </div>
          <div className="text-sm text-slate-500">
            {activeTab === "ledger"
              ? `Showing ${(businessInsights.ledgerImpactSummary || []).length} Ledgers`
              : activeTab === "insights"
                ? `Showing ${(businessInsights.monthlyPerformance || []).length} Months`
                : `Showing ${visibleRows.length} ${activeTab === "po" ? "POs" : "Parties"}`}
          </div>
        </div>

        {(activeTab === "po" || activeTab === "client") && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e7dccd] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="min-w-full">
            <thead className="bg-[#faf7f2] text-left text-[12px] font-semibold text-slate-600">
              <tr>
                <th className="w-10 px-3 py-4" />
                <th className="px-3 py-4">{activeTab === "po" ? "PO Number" : "Client / Vendor"}</th>
                <th className="px-3 py-4">Type</th>
                <th className="px-3 py-4">{activeTab === "po" ? "Party" : "PO / Invoice Count"}</th>
                <th className="px-3 py-4 text-right">Invoice Amount</th>
                <th className="px-3 py-4 text-right">GST Total</th>
                <th className="px-3 py-4 text-right">GST Collected</th>
                <th className="px-3 py-4 text-right">TDS</th>
                <th className="px-3 py-4 text-right">Paid</th>
                <th className="px-3 py-4 text-right">Pending</th>
                <th className="px-3 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-14 text-center text-sm text-slate-500">
                    Loading report...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-10 text-center text-sm text-slate-500">
                    <div>No invoice data found for the selected filters. GST, TDS, and PO totals are based on invoices.</div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("ledger")}
                      className="mt-3 font-semibold text-blue-600 hover:text-blue-700"
                    >
                      View journal-backed Ledger Report
                    </button>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const isPO = activeTab === "po";
                  const key = isPO ? row.poId || row.poNumber : row.clientId || row.clientName;
                  const invoiceAmount = Number(row.totalInvoiceAmount || 0);
                  const gstTotal = isPO ? Number(row.gstGenerated || 0) : Number(row.totalGST || 0);
                  const gstCollected = isPO
                    ? Number(row.gstPaid || 0)
                    : Number(row.totalGSTCollected || 0);
                  const tdsValue = isPO ? row.tdsDeducted : row.totalTDS;
                  const paidValue = isPO ? row.totalPaid : row.totalReceived;
                  const pendingValue = row.pendingAmount || 0;
                  const status = pendingValue <= 0 ? "paid" : paidValue > 0 ? "partial" : "pending";
                  const invoices = isPO
                    ? row.invoices || []
                    : (row.poGroups || []).flatMap((group) => group.invoices || []);
                  const typeValue = isPO
                    ? row.poType
                    : row.poGroups?.some((group) => String(group.poType).toLowerCase() === "payable")
                      ? "Payable"
                      : "Receivable";

                  return (
                    <React.Fragment key={key}>
                      <tr className="border-t border-[#f0e8dc] text-sm">
                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() => toggleRow(key)}
                            className="flex h-5 w-5 items-center justify-center text-slate-400"
                          >
                            {expandedRows[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-3 py-4 font-semibold text-slate-700">{isPO ? row.poNumber : row.clientName}</td>
                        <td className="px-3 py-4">
                          <span className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase ${typeBadge(typeValue)}`}>
                            {typeValue}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-slate-700">
                          {isPO ? (
                            row.clientName
                          ) : (
                            <div>
                              <div>{row.poCount || 0} POs</div>
                              <div className="text-xs text-slate-400">{row.invoiceCount || 0} invoices</div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right font-semibold text-slate-700">{amount(invoiceAmount)}</td>
                        <td className="px-3 py-4 text-right font-semibold text-slate-700">{amount(gstTotal)}</td>
                        <td className="px-3 py-4 text-right font-semibold text-emerald-600">{amount(gstCollected)}</td>
                        <td className="px-3 py-4 text-right font-semibold text-slate-700">{amount(tdsValue)}</td>
                        <td className="px-3 py-4 text-right font-semibold text-emerald-600">{amount(paidValue)}</td>
                        <td className="px-3 py-4 text-right font-semibold text-rose-500">{amount(pendingValue)}</td>
                        <td className="px-3 py-4 text-center">
                          <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-semibold ${statusBadge(status)}`}>
                            {status === "paid" ? "Fully Paid" : status === "partial" ? "Partially Paid" : "Pending"}
                          </span>
                        </td>
                      </tr>

                      {expandedRows[key] && <tr><td colSpan={11} className="p-0"><InvoiceDrilldown invoices={invoices} /></td></tr>}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {activeTab === "ledger" && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#e7dccd] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <table className="min-w-full">
              <thead className="bg-[#faf7f2] text-left text-[12px] font-semibold text-slate-600">
                <tr>
                  <th className="w-10 px-4 py-4" />
                  <th className="px-4 py-4">Ledger</th>
                  <th className="px-4 py-4">Group</th>
                  <th className="px-4 py-4 text-right">Debit</th>
                  <th className="px-4 py-4 text-right">Credit</th>
                  <th className="px-4 py-4 text-right">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-500">Loading ledger report...</td>
                  </tr>
                ) : (businessInsights.ledgerImpactSummary || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-500">No ledger data found for the selected period.</td>
                  </tr>
                ) : (
                  (businessInsights.ledgerImpactSummary || []).map((row) => {
                    const key = `ledger:${row.ledgerId || `${row.ledger}-${row.group}`}`;

                    return (
                      <React.Fragment key={key}>
                        <tr className="border-t border-[#f0e8dc] text-sm">
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => toggleRow(key)}
                              className="flex h-5 w-5 items-center justify-center text-slate-400"
                            >
                              {expandedRows[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold text-slate-700">{row.ledger}</div>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${ledgerTypeBadge(row.ledgerType)}`}>
                                {formatLedgerTypeLabel(row.ledgerType)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span>{row.ledgerCode || "—"}</span>
                              <span>•</span>
                              <span>{row.transactionCount || 0} entries</span>
                              {!!row.paymentCount && (
                                <>
                                  <span>•</span>
                                  <span>{row.paymentCount} payments</span>
                                </>
                              )}
                              {!!row.invoiceCount && (
                                <>
                                  <span>•</span>
                                  <span>{row.invoiceCount} invoices</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{row.group}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-700">{amount(row.debit)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-700">{amount(row.credit)}</td>
                          <td className={`px-4 py-4 text-right font-semibold ${Number(row.closingBalance) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {amount(row.closingBalance)}
                          </td>
                        </tr>

                        {expandedRows[key] && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <LedgerDrilldown row={row} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "insights" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-4">
              <FooterStat title="Total Income" value={amount(businessInsights.summary?.totalIncome)} note="Credit entries of income ledgers" tone="green" />
              <FooterStat title="Total Expense" value={amount(businessInsights.summary?.totalExpense)} note="Debit entries of expense ledgers" tone="amber" />
              <FooterStat title="Net Profit / Loss" value={amount(businessInsights.summary?.netProfit)} note="Income minus expense" tone={Number(businessInsights.summary?.netProfit) >= 0 ? "green" : "red"} />
              <FooterStat title="Cash / Bank Balance" value={amount(businessInsights.summary?.cashBankBalance)} note="Optional cash and bank snapshot" tone="green" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-[#e7dccd] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="border-b border-[#f0e8dc] bg-[#faf7f2] px-5 py-4 text-sm font-semibold text-slate-700">Expense Breakdown</div>
                <table className="min-w-full">
                  <thead className="text-left text-[12px] font-semibold text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(businessInsights.expenseBreakdown || []).length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-5 py-10 text-center text-sm text-slate-500">No expense data found.</td>
                      </tr>
                    ) : (
                      (businessInsights.expenseBreakdown || []).map((row) => (
                        <tr key={row.category} className="border-t border-[#f0e8dc] text-sm">
                          <td className="px-5 py-3 text-slate-700">{row.category}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-700">{amount(row.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#e7dccd] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="border-b border-[#f0e8dc] bg-[#faf7f2] px-5 py-4 text-sm font-semibold text-slate-700">Monthly Performance</div>
                <table className="min-w-full">
                  <thead className="text-left text-[12px] font-semibold text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Month</th>
                      <th className="px-5 py-3 text-right">Income</th>
                      <th className="px-5 py-3 text-right">Expense</th>
                      <th className="px-5 py-3 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(businessInsights.monthlyPerformance || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">No monthly performance data found.</td>
                      </tr>
                    ) : (
                      (businessInsights.monthlyPerformance || []).map((row) => (
                        <tr key={row.month} className="border-t border-[#f0e8dc] text-sm">
                          <td className="px-5 py-3 text-slate-700">{row.label}</td>
                          <td className="px-5 py-3 text-right font-semibold text-emerald-600">{amount(row.income)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-amber-600">{amount(row.expense)}</td>
                          <td className={`px-5 py-3 text-right font-semibold ${Number(row.profit) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{amount(row.profit)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(activeTab === "insights" || activeTab === "ledger") ? (
            <>
              <FooterStat title="Top Expense Bucket" value={amount(businessInsights.expenseBreakdown?.[0]?.amount)} note={businessInsights.expenseBreakdown?.[0]?.category || "No expense category"} tone="amber" />
              <FooterStat title="Total Expense Ledgers" value={`${(businessInsights.expenseBreakdown || []).length}`} note="Distinct expense ledgers in period" tone="amber" />
              <FooterStat title="Loss Risk" value={amount(Math.max(0, -(Number(businessInsights.summary?.netProfit) || 0)))} note="Shown only when net result is negative" tone="red" />
              <FooterStat title={activeTab === "ledger" ? "Cash / Bank Balance" : "Net Margin"} value={activeTab === "ledger" ? amount(businessInsights.summary?.cashBankBalance) : `${percent(businessInsights.summary?.netProfit, businessInsights.summary?.totalIncome)}%`} note={activeTab === "ledger" ? "From cash and bank ledgers" : "Profit as % of income"} tone="green" />
            </>
          ) : (
            <>
              <FooterStat title="Pending GST" value={amount(summary.totalGSTPending)} note="GST yet to be collected" tone="amber" />
              <FooterStat title="Pending TDS" value={amount(summary.totalTDSPending)} note="TDS yet to be settled" tone="amber" />
              <FooterStat title="Receivables Pending" value={amount(summary.totalPendingAmount)} note="Amount yet to be received" tone="red" />
              <FooterStat title="Collection Rate" value={`${collectionPct}%`} note="Of total invoiced amount" tone="green" />
            </>
          )}
        </div>

        {(activeTab === "po" || activeTab === "client") && meta?.taxPaidMethod && (
          <div className="mt-6 rounded-2xl border border-[#e7dccd] bg-white px-5 py-4 text-sm text-slate-500">
            {meta.taxPaidMethod}
          </div>
        )}

        {(activeTab === "ledger" || activeTab === "insights") && businessMeta?.source && (
          <div className="mt-6 rounded-2xl border border-[#e7dccd] bg-white px-5 py-4 text-sm text-slate-500">
            Derived only from Accounting Module journals, ledgers, and ledger groups for {businessMeta.financialYear}.
          </div>
        )}
      </div>
    </div>
  );
}
