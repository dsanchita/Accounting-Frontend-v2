import React, { useState, useEffect } from "react";
import { API } from "../apis/api";
import {
  deleteInvoiceApi,
  downloadInvoicePdfApi,
  downloadInvoiceWordApi,
  getInvoiceByIdApi,
  getInvoicePaymentsApi,
} from "../apis/invoice.api";
import dayjs from "dayjs";
import {
  X, FileText, User, Calendar, Package, CreditCard,
  Banknote, CheckCircle, AlertCircle, Download, Edit,
  Trash2, Mail, BookOpen, ExternalLink, ChevronRight,
  History, Printer, Copy, Receipt, Building, Truck,
  Clock, Tag,
} from "lucide-react";
import { toast } from "react-toastify";
import CreateLedgerFromInvoiceModal from "./CreateLedgerFromInvoiceModal";
import PaymentReceiptModal from "./PaymentReceiptModal";
import PaymentHistoryModal from "./PaymentHistoryModal";
import ConfirmationModal from "./ConfirmationModal";

/* ── helpers ───────────────────────────────────────────── */
const fmt  = (d) => d ? dayjs(d).format("DD MMM YYYY") : "—";
const fmtT = (d) => d ? dayjs(d).format("DD MMM YYYY, hh:mm A") : "—";
const fmtC = (amt, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: currency || "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amt || 0);

const STATUS_CFG = {
  active:   { label: "Active",   cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  inactive: { label: "Inactive", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  pending:  { label: "Pending",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  paid:     { label: "Paid",     cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  overdue:  { label: "Overdue",  cls: "bg-red-100 text-red-700 border-red-200" },
};

/* Small field */
const F = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
    <p className={`text-xs font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

/* Section card — identical to PO modal */
const Card = ({ title, icon: Icon, accent, children, extra }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100"
      style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
        <Icon size={13} className="text-slate-500" />
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title}</p>
      </div>
      {extra}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const TABS = ["details", "items", "journal", "payments"];

const HomeInvoiceDetails = ({ open, onClose, invoiceId, refreshInvoices }) => {
  const [invoice, setInvoice]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [showLedgerModal, setShowLedgerModal]   = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [tab, setTab]                           = useState("details");

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
      fetchLedgerEntries();
    }
  }, [open, invoiceId]);

  // Fetch payment history when payments tab is opened
  useEffect(() => {
    if (tab === "payments" && invoiceId && open) {
      fetchPaymentHistory();
    }
  }, [tab, invoiceId, open]);

  const fetchInvoiceDetails = async () => {
    setLoading(true);
    try {
      const response = await getInvoiceByIdApi(invoiceId);
      setInvoice(response?.data || null);
    } catch { toast.error("Failed to load invoice details"); }
    finally { setLoading(false); }
  };

  const fetchLedgerEntries = async () => {
    try {
      const response = await API.get(`/ledgers/by-invoice/${invoiceId}`);
      setLedgerEntries(response.data || []);
    } catch {}
  };

  const fetchPaymentHistory = async () => {
    setPaymentHistoryLoading(true);
    try {
      // Try dedicated payment history endpoint first
      const response = await getInvoicePaymentsApi(invoice?.companyId, invoiceId);
      const data = response?.data || [];
      setPaymentHistory(Array.isArray(data) ? data : []);
    } catch {
      // Fallback: use payments already on invoice object
      setPaymentHistory(invoice?.payments || []);
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  const calculateTotalTax = (inv) =>
    ((inv.totalCGSTAmount || 0) + (inv.totalSGSTAmount || 0) + (inv.totalIGSTAmount || 0)).toFixed(2);

  const getJournalEntryPreview = () => {
    if (!invoice) return [];
    const entries = [
      { account: "Sundry Debtors", client: invoice.billTo?.name, debit: invoice.amountDue, credit: 0 },
      { account: "Sales Account", debit: 0, credit: invoice.totalTaxableValue },
    ];
    if (invoice.totalCGSTAmount > 0) entries.push({ account: "CGST Payable", debit: 0, credit: invoice.totalCGSTAmount });
    if (invoice.totalSGSTAmount > 0) entries.push({ account: "SGST Payable", debit: 0, credit: invoice.totalSGSTAmount });
    if (invoice.totalIGSTAmount > 0) entries.push({ account: "IGST Payable", debit: 0, credit: invoice.totalIGSTAmount });
    return entries;
  };

  const handleLedgerCreated = (newLedger) => {
    toast.success(`Ledger "${newLedger.name}" created successfully!`);
    setShowLedgerModal(false);
    fetchInvoiceDetails();
    fetchLedgerEntries();
    if (refreshInvoices) refreshInvoices();
  };

  const handleRecordPayment = () => {
    if (!invoice.salesJournalId) {
      toast.error("Please post the sales journal first before recording payments");
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePaymentRecorded = (paymentData) => {
    toast.success(`Payment of ${fmtC(paymentData.receivedAmount)} recorded successfully!`);
    setShowPaymentModal(false);
    fetchInvoiceDetails();
    fetchPaymentHistory();
    if (refreshInvoices) refreshInvoices();
  };

  const handleDownloadPdf = async () => {
    try {
      const response = await downloadInvoicePdfApi(invoiceId);
      const url  = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoice.invoiceNo}.pdf`);
      document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      toast.success("PDF downloaded successfully");
    } catch { toast.error("Failed to download PDF"); }
  };

  const handleDownloadWord = async () => {
    try {
      const response = await downloadInvoiceWordApi(invoiceId);
      const url  = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoice.invoiceNo}.docx`);
      document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      toast.success("Word document downloaded successfully");
    } catch { toast.error("Failed to download Word document"); }
  };

  const handleDelete = async () => {
    try {
      await deleteInvoiceApi(invoiceId);
      toast.success("Invoice deleted successfully");
      setShowDeleteModal(false);
      onClose();
      if (refreshInvoices) refreshInvoices();
    } catch { toast.error("Failed to delete invoice"); }
  };

  const handleEmailInvoice = async () => {
    try {
      toast.info("Invoice email sending is not available in the current backend");
    } catch { toast.error("Failed to process invoice email action"); }
  };

  const calculatePaymentInfo = () => {
    if (!invoice) return { totalReceived: 0, pendingAmount: 0 };
    // use fetched paymentHistory if available, else fall back to invoice.payments
    const payments = paymentHistory.length > 0 ? paymentHistory : (invoice.payments || []);
    const totalReceived = payments.reduce((s, p) => s + (p.receivedAmount || p.amount || 0), 0);
    return { totalReceived, pendingAmount: Math.max(0, invoice.amountDue - totalReceived) };
  };

  if (!open) return null;

  const paymentInfo = calculatePaymentInfo();
  const currency    = invoice?.currency || "INR";
  const status      = invoice ? (STATUS_CFG[invoice.status] || STATUS_CFG.active) : null;
  const isFullyPaid = paymentInfo.pendingAmount <= 0.01;
  const journalEntries = getJournalEntryPreview();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-4 pt-6">
        <div
          className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}>

          {/* ── Gradient Header ── */}
          <div className="shrink-0 rounded-t-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: "linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)" }}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl border border-white/25">
                  <Receipt size={16} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-extrabold text-white tracking-tight">
                      {invoice?.invoiceNo ? `Invoice #${invoice.invoiceNo}` : "Invoice Details"}
                    </h2>
                    {status && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${status.cls}`}>
                        {status.label}
                      </span>
                    )}
                    {invoice?.salesJournalId && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-indigo-100 text-indigo-700 border-indigo-200">
                        ✓ Journal Posted
                      </span>
                    )}
                    {isFullyPaid && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-emerald-100 text-emerald-700 border-emerald-200">
                        ✓ Fully Paid
                      </span>
                    )}
                  </div>
                  {invoice && (
                    <p className="text-blue-200 text-[11px] mt-0.5">
                      Created {fmtT(invoice.createdAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Header actions */}
              <div className="flex items-center gap-1.5">
                <button onClick={() => invoice?.invoiceNo && navigator.clipboard.writeText(invoice.invoiceNo)}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Copy Invoice No">
                  <Copy size={14} />
                </button>
                <button onClick={() => window.print()}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Print">
                  <Printer size={14} />
                </button>
                <button onClick={handleDownloadPdf}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Download PDF">
                  <Download size={14} />
                </button>
                <button onClick={onClose}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Close">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white border-b border-slate-200 px-2">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all capitalize ${
                    tab === t
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}>
                  {t === "journal" ? "Journal Entries" : t === "items" ? "Items & Services" : t === "payments" ? "Payment History" : t}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                <p className="text-sm text-slate-400 font-medium">Loading invoice…</p>
              </div>
            )}

            {!loading && !invoice && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertCircle size={36} className="text-red-400" />
                <p className="text-sm font-semibold text-red-600">Invoice not found</p>
                <button onClick={fetchInvoiceDetails}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl"
                  style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}>
                  Try Again
                </button>
              </div>
            )}

            {!loading && invoice && (
              <>
                {/* ══ DETAILS TAB ══ */}
                {tab === "details" && (
                  <div className="space-y-4">
                    {/* Stat strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: "Amount Due",     value: fmtC(invoice.amountDue, currency),           g: "linear-gradient(135deg,#1e3a8a,#2563eb)", blob: "#93c5fd" },
                        { label: "Taxable Value",  value: fmtC(invoice.totalTaxableValue, currency),   g: "linear-gradient(135deg,#064e3b,#059669)", blob: "#6ee7b7" },
                        { label: "Paid",           value: fmtC(paymentInfo.totalReceived, currency),   g: isFullyPaid ? "linear-gradient(135deg,#064e3b,#059669)" : "linear-gradient(135deg,#92400e,#d97706)", blob: isFullyPaid ? "#6ee7b7" : "#fde68a" },
                      ].map((s, i) => (
                        <div key={i} className="relative overflow-hidden rounded-2xl p-4 shadow-md cursor-default"
                          style={{ background: s.g }}>
                          <div className="absolute -top-4 -right-4 w-16 h-12 rounded-full opacity-25 blur-xl"
                            style={{ background: `radial-gradient(ellipse,${s.blob},transparent)` }} />
                          <div className="absolute top-0 right-10 w-px h-full bg-white/15 rotate-12 scale-y-150" />
                          <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1 relative z-10">{s.label}</p>
                          <p className="text-sm font-black text-white relative z-10">{s.value}</p>
                          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                        </div>
                      ))}
                    </div>

	                    {/* Bill To + Ship To */}
	                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Card title="Bill To" icon={Building} accent="linear-gradient(180deg,#2563eb,#60a5fa)">
                        <div className="grid grid-cols-2 gap-3">
                          <F label="Name"    value={invoice.billTo?.name} />
                          <F label="State"   value={invoice.billTo?.state} />
                          <div className="col-span-2">
                            <F label="Address" value={invoice.billTo?.address} />
                          </div>
                          <F label="GSTIN"   value={invoice.billTo?.GSTIN} mono />
                          <F label="Contact" value={invoice.billTo?.contactPerson} />
                        </div>
                      </Card>

	                      <Card title="Ship To" icon={Truck} accent="linear-gradient(180deg,#059669,#34d399)">
	                        <div className="grid grid-cols-2 gap-3">
	                          <F label="Name"    value={invoice.shipTo?.name    || invoice.billTo?.name} />
	                          <div className="col-span-2">
	                            <F label="Address" value={invoice.shipTo?.address || invoice.billTo?.address} />
	                          </div>
	                        </div>
	                      </Card>
	                    </div>

	                    <Card title="PO Linkage" icon={Tag} accent="linear-gradient(180deg,#7c3aed,#a78bfa)">
	                      <div className="grid grid-cols-2 gap-3">
	                        <F label="PO Number" value={invoice.linkedPO?.poNumber || invoice.linkedPORef} mono />
	                        <F label="PO Reference" value={invoice.linkedPO?.poreferencevalue || invoice.poreferencevalue} mono />
	                        <F label="PO Status" value={invoice.poVisibility?.poStatus || invoice.linkedPO?.status} />
	                        <F
	                          label="Remaining PO Balance"
	                          value={fmtC(invoice.poVisibility?.remainingPoAmount || 0, currency)}
	                        />
	                      </div>
	                    </Card>

	                    {/* Financial Summary */}
	                    <Card title="Financial Summary" icon={CreditCard} accent="linear-gradient(180deg,#d97706,#fbbf24)">
                      <div className="space-y-3">
                        {/* Tax pills */}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { l: "CGST", v: fmtC(invoice.totalCGSTAmount, currency), cls: "border-blue-100 bg-blue-50/80 text-blue-700" },
                            { l: "SGST", v: fmtC(invoice.totalSGSTAmount, currency), cls: "border-violet-100 bg-violet-50/80 text-violet-700" },
                            { l: "IGST", v: fmtC(invoice.totalIGSTAmount, currency), cls: "border-emerald-100 bg-emerald-50/80 text-emerald-700" },
                          ].map((t) => (
                            <div key={t.l} className={`flex flex-col items-center px-3 py-2.5 rounded-xl border ${t.cls}`}>
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">{t.l}</span>
                              <span className="text-sm font-black">{t.v}</span>
                            </div>
                          ))}
                        </div>
                        {invoice.tdsAmount > 0 && (
                          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50/60">
                            <span className="text-xs font-bold text-purple-700">TDS Deducted</span>
                            <span className="text-sm font-black text-purple-700 tabular-nums">{fmtC(invoice.tdsAmount, currency)}</span>
                          </div>
                        )}
                        {/* Total bar */}
                        <div className="flex items-center justify-between rounded-xl px-5 py-3 border border-blue-200"
                          style={{ background: "linear-gradient(90deg,#eff6ff,#dbeafe)" }}>
                          <div>
                            <p className="text-xs font-black text-blue-900">Total Amount Due</p>
                            <div className="flex items-center gap-3 mt-1 text-[10px]">
                              <span className="text-blue-600 font-semibold">Date: {fmt(invoice.invoiceDate)}</span>
                              <span className="text-blue-500">·</span>
                              <span className="text-blue-600 font-semibold">Due: {fmt(invoice.dueDate)}</span>
                              <span className="text-blue-500">·</span>
                              <span className="text-blue-600 font-semibold">{invoice.paymentMode || "Bank Transfer"}</span>
                            </div>
                          </div>
                          <p className="text-xl font-black text-blue-900 tabular-nums">{fmtC(invoice.amountDue, currency)}</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {/* ══ ITEMS TAB ══ */}
                {tab === "items" && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#1e3a8a,#60a5fa)" }} />
                          <Package size={13} className="text-slate-500" />
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Items & Services</p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                            style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                            {invoice.items?.length || 0}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                              {["#", "Description", "HSN/SAC", "Qty", "Rate", "Taxable Value", "GST %", "Total"].map((h) => (
                                <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {invoice.items?.map((item, i) => (
                              <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-400">{i + 1}</td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{item.description}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{item.hsnSac || "—"}</span>
                                </td>
                                <td className="px-4 py-3 font-black text-slate-700 tabular-nums">{item.quantity}</td>
                                <td className="px-4 py-3 tabular-nums text-slate-700">{fmtC(item.rate, currency)}</td>
                                <td className="px-4 py-3 tabular-nums text-slate-700">{fmtC(item.taxableValue, currency)}</td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[10px] font-black">
                                    {item.gstRate}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-black text-slate-900 tabular-nums">{fmtC(item.total, currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                              <td colSpan={4} className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Totals</td>
                              <td className="px-4 py-3 font-black text-slate-700 tabular-nums">{fmtC(invoice.totalTaxableValue, currency)}</td>
                              <td className="px-4 py-3" />
                              <td className="px-4 py-3 font-black text-blue-700 tabular-nums text-sm">{fmtC(invoice.amountDue, currency)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ JOURNAL TAB ══ */}
                {tab === "journal" && (
                  <div className="space-y-4">
                    {/* Journal preview table */}
                    <Card title="Journal Entry Preview" icon={BookOpen} accent="linear-gradient(180deg,#2563eb,#60a5fa)">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Account</th>
                              <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Debit</th>
                              <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {journalEntries.map((entry, i) => (
                              <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <ChevronRight size={11} className="text-slate-400 shrink-0" />
                                    <span className="font-semibold text-slate-800">{entry.account}</span>
                                    {entry.client && <span className="text-[10px] text-slate-400 font-medium">({entry.client})</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {entry.debit > 0
                                    ? <span className="font-black text-red-600 tabular-nums">{fmtC(entry.debit, currency)}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {entry.credit > 0
                                    ? <span className="font-black text-emerald-600 tabular-nums">{fmtC(entry.credit, currency)}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                              <td className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Total</td>
                              <td className="px-4 py-3 text-right font-black text-red-600 tabular-nums">
                                {fmtC(journalEntries.reduce((s, e) => s + e.debit, 0), currency)}
                              </td>
                              <td className="px-4 py-3 text-right font-black text-emerald-600 tabular-nums">
                                {fmtC(journalEntries.reduce((s, e) => s + e.credit, 0), currency)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </Card>

                    {/* Ledger status */}
                    {ledgerEntries.length > 0 ? (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-emerald-800">Posted to Journal</p>
                              <p className="text-[11px] text-emerald-600 mt-0.5">This invoice has been posted to the general ledger</p>
                            </div>
                          </div>
                          <button onClick={() => window.open(`/accounting/ledger/${ledgerEntries[0]._id}`, "_blank")}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-xl hover:bg-emerald-200 transition-all">
                            <ExternalLink size={12} /> View Ledger
                          </button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-emerald-100 space-y-2">
                          {ledgerEntries.map((ledger, i) => (
                            <div key={i} className="flex items-center justify-between bg-white border border-emerald-100 rounded-xl px-3 py-2.5">
                              <div>
                                <p className="text-xs font-bold text-slate-800">{ledger.name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Posted: {dayjs(ledger.createdAt).format("DD MMM YYYY")}</p>
                              </div>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-full text-[10px] font-black">{ledger.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <AlertCircle size={16} className="text-amber-500 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-amber-800">Not Posted to Journal</p>
                              <p className="text-[11px] text-amber-600 mt-0.5">This invoice has not been posted to the general ledger yet</p>
                            </div>
                          </div>
                          <button onClick={() => setShowLedgerModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-xl hover:bg-amber-200 transition-all">
                            <BookOpen size={12} /> Post to Journal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ PAYMENTS TAB ══ */}
                {tab === "payments" && (
                  <div className="space-y-4">
                    {/* Payment stats */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Total Received", value: fmtC(paymentInfo.totalReceived, currency), g: "linear-gradient(135deg,#064e3b,#059669)", blob: "#6ee7b7" },
                        { label: "Pending Amount", value: fmtC(paymentInfo.pendingAmount, currency),  g: isFullyPaid ? "linear-gradient(135deg,#064e3b,#059669)" : "linear-gradient(135deg,#92400e,#d97706)", blob: "#fde68a" },
                      ].map((s, i) => (
                        <div key={i} className="relative overflow-hidden rounded-2xl p-4 shadow-md"
                          style={{ background: s.g }}>
                          <div className="absolute -top-4 -right-4 w-16 h-12 rounded-full opacity-25 blur-xl"
                            style={{ background: `radial-gradient(ellipse,${s.blob},transparent)` }} />
                          <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1 relative z-10">{s.label}</p>
                          <p className="text-sm font-black text-white relative z-10">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {paymentHistoryLoading ? (
                      <div className="flex items-center justify-center py-10 gap-3">
                        <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                        <p className="text-xs text-slate-400 font-medium">Loading payment history…</p>
                      </div>
                    ) : paymentHistory.length > 0 ? (
                      <Card title="Payment History" icon={History} accent="linear-gradient(180deg,#059669,#34d399)">
                        <div className="space-y-2">
                          {paymentHistory.map((payment, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl shrink-0">
                                  <Banknote size={13} className="text-emerald-600" />
                                </div>
                                <div>
                                  <p className="text-xs font-black text-slate-800 tabular-nums">
                                    {fmtC(payment.receivedAmount || payment.amount || 0, currency)}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                    {fmt(payment.paymentDate || payment.date)} 
                                    {payment.paymentMode ? ` · ${payment.paymentMode}` : ""}
                                    {payment.mode ? ` · ${payment.mode}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right space-y-1">
                                {(payment.referenceNo || payment.reference) && (
                                  <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg block">
                                    {payment.referenceNo || payment.reference}
                                  </span>
                                )}
                                {payment.narration && (
                                  <p className="text-[10px] text-slate-400 italic max-w-[160px] truncate">{payment.narration}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-slate-200 rounded-2xl">
                        <div className="p-4 bg-slate-100 rounded-2xl">
                          <Banknote size={28} className="text-slate-300" />
                        </div>
                        <p className="text-sm font-bold text-slate-500">No payments recorded yet</p>
                        <p className="text-xs text-slate-400">
                          {!invoice.salesJournalId
                            ? "Post the sales journal first to start recording payments"
                            : "Use 'Receive Payment' to record a payment against this invoice"}
                        </p>
                        {invoice.salesJournalId && paymentInfo.pendingAmount > 0.01 && (
                          <button onClick={() => setShowPaymentModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl mt-1"
                            style={{ background: "linear-gradient(135deg,#059669,#34d399)" }}>
                            <Banknote size={12} /> Record First Payment
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ── */}
          {invoice && !loading && (
            <div className="shrink-0 border-t border-slate-200 px-6 py-3 bg-white rounded-b-2xl flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[10px] text-slate-400">
                Last updated: <span className="font-semibold text-slate-600">{fmtT(invoice.updatedAt)}</span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => window.open(`/master-data/manual-invoice?edit=${invoice._id}`, "_blank")}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all">
                  <Edit size={12} /> Edit
                </button>
                <button onClick={handleDownloadWord}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all">
                  <Download size={12} /> Word
                </button>
                {!invoice.salesJournalId ? (
                  <button onClick={() => setShowLedgerModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-xl hover:bg-violet-100 transition-all">
                    <BookOpen size={12} /> Post Journal
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <CheckCircle size={12} /> Journal Posted
                  </span>
                )}
                {invoice.salesJournalId && paymentInfo.pendingAmount > 0.01 && (
                  <button onClick={handleRecordPayment}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-all">
                    <Banknote size={12} /> Receive Payment
                  </button>
                )}
                <button onClick={handleEmailInvoice}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all">
                  <Mail size={12} /> Email
                </button>
                <button onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all">
                  <Trash2 size={12} /> Delete
                </button>
                <button onClick={handleDownloadPdf}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                  <Download size={12} /> Download PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showLedgerModal && invoice && (
        <CreateLedgerFromInvoiceModal
          open={showLedgerModal}
          onClose={() => setShowLedgerModal(false)}
          onSuccess={handleLedgerCreated}
          initialInvoiceNo={invoice.invoiceNo}
          invoiceData={invoice}
        />
      )}
      {showPaymentModal && invoice && (
        <PaymentReceiptModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentRecorded}
          invoiceData={invoice}
        />
      )}
      {showHistoryModal && invoice && (
        <PaymentHistoryModal
          open={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          invoiceId={invoiceId}
          invoiceData={invoice}
        />
      )}
      {showDeleteModal && (
        <ConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          title="Delete Invoice"
          message={`Are you sure you want to delete invoice ${invoice?.invoiceNo}? This action cannot be undone.`}
          confirmText="Delete"
          type="danger"
        />
      )}
    </>
  );
};

export default HomeInvoiceDetails;
