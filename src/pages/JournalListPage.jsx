import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import LoadingComponent from "../components/LoadingComponent";
import { allJournalApi, deleteJournalApi, getJournalStatsApi, reverseJournalApi, getJournalByIdApi } from "../apis/journalApi";
import { ApprovalManager } from "../utils/approvalManager";
import axios from "axios";
import { format } from "date-fns";
import {
  FiEdit,
  FiTrash2,
  FiEye,
  FiFileText,
  FiClock,
  FiUser,
  FiSearch,
  FiFilter,
  FiChevronRight,
  FiArrowLeft,
  FiPlus,
  FiX,
  FiChevronDown,
  FiCalendar,
  FiTag,
  FiDollarSign,
  FiInfo,
  FiTrendingUp,
  FiTrendingDown,
  FiPlusCircle,
  FiMinusCircle,
  FiRefreshCw,
  FiUploadCloud,
} from "react-icons/fi";
import { TbFileInvoice } from "react-icons/tb";
import { getJournalAuditLogsApi } from "../apis/auditLog.api";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "../modules/notification/notification.slice.jsx";
import { checkAuthorization } from "../utils/checkAuthorization";

const SYSTEM_JOURNAL_MESSAGE =
  "This journal is system-generated. Please edit the source document.";

export default function JournalListPage() {
  const navigate = useNavigate();
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [journalToReverse, setJournalToReverse] = useState(null);
  const [reversing, setReversing] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    sourceType: "",
    voucherType: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 0,
    total: 0,
  });
  const [showFilters, setShowFilters] = useState(false);

