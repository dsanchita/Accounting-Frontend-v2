import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Outlet, useNavigate } from "react-router-dom";
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
import ViewAllInvoices from "./ViewAllInvoices";

import UserPendingInvoices from "../components/UserPendingInvoices";
import { getUsersApi } from "../apis/userApi";
import {
  deleteInvoiceApi,
  downloadInvoicePdfApi,
  downloadInvoiceWordApi,
  getInvoiceByIdApi,
  getInvoicesApi,
  getInvoiceTdsReportApi,
} from "../apis/invoice.api";
import {
  Plus,
  RefreshCw,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Receipt,
  Calendar,
  User,
  Package,
  Banknote,
  Filter,
  Edit,
  CreditCard,
  CircleCheckBig,
  History,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BookOpen,
  Percent,
  Download,
  Mail,
  CheckCircle,
  Upload,
  TrendingUp,
} from "lucide-react";
import { checkAuthorization } from "../utils/checkAuthorization";
import AuditLogSidebar from "../components/AuditLogSidebar";
import InvoiceAuditLogModal from "../modals/InvoiceAuditLogModal";
import { getInvoiceUpdatesApi } from "../apis/auditLog.api";
import InvoiceDetailModal from "../modals/InvoiceDetailsModal";

const InvoiceData = () => {
  const { user, hasPermission } = useAuth();
  const isAdminOrSuperAdmin = user?.role === "admin" || user?.role === "superAdmin";
  const canViewInvoice = hasPermission("INVOICE", "VIEW");
  const canCreateInvoice = hasPermission("INVOICE", "CREATE");
  const canEditInvoice = hasPermission("INVOICE", "EDIT");

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 0,
    total: 0,
  });
  const [createdByUsers, setCreatedByUsers] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [allInvoices, setAllInvoices] = useState([]);
  const [filteredAllInvoices, setFilteredAllInvoices] = useState([]);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [createLedgerModal, setCreateLedgerModal] = useState({
    open: false,
    invoiceNo: null,
    invoiceData: null,
  });

  const invoiceOptions = [...new Set(allInvoices.map((i) => i.invoiceNo))];
  const clientOptions = [...new Set(allInvoices.map((i) => i.billTo?.name))];
  const [showPreviousInvoices, setShowPreviousInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentModal, setPaymentModal] = useState({
    open: false,
    invoiceData: null,
  });
  const [paymentHistoryModal, setPaymentHistoryModal] = useState(false);
  const [tdsDetailsModalOpen, setTdsDetailsModalOpen] = useState(false);
  const [tdsDetailRows, setTdsDetailRows] = useState([]);
  const [tdsDetailsLoading, setTdsDetailsLoading] = useState(false);

  const [openLogs, setOpenLogs] = useState(false);
  const [auditModal, setAuditModal] = useState({
    open: false,
    invoiceId: null,
    invoiceNo: null,
  });
  const [auditLogCounts, setAuditLogCounts] = useState({});
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] =
    useState(null);
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false);
  const [userPendingModalOpen, setUserPendingModalOpen] = useState(false);

  const navigate = useNavigate();
  const handleViewAuditLog = (invoice, e) => {
    e.stopPropagation();
    setAuditModal({
      open: true,
      invoiceId: invoice._id,
      invoiceNo: invoice.invoiceNo,
    });
  };
  const handleViewDetails = (invoice, e) => {
    e.stopPropagation();
    setSelectedInvoiceForDetail(invoice);
    setDetailModalOpen(true);
  };
  // Add this function near other utility functions
  const fetchAuditLogCount = async (invoiceId) => {
    if (!invoiceId || auditLogCounts[invoiceId] !== undefined) return;

    try {
      const response = await getInvoiceUpdatesApi(user.company._id, invoiceId);
      const count = response.data?.data?.updates?.length || 0;
      setAuditLogCounts((prev) => ({ ...prev, [invoiceId]: count }));
    } catch (error) {
      console.error("Error fetching audit log count:", error);
      setAuditLogCounts((prev) => ({ ...prev, [invoiceId]: 0 }));
    }
  };

  // Fetch all invoices for dropdown options
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    const fetchAllInvoices = async () => {
      if (!user?.company?._id) return;
      try { const response = await getInvoicesApi(user.company._id, {
          page: 1,
          limit: 10000,
          approvalStatus: "Approved,Rejected",
          sort: "-createdAt",
        });

        setAllInvoices(response?.data || []);
      } catch (error) {
        console.error("Error fetching all invoices:", error);
        toast.error(error?.response?.data?.message);
      }
    };

    fetchAllInvoices();
  }, [user?.company?._id]);

  // Inside InvoiceData.jsx, update fetchInvoices:

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch only the most recent invoice (limit 1, sorted desc)
      const response = await getInvoicesApi(user.company._id, {
        page: 1,
        limit: 1,                // ✅ only one invoice
        approvalStatus: "Approved,Rejected",
        sort: "-createdAt",      // ✅ newest first
        ...advancedFilters,
      });

      let invoicesData = response?.data || [];
      // Extra safety sort (though API should already sort)
      invoicesData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setInvoices(invoicesData);

      // For filteredAllInvoices and allInvoices, keep as is (they may be used for stats)
      const allFiltered = await getInvoicesApi(user.company._id, {
        page: 1,
        limit: 10000,
        approvalStatus: "Approved,Rejected",
        sort: "-createdAt",
        ...advancedFilters,
      });
      setFilteredAllInvoices(allFiltered?.data || []);

      const allInvoicesRes = await getInvoicesApi(user.company._id, {
        page: 1,
        limit: 10000,
        approvalStatus: "Approved,Rejected",
        sort: "-createdAt",
      });
      setAllInvoices(allInvoicesRes?.data || []);

      // Update pagination to reflect single invoice
      setPagination({
        page: 1,
        limit: 1,
        totalPages: 1,
        total: invoicesData.length,
      });
    } catch (err) {
      console.error(err);
      setError("Failed to fetch invoices");
      toast.error(err?.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [pagination.page, pagination.limit, advancedFilters]);

  const syncPendingApprovals = useCallback(async () => {
    if (!user?.company?._id || !isAdminOrSuperAdmin) return;
    try {
      const res = await getInvoicesApi(user.company._id, { approvalStatus: "Pending", limit: 1 });
      setPendingApprovalsCount(res.pagination?.total || res.data?.length || 0);
    } catch (err) {
      console.error("Error fetching pending approvals:", err);
    }
  }, [user?.company?._id, isAdminOrSuperAdmin]);

  useEffect(() => {
    syncPendingApprovals();
  }, [syncPendingApprovals]);

  // Add this function to fetch users
  const fetchUsers = async () => {
    try {
      const response = await getUsersApi();
      // Extract users array from response (adjust based on your API response structure)
      const usersData = response.users || response.data || response;

      // Format users for the dropdown
      const formattedUsers = usersData.map((user) => ({
        _id: user._id,
        name:
          user.name ||
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          user.email ||
          "Unknown",
      }));

      setCreatedByUsers(formattedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users for search");
    }
  };
  // Fetch users when advanced search modal opens
  useEffect(() => {
    if (showAdvancedSearch) {
      fetchUsers();
    }
  }, [showAdvancedSearch]);

  const formatDate = (date) => (date ? dayjs(date).format("DD-MMM-YYYY") : "-");

  const toggleRowExpand = (id, e) => {
    e.stopPropagation();
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAdvancedSearch = (filters) => {
    setAdvancedFilters(filters);
    setAppliedFilters(filters);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setShowAdvancedSearch(false);
  };

  const handleRowClick = (invoice) => {
    const isExpanding = !expandedRows[invoice._id];
    setExpandedRows((prev) => ({
      ...prev,
      [invoice._id]: !prev[invoice._id],
    }));

    // Fetch audit log count when expanding
    if (isExpanding) {
      fetchAuditLogCount(invoice._id);
    }
  };

  const getItemSummary = (items) => {
    if (!items || items.length === 0) return "No items";
    return `${items.length} item${items.length > 1 ? "s" : ""}`;
  };

  const calculateTotalTax = (invoice) => {
    const cgst = invoice.totalCGSTAmount || 0;
    const sgst = invoice.totalSGSTAmount || 0;
    const igst = invoice.totalIGSTAmount || 0;
    return (cgst + sgst + igst).toFixed(2);
  };

  // Calculate payment information
  const calculatePaymentInfo = (invoice) => {
    const totalInvoiceAmount = invoice.amountDue || 0;
    const tdsAmount = Number(invoice.tdsAmount || 0);
    const netPayable = totalInvoiceAmount - tdsAmount;
    const invoiceAmount = netPayable;
    const payments = invoice.payments || [];

    const paymentsTotal = payments.reduce(
      (sum, payment) =>
        sum +
        Number(
          payment.originalAmount ??
          payment.settledAmount ??
          payment.grossAmount ??
          payment.receivedAmount ??
          payment.amountPaid ??
          0,
        ),
      0,
    );
    const totalTDSAdjusted = payments.reduce(
      (sum, payment) =>
        sum + Number(payment.tdsAdjusted ?? payment.tdsAmount ?? 0),
      0,
    );

    const totalReceived =
      payments.length > 0
        ? paymentsTotal
        : Number(
          invoice.paidAmount ??
          Math.max(
            0,
            invoiceAmount -
            Number(invoice.remainingAmount ?? invoiceAmount),
          ),
        );
    const pendingAmount = Math.max(
      0,
      payments.length > 0
        ? invoiceAmount - totalReceived
        : Number(invoice.remainingAmount ?? invoiceAmount - totalReceived),
    );
    const completionPercentage =
      netPayable > 0 ? (totalReceived / netPayable) * 100 : 0;

    let paymentStatus = invoice.paymentStatus;
    if (!paymentStatus) {
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

    return {
      invoiceAmount,
      totalInvoiceAmount,
      tdsAmount,
      netPayable,
      totalReceived,
      pendingAmount,
      totalTDSAdjusted,
      completionPercentage,
      paymentStatus,
      paymentCount: payments.length,
      lastPaymentDate:
        payments.length > 0 ? payments[payments.length - 1].paymentDate : null,
    };
  };

  const fetchTdsDetails = async () => {
    if (!user?.company?._id) return;
    setTdsDetailsLoading(true);
    try {
      const response = await getInvoiceTdsReportApi({
        companyId: user.company._id,
      });
      setTdsDetailRows(response.data || []);
    } catch (error) {
      console.error("Error fetching TDS details:", error);
      setTdsDetailRows([]);
    } finally {
      setTdsDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (tdsDetailsModalOpen) {
      fetchTdsDetails();
    }
  }, [tdsDetailsModalOpen]);

  const getTdsDetailRows = () => tdsDetailRows;

  const handleGenerateTdsReport = () => {
    const rows = getTdsDetailRows();
    if (!rows.length) {
      toast.error("No TDS data available to export");
      return;
    }

    const exportRows = rows.map((row) => ({
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
    XLSX.writeFile(
      workbook,
      `tds-report-${dayjs().format("DD-MMM-YYYY")}.xlsx`,
    );
  };

  // Get payment status badge
  const getPaymentStatusBadge = (paymentStatus, pendingAmount) => {
    switch (paymentStatus) {
      case "fully_paid":
        return {
          text: "Paid",
          color: "bg-green-100 text-green-800 border-green-200",
          icon: CheckCircle2,
          iconColor: "text-green-600",
        };
      case "partially_paid":
        return {
          text: `${pendingAmount.toFixed(2)} Pending`,
          color: "bg-amber-100 text-amber-800 border-amber-200",
          icon: Clock,
          iconColor: "text-amber-600",
        };
      case "rejected":
        return {
          text: "Rejected",
          color: "bg-red-100 text-red-800 border-red-300",
          icon: AlertTriangle,
          iconColor: "text-red-600",
        };
      case "unpaid":
      default:
        return {
          text: "Unpaid",
          color: "bg-red-100 text-red-800 border-red-200",
          icon: AlertTriangle,
          iconColor: "text-red-600",
        };
    }
  };

  const getInvoiceLifecycleBadge = (invoice) => {
    const status = invoice.status;
    const config = {
      PARTIALLY_PAID: {
        text: "Partially Paid",
        color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      },
      PAID: {
        text: "Paid",
        color: "bg-blue-100 text-blue-800 border-blue-200",
      },
      RECONCILED: {
        text: "Reconciled",
        color: "bg-green-100 text-green-800 border-green-200",
      },
      POSTED: {
        text: "Posted",
        color: "bg-slate-100 text-slate-700 border-slate-200",
      },
    };

    let res = config[status] || config.POSTED;

    if (invoice.approvalStatus === "Approved" && !invoice.salesJournalId) {
      res = {
        text: "Posting Pending",
        color: "bg-amber-100 text-amber-800 border-amber-200",
      };
    }

    return res;
  };

  const handleDownloadWord = async (invoiceId, invoiceNo, e) => {
    e.stopPropagation();
    try {
      const response = await downloadInvoiceWordApi(invoiceId);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoiceNo}.docx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("Word document downloaded successfully");
    } catch (error) {
      console.error("Error downloading Word document:", error);
      setError("Failed to download Word invoice");
      toast.error("Failed to download Word document");
    }
  };

  const handleDownloadPdf = async (invoiceId, invoiceNo, e) => {
    e.stopPropagation();
    try {
      const response = await downloadInvoicePdfApi(invoiceId);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoiceNo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      setError("Failed to download PDF");
      toast.error("Failed to download PDF");
    }
  };

  const handleEmailInvoice = async (invoiceId, e) => {
    if (e) e.stopPropagation();
    try {
      toast.info("Invoice email sending is not available in the current backend");
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to process invoice email action");
    }
  };

  const handleEditClick = (invoiceId, e) => {
    e.stopPropagation();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "border-green-500 text-green-600 bg-green-200";
      case "inprogress":
        return "border-yellow-500 text-yellow-600 bg-yellow-200";
      case "completed":
        return "border-gray-400 text-gray-600 bg-gray-300";
      default:
        return "border-gray-300 text-gray-500";
    }
  };

  const handleCreateLedgerClick = async (invoice, e) => {
    e.stopPropagation();

    // Check if sales journal already posted
    if (invoice.salesJournalId) {
      toast.info("Sales journal already posted for this invoice");
      return;
    }

    try {
      // Fetch full invoice data
      const response = await getInvoiceByIdApi(invoice._id);
      const fullInvoiceData = response?.data || invoice;

      setCreateLedgerModal({
        open: true,
        invoiceNo: invoice.invoiceNo,
        invoiceData: fullInvoiceData,
      });
    } catch (error) {
      console.error("Error fetching invoice details:", error);
      toast.error("Failed to load invoice details");
    }
  };

  const handleLedgerCreated = (newLedger) => {
    toast.success(`Journal posted successfully!`);

    // Refresh the invoice list
    fetchInvoices();

    setCreateLedgerModal({
      open: false,
      invoiceNo: null,
      invoiceData: null,
    });
  };

  const getInvoiceSummary = () => {
    const filteredInvoices = filteredAllInvoices; // This contains the currently filtered invoices

    if (filteredInvoices.length === 0) {
      return {
        totalAmount: 0,
        totalPendingAmount: 0,
        totalReceivedAmount: 0,
        pendingInvoices: 0,
        overdueInvoices: 0,
        totalInvoices: 0,
        totalTDS: 0,
      };
    }

    const totalAmount = filteredInvoices.reduce(
      (sum, inv) => sum + (inv.amountDue || 0),
      0,
    );

    let totalPendingAmount = 0;
    let totalReceivedAmount = 0;

    filteredInvoices.forEach((invoice) => {
      const paymentInfo = calculatePaymentInfo(invoice);
      totalPendingAmount += paymentInfo.pendingAmount;
      totalReceivedAmount += paymentInfo.totalReceived;
    });

    const pendingInvoices = filteredInvoices.filter((inv) => {
      const paymentInfo = calculatePaymentInfo(inv);
      return (
        paymentInfo.pendingAmount > 0 &&
        (inv.status === "active" || inv.status === "inprogress") &&
        dayjs(inv.dueDate).isAfter(dayjs())
      );
    }).length;

    const overdueInvoices = filteredInvoices.filter((inv) => {
      const paymentInfo = calculatePaymentInfo(inv);
      return (
        paymentInfo.pendingAmount > 0 &&
        (inv.status === "active" || inv.status === "inprogress") &&
        dayjs(inv.dueDate).isBefore(dayjs())
      );
    }).length;

    const totalTDS = filteredInvoices.reduce((sum, inv) => {
      const paymentTDS = (inv.payments || []).reduce((s, p) => s + Number(p.tdsAdjusted ?? p.tdsAmount ?? 0), 0);
      const invoiceTDS = Number(inv.tdsAmount || inv.totalTDSAmount || 0);
      return sum + paymentTDS + invoiceTDS;
    }, 0);

    return {
      totalAmount,
      totalPendingAmount,
      totalReceivedAmount,
      pendingInvoices,
      overdueInvoices,
      totalInvoices: filteredInvoices.length,
      totalTDS,
    };
  };

  const summary = getInvoiceSummary();

  const handleRecordPayment = (invoice, e) => {
    e.stopPropagation();

    // Check if sales journal is posted first
    if (!invoice.salesJournalId) {
      toast.error(
        "Please post the sales journal first before recording payments",
      );
      return;
    }

    // Check if already fully paid
    const paymentInfo = calculatePaymentInfo(invoice);
    if (paymentInfo.pendingAmount <= 0) {
      toast.info("This invoice is already fully paid");
      return;
    }

    setPaymentModal({
      open: true,
      invoiceData: invoice,
    });
  };

  const handleRefreshAndClear = async () => {
    try {
      // Clear all filters
      // setSearchTerm("");
      setAdvancedFilters({});
      setAppliedFilters({});
      // Reset to first page
      setPagination((prev) => ({ ...prev, page: 1 }));

      setFilteredAllInvoices([]);
      // await fetchInvoices();

      toast.success("Refreshed and cleared filters");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to refresh");
    }
  };

  const handlePaymentRecorded = (paymentData) => {
    toast.success(
      `Payment of ${paymentData.payment?.amountPaid ?? paymentData.receivedAmount ?? 0} recorded successfully!`,
    );
    fetchInvoices();

    setPaymentModal({
      open: false,
      invoiceData: null,
    });
  };

  // Format amount with Indian currency style
  const formatAmount = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Check if sales journal is posted
  const isJournalPosted = (invoice) => {
    return !!invoice.salesJournalId;
  };

  const handleBulkUploadSuccess = () => {
    fetchInvoices();
    toast.success("Bulk upload completed!");
  };

  // : Handle template download
  const handleDownloadTemplate = () => {
    try {
      // Create workbook with just one clean template sheet
      const wb = XLSX.utils.book_new();

      // Clean template with ONLY headers and NO example data
      const templateData = [
        {
          "Invoice Group ID*": "",
          "PO Reference": "",
          "Invoice Date*": "",
          Currency: "",
          "Payment Mode": "",
          "Client Code": "",
          "Client Name*": "",
          "Item Description*": "",
          "Item HSN/SAC*": "",
          "Item Quantity": "",
          "Item Rate*": "",
          "Manual TDS Amount": "",
          "Digital Signature": "",
        },
      ];

      const wsTemplate = XLSX.utils.json_to_sheet(templateData);

      // Set column widths
      wsTemplate["!cols"] = [
        { wch: 18 }, // Invoice Group ID*
        { wch: 15 }, // PO Reference
        { wch: 15 }, // Invoice Date*
        { wch: 10 }, // Currency
        { wch: 15 }, // Payment Mode
        { wch: 12 }, // Client Code
        { wch: 25 }, // Client Name*
        { wch: 30 }, // Item Description*
        { wch: 15 }, // Item HSN/SAC*
        { wch: 10 }, // Item Quantity
        { wch: 15 }, // Item Rate*
        { wch: 12 }, // Manual TDS Amount
        { wch: 20 }, // Digital Signature
      ];

      // Add a second empty row for users to start entering data
      XLSX.utils.sheet_add_aoa(
        wsTemplate,
        [["", "", "", "", "", "", "", "", "", "", "", "", ""]],
        { origin: -1 },
      );

      XLSX.utils.book_append_sheet(wb, wsTemplate, "Invoice Template");
      XLSX.writeFile(wb, "Bulk_Invoice_Template.xlsx");
      toast.success("✅ Template downloaded successfully!");
    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Failed to download template. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Title + action row */}
          <div className="flex items-center justify-between py-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="p-2 rounded-xl shadow-md shrink-0"
                style={{
                  background: "linear-gradient(135deg,#1e3a8a,#2563eb)",
                }}
              >
                <Receipt size={17} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Invoice Management
                </h1>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5 hidden sm:block">
                  Monitor and manage your company's billing lifecycle
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* <div className="flex items-center space-x-2"> */}
              {canViewInvoice && (
                <button
                  onClick={() => setUserPendingModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <CircleCheckBig size={13} className="text-emerald-500" />{" "}
                  Pending Invoices
                </button>
              )}
              {isAdminOrSuperAdmin && canEditInvoice && (
                  <button
                    onClick={() => {
                      setApprovalModalOpen(true);
                      syncPendingApprovals();
                    }}
                    className="relative flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <CircleCheckBig size={13} className="text-emerald-500" />{" "}
                    Approvals
                    {pendingApprovalsCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white shadow-sm ring-2 ring-white">
                        {pendingApprovalsCount > 9 ? "9+" : pendingApprovalsCount}
                      </span>
                    )}
                  </button>
                )}
              <button
                onClick={() => navigate("/invoice-data/viewall-invoices")}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
              >
                <FileText size={13} className="text-blue-500" /> View All
              </button>
              {canCreateInvoice && (
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <Download size={13} className="text-indigo-500" /> Template
                </button>
              )}
              {canCreateInvoice && (
                <button
                  onClick={() => navigate("/invoice-data/bulk-upload")}
                  className="flex items-center gap-1.5 px-3 py-2 text-white text-xs font-bold rounded-xl transition-all hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg,#064e3b,#059669)",
                    boxShadow: "0 4px 12px rgba(5,150,105,0.25)",
                  }}
                >
                  <Upload size={13} /> Bulk Upload
                </button>
              )}
              {canCreateInvoice && (
                <Link
                  to="/master-data/manual-invoice"
                  className="flex items-center gap-1.5 px-4 py-2 text-white text-xs font-bold rounded-xl transition-all hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg,#1e3a8a,#2563eb)",
                    boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                  }}
                >
                  <Plus size={13} /> New Invoice
                </Link>
              )}
            </div>
          </div>

          {/* Filter + audit row */}
          <div className="pb-3 flex flex-col sm:flex-row items-center gap-2">
            <button
              onClick={() => setShowAdvancedSearch(true)}
              className="flex-1 w-full flex items-center gap-2.5 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-200/60 transition-all"
            >
              <Filter size={13} className="text-blue-500 shrink-0" />
              Advanced Filtering &amp; Search…
              {Object.keys(appliedFilters).filter((k) => appliedFilters[k])
                .length > 0 && (
                  <span
                    className="ml-auto px-2 py-0.5 text-white text-[9px] font-black rounded-full"
                    style={{
                      background: "linear-gradient(135deg,#1e3a8a,#2563eb)",
                    }}
                  >
                    {
                      Object.keys(appliedFilters).filter((k) => appliedFilters[k])
                        .length
                    }{" "}
                    active
                  </span>
                )}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setOpenLogs(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
              >
                <History size={13} /> Audit
              </button>
              <button
                onClick={handleRefreshAndClear}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw
                  size={13}
                  className={loading ? "animate-spin" : ""}
                />{" "}
                Refresh
              </button>
            </div>
          </div>

          {/* Active filter pills */}
          {Object.keys(appliedFilters).filter((k) => appliedFilters[k]).length >
            0 && (
              <div className="pb-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Active:
                </span>
                {Object.entries(appliedFilters).map(([key, value]) => {
                  if (!value) return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100"
                    >
                      <span className="opacity-60">{key}:</span>
                      {key === "createdBy"
                        ? createdByUsers.find((u) => u._id === value)?.name ||
                        value
                        : String(value)}
                    </span>
                  );
                })}
                <button
                  onClick={handleRefreshAndClear}
                  className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-0.5 ml-1"
                >
                  Clear all
                </button>
              </div>
            )}
        </div>

        {/* ── STAT CARDS inside header ── */}
        {isAdminOrSuperAdmin && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-5">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                {
                  label: "Total Invoices",
                  value: String(summary.totalInvoices || 0),
                  g: "linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)",
                  blob: "#93c5fd",
                  icon: FileText,
                },
                {
                  label: "Total Received",
                  value: `₹${formatAmount(summary.totalReceivedAmount)}`,
                  g: "linear-gradient(135deg,#064e3b 0%,#059669 55%,#34d399 100%)",
                  blob: "#6ee7b7",
                  icon: CheckCircle2,
                },
                {
                  label: "Pending Payment",
                  value: `₹${formatAmount(summary.totalPendingAmount)}`,
                  g: "linear-gradient(135deg,#92400e 0%,#d97706 55%,#fbbf24 100%)",
                  blob: "#fde68a",
                  icon: Clock,
                },
                {
                  label: "Total Revenue",
                  value: `₹${formatAmount(summary.totalAmount)}`,
                  g: "linear-gradient(135deg,#312e81 0%,#7c3aed 55%,#a78bfa 100%)",
                  blob: "#c4b5fd",
                  icon: TrendingUp,
                },
                {
                  label: "Total TDS",
                  value: `₹${formatAmount(summary.totalTDS)}`,
                  g: "linear-gradient(135deg,#7f1d1d 0%,#dc2626 55%,#fca5a5 100%)",
                  blob: "#fca5a5",
                  icon: Percent,
                },
              ].map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`relative overflow-hidden rounded-2xl p-4 shadow-lg group ${s.label === "Total TDS" ? "cursor-pointer" : "cursor-default"}`}
                  style={{ background: s.g }}
                  onClick={
                    s.label === "Total TDS"
                      ? () => setTdsDetailsModalOpen(true)
                      : undefined
                  }
                >
                  <div
                    className="absolute -top-6 -right-6 w-20 h-16 rounded-full opacity-25 blur-2xl group-hover:scale-125 transition-transform duration-700"
                    style={{
                      background: `radial-gradient(ellipse,${s.blob},transparent)`,
                    }}
                  />
                  <div
                    className="absolute -bottom-4 -left-4 w-14 h-10 rounded-full opacity-15 blur-xl"
                    style={{
                      background: `radial-gradient(ellipse,${s.blob},transparent)`,
                    }}
                  />
                  <div className="absolute top-0 right-10 w-px h-full bg-white/15 rotate-12 scale-y-150" />
                  <div className="relative z-10 flex items-start justify-between">
                    <div>
                      <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1">
                        {s.label}
                      </p>
                      <p className="text-sm font-black text-white leading-tight">
                        {s.value}
                      </p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-xl border border-white/20 backdrop-blur-sm group-hover:scale-110 transition-transform">
                      <s.icon size={14} className="text-white" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ───────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400 font-medium">
              Loading invoices…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
            <button
              onClick={fetchInvoices}
              className="px-4 py-2 text-xs font-bold text-red-700 bg-red-100 rounded-xl hover:bg-red-200 transition-all"
            >
              Try Again
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="p-5 bg-slate-100 rounded-2xl">
              <FileText size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-500">
              No approved invoices found
            </p>
            <p className="text-xs text-slate-400">
              Try adjusting your filters or create a new invoice
            </p>
          </div>
        ) : (
          <>
            {/* list count */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-600">
                Invoices
                <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full text-[10px] font-black">
                  {pagination.total || invoices.length}
                </span>
              </p>
            </div>

            <div className="space-y-3">
              {invoices.map((invoice, idx) => {
                const paymentInfo = calculatePaymentInfo(invoice);
                const paymentBadge = getPaymentStatusBadge(
                  paymentInfo.paymentStatus,
                  paymentInfo.pendingAmount,
                );
                const PaymentIcon = paymentBadge.icon;
                const journalPosted = isJournalPosted(invoice);
                const isExpanded = !!expandedRows[invoice._id];
                const lifecycleBadge = getInvoiceLifecycleBadge(invoice);

                const accentColor =
                  invoice.status === "RECONCILED"
                    ? "linear-gradient(180deg,#059669,#34d399)"
                    : invoice.status === "PAID"
                      ? "linear-gradient(180deg,#2563eb,#60a5fa)"
                      : invoice.status === "PARTIALLY_PAID"
                        ? "linear-gradient(180deg,#d97706,#fbbf24)"
                        : "linear-gradient(180deg,#dc2626,#f87171)";

                return (
                  <motion.div
                    key={invoice._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative"
                  >
                    {/* left accent stripe */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                      style={{ background: accentColor }}
                    />

                    {/* ── Collapsed row ── */}
                    <div
                      className="flex flex-col lg:flex-row lg:items-center gap-4 pl-5 pr-4 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                      onClick={() => handleRowClick(invoice)}
                    >
                      {/* Left: icon + info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border border-blue-100"
                          style={{
                            background:
                              "linear-gradient(135deg,#eff6ff,#dbeafe)",
                          }}
                        >
                          <Receipt size={17} className="text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-sm font-black text-slate-900 tracking-tight">
                              {invoice.invoiceNo || "N/A"}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-black rounded-full border flex items-center gap-1 uppercase tracking-wider ${paymentBadge.color}`}
                            >
                              <PaymentIcon
                                size={9}
                                className={paymentBadge.iconColor}
                              />
                              {paymentBadge.text}
                            </span>
                            {invoice.approvalStatus === "Approved" && !invoice.salesJournalId && (
                              <span
                                className={`px-2 py-0.5 text-[10px] font-black rounded-full border uppercase tracking-wider ${lifecycleBadge.color}`}
                              >
                                {lifecycleBadge.text}
                              </span>
                            )}
                            {invoice.approvalStatus === "Rejected" && (
                              <span className="px-2 py-0.5 text-[10px] font-black rounded-full border border-red-300 text-red-700 bg-red-100 uppercase tracking-wider flex items-center gap-1">
                                <AlertTriangle size={9} className="text-red-600" />
                                Rejected
                              </span>
                            )}
                            {journalPosted && (
                              <span className="px-2 py-0.5 text-[10px] font-black rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 uppercase tracking-wider">
                                ✓ Journal
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewDetails(invoice, e);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 transition-all"
                              title="View Details"
                            >
                              <FileText size={9} /> View Details
                            </button>

                            {invoice.tdsAmount > 0 && (
                              <span className="px-2 py-0.5 text-[10px] font-black rounded-full border border-violet-200 text-violet-700 bg-violet-50 uppercase tracking-wider">
                                TDS
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {formatDate(invoice.invoiceDate)}
                            </span>
                            <span className="flex items-center gap-1 font-bold text-slate-700">
                              <User size={11} />
                              {invoice.billTo?.name || "No client"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package size={11} />
                              {getItemSummary(invoice.items)}
                            </span>
                            {invoice.createdBy?.name && (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <User size={11} />
                                {invoice.createdBy.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: amount + progress + buttons */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5 mb-1">
                            <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${Math.min(paymentInfo.completionPercentage, 100)}%`,
                                }}
                                className={`h-full rounded-full ${paymentInfo.completionPercentage === 100 ? "bg-emerald-500" : paymentInfo.completionPercentage > 0 ? "bg-blue-500" : "bg-slate-200"}`}
                              />
                            </div>
                            <span className="text-[10px] font-black text-slate-400">
                              {paymentInfo.completionPercentage.toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Amount Due
                          </p>
                          <p className="text-base font-black text-slate-900 tabular-nums">
                            {invoice.currency || ""}{" "}
                            {formatAmount(invoice.amountDue || 0)}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 tabular-nums">
                            Paid {formatAmount(paymentInfo.totalReceived)} ·
                            Remaining {formatAmount(paymentInfo.pendingAmount)}
                          </p>
                          {paymentInfo.pendingAmount > 0 && (
                            <p className="text-[10px] font-bold text-red-500 tabular-nums">
                              {formatAmount(paymentInfo.pendingAmount)} pending
                            </p>
                          )}
                          <p
                            className={`text-[10px] font-bold tabular-nums ${paymentInfo.pendingAmount <= 0 ? "text-emerald-700" : "text-blue-700"}`}
                          >
                            {paymentInfo.pendingAmount <= 0
                              ? "Fully Settled"
                              : "Pending Settlement"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpand(invoice._id, e);
                            }}
                            className="p-2 rounded-xl transition-all"
                            style={
                              isExpanded
                                ? {
                                  background:
                                    "linear-gradient(135deg,#1e3a8a,#2563eb)",
                                }
                                : { background: "#f1f5f9", color: "#475569" }
                            }
                          >
                            <ChevronDown
                              size={14}
                              className={`transition-transform duration-300 text-${isExpanded ? "white" : "slate-600"} ${isExpanded ? "rotate-180" : ""}`}
                              style={{
                                color: isExpanded ? "white" : undefined,
                              }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── Expanded section ── */}
                    {isExpanded && (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-slate-100 bg-slate-50/40 px-5 py-5 space-y-4"
                        >
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
                              {canEditInvoice && (
                                <Link
                                  to={`/master-data/manual-invoice?edit=${invoice._id}`}
                                  onClick={(e) => handleEditClick(invoice._id, e)}
                                  className="px-3.5 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1.5 shadow-sm shrink-0"
                                >
                                  <Edit size={12} /> Edit &amp; Resubmit
                                </Link>
                              )}
                            </div>
                          )}

                          {/* Row 1: Invoice details + Amount summary */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Invoice Details */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div
                                className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100"
                                style={{
                                  background:
                                    "linear-gradient(90deg,#f8fafc,#eff6ff)",
                                }}
                              >
                                <div
                                  className="w-1 h-5 rounded-full shrink-0"
                                  style={{
                                    background:
                                      "linear-gradient(180deg,#1e3a8a,#60a5fa)",
                                  }}
                                />
                                <Receipt size={12} className="text-slate-400" />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                  Invoice Details
                                </p>
                              </div>
                              <div className="p-4 grid grid-cols-2 gap-3">
                                {[
                                  {
                                    l: "Invoice No",
                                    v: invoice.invoiceNo,
                                    mono: true,
                                  },
                                  {
                                    l: "Invoice Date",
                                    v: formatDate(invoice.invoiceDate),
                                  },
                                  {
                                    l: "Due Date",
                                    v: formatDate(invoice.dueDate),
                                  },
                                  {
                                    l: "Payment Terms",
                                    v: invoice.paymentTerms || "Net 30 Days",
                                  },
                                  {
                                    l: "Currency",
                                    v: invoice.currency || "INR",
                                  },
                                ].map((f) => (
                                  <div key={f.l}>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                                      {f.l}
                                    </p>
                                    <p
                                      className={`text-xs font-semibold text-slate-800 ${f.mono ? "font-mono" : ""}`}
                                    >
                                      {f.v || "—"}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Amount Summary */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div
                                className="flex items-center justify-between px-4 py-3 border-b border-slate-100"
                                style={{
                                  background:
                                    "linear-gradient(90deg,#f8fafc,#fefce8)",
                                }}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className="w-1 h-5 rounded-full shrink-0"
                                    style={{
                                      background:
                                        "linear-gradient(180deg,#d97706,#fbbf24)",
                                    }}
                                  />
                                  <Banknote
                                    size={12}
                                    className="text-slate-400"
                                  />
                                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                    Amount Summary
                                  </p>
                                </div>
                                {auditLogCounts[invoice._id] > 0 && (
                                  <button
                                    onClick={(e) =>
                                      handleViewAuditLog(invoice, e)
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all"
                                  >
                                    <History size={10} /> Audit (
                                    {auditLogCounts[invoice._id]})
                                  </button>
                                )}
                              </div>
                              <div className="p-4 space-y-2">
                                {[
                                  {
                                    l: "Taxable Value",
                                    v: formatAmount(
                                      invoice.totalTaxableValue ||
                                      invoice.amountDue ||
                                      0,
                                    ),
                                    cls: "text-slate-700",
                                  },
                                  invoice.totalIGSTAmount > 0 && {
                                    l: "IGST",
                                    v: formatAmount(invoice.totalIGSTAmount),
                                    cls: "text-slate-600",
                                  },
                                  invoice.totalSGSTAmount > 0 && {
                                    l: "SGST",
                                    v: formatAmount(invoice.totalSGSTAmount),
                                    cls: "text-slate-600",
                                  },
                                  invoice.totalCGSTAmount > 0 && {
                                    l: "CGST",
                                    v: formatAmount(invoice.totalCGSTAmount),
                                    cls: "text-slate-600",
                                  },
                                ]
                                  .filter(Boolean)
                                  .map((r) => (
                                    <div
                                      key={r.l}
                                      className="flex justify-between items-center border-b border-slate-100 pb-1.5 last:border-0"
                                    >
                                      <span className="text-[10px] text-slate-500">
                                        {r.l}
                                      </span>
                                      <span
                                        className={`text-xs font-semibold tabular-nums ${r.cls}`}
                                      >
                                        {r.v}
                                      </span>
                                    </div>
                                  ))}
                                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    Total Invoice Amount
                                  </span>
                                  <span className="text-sm font-black text-blue-700 tabular-nums">
                                    {formatAmount(invoice.amountDue || 0)}
                                  </span>
                                </div>
                                {Number(invoice.tdsAmount || 0) > 0 && (
                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <span className="text-[10px] text-violet-600 font-medium">
                                      TDS Amount
                                    </span>
                                    <span className="text-xs font-semibold text-violet-600 tabular-nums">
                                      – {formatAmount(invoice.tdsAmount)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center pt-1 border-t border-emerald-200">
                                  <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                                    Net Payable Amount
                                  </span>
                                  <span className="text-sm font-black text-emerald-700 tabular-nums">
                                    {formatAmount((invoice.amountDue || 0) - Number(invoice.tdsAmount || 0))}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Row 2: Client info + Payment summary */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Client */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div
                                className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100"
                                style={{
                                  background:
                                    "linear-gradient(90deg,#f8fafc,#f5f3ff)",
                                }}
                              >
                                <div
                                  className="w-1 h-5 rounded-full shrink-0"
                                  style={{
                                    background:
                                      "linear-gradient(180deg,#7c3aed,#a78bfa)",
                                  }}
                                />
                                <User size={12} className="text-slate-400" />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                  Client Information
                                </p>
                              </div>
                              <div className="p-4 space-y-3">
                                {[
                                  { l: "Client Name", v: invoice.billTo?.name },
                                  { l: "Address", v: invoice.billTo?.address },
                                  {
                                    l: "GSTIN",
                                    v: invoice.billTo?.GSTIN,
                                    mono: true,
                                  },
                                  { l: "Ship To", v: invoice.shipTo?.name },
                                ].map((f) => (
                                  <div key={f.l}>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                                      {f.l}
                                    </p>
                                    <p
                                      className={`text-xs font-semibold text-slate-800 ${f.mono ? "font-mono" : ""}`}
                                    >
                                      {f.v || "—"}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Payment Summary */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div
                                className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100"
                                style={{
                                  background:
                                    "linear-gradient(90deg,#f8fafc,#f0fdf4)",
                                }}
                              >
                                <div
                                  className="w-1 h-5 rounded-full shrink-0"
                                  style={{
                                    background:
                                      "linear-gradient(180deg,#059669,#34d399)",
                                  }}
                                />
                                <CreditCard
                                  size={12}
                                  className="text-slate-400"
                                />
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                  Payment Summary
                                </p>
                              </div>
                              <div className="p-4 space-y-2.5">
                                {[
                                  {
                                    l: "Net Payable Amount",
                                    v: formatAmount(paymentInfo.netPayable),
                                    cls: "text-emerald-700",
                                  },
                                  paymentInfo.tdsAmount > 0 && {
                                    l: "TDS Amount",
                                    v: formatAmount(paymentInfo.tdsAmount),
                                    cls: "text-violet-700",
                                  },
                                  {
                                    l: "Total Received",
                                    v: formatAmount(paymentInfo.totalReceived),
                                    cls: "text-blue-700",
                                  },
                                  {
                                    l: "Pending Amount",
                                    v: formatAmount(paymentInfo.pendingAmount),
                                    cls: "text-amber-700",
                                  },
                                ].filter(Boolean).map((f) => (
                                  <div
                                    key={f.l}
                                    className="flex justify-between items-center border-b border-slate-100 pb-2 last:border-0"
                                  >
                                    <span className="text-[10px] text-slate-500">
                                      {f.l}
                                    </span>
                                    <span
                                      className={`text-xs font-black tabular-nums ${f.cls}`}
                                    >
                                      {f.v}
                                    </span>
                                  </div>
                                ))}
                                <div className="flex items-center gap-2 pt-1">
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    Completion
                                  </span>
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${paymentInfo.completionPercentage >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                                      style={{
                                        width: `${Math.min(paymentInfo.completionPercentage, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-black text-slate-700 shrink-0 tabular-nums">
                                    {Math.min(paymentInfo.completionPercentage, 100).toFixed(
                                      1,
                                    )}
                                    %
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Row 3: Payment history table */}
                          {invoice.payments && invoice.payments.length > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div
                                className="flex items-center justify-between px-4 py-3 border-b border-slate-100"
                                style={{
                                  background:
                                    "linear-gradient(90deg,#f8fafc,#fffbeb)",
                                }}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className="w-1 h-5 rounded-full shrink-0"
                                    style={{
                                      background:
                                        "linear-gradient(180deg,#d97706,#fbbf24)",
                                    }}
                                  />
                                  <History
                                    size={12}
                                    className="text-slate-400"
                                  />
                                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                    Recent Payments
                                  </p>
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                                    style={{
                                      background:
                                        "linear-gradient(135deg,#d97706,#fbbf24)",
                                    }}
                                  >
                                    {invoice.payments.length}
                                  </span>
                                </div>
                                {invoice.payments.length > 3 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInvoice(invoice);
                                      setPaymentHistoryModal(true);
                                    }}
                                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                                  >
                                    View all {invoice.payments.length} →
                                  </button>
                                )}
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr
                                      style={{
                                        background:
                                          "linear-gradient(90deg,#f1f5f9,#fef3c7)",
                                      }}
                                    >
                                      {[
                                        "Date",
                                        "Reference",
                                        "Amount",
                                        "TDS",
                                        "Status",
                                      ].map((h) => (
                                        <th
                                          key={h}
                                          className="px-4 py-2.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap"
                                        >
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {[...invoice.payments]
                                      .sort(
                                        (a, b) =>
                                          new Date(b.paymentDate) -
                                          new Date(a.paymentDate),
                                      )
                                      .slice(0, 3)
                                      .map((payment, i) => (
                                        <tr
                                          key={payment._id || i}
                                          className="hover:bg-amber-50/30 transition-colors"
                                        >
                                          <td className="px-4 py-2.5 text-slate-600">
                                            {formatDate(payment.paymentDate)}
                                          </td>
                                          <td className="px-4 py-2.5 font-mono text-slate-400 text-[10px]">
                                            {payment.referenceNumber || "—"}
                                          </td>
                                          <td className="px-4 py-2.5 font-black text-emerald-700 tabular-nums">
                                            {formatAmount(
                                              payment.receivedAmount,
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5 text-violet-600 tabular-nums">
                                            {Number(
                                              payment.tdsAdjusted ??
                                              payment.tdsAmount ??
                                              0,
                                            ) > 0
                                              ? formatAmount(
                                                Number(
                                                  payment.tdsAdjusted ??
                                                  payment.tdsAmount ??
                                                  0,
                                                ),
                                              )
                                              : "—"}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${payment.status === "posted" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
                                            >
                                              {payment.status || "recorded"}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Row 4: Action buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                            {checkAuthorization(user, "INVOICE", "EDIT") &&
                              !invoice.salesJournalId && (
                                <Link
                                  to={`/master-data/manual-invoice?edit=${invoice._id}`}
                                  onClick={(e) =>
                                    handleEditClick(invoice._id, e)
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100 transition-all"
                                >
                                  <Edit size={12} /> Edit Invoice
                                </Link>
                              )}

                            <button
                              onClick={(e) =>
                                handleDownloadPdf(
                                  invoice._id,
                                  invoice.invoiceNo,
                                  e,
                                )
                              }
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-all"
                            >
                              <Download size={12} /> Download PDF
                            </button>

                            <button
                              onClick={(e) =>
                                handleDownloadWord(
                                  invoice._id,
                                  invoice.invoiceNo,
                                  e,
                                )
                              }
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-all"
                            >
                              <Download size={12} /> Download Word
                            </button>

                            {canEditInvoice && !invoice.salesJournalId ? (
                              <button
                                onClick={(e) =>
                                  handleCreateLedgerClick(invoice, e)
                                }
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-full hover:bg-violet-100 transition-all"
                              >
                                <BookOpen size={12} /> Post Sales Journal
                              </button>
                            ) : (
                              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full cursor-default">
                                <CheckCircle size={12} /> Sales Journal Posted
                              </span>
                            )}

                       

                            {canEditInvoice &&
                              invoice.salesJournalId &&
                              paymentInfo.pendingAmount > 0.01 && (
                                <button
                                  onClick={(e) =>
                                    handleRecordPayment(invoice, e)
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-all"
                                >
                                  <Banknote size={12} /> Receive Payment
                                </button>
                              )}

                            {paymentInfo.pendingAmount <= 0.01 &&
                              paymentInfo.totalReceived > 0 && (
                                <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full cursor-default">
                                  <CheckCircle size={12} /> Fully Paid
                                </span>
                              )}

                            {invoice.payments &&
                              invoice.payments.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedInvoice(invoice);
                                    setPaymentHistoryModal(true);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full hover:bg-amber-100 transition-all"
                                >
                                  <History size={12} /> Payment History (
                                  {invoice.payments.length})
                                </button>
                              )}

                            <button
                              onClick={(e) =>
                                handleEmailInvoice(invoice._id, e)
                              }
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full hover:bg-indigo-100 transition-all ml-auto"
                            >
                              <Mail size={12} /> Email Invoice
                            </button>
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <Outlet />
          </>
        )}
      </div>
      {/* Modals */}
      <AdvancedInvoiceSearch
        isOpen={showAdvancedSearch}
        onClose={() => setShowAdvancedSearch(false)}
        onSearch={handleAdvancedSearch}
        invoiceNumbers={invoiceOptions}
        clientNames={clientOptions}
        createdByUsers={createdByUsers}
      />
      <InvoiceApproval
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        refreshInvoices={fetchInvoices}
        user={user}
      />
      {/* <PreviousInvoicesComponent
        open={showPreviousInvoices}
        onClose={() => setShowPreviousInvoices(false)}
      /> */}
      {createLedgerModal.open && (
        <CreateLedgerFromInvoiceModal
          open={createLedgerModal.open}
          onClose={() =>
            setCreateLedgerModal({
              open: false,
              invoiceNo: null,
              invoiceData: null,
            })
          }
          onSuccess={handleLedgerCreated}
          initialInvoiceNo={createLedgerModal.invoiceNo}
          invoiceData={createLedgerModal.invoiceData}
        />
      )}
      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        invoiceId={selectedInvoiceForDetail?._id}
      />
      {paymentModal.open && (
        <PaymentReceiptModal
          open={paymentModal.open}
          onClose={() => setPaymentModal({ open: false, invoiceData: null })}
          onSuccess={handlePaymentRecorded}
          invoiceData={paymentModal.invoiceData}
        />
      )}
      {paymentHistoryModal && selectedInvoice && (
        <PaymentHistoryModal
          open={paymentHistoryModal}
          onClose={() => {
            setPaymentHistoryModal(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice}
          paymentHistory={selectedInvoice.payments || []}
        />
      )}
      {tdsDetailsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Total TDS Details
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Complete list of TDS-adjusted payments
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateTdsReport}
                  className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  Generate Report
                </button>
                <button
                  onClick={() => setTdsDetailsModalOpen(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {[
                      "Invoice",
                      "Client",
                      "Payment Date",
                      // "Reference",
                      // "Received",
                      "TDS",
                      // "Settlement",
                      "Type",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tdsDetailsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        Loading TDS details...
                      </td>
                    </tr>
                  ) : getTdsDetailRows().length > 0 ? (
                    getTdsDetailRows().map((row, index) => (
                      <tr
                        key={`${row.invoiceNo}-${row.reference}-${index}`}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {row.invoiceNo}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {row.clientName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(row.paymentDate)}
                        </td>
                        {/* <td className="px-4 py-3 font-mono text-slate-500">
                          {row.reference}
                        </td> */}
                        {/* <td className="px-4 py-3 text-emerald-700 font-bold tabular-nums">
                          {formatAmount(row.receivedAmount)}
                        </td> */}
                        <td className="px-4 py-3 text-violet-700 font-bold tabular-nums">
                          {formatAmount(row.tdsAmount)}
                        </td>
                        {/* <td className="px-4 py-3 text-slate-900 font-bold tabular-nums">
                          {formatAmount(row.settledAmount)}
                        </td> */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.type === 'INVOICE_PROVISION' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {row.type === 'INVOICE_PROVISION' ? 'Provision' : 'Payment'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        No TDS-adjusted payments found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Add this with other modals at the bottom */}
      <InvoiceAuditLogModal
        open={auditModal.open}
        onClose={() =>
          setAuditModal({ open: false, invoiceId: null, invoiceNo: null })
        }
        invoiceId={auditModal.invoiceId}
        invoiceNo={auditModal.invoiceNo}
        companyId={user?.company?._id}
      />

      <AuditLogSidebar
        isOpen={openLogs}
        onClose={() => setOpenLogs(false)}
        companyId={user?.company?._id}
        modules={["INVOICE", "INVOICE_ACCOUNTING", "PAYMENT"]}
        title="Invoice Audit Trail"
        subtitle="Tracking invoice, accounting, and payment activities"
      />

      <UserPendingInvoices
        open={userPendingModalOpen}
        onClose={() => setUserPendingModalOpen(false)}
        user={user}
      />
    </div>
  );
};

export default InvoiceData;
