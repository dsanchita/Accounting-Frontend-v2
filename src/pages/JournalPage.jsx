import { useState, useCallback, useEffect, useRef } from "react";
import {
  Calendar,
  Save,
  X,
  Plus,
  Trash2,
  FileText,
  Search,
  BookOpen,
  Edit2,
  Clock,
  History,
  BookMarked,
  AlertCircle,
  CheckCircle2,
  Info,
  RefreshCcw,
} from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";
import { getAccountsApi } from "../apis/accountApi";
import LoadingComponent from "../components/LoadingComponent";
import { formatCurrency } from "../utils/formatUtil";
import {
  addJournalApi,
  allJournalApi,
  updateJournalApi,
  getJournalByIdApi,
} from "../apis/journalApi";
import {
  getInvoiceByIdApi,
  searchInvoiceByNumberApi,
} from "../apis/invoice.api";
import CreateLedgerFromInvoiceModal from "../modals/CreateLedgerFromInvoiceModal";
import { ApprovalManager } from "../utils/approvalManager";
import AdminApprovalsDialog from "../components/AdminApprovalsDialog";
import { checkAuthorization } from "../utils/checkAuthorization";
import AuditLogSidebar from "../components/AuditLogSidebar";
import { useLocation, useNavigate } from "react-router-dom";
import ManageLedgerModal from "../modals/ManageLedgerModal";
import { motion, AnimatePresence } from "framer-motion";
import { FiUploadCloud } from "react-icons/fi";

/* ── shared input class ─────────────────────────────────── */
const inputCls =
  "w-full px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 " +
  "rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 " +
  "focus:border-indigo-400 focus:bg-white transition-all";

const labelCls =
  "block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5";

const DUPLICATE_REFERENCE_VOUCHER_TYPES = ["PAYMENT", "RECEIPT"];

