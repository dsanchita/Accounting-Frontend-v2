import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";
import InvoiceApproval from "../components/InvoiceApproval";
import AdvancedInvoiceSearch from "../components/AdvancedInvoiceSearch";
import CreateLedgerFromInvoiceModal from "../modals/CreateLedgerFromInvoiceModal";
import PreviousInvoicesComponent from "../components/PreviousInvoicesComponent";
import InvoiceDetailsModal from "../modals/InvoiceDetailsModal";
import PaymentReceiptModal from "../modals/PaymentReceiptModal";
import PaymentHistoryModal from "../modals/PaymentHistoryModal";
import { getUsersApi } from "../apis/userApi";
import {
  downloadInvoicePdfApi,
  downloadInvoiceWordApi,
  getInvoiceByIdApi,
  getInvoicesApi,
  getInvoiceTdsReportApi,
} from "../apis/invoice.api";
import {
  Plus, RefreshCw, FileText, AlertCircle, ChevronDown, ChevronUp,
  Receipt, Calendar, User, Package, Banknote, Filter, Edit,
  CreditCard, CircleCheckBig, History, CheckCircle2, Clock,
  AlertTriangle, BookOpen, Percent, Download, Mail, CheckCircle,
  SlidersHorizontal, X, TrendingUp, Layers,
} from "lucide-react";
import { checkAuthorization } from "../utils/checkAuthorization";
import AuditLogSidebar from "../components/AuditLogSidebar";
import InvoiceAuditLogModal from "../modals/InvoiceAuditLogModal";
import { getInvoiceUpdatesApi } from "../apis/auditLog.api";
import InvoiceDetailModal from "../modals/InvoiceDetailsModal";
import { motion, AnimatePresence } from "framer-motion";

