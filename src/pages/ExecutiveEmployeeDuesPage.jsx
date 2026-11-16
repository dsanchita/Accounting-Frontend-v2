import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Wallet,
  TrendingUp,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Download,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Briefcase,
  Building2,
  Receipt,
  ArrowUpRight,
  ShieldCheck,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { getExecutiveEmployeeDuesApi } from "../apis/hrmsIntegrationApi";

const formatINR = (minorUnits, currency = "INR") => {
  const value = (minorUnits || 0) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

export default function ExecutiveEmployeeDuesPage() {
  const { user } = useAuth();
  const companyId = user?.company?._id;

  // Filter States
  const [datePreset, setDatePreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sourceType, setSourceType] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  // UI state for expandable employee cards
  const [expandedEmployees, setExpandedEmployees] = useState({});

  // Preset Date Handlers
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "this-month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (preset === "last-month") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (preset === "this-quarter") {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), currentQuarter * 3, 1);
      const last = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (preset === "this-fy") {
      // Indian FY: Apr 1 - Mar 31
      const isPastMarch = now.getMonth() >= 3;
      const startYear = isPastMarch ? now.getFullYear() : now.getFullYear() - 1;
      const endYear = startYear + 1;
      setStartDate(`${startYear}-04-01`);
      setEndDate(`${endYear}-03-31`);
    }
  };

  const fetchReport = useCallback(
    async (isManualRefresh = false) => {
      if (!companyId) return;
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const params = {
          companyId,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(sourceType !== "ALL" ? { sourceType } : {}),
          ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
          ...(departmentFilter !== "ALL" ? { department: departmentFilter } : {}),
          ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        };

        const res = await getExecutiveEmployeeDuesApi(params);
        if (res?.data?.success) {
          setReportData(res.data.data);
        } else {
          setError(res?.data?.message || "Failed to load executive dues report");
        }
      } catch (err) {
        console.error("Error fetching executive dues report:", err);
        setError(err?.response?.data?.message || err.message || "Failed to connect to accounting server");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [companyId, startDate, endDate, sourceType, statusFilter, departmentFilter, searchQuery]
  );

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const toggleEmployeeExpand = (empKey) => {
    setExpandedEmployees((prev) => ({
      ...prev,
      [empKey]: !prev[empKey],
    }));
  };

  const expandAll = () => {
    const allKeys = {};
    (reportData?.employees || []).forEach((e) => {
      const key = e.employeeId || e.employeeName;
      allKeys[key] = true;
    });
    setExpandedEmployees(allKeys);
  };

  const collapseAll = () => {
    setExpandedEmployees({});
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!reportData?.employees?.length) return;
    const headers = [
      "Employee Name",
      "Employee Code",
      "Department",
      "Designation",
      "Total Due (INR)",
      "Total Paid (INR)",
      "Pending Balance (INR)",
      "Payroll Due (INR)",
      "Payroll Paid (INR)",
      "Claims Due (INR)",
      "Claims Paid (INR)",
      "Claims Count",
      "Payroll Count",
    ];

    const rows = reportData.employees.map((e) => [
      `"${e.employeeName || ""}"`,
      `"${e.employeeCode || ""}"`,
      `"${e.employeeDepartment || ""}"`,
      `"${e.employeeDesignation || ""}"`,
      (e.totalDueMinorUnits / 100).toFixed(2),
      (e.totalPaidMinorUnits / 100).toFixed(2),
      (e.totalPendingMinorUnits / 100).toFixed(2),
      (e.payroll?.dueMinorUnits / 100).toFixed(2),
      (e.payroll?.paidMinorUnits / 100).toFixed(2),
      (e.claims?.dueMinorUnits / 100).toFixed(2),
      (e.claims?.paidMinorUnits / 100).toFixed(2),
      e.claims?.count || 0,
      e.payroll?.count || 0,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Employee_Dues_Report_${user?.company?.name || "Company"}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = reportData?.summary;
  const employees = reportData?.employees || [];
  const departments = reportData?.summary?.departments || [];

  const settlementProgress = useMemo(() => {
    if (!summary?.totalDueMinorUnits) return 0;
    return Math.min(100, Math.round((summary.totalPaidMinorUnits / summary.totalDueMinorUnits) * 100));
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Top Executive Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md shadow-blue-500/10 text-white">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
                  Employee Dues & Payments Overview
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  CEO / Executive View
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                Consolidated tracking of claims and payroll liability, payments disbursed, and outstanding employee balances.
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchReport(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm transition-all disabled:opacity-50"
            title="Refresh Report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!employees.length}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Date Selection Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-sm">
        {/* Presets and Date Controls */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" /> Date Preset:
            </span>
            {[
              { id: "all", label: "All Time" },
              { id: "this-month", label: "This Month" },
              { id: "last-month", label: "Last Month" },
              { id: "this-quarter", label: "This Quarter" },
              { id: "this-fy", label: "This FY" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  datePreset === p.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Picker Range Inputs */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700">
              <span className="text-slate-500 font-medium">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset("custom");
                }}
                className="bg-transparent text-slate-800 text-xs outline-none cursor-pointer font-medium"
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700">
              <span className="text-slate-500 font-medium">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset("custom");
                }}
                className="bg-transparent text-slate-800 text-xs outline-none cursor-pointer font-medium"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setDatePreset("all");
                }}
                className="text-xs text-slate-500 hover:text-rose-600 font-semibold px-2 py-1 transition-colors"
                title="Clear date range"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filters Bar: Search, Type, Status, Department */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:bg-white focus-within:border-blue-500 transition-all">
            <Receipt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-500 shrink-0">Type:</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-700 outline-none cursor-pointer font-medium"
            >
              <option value="ALL">All Types (Payroll & Claims)</option>
              <option value="PAYROLL">Payroll Only</option>
              <option value="CLAIM">Claims Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:bg-white focus-within:border-blue-500 transition-all">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-500 shrink-0">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-700 outline-none cursor-pointer font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Dues Only</option>
              <option value="SETTLED">Fully Paid Only</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:bg-white focus-within:border-blue-500 transition-all">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-500 shrink-0">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-700 outline-none cursor-pointer font-medium"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Accrued Due */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 relative overflow-hidden group hover:border-blue-300 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Accrued Dues
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-900 tabular-nums">
            {formatINR(summary?.totalDueMinorUnits)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>Payroll: {formatINR(summary?.payroll?.dueMinorUnits)}</span>
            <span>Claims: {formatINR(summary?.claims?.dueMinorUnits)}</span>
          </div>
        </div>

        {/* Card 2: Total Paid Disbursed */}
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-5 space-y-2 relative overflow-hidden group hover:border-emerald-300 transition-all shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Total Amount Paid
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-600 tabular-nums">
            {formatINR(summary?.totalPaidMinorUnits)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>Settlement Rate: {settlementProgress}%</span>
            <span className="text-emerald-700 font-semibold">Disbursed</span>
          </div>
        </div>

        {/* Card 3: Net Outstanding Balance */}
        <div className="bg-white border border-amber-200/80 rounded-2xl p-5 space-y-2 relative overflow-hidden group hover:border-amber-300 transition-all shadow-sm bg-gradient-to-br from-white to-amber-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              Net Pending Due
            </span>
            <div className="p-2 rounded-xl bg-amber-100/70 text-amber-700">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-700 tabular-nums">
            {formatINR(summary?.totalPendingMinorUnits)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>Payroll Pending: {formatINR(summary?.payroll?.pendingMinorUnits)}</span>
            <span>Claims: {formatINR(summary?.claims?.pendingMinorUnits)}</span>
          </div>
        </div>

        {/* Card 4: Employees Overview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 relative overflow-hidden group hover:border-indigo-300 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Employees Overview
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-900">
            {summary?.totalEmployees || 0} <span className="text-xs font-medium text-slate-500">Employees</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>Active records found</span>
            <span className="text-blue-600 font-semibold">
              {employees.filter((e) => e.totalPendingMinorUnits > 0).length} with pending dues
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar Widget */}
      {summary?.totalDueMinorUnits > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Disbursement Progress ({settlementProgress}% Settled)
              </div>
              <div className="text-[11px] text-slate-500">
                {formatINR(summary.totalPaidMinorUnits)} disbursed of {formatINR(summary.totalDueMinorUnits)} total liability
              </div>
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${settlementProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Employee List Section */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Table / List Header */}
        <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Employee Dues Breakdown
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                {employees.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click on any employee to expand individual approved claims and payroll runs.
            </p>
          </div>

          {employees.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading employee records...</p>
          </div>
        ) : employees.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800">No Employee Records Found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No payroll or claim payables matched your selected filter criteria. Try adjusting the date range or clear search filters.
            </p>
          </div>
        ) : (
          /* Employee Records List */
          <div className="divide-y divide-slate-100">
            {employees.map((emp) => {
              const empKey = emp.employeeId || emp.employeeName;
              const isExpanded = !!expandedEmployees[empKey];
              const isFullyPaid = emp.totalPendingMinorUnits === 0 && emp.totalDueMinorUnits > 0;
              const hasClaims = emp.claims?.count > 0;
              const hasPayroll = emp.payroll?.count > 0;

              return (
                <div key={empKey} className="transition-colors hover:bg-slate-50/70">
                  {/* Summary Row / Bar */}
                  <div
                    onClick={() => toggleEmployeeExpand(empKey)}
                    className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    {/* Left: Employee Identity */}
                    <div className="flex items-center gap-3.5 min-w-[240px]">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-100 to-indigo-100 border border-blue-200 flex items-center justify-center font-bold text-sm text-blue-700 shadow-sm">
                        {emp.employeeName?.charAt(0)?.toUpperCase() || "E"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {emp.employeeName}
                          </span>
                          {emp.employeeCode && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              #{emp.employeeCode}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          {emp.employeeDepartment && (
                            <span className="flex items-center gap-1 font-medium">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {emp.employeeDepartment}
                            </span>
                          )}
                          {emp.employeeDesignation && (
                            <>
                              <span>•</span>
                              <span>{emp.employeeDesignation}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Breakdown badges */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {hasPayroll && (
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold">
                          Payroll: {formatINR(emp.payroll?.dueMinorUnits)} ({emp.payroll?.count})
                        </span>
                      )}
                      {hasClaims && (
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold">
                          Claims: {formatINR(emp.claims?.dueMinorUnits)} ({emp.claims?.count})
                        </span>
                      )}
                    </div>

                    {/* Right: Amounts & Pending Status */}
                    <div className="flex items-center justify-between lg:justify-end gap-6">
                      <div className="text-right">
                        <div className="text-xs text-slate-500 font-medium">Total Accrued</div>
                        <div className="text-sm font-bold text-slate-900 tabular-nums">
                          {formatINR(emp.totalDueMinorUnits)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-500 font-medium">Total Paid</div>
                        <div className="text-sm font-bold text-emerald-600 tabular-nums">
                          {formatINR(emp.totalPaidMinorUnits)}
                        </div>
                      </div>

                      <div className="text-right min-w-[120px]">
                        <div className="text-xs text-slate-500 font-medium">Pending Balance</div>
                        <div
                          className={`text-sm font-black tabular-nums ${
                            emp.totalPendingMinorUnits > 0 ? "text-amber-700" : "text-emerald-700"
                          }`}
                        >
                          {formatINR(emp.totalPendingMinorUnits)}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {isFullyPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </div>

                      {/* Chevron Toggle */}
                      <div className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Itemized Breakdown */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-slate-50/70 border-t border-slate-200 p-4 md:p-6"
                      >
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                            <span>Itemized Records for {emp.employeeName}</span>
                            <span className="text-slate-500 text-[11px] font-medium">
                              Total items: {emp.items?.length || 0}
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-3">Type</th>
                                  <th className="px-4 py-3">Reference / ID</th>
                                  <th className="px-4 py-3">Description</th>
                                  <th className="px-4 py-3">Posting Date</th>
                                  <th className="px-4 py-3">Journal #</th>
                                  <th className="px-4 py-3 text-right">Accrued Due</th>
                                  <th className="px-4 py-3 text-right">Amount Paid</th>
                                  <th className="px-4 py-3 text-right">Remaining Due</th>
                                  <th className="px-4 py-3 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {(emp.items || []).map((item, idx) => {
                                  const isItemPaid = item.status === "SETTLED" || item.pendingAmountMinorUnits === 0;
                                  return (
                                    <tr
                                      key={item.payableId || idx}
                                      className="hover:bg-slate-50/70 transition-colors"
                                    >
                                      {/* Type Badge */}
                                      <td className="px-4 py-3 font-semibold">
                                        {item.sourceType === "CLAIM" ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                            Claim
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            Payroll
                                          </span>
                                        )}
                                      </td>

                                      {/* Reference ID */}
                                      <td className="px-4 py-3 font-mono text-slate-700 font-medium">
                                        {item.paymentId || item.sourceId}
                                      </td>

                                      {/* Description */}
                                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={item.narration}>
                                        {item.narration || (item.sourceType === "CLAIM" ? "Approved Claim" : "Payroll Accrual")}
                                      </td>

                                      {/* Posting Date */}
                                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                        {formatDate(item.postingDate)}
                                      </td>

                                      {/* Journal Voucher */}
                                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">
                                        {item.journalNumber || "—"}
                                      </td>

                                      {/* Accrued Due */}
                                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                        {formatINR(item.originalAmountMinorUnits)}
                                      </td>

                                      {/* Amount Paid */}
                                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                                        {formatINR(item.settledAmountMinorUnits)}
                                      </td>

                                      {/* Remaining Due */}
                                      <td className="px-4 py-3 text-right font-black text-amber-700 tabular-nums">
                                        {formatINR(item.pendingAmountMinorUnits)}
                                      </td>

                                      {/* Status */}
                                      <td className="px-4 py-3 text-center">
                                        {isItemPaid ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            Paid
                                          </span>
                                        ) : item.status === "PARTIAL" ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            Partial
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                            Pending
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
