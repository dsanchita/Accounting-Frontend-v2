import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X, Copy, Filter, ChevronDown, ChevronUp, User, Building,
  ArrowDownLeft, ArrowUpRight, FileText, Hash,
  Calendar, Tag, Wallet, CheckCircle2, AlertCircle, Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";
import { getLedgerApi } from "../apis/accountApi";
import { formatCamelCase, formatCurrency } from "../utils/formatUtil";
import LoadingComponent from "./LoadingComponent";
import JournalPopupModal from "../modals/JournalPopupModal";

/* ─── colour helpers ──────────────────────────────────── */
const BALANCE_COLORS = {
  DEBIT:   { pill: "bg-blue-100 text-blue-700 border-blue-200",     dot: "bg-blue-500",   accent: "#2563eb", light: "#eff6ff" },
  CREDIT:  { pill: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500", accent: "#7c3aed", light: "#f5f3ff" },
  NEUTRAL: { pill: "bg-slate-100 text-slate-600 border-slate-200",   dot: "bg-slate-400",  accent: "#64748b", light: "#f8fafc" },
};
const getBC = (t) => BALANCE_COLORS[(t || "").toUpperCase()] || BALANCE_COLORS.NEUTRAL;

/* ─── single entry row ────────────────────────────────── */
const bankKeywordPattern = /\b(bank|sbi|hdfc|icici|axis|kotak|pnb|canara|bob|boi|union bank|indusind|idfc|yes bank)\b/i;

const isBankLikeLedger = (account) => {
  const groupName = account?.groupName || "";
  const accountName = account?.name || "";
  return bankKeywordPattern.test(groupName) || bankKeywordPattern.test(accountName);
};

const getReconciliationUi = (entry) => {
  const unreconciledAmount = Number(entry?.unreconciledAmount || 0);
  const allocatedAmount = Number(entry?.allocatedAmount || 0);

  if (entry?.isReconciled && unreconciledAmount === 0) {
    return {
      label: "Reconciled",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      amountClass: "text-emerald-700",
      dateClass: "text-emerald-700",
      timeClass: "text-emerald-500",
      detail: null,
    };
  }

  if (allocatedAmount > 0 && unreconciledAmount > 0) {
    return {
      label: "Partially Reconciled",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      amountClass: "text-amber-700",
      dateClass: "text-amber-700",
      timeClass: "text-amber-500",
      detail: `Reconciled ${formatCurrency(allocatedAmount)} • Unreconciled ${formatCurrency(unreconciledAmount)}`,
    };
  }

  return {
    label: "Unreconciled",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    amountClass: "text-slate-700",
    dateClass: "text-slate-700",
    timeClass: "text-slate-400",
    detail: null,
  };
};

const formatEntryDate = (dateValue) => {
  if (!dateValue) return "—";
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
    const [y, m, d] = dateValue.trim().split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatEntryTime = (dateValue) => {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return null;
  }
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

const EntryRow = ({ entry, type, onOpenJournal, isMatch, showReconciliation }) => (
  <>
    {entry.counters?.map((counter, ci) => (
      (() => {
        const reconciliationUi = showReconciliation ? getReconciliationUi(entry) : null;
        const amountColorClass = showReconciliation
          ? reconciliationUi?.amountClass || "text-slate-700"
          : type === "debit"
            ? "text-blue-700"
            : "text-violet-700";

        return (
          <tr
            key={ci}
            className={`group transition-colors ${
              isMatch ? "bg-amber-50/80 border-l-2 border-amber-400" : "hover:bg-slate-50/80"
            }`}
          >
        {/* Date */}
        <td className="px-4 py-3 whitespace-nowrap align-top">
          <div className={`text-[11px] font-bold ${reconciliationUi?.dateClass || "text-slate-700"}`}>
            {formatEntryDate(entry.date)}
          </div>
          {formatEntryTime(entry.createdAt) ? (
            <div className={`text-[10px] font-mono ${reconciliationUi?.timeClass || "text-slate-400"}`}>
              {formatEntryTime(entry.createdAt)}
            </div>
          ) : null}
        </td>

        {/* Particulars */}
        <td className="px-4 py-3 align-top">
          <div className="text-[11px] font-semibold text-slate-800">
            <span className="text-slate-400">{type === "debit" ? "To " : "By "}</span>
            {counter.account}
            {entry.sourceType && entry.referenceNumber && (
              <>
                <span className="text-slate-300 mx-1.5">·</span>
                <span className="text-slate-400">{entry.sourceType} </span>
                <button
                  onClick={() => onOpenJournal(entry.referenceNumber)}
                  className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-bold"
                >
                  {entry.referenceNumber}
                </button>
              </>
            )}
            {entry.partyName && (
              <>
                <span className="text-slate-300 mx-1.5">·</span>
                <span className="text-slate-500 font-medium">{entry.partyName}</span>
              </>
            )}
          </div>
          {entry.narration && (
            <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{entry.narration}</div>
          )}
          {entry.externalDocNo && (
            <div className="text-[10px] text-slate-400 font-mono">Ref: {entry.externalDocNo}</div>
          )}
          {showReconciliation && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={`rounded-full border px-2 py-0.5 font-bold ${reconciliationUi.badgeClass}`}>
                {reconciliationUi.label}
              </span>
              {reconciliationUi.detail ? (
                <span className={`font-bold ${reconciliationUi.amountClass}`}>
                  {reconciliationUi.detail}
                </span>
              ) : null}
            </div>
          )}
          {isMatch && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold mt-0.5">
              <Filter size={9} /> Matches filter
            </div>
          )}
        </td>

        {/* Amount */}
        <td className="px-4 py-3 text-right whitespace-nowrap align-top">
          <span className={`text-[12px] font-black tabular-nums ${amountColorClass}`}>
            {formatCurrency(type === "debit" ? counter.credit : counter.debit)}
          </span>
        </td>
          </tr>
        );
      })()
    ))}
  </>
);