const [stats, setStats] = useState({
  totalAmount: 0,
  journalCount: 0,
});
const [loadingStats, setLoadingStats] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [, setApprovalRefreshTick] = useState(0);
  const { refreshNotifications } = useNotifications();

  const { user } = useAuth();
  const isAdmin = user?.role === "admin"  || user?.role === "superAdmin" || user?.privilege?.masterUpdate === true;
  const isAdminOrSuperAdmin = user?.role === "admin" || user?.role === "superAdmin";
  const canCreateJournal = checkAuthorization(user, "JOURNAL", "CREATE");
  const canEditJournal = checkAuthorization(user, "JOURNAL", "EDIT");
  const canDeleteJournal = checkAuthorization(user, "JOURNAL", "DELETE");
  const refreshApprovals = useCallback(async () => {
    if (!user?.company?._id) return;
    const requests = await ApprovalManager.syncRequests(user.company._id);
    const pendingCount = (requests || []).filter((r) => r.status === "pending").length;
    setPendingApprovalsCount(pendingCount);
    setApprovalRefreshTick((prev) => prev + 1);
  }, [user?.company?._id]);

  // Fetch journals with pagination
  const fetchJournals = useCallback(
    async (signal) => {
      try {
        setLoading(true);
        
        // Prepare params for the API call
        const params = {
          page: pagination.page,
          limit: pagination.limit,
          ...(search && { search }),
          ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
          ...(filters.dateTo && { dateTo: filters.dateTo }),
          ...(filters.voucherType && { voucherType: filters.voucherType }),
          ...(filters.sourceType && { sourceType: filters.sourceType }),
        };
        
        const res = await allJournalApi(user?.company?._id, params, signal);
        
        const sortedJournals = [...(res.data || [])].sort((left, right) => {
          const leftTime = new Date(left.createdAt || 0).getTime();
          const rightTime = new Date(right.createdAt || 0).getTime();
          return rightTime - leftTime;
        });

        setJournals(sortedJournals);
        
        // Update pagination from response
        if (res.pagination) {
          setPagination((prev) => ({
            ...prev,
            total: res.pagination.total,
            totalPages: res.pagination.totalPages,
            currentPage: res.pagination.currentPage || prev.page,
          }));
        } else if (res.data && res.data.length > 0) {
          // If no pagination data but we have data, estimate
          setPagination((prev) => ({
            ...prev,
            total: prev.total || (prev.page * prev.limit) + 1, // Estimate
            totalPages: Math.max(prev.totalPages, prev.page + 1),
          }));
        }
      } catch (err) {
        if (!axios.isCancel(err)) {
          console.error("Error fetching journals:", err);
          toast.error("Error fetching journals");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [user?.company?._id, pagination.page, pagination.limit, search, filters],
  );

  const fetchStats = useCallback(
  async (signal) => {
    try {
      setLoadingStats(true);
      
      // Same filters as main list, but NO pagination
      const params = {
        ...(search && { search }),
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo && { dateTo: filters.dateTo }),
        ...(filters.voucherType && { voucherType: filters.voucherType }),
        ...(filters.sourceType && { sourceType: filters.sourceType }),
      };
      
      const res = await getJournalStatsApi(user?.company?._id, params, signal);
      setStats(res.data || { totalAmount: 0, journalCount: 0 });
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error("Error fetching stats:", err);
        // Silent fail for stats
      }
    } finally {
      if (!signal?.aborted) setLoadingStats(false);
    }
  },
  [user?.company?._id, search, filters], // Note: NO pagination deps
);

  const handlePageChange = (page) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  // Fetch audit logs for selected journal
  const fetchAuditLogs = useCallback(
    async (journalId) => {
      if (!journalId) return;

      try {
        setLoadingAuditLogs(true);
        const res = await getJournalAuditLogsApi(user?.company?._id, journalId);
        setAuditLogs(res.data?.data || []);
      } catch (error) {
        console.error("Error fetching journal audit logs:", error);
        toast.error("Failed to load audit history for this journal");
      } finally {
        setLoadingAuditLogs(false);
      }
    },
    [user?.company?._id],
  );

  // Load data on mount and when dependencies change
  useEffect(() => {
    const controller = new AbortController();
    fetchJournals(controller.signal);
    fetchStats(controller.signal);
    refreshApprovals();
    return () => controller.abort();
  }, [fetchJournals, fetchStats, refreshApprovals]);

  useEffect(() => {
    if (!user?.company?._id) return undefined;

    const intervalId = window.setInterval(() => {
      refreshApprovals();
    }, 15000);

    const handleFocus = () => {
      refreshApprovals();
      refreshNotifications({ silent: true });
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [user?.company?._id, refreshApprovals, refreshNotifications]);

  // Handle journal selection
  const handleJournalSelect = useCallback(
    async (journal) => {
      setSelectedJournal(journal);
      setShowDetailsModal(true);
      await fetchAuditLogs(journal._id);
    },
    [fetchAuditLogs],
  );

  // Handle delete click
  const handleDeleteClick = async (journal, e) => {
    e.stopPropagation();
    if (isAdmin) {
      setConfirmDelete(journal);
    } else {
      const hasPendingDelete = ApprovalManager.hasUserRequestedDelete(
        user?.company?._id,
        journal._id,
        user?._id,
      );
      const isDeleteLocked = ApprovalManager.isJournalLockedForDelete(
        user?.company?._id,
        journal._id,
      );

      if (hasPendingDelete) {
        toast.info("Delete request already pending for this journal.");
        return;
      }

      if (isDeleteLocked) {
        toast.warning("Another delete request is already pending for this journal.");
        return;
      }

      await ApprovalManager.addDeleteRequest(user?.company?._id, journal);
      toast.success("Delete request sent to admin!");
      await refreshApprovals();
      await refreshNotifications({ silent: true });
      fetchJournals();
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      const response = await deleteJournalApi(user?.company?._id, confirmDelete._id);

      toast.success(
        response?.message || `Journal ${confirmDelete.number} deleted successfully!`,
      );

      // Remove from local state
      setJournals((prev) => prev.filter((j) => j._id !== confirmDelete._id));

      // Close modal if it was the deleted journal
      if (selectedJournal?._id === confirmDelete._id) {
        setShowDetailsModal(false);
        setSelectedJournal(null);
      }

      setConfirmDelete(null);
      
      // Refresh the list
      fetchJournals();
      fetchStats();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error?.response?.data?.message || "Error deleting journal");
    } finally {
      setDeleting(false);
    }
  };

  // Get edit button status
  const getEditButtonStatus = (journal) => {
    if (!canEditJournal) {
      return null;
    }

    if (journal.sourceType === "INVOICE") {
      return {
        enabled: true,
        label: "Open Invoice",
        variant: "primary",
        icon: FiFileText,
      };
    }

    if (journal.sourceType === "PAYMENT" || journal.sourceType === "REVERSAL") {
      return {
        enabled: true,
        label: "Open Invoice",
        variant: "primary",
        icon: FiFileText,
      };
    }

    if (isAdmin) {
      return {
        enabled: true,
        label: "Edit",
        variant: "primary",
        icon: FiEdit,
      };
    }

    const hasPendingRequest = ApprovalManager.hasUserRequestedEdit(user?.company?._id, journal._id, user?._id);
    const isJournalLocked = ApprovalManager.isJournalLockedForEdit(user?.company?._id, journal._id);

    if (hasPendingRequest) {
      return {
        enabled: false,
        label: "Update Pending",
        variant: "warning",
        icon: FiClock,
      };
    } else if (isJournalLocked) {
      return {
        enabled: false,
        label: "Locked",
        variant: "disabled",
        icon: FiEye,
      };
    } else {
      return {
        enabled: true,
        label: "Edit & Request",
        variant: "primary",
        icon: FiEdit,
      };
    }
  };

  // Calculate totals
  const calculateTotals = (lines) => {
    const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
    return { totalDebit, totalCredit };
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      sourceType: "",
      voucherType: "",
    });
    setSearch("");
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getJournalDeleteContent = (journal) => {
    if (!journal) {
      return {
        title: "Confirm Delete",
        body: "",
        note: "",
      };
    }

    if (journal.sourceType === "INVOICE") {
      return {
        title: "Delete Sales Journal",
        body:
          "Deleting this journal will remove the sales journal posting from the invoice.",
        note:
          "The invoice will remain available for manual reposting. If payments exist, deletion will be blocked until those receipt journals are removed.",
      };
    }

    if (journal.sourceType === "PAYMENT") {
      return {
        title: "Delete Receipt Journal",
        body:
          "Deleting this journal will cancel the payment and update invoice balance.",
        note:
          "Invoice settlement and purchase order paid totals will be recalculated from the remaining active payments.",
      };
    }

    return {
      title: journal.sourceType === "EXCEL" ? "Delete Excel Journal" : "Delete Manual Journal",
      body: `Are you sure you want to delete journal ${journal.number}?`,
      note: "This removes the journal and its lines only.",
    };
  };

  const getSourceTypeColor = (type) => {
    switch (type) {
      case "INVOICE":
        return "bg-pink-100 text-pink-800 border-pink-200";
      case "PAYMENT":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "MANUAL":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "EXCEL":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "REVERSAL":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Get voucher type color
  const getVoucherTypeColor = (type) => {
    switch (type) {
      case "SALES":
        return "bg-green-100 text-green-800 border-green-200";
      case "PURCHASE":
        return "bg-red-100 text-red-800 border-red-200";
      case "PAYMENT":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "RECEIPT":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "CONTRA":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "JOURNAL":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const generatePageNumbers = () => {
    const pages = [];
    const totalPages = pagination.totalPages;
    const currentPage = pagination.page;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages.filter((page, index, list) => {
      if (page !== "...") return true;
      return list[index - 1] !== "...";
    });
  };

  const paginationStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const paginationEnd = Math.min(pagination.page * pagination.limit, pagination.total);

  // Handle search with page reset
  

  const handleSearch = (value) => {
    setSearch(value);
    if (pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
    }
  };

  // Handle filter change with page reset
  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
    if (pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
    }
  };

  const openJournalDetailById = async (journalId) => {
    try {
      // First check if it's already in our list
      const existing = journals.find(j => j._id === journalId);
      if (existing) {
        setSelectedJournal(existing);
        setShowDetailsModal(true);
        return;
      }

      // If not in list, fetch it
      const res = await getJournalByIdApi(user?.company?._id, journalId);
      if (res.data) {
        setSelectedJournal(res.data);
        setShowDetailsModal(true);
      }
    } catch (error) {
      console.error("Error opening journal detail:", error);
      toast.error("Failed to load journal details");
    }
  };

  const openSourceDocument = useCallback(
    (journal, showToast = false) => {
      if (!journal) return;

      if (journal.sourceType === "INVOICE" && journal.sourceId) {
        if (showToast) toast.info(SYSTEM_JOURNAL_MESSAGE);
        navigate(`/invoice-data/viewall-invoices?invoiceId=${journal.sourceId}`);
        return;
      }

      if (journal.sourceType === "PAYMENT") {
        if (showToast) toast.info(SYSTEM_JOURNAL_MESSAGE);
        const params = new URLSearchParams();
        params.set("tab", "payments");
        
        // Use sourceId as invoiceId if available, otherwise check paymentLinks
        const invoiceId = journal.sourceId || journal.paymentLinks?.[0]?.invoiceId;
        if (invoiceId) {
          params.set("invoiceId", invoiceId);
        }
        
        if (journal.referenceNumber) {
          params.set("reference", journal.referenceNumber);
        }
        navigate(`/invoice-data/viewall-invoices?${params.toString()}`);
        return;
      }

      if (journal.sourceType === "REVERSAL") {
        if (showToast) toast.info(SYSTEM_JOURNAL_MESSAGE);
        
        // Manual reversals link back to the parent journal ID (sourceId)
        if (journal.sourceId && !journal.referenceNumber?.startsWith("INV-")) {
          openJournalDetailById(journal.sourceId);
          return;
        }

        const params = new URLSearchParams();
        params.set("tab", "payments");
        
        // Use sourceId as invoiceId if available, otherwise check paymentLinks
        const invoiceId = journal.sourceId || journal.paymentLinks?.[0]?.invoiceId;
        if (invoiceId) {
          params.set("invoiceId", invoiceId);
        }
        
        if (journal.referenceNumber) {
          params.set("reference", journal.referenceNumber);
        }
        
        navigate(`/invoice-data/viewall-invoices?${params.toString()}`);
        return;
      }
    },
    [navigate],
  );

  const handleReverseClick = (journal, e) => {
    e.stopPropagation();
    setJournalToReverse(journal);
    setShowReverseConfirm(true);
  };

  const handleReverse = async () => {
    if (!journalToReverse) return;
    try {
      setReversing(true);
      const res = await reverseJournalApi(user?.company?._id, journalToReverse._id);
      toast.success(res.message || "Journal reversed successfully!");
      setShowReverseConfirm(false);
      setJournalToReverse(null);
      // Wait a bit for the backend to process before refreshing
      setTimeout(() => {
        allJournalApi(user?.company?._id).then((res) => {
          setJournals(res.data || []);
          setLoading(false);
        });
      }, 500);
    } catch (error) {
      console.error("Reversal error:", error);
      toast.error(error?.response?.data?.message || "Error reversing journal");
    } finally {
      setReversing(false);
    }
  };

  const handleReferenceClick = (journal, e) => {
    e.stopPropagation();

    if (journal?.sourceType === "INVOICE" || journal?.sourceType === "PAYMENT" || journal?.sourceType === "REVERSAL") {
      openSourceDocument(journal);
    }
  };

  // Render journal line changes in detail
  const renderJournalLineChanges = (details) => {
    if (!details) return null;

    return (
      <div className="mt-3 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Old Totals</div>
            <div className="flex justify-between">
              <span className="text-sm">Debit: ₹{details.summary?.oldTotalDebit?.toFixed(2) || "0.00"}</span>
              <span className="text-sm">Credit: ₹{details.summary?.oldTotalCredit?.toFixed(2) || "0.00"}</span>
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">New Totals</div>
            <div className="flex justify-between">
              <span className="text-sm">Debit: ₹{details.summary?.newTotalDebit?.toFixed(2) || "0.00"}</span>
              <span className="text-sm">Credit: ₹{details.summary?.newTotalCredit?.toFixed(2) || "0.00"}</span>
            </div>
          </div>
        </div>

        {/* Added Lines */}
        {details.added && details.added.length > 0 && (
          <div className="border-l-4 border-green-500 pl-3">
            <div className="flex items-center gap-2 mb-2">
              <FiPlusCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">Added Lines ({details.added.length})</span>
            </div>
            <div className="space-y-2 pl-2">
              {details.added.map((line, idx) => (
                <div key={idx} className="text-sm bg-green-50 p-2 rounded">
                  <div className="font-medium">{line.accountName}</div>
                  <div className="flex justify-between text-xs text-green-600">
                    <span>Debit: ₹{line.debit.toFixed(2)}</span>
                    <span>Credit: ₹{line.credit.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Removed Lines */}
        {details.removed && details.removed.length > 0 && (
          <div className="border-l-4 border-red-500 pl-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <FiMinusCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">Removed Lines ({details.removed.length})</span>
            </div>
            <div className="space-y-2 pl-2">
              {details.removed.map((line, idx) => (
                <div key={idx} className="text-sm bg-red-50 p-2 rounded">
                  <div className="font-medium">{line.accountName}</div>
                  <div className="flex justify-between text-xs text-red-600">
                    <span>Debit: ₹{line.debit.toFixed(2)}</span>
                    <span>Credit: ₹{line.credit.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modified Lines */}
        {details.modified && details.modified.length > 0 && (
          <div className="border-l-4 border-blue-500 pl-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <FiTrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Modified Lines ({details.modified.length})</span>
            </div>
            <div className="space-y-2 pl-2">
              {details.modified.map((line, idx) => (
                <div key={idx} className="text-sm bg-blue-50 p-2 rounded">
                  <div className="font-medium">{line.accountName}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-red-600">Old:</div>
                      <div>Debit: ₹{line.oldDebit.toFixed(2)}</div>
                      <div>Credit: ₹{line.oldCredit.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-green-600">New:</div>
                      <div>Debit: ₹{line.newDebit.toFixed(2)}</div>
                      <div>Credit: ₹{line.newCredit.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render audit log changes
  const renderChangeComparison = (log) => {
    if (!log.changes || log.changes.length === 0) {
      return <div className="text-sm text-gray-500 italic">No field changes recorded</div>;
    }

    return (
      <div className="space-y-4">
        {log.changes.map((change, idx) => {
          // Handle journal lines separately
          if (change.field === "journalLines") {
            return (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FiTrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-gray-900">{change.label}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-xs text-gray-500 mb-1">Before</div>
                    <div>Lines: {change.oldValue.count}</div>
                    <div className="text-sm">Debit: ₹{change.oldValue.totalDebit.toFixed(2)}</div>
                    <div className="text-sm">Credit: ₹{change.oldValue.totalCredit.toFixed(2)}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-xs text-gray-500 mb-1">After</div>
                    <div>Lines: {change.newValue.count}</div>
                    <div className="text-sm">Debit: ₹{change.newValue.totalDebit.toFixed(2)}</div>
                    <div className="text-sm">Credit: ₹{change.newValue.totalCredit.toFixed(2)}</div>
                  </div>
                </div>

                {change.details && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Detailed Changes ({change.details.changes || 0} changes):</div>
                    {renderJournalLineChanges(change.details)}
                  </div>
                )}
              </div>
            );
          }

          // Regular field changes
          return (
            <div key={idx} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{change.label}</span>
                <span className="text-xs text-gray-500">Changed</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50 p-3 rounded border border-red-100">
                  <div className="text-xs text-red-600 mb-1">Old Value</div>
                  <div className="text-sm text-gray-800 line-through">{change.oldValue}</div>
                </div>
                <div className="bg-green-50 p-3 rounded border border-green-100">
                  <div className="text-xs text-green-600 mb-1">New Value</div>
                  <div className="text-sm text-gray-800">{change.newValue}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Button variants
  const buttonVariants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    secondary: "bg-orange-500 hover:bg-orange-600 text-white",
    success: "bg-green-600 hover:bg-green-700 text-white",
    warning: "bg-yellow-500 hover:bg-yellow-600 text-white",
    disabled: "bg-gray-300 text-gray-500 cursor-not-allowed",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  };

  // Voucher type options
  const voucherTypes = ["SALES", "PURCHASE", "PAYMENT", "RECEIPT", "CONTRA", "JOURNAL"];

  // Source type options
  const sourceTypes = ["MANUAL", "EXCEL", "INVOICE", "PAYMENT", "REVERSAL", "ADJUSTMENT"];

  // Handle edit button click
  const handleEditClick = async (journal, e) => {
    e.stopPropagation();

    if (journal.sourceType === "INVOICE" || journal.sourceType === "PAYMENT" || journal.sourceType === "REVERSAL") {
      openSourceDocument(journal, true);
      return;
    }

    if (isAdmin) {
      navigate("/accounting/journals/create", {
        state: {
          editingJournal: journal,
          isEditing: true,
        },
      });
    } else {
      const hasPendingRequest = ApprovalManager.hasUserRequestedEdit(user?.company?._id, journal._id, user?._id);
      const isJournalLocked = ApprovalManager.isJournalLockedForEdit(user?.company?._id, journal._id);

      if (hasPendingRequest) {
        toast.info("Your edit request is pending admin approval.");
      } else if (isJournalLocked) {
        const pendingRequests = ApprovalManager.getPendingEditRequestsForJournal(user?.company?._id, journal._id);
        const otherUser = pendingRequests[0]?.requestedBy?.name || "another user";
        toast.warning(`This journal has a pending edit request from ${otherUser}. Please wait.`);
      } else {
        navigate("/accounting/journals/create", {
          state: {
            editingJournal: journal,
            isEditing: true,
          },
        });
      }
    }
  };

  const getDeleteButtonStatus = (journal) => {
    if (!canDeleteJournal) {
      return null;
    }

    if (isAdmin) {
      return { enabled: true, label: "Delete" };
    }

    const hasPendingDelete = ApprovalManager.hasUserRequestedDelete(
      user?.company?._id,
      journal._id,
      user?._id,
    );
    const isDeleteLocked = ApprovalManager.isJournalLockedForDelete(
      user?.company?._id,
      journal._id,
    );

    if (hasPendingDelete) {
      return { enabled: false, label: "Pending Delete" };
    }

    if (isDeleteLocked) {
      return { enabled: false, label: "Delete Locked" };
    }

    return { enabled: true, label: "Request Delete" };
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-premium">
        <div className="px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
          
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Journal Vouchers</h1>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  Manage accounting journals and financial records ({stats.journalCount || 0} entries)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
             

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm border ${
                  showFilters ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <FiFilter size={18} />
                Filters
                <FiChevronDown size={16} className={`transition-transform duration-300 ${showFilters ? "rotate-180" : ""}`} />
              </button>

              {canCreateJournal && (
                <button
                  onClick={() => navigate("/accounting/journals/upload-excel")}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <FiUploadCloud size={18} />
                  Upload via Excel
                </button>
              )}

              {canCreateJournal && (
                <button
                  onClick={() => navigate("/accounting/journals/create")}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
                >
                  <FiPlus size={20} />
                  New Journal
                </button>
              )}
            </div>
          </div>

          {isAdminOrSuperAdmin && (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* ── Card 1: Total Journals ── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="relative overflow-hidden rounded-2xl p-6 shadow-xl group cursor-default"
                style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #60a5fa 100%)" }}
              >
                {/* large oval blob — top right */}
                <div className="absolute -top-8 -right-8 w-40 h-28 rounded-full opacity-20 blur-2xl group-hover:scale-110 transition-transform duration-700"
                  style={{ background: "radial-gradient(ellipse, #93c5fd, transparent)" }} />
                {/* small oval — bottom left */}
                <div className="absolute -bottom-6 -left-6 w-28 h-20 rounded-full opacity-25 blur-xl"
                  style={{ background: "radial-gradient(ellipse, #bfdbfe, transparent)" }} />
                {/* diagonal streak */}
                <div className="absolute top-0 right-12 w-1 h-full bg-white/10 rotate-12 scale-y-150" />

                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mb-2">Total Journals</p>
                    <p className="text-3xl font-black text-white leading-none">
                      {loadingStats ? <span className="opacity-40 animate-pulse text-xl">···</span> : stats.journalCount || 0}
                    </p>
                    <p className="text-blue-200/70 text-[11px] font-medium mt-2">All recorded entries</p>
                  </div>
                  <div className="p-3 bg-white/15 rounded-2xl border border-white/20 backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <TbFileInvoice size={22} className="text-white" />
                  </div>
                </div>

                {/* bottom accent line */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </motion.div>

              {/* ── Card 2: Total Volume ── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="relative overflow-hidden rounded-2xl p-6 shadow-xl group cursor-default"
                style={{ background: "linear-gradient(135deg, #064e3b 0%, #059669 55%, #34d399 100%)" }}
              >
                {/* large oval — top right */}
                <div className="absolute -top-10 -right-10 w-44 h-32 rounded-full opacity-20 blur-2xl group-hover:scale-110 transition-transform duration-700"
                  style={{ background: "radial-gradient(ellipse, #6ee7b7, transparent)" }} />
                {/* oval — bottom left */}
                <div className="absolute -bottom-8 -left-4 w-32 h-24 rounded-full opacity-20 blur-xl"
                  style={{ background: "radial-gradient(ellipse, #a7f3d0, transparent)" }} />
                {/* ring shape */}
                <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full border-4 border-white/10 opacity-40" />
                {/* diagonal streak */}
                <div className="absolute top-0 left-16 w-0.5 h-full bg-white/10 -rotate-12 scale-y-150" />

                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest mb-2">Total Volume</p>
                    <p className="text-3xl font-black text-white leading-none">
                      {loadingStats
                        ? <span className="opacity-40 animate-pulse text-xl">···</span>
                        : `₹${formatAmount(stats.totalAmount || 0)}`}
                    </p>
                    <p className="text-emerald-200/70 text-[11px] font-medium mt-2">Cumulative transaction value</p>
                  </div>
                  <div className="p-3 bg-white/15 rounded-2xl border border-white/20 backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <FiDollarSign size={22} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </motion.div>

              {/* ── Card 3: Pending Approvals ── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.19 }}
                className="relative overflow-hidden rounded-2xl p-6 shadow-xl group cursor-default"
                style={{ background: "linear-gradient(135deg, #92400e 0%, #d97706 55%, #fbbf24 100%)" }}
              >
                {/* large oval — top right */}
                <div className="absolute -top-8 -right-8 w-40 h-28 rounded-full opacity-25 blur-2xl group-hover:scale-110 transition-transform duration-700"
                  style={{ background: "radial-gradient(ellipse, #fde68a, transparent)" }} />
                {/* oval — bottom left */}
                <div className="absolute -bottom-6 -left-6 w-32 h-20 rounded-full opacity-20 blur-xl"
                  style={{ background: "radial-gradient(ellipse, #fef3c7, transparent)" }} />
                {/* ring */}
                <div className="absolute top-2 right-2 w-16 h-16 rounded-full border-2 border-white/15" />
                <div className="absolute top-5 right-5 w-8 h-8 rounded-full border border-white/10" />

                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-amber-200 text-[10px] font-black uppercase tracking-widest mb-2">Pending Approvals</p>
                    <p className="text-3xl font-black text-white leading-none">
                      {pendingApprovalsCount}
                    </p>
                    <p className="text-amber-200/70 text-[11px] font-medium mt-2">Awaiting admin action</p>
                  </div>
                  <div className="p-3 bg-white/15 rounded-2xl border border-white/20 backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <FiClock size={22} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Filters Section */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-100 bg-slate-50/50"
          >
            <div className="px-6 py-8 mx-auto max-w-7xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Advanced Filters</h3>
                <button onClick={clearFilters} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <FiX size={14} />
                  Reset all
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Date From</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Date To</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Voucher Type</label>
                  <select
                    value={filters.voucherType}
                    onChange={(e) => handleFilterChange('voucherType', e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                  >
                    <option value="">All Types</option>
                    {voucherTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Source Type</label>
                  <select
                    value={filters.sourceType}
                    onChange={(e) => handleFilterChange('sourceType', e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                  >
                    <option value="">All Sources</option>
                    {sourceTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="px-6 py-8 mx-auto max-w-7xl">
        {/* Search Box */}
        <div className="mb-10">
          <div className="relative group max-w-2xl mx-auto">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
            <input
              type="text"
              placeholder="Search journals by number, narration, or document reference..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white/60 backdrop-blur-md border border-white/20 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none font-medium shadow-premium group-hover:shadow-lg"
            />
          </div>
        </div>

        {/* Journal List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Financial Records</h3>
            {pagination.total > 0 && (
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                Showing {journals.length} of {pagination.total}
              </span>
            )}
          </div>

          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            {loading ? (
              <div className="p-8">
                <LoadingComponent message="Loading journals..." />
              </div>
            ) : journals.length === 0 ? (
              <div className="text-center py-12">
                <FiFileText className="mx-auto h-16 w-16 text-gray-300" />
                <p className="mt-4 text-gray-500">No journals found</p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {journals.map((journal) => {
                  const totals = calculateTotals(journal.lines || []);
                  const editStatus = getEditButtonStatus(journal);
                  const deleteStatus = getDeleteButtonStatus(journal);
                  const showActionButtons = Boolean(editStatus || deleteStatus);

                  return (
                    <div 
                      key={journal._id} 
                      onClick={() => handleJournalSelect(journal)} 
                      className="relative overflow-hidden p-5 cursor-pointer transition-all duration-200 hover:shadow-lg bg-white rounded-2xl border border-slate-100 mb-3 group hover:border-blue-200"
                    >
                      {/* subtle left accent bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-all ${
                        journal.voucherType === "SALES" ? "bg-gradient-to-b from-green-400 to-emerald-500"
                        : journal.voucherType === "PURCHASE" ? "bg-gradient-to-b from-red-400 to-rose-500"
                        : journal.voucherType === "PAYMENT" ? "bg-gradient-to-b from-blue-400 to-blue-600"
                        : journal.voucherType === "RECEIPT" ? "bg-gradient-to-b from-violet-400 to-purple-600"
                        : journal.voucherType === "CONTRA" ? "bg-gradient-to-b from-yellow-400 to-amber-500"
                        : "bg-gradient-to-b from-indigo-400 to-indigo-600"
                      }`} />

                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pl-3">
                        {/* Left */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 mb-2">
                            <span className="text-base font-black text-slate-900 tracking-tight">{journal.number}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-black rounded-full border uppercase tracking-wider ${getVoucherTypeColor(journal.voucherType)}`}>
                              {journal.voucherType}
                            </span>
                            {journal.sourceType && (
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase ${getSourceTypeColor(journal.sourceType)}`}>
                                {journal.sourceType}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <FiCalendar className="h-3 w-3 shrink-0" />
                              <span>{format(new Date(journal.date), "dd MMM yyyy")}</span>
                            </div>
                            {journal.partyName && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <FiUser className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[140px]">{journal.partyName}</span>
                              </div>
                            )}
                          </div>

                          {journal.narration && (
                            <p className="text-xs text-slate-400 mt-1.5 line-clamp-1 italic">"{journal.narration}"</p>
                          )}

                          {journal.referenceNumber && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={(e) => handleReferenceClick(journal, e)}
                                disabled={journal.sourceType !== "INVOICE" && journal.sourceType !== "PAYMENT" && journal.sourceType !== "REVERSAL"}
                                className={`text-xs font-bold ${
                                  journal.sourceType === "INVOICE" || journal.sourceType === "PAYMENT" || journal.sourceType === "REVERSAL"
                                    ? "text-blue-700 hover:text-blue-900 underline cursor-pointer"
                                    : "text-slate-400 cursor-default"
                                }`}
                              >
                                Ref: {journal.referenceNumber}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Right */}
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <div className="text-base font-black text-slate-900">₹{totals.totalDebit.toLocaleString()}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              Dr ₹{totals.totalDebit.toLocaleString()} · Cr ₹{totals.totalCredit.toLocaleString()}
                            </div>
                          </div>

                          {showActionButtons && (
                            <div className="flex gap-1.5">
                              {editStatus && (
                                <button
                                  onClick={(e) => handleEditClick(journal, e)}
                                  disabled={!editStatus.enabled}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all ${
                                    buttonVariants[editStatus.variant]
                                  } ${!editStatus.enabled ? "cursor-not-allowed opacity-60" : "cursor-pointer shadow-sm"}`}
                                  title={editStatus.label}
                                >
                                  {editStatus.icon && <editStatus.icon className="h-3 w-3" />}
                                  <span className="hidden sm:inline">{editStatus.label}</span>
                                </button>
                              )}

                                {isAdmin && !["REVERSAL"].includes(journal.sourceType) && (
                                  <button
                                    onClick={(e) => handleReverseClick(journal, e)}
                                    disabled={journal.isReversed}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all ${
                                      journal.isReversed
                                        ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                                        : "bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 cursor-pointer"
                                    }`}
                                    title={journal.isReversed ? "Already Reversed" : "Reverse Journal"}
                                  >
                                    <FiRefreshCw className={`h-3 w-3 ${journal.isReversed ? "" : "animate-spin-slow"}`} />
                                    <span className="hidden sm:inline">
                                      {journal.isReversed ? "Reversed" : "Reverse"}
                                    </span>
                                  </button>
                                )}
                              {deleteStatus && (
                                <button
                                  onClick={(e) => handleDeleteClick(journal, e)}
                                  disabled={!deleteStatus.enabled}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all ${
                                    deleteStatus.enabled
                                      ? `${buttonVariants.danger} cursor-pointer`
                                      : "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                                  }`}
                                >
                                  <FiTrash2 className="h-3 w-3" />
                                  <span className="hidden sm:inline">{deleteStatus.label}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-8 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Journal Navigation
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-700">
                    Showing {paginationStart}-{paginationEnd} of {pagination.total} journals
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FiArrowLeft size={14} />
                    Prev
                  </button>

                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {generatePageNumbers().map((page, index) =>
                      page === "..." ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="inline-flex h-7 min-w-[26px] items-center justify-center px-1 text-[11px] font-semibold text-slate-400"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition ${
                            pagination.page === page
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-600 hover:bg-white hover:text-slate-900"
                          }`}
                        >
                          {page}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <FiChevronRight size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Rows</span>
                  <select
                    value={pagination.limit}
                    onChange={(e) => {
                      setPagination((prev) => ({
                        ...prev,
                        limit: parseInt(e.target.value),
                        page: 1,
                      }));
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 outline-none focus:border-slate-400"
                  >
                    {[5, 10, 25, 50].map((size) => (
                      <option key={size} value={size}>{size} / page</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
      </main>

      {/* Journal Details Modal */}
      {showDetailsModal && selectedJournal && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/70  flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FiFileText className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Journal: {selectedJournal.number}</h2>
                  <p className="text-sm text-gray-600">{format(new Date(selectedJournal.date), "MMMM dd, yyyy")}</p>
                </div>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                <FiX className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex">
              {/* Left Column - Journal Details (2/3) */}
              <div className={`overflow-y-auto p-6 ${auditLogs.length > 0 ? "w-2/3 border-r border-gray-200" : "w-full"}`}>
                {/* Journal Header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded-full ${
                        selectedJournal.voucherType === "SALES"
                          ? "bg-green-100 text-green-800"
                          : selectedJournal.voucherType === "PURCHASE"
                            ? "bg-red-100 text-red-800"
                            : selectedJournal.voucherType === "JOURNAL"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {selectedJournal.voucherType}
                    </span>
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded-full ${
                        selectedJournal.sourceType === "INVOICE"
                          ? "bg-pink-100 text-pink-800"
                          : selectedJournal.sourceType === "MANUAL"
                            ? "bg-gray-100 text-gray-800"
                            : selectedJournal.sourceType === "EXCEL"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {selectedJournal.sourceType}
                    </span>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Journal Number</p>
                      <p className="font-semibold text-gray-900">{selectedJournal.number}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Reference Number</p>
                      {selectedJournal.referenceNumber ? (
                        <button
                          type="button"
                          onClick={(e) => handleReferenceClick(selectedJournal, e)}
                          disabled={selectedJournal.sourceType !== "INVOICE" && selectedJournal.sourceType !== "PAYMENT" && selectedJournal.sourceType !== "REVERSAL"}
                          className={`text-left font-semibold ${
                            selectedJournal.sourceType === "INVOICE" || selectedJournal.sourceType === "PAYMENT" || selectedJournal.sourceType === "REVERSAL"
                              ? "text-blue-600 hover:text-blue-800 underline cursor-pointer"
                              : "text-gray-900 cursor-default"
                          }`}
                        >
                          {selectedJournal.referenceNumber}
                        </button>
                      ) : (
                        <p className="font-semibold text-gray-900">N/A</p>
                      )}
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Party</p>
                      <p className="font-semibold text-gray-900">{selectedJournal.partyName || "N/A"}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">External Document</p>
                      <p className="font-semibold text-gray-900">{selectedJournal.externalDocNo || "N/A"}</p>
                    </div>
                  </div>

                  {/* Narration */}
                  {selectedJournal.narration && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                      <h3 className="text-sm font-semibold text-blue-700 mb-2">Narration</h3>
                      <p className="text-gray-800">{selectedJournal.narration}</p>
                    </div>
                  )}

                  {/* Journal Lines */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Journal Entries</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit (₹)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedJournal.lines?.map((line, index) => (
                            <tr key={line._id || index} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div>
                                  <div className="font-medium text-gray-900">
                                    {line.credit > 0 ? "To " : "By "}
                                    {line.account?.name || "Unknown Account"} A/c
                                  </div>
                                  {line.account?.code && <div className="text-xs text-gray-500">Code: {line.account.code}</div>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">{line.debit > 0 ? `₹${line.debit.toLocaleString()}` : "-"}</td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">{line.credit > 0 ? `₹${line.credit.toLocaleString()}` : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">₹{calculateTotals(selectedJournal.lines || []).totalDebit.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">₹{calculateTotals(selectedJournal.lines || []).totalCredit.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-700 mb-2">Created</h4>
                      <div className="flex items-center gap-2">
                        <FiUser className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">
                          {selectedJournal.createdBy?.name ||
                            (typeof selectedJournal.createdBy === "string" &&
                              (user && (String(user._id) === selectedJournal.createdBy || String(user.id) === selectedJournal.createdBy)
                                ? user.name || user.email
                                : !/^[0-9a-fA-F]{24}$/.test(selectedJournal.createdBy)
                                ? selectedJournal.createdBy
                                : "Unknown")) ||
                            "Unknown"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{format(new Date(selectedJournal.createdAt), "MMM dd, yyyy HH:mm")}</div>
                    </div>

                    {selectedJournal.updatedBy && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-2">Last Updated</h4>
                        <div className="flex items-center gap-2">
                          <FiUser className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {selectedJournal.updatedBy?.name ||
                              (typeof selectedJournal.updatedBy === "string" &&
                                (user && (String(user._id) === selectedJournal.updatedBy || String(user.id) === selectedJournal.updatedBy)
                                  ? user.name || user.email
                                  : !/^[0-9a-fA-F]{24}$/.test(selectedJournal.updatedBy)
                                  ? selectedJournal.updatedBy
                                  : "Unknown")) ||
                              "Unknown"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{format(new Date(selectedJournal.updatedAt), "MMM dd, yyyy HH:mm")}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Audit Logs (1/3) */}
              {(auditLogs?.length ?? 0) > 0 && (
                <div className="w-1/3 overflow-y-auto p-6 bg-gray-50">
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Update History</h3>
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">{auditLogs.length} updates</span>
                    </div>

                    {loadingAuditLogs ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-sm text-gray-500">Loading update history...</p>
                      </div>
                    ) : auditLogs.length === 0 ? (
                      <div className="text-center py-8">
                        <FiInfo className="mx-auto h-12 w-12 text-gray-300" />
                        <p className="mt-4 text-gray-500">No updates found</p>
                        <p className="text-sm text-gray-400 mt-1">This journal has not been modified</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {auditLogs.map((log, index) => (
                          <div key={log._id || index} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-blue-100 rounded">
                                  <FiTrendingUp className="h-4 w-4 text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">Update #{auditLogs.length - index}</span>
                              </div>
                              <span className="text-xs text-gray-500">{format(new Date(log.createdAt), "MMM dd, yyyy HH:mm")}</span>
                            </div>

                            <div className="mb-4">
                              <div className="flex items-center gap-2">
                                <FiUser className="h-4 w-4 text-gray-400" />
                                <span className="text-sm text-gray-700">
                                  Updated by: <strong>{log.performedBy?.name || "System"}</strong>
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">{log.performedBy?.email || ""}</div>
                            </div>

                            <div className="border-t border-gray-100 pt-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Changes Made:</h4>
                              {renderChangeComparison(log)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <FiTrash2 className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getJournalDeleteContent(confirmDelete).title}
                </h3>
                <p className="text-sm text-gray-500">Review the rollback impact before continuing</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">
                {getJournalDeleteContent(confirmDelete).body}
              </p>
              <p className="text-xs text-red-600 mt-2">
                {getJournalDeleteContent(confirmDelete).note}
              </p>
              <div className="mt-3 text-xs text-gray-600 space-y-1">
                <div>Journal: {confirmDelete.number}</div>
                <div>Date: {format(new Date(confirmDelete.date), "MMM dd, yyyy")}</div>
                {confirmDelete.partyName && <div>Party: {confirmDelete.partyName}</div>}
                <div>Amount: ₹{calculateTotals(confirmDelete.lines || []).totalDebit.toLocaleString()}</div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <FiTrash2 className="h-4 w-4" />
                    Delete Journal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Confirmation Modal */}
      {showReverseConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-100 transform transition-all">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="p-4 bg-amber-100 rounded-2xl mb-4 shadow-inner">
                <FiRefreshCw className="h-8 w-8 text-amber-600 animate-spin-slow" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
                Reverse Journal Entry?
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[280px]">
                Are you sure you want to reverse journal <strong>{journalToReverse?.number}</strong>? This will create a mirrored entry.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8 space-y-2">
              <div className="flex justify-between text-xs text-slate-500 font-medium">
                <span>Date</span>
                <span className="text-slate-900">{journalToReverse && format(new Date(journalToReverse.date), "dd MMM yyyy")}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 font-medium border-t border-slate-200 pt-2">
                <span>Total Amount</span>
                <span className="text-slate-900 font-bold">₹{calculateTotals(journalToReverse?.lines || []).totalDebit.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReverseConfirm(false);
                  setJournalToReverse(null);
                }}
                disabled={reversing}
                className="flex-1 px-4 py-3 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReverse}
                disabled={reversing}
                className="flex-1 px-4 py-3 text-sm font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 shadow-lg shadow-amber-600/20 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {reversing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Reversing...
                  </>
                ) : (
                  <>
                    <FiRefreshCw className="h-4 w-4" />
                    Yes, Reverse
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
