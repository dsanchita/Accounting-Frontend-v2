// components/InvoiceDetailModal.jsx (updated)
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Printer,
  Download,
  Mail,
  Copy,
  FileText,
  Calendar,
  User,
  CreditCard,
  Building,
  MapPin,
  Percent,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  History,
  Receipt,
  Banknote,
  BookOpen,
  FileSignature,
  MessageSquare,
  Globe,
  Phone,
  Hash,
  DollarSign,
  TrendingUp,
  FileCheck,
  Calculator,
  Shield,
  Package,
  RotateCcw,
  Edit,
} from "lucide-react";
import dayjs from "dayjs";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-toastify";
import PurchaseOrderDetailModal from "./PurchaseOrderDetailModal";
import JournalDetailsModal from "./JournalDetailsModal";
import { getJournalByIdApi, reverseJournalApi } from "../apis/journalApi";
import PaymentReceiptModal from "./PaymentReceiptModal";
import CreateLedgerFromInvoiceModal from "./CreateLedgerFromInvoiceModal";
import {
  downloadInvoicePdfApi,
  downloadInvoiceWordApi,
  getInvoiceByIdApi,
  reverseInvoicePaymentApi,
} from "../apis/invoice.api";

const InvoiceDetailModal = ({ isOpen, onClose, invoiceId, defaultTab = "overview" }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [activeTab, setActiveTab] = useState(defaultTab || "overview");
  const [paymentReceiptModal, setPaymentReceiptModal] = useState(false);
  const [createLedgerModal, setCreateLedgerModal] = useState(false);
  const [showTdsDetails, setShowTdsDetails] = useState(false);
  const [showPOModal, setShowPOModal] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [reversingPaymentId, setReversingPaymentId] = useState(null);
  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState(null);
  const [showSalesJournalReverseConfirm, setShowSalesJournalReverseConfirm] = useState(false);

  // Fetch invoice details
  useEffect(() => {
    if (isOpen && invoiceId) {
      fetchInvoiceDetails();
    }
    if (isOpen && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, invoiceId, defaultTab]);

  const fetchInvoiceDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getInvoiceByIdApi(invoiceId);
      if (response?.data) {
        setInvoice(response.data);
      } else {
        setError("Failed to load invoice details");
      }
    } catch (err) {
      console.error("Error fetching invoice details:", err);
      setError("Failed to load invoice details");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return dateString ? dayjs(dateString).format("DD MMM YYYY") : "-";
  };

  const formatDateTime = (dateString) => {
    return dateString ? dayjs(dateString).format("DD MMM YYYY, hh:mm A") : "-";
  };

  const formatCurrency = (amount, currency = "INR") => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  const getItemTaxLabel = (item = {}) => {
    const label = item?.taxLabel || item?.taxType || invoice?.taxLabel || invoice?.taxType || "Tax";
    return ["CGST", "SGST", "IGST"].includes(String(label).toUpperCase()) ? "GST" : label;
  };

  const getItemTaxRate = (item = {}) =>
    Number(item?.taxRate ?? item?.combinedTaxRate ?? item?.gstRate ?? 0);

  const getItemTaxAmount = (item = {}) =>
    Number(item?.taxAmount ?? item?.gstAmount ?? 0);

  const handleOpenJournal = async (journalId) => {
    if (!journalId || !user?.company?._id) return;
    try {
      const resolvedJournalId =
        typeof journalId === "object" && journalId !== null ? journalId._id : journalId;
      const response = await getJournalByIdApi(user.company._id, resolvedJournalId);
      setSelectedJournal(response.data || response);
      setShowJournalModal(true);
    } catch (err) {
      console.error("Error fetching journal details:", err);
      toast.error("Failed to load journal details");
    }
  };

  const handleReverseClick = (payment) => {
    setPaymentToReverse(payment);
    setShowReverseConfirm(true);
  };

  const handleConfirmReverse = async () => {
    if (!paymentToReverse || !invoice || !user?.company?._id) return;
    if (reversingPaymentId) return;
    try {
      setReversingPaymentId(paymentToReverse._id);
      await reverseInvoicePaymentApi({
        companyId: user.company._id,
        paymentId: paymentToReverse._id,
        invoiceId: invoice._id,
      });
      toast.success("Payment reversed successfully. Reversal journal has been posted.");
      setShowReverseConfirm(false);
      setPaymentToReverse(null);
      await fetchInvoiceDetails();
    } catch (err) {
      console.error("Error reversing payment:", err);
      toast.error(err?.response?.data?.message || "Failed to reverse payment");
    } finally {
      setReversingPaymentId(null);
    }
  };

  const handleReverseSalesJournal = async () => {
    if (!invoice || !invoice.salesJournalId || !user?.company?._id) return;

    // Check for payments first (frontend check)
    const activePayments = (invoice.payments || invoice.paymentIds || []).filter(p => !p.isReversed);
    if (activePayments.length > 0) {
      toast.error("Cannot reverse sales journal because the invoice has active payments. Please reverse payments first.");
      return;
    }

    setShowSalesJournalReverseConfirm(true);
  };

  const handleConfirmSalesJournalReverse = async () => {
    try {
      setLoading(true);
      const journalId = typeof invoice.salesJournalId === "object" ? invoice.salesJournalId._id : invoice.salesJournalId;
      await reverseJournalApi(user.company._id, journalId);
      toast.success("Sales journal reversed successfully.");
      setShowSalesJournalReverseConfirm(false);
      await fetchInvoiceDetails();
    } catch (err) {
      console.error("Error reversing sales journal:", err);
      toast.error(err?.response?.data?.message || "Failed to reverse sales journal");
    } finally {
      setLoading(false);
    }
  };

  const getPaymentTermsText = (terms) => {
    const termsMap = {
      "net-15": "Net 15 Days",
      "net-30": "Net 30 Days",
      "net-45": "Net 45 Days",
      "net-60": "Net 60 Days",
      "net-90": "Net 90 Days",
      cod: "Cash on Delivery",
      advance: "Advance Payment",
      immediate: "Immediate Payment",
      monthly: "Monthly",
      weekly: "Weekly",
      milestone: "Milestone Based",
      hourly: "Hourly",
      on_milestone: "On Milestone",
      on_delivery: "On Delivery",
    };
    return termsMap[terms] || (terms ? terms.charAt(0).toUpperCase() + terms.slice(1) : null);
  };

  // Calculate payment information
  const calculatePaymentInfo = (invoice) => {
    const totalInvoiceAmount = Number(invoice.amountDue || invoice.invoiceAmount || 0);
    const tdsAmount = Number(invoice.tdsAmount || invoice.totalTDSAmount || 0);
    const netPayable = totalInvoiceAmount - tdsAmount;
    const invoiceAmount = netPayable;
    const payments = invoice.payments || invoice.paymentIds || [];

    const activePayments = payments.filter((p) => !p.isReversed);
    const getReceivedAmount = (payment = {}) =>
      Number(
        payment.receivedAmount ??
          payment.amountReceived ??
          payment.amountPaid ??
          0,
      );
    const getSettlementAmount = (payment = {}) => {
      if (payment.originalAmount != null) return Number(payment.originalAmount || 0);
      if (payment.settledAmount != null) return Number(payment.settledAmount || 0);
      if (payment.expectedAmount != null) return Number(payment.expectedAmount || 0);
      if (payment.grossAmount != null) {
        return Math.max(
          0,
          Number(payment.grossAmount || 0) -
            Number(payment.tdsAmount || payment.tdsAdjusted || 0),
        );
      }
      return getReceivedAmount(payment) + Number(payment.adjustmentAmount || 0);
    };

    const paymentsTotal = activePayments.reduce(
      (sum, payment) => sum + getReceivedAmount(payment),
      0,
    );
    const settledTotal = activePayments.reduce(
      (sum, payment) => sum + getSettlementAmount(payment),
      0,
    );
    const totalTDSAdjusted = activePayments.reduce(
      (sum, payment) => sum + Number(payment.tdsAdjusted || payment.tdsAmount || 0),
      0,
    );

    const totalReceived =
      activePayments.length > 0
        ? paymentsTotal
        : Number(invoice.paidAmount ?? Math.max(0, invoiceAmount - Number(invoice.remainingAmount ?? invoiceAmount)));
    const totalSettled =
      activePayments.length > 0
        ? settledTotal
        : Number(invoice.paidAmount ?? totalReceived);
    const pendingAmount = Math.max(
      0,
      activePayments.length > 0
        ? invoiceAmount - totalSettled
        : Number(invoice.remainingAmount ?? invoiceAmount - totalSettled),
    );
    const completionPercentage = invoiceAmount > 0 ? (totalSettled / invoiceAmount) * 100 : 0;

    let paymentStatus = "unpaid";
    if (invoice.approvalStatus === "Rejected") {
      paymentStatus = "rejected";
    } else if (invoice.isFullyPaid || invoice.status === "PAID" || invoice.status === "RECONCILED" || pendingAmount <= 0.01) {
      paymentStatus = "fully_paid";
    } else if (totalSettled > 0) {
      paymentStatus = "partially_paid";
    }

    return {
      invoiceAmount,
      totalInvoiceAmount,
      tdsAmount,
      netPayable,
      totalReceived,
      totalSettled,
      totalDeductions: Math.max(0, totalSettled - totalReceived),
      pendingAmount,
      totalTDSAdjusted,
      completionPercentage: Math.min(100, completionPercentage),
      paymentStatus,
      paymentCount: payments.length,
      lastPaymentDate: payments.length > 0 ? payments[payments.length - 1].paymentDate : null,
    };
  };

  const getPaymentStatusBadge = (paymentStatus, pendingAmount) => {
    switch (paymentStatus) {
      case "fully_paid":
        return {
          label: "Fully Paid",
          color: "bg-green-100 text-green-800",
          icon: CheckCircle,
          iconColor: "text-green-600",
        };
      case "partially_paid":
        return {
          label: `₹${pendingAmount.toFixed(2)} Pending`,
          color: "bg-amber-100 text-amber-800",
          icon: Clock,
          iconColor: "text-amber-600",
        };
      case "rejected":
        return {
          label: "Rejected",
          color: "bg-red-100 text-red-800",
          icon: AlertTriangle,
          iconColor: "text-red-600",
        };
      case "unpaid":
      default:
        return {
          label: "Unpaid",
          color: "bg-red-100 text-red-800",
          icon: AlertTriangle,
          iconColor: "text-red-600",
        };
    }
  };

  const getDueDateStatus = (dueDate) => {
    const today = dayjs();
    const due = dayjs(dueDate);

    if (due.isBefore(today, "day")) {
      return {
        text: "Overdue",
        color: "text-red-600",
        bg: "bg-red-50",
        icon: AlertCircle,
      };
    } else if (due.diff(today, "day") <= 3) {
      return {
        text: "Due Soon",
        color: "text-yellow-600",
        bg: "bg-yellow-50",
        icon: Clock,
      };
    } else {
      return {
        text: "On Time",
        color: "text-green-600",
        bg: "bg-green-50",
        icon: CheckCircle,
      };
    }
  };

  const calculateTotalTax = (invoice) => {
    if (invoice?.totalTaxAmount != null) {
      return Number(invoice.totalTaxAmount || 0);
    }
    const cgst = invoice?.totalCGSTAmount || 0;
    const sgst = invoice?.totalSGSTAmount || 0;
    const igst = invoice?.totalIGSTAmount || 0;
    return cgst + sgst + igst;
  };

  const getTaxBreakdownRows = (invoice, fallbackLabel = "Tax") => {
    const summaryRows = (Array.isArray(invoice?.taxSummary) ? invoice.taxSummary : [])
      .map((entry) => ({
        l: entry.label || entry.taxType || fallbackLabel,
        amount: Number(entry.amount || 0),
      }))
      .filter((entry) => entry.amount > 0);

    if (summaryRows.length > 0) {
      return summaryRows;
    }

    const legacyRows = [
      { l: "CGST", amount: Number(invoice?.totalCGSTAmount || 0) },
      { l: "SGST", amount: Number(invoice?.totalSGSTAmount || 0) },
      { l: "IGST", amount: Number(invoice?.totalIGSTAmount || 0) },
    ].filter((entry) => entry.amount > 0);

    if (legacyRows.length > 0) {
      return legacyRows;
    }

    const totalTax = calculateTotalTax(invoice);
    return totalTax > 0 ? [{ l: `Total ${fallbackLabel}`, amount: totalTax }] : [];
  };

  const getInvoiceTdsAmount = (invoice) =>
    Number(invoice?.totalTDSAmount || invoice?.tdsAmount || 0);

  const getPaymentTdsAmount = (payment = {}) =>
    Number(payment.tdsAmount || payment.tdsAdjusted || 0);

  const hasInvoiceTds = getInvoiceTdsAmount(invoice) > 0;

  const handlePrint = () => {
    if (invoice?.approvalStatus !== "Approved") {
      toast.error("Only approved invoices can be printed");
      return;
    }
    window.print();
  };

  const handleCopyInvoiceNo = () => {
    if (invoice?.invoiceNo) {
      navigator.clipboard.writeText(invoice.invoiceNo);
      toast.success("Invoice number copied to clipboard!");
    }
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    if (invoice.approvalStatus !== "Approved") {
      toast.error("Only approved invoices can be downloaded");
      return;
    }

    try {
      const response = await downloadInvoicePdfApi(invoice._id);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoice.invoiceNo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Failed to download PDF");
    }
  };

  const handleDownloadWord = async () => {
    if (!invoice) return;
    if (invoice.approvalStatus !== "Approved") {
      toast.error("Only approved invoices can be downloaded");
      return;
    }

    try {
      const response = await downloadInvoiceWordApi(invoice._id);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoice.invoiceNo}.docx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("Word document downloaded successfully");
    } catch (error) {
      console.error("Error downloading Word document:", error);
      toast.error("Failed to download Word document");
    }
  };

  const getInvoiceStatusBadge = (invoice) => {
    const status = invoice.status;
    const statusConfig = {
      PENDING_APPROVAL: { label: "Pending Approval", color: "bg-gray-100 text-gray-800", icon: FileText },
      POSTED: { label: "Posted", color: "bg-blue-100 text-blue-800", icon: FileText },
      PARTIALLY_PAID: { label: "Partially Paid", color: "bg-yellow-100 text-yellow-800", icon: Clock },
      PAID: { label: "Paid", color: "bg-blue-100 text-blue-800", icon: CheckCircle },
      RECONCILED: { label: "Reconciled", color: "bg-green-100 text-green-800", icon: Shield },
    };

    let config = statusConfig[status] || statusConfig.PENDING_APPROVAL;

    // Override if approved but not posted
    if (invoice.approvalStatus === "Approved" && !invoice.salesJournalId) {
      config = { label: "Posting Pending", color: "bg-amber-100 text-amber-800", icon: Clock };
    }

    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3 mr-1.5" />
        {config.label}
      </span>
    );
  };

  const handleSendEmail = async () => {
    if (!invoice) return;

    try {
      // API call to send email would go here
      toast.info("Email functionality coming soon!");
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email");
    }
  };

  const handleRecordPayment = () => {
    if (!invoice) return;
    if (invoice.approvalStatus !== "Approved") {
      toast.error("Payment can be recorded only after invoice approval");
      return;
    }

    // Check if sales journal is posted first
    if (!invoice.salesJournalId) {
      toast.error("Please post the sales journal first before recording payments");
      return;
    }

    // Check if already fully paid
    const paymentInfo = calculatePaymentInfo(invoice);
    if (paymentInfo.pendingAmount <= 0) {
      toast.info("This invoice is already fully paid");
      return;
    }

    setPaymentReceiptModal(true);
  };

  const handlePostSalesJournal = () => {
    if (!invoice) return;
    if (invoice.approvalStatus !== "Approved") {
      toast.error("Sales journal can be posted only after invoice approval");
      return;
    }

    if (invoice.salesJournalId) {
      toast.info("Sales journal already posted for this invoice");
      return;
    }

    setCreateLedgerModal(true);
  };

  // 👇 Helper to get the PO ID from invoice data
  const getPOId = () => {
    // Try to get from linkedPO object or direct ID field
    if (invoice?.linkedPO?._id) return invoice.linkedPO._id;
    if (invoice?.linkedPOId) return invoice.linkedPOId;
    return null;
  };

  // 👇 Handler for clicking the PO number
  const handlePOClick = () => {
    const poId = getPOId();
    if (poId) {
      setShowPOModal(true);
    } else {
      toast.info("PO details not available");
    }
  };

  if (!isOpen) return null;

  const paymentInfo = invoice ? calculatePaymentInfo(invoice) : {};
  const currency    = invoice?.currency || "INR";
  const taxLabel = invoice?.taxLabel || invoice?.taxType || "Tax";
  const itemTaxLabel = ["CGST", "SGST", "IGST"].includes(String(taxLabel).toUpperCase()) ? "GST" : taxLabel;
  const taxBreakdownRows = getTaxBreakdownRows(invoice, taxLabel);
  const isApprovedInvoice = invoice?.approvalStatus === "Approved";
  const isRejectedInvoice = invoice?.approvalStatus === "Rejected";
  const rejectionReason = invoice?.rejectionReason || invoice?.approvalComments || invoice?.rejectionHistory?.[invoice.rejectionHistory.length - 1]?.reason;
  const TABS = isApprovedInvoice
    ? ["overview","items","payments","accounting","documents"]
    : ["overview","items","payments","accounting"];

  /* ── small helpers ── */
  const F = ({ label, value, mono }) => (
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-xs font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );

  const SectionCard = ({ title, icon: Icon, accent, children, extra }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100"
        style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: accent }} />
          <Icon size={13} className="text-slate-500" />
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title}</p>
        </div>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-6 overflow-y-auto">
        <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">

          {/* ── Header ── */}
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
                      {invoice?.invoiceNo ? `Invoice  ${invoice.invoiceNo}` : "Invoice Details"}
                    </h2>
                    {invoice && getInvoiceStatusBadge(invoice)}
                    {invoice && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        paymentInfo.paymentStatus === "fully_paid" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : paymentInfo.paymentStatus === "partially_paid" ? "bg-amber-100 text-amber-700 border-amber-200"
                        : "bg-red-100 text-red-700 border-red-200"
                      }`}>
                        {paymentInfo.paymentStatus === "fully_paid" ? "Fully Paid"
                          : paymentInfo.paymentStatus === "partially_paid" ? "Partial"
                          : "Unpaid"}
                      </span>
                    )}
                  </div>
                  {invoice && (
                    <p className="text-blue-200 text-[11px] mt-0.5">Created {formatDateTime(invoice.createdAt)}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={handleCopyInvoiceNo} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Copy Invoice No"><Copy size={14} /></button>
                {isApprovedInvoice && (
                  <>
                    <button onClick={handlePrint}         className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Print"><Printer size={14} /></button>
                    <button onClick={handleDownloadPDF}   className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Download PDF"><Download size={14} /></button>
                  </>
                )}
                <button onClick={onClose}             className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Close"><X size={14} /></button>
              </div>
            </div>

            {isRejectedInvoice && (
              <div className="px-6 py-3.5 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-black px-2 py-0.5 bg-red-100 border border-red-200 rounded-md text-[10px] uppercase tracking-wider">
                    Rejected
                  </span>
                  {rejectionReason ? (
                    <span className="font-medium text-slate-700">
                      Reason: <span className="font-bold text-red-700">{rejectionReason}</span>
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/master-data/manual-invoice?edit=${invoice._id}`);
                  }}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0"
                >
                  <Edit size={12} /> Edit &amp; Resubmit
                </button>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex bg-white border-b border-slate-200 px-2">
              {TABS.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                    activeTab === t
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}>
                  {t === "accounting" ? "Accounting" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                <p className="text-xs text-slate-400 font-medium">Loading invoice details…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm font-semibold text-red-600">{error}</p>
                <button onClick={fetchInvoiceDetails}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl"
                  style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                  Try Again
                </button>
              </div>
            ) : invoice ? (
              <div className="space-y-4">

                {/* ══ OVERVIEW ══ */}
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    {/* Stat strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label:"Total Amount", value: formatCurrency(invoice.amountDue||0,currency), g:"linear-gradient(135deg,#1e3a8a,#2563eb)", blob:"#93c5fd", icon: Banknote },
                        { label:"Received",     value: formatCurrency(paymentInfo.totalReceived||0,currency), g:"linear-gradient(135deg,#064e3b,#059669)", blob:"#6ee7b7", icon: CheckCircle },
                        { label:"Pending",      value: formatCurrency(paymentInfo.pendingAmount||0,currency), g:"linear-gradient(135deg,#92400e,#d97706)", blob:"#fde68a", icon: Clock },
                        { label:"Due Date",     value: formatDate(invoice.dueDate),
                          sub: getDueDateStatus(invoice.dueDate).text,
                          g: getDueDateStatus(invoice.dueDate).text === "Overdue"
                            ? "linear-gradient(135deg,#7f1d1d,#dc2626)"
                            : getDueDateStatus(invoice.dueDate).text === "Due Soon"
                            ? "linear-gradient(135deg,#92400e,#d97706)"
                            : "linear-gradient(135deg,#312e81,#7c3aed)",
                          blob: "#c4b5fd", icon: Calendar },
                      ].map((s, i) => (
                        <div key={i} className="relative overflow-hidden rounded-2xl p-4 shadow-md group cursor-default"
                          style={{ background: s.g }}>
                          <div className="absolute -top-4 -right-4 w-14 h-10 rounded-full opacity-25 blur-xl"
                            style={{ background: `radial-gradient(ellipse,${s.blob},transparent)` }} />
                          <div className="absolute top-0 right-8 w-px h-full bg-white/15 rotate-12 scale-y-150" />
                          <div className="relative z-10 flex items-start justify-between">
                            <div>
                              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1">{s.label}</p>
                              <p className="text-sm font-black text-white leading-tight">{s.value}</p>
                              {s.sub && <span className="text-[9px] text-white/70 font-bold">{s.sub}</span>}
                            </div>
                            <div className="p-2 bg-white/20 rounded-xl border border-white/20 backdrop-blur-sm group-hover:scale-110 transition-transform">
                              <s.icon size={13} className="text-white" />
                            </div>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                        </div>
                      ))}
                    </div>

                    {/* Client + Invoice info */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <SectionCard title="Client Details" icon={Building} accent="linear-gradient(180deg,#2563eb,#60a5fa)">
                        <div className="space-y-3">
                          <F label="Client Name" value={invoice.billTo?.name} />
                          <F label="Address"     value={invoice.billTo?.address} />
                          <div className="grid grid-cols-2 gap-3">
                            <F label={invoice.billTo?.taxIdentifierType || "Tax ID"} value={invoice.billTo?.taxIdentifierNumber || invoice.billTo?.GSTIN} mono />
                            <F label="State Code" value={invoice.billTo?.stateCode} mono />
                          </div>
                        </div>
                      </SectionCard>

	                    <SectionCard title="Invoice Details" icon={FileText} accent="linear-gradient(180deg,#7c3aed,#a78bfa)">
	                      <div className="space-y-3">
	                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
	                          <F label="Invoice Date"  value={formatDate(invoice.invoiceDate)} />
	                          <F label="Payment Due Date" value={formatDate(invoice.paymentDueDate)} />
	                          <F label="Currency"      value={invoice.currency || "INR"} />
	                        </div>
	                        <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">PO Number</p>
                              <button
                                type="button"
                                disabled={!invoice.linkedPO?._id}
                                onClick={() => setShowPOModal(true)}
                                className="text-xs font-semibold text-blue-700 underline underline-offset-2 disabled:text-slate-800 disabled:no-underline"
                              >
                                {invoice.linkedPO?.poNumber || invoice.linkedPORef || "—"}
                              </button>
                            </div>
	                          <F label="PO Reference" value={invoice.linkedPO?.poreferencevalue || invoice.poreferencevalue} mono />
	                        </div>
	                        <F label="Payment Terms" value={getPaymentTermsText(invoice.linkedPO?.paymentTerms || invoice.paymentTerms)} />
	                        <F label="Shipping To"   value={invoice.shipTo?.name || "Same as billing"} />
	                      </div>
	                    </SectionCard>
                  </div>

                  {/* Financial Breakdown */}
                  <SectionCard title="Financial Breakdown" icon={Calculator} accent="linear-gradient(180deg,#d97706,#fbbf24)">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { l:"Taxable Value", v: formatCurrency(invoice.totalTaxableValue||0,currency), cls:"bg-slate-50 border-slate-100" },
                          { l:`Total ${itemTaxLabel}`, v: formatCurrency(calculateTotalTax(invoice),currency), cls:"bg-slate-50 border-slate-100" },
                          { l:"TDS (Reference Only)", v: formatCurrency(getInvoiceTdsAmount(invoice),currency), cls:"bg-violet-50 border-violet-100" },
                          { l:"Invoice Total", v: formatCurrency(invoice.amountDue || invoice.netPayable || 0,currency), cls:"bg-blue-50 border-blue-100" },
                        ].map(s => (
                          <div key={s.l} className={`p-3 rounded-xl border ${s.cls}`}>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.l}</p>
                            <p className="text-xs font-black text-slate-800 tabular-nums">{s.v}</p>
                          </div>
                        ))}
                      </div>

                        <div className={`grid gap-3 pt-3 border-t border-slate-100 ${taxBreakdownRows.length > 1 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
                          {taxBreakdownRows.map((entry) => {
                            const label = entry.l || entry.label || entry.taxType || taxLabel;
                            const value = entry.amount ?? 0;
                            return (
                              <div key={label} className="flex items-center justify-between px-3 py-2 rounded-xl border bg-slate-50 border-slate-100 text-slate-700">
                                <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
                                <span className="text-xs font-black tabular-nums">{formatCurrency(value,currency)}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Progress bar */}
                        <div className="pt-3 border-t border-slate-100">
                          <div className="flex justify-between items-center mb-1.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Progress</p>
                            <p className="text-[10px] font-black text-blue-600">{(paymentInfo.completionPercentage||0).toFixed(1)}%</p>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${(paymentInfo.completionPercentage||0)===100 ? "bg-emerald-500" : (paymentInfo.completionPercentage||0)>0 ? "bg-blue-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(paymentInfo.completionPercentage||0,100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1.5">
                            <span>₹{(paymentInfo.totalReceived||0).toLocaleString("en-IN")} received</span>
                            <span>₹{(paymentInfo.pendingAmount||0).toLocaleString("en-IN")} pending</span>
                          </div>
                        </div>
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ══ ITEMS ══ */}
                {activeTab === "items" && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
                      style={{ background: "linear-gradient(90deg,#f8fafc,#eff6ff)" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#1e3a8a,#60a5fa)" }} />
                        <Package size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Invoice Items</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                          style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                          {invoice.items?.length || 0}
                        </span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "linear-gradient(90deg,#f1f5f9,#dbeafe)" }}>
                            {["Description","HSN/SAC","Qty","Rate","Taxable Value",`${itemTaxLabel} %`,`${itemTaxLabel} Amt`,"Total"].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                            ))}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {invoice.items?.map((item, i) => (
                            <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{item.description}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">#{i+1}</p>
                              </td>
                              <td className="px-4 py-3"><span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{item.hsnSac||"—"}</span></td>
                              <td className="px-4 py-3 font-bold text-slate-700 tabular-nums">{item.quantity}</td>
                              <td className="px-4 py-3 tabular-nums text-slate-700">{formatCurrency(item.rate,currency)}</td>
                              <td className="px-4 py-3 tabular-nums text-slate-700">{formatCurrency(item.taxableValue,currency)}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[10px] font-black w-fit">
                                    {getItemTaxRate(item)}%
                                  </span>
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                                    {getItemTaxLabel(item)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 tabular-nums text-amber-700 font-semibold">{formatCurrency(getItemTaxAmount(item),currency)}</td>
                              <td className="px-4 py-3 font-black text-slate-900 tabular-nums">{formatCurrency(item.total ?? item.totalAmount,currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "linear-gradient(90deg,#f1f5f9,#dbeafe)" }}>
                            <td colSpan={4} className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Totals</td>
                            <td className="px-4 py-3 font-black text-slate-700 tabular-nums">{formatCurrency(invoice.totalTaxableValue||0,currency)}</td>
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3 font-black text-amber-700 tabular-nums">{formatCurrency(calculateTotalTax(invoice),currency)}</td>
                            <td className="px-4 py-3 font-black text-blue-700 tabular-nums text-sm">{formatCurrency(invoice.amountDue||0,currency)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* ══ PAYMENTS ══ */}
                {activeTab === "payments" && (
                  <div className="space-y-4">
                    <SectionCard title="Payment Summary" icon={CreditCard} accent="linear-gradient(180deg,#059669,#34d399)"
                      extra={
                        paymentInfo.pendingAmount > 0 && invoice.salesJournalId ? (
                          <button onClick={handleRecordPayment}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white rounded-xl hover:opacity-90 transition-all"
                            style={{ background: "linear-gradient(135deg,#059669,#34d399)", boxShadow:"0 4px 10px rgba(5,150,105,0.25)" }}>
                            <Banknote size={11} /> Record Payment
                          </button>
                        ) : null
                      }>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[
                          { l:"Invoice Total", v: formatCurrency(paymentInfo.totalInvoiceAmount||0,currency), cls:"text-slate-600" },
                          { l:"TDS Deduction", v: formatCurrency(paymentInfo.tdsAmount||0,currency), cls:"text-violet-600" },
                          { l:"Net Payable",   v: formatCurrency(paymentInfo.netPayable||0,currency), cls:"text-blue-700 font-bold" },
                          { l:"Total Received",v: formatCurrency(paymentInfo.totalReceived||0,currency), cls:"text-emerald-700 font-bold" },
                          { l:"Pending",       v: formatCurrency(paymentInfo.pendingAmount||0,currency), cls:"text-amber-700 font-bold" },
                        ].map(s => (
                          <div key={s.l} className="text-center p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center min-h-[60px]">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.l}</p>
                            <p className={`text-xs tabular-nums ${s.cls}`}>{s.v}</p>
                          </div>
                        ))}
                      </div>
                      {invoice.salesJournalId && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-violet-50 rounded-lg border border-violet-100">
                              <BookOpen size={12} className="text-violet-600" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales Journal Reference</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleOpenJournal(invoice.salesJournalId)}
                            className="text-xs font-bold text-violet-600 hover:text-violet-800 hover:underline flex items-center gap-1 transition-all"
                          >
                            {invoice.salesJournal?.number || invoice.salesJournalId?.number || "View Journal"}
                            <span className="text-slate-400 font-normal">→</span>
                          </button>
                        </div>
                      )}
                    </SectionCard>

                  {(invoice.payments || invoice.paymentIds) && (invoice.payments || invoice.paymentIds).length > 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc,#f0fdf4)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#059669,#34d399)" }} />
                        <History size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Payment History</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                          style={{ background: "linear-gradient(135deg,#059669,#34d399)" }}>{(invoice.payments || invoice.paymentIds).length}</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {[...(invoice.payments || invoice.paymentIds)].sort((a,b) => new Date(b.paymentDate)-new Date(a.paymentDate)).map((p,i) => (
                          <div key={p._id||i} className="flex items-center justify-between px-5 py-3.5 hover:bg-emerald-50/30 transition-colors group">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center border border-emerald-100 shrink-0"
                                style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)" }}>
                                <Banknote size={14} className="text-emerald-600" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                                  Payment #{i+1}
                                  {p.isReversed && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-600 border border-red-200">Reversed</span>
                                  )}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                                  <span>{formatDate(p.paymentDate)}</span>
                                  {p.paymentMode && <span>· {p.paymentMode}</span>}
                                  {p.referenceNumber && <span className="font-mono">· {p.referenceNumber}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-black tabular-nums ${p.isReversed ? "text-slate-400 line-through" : "text-emerald-700"}`}>
                                {formatCurrency(p.amountReceived ?? p.receivedAmount ?? p.amountPaid, currency)}
                              </p>
                              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                                Pending impact: {formatCurrency(p.grossAmount ?? p.receivedAmount ?? p.amountPaid, currency)}
                              </p>
                              <div className="flex items-center justify-end gap-2 mt-1 flex-wrap">
                                {p.tdsAdjusted>0 && <span className="text-[9px] text-violet-600 font-bold">TDS: {formatCurrency(p.tdsAdjusted,currency)}</span>}
                                {(p.paymentJournal || p.journalId) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenJournal(p.paymentJournal?._id || p.journalId?._id || p.journalId)}
                                    className="text-[9px] text-blue-600 font-bold hover:text-blue-800 flex items-center gap-1"
                                  >
                                    <BookOpen size={10} />
                                    Journal: {p.paymentJournal?.number || p.journalId?.number || "View"}
                                  </button>
                                )}
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${p.isReversed ? "bg-red-100 text-red-600 border-red-200" : p.status==="posted" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                  {p.isReversed ? "reversed" : (p.status||"recorded")}
                                </span>
                              </div>
                              {/* Reverse Payment Controls */}
                              <div className="flex items-center justify-end gap-2 mt-1.5 flex-wrap">
                                {p.isReversed ? (
                                  <>
                                    <button
                                      disabled
                                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold rounded-lg bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                    >
                                      <RotateCcw size={9} />
                                      Payment Reversed
                                    </button>
                                    {(p.reversalJournalId) && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenJournal(p.reversalJournalId?._id || p.reversalJournalId)}
                                        className="text-[9px] text-purple-600 font-bold hover:text-purple-800 flex items-center gap-1 transition-colors"
                                      >
                                        <BookOpen size={9} />
                                        View Reversed Posting →
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={reversingPaymentId === p._id}
                                    onClick={() => handleReverseClick(p)}
                                    className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold rounded-lg border transition-all ${
                                      reversingPaymentId === p._id
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait"
                                        : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:text-red-700"
                                    }`}
                                  >
                                    <RotateCcw size={9} className={reversingPaymentId === p._id ? "animate-spin" : ""} />
                                    {reversingPaymentId === p._id ? "Reversing…" : "Reverse Payment"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 bg-white rounded-2xl border border-slate-200 border-dashed">
                      <div className="p-4 bg-slate-100 rounded-2xl"><Banknote size={24} className="text-slate-300" /></div>
                      <p className="text-sm font-bold text-slate-500">No payments recorded yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* ══ ACCOUNTING ══ */}
              {activeTab === "accounting" && (
                <div className="space-y-4">
                  <SectionCard title="Sales Journal" icon={BookOpen} accent="linear-gradient(180deg,#7c3aed,#a78bfa)"
                    extra={
                      isApprovedInvoice && !invoice.salesJournalId ? (
                        <button onClick={handlePostSalesJournal}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white rounded-xl hover:opacity-90 transition-all"
                          style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)", boxShadow:"0 4px 10px rgba(124,58,237,0.25)" }}>
                          <BookOpen size={11} /> Post Journal
                        </button>
                      ) : null
                    }>
                    {invoice.salesJournalId ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                          <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-emerald-800">Sales Journal Posted</p>
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => handleOpenJournal(invoice.salesJournalId)}
                                className="text-[10px] font-mono text-emerald-600 hover:text-emerald-800 hover:underline text-left block"
                              >
                                {invoice.salesJournal?.number || invoice.salesJournalId?.number || invoice.salesJournalId?._id || invoice.salesJournalId}
                              </button>
                              <button
                                type="button"
                                onClick={handleReverseSalesJournal}
                                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-all"
                              >
                                <RotateCcw size={9} /> Reverse Posting
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <F label="Posted On" value={formatDateTime(invoice.salesJournalPostedAt)} />
                          <F label="Posted By"  value={invoice.salesJournalPostedBy?.name || "System"} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <F label="Journal Number" value={invoice.salesJournal?.number || invoice.salesJournalId?.number} mono />
                          <F label="Journal Date" value={formatDate(invoice.salesJournal?.date || invoice.salesJournalId?.date)} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8 gap-3 text-center">
                        <div className="p-3 bg-slate-100 rounded-2xl"><BookOpen size={22} className="text-slate-300" /></div>
                        <p className="text-xs font-bold text-slate-500">Sales journal not posted yet</p>
                        <p className="text-[11px] text-slate-400">
                          {isApprovedInvoice
                            ? "Post the sales journal to enable payment recording and ledger integration."
                            : "Sales journal posting is available only after invoice approval."}
                        </p>
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Payment Status" icon={CreditCard} accent="linear-gradient(180deg,#059669,#34d399)">
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Invoice Amount</p>
                          <p className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(invoice.amountDue||0,currency)}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Received</p>
                          <p className="text-sm font-black text-emerald-700 tabular-nums">{formatCurrency(paymentInfo.totalReceived||0,currency)}</p>
                        </div>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pending Amount</p>
                        <p className={`text-base font-black tabular-nums ${(paymentInfo.pendingAmount||0)>0 ? "text-amber-700" : "text-emerald-700"}`}>
                          {formatCurrency(paymentInfo.pendingAmount||0,currency)}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Settlement Status</p>
                        <p className={`text-sm font-black ${paymentInfo.paymentStatus === "fully_paid" ? "text-emerald-700" : "text-blue-700"}`}>
                          {paymentInfo.paymentStatus === "fully_paid" ? "Fully Settled" : paymentInfo.paymentStatus === "partially_paid" ? "Partially Paid" : "Unpaid"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black border ${
                          paymentInfo.paymentStatus==="fully_paid" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : paymentInfo.paymentStatus==="partially_paid" ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-red-100 text-red-700 border-red-200"
                        }`}>
                          {paymentInfo.paymentStatus==="fully_paid" ? "Fully Paid"
                            : paymentInfo.paymentStatus==="partially_paid" ? "Partially Paid"
                            : "Unpaid"}
                        </span>
                        {isApprovedInvoice && invoice.salesJournalId && (paymentInfo.pendingAmount||0)>0 && (
                          <button onClick={handleRecordPayment}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
                            Record Payment →
                          </button>
                        )}
                        {isApprovedInvoice && !invoice.salesJournalId && (
                          <button onClick={handlePostSalesJournal}
                            className="text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors">
                            Post Journal →
                          </button>
                        )}
                      </div>
                      {(invoice.payments || invoice.paymentIds)?.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          {(invoice.payments || invoice.paymentIds).map((payment, index) => (
                            <div key={payment._id || index} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                  Receipt #{index + 1}
                                </span>
                                <span className="text-xs font-black text-emerald-700">
                                  {formatCurrency(payment.amountReceived ?? payment.receivedAmount ?? payment.amountPaid, currency)}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500 flex flex-wrap gap-2">
                                <span>{formatDate(payment.paymentDate)}</span>
                                {(payment.paymentJournal || payment.journalId) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenJournal(payment.paymentJournal?._id || payment.journalId?._id || payment.journalId)}
                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  >
                                    <BookOpen size={10} />
                                    Journal: {payment.paymentJournal?.number || payment.journalId?.number || "View"}
                                  </button>
                                )}
                                {payment.referenceNumber && <span>Ref: {payment.referenceNumber}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </SectionCard>
                </div>
              )}

                {/* ══ DOCUMENTS ══ */}
                {activeTab === "documents" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SectionCard title="Generated Documents" icon={FileText} accent="linear-gradient(180deg,#1e3a8a,#60a5fa)">
                      <div className="space-y-2.5">
                        {[
                          { label:"Invoice PDF",   sub:"Professional formatted PDF",     onClick: handleDownloadPDF,   iconCls:"bg-red-50 border-red-100 text-red-600",   Icon: Download },
                          { label:"Invoice Word",  sub:"Editable Word document",          onClick: handleDownloadWord,  iconCls:"bg-blue-50 border-blue-100 text-blue-600",  Icon: Download },
                          { label:"Email Invoice", sub:"Send to client via email",        onClick: handleSendEmail,     iconCls:"bg-emerald-50 border-emerald-100 text-emerald-600", Icon: Mail },
                        ].map(d => (
                          <button key={d.label} onClick={d.onClick}
                            className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl border ${d.iconCls}`}><FileText size={14} /></div>
                              <div className="text-left">
                                <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{d.label}</p>
                                <p className="text-[10px] text-slate-400">{d.sub}</p>
                              </div>
                            </div>
                            <d.Icon size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard title="Additional Information" icon={MessageSquare} accent="linear-gradient(180deg,#7c3aed,#a78bfa)">
                      <div className="space-y-4">
                        {invoice.notes && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notes</p>
                            <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 italic">"{invoice.notes}"</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Approval Status</p>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border ${
                            invoice.approvalStatus==="Approved" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : invoice.approvalStatus==="Pending" ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-red-100 text-red-700 border-red-200"
                          }`}>
                            {invoice.approvalStatus==="Approved" ? <><CheckCircle size={10}/> Approved</>
                              : invoice.approvalStatus==="Pending" ? <><Clock size={10}/> Pending</>
                              : <><AlertCircle size={10}/> Rejected</>}
                          </span>
                          {invoice.approvalStatus==="Approved" && invoice.approvedBy && (
                            <p className="text-[10px] text-slate-400 mt-1.5">Approved by: {invoice.approvedBy.name||"System"}</p>
                          )}
                          {invoice.approvalStatus==="Rejected" && rejectionReason && (
                            <p className="text-[10px] text-red-600 mt-1.5">Reason: {rejectionReason}</p>
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  </div>
                )}
              </div>
            ) : null}
          </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-200 bg-white rounded-b-2xl flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-medium">
            {invoice ? <>Last updated: <span className="font-bold text-slate-600">{formatDateTime(invoice.updatedAt)}</span></> : ""}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all">
              Close
            </button>
            <button onClick={handlePrint}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 hover:opacity-90 transition-all"
              style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)", boxShadow:"0 4px 12px rgba(37,99,235,0.3)" }}>
              <Printer size={13} /> Print Invoice
            </button>
          </div>
        </div>
      </div>

      {showTdsDetails && invoice && hasInvoiceTds && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-900">TDS Details</h3>
              <button type="button" onClick={() => setShowTdsDetails(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Taxable Base</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(invoice.totalTaxableValue || 0, invoice.currency)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Invoice Total</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(invoice.amountDue || invoice.invoiceAmount || 0, invoice.currency)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">TDS Collected</p>
                  <p className="mt-1 text-sm font-bold text-violet-700">
                    {formatCurrency((invoice.payments || []).reduce((sum, payment) => sum + Number(payment.tdsAmount || payment.tdsAdjusted || 0), 0), invoice.currency)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Received</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {formatCurrency((invoice.payments || []).reduce((sum, payment) => sum + Number(payment.amountPaid || payment.receivedAmount || 0), 0), invoice.currency)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Payment Date", "Reference", "Received", "TDS Amount", "Settlement"].map((label) => (
                        <th key={label} className="px-3 py-2 text-left font-semibold text-slate-500">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(invoice.payments || []).filter((payment) => getPaymentTdsAmount(payment) > 0).map((payment) => (
                      <tr key={payment._id}>
                        <td className="px-3 py-2 text-slate-700">{formatDate(payment.paymentDate)}</td>
                        <td className="px-3 py-2 text-slate-700">{payment.reference || payment.referenceNumber || "—"}</td>
                        <td className="px-3 py-2 text-slate-900">{formatCurrency(payment.amountPaid || payment.receivedAmount || 0, invoice.currency)}</td>
                        <td className="px-3 py-2 text-violet-700">{formatCurrency(payment.tdsAmount || payment.tdsAdjusted || 0, invoice.currency)}</td>
                        <td className="px-3 py-2 text-slate-900">{formatCurrency(payment.grossAmount || (Number(payment.amountPaid || 0) + Number(payment.tdsAmount || payment.tdsAdjusted || 0)), invoice.currency)}</td>
                      </tr>
                    ))}
                    {!((invoice.payments || []).filter((payment) => getPaymentTdsAmount(payment) > 0).length) && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No TDS-adjusted payments recorded yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <PurchaseOrderDetailModal
        isOpen={showPOModal}
        onClose={() => setShowPOModal(false)}
        purchaseOrderId={getPOId()}
      />
      <JournalDetailsModal
        open={showJournalModal}
        onClose={() => setShowJournalModal(false)}
        journal={selectedJournal}
      />
      {paymentReceiptModal && invoice && (
        <PaymentReceiptModal
          open={paymentReceiptModal}
          onClose={() => setPaymentReceiptModal(false)}
          onSuccess={() => {
            setPaymentReceiptModal(false);
            fetchInvoiceDetails();
          }}
          invoiceData={invoice}
        />
      )}
      {createLedgerModal && invoice && (
        <CreateLedgerFromInvoiceModal
          open={createLedgerModal}
          onClose={() => setCreateLedgerModal(false)}
          onSuccess={() => {
            setCreateLedgerModal(false);
            fetchInvoiceDetails();
          }}
          initialInvoiceNo={invoice.invoiceNo}
          invoiceData={invoice}
        />
      )}

      {/* Reversal Confirmation Modal */}
      {showReverseConfirm && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="p-3 bg-red-100 rounded-2xl mb-4">
                <RotateCcw className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Reverse Payment?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to reverse this payment of <strong>{formatCurrency(paymentToReverse?.amountReceived ?? paymentToReverse?.receivedAmount ?? paymentToReverse?.amountPaid, currency)}</strong>? This will create a reversal journal entry.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 mb-6 space-y-2 border border-slate-200">
              <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <span>Date</span>
                <span className="text-slate-900">{paymentToReverse && formatDate(paymentToReverse.paymentDate)}</span>
              </div>
              {paymentToReverse?.referenceNumber && (
                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider border-t border-slate-200 pt-2">
                  <span>Reference</span>
                  <span className="text-slate-900 font-mono">{paymentToReverse.referenceNumber}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReverseConfirm(false);
                  setPaymentToReverse(null);
                }}
                disabled={reversingPaymentId}
                className="flex-1 px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReverse}
                disabled={reversingPaymentId}
                className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {reversingPaymentId ? (
                  <>
                    <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Yes, Reverse"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Journal Reversal Confirmation Modal */}
      {showSalesJournalReverseConfirm && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="p-3 bg-red-100 rounded-2xl mb-4">
                <RotateCcw className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Reverse Posting?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to reverse the sales journal for invoice <strong>{invoice.invoiceNo}</strong>? This will unpost all accounting entries and revert the status to pending.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleConfirmSalesJournalReverse}
                disabled={loading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-lg shadow-red-200 transition-all disabled:opacity-50"
              >
                {loading ? "Reversing..." : "Yes, Reverse Posting"}
              </button>
              <button
                onClick={() => setShowSalesJournalReverseConfirm(false)}
                disabled={loading}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default InvoiceDetailModal;