/* ─── stat gradient config ────────────────────────────── */
const STAT_CFG = [
  { key: "totalInvoices", label: "Total Invoices", icon: FileText, gradient: "linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)", glow: "#93c5fd", fmt: (v) => v },
  { key: "totalReceivedAmount", label: "Total Received", icon: CheckCircle2, gradient: "linear-gradient(135deg,#064e3b 0%,#059669 55%,#34d399 100%)", glow: "#6ee7b7", fmt: (v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
  { key: "totalPendingAmount", label: "Pending Payment", icon: AlertCircle, gradient: "linear-gradient(135deg,#78350f 0%,#d97706 55%,#fbbf24 100%)", glow: "#fde68a", fmt: (v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
  { key: "totalAmount", label: "Total Revenue", icon: Banknote, gradient: "linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#a78bfa 100%)", glow: "#c4b5fd", fmt: (v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
  { key: "totalTDS", label: "Total TDS", icon: Percent, gradient: "linear-gradient(135deg,#7f1d1d 0%,#dc2626 55%,#f87171 100%)", glow: "#fca5a5", fmt: (v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
];

/* ─── small action button ─────────────────────────────── */
const ActionBtn = ({ onClick, icon: Icon, label, color = "slate", stopProp = true, to, disabled = false }) => {
  const base = "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border transition-all";
  const colors = {
    slate: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50",
    blue: "text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-600 hover:text-white hover:border-blue-600",
    green: "text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100",
    purple: "text-violet-700 bg-violet-50 border-violet-100 hover:bg-violet-100",
    red: "text-red-600 bg-red-50 border-red-100 hover:bg-red-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100 hover:bg-amber-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100",
  };
  const cls = `${base} ${colors[color] || colors.slate} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`;
  if (to) return <Link to={to} className={cls} onClick={stopProp ? (e) => e.stopPropagation() : undefined}><Icon size={11} />{label}</Link>;
  return <button onClick={stopProp ? (e) => { e.stopPropagation(); if (!disabled) onClick?.(e); } : onClick} className={cls} disabled={disabled}><Icon size={11} />{label}</button>;
};

/* ─── info cell ───────────────────────────────────────── */
const InfoCell = ({ label, value, mono = false, className = "" }) => (
  <div className={`bg-slate-50 rounded-xl p-3 border border-slate-100 ${className}`}>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-xs font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

/* ══════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════ */
const ViewAllInvoices = () => {
  const { user } = useAuth();
  const isAdminOrSuperAdmin = user?.role === "admin" || user?.role === "superAdmin";

  /* ── state (unchanged from original) ───────────────── */
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 0, total: 0 });
  const [expandedRows, setExpandedRows] = useState({});
  const [allInvoices, setAllInvoices] = useState([]);
  const [filteredAllInvoices, setFilteredAllInvoices] = useState([]);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [showRejectedInvoices, setShowRejectedInvoices] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [createLedgerModal, setCreateLedgerModal] = useState({ open: false, invoiceNo: null, invoiceData: null });
  const [createdByUsers, setCreatedByUsers] = useState([]);
  const invoiceOptions = [...new Set(allInvoices.map((i) => i.invoiceNo))];
  const clientOptions = [...new Set(allInvoices.map((i) => i.billTo?.name))];
  const [showPreviousInvoices, setShowPreviousInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentModal, setPaymentModal] = useState({ open: false, invoiceData: null });
  const [paymentHistoryModal, setPaymentHistoryModal] = useState(false);
  const [tdsDetailsModalOpen, setTdsDetailsModalOpen] = useState(false);
  const [tdsDetailRows, setTdsDetailRows] = useState([]);
  const [tdsDetailsLoading, setTdsDetailsLoading] = useState(false);
  const [openLogs, setOpenLogs] = useState(false);
  const [auditModal, setAuditModal] = useState({ open: false, invoiceId: null, invoiceNo: null });
  const [auditLogCounts, setAuditLogCounts] = useState({});
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] = useState(null);
  const [autoOpenedInvoiceId, setAutoOpenedInvoiceId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  /* ── all original handlers preserved exactly ───────── */
  const handleViewAuditLog = (invoice, e) => {
    e.stopPropagation();
    setAuditModal({ open: true, invoiceId: invoice._id, invoiceNo: invoice.invoiceNo });
  };
  const handleViewDetails = (invoice, e) => {
    e.stopPropagation();
    setSelectedInvoiceForDetail(invoice);
    setDetailModalOpen(true);
  };
  const fetchAuditLogCount = async (invoiceId) => {
    if (!invoiceId || auditLogCounts[invoiceId] !== undefined) return;
    try {
      const response = await getInvoiceUpdatesApi(user.company._id, invoiceId);
      setAuditLogCounts((prev) => ({ ...prev, [invoiceId]: response.data?.data?.updates?.length || 0 }));
    } catch { setAuditLogCounts((prev) => ({ ...prev, [invoiceId]: 0 })); }
  };

  /* ── useEffect to fetch invoices ───────── */
  useEffect(() => {
    fetchInvoices();
  }, [pagination.page, pagination.limit, advancedFilters, showRejectedInvoices]);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getInvoicesApi(user.company._id, {
        page: pagination.page,
        limit: pagination.limit,
        approvalStatus: showRejectedInvoices ? "Rejected" : "Approved",
        sort: "-createdAt",
        ...advancedFilters,
      });

      const invoicesData = response?.data || [];
      setInvoices(invoicesData);

      // Update pagination from meta
      if (response?.meta) {
        setPagination((prev) => ({
          ...prev,
          total: response.meta.total || 0,
          totalPages: response.meta.totalPages || 0,
        }));
      }

      // Fetch all invoices for filters and stats
      const allFiltered = await getInvoicesApi(user.company._id, {
        page: 1,
        limit: 10000,
        approvalStatus: showRejectedInvoices ? "Rejected" : "Approved",
        sort: "-createdAt",
        ...advancedFilters,
      });
      setFilteredAllInvoices(allFiltered?.data || []);

      const allInvoicesRes = await getInvoicesApi(user.company._id, {
        page: 1,
        limit: 10000,
        approvalStatus: showRejectedInvoices ? "Rejected" : "Approved",
        sort: "-createdAt",
      });
      setAllInvoices(allInvoicesRes?.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch invoices");
      toast.error(err?.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const invoiceId = searchParams.get("invoiceId");
    const tab = searchParams.get("tab");
    if (!invoiceId || autoOpenedInvoiceId === invoiceId) return;
    const existing = [...invoices, ...allInvoices].find((inv) => inv._id === invoiceId);
    if (existing) {
      setSelectedInvoiceForDetail(existing);
      setDetailModalOpen(true);
      setAutoOpenedInvoiceId(invoiceId);
      return;
    }
    let active = true;
    (async () => {
      try {
        // ✅ Changed: Use correct endpoint
        const res = await getInvoiceByIdApi(invoiceId);
        const inv = res?.data;
        if (active && inv) {
          setSelectedInvoiceForDetail(inv);
          setDetailModalOpen(true);
          setAutoOpenedInvoiceId(invoiceId);
        }
      } catch {
        console.error("Failed to open invoice from notification");
      }
    })();
    return () => {
      active = false;
    };
  }, [location.search, autoOpenedInvoiceId, invoices, allInvoices]);
  const fetchUsers = async () => {
    try {
      const response = await getUsersApi();
      const usersData = response.users || response.data || response;
      setCreatedByUsers(usersData.map((u) => ({
        _id: u._id,
        name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Unknown",
      })));
    } catch { toast.error("Failed to load users for search"); }
  };
  useEffect(() => { if (showAdvancedSearch) fetchUsers(); }, [showAdvancedSearch]);

  const formatDate = (date) => (date ? dayjs(date).format("DD-MMM-YYYY") : "-");
  const formatAmount = (amount) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const getPaymentReceivedAmount = (payment = {}) => Number(payment.receivedAmount ?? payment.amountReceived ?? payment.amountPaid ?? 0);
  const getPaymentTdsAmount = (payment = {}) => Number(payment.tdsAdjusted ?? payment.tdsAmount ?? 0);
  const getPaymentSettledAmount = (payment = {}) => Number(payment.grossAmount ?? getPaymentReceivedAmount(payment) + getPaymentTdsAmount(payment));

  const fetchTdsDetails = async () => {
    if (!user?.company?._id) return;
    setTdsDetailsLoading(true);
    try {
      const response = await getInvoiceTdsReportApi({
        companyId: user.company._id,
        fromDate: advancedFilters.invoiceDateFrom || advancedFilters.fromDate,
        toDate: advancedFilters.invoiceDateTo || advancedFilters.toDate,
      });
      const rows = Array.isArray(response?.data) ? response.data : [];
      const filteredRows = rows.filter((row) => {
        const matchesInvoice = !advancedFilters.invoiceNo || String(row.invoiceNo || "").toLowerCase().includes(String(advancedFilters.invoiceNo).toLowerCase());
        const matchesClient = !advancedFilters.clientName || String(row.clientName || "").toLowerCase().includes(String(advancedFilters.clientName).toLowerCase());
        return matchesInvoice && matchesClient;
      });
      setTdsDetailRows(filteredRows.map((row) => ({
        invoiceNo: row.invoiceNo || "-",
        clientName: row.clientName || "-",
        paymentDate: row.paymentDate,
        reference: row.reference || "-",
        receivedAmount: Number(row.receivedAmount || 0),
        tdsAmount: Number(row.tdsAmount || 0),
        settledAmount: Number(row.settledAmount || 0),
        type: row.type || "PAYMENT",
      })));
    } catch (error) {
      console.error("Error fetching TDS details:", error);
      setTdsDetailRows([]);
    } finally {
      setTdsDetailsLoading(false);
    }
  };

  useEffect(() => { fetchTdsDetails(); }, [user?.company?._id, advancedFilters]);

  const handleGenerateTdsReport = () => {
    if (!tdsDetailRows.length) {
      toast.error("No TDS data available to export");
      return;
    }
    const exportRows = tdsDetailRows.map((row) => ({
      "Invoice No": row.invoiceNo,
      Client: row.clientName,
      "Payment Date": formatDate(row.paymentDate),
      Reference: row.reference,
      "Received Amount": row.receivedAmount,
      "TDS Amount": row.tdsAmount,
      "Settled Amount": row.settledAmount,
      "Deduction Type": row.type === "INVOICE_PROVISION" ? "Provisioned at Invoice" : "Deducted at Payment",
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "TDS Report");
    XLSX.writeFile(workbook, `tds-report-${dayjs().format("DD-MMM-YYYY")}.xlsx`);
  };

  const toggleRowExpand = (id, e) => { e.stopPropagation(); setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] })); };
  const handlePageChange = (page) => setPagination((prev) => ({ ...prev, page }));
  const handleAdvancedSearch = (filters) => { setAdvancedFilters(filters); setAppliedFilters(filters); setPagination((prev) => ({ ...prev, page: 1 })); setShowAdvancedSearch(false); };
  const handleRowClick = (invoice) => {
    const isExpanding = !expandedRows[invoice._id];
    setExpandedRows((prev) => ({ ...prev, [invoice._id]: !prev[invoice._id] }));
    if (isExpanding) fetchAuditLogCount(invoice._id);
  };
  const getItemSummary = (items) => !items?.length ? "No items" : `${items.length} item${items.length > 1 ? "s" : ""}`;
  const calculateTotalTax = (invoice) => ((invoice.totalCGSTAmount || 0) + (invoice.totalSGSTAmount || 0) + (invoice.totalIGSTAmount || 0)).toFixed(2);
  const calculatePaymentInfo = (invoice) => {
    const totalInvoiceAmount = invoice.amountDue || 0;
    const tdsAmount = Number(invoice.tdsAmount || 0);
    const netPayable = totalInvoiceAmount - tdsAmount;
    const invoiceAmount = netPayable;
    const payments = invoice.payments || [];
    const paymentsTotal = payments.reduce(
      (sum, payment) => sum + (Number(payment.receivedAmount ?? payment.amountReceived ?? payment.amountPaid ?? 0)),
      0,
    );
    const totalTDSAdjusted = payments.reduce((s, p) => s + getPaymentTdsAmount(p), 0);
    const totalReceived =
      payments.length > 0
        ? paymentsTotal
        : Number(
          invoice.paidAmount ??
          Math.max(0, invoiceAmount - Number(invoice.remainingAmount ?? invoiceAmount)),
        );
    const pendingAmount = Math.max(
      0,
      payments.length > 0
        ? invoiceAmount - totalReceived
        : Number(invoice.remainingAmount ?? invoiceAmount - totalReceived),
    );
    const completionPercentage = invoiceAmount > 0 ? (totalReceived / invoiceAmount) * 100 : 0;
    let paymentStatus = invoice.paymentStatus;
    if (!paymentStatus) {
      // Check if invoice is rejected first
      if (invoice.approvalStatus === "Rejected") {
        paymentStatus = "rejected";
      } else if (pendingAmount <= 0) {
        paymentStatus = "fully_paid";
      } else if (totalReceived > 0) {
        paymentStatus = "partially_paid";
      } else {
        paymentStatus = "unpaid";
      }
    }
    return { invoiceAmount, totalInvoiceAmount, tdsAmount, netPayable, totalReceived, pendingAmount, totalTDSAdjusted, completionPercentage, paymentStatus, paymentCount: payments.length, lastPaymentDate: payments.length > 0 ? payments[payments.length - 1].paymentDate : null };
  };
  const getPaymentStatusBadge = (paymentStatus, pendingAmount) => {
    switch (paymentStatus) {
      case "fully_paid": return { text: "Paid", pill: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: CheckCircle2 };
      case "partially_paid": return { text: `₹${formatAmount(pendingAmount)} Pending`, pill: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400", icon: Clock };
      case "rejected": return { text: "Rejected", pill: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-600", icon: AlertTriangle };
      default: return { text: "Unpaid", pill: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", icon: AlertTriangle };
    }
  };
  const getInvoiceLifecycleBadge = (invoice) => {
    const status = invoice.status;
    const config = {
      PARTIALLY_PAID: { text: "Partially Paid", pill: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      PAID: { text: "Paid", pill: "bg-blue-100 text-blue-800 border-blue-200" },
      RECONCILED: { text: "Reconciled", pill: "bg-green-100 text-green-800 border-green-200" },
      POSTED: { text: "Posted", pill: "bg-slate-100 text-slate-700 border-slate-200" },
    };

    let res = config[status] || { text: "Posted", pill: "bg-slate-100 text-slate-700 border-slate-200" };

    if (invoice.approvalStatus === "Approved" && !invoice.salesJournalId) {
      res = { text: "Posting Pending", pill: "bg-amber-100 text-amber-800 border-amber-200" };
    }

    return res;
  };
  const handleDownloadWord = async (invoiceId, invoiceNo, e) => {
    e.stopPropagation();
    try {
      const response = await downloadInvoiceWordApi(invoiceId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a"); link.href = url; link.setAttribute("download", `Invoice_${invoiceNo}.docx`);
      document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      toast.success("Word document downloaded");
    } catch { toast.error("Failed to download Word document"); }
  };
  const handleDownloadPdf = async (invoiceId, invoiceNo, e) => {
    e.stopPropagation();
    try {
      const response = await downloadInvoicePdfApi(invoiceId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a"); link.href = url; link.setAttribute("download", `Invoice_${invoiceNo}.pdf`);
      document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      toast.success("PDF downloaded");
    } catch { toast.error("Failed to download PDF"); }
  };
  const handleEditClick = (invoiceId, e) => { e.stopPropagation(); };
  const getStatusColor = (status) => ({ active: "border-emerald-500 text-emerald-600 bg-emerald-100", inprogress: "border-amber-500 text-amber-600 bg-amber-100", completed: "border-slate-400 text-slate-600 bg-slate-200" }[status] || "border-slate-300 text-slate-500");
  const handleCreateLedgerClick = async (invoice, e) => {
    e.stopPropagation();
    if (invoice.salesJournalId) { toast.info("Sales journal already posted for this invoice"); return; }
    try {
      const response = await getInvoiceByIdApi(invoice._id);
      setCreateLedgerModal({ open: true, invoiceNo: invoice.invoiceNo, invoiceData: response?.data || invoice });
    } catch { toast.error("Failed to load invoice details"); }
  };
  const handleLedgerCreated = () => { toast.success("Journal posted successfully!"); fetchInvoices(); setCreateLedgerModal({ open: false, invoiceNo: null, invoiceData: null }); };
  const getInvoiceSummary = () => {
    const f = filteredAllInvoices;
    if (!f.length) return { totalAmount: 0, totalPendingAmount: 0, totalReceivedAmount: 0, pendingInvoices: 0, overdueInvoices: 0, totalInvoices: 0, totalTDS: 0 };
    let totalPendingAmount = 0, totalReceivedAmount = 0;
    f.forEach((inv) => { const pi = calculatePaymentInfo(inv); totalPendingAmount += pi.pendingAmount; totalReceivedAmount += pi.totalReceived; });
    return {
      totalAmount: f.reduce((s, inv) => s + (inv.amountDue || 0), 0),
      totalPendingAmount, totalReceivedAmount,
      pendingInvoices: f.filter((inv) => { const pi = calculatePaymentInfo(inv); return pi.pendingAmount > 0 && ["active", "inprogress"].includes(inv.status) && dayjs(inv.dueDate).isAfter(dayjs()); }).length,
      overdueInvoices: f.filter((inv) => { const pi = calculatePaymentInfo(inv); return pi.pendingAmount > 0 && ["active", "inprogress"].includes(inv.status) && dayjs(inv.dueDate).isBefore(dayjs()); }).length,
      totalInvoices: f.length,
      totalTDS: tdsDetailRows.reduce((s, row) => s + row.tdsAmount, 0),
    };
  };
  const summary = getInvoiceSummary();
  const handleRecordPayment = (invoice, e) => {
    e.stopPropagation();
    if (!invoice.salesJournalId) { toast.error("Please post the sales journal first before recording payments"); return; }
    const pi = calculatePaymentInfo(invoice);
    if (pi.pendingAmount <= 0) { toast.info("This invoice is already fully paid"); return; }
    setPaymentModal({ open: true, invoiceData: invoice });
  };
  const handleRefreshAndClear = async () => {
    try {
      setAdvancedFilters({}); setAppliedFilters({});
      setPagination((prev) => ({ ...prev, page: 1 }));
      setFilteredAllInvoices([]);
      toast.success("Refreshed and cleared filters");
    } catch { toast.error("Failed to refresh"); }
  };
  const handlePaymentRecorded = (paymentData) => {
    toast.success(`Payment of ₹${paymentData.receivedAmount} recorded successfully!`);
    fetchInvoices();
    setPaymentModal({ open: false, invoiceData: null });
  };
  const generatePageNumbers = () => {
    const pages = []; const { totalPages, page: currentPage } = pagination;
    if (totalPages <= 5) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else if (currentPage <= 3) { for (let i = 1; i <= 5; i++) pages.push(i); }
    else if (currentPage >= totalPages - 2) { for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i); }
    else { for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i); }
    return pages;
  };
  const isJournalPosted = (invoice) => !!invoice.salesJournalId;

  /* ════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── STICKY HEADER ───────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-5">

          {/* Title row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/invoice-data")}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all">
                <FiArrowLeft size={15} />
              </button>
              <div className="p-2 rounded-xl shadow-md"
                style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                <Receipt size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">All Invoices</h1>
                <p className="text-[11px] text-slate-400 font-medium">Manage and track all approved invoices</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Advanced search */}
              <button onClick={() => setShowAdvancedSearch(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all text-xs font-bold">
                <SlidersHorizontal size={14} />
                <span className="hidden sm:inline">Advanced</span>
                {Object.keys(appliedFilters).length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500" />}
              </button>

              {/* Audit log */}
              <button onClick={() => setOpenLogs(true)} title="Audit Trail"
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all">
                <History size={15} />
              </button>

              {/* Refresh */}
              <button onClick={handleRefreshAndClear} disabled={loading}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all disabled:opacity-50">
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>

              {/* Count badge */}
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <Layers size={12} /> {pagination.total} invoices
              </span>
            </div>
          </div>

          {/* ── STAT CARDS ─────────────────────────────── */}
          {isAdminOrSuperAdmin && (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {STAT_CFG.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <motion.div key={s.key}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}
                    className={`relative overflow-hidden rounded-2xl p-4 shadow-lg group ${s.label === "Total TDS" ? "cursor-pointer" : "cursor-default"}`}
                    onClick={s.label === "Total TDS" ? () => setTdsDetailsModalOpen(true) : undefined}
                    style={{ background: s.gradient }}
                  >
                    <div className="absolute -top-6 -right-6 w-28 h-20 rounded-full opacity-25 blur-2xl group-hover:scale-125 transition-transform duration-700"
                      style={{ background: `radial-gradient(ellipse,${s.glow},transparent)` }} />
                    <div className="absolute top-0 right-8 w-0.5 h-full bg-white/20 rotate-12 scale-y-150" />
                    <div className="relative z-10 flex items-start justify-between">
                      <div>
                        <p className="text-white/70 text-[9px] font-black uppercase tracking-widest mb-1.5">{s.label}</p>
                        <p className="text-xl font-black text-white leading-none tabular-nums">
                          {s.fmt(summary[s.key] || 0)}
                        </p>
                      </div>
                      <div className="p-2 bg-white/20 rounded-xl border border-white/25 backdrop-blur-sm group-hover:scale-110 transition-transform">
                        <Icon size={16} className="text-white" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-6 py-5 space-y-4">

        {/* Applied filters strip */}
        {Object.keys(appliedFilters).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl">
            <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Filtering by:</span>
            {appliedFilters.invoiceNo && <span className="flex items-center gap-1 text-[10px] font-bold bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl">Invoice: {appliedFilters.invoiceNo}</span>}
            {appliedFilters.clientName && <span className="flex items-center gap-1 text-[10px] font-bold bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl">Client: {appliedFilters.clientName}</span>}
            {appliedFilters.paymentStatus && <span className="flex items-center gap-1 text-[10px] font-bold bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl">Status: {appliedFilters.paymentStatus.replace("_", " ")}</span>}
            {appliedFilters.createdBy && <span className="flex items-center gap-1 text-[10px] font-bold bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl">Created by: {createdByUsers.find((u) => u._id === appliedFilters.createdBy)?.name || appliedFilters.createdBy}</span>}
            {appliedFilters.invoiceDateFrom && <span className="flex items-center gap-1 text-[10px] font-bold bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl">Date: {appliedFilters.invoiceDateFrom} → {appliedFilters.invoiceDateTo}</span>}
            <button onClick={handleRefreshAndClear} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-red-500 transition-colors">
              <X size={10} /> Clear
            </button>
          </div>
        )}

        {/* Invoice list card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table bar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
            style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}>
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg,#1e40af,#60a5fa)" }} />
              <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                {showRejectedInvoices ? "Rejected Invoices" : "Invoice List"}
              </p>
              {!loading && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black text-white"
                  style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}>
                  {pagination.total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowRejectedInvoices((prev) => !prev);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className={`px-2.5 py-1.5 text-[10px] font-black rounded-lg border transition-all ${
                  showRejectedInvoices
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {showRejectedInvoices ? "Show Normal" : "Show Rejected"}
              </button>
              <p className="text-[10px] text-slate-400 hidden sm:block">Click a row to expand details</p>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-400">Loading invoices…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="p-3 rounded-2xl bg-red-50"><AlertCircle size={24} className="text-red-400" /></div>
              <p className="text-sm font-bold text-slate-600">{error}</p>
              <button onClick={fetchInvoices}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all">
                <RefreshCw size={11} /> Try Again
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="p-4 rounded-2xl" style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)" }}>
                <FileText size={28} className="text-blue-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">
                No {showRejectedInvoices ? "rejected" : "approved"} invoices found
              </p>
              <p className="text-xs text-slate-400">Try adjusting your search filters</p>
            </div>
          )}

          {/* Invoice rows */}
          {!loading && !error && invoices.length > 0 && (
            <>
              <div className="divide-y divide-slate-50">
                {invoices.map((invoice, i) => {
                  const paymentInfo = calculatePaymentInfo(invoice);
                  const badge = getPaymentStatusBadge(paymentInfo.paymentStatus, paymentInfo.pendingAmount);
                  const lifecycleBadge = getInvoiceLifecycleBadge(invoice);
                  const PayIcon = badge.icon;
                  const journalPosted = isJournalPosted(invoice);
                  const isExpanded = !!expandedRows[invoice._id];

                  return (
                    <motion.div key={invoice._id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                      className={`transition-colors cursor-pointer ${isExpanded ? "bg-blue-50/30" : "hover:bg-slate-50/70"}`}
                      onClick={() => handleRowClick(invoice)}
                    >
                      {/* ── Row summary ─────────────────── */}
                      <div className="px-5 py-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">

                          {/* Left */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                              <Receipt size={14} className="text-slate-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-xs font-extrabold text-slate-900">{invoice.invoiceNo || "N/A"}</span>
                                {/* Payment badge */}
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${badge.pill}`}>
                                  <PayIcon size={9} /> {badge.text}
                                </span>
                                {invoice.approvalStatus === "Approved" && !invoice.salesJournalId && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${lifecycleBadge.pill}`}>
                                    {lifecycleBadge.text}
                                  </span>
                                )}
                                {invoice.approvalStatus === "Rejected" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border bg-red-100 text-red-700 border-red-300">
                                    <AlertTriangle size={9} /> Rejected
                                  </span>
                                )}
                                {journalPosted && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border bg-emerald-100 text-emerald-700 border-emerald-200">
                                    <CheckCircle size={9} /> Journal Posted
                                  </span>
                                )}
                                <button onClick={(e) => handleViewDetails(invoice, e)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 transition-all">
                                  <FileText size={9} /> View Details
                                </button>
                              </div>

                              {/* Meta row */}
                              <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 font-medium">
                                <span className="flex items-center gap-1"><Calendar size={9} /> {formatDate(invoice.invoiceDate)}</span>
                                <span className="flex items-center gap-1"><User size={9} /> <span className="truncate max-w-[120px]">{invoice.billTo?.name || "No client"}</span></span>
                                <span className="flex items-center gap-1"><Package size={9} /> {getItemSummary(invoice.items)}</span>
                                <span className="flex items-center gap-1"><Banknote size={9} /> {paymentInfo.paymentCount > 0 ? `${paymentInfo.paymentCount} payment${paymentInfo.paymentCount > 1 ? "s" : ""}` : "No payments"}</span>
                                {invoice.createdBy?.name && <span className="flex items-center gap-1"><User size={9} /> {invoice.createdBy.name}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Right */}
                          <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                            <div className="text-right">
                              {/* Progress bar */}
                              <div className="flex items-center justify-end gap-2 mb-1.5">
                                <span className="text-[10px] text-slate-500 tabular-nums">Paid: {formatAmount(paymentInfo.totalReceived)}</span>
                                <div className="h-1.5 w-16 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${paymentInfo.completionPercentage === 100 ? "bg-emerald-500" : paymentInfo.completionPercentage > 0 ? "bg-amber-400" : "bg-red-400"}`}
                                    style={{ width: `${Math.min(paymentInfo.completionPercentage, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500 tabular-nums">{paymentInfo.completionPercentage.toFixed(0)}%</span>
                              </div>

                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Amount Due / Pending</p>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-sm font-black text-slate-900 tabular-nums">
                                  {invoice.currency || ""} {formatAmount(invoice.amountDue || 0)}
                                </span>
                                {paymentInfo.pendingAmount > 0 && (
                                  <span className="text-xs font-black text-red-500 tabular-nums">→ {formatAmount(paymentInfo.pendingAmount)}</span>
                                )}
                              </div>
                              <p className={`text-[10px] font-bold mt-0.5 ${invoice.isFullyReconciled ? "text-emerald-700" : "text-blue-700"}`}>
                                {invoice.isFullyReconciled ? "Fully Reconciled" : "Pending Reconciliation"}
                              </p>
                              {invoice.tdsAmount > 0 && (
                                <p className="text-[10px] font-bold text-violet-600 tabular-nums mt-0.5">
                                  TDS: {invoice.currency || ""} {formatAmount(invoice.tdsAmount)}
                                </p>
                              )}
                            </div>

                            <button onClick={(e) => toggleRowExpand(invoice._id, e)}
                              className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                              {isExpanded
                                ? <ChevronUp size={15} className="text-blue-500" />
                                : <ChevronDown size={15} className="text-slate-400" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ── Expanded panel ───────────────── */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeInOut" }}
                            className="overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5 space-y-4">
                              {invoice.approvalStatus === "Rejected" && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start justify-between gap-3 shadow-sm">
                                  <div className="flex items-start gap-3">
                                    <div className="p-2 bg-red-100 rounded-xl text-red-600 shrink-0">
                                      <AlertTriangle size={16} />
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-bold text-red-900">Invoice Rejected</h4>
                                      <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                                        <span className="font-semibold">Reason:</span>{" "}
                                        {invoice.rejectionReason ||
                                          invoice.approvalComments ||
                                          invoice.rejectionHistory?.[invoice.rejectionHistory.length - 1]?.reason ||
                                          "No reason specified"}
                                      </p>
                                    </div>
                                  </div>
                                  {checkAuthorization(user, "INVOICE", "EDIT") && (
                                    <ActionBtn
                                      to={`/master-data/manual-invoice?edit=${invoice._id}`}
                                      onClick={(e) => handleEditClick(invoice._id, e)}
                                      icon={Edit}
                                      label="Edit & Resubmit"
                                      color="red"
                                    />
                                  )}
                                </div>
                              )}

                              {/* Invoice details + amount summary */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                {/* Invoice details */}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="px-4 py-3 border-b border-slate-100"
                                    style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
                                    <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-widest">Invoice Details</p>
                                  </div>
                                  <div className="p-4 grid grid-cols-2 gap-3">
                                    <InfoCell label="Invoice Number" value={invoice.invoiceNo} />
                                    <InfoCell label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
                                    <InfoCell label="Due Date" value={formatDate(invoice.dueDate)} />
                                    <InfoCell label="Payment Terms" value={invoice.paymentTerms || "Net 30 Days"} />
                                    <InfoCell label="Currency" value={invoice.currency || "INR"} />
                                  </div>
                                </div>

                                {/* Amount summary */}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100"
                                    style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
                                    <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-widest">Amount Summary</p>
                                    {auditLogCounts[invoice._id] > 0 && (
                                      <button onClick={(e) => handleViewAuditLog(invoice, e)}
                                        className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-xl hover:bg-slate-50 transition-all">
                                        <History size={9} /> Audit ({auditLogCounts[invoice._id]})
                                      </button>
                                    )}
                                  </div>
                                  <div className="p-4 space-y-2 text-xs">
                                    {[
                                      { label: "Taxable Value", value: invoice.totalTaxableValue || invoice.amountDue || 0, color: "text-slate-700" },
                                      invoice.totalIGSTAmount > 0 && { label: "IGST", value: invoice.totalIGSTAmount, color: "text-slate-600" },
                                      invoice.totalSGSTAmount > 0 && { label: "SGST", value: invoice.totalSGSTAmount, color: "text-slate-600" },
                                      invoice.totalCGSTAmount > 0 && { label: "CGST", value: invoice.totalCGSTAmount, color: "text-slate-600" },
                                    ].filter(Boolean).map((row, idx) => (
                                      <div key={idx} className="flex items-center justify-between">
                                        <span className="text-slate-500 font-medium">{row.label}</span>
                                        <span className={`font-black tabular-nums ${row.color}`}>
                                          {formatAmount(row.value)}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-1">
                                      <span className="font-extrabold text-slate-800">Total Invoice Amount</span>
                                      <span className="font-black text-slate-900 tabular-nums">{formatAmount(invoice.amountDue || 0)}</span>
                                    </div>
                                    {Number(invoice.tdsAmount || 0) > 0 && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-violet-600 font-medium">TDS Amount</span>
                                        <span className="font-black text-violet-600 tabular-nums">– {formatAmount(invoice.tdsAmount)}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between border-t border-emerald-200 pt-2 mt-1">
                                      <span className="font-extrabold text-emerald-800">Net Payable Amount</span>
                                      <span className="font-black text-emerald-700 tabular-nums">{formatAmount((invoice.amountDue || 0) - Number(invoice.tdsAmount || 0))}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Client info + Payment summary */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                {/* Client */}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100"
                                    style={{ background: "linear-gradient(90deg,#f8fafc,#f0fdf4)" }}>
                                    <User size={12} className="text-emerald-600" />
                                    <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-widest">Client Information</p>
                                  </div>
                                  <div className="p-4 grid grid-cols-1 gap-2.5 text-xs">
                                    {[
                                      { label: "Client Name", value: invoice.billTo?.name },
                                      { label: "Address", value: invoice.billTo?.address },
                                      invoice.billTo?.GSTIN && { label: "GSTIN", value: invoice.billTo.GSTIN, mono: true },
                                      { label: "Ship To", value: invoice.shipTo?.name },
                                    ].filter(Boolean).map((row, idx) => (
                                      <div key={idx} className="flex items-start justify-between gap-3">
                                        <span className="text-slate-400 font-medium shrink-0">{row.label}</span>
                                        <span className={`font-bold text-slate-700 text-right ${row.mono ? "font-mono" : ""}`}>{row.value || "—"}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Payment summary */}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100"
                                    style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
                                    <CreditCard size={12} className="text-blue-600" />
                                    <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-widest">Payment Summary</p>
                                  </div>
                                  <div className="p-4 space-y-2 text-xs">
                                    {[
                                      { label: "Net Payable Amount", value: paymentInfo.netPayable, color: "text-emerald-700" },
                                      paymentInfo.tdsAmount > 0 && { label: "TDS Amount", value: paymentInfo.tdsAmount, color: "text-violet-700" },
                                      { label: "Total Received", value: paymentInfo.totalReceived, color: "text-blue-700" },
                                      { label: "Pending Amount", value: paymentInfo.pendingAmount, color: "text-amber-700" },
                                    ].filter(Boolean).map((row, idx) => (
                                      <div key={idx} className="flex items-center justify-between">
                                        <span className="text-slate-500 font-medium">{row.label}</span>
                                        <span className={`font-black tabular-nums ${row.color}`}>{formatAmount(row.value)}</span>
                                      </div>
                                    ))}
                                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-1">
                                      <span className="text-slate-500 font-medium">Completion</span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-700 tabular-nums">{Math.min(paymentInfo.completionPercentage, 100).toFixed(1)}%</span>
                                        <div className="h-2 w-20 bg-slate-200 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${paymentInfo.completionPercentage >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                                            style={{ width: `${Math.min(paymentInfo.completionPercentage, 100)}%` }} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Payment history */}
                              {invoice.payments?.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100"
                                    style={{ background: "linear-gradient(90deg,#f8fafc,#fefce8)" }}>
                                    <History size={12} className="text-amber-600" />
                                    <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-widest">
                                      Recent Payments ({invoice.payments.length})
                                    </p>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr style={{ background: "linear-gradient(90deg,#f1f5f9,#fef9c3)" }}>
                                          {["Date", "Mode", "Reference", "Amount", "TDS", "Status"].map((h, idx) => (
                                            <th key={h} className={`px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest ${idx > 2 ? "text-right" : "text-left"}`}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                        {[...invoice.payments].sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate)).slice(0, 3)
                                          .map((payment, idx) => (
                                            <tr key={payment._id || idx} className="hover:bg-slate-50/80 transition-colors">
                                              <td className="px-4 py-3 font-bold text-slate-700">{formatDate(payment.paymentDate)}</td>
                                              <td className="px-4 py-3 text-slate-600">{payment.paymentMode || "—"}</td>
                                              <td className="px-4 py-3 font-mono text-slate-600">{payment.referenceNumber || "—"}</td>
                                              <td className="px-4 py-3 text-right font-black text-emerald-700 tabular-nums">{formatAmount(getPaymentReceivedAmount(payment))}</td>
                                              <td className="px-4 py-3 text-right font-bold text-violet-600 tabular-nums">{getPaymentTdsAmount(payment) > 0 ? formatAmount(getPaymentTdsAmount(payment)) : "—"}</td>
                                              <td className="px-4 py-3 text-right">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${payment.status === "posted" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                                  {payment.status || "recorded"}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {invoice.payments.length > 3 && (
                                    <div className="px-4 py-3 border-t border-slate-100">
                                      <button onClick={(e) => { e.stopPropagation(); setSelectedInvoice(invoice); setPaymentHistoryModal(true); }}
                                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors">
                                        View all {invoice.payments.length} payments →
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex flex-wrap gap-2 pt-2">
                                {checkAuthorization(user, "INVOICE", "EDIT") && !invoice.salesJournalId && (
                                  <ActionBtn to={`/master-data/manual-invoice?edit=${invoice._id}`} onClick={(e) => handleEditClick(invoice._id, e)} icon={Edit} label="Edit Invoice" color="blue" />
                                )}
                                {invoice.approvalStatus === "Approved" && (
                                  <>
                                    <ActionBtn onClick={(e) => handleDownloadPdf(invoice._id, invoice.invoiceNo, e)} icon={Download} label="Download PDF" color="slate" />
                                    <ActionBtn onClick={(e) => handleDownloadWord(invoice._id, invoice.invoiceNo, e)} icon={Download} label="Download Word" color="slate" />
                                  </>
                                )}
                                {checkAuthorization(user, "INVOICE", "EDIT") && invoice.approvalStatus === "Approved" && !invoice.salesJournalId && (
                                  <ActionBtn onClick={(e) => handleCreateLedgerClick(invoice, e)} icon={BookOpen} label="Post Sales Journal" color="purple" />
                                )}
                                {invoice.salesJournalId && (
                                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl cursor-default">
                                    <CheckCircle size={11} /> Sales Journal Posted
                                  </span>
                                )}
                                {checkAuthorization(user, "INVOICE", "EDIT") && invoice.salesJournalId && paymentInfo.pendingAmount > 0 && (
                                  <ActionBtn onClick={(e) => handleRecordPayment(invoice, e)} icon={Banknote} label="Receive Payment" color="green" />
                                )}
                                {paymentInfo.pendingAmount <= 0 && paymentInfo.totalReceived > 0 && (
                                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl cursor-default">
                                    <CheckCircle size={11} /> Fully Paid ✓
                                  </span>
                                )}
                                {invoice.payments?.length > 0 && (
                                  <ActionBtn onClick={(e) => { e.stopPropagation(); setSelectedInvoice(invoice); setPaymentHistoryModal(true); }}
                                    icon={History} label={`Payment History (${invoice.payments.length})`} color="amber" />
                                )}
                                {invoice.approvalStatus === "Approved" && (
                                  <ActionBtn onClick={() => { }} icon={Mail} label="Email Invoice" color="indigo" />
                                )}
                              </div>

                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              {/* ── Pagination ─────────────────────────── */}
              {pagination.totalPages > 1 && (
                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-3">

                  {/* Left: count */}
                  <p className="text-[10px] text-slate-400 font-medium">
                    Showing{" "}
                    <span className="font-black text-slate-700">{(pagination.page - 1) * pagination.limit + 1}</span>
                    {" – "}
                    <span className="font-black text-slate-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span>
                    {" of "}
                    <span className="font-black text-slate-700">{pagination.total}</span>
                    {" invoices"}
                  </p>

                  {/* Centre: page buttons */}
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronUp size={14} className="-rotate-90" />
                    </button>
                    {generatePageNumbers().map((pageNum) => (
                      <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                        className={`min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-black transition-all ${pagination.page === pageNum ? "text-white shadow-sm" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"}`}
                        style={pagination.page === pageNum ? { background: "linear-gradient(135deg,#1e40af,#3b82f6)" } : {}}>
                        {pageNum}
                      </button>
                    ))}
                    {pagination.totalPages > 5 && pagination.page < pagination.totalPages - 2 && (
                      <>
                        <span className="text-slate-300 px-1 text-[11px]">…</span>
                        <button onClick={() => handlePageChange(pagination.totalPages)}
                          className="min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-black text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all">
                          {pagination.totalPages}
                        </button>
                      </>
                    )}
                    <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronUp size={14} className="rotate-90" />
                    </button>
                  </div>

                  {/* Right: rows-per-page */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-medium">Rows</span>
                    <select value={pagination.limit}
                      onChange={(e) => setPagination((prev) => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                      className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none appearance-none cursor-pointer">
                      {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <Outlet />
            </>
          )}
        </div>
      </div>

      {/* ── MODALS (all unchanged) ───────────────────── */}
      <AdvancedInvoiceSearch isOpen={showAdvancedSearch} onClose={() => setShowAdvancedSearch(false)} onSearch={handleAdvancedSearch} invoiceNumbers={invoiceOptions} clientNames={clientOptions} createdByUsers={createdByUsers} />
      <InvoiceApproval open={approvalModalOpen} onClose={() => setApprovalModalOpen(false)} refreshInvoices={fetchInvoices} user={user} />
      <PreviousInvoicesComponent open={showPreviousInvoices} onClose={() => setShowPreviousInvoices(false)} />
      {createLedgerModal.open && (
        <CreateLedgerFromInvoiceModal open={createLedgerModal.open} onClose={() => setCreateLedgerModal({ open: false, invoiceNo: null, invoiceData: null })} onSuccess={handleLedgerCreated} initialInvoiceNo={createLedgerModal.invoiceNo} invoiceData={createLedgerModal.invoiceData} />
      )}
      <InvoiceDetailModal 
        isOpen={detailModalOpen} 
        onClose={() => setDetailModalOpen(false)} 
        invoiceId={selectedInvoiceForDetail?._id} 
        defaultTab={new URLSearchParams(location.search).get("tab") || "overview"}
      />
      {paymentModal.open && (
        <PaymentReceiptModal open={paymentModal.open} onClose={() => setPaymentModal({ open: false, invoiceData: null })} onSuccess={handlePaymentRecorded} invoiceData={paymentModal.invoiceData} />
      )}
      {paymentHistoryModal && selectedInvoice && (
        <PaymentHistoryModal open={paymentHistoryModal} onClose={() => { setPaymentHistoryModal(false); setSelectedInvoice(null); }} invoice={selectedInvoice} paymentHistory={selectedInvoice.payments || []} />
      )}
      {tdsDetailsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Total TDS Details</h3>
                <p className="text-xs text-slate-500 mt-1">Complete list of TDS-adjusted payments</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleGenerateTdsReport} className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                  Generate Report
                </button>
                <button onClick={() => setTdsDetailsModalOpen(false)} className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {["Invoice", "Client", "Payment Date", "TDS", "Type"].map((label) => (
                      <th key={label} className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tdsDetailsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading TDS details...</td>
                    </tr>
                  ) : tdsDetailRows.length > 0 ? (
                    tdsDetailRows.map((row, index) => (
                      <tr key={`${row.invoiceNo}-${row.reference}-${index}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{row.invoiceNo}</td>
                        <td className="px-4 py-3 text-slate-700">{row.clientName}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.paymentDate)}</td>
                        {/* <td className="px-4 py-3 font-mono text-slate-500">{row.reference}</td> */}
                        {/* <td className="px-4 py-3 text-emerald-700 font-bold tabular-nums">{formatAmount(row.receivedAmount)}</td> */}
                        <td className="px-4 py-3 text-violet-700 font-bold tabular-nums">{formatAmount(row.tdsAmount)}</td>
                        {/* <td className="px-4 py-3 text-slate-900 font-bold tabular-nums">{formatAmount(row.settledAmount)}</td> */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.type === 'INVOICE_PROVISION' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {row.type === 'INVOICE_PROVISION' ? 'Provision' : 'Payment'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">No TDS-adjusted payments found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <InvoiceAuditLogModal open={auditModal.open} onClose={() => setAuditModal({ open: false, invoiceId: null, invoiceNo: null })} invoiceId={auditModal.invoiceId} invoiceNo={auditModal.invoiceNo} companyId={user?.company?._id} />
      <AuditLogSidebar isOpen={openLogs} onClose={() => setOpenLogs(false)} companyId={user?.company?._id} modules={["INVOICE", "INVOICE_ACCOUNTING", "PAYMENT"]} title="Invoice Audit Trail" subtitle="Tracking invoice, accounting, and payment activities" />
    </div>
  );
};

export default ViewAllInvoices;
