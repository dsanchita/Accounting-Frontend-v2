import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { allJournalApi } from "../apis/journalApi";
import { toast } from "react-toastify";
import dayjs from "dayjs";
import {
  Search,
  Filter,
  FileText,
  BookOpen,
  RefreshCw,
  X,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Hash,
  Tag,
  Calendar,
  CalendarDays,
  SlidersHorizontal,
  Clock,
  SortDesc,
  SortAsc,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─────────────────────────────────────────────
// Query function (pure, no state)
// ─────────────────────────────────────────────

const fetchAllJournals = async (companyId) => {
  const params = { limit: 1000, page: 1 };
  const res = await allJournalApi(companyId, params);

  if (!res.data) return [];

  return res.data.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

const SortIcon = ({ field, sort }) =>
  sort.key === field ? (
    sort.dir === "asc" ? (
      <ChevronUp size={11} className="text-blue-500" />
    ) : (
      <ChevronDown size={11} className="text-blue-500" />
    )
  ) : (
    <ChevronDown size={11} className="text-slate-300" />
  );

// ─────────────────────────────────────────────
// DayBooks Component
// ─────────────────────────────────────────────

const DayBooks = () => {
  const { user } = useAuth();
  const isAdminOrSuperAdmin = user?.role === "admin" || user?.role === "superAdmin";
  const companyId = user?.company?._id;

  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showJournalDetails, setShowJournalDetails] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [filters, setFilters] = useState({
    accountLedger: "",
    voucherType: "",
    fromDate: "",
    toDate: new Date().toISOString().split("T")[0],
    narration: "",
    referenceNumber: "",
  });

  // ─── TanStack Query ─────────────────────────

  const {
    data: journals = [],
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: ["daybooks", companyId],
    queryFn: () => fetchAllJournals(companyId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,       // ✅ 5 min cache — no refetch on revisit
    gcTime: 1000 * 60 * 10,         // ✅ Keep in memory 10 min
    refetchOnWindowFocus: false,     // ✅ Don't refetch on tab switch
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to load journals");
    },
  });

  // ─── Derived options from journals ──────────

  const accountOptions = useMemo(() => {
    const accounts = new Set();
    journals.forEach((journal) => {
      journal.lines?.forEach((line) => {
        if (line.account?.name) accounts.add(line.account.name);
      });
    });
    return Array.from(accounts).sort();
  }, [journals]);

  const voucherTypeOptions = useMemo(() => {
    const types = new Set();
    journals.forEach((journal) => {
      if (journal.voucherType) types.add(journal.voucherType);
    });
    return Array.from(types).sort();
  }, [journals]);

  // ─── Filtered & sorted journals (derived, no state) ──

  const filteredJournals = useMemo(() => {
    let result = [...journals];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((journal) => {
        if (journal.narration?.toLowerCase().includes(query)) return true;
        if (journal.referenceNumber?.toLowerCase().includes(query)) return true;
        if (journal.externalDocNo?.toLowerCase().includes(query)) return true;
        if (journal.voucherType?.toLowerCase().includes(query)) return true;
        if (journal.number?.toLowerCase().includes(query)) return true;
        if (journal.lines?.some((line) => line.account?.name?.toLowerCase().includes(query))) return true;
        return false;
      });
    }

    if (filters.accountLedger) {
      result = result.filter((journal) =>
        journal.lines?.some((line) =>
          line.account?.name?.toLowerCase().includes(filters.accountLedger.toLowerCase())
        )
      );
    }

    if (filters.voucherType) {
      result = result.filter(
        (journal) => journal.voucherType?.toLowerCase() === filters.voucherType.toLowerCase()
      );
    }

    if (filters.fromDate) {
      const fromDate = new Date(filters.fromDate);
      result = result.filter((journal) => new Date(journal.date) >= fromDate);
    }

    if (filters.toDate) {
      const toDate = new Date(filters.toDate);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((journal) => new Date(journal.date) <= toDate);
    }

    if (filters.narration) {
      result = result.filter((journal) =>
        journal.narration?.toLowerCase().includes(filters.narration.toLowerCase())
      );
    }

    if (filters.referenceNumber) {
      result = result.filter((journal) =>
        journal.referenceNumber?.toLowerCase().includes(filters.referenceNumber.toLowerCase()) ||
        journal.externalDocNo?.toLowerCase().includes(filters.referenceNumber.toLowerCase())
      );
    }

    const getSortValue = (journal) => {
      switch (sort.key) {
        case "date":
          return new Date(journal.date).getTime() || 0;
        case "particulars": {
          const firstLine = journal.lines?.[0];
          const accountName = firstLine?.account?.name || "Unknown Account";
          const prefix = firstLine?.credit > 0 ? "To " : "By ";
          return `${prefix}${accountName}`.toLowerCase();
        }
        case "voucherType":
          return (journal.voucherType || "").toLowerCase();
        case "voucher":
          return (journal.number ? journal.number.split("/").pop() : "").toLowerCase();
        default:
          return new Date(journal.createdAt).getTime() || 0;
      }
    };

    result.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      let comparison = 0;

      if (typeof av === "number" && typeof bv === "number") {
        comparison = av - bv;
      } else {
        comparison = String(av).localeCompare(String(bv), "en", {
          numeric: true,
          sensitivity: "base",
        });
      }

      return sort.dir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [journals, filters, searchQuery, sort]);

  // ─── Pagination (derived) ────────────────────

  const totalPages = Math.ceil(filteredJournals.length / itemsPerPage);

  const getPaginatedJournals = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredJournals.slice(startIndex, startIndex + itemsPerPage);
  };

  // ─── Handlers ───────────────────────────────

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setFilters({
      accountLedger: "",
      voucherType: "",
      fromDate: "",
      toDate: new Date().toISOString().split("T")[0],
      narration: "",
      referenceNumber: "",
    });
    setSearchQuery("");
    setSort({ key: "date", dir: "desc" });
    setCurrentPage(1);
    // Optionally force a fresh fetch by invalidating cache
    refetch();
  };

  const handleRowClick = (journal) => {
    setSelectedJournal(journal);
    setShowJournalDetails(true);
  };

  const closeJournalDetailsModal = () => {
    setShowJournalDetails(false);
    setSelectedJournal(null);
  };

  const toggleSortOrder = () => {
    setSort((prev) => {
      const isDateSort = prev.key === "date";
      const nextDir = isDateSort && prev.dir === "desc" ? "asc" : "desc";
      return { key: "date", dir: nextDir };
    });
    setCurrentPage(1);
  };

  const toggleSort = (field) => {
    setSort((prev) => {
      if (prev.key === field) {
        return { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key: field, dir: "asc" };
    });
    setCurrentPage(1);
  };

  // ─── Helper functions ────────────────────────

  const calculateTotalDebit = (journal) =>
    journal.lines?.reduce((sum, line) => sum + (line.debit || 0), 0) || 0;

  const calculateTotalCredit = (journal) =>
    journal.lines?.reduce((sum, line) => sum + (line.credit || 0), 0) || 0;

  const formatDate = (dateString) => dayjs(dateString).format("DD MMM YYYY");
  const formatTime = (dateString) => dayjs(dateString).format("hh:mm A");

  const getVoucherColor = (voucherType) => {
    switch (voucherType?.toLowerCase()) {
      case "payment":   return "bg-red-100 text-red-800 border-red-200";
      case "receipt":   return "bg-green-100 text-green-800 border-green-200";
      case "journal":   return "bg-blue-100 text-blue-800 border-blue-200";
      case "contra":    return "bg-purple-100 text-purple-800 border-purple-200";
      case "sales":     return "bg-amber-100 text-amber-800 border-amber-200";
      case "purchase":  return "bg-indigo-100 text-indigo-800 border-indigo-200";
      default:          return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getUpperAccountLedger = (journal) => {
    if (journal.lines && journal.lines.length > 0) {
      const firstLine = journal.lines[0];
      const accountName = firstLine.account?.name || "Unknown Account";
      const prefix = firstLine.credit > 0 ? "To " : "By ";
      return prefix + accountName;
    }
    return "No Account";
  };

  const getUpperAccountAmount = (journal) => {
    if (journal.lines && journal.lines.length > 0) {
      const firstLine = journal.lines[0];
      if (firstLine.debit > 0)  return { type: "debit",  amount: firstLine.debit };
      if (firstLine.credit > 0) return { type: "credit", amount: firstLine.credit };
    }
    return { type: "none", amount: 0 };
  };

  // ─── Pagination render ───────────────────────

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage   = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-48 mt-6 pt-4">
        <div className="text-sm text-gray-900">
          Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
          {Math.min(currentPage * itemsPerPage, filteredJournals.length)} of{" "}
          {filteredJournals.length} entries
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </button>

          <div className="flex items-center space-x-1">
            {pageNumbers.map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`px-3 py-1.5 text-sm min-w-8 rounded-md ${
                  currentPage === pageNum
                    ? "bg-gray-800 text-white"
                    : "border border-gray-300 hover:bg-gray-50"
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </button>
        </div>

        <div className="flex items-center text-sm text-gray-600">
          <span className="mr-2">Rows per page:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="px-3 py-1.5 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
    );
  };

  // ─── Advanced Search Modal ───────────────────

  const renderAdvancedSearchModal = () => (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center"
      onClick={() => setShowAdvancedSearch(false)}
    >
      <div
        className="relative bg-gray-200 rounded-lg shadow-xl w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <SlidersHorizontal className="h-6 w-6 text-blue-600 mr-3" />
            <h3 className="text-xl font-semibold text-gray-900">Advanced Filters</h3>
          </div>
          <button
            onClick={() => setShowAdvancedSearch(false)}
            className="text-gray-400 hover:text-gray-500 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Voucher Type</label>
              <select
                value={filters.voucherType}
                onChange={(e) => handleFilterChange("voucherType", e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Voucher Types</option>
                <option value="SALES">Sales Voucher</option>
                <option value="PURCHASE">Purchase Voucher</option>
                <option value="PAYMENT">Payment Voucher</option>
                <option value="RECEIPT">Receipt Voucher</option>
                <option value="CONTRA">Contra Voucher</option>
                <option value="JOURNAL">Journal Voucher</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Ledger</label>
              <input
                type="text"
                value={filters.accountLedger}
                onChange={(e) => handleFilterChange("accountLedger", e.target.value)}
                list="accountOptions"
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Type account name..."
              />
              <datalist id="accountOptions">
                {accountOptions.map((account) => (
                  <option key={account} value={account} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Date (Journal Date)</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Date (Journal Date)</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Narration Contains</label>
              <input
                type="text"
                value={filters.narration}
                onChange={(e) => handleFilterChange("narration", e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search in narration..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reference Number</label>
              <input
                type="text"
                value={filters.referenceNumber}
                onChange={(e) => handleFilterChange("referenceNumber", e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter reference number..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <button
            onClick={resetFilters}
            className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset All Filters
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAdvancedSearch(false)}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setShowAdvancedSearch(false)}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Journal Details Modal ───────────────────

  const renderJournalDetailsModal = () => {
    if (!selectedJournal) return null;

    const totalDebit  = calculateTotalDebit(selectedJournal);
    const totalCredit = calculateTotalCredit(selectedJournal);

    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
        onClick={closeJournalDetailsModal}
      >
        <div
          className="relative bg-gray-200 rounded-lg shadow-xl w-full max-w-4xl mx-auto max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-gray-300 z-10 flex items-center justify-between p-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Journal Entry Details</h3>
              <div className="mt-1 text-xs text-gray-500 space-y-1">
                <div className="flex items-center">
                  <CalendarDays className="h-3 w-3 mr-1" />
                  <span>Journal Date: {formatDate(selectedJournal.date)}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>Created: {formatDate(selectedJournal.createdAt)} at {formatTime(selectedJournal.createdAt)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={closeJournalDetailsModal}
              className="text-gray-400 hover:text-gray-500 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4">
            <div className="mb-4">
              <div className="flex items-center justify-between bg-gray-100 p-4 rounded-lg">
                <div className="flex items-center">
                  <Tag className="h-4 w-4 text-blue-600 mr-2" />
                  <div>
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">Voucher Type</div>
                    <div className="flex items-center mt-2">
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getVoucherColor(selectedJournal.voucherType)}`}>
                        {selectedJournal.voucherType || "Journal"}
                      </span>
                      {selectedJournal.number && (
                        <div className="ml-6">
                          <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">Voucher No</div>
                          <div className="text-sm font-medium text-gray-900 mt-2">
                            {selectedJournal.number ? selectedJournal.number.split("/").pop() : "—"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {selectedJournal.partyName && (
                  <div className="text-right">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">Party</div>
                    <div className="text-sm font-medium text-gray-900 mt-0.5">{selectedJournal.partyName}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4 bg-gray-100 p-3 rounded-lg border border-gray-200">
              <div className="flex items-start mb-2">
                <FileText className="h-4 w-4 text-gray-500 mr-2 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Narration</h4>
                  <p className="text-gray-700 text-sm">
                    {selectedJournal.narration || "No Narration Provided"}
                  </p>
                </div>
              </div>
              {selectedJournal.referenceNumber && (
                <div className="flex items-center text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2">
                  <Hash className="h-3 w-3 mr-1.5" />
                  <span className="font-medium">Reference:</span>
                  <span className="ml-1">{selectedJournal.referenceNumber}</span>
                </div>
              )}
            </div>

            <div className="mb-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                <BookOpen className="h-4 w-4 mr-1.5 text-blue-600" />
                Journal Entry Details
              </h5>
              <div className="overflow-x-auto bg-gray-100 rounded border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Particulars</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Debit (₹)</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Credit (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-100 divide-y divide-gray-200">
                    {selectedJournal.lines?.map((line, index) => (
                      <tr key={line._id || index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center">
                            {line.credit > 0
                              ? <ArrowUpRight className="h-3 w-3 text-green-500 mr-2" />
                              : <ArrowDownRight className="h-3 w-3 text-red-500 mr-2" />
                            }
                            <div>
                              <div className="text-xs font-medium text-gray-900">
                                {line.credit > 0 ? "To " : "By "}
                                {line.account?.name || "Unknown Account"}
                              </div>
                              <div className="text-xs text-gray-500">{line.account?.group || "N/A"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right">
                          {line.debit > 0
                            ? <span className="text-xs font-semibold text-red-600">₹{line.debit.toLocaleString()}</span>
                            : <span className="text-xs text-gray-400">—</span>
                          }
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right">
                          {line.credit > 0
                            ? <span className="text-xs font-semibold text-green-600">₹{line.credit.toLocaleString()}</span>
                            : <span className="text-xs text-gray-400">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-semibold text-gray-900">Total</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-bold text-red-700">₹{totalDebit.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-bold text-green-700">₹{totalCredit.toLocaleString()}</span>
                      </td>
                    </tr>
                    <tr className="bg-gray-100">
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-semibold text-gray-900">Balance Status</span>
                      </td>
                      <td colSpan="2" className="px-4 py-2 text-right">
                        {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                          <span className="text-xs font-bold text-green-600 flex items-center justify-end">
                            <CheckCircle className="h-3 w-3 mr-1" /> Balanced
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-red-600 flex items-center justify-end">
                            <X className="h-3 w-3 mr-1" /> Not Balanced
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────

  return (
    <div className="min-h-screen">
      {showAdvancedSearch && renderAdvancedSearchModal()}
      {showJournalDetails && renderJournalDetailsModal()}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">

          {/* Title + actions row */}
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl shadow-md" style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Day Books</h1>
                <p className="text-[11px] text-slate-400 font-medium">All journal entries and transactions</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
               <button onClick={toggleSortOrder}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all">
                {sort.key === "date" && sort.dir === "desc"
                  ? <><SortDesc className="h-3.5 w-3.5" />Newest</>
                  : <><SortAsc className="h-3.5 w-3.5" />Oldest</>}
              </button>
              <button onClick={() => setShowAdvancedSearch(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all">
                <SlidersHorizontal className="h-3.5 w-3.5" />Filters
              </button>
              <button onClick={resetFilters}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all">
                <RefreshCw className="h-3.5 w-3.5" />Reset
              </button>
            </div>
          </div>

          {/* Stat card */}
          {isAdminOrSuperAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="relative overflow-hidden rounded-2xl p-5 shadow-xl group cursor-default"
                style={{ background: "linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)" }}>
                <div className="absolute -top-8 -right-8 w-40 h-28 rounded-full opacity-25 blur-2xl group-hover:scale-110 transition-transform duration-700"
                  style={{ background: "radial-gradient(ellipse,#93c5fd,transparent)" }} />
                <div className="absolute -bottom-5 -left-5 w-28 h-20 rounded-full opacity-20 blur-xl"
                  style={{ background: "radial-gradient(ellipse,#bfdbfe,transparent)" }} />
                <div className="absolute top-0 right-14 w-0.5 h-full bg-white/20 rotate-12 scale-y-150" />
                <div className="absolute top-3 right-3 w-12 h-12 rounded-full border-2 border-white/15" />
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mb-2">Total Entries</p>
                    <p className="text-4xl font-black text-white leading-none">{filteredJournals.length}</p>
                    <p className="text-blue-200/60 text-[11px] font-medium mt-2">Matching current filters</p>
                  </div>
                  <div className="p-3 bg-white/20 rounded-2xl border border-white/25 backdrop-blur-sm group-hover:scale-110 transition-transform shadow-lg">
                    <FileText size={22} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>

              <div className="relative overflow-hidden rounded-2xl p-5 shadow-xl group cursor-default"
                style={{ background: "linear-gradient(135deg,#064e3b 0%,#059669 55%,#34d399 100%)" }}>
                <div className="absolute -top-8 -right-8 w-40 h-28 rounded-full opacity-25 blur-2xl group-hover:scale-110 transition-transform duration-700"
                  style={{ background: "radial-gradient(ellipse,#6ee7b7,transparent)" }} />
                <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full border-4 border-white/10" />
                <div className="absolute top-0 left-16 w-0.5 h-full bg-white/15 -rotate-12 scale-y-150" />
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest mb-2">Total Journals</p>
                    <p className="text-4xl font-black text-white leading-none">{journals.length}</p>
                    <p className="text-emerald-200/60 text-[11px] font-medium mt-2">All loaded records</p>
                  </div>
                  <div className="p-3 bg-white/20 rounded-2xl border border-white/25 backdrop-blur-sm group-hover:scale-110 transition-transform shadow-lg">
                    <BookOpen size={22} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>

              <div className="relative overflow-hidden rounded-2xl p-5 shadow-xl group cursor-default"
                style={{ background: "linear-gradient(135deg,#78350f 0%,#d97706 55%,#fbbf24 100%)" }}>
                <div className="absolute -top-8 -right-8 w-40 h-28 rounded-full opacity-25 blur-2xl group-hover:scale-110 transition-transform duration-700"
                  style={{ background: "radial-gradient(ellipse,#fde68a,transparent)" }} />
                <div className="absolute top-3 right-3 w-14 h-14 rounded-full border-2 border-white/15" />
                <div className="absolute top-6 right-6 w-7 h-7 rounded-full border border-white/10" />
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-amber-200 text-[10px] font-black uppercase tracking-widest mb-2">Voucher Types</p>
                    <p className="text-4xl font-black text-white leading-none">{voucherTypeOptions.length}</p>
                    <p className="text-amber-200/60 text-[11px] font-medium mt-2">Distinct categories</p>
                  </div>
                  <div className="p-3 bg-white/20 rounded-2xl border border-white/25 backdrop-blur-sm group-hover:scale-110 transition-transform shadow-lg">
                    <Tag size={22} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </div>
          )}

          {/* Active Filter Badges */}
          {(searchQuery || Object.values(filters).some((val, index) => {
              const keys = Object.keys(filters);
              if (keys[index] === "toDate") return val && val !== new Date().toISOString().split("T")[0];
              return val;
            })) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3 w-3" /> Active:
              </span>
              {searchQuery && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">Search: {searchQuery}</span>
              )}
              {filters.voucherType && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">Voucher: {filters.voucherType}</span>
              )}
              {filters.accountLedger && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Account: {filters.accountLedger}</span>
              )}
              {filters.fromDate && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">From: {filters.fromDate}</span>
              )}
              {filters.toDate && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">To: {filters.toDate}</span>
              )}
              {filters.narration && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Narration: {filters.narration}</span>
              )}
              {filters.referenceNumber && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Ref: {filters.referenceNumber}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Quick Search and Date Range Filter */}
        <div className="mb-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by narration, document ref, journal ref, account, voucher type..."
              className="w-full pl-10 pr-9 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all font-medium placeholder-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Date Range Inputs beside search */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm shrink-0">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            
            {/* From Date */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">From</span>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                className="text-xs bg-transparent border-0 text-slate-700 font-medium focus:outline-none focus:ring-0 p-0 cursor-pointer"
                title="From Date"
              />
            </div>

            <span className="text-slate-300 font-bold text-xs">—</span>

            {/* To Date */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">To</span>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
                className="text-xs bg-transparent border-0 text-slate-700 font-medium focus:outline-none focus:ring-0 p-0 cursor-pointer"
                title="To Date"
              />
            </div>

            {/* Quick Clear Dates button if set */}
            {(filters.fromDate || (filters.toDate && filters.toDate !== new Date().toISOString().split("T")[0])) && (
              <button
                onClick={() => {
                  setFilters((prev) => ({
                    ...prev,
                    fromDate: "",
                    toDate: new Date().toISOString().split("T")[0],
                  }));
                  setCurrentPage(1);
                }}
                className="ml-1 p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                title="Reset Date Range"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Loading journal entries…</p>
            </div>
          ) : filteredJournals.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="p-4 bg-slate-100 rounded-2xl inline-block mb-3">
                <FileText className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-500 mb-1">No journal entries found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                {searchQuery || Object.values(filters).some(v => v)
                  ? "No entries match your search criteria. Try adjusting your filters."
                  : "No journal entries available. Start by creating your first journal entry."}
              </p>
              {(searchQuery || Object.values(filters).some(v => v)) && (
                <button onClick={resetFilters}
                  className="px-4 py-2 text-xs font-bold text-white rounded-xl transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}>
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* table bar */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
                  style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg,#1e3a8a,#60a5fa)" }} />
                  <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Journal Entries</p>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black text-white"
                      style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>{filteredJournals.length}</span>
                </div>
              </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead>
                      <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                        <th
                          onClick={() => toggleSort("date")}
                          className="px-6 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={sort.key === "date" ? "text-blue-600" : ""}>Date</span>
                            <SortIcon field="date" sort={sort} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleSort("particulars")}
                          className="px-6 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={sort.key === "particulars" ? "text-blue-600" : ""}>Particulars</span>
                            <SortIcon field="particulars" sort={sort} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleSort("voucherType")}
                          className="px-6 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={sort.key === "voucherType" ? "text-blue-600" : ""}>Voucher Type</span>
                            <SortIcon field="voucherType" sort={sort} />
                          </span>
                        </th>
                        <th
                          onClick={() => toggleSort("voucher")}
                          className="px-6 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={sort.key === "voucher" ? "text-blue-600" : ""}>Voucher No.</span>
                            <SortIcon field="voucher" sort={sort} />
                          </span>
                        </th>
                        <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {getPaginatedJournals().map((journal, index) => {
                        const upperAccount = getUpperAccountLedger(journal);
                        const amountInfo  = getUpperAccountAmount(journal);
                        const globalIndex = (currentPage - 1) * itemsPerPage + index;
                        const sequenceNo  = filteredJournals.length - globalIndex;

                        return (
                          <tr key={journal._id}
                            className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                            onClick={() => handleRowClick(journal)}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-xs font-medium text-slate-700">{formatDate(journal.date)}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{upperAccount}</div>
                              {journal.narration && (
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs italic">"{journal.narration}"</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2.5 py-1 text-[10px] font-black rounded-full border uppercase tracking-wider ${getVoucherColor(journal.voucherType)}`}>
                                {journal.voucherType || "Journal"}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-slate-600">
                              {journal.number ? journal.number.split("/").pop() : "—"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {amountInfo.type === "debit" ? (
                                <span className="text-xs font-black text-red-600">₹{amountInfo.amount.toLocaleString()} <span className="text-[9px] opacity-70">Dr</span></span>
                              ) : amountInfo.type === "credit" ? (
                                <span className="text-xs font-black text-emerald-600">₹{amountInfo.amount.toLocaleString()} <span className="text-[9px] opacity-70">Cr</span></span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-4 flex justify-center">
                {renderPagination()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DayBooks;