/* ─── collapsible section ─────────────────────────────── */
const Section = ({ title, badge, badgeColor = "slate", children, defaultOpen = true, highlight = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const dotCls =
    badgeColor === "blue" ? "bg-blue-500" :
    badgeColor === "violet" ? "bg-violet-500" :
    badgeColor === "amber" ? "bg-amber-400" : "bg-slate-400";
  const badgeCls =
    badgeColor === "blue" ? "bg-blue-500" :
    badgeColor === "violet" ? "bg-violet-500" : "bg-slate-400";

  return (
    <div className={`rounded-2xl border overflow-hidden ${highlight ? "border-amber-200" : "border-slate-200"}`}>
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors ${
          highlight ? "bg-amber-50 hover:bg-amber-100/60" : "bg-slate-50 hover:bg-slate-100/60"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${dotCls}`} />
          <span className={`text-xs font-extrabold uppercase tracking-wider ${highlight ? "text-amber-800" : "text-slate-700"}`}>
            {title}
          </span>
          {badge != null && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black text-white ${badgeCls}`}>{badge}</span>
          )}
        </div>
        {open
          ? <ChevronUp size={15} className="text-slate-400" />
          : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="p-5 border-t border-slate-100 bg-white">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── entry table ─────────────────────────────────────── */
const EntryTable = ({ entries, type, onOpenJournal, matchFn, hasFilter, showReconciliation }) => {
  if (!entries.length) return null;
  const total = entries.reduce((s, e) => s + (type === "debit" ? e.debit : e.credit), 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "linear-gradient(90deg,#f1f5f9,#e0e7ff)" }}>
            <th className="px-4 py-2.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest w-32">Date</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Particulars</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest w-28">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {entries.map((entry, i) => (
            <EntryRow
              key={i}
              entry={entry}
              type={type}
              onOpenJournal={onOpenJournal}
              isMatch={hasFilter && matchFn(entry)}
              showReconciliation={showReconciliation}
            />
          ))}
        </tbody>
        <tfoot>
          <tr style={{
            background: type === "debit"
              ? "linear-gradient(90deg,#eff6ff,#dbeafe)"
              : "linear-gradient(90deg,#f5f3ff,#ede9fe)"
          }}>
            <td colSpan={2} className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${
              type === "debit" ? "text-blue-700" : "text-violet-700"
            }`}>
              Total {type === "debit" ? "Debit" : "Credit"}
            </td>
            <td className={`px-4 py-2.5 text-right text-[12px] font-black tabular-nums ${
              type === "debit" ? "text-blue-700" : "text-violet-700"
            }`}>
              {formatCurrency(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   MODAL COMPONENT
══════════════════════════════════════════════════════ */
export default function LedgerDetailModal({ account, onClose, onUpdate, advancedFilters, onEditRequested }) {
  const { user } = useAuth();
  const [ledgerData, setLedgerData]       = useState(null);
  const [loading, setLoading]             = useState(false);
  const [journalSearch, setJournalSearch] = useState("");
  const [openJournalPopup, setOpenJournalPopup] = useState(false);
  const dateRange = advancedFilters?.dateRange;

  /* ── guard: don't render if no account ──────────────── */
  /* (also prevents the _id null crash)                   */
  const accountId = account?._id ?? null;

  /* ── fetch ledger ──────────────────────────────────── */
  useEffect(() => {
    if (!accountId) return;           // ← null guard fixes the crash
    const ctrl = new AbortController();
    const loadLedger = async () => {
      setLoading(true);
      setLedgerData(null);
      try {
        const res = await getLedgerApi(accountId, user?.company?._id, ctrl.signal, dateRange);
        setLedgerData(res.data);
      } catch (err) {
        if (err?.name !== "CanceledError" && err?.name !== "AbortError")
          toast.error(`Cannot fetch ledger for ${account?.name}`);
      } finally {
        setLoading(false);
      }
    };

    loadLedger();
    return () => ctrl.abort();
  }, [accountId, dateRange, user?.company?._id, account?.name]);

  /* ── filter helpers ────────────────────────────────── */
  const hasActiveFilters = useMemo(() => {
    if (!advancedFilters) return false;
    return Object.values(advancedFilters).some((f) => {
      if (Array.isArray(f)) return f.length > 0;
      if (typeof f === "object" && f !== null)
        return Object.values(f).some((v) => v !== null && v !== "");
      return f !== "" && f !== "both";
    });
  }, [advancedFilters]);

  const matchesAdvancedFilters = useCallback(
    (tx) => {
      if (!hasActiveFilters || !advancedFilters) return true;
      const af = advancedFilters;
      if (af.dateRange?.from || af.dateRange?.to) {
        const d = new Date(tx.date);
        if (af.dateRange.from && d < new Date(af.dateRange.from)) return false;
        if (af.dateRange.to) {
          const t2 = new Date(af.dateRange.to);
          t2.setHours(23, 59, 59, 999);
          if (d > t2) return false;
        }
      }
      if (af.amountRange?.min !== "" || af.amountRange?.max !== "") {
        const amt = tx.debit > 0 ? tx.debit : tx.credit;
        if (af.amountRange.min !== "" && amt < af.amountRange.min) return false;
        if (af.amountRange.max !== "" && amt > af.amountRange.max) return false;
      }
      if (af.amountType !== "both") {
        if (af.amountType === "debit"  && tx.debit  <= 0) return false;
        if (af.amountType === "credit" && tx.credit <= 0) return false;
      }
      if (af.journalIds?.length > 0 && tx.referenceNumber) {
        if (!af.journalIds.some((j) =>
          tx.referenceNumber.toLowerCase().includes(j.toLowerCase()))) return false;
      }
      if (af.partyName && tx.partyName &&
        !tx.partyName.toLowerCase().includes(af.partyName.toLowerCase())) return false;
      return true;
    },
    [advancedFilters, hasActiveFilters]
  );

  /* ── derived entries ───────────────────────────────── */
  const allDebit  = useMemo(() => ledgerData?.entries?.filter((e) => e.debit  > 0) ?? [], [ledgerData]);
  const allCredit = useMemo(() => ledgerData?.entries?.filter((e) => e.credit > 0) ?? [], [ledgerData]);
  const displayDebit  = hasActiveFilters ? allDebit.filter(matchesAdvancedFilters)  : allDebit;
  const displayCredit = hasActiveFilters ? allCredit.filter(matchesAdvancedFilters) : allCredit;

  const handleOpenJournal = useCallback((ref) => {
    setJournalSearch(ref);
    setOpenJournalPopup(true);
  }, []);

  const handleCopy = useCallback(() => {
    if (!account?.code) return;
    navigator.clipboard.writeText(account.code);
    toast.success("Account code copied!");
  }, [account]);

  /* ── early return AFTER all hooks ─────────────────── */
  if (!account) return null;

  const bc           = getBC(account.balanceType || account.type);
  const totalDebit   = allDebit.reduce((s, e)  => s + e.debit,  0);
  const totalCredit  = allCredit.reduce((s, e) => s + e.credit, 0);
  const closingBalance = ledgerData?.closingBalance ?? 0;
  const closingType    = ledgerData?.closingType    ?? "Dr";
  const showReconciliation = isBankLikeLedger(account);

  /* ════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════ */
  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        style={{ background: "rgba(15,23,42,0.62)", backdropFilter: "blur(6px)" }}
      >
        {/* Panel — max-w-5xl gives extra width */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{   opacity: 0, scale: 0.96, y: 20  }}
          transition={{ type: "spring", damping: 28, stiffness: 360 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
          style={{ boxShadow: "0 32px 80px rgba(15,23,42,0.28)" }}
        >
          {/* ── HEADER ──────────────────────────────── */}
          <div
            className="relative overflow-hidden px-7 pt-6 pb-5 shrink-0"
            style={{ background: `linear-gradient(135deg, ${bc.light} 0%, #ffffff 100%)` }}
          >
            {/* decorative blobs */}
            <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${bc.accent}, transparent)` }} />
            <div className="absolute -bottom-4 -left-4 w-28 h-28 rounded-full opacity-15 blur-2xl pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${bc.accent}, transparent)` }} />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* icon badge */}
                <div className="p-3 rounded-2xl shadow-lg shrink-0"
                  style={{ background: `linear-gradient(135deg, ${bc.accent}, ${bc.accent}bb)` }}>
                  <FileText size={20} className="text-white" />
                </div>

                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{account.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {/* Code copy */}
                    <button onClick={handleCopy}
                      className="flex items-center gap-1 font-mono text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-all">
                      <Hash size={9} /> {String(account.code || "").padStart(3, "0")}
                      <Copy size={8} className="ml-0.5 opacity-60" />
                    </button>
                    {/* Balance type */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${bc.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${bc.dot}`} />
                      {account.balanceType || account.type || "—"}
                    </span>
                    {/* Group */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-slate-100 text-slate-600 border-slate-200">
                      <Tag size={9} /> {account.groupName || "—"}
                    </span>
                    {hasActiveFilters && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-amber-100 text-amber-700 border-amber-200">
                        <Filter size={9} /> Filtered view
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onEditRequested && (
                  <button
                    onClick={() => onEditRequested(account)}
                    className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-blue-700 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 transition-all"
                  >
                    <Pencil size={12} /> Edit Ledger
                  </button>
                )}
                <button onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-all shrink-0">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ── Balance strip ─────────────────────── */}
            {!loading && (
              <div className="relative z-10 mt-5 grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Opening Balance",
                    value: ledgerData
                      ? `${formatCurrency(ledgerData.openingBalance)} (${ledgerData.openingType})`
                      : `${formatCurrency(account.openingBalance ?? 0)}`,
                    icon: <Wallet size={13} />,
                    color: "slate",
                  },
                  {
                    label: "Total Debit",
                    value: formatCurrency(totalDebit),
                    icon: <ArrowUpRight size={13} />,
                    color: "blue",
                  },
                  {
                    label: "Total Credit",
                    value: formatCurrency(totalCredit),
                    icon: <ArrowDownLeft size={13} />,
                    color: "violet",
                  },
                ].map((item) => (
                  <div key={item.label}
                    className="bg-white/80 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/70 shadow-sm">
                    <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest mb-1.5 ${
                      item.color === "blue"   ? "text-blue-600"   :
                      item.color === "violet" ? "text-violet-600" : "text-slate-500"
                    }`}>
                      {item.icon}{item.label}
                    </div>
                    <p className="text-[13px] font-black text-slate-800 tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Closing balance banner ─────────────── */}
          {!loading && ledgerData && (
            <div className="shrink-0 px-7 py-3 flex items-center justify-between border-b border-slate-100"
              style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
              <div className="flex items-center gap-2">
                {closingType === "Dr"
                  ? <CheckCircle2 size={14} className="text-emerald-500" />
                  : <AlertCircle  size={14} className="text-amber-500"   />}
                <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">
                  Closing Balance
                </span>
              </div>
              <span className="text-sm font-black text-slate-800 tabular-nums">
                {formatCurrency(closingBalance)}{" "}
                <span className={`text-[11px] font-black ${closingType === "Dr" ? "text-blue-600" : "text-violet-600"}`}>
                  ({closingType})
                </span>
              </span>
            </div>
          )}

          {/* ── Scrollable body ────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-slate-50/40 px-7 py-5 space-y-4">

            {loading && <div className="py-16"><LoadingComponent message="Loading ledger details…" /></div>}

            {!loading && (
              <>
                {/* Filter notice */}
                {hasActiveFilters && (
                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <Filter size={13} className="text-amber-600" />
                      <span className="text-xs font-bold text-amber-800">Showing filtered transactions only</span>
                    </div>
                    <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                      {displayDebit.length + displayCredit.length} of {allDebit.length + allCredit.length} entries
                    </span>
                  </div>
                )}

                {/* Account information */}
                <Section title="Account Information" badgeColor="slate" defaultOpen>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Account Type",     value: formatCamelCase(account.type),                                       icon: <Tag      size={11} /> },
                      { label: "Opening Balance",  value: formatCurrency(account.openingBalance ?? 0),                         icon: <Wallet   size={11} /> },
                      { label: "Created",          value: account.createdAt ? new Date(account.createdAt).toLocaleDateString("en-IN") : "N/A", icon: <Calendar size={11} /> },
                    ].map((item) => (
                      <div key={item.label} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                          {item.icon}{item.label}
                        </div>
                        <p className="text-xs font-bold text-slate-800">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Linked entities */}
                  {(account.linkedClientId || account.linkedVendorId) && (
                    <div className="mt-4 space-y-2">
                      {account.linkedClientId && (
                        <div className="flex items-center gap-3 p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                          <div className="p-1.5 bg-blue-100 rounded-xl">
                            <User size={13} className="text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {account.linkedClientId.clientName || account.linkedClientId.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">Linked Client</p>
                          </div>
                        </div>
                      )}
                      {account.linkedVendorId && (
                        <div className="flex items-center gap-3 p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
                          <div className="p-1.5 bg-emerald-100 rounded-xl">
                            <Building size={13} className="text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {account.linkedVendorId.vendorName || account.linkedVendorId.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">Linked Vendor</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Section>

                {/* Ledger summary */}
                {ledgerData && (
                  <Section title="Ledger Summary" badgeColor="slate" defaultOpen>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          label: "Debit Entries",
                          value: hasActiveFilters ? `${displayDebit.length} / ${allDebit.length}` : allDebit.length,
                          color: "blue",
                        },
                        {
                          label: "Credit Entries",
                          value: hasActiveFilters ? `${displayCredit.length} / ${allCredit.length}` : allCredit.length,
                          color: "violet",
                        },
                      ].map((item) => (
                        <div key={item.label}
                          className={`rounded-xl p-4 border ${
                            item.color === "blue"
                              ? "bg-blue-50/50 border-blue-100"
                              : "bg-violet-50/50 border-violet-100"
                          }`}>
                          <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${
                            item.color === "blue" ? "text-blue-600" : "text-violet-600"
                          }`}>
                            {item.label}
                          </p>
                          <p className={`text-2xl font-black ${
                            item.color === "blue" ? "text-blue-700" : "text-violet-700"
                          }`}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Debit entries */}
                {displayDebit.length > 0 && (
                  <Section
                    title="Debit Entries"
                    badge={hasActiveFilters ? `${displayDebit.length} of ${allDebit.length}` : displayDebit.length}
                    badgeColor="blue"
                    defaultOpen
                  >
                    <EntryTable
                      entries={displayDebit}
                      type="debit"
                      onOpenJournal={handleOpenJournal}
                      matchFn={matchesAdvancedFilters}
                      hasFilter={hasActiveFilters}
                      showReconciliation={showReconciliation}
                    />
                  </Section>
                )}

                {/* Credit entries */}
                {displayCredit.length > 0 && (
                  <Section
                    title="Credit Entries"
                    badge={hasActiveFilters ? `${displayCredit.length} of ${allCredit.length}` : displayCredit.length}
                    badgeColor="violet"
                    defaultOpen
                  >
                    <EntryTable
                      entries={displayCredit}
                      type="credit"
                      onOpenJournal={handleOpenJournal}
                      matchFn={matchesAdvancedFilters}
                      hasFilter={hasActiveFilters}
                      showReconciliation={showReconciliation}
                    />
                  </Section>
                )}

                {/* Filtered — nothing matches */}
                {hasActiveFilters && displayDebit.length === 0 && displayCredit.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-14 gap-3 bg-amber-50/60 rounded-2xl border border-amber-200">
                    <div className="p-3 rounded-2xl bg-amber-100">
                      <Filter size={22} className="text-amber-400" />
                    </div>
                    <p className="text-sm font-bold text-amber-800">No matching transactions</p>
                    <p className="text-xs text-amber-600 text-center max-w-xs">
                      No entries match your current filter criteria for this account
                    </p>
                  </div>
                )}

                {/* No transactions */}
                {!loading && (!ledgerData || ledgerData.entries?.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-100">
                      <FileText size={22} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">No transactions</p>
                    <p className="text-xs text-slate-400">No ledger entries found for this account</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ────────────────────────────── */}
          <div className="shrink-0 border-t border-slate-100 px-7 py-4 bg-slate-50/70 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-medium">
              Last updated:{" "}
              <span className="font-bold text-slate-600">
                {ledgerData?.updatedAt
                  ? new Date(ledgerData.updatedAt).toLocaleDateString("en-IN")
                  : "—"}
              </span>
              {hasActiveFilters && (
                <span className="ml-2 text-amber-500 font-bold">· Filtered view active</span>
              )}
            </p>
            <button onClick={onClose}
              className="flex items-center gap-1.5 px-5 py-2 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all">
              <X size={11} /> Close
            </button>
          </div>
        </motion.div>
      </motion.div>

      <JournalPopupModal
        open={openJournalPopup}
        initialSearch={journalSearch}
        onClose={() => { setOpenJournalPopup(false); setJournalSearch(""); }}
      />
    </>
  );
}