export default function ManualJournalPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // State variables
  const [openLogs, setOpenLogs] = useState(false);
  const isAdmin =
    user?.role === "admin" ||
    user?.role === "superAdmin" ||
    user?.privilege?.masterUpdate === true;
  const canViewJournal = checkAuthorization(user, "JOURNAL", "VIEW");
  const canCreateJournal = checkAuthorization(user, "JOURNAL", "CREATE");
  const canEditJournal = checkAuthorization(user, "JOURNAL", "EDIT");
  const canCreateLedger = checkAuthorization(user, "CHART OF ACCOUNTS", "CREATE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [editingJournal, setEditingJournal] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [openModel, setOpenModal] = useState({ createLedger: false });
  const [showApprovals, setShowApprovals] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [voucherType, setVoucherType] = useState("");
  const [requestComment, setRequestComment] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [openManageLedger, setOpenManageLedger] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [duplicateReferenceWarning, setDuplicateReferenceWarning] = useState({
    checking: false,
    match: null,
  });
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 260,
  });
  const ledgerInputRefs = useRef({});

  // Invoice search state
  const [invoiceSearch, setInvoiceSearch] = useState({
    query: "",
    results: [],
    loading: false,
  });

  // Main form state
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    narration: "",
    externalDocNo: "",
    lines: [
      { id: 1, accountId: "", debit: "", credit: "" },
      { id: 2, accountId: "", debit: "", credit: "" },
    ],
  });

  const isVoucherSelected = Boolean(voucherType);
  const shouldCheckDuplicateReference =
    voucherType === "PAYMENT" || voucherType === "RECEIPT";
  const totals = calculateTotals();
  const isBalanced =
    Math.abs(totals.debit - totals.credit) < 0.01 && totals.debit > 0;

  const normalizeReferenceNumber = useCallback(
    (value) => value?.trim().toLowerCase() || "",
    [],
  );

  // Load editing journal from navigation state
  useEffect(() => {
    const fetchEditingJournal = async () => {
      let journalToEdit = location.state?.editingJournal;

      if (!journalToEdit && location.state?.editingJournalId) {
        try {
          const response = await getJournalByIdApi(user?.company?._id, location.state.editingJournalId);
          journalToEdit = response.data;
        } catch (error) {
          console.error("Error fetching journal:", error);
          toast.error("Failed to load journal details");
          navigate("/accounting/journals/list");
          return;
        }
      }

      if (journalToEdit) {
        try {
          if (
            journalToEdit.sourceType &&
            !["MANUAL", "EXCEL", "REVERSAL"].includes(journalToEdit.sourceType)
          ) {
            toast.info(
              "This journal is system-generated. Please edit the source document.",
            );
            navigate("/accounting/journals/list");
            return;
          }

          setIsEditMode(true);
          setEditingJournal(journalToEdit);
          setVoucherType(journalToEdit.voucherType || "JOURNAL");

          const formattedLines = journalToEdit.lines.map(
            (line, index) => ({
              id: Date.now() + index,
              accountId: line.account?._id || line.accountId,
              debit: line.debit > 0 ? line.debit.toString() : "",
              credit: line.credit > 0 ? line.credit.toString() : "",
            }),
          );

          setForm({
            date: journalToEdit.date
              ? new Date(journalToEdit.date).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0],
            narration: journalToEdit.narration || "",
            externalDocNo: journalToEdit.externalDocNo || "",
            lines: formattedLines.length > 0 ? formattedLines : form.lines,
          });

          if (journalToEdit.sourceId && journalToEdit.sourceType === "INVOICE") {
            setSelectedInvoice({
              _id: journalToEdit.sourceId,
              invoiceNo: journalToEdit.referenceNumber,
              billTo: {
                _id: journalToEdit.partyId,
                name: journalToEdit.partyName,
              },
            });
          }

          toast.success(`Editing Journal: ${journalToEdit.number}`);
        } catch (error) {
          console.error("Error loading editing journal:", error);
          toast.error("Failed to load journal for editing");
        }
      }
    };

    fetchEditingJournal();
  }, [location.state]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenApprovals = params.get("openApprovals") === "1";

    if (isAdmin && shouldOpenApprovals) {
      setShowApprovals(true);
    }
  }, [isAdmin, location.search]);

  useEffect(() => {
    if (!isAdmin || !user?.company?._id) return undefined;

    let active = true;
    const syncPendingApprovals = async () => {
      try {
        const requests = await ApprovalManager.syncRequests(user.company._id);
        if (!active) return;
        const pendingCount = (requests || []).filter(
          (r) => r.status === "pending",
        ).length;
        setPendingApprovalsCount(pendingCount);
      } catch (error) {
        if (!active) return;
        setPendingApprovalsCount(
          ApprovalManager.getPendingCount(user.company._id),
        );
      }
    };

    syncPendingApprovals();
    const intervalId = window.setInterval(syncPendingApprovals, 15000);
    const handleFocus = () => syncPendingApprovals();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [isAdmin, user?.company?._id]);

  // Fetch accounts on component mount
  useEffect(() => {
    const controller = new AbortController();
    async function getAllAccounts() {
      try {
        setLoading(true);
        const response = await getAccountsApi(user?.company?._id);
        setAccounts(response?.data || []);
      } catch (error) {
        console.error("fetch error:", error);
        toast.error("Error loading accounts");
      } finally {
        setLoading(false);
      }
    }
    if (user?.company?._id) {
      getAllAccounts();
    }
    return () => controller.abort();
  }, [user?.company?._id]);

  // Form handlers
  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addRow = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        { id: Date.now(), accountId: "", debit: "", credit: "" },
      ],
    }));
  }, []);

  const removeRow = useCallback(
    (id) => {
      if (form.lines.length > 2) {
        setForm((prev) => ({
          ...prev,
          lines: prev.lines.filter((entry) => entry.id !== id),
        }));
      } else {
        toast.warning("Minimum 2 entries required for a journal");
      }
    },
    [form.lines.length],
  );

  const updateLine = useCallback((id, field, value) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((entry) => {
        if (entry.id === id) {
          if (field === "debit" && value) {
            return { ...entry, debit: value, credit: "" };
          } else if (field === "credit" && value) {
            return { ...entry, credit: value, debit: "" };
          }
          return { ...entry, [field]: value };
        }
        return entry;
      }),
    }));
  }, []);

  // Calculate totals
  function calculateTotals() {
    return form.lines.reduce(
      (acc, entry) => ({
        debit: acc.debit + (parseFloat(entry.debit) || 0),
        credit: acc.credit + (parseFloat(entry.credit) || 0),
      }),
      { debit: 0, credit: 0 },
    );
  }

  // Validation
  const validateJournal = () => {
    if (!isVoucherSelected) {
      toast.error("Please select a voucher type");
      return false;
    }

    if (!form.date) {
      toast.error("Please select a journal date");
      return false;
    }

    if (!form.narration.trim()) {
      toast.error("Please enter narration or description");
      return false;
    }

    if (isEditMode && editingJournal && !isAdmin && !requestComment.trim()) {
      toast.error("Please enter why this journal needs to be updated");
      return false;
    }

    if (form.lines.length < 2) {
      toast.error("At least 2 entries required");
      return false;
    }

    if (form.lines.some((e) => !e.accountId || (!e.debit && !e.credit))) {
      toast.error("Please fill all account and amount fields");
      return false;
    }

    if (!isBalanced) {
      toast.error(
        "Journal entry is not balanced! Debit and Credit must be equal.",
      );
      return false;
    }

    const accountIds = form.lines.map((e) => e.accountId);
    const duplicates = accountIds.filter(
      (item, index) => accountIds.indexOf(item) !== index,
    );
    if (duplicates.length > 0) {
      toast.warning("Warning: Same account used multiple times");
      return false;
    }

    return true;
  };
  const getFilteredAccounts = () => {
    if (!accountSearch) return accounts;

    return accounts.filter((acc) =>
      acc.name.toLowerCase().includes(accountSearch.toLowerCase()),
    );
  };

  const positionLedgerDropdown = useCallback((entryId) => {
    const inputElement = ledgerInputRefs.current[entryId];
    if (!inputElement) return;

    const rect = inputElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const preferredHeight = 260;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      140,
      Math.min(preferredHeight, openUpward ? spaceAbove - 12 : spaceBelow - 12),
    );
    const top = openUpward ? rect.top - maxHeight - 6 : rect.bottom + 6;
    const left = Math.min(rect.left, window.innerWidth - rect.width - 8);

    setDropdownPosition({
      top: Math.max(8, top),
      left: Math.max(8, left),
      width: rect.width,
      maxHeight,
    });
  }, []);

  const openLedgerDropdown = useCallback(
    (entryId) => {
      setActiveDropdown(entryId);
      positionLedgerDropdown(entryId);
    },
    [positionLedgerDropdown],
  );

  // Save journal
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest("[data-dropdown]")) {
        setActiveDropdown(null);
        setAccountSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!activeDropdown) return;

    const handleViewportUpdate = () => {
      positionLedgerDropdown(activeDropdown);
    };

    window.addEventListener("resize", handleViewportUpdate);
    window.addEventListener("scroll", handleViewportUpdate, true);
    return () => {
      window.removeEventListener("resize", handleViewportUpdate);
      window.removeEventListener("scroll", handleViewportUpdate, true);
    };
  }, [activeDropdown, positionLedgerDropdown]);

  useEffect(() => {
    const controller = new AbortController();
    const referenceNumber = normalizeReferenceNumber(form.externalDocNo);

    if (
      !user?.company?._id ||
      !shouldCheckDuplicateReference ||
      !referenceNumber
    ) {
      setDuplicateReferenceWarning({ checking: false, match: null });
      return () => controller.abort();
    }

    const checkDuplicateReference = async () => {
      try {
        setDuplicateReferenceWarning((prev) => ({ ...prev, checking: true }));

        let page = 1;
        let totalPages = 1;
        let duplicateMatch = null;

        while (page <= totalPages && !duplicateMatch) {
          for (const duplicateVoucherType of DUPLICATE_REFERENCE_VOUCHER_TYPES) {
            const response = await allJournalApi(
              user.company._id,
              {
                page,
                limit: 200,
                voucherType: duplicateVoucherType,
              },
              controller.signal,
            );

            const journals = response?.data || [];
            totalPages = Math.max(
              totalPages,
              response?.pagination?.totalPages || 1,
            );

            duplicateMatch = journals.find((journal) => {
              if (!journal?.externalDocNo) return false;
              if (journal._id === editingJournal?._id) return false;

              return (
                normalizeReferenceNumber(journal.externalDocNo) ===
                referenceNumber
              );
            });

            if (duplicateMatch) break;
          }

          page += 1;
        }

        if (!controller.signal.aborted) {
          setDuplicateReferenceWarning({
            checking: false,
            match: duplicateMatch || null,
          });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error checking duplicate document reference:", error);
        setDuplicateReferenceWarning({ checking: false, match: null });
      }
    };

    const timeoutId = window.setTimeout(checkDuplicateReference, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    editingJournal?._id,
    form.externalDocNo,
    normalizeReferenceNumber,
    shouldCheckDuplicateReference,
    user?.company?._id,
  ]);

  const handleSave = async () => {
    if (!validateJournal()) return;

    try {
      setSaving(true);

      const journalData = {
        voucherType,
        companyId: user?.company?._id,
        date: new Date(form.date),
        narration: form.narration.trim(),
        posted: false,
        sourceType: "MANUAL",
        sourceId: null,
        referenceNumber: selectedInvoice?.invoiceNo || null,
        partyType: selectedInvoice ? "Client" : null,
        partyId: selectedInvoice?.billTo?._id || null,
        partyName: selectedInvoice?.billTo?.name || null,
        externalDocNo: form.externalDocNo || null,
        createdBy: user?._id || user?.id,
        lines: form.lines.map(({ id, ...line }) => ({
          accountId: line.accountId,
          debit: parseFloat(line.debit) || 0,
          credit: parseFloat(line.credit) || 0,
        })),
      };

      if (editingJournal && isEditMode) {
        if (isAdmin) {
          await updateJournalApi(
            user?.company?._id,
            editingJournal._id,
            {
              ...journalData,
              updatedBy: user?._id || user?.id,
            },
          );
          toast.success("Journal updated successfully!");
        } else {
          await ApprovalManager.addEditApproval(
            user?.company?._id,
            editingJournal,
            {
              ...journalData,
              updatedBy: user?._id || user?.id,
              requestComment: requestComment.trim(),
            },
          );
          toast.success("Journal update request sent for admin approval.");
        }

        navigate("/accounting/journals/list");
      } else {
        await addJournalApi(journalData, user?.company?._id);
        toast.success("Journal entry saved successfully!");
        navigate("/accounting/journals");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error(
        error?.response?.data?.message || "Error saving journal entry",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({
      date: new Date().toISOString().split("T")[0],
      narration: "",
      externalDocNo: "",
      lines: [
        { id: 1, accountId: "", debit: "", credit: "" },
        { id: 2, accountId: "", debit: "", credit: "" },
      ],
    });
    setSelectedInvoice(null);
    setEditingJournal(null);
    setVoucherType("");
    setRequestComment("");
    setDuplicateReferenceWarning({ checking: false, match: null });
  };

  // Get account group name
  const getAccountGroup = (accountId) => {
    const account = accounts.find((a) => a._id === accountId);
    return account?.groupName || "";
  };

  // Search invoices
  const searchInvoices = async () => {
    if (!invoiceSearch.query.trim()) {
      toast.warning("Please enter an invoice number");
      return;
    }

    try {
      setInvoiceSearch((prev) => ({ ...prev, loading: true, results: [] }));
      const response = await searchInvoiceByNumberApi(invoiceSearch.query);

      if (response.success && response.data) {
        setInvoiceSearch((prev) => ({
          ...prev,
          results: Array.isArray(response.data)
            ? response.data
            : [response.data],
        }));

        if (!response.data.length && !Array.isArray(response.data)) {
          toast.info("Invoice found!");
        }
      } else {
        toast.warning("No invoices found");
      }
    } catch (error) {
      console.error("Error searching invoices:", error);
      toast.error("Error searching invoices");
    } finally {
      setInvoiceSearch((prev) => ({ ...prev, loading: false }));
    }
  };

  // Auto-fill journal from invoice
  const autoFillFromInvoice = async (invoice) => {
    try {
      setSelectedInvoice(invoice);

      // Calculate amounts
      const totalTax =
        (invoice.totalCGSTAmount || 0) +
        (invoice.totalSGSTAmount || 0) +
        (invoice.totalIGSTAmount || 0);
      const taxableValue =
        invoice.totalTaxableValue || invoice.amountDue - totalTax;
      const receivableAmount = invoice.amountDue || 0;

      // Find required accounts
      const salesAccount = accounts.find(
        (acc) =>
          acc.type === "revenueAccount" &&
          (acc.groupName?.includes("Income") || acc.name?.includes("Sales")),
      );
      const taxAccount = accounts.find(
        (acc) =>
          acc.groupName?.includes("Tax") ||
          acc.groupName?.includes("Current Liabilities") ||
          acc.name?.includes("Tax"),
      );
      const receivableAccount = accounts.find(
        (acc) =>
          acc.groupName?.includes("Sundry Debtors") ||
          acc.name?.includes("Receivable"),
      );

      // Check for missing accounts
      const missingAccounts = [];
      if (!salesAccount) missingAccounts.push("Sales/Income Account");
      if (!taxAccount && totalTax > 0)
        missingAccounts.push("Tax Payable Account");
      if (!receivableAccount)
        missingAccounts.push("Accounts Receivable (Sundry Debtors)");

      if (missingAccounts.length > 0) {
        toast.error(
          `Missing accounts: ${missingAccounts.join(", ")}. Please create them first.`,
          { autoClose: 5000 },
        );
        return;
      }

      // Create journal lines
      const newLines = [];
      let lineId = Date.now();

      if (salesAccount) {
        newLines.push({
          id: lineId++,
          accountId: salesAccount._id,
          debit: "",
          credit: taxableValue.toFixed(2),
        });
      }

      if (taxAccount && totalTax > 0) {
        newLines.push({
          id: lineId++,
          accountId: taxAccount._id,
          debit: "",
          credit: totalTax.toFixed(2),
        });
      }

      if (receivableAccount) {
        newLines.push({
          id: lineId++,
          accountId: receivableAccount._id,
          debit: receivableAmount.toFixed(2),
          credit: "",
        });
      }

      // Update form
      setForm((prev) => ({
        ...prev,
        date: new Date(invoice.invoiceDate).toISOString().split("T")[0],
        narration: `Invoice ${invoice.invoiceNo} - ${invoice.billTo?.name || "Client"}`,
        lines: newLines,
      }));

      toast.success("Journal auto-filled from invoice!");
      setInvoiceSearch({ query: "", results: [], loading: false });
    } catch (error) {
      console.error("Error auto-filling from invoice:", error);
      toast.error(
        error?.response?.data?.message ||
          "Failed to auto-fill journal from invoice",
      );
    }
  };

  // Handle account selection
  const handleAccountSelection = async (id, accountId) => {
    updateLine(id, "accountId", accountId);

    // Check if selected account is invoice-linked
    const selectedAccount = accounts.find((acc) => acc._id === accountId);
    if (selectedAccount?.linkedInvoiceId || selectedAccount?.invoiceData) {
      try {
        let invoice;
        if (selectedAccount.linkedInvoiceId) {
          const response = await getInvoiceByIdApi(
            selectedAccount.linkedInvoiceId,
          );
          invoice = response.data;
        } else if (selectedAccount.invoiceData?.invoiceNo) {
          const response = await searchInvoiceByNumberApi(
            selectedAccount.invoiceData.invoiceNo,
          );
          invoice = response.data;
        }

        if (invoice) {
          autoFillFromInvoice(invoice);
        }
      } catch (error) {
        console.error("Error fetching invoice for ledger:", error);
      }
    }
  };

  // Handle ledger created from invoice
  const handleLedgerCreated = (newLedger) => {
    setAccounts((prev) => [...prev, newLedger]);
    toast.success(`Ledger "${newLedger.name}" created successfully!`);
  };

  if (loading) {
    return <LoadingComponent message="Loading accounts..." />;
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50">
        {/* ══ STICKY HEADER ══════════════════════════════════ */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-screen-xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Left — icon + title */}
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-xl shadow-md"
                  style={{
                    background: "linear-gradient(135deg,#1e40af,#3b82f6)",
                  }}
                >
                  <BookMarked size={18} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                      {editingJournal
                        ? `Editing: ${editingJournal.number}`
                        : "Manual Journal Entry"}
                    </h1>
                    {editingJournal && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-100">
                        <Edit2 size={10} /> Edit Mode
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {user?.company?.name || "Your Company"} ·{" "}
                    {editingJournal
                      ? "Edit double-entry journal voucher"
                      : "Create double-entry journal vouchers"}
                  </p>
                </div>
              </div>

              {/* Right — actions */}
              <div className="flex items-center gap-2">
                {/* Audit Trail */}
                <button
                  onClick={() => setOpenLogs(true)}
                  title="Audit Trail"
                  className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all"
                >
                  <History size={15} />
                </button>

                {canCreateJournal && (
                  <button
                    onClick={() => navigate("/accounting/journals/upload-excel")}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold flex items-center shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <FiUploadCloud size={18} />
                    Upload via Excel
                  </button>
                )}

                {/* Add Ledger */}
                {canCreateLedger && (
                  <button
                    onClick={() => setOpenManageLedger(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all"
                  >
                    <Plus size={13} /> Add Ledger
                  </button>
                )}

                {/* Create Ledger from Invoice */}
                {canCreateLedger && (
                  <button
                    onClick={() =>
                      setOpenModal((prev) => ({ ...prev, createLedger: true }))
                    }
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    <FileText size={13} /> Invoice → Ledger
                  </button>
                )}

                {/* Journal List */}
                {canViewJournal && (
                  <button
                    onClick={() => navigate("/accounting/journals")}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    <FileText size={13} /> Journal List
                  </button>
                )}

                {/* Approvals */}
                {isAdmin && canEditJournal && (
                  <button
                    onClick={() => setShowApprovals(true)}
                    className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-all"
                  >
                    <Clock size={13} /> Approvals
                    {pendingApprovalsCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                        {pendingApprovalsCount}
                      </span>
                    )}
                  </button>
                )}


                {/* Reset / Cancel */}
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  <X size={13} />
                  {editingJournal ? "Cancel" : "Reset"}
                </button>

                {/* Save / Update — primary CTA */}
                {((!editingJournal && canCreateJournal) ||
                  (editingJournal && canEditJournal)) && (
                  <button
                    onClick={handleSave}
                    disabled={saving || !isBalanced || !isVoucherSelected}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "linear-gradient(135deg,#1e40af,#3b82f6)",
                      boxShadow: "0 4px 14px rgba(59,130,246,0.35)",
                    }}
                  >
                    {saving ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    {saving
                      ? "Saving…"
                      : editingJournal
                        ? isAdmin
                          ? "Update Journal"
                          : "Request Approval"
                        : "Save Journal"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* ══ END HEADER ══ */}

        <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-4">
          {/* ── Voucher Type ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <label className={labelCls}>
              Voucher Type <span className="text-red-400">*</span>
            </label>
            <div className="max-w-xs">
              <select
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}
                disabled={!!editingJournal}
                className={inputCls}
              >
                <option value="">Select Voucher Type</option>
                <option value="SALES">Sales Voucher</option>
                <option value="PURCHASE">Purchase Voucher</option>
                <option value="PAYMENT">Payment Voucher</option>
                <option value="RECEIPT">Receipt Voucher</option>
                <option value="CONTRA">Contra Voucher</option>
                <option value="JOURNAL">Journal Voucher</option>
              </select>
            </div>
            {!isVoucherSelected && (
              <p className="mt-2 text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <AlertCircle size={11} /> Select a voucher type to enable
                journal entry
              </p>
            )}
            {editingJournal && (
              <p className="mt-2 text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <AlertCircle size={11} /> Voucher type cannot be changed while
                editing
              </p>
            )}
          </div>

          {/* ── Invoice Auto‑fill Section ──────────────────── */}
          <div
            className={`bg-blue-50/40 rounded-2xl border border-blue-100 p-5 transition-all ${!isVoucherSelected ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Search size={12} className="text-blue-600" />
              <h3 className="text-xs font-black text-blue-800 uppercase tracking-wider">
                Auto‑fill Journal from Invoice
              </h3>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={invoiceSearch.query}
                  onChange={(e) =>
                    setInvoiceSearch((prev) => ({
                      ...prev,
                      query: e.target.value,
                    }))
                  }
                  placeholder="Enter invoice number to auto‑fill journal..."
                  className={inputCls}
                  onKeyPress={(e) => e.key === "Enter" && searchInvoices()}
                  disabled={editingJournal}
                />
              </div>
              <button
                onClick={searchInvoices}
                disabled={invoiceSearch.loading || editingJournal}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {invoiceSearch.loading ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Search results */}
            {invoiceSearch.results.length > 0 && !editingJournal && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">
                  Select an invoice:
                </p>
                {invoiceSearch.results.map((invoice) => (
                  <div
                    key={invoice._id}
                    onClick={() => autoFillFromInvoice(invoice)}
                    className="p-3 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 cursor-pointer transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {invoice.invoiceNo}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {invoice.billTo?.name} •{" "}
                          {new Date(invoice.invoiceDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-800">
                          ₹{invoice.amountDue?.toFixed(2)}
                        </p>
                        <p className="text-[9px] text-slate-400">Amount Due</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected invoice badge */}
            {selectedInvoice && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-emerald-800">
                    {editingJournal ? "Linked to" : "Auto‑filled from"}:{" "}
                    <span className="font-black">
                      {selectedInvoice.invoiceNo}
                    </span>
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    {selectedInvoice.billTo?.name} • ₹
                    {selectedInvoice.amountDue?.toFixed(2)}
                  </p>
                </div>
                {!editingJournal && (
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Journal Form ─────────────────────────────── */}
          <div
            className={`transition-all ${!isVoucherSelected ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Header fields */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/40">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>
                      Journal Date <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) =>
                          handleFormChange("date", e.target.value)
                        }
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Company</label>
                    <input
                      type="text"
                      value={user?.company?.name || ""}
                      disabled
                      className={`${inputCls} opacity-60 cursor-not-allowed`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Document / Reference No.</label>
                    <input
                      type="text"
                      value={form.externalDocNo || ""}
                      onChange={(e) =>
                        handleFormChange("externalDocNo", e.target.value)
                      }
                      placeholder="Cheque no / Ref doc / Voucher ref"
                      className={inputCls}
                    />
                    {shouldCheckDuplicateReference &&
                      duplicateReferenceWarning.checking &&
                      form.externalDocNo?.trim() && (
                        <p className="mt-2 text-[11px] font-medium text-slate-500">
                          Checking duplicate reference number...
                        </p>
                      )}
                    {shouldCheckDuplicateReference &&
                      duplicateReferenceWarning.match && (
                        <p className="mt-2 text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                          <AlertCircle size={11} />
                          This number is already used in journal number "
                          {duplicateReferenceWarning.match.number}" for{" "}
                          {duplicateReferenceWarning.match.voucherType}.
                        </p>
                      )}
                  </div>
                </div>
                <div className="mt-4">
                  <label
                    className={`${labelCls} after:content-['*'] after:ml-1 after:text-red-500`}
                  >
                    <FileText size={10} className="inline mr-1" />
                    Narration / Description
                  </label>
                  <textarea
                    value={form.narration}
                    onChange={(e) =>
                      handleFormChange("narration", e.target.value)
                    }
                    rows={2}
                    required
                    placeholder="Enter narration or description for this journal entry…"
                    className={`${inputCls} resize-none`}
                  />
                </div>
                {isEditMode && editingJournal && !isAdmin && (
                  <div className="mt-4">
                    <label
                      className={`${labelCls} after:content-['*'] after:ml-1 after:text-red-500`}
                    >
                      Why Update Approval Is Needed
                    </label>
                    <textarea
                      value={requestComment}
                      onChange={(e) => setRequestComment(e.target.value)}
                      rows={3}
                      placeholder="Explain why this journal needs to be updated so the admin can review it."
                      className={`${inputCls} resize-none`}
                    />
                    <p className="mt-2 text-[11px] text-slate-500">
                      Admin will receive this reason and the changed fields in the approval notification.
                    </p>
                  </div>
                )}
              </div>

              {/* Entries table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className="border-b border-slate-100"
                      style={{
                        background: "linear-gradient(90deg,#f8fafc,#eff6ff)",
                      }}
                    >
                      <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-12">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Account Ledger <span className="text-red-400">*</span>
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">
                        Group
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">
                        Debit (₹)
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">
                        Credit (₹)
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">
                        Del
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-50">
                    {form.lines.map((entry, index) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-slate-50/60 transition-colors"
                        style={{
                          position: "relative",
                          zIndex: activeDropdown === entry.id ? 100 : "auto",
                        }}
                      >
                        <td className="px-4 py-3 text-xs font-black text-slate-400">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 relative z-10">
                          <div
                            className="relative"
                            style={{ minHeight: "40px" }}
                          >
                            <div className="relative" data-dropdown>
                              <input
                                ref={(el) => {
                                  if (el)
                                    ledgerInputRefs.current[entry.id] = el;
                                  else delete ledgerInputRefs.current[entry.id];
                                }}
                                type="text"
                                value={
                                  activeDropdown === entry.id
                                    ? accountSearch
                                    : entry.accountId
                                      ? accounts.find(
                                          (a) => a._id === entry.accountId,
                                        )?.name || ""
                                      : ""
                                }
                                onFocus={() => {
                                  setAccountSearch("");
                                  openLedgerDropdown(entry.id);
                                }}
                                onChange={(e) => {
                                  setAccountSearch(e.target.value);
                                  openLedgerDropdown(entry.id);
                                }}
                                placeholder="Search account..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              />

                              {activeDropdown === entry.id && (
                                <div
                                  data-dropdown
                                  className="fixed bg-white border border-gray-300 rounded-md shadow-xl overflow-y-auto"
                                  style={{
                                    zIndex: 9999,
                                    top: `${dropdownPosition.top}px`,
                                    left: `${dropdownPosition.left}px`,
                                    width: `${dropdownPosition.width}px`,
                                    maxHeight: `${dropdownPosition.maxHeight}px`,
                                  }}
                                >
                                  {getFilteredAccounts().length > 0 ? (
                                    getFilteredAccounts().map((acc) => (
                                      <div
                                        key={acc._id}
                                        onClick={() => {
                                          handleAccountSelection(
                                            entry.id,
                                            acc._id,
                                          );
                                          setActiveDropdown(null);
                                          setAccountSearch("");
                                        }}
                                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                      >
                                        {acc.name}
                                        <span className="text-xs text-gray-500 ml-2">
                                          ({acc.groupName})
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-gray-500">
                                      No account found
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {entry.accountId && (
                            <span className="inline-flex px-2 py-1 text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg">
                              {getAccountGroup(entry.accountId)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={entry.debit}
                            onChange={(e) =>
                              updateLine(entry.id, "debit", e.target.value)
                            }
                            disabled={!!entry.credit}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-xs font-mono font-semibold text-right bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={entry.credit}
                            onChange={(e) =>
                              updateLine(entry.id, "credit", e.target.value)
                            }
                            disabled={!!entry.debit}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-xs font-mono font-semibold text-right bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeRow(entry.id)}
                            disabled={form.lines.length <= 2}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={3} className="px-4 py-3">
                        <button
                          onClick={addRow}
                          className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          <Plus size={13} /> Add Entry Line
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                          Total Debit
                        </p>
                        <p className="text-base font-black text-slate-800 font-mono">
                          {formatCurrency(totals.debit)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                          Total Credit
                        </p>
                        <p className="text-base font-black text-slate-800 font-mono">
                          {formatCurrency(totals.credit)}
                        </p>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance status */}
              {isBalanced ? (
                <div className="flex items-center gap-3 px-5 py-3.5 bg-emerald-50 border-t border-emerald-100">
                  <CheckCircle2
                    size={15}
                    className="text-emerald-500 shrink-0"
                  />
                  <div>
                    <p className="text-xs font-bold text-emerald-800">
                      Journal Entry Balanced ✓
                    </p>
                    <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                      Total Debit ({formatCurrency(totals.debit)}) = Total
                      Credit ({formatCurrency(totals.credit)})
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 px-5 py-3.5 bg-red-50 border-t border-red-100">
                  <AlertCircle
                    size={15}
                    className="text-red-500 shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="text-xs font-bold text-red-800">
                      Journal Entry Not Balanced
                    </p>
                    <p className="text-[11px] text-red-600 font-medium mt-0.5">
                      Difference:{" "}
                      <span className="font-black">
                        ₹{Math.abs(totals.debit - totals.credit).toFixed(2)}
                      </span>{" "}
                      —{" "}
                      {totals.debit > totals.credit
                        ? "Debit exceeds Credit"
                        : "Credit exceeds Debit"}
                    </p>
                  </div>
                </div>
              )}

              {/* Info note */}
              <div className="flex items-start gap-3 px-5 py-3.5 bg-blue-50/60 border-t border-blue-100">
                <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
                  Each entry line can be either debit or credit, not both.
                  Journal number will be auto-generated on save. Minimum 2
                  entries required.
                  {selectedInvoice && (
                    <span className="block mt-1 text-emerald-700 font-bold">
                      ✓ Journal{" "}
                      {editingJournal ? "linked to" : "auto-filled from"}{" "}
                      Invoice {selectedInvoice.invoiceNo}
                    </span>
                  )}
                  {editingJournal && (
                    <span className="block mt-1 text-amber-700 font-bold">
                      ⚠ Editing Journal {editingJournal.number} — changes will
                      update the existing entry.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals and Dialogs */}
      {showApprovals && (
        <AdminApprovalsDialog
          open={showApprovals}
          onClose={() => {
            setShowApprovals(false);
            ApprovalManager.syncRequests(user?.company?._id)
              .then((requests) =>
                setPendingApprovalsCount(
                  (requests || []).filter((r) => r.status === "pending").length,
                ),
              )
              .catch(() =>
                setPendingApprovalsCount(
                  ApprovalManager.getPendingCount(user?.company?._id),
                ),
              );
          }}
        />
      )}

      {openModel.createLedger && (
        <CreateLedgerFromInvoiceModal
          open={openModel.createLedger}
          onClose={() =>
            setOpenModal((prev) => ({ ...prev, createLedger: false }))
          }
          onSuccess={handleLedgerCreated}
        />
      )}
      {openManageLedger && (
        <ManageLedgerModal
          open={openManageLedger}
          onClose={() => setOpenManageLedger(false)}
          title="Create New Ledger"
          subtitle="Create ledger manually"
          updateAccount={(newLedger) => {
            setAccounts((prev) => [...prev, newLedger]);
          }}
        />
      )}

      <AuditLogSidebar
        isOpen={openLogs}
        onClose={() => setOpenLogs(false)}
        companyId={user?.company?._id}
        modules={["JOURNAL"]}
        title="Journal Audit Trail"
        subtitle="Tracking all journal activities"
      />

    </>
  );
}
