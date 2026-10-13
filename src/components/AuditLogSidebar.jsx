import { useCallback, useEffect, useState } from "react";
import { getAuditLogsApi } from "../apis/auditLog.api";

const AuditLogSidebar = ({
  isOpen,
  onClose,
  companyId,
  modules = [],
  title,
  subtitle,
}) => {
  const [logs, setLogs] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [module, setModule] = useState(""); // Single module filter for home page
  const [isLoading, setIsLoading] = useState(false);
  const [expandedChanges, setExpandedChanges] = useState({});
  const [expandedLogChanges, setExpandedLogChanges] = useState({});

  // Determine if this is home page (no specific modules provided)
  const isHomePage = !modules || modules.length === 0;

  useEffect(() => {
    if (!isOpen) return;

    const today = new Date().toISOString().split("T")[0];

    setFromDate(today);
    setToDate(today);
    // Reset module filter when opening home page
    if (isHomePage) {
      setModule("");
    }
  }, [isHomePage, isOpen]);

  const handleDateNavigation = (direction) => {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    switch (direction) {
      case "prev":
        from.setDate(from.getDate() - 1);
        to.setDate(to.getDate() - 1);
        break;
      case "next":
        from.setDate(from.getDate() + 1);
        to.setDate(to.getDate() + 1);
        break;
      case "today": {
        const today = new Date();
        from.setTime(today.getTime());
        to.setTime(today.getTime());
        break;
      }
      default:
        return;
    }

    setFromDate(from.toISOString().split("T")[0]);
    setToDate(to.toISOString().split("T")[0]);
  };

  const setDatePreset = (preset) => {
    const today = new Date();
    const from = new Date();
    const to = new Date();

    switch (preset) {
      case "today":
        setFromDate(today.toISOString().split("T")[0]);
        setToDate(today.toISOString().split("T")[0]);
        break;
      case "yesterday":
        from.setDate(today.getDate() - 1);
        to.setDate(today.getDate() - 1);
        setFromDate(from.toISOString().split("T")[0]);
        setToDate(to.toISOString().split("T")[0]);
        break;
      case "last7days":
        from.setDate(today.getDate() - 6);
        setFromDate(from.toISOString().split("T")[0]);
        setToDate(today.toISOString().split("T")[0]);
        break;
      case "last30days":
        from.setDate(today.getDate() - 29);
        setFromDate(from.toISOString().split("T")[0]);
        setToDate(to.toISOString().split("T")[0]);
        break;
      default:
        break;
    }
  };

  const navigateDateRange = (direction) => {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    // Calculate the number of days in the current range
    const diffTime = Math.abs(to - from);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (direction === "prev") {
      from.setDate(from.getDate() - (diffDays + 1));
      to.setDate(to.getDate() - (diffDays + 1));
    } else if (direction === "next") {
      from.setDate(from.getDate() + (diffDays + 1));
      to.setDate(to.getDate() + (diffDays + 1));
    }

    setFromDate(from.toISOString().split("T")[0]);
    setToDate(to.toISOString().split("T")[0]);
  };

  const loadLogs = useCallback(async () => {
    if (!companyId) {
      console.error("Company ID is required");
      return;
    }

    setIsLoading(true);
    try {
      const params = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 100,
        ...(isHomePage && module ? { module } : {}), // Only add module param for home page with filter
      };

      // // console.log("Loading logs with params:", params);

      const res = await getAuditLogsApi(String(companyId), params);

      // // console.log("Logs received:", res.data?.length);
      setLogs(res.data || []);
    } catch (error) {
      console.error("Error loading audit logs:", error);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, fromDate, isHomePage, module, toDate]);

  useEffect(() => {
    if (!isOpen) return;
    if (!fromDate || !toDate) return;

    loadLogs();
  }, [fromDate, isOpen, loadLogs, toDate]);

  // Filter logs based on modules prop or module filter
  const filteredLogs =
    !isHomePage && Array.isArray(modules) && modules.length > 0
      ? logs.filter((log) => {
          const logMod = (log.module || "").toUpperCase();
          const logEntity = (log.entityType || "").toUpperCase();
          return modules.some((m) => {
            const target = (m || "").toUpperCase();
            return (
              logMod === target ||
              logEntity === target ||
              (target === "INVOICE" && (logEntity === "INVOICE" || logMod.includes("INVOICE"))) ||
              (target === "PURCHASE_ORDER" && (logEntity === "PURCHASEORDER" || logMod.includes("PURCHASE")))
            );
          });
        })
      : isHomePage && module
        ? logs.filter((log) => {
            const logMod = (log.module || "").toUpperCase();
            const logEntity = (log.entityType || "").toUpperCase();
            const target = module.toUpperCase();
            return logMod === target || logEntity === target;
          })
        : logs;

  // Helper function to format currency
  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return "0.00";
    return parseFloat(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Helper function to format time
  const formatTime = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const INTERNAL_FIELDS = new Set([
    "_id",
    "id",
    "__v",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "companyId",
    "entityId",
    "vendorId",
    "clientId",
    "userId",
    "ipAddress",
    "userAgent",
  ]);

  const BUSINESS_FIELD_LABELS = {
    poNumber: "PO Number",
    invoiceNo: "Invoice No.",
    number: "Number",
    poDate: "PO Date",
    invoiceDate: "Invoice Date",
    deliveryDate: "Delivery Date",
    dueDate: "Due Date",
    vendor: "Vendor",
    vendorName: "Vendor",
    client: "Client",
    clientName: "Client",
    totalAmount: "Total Amount",
    amountDue: "Amount Due",
    netPayable: "Net Payable",
    status: "Status",
    approvalStatus: "Approval Status",
    items: "Items",
    invoiceSchedule: "Invoice Schedule",
    linkedInvoices: "Linked Invoices",
    journalLines: "Journal Lines",
  };

  const parseMaybeJson = (value) => {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return value;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  };

  const isEmptyAuditValue = (value) => {
    const parsedValue = parseMaybeJson(value);
    return (
      parsedValue === null ||
      parsedValue === undefined ||
      parsedValue === "" ||
      (Array.isArray(parsedValue) && parsedValue.length === 0)
    );
  };

  const isInternalField = (field = "") => {
    if (!field) return true;
    const fieldParts = String(field).split(".");
    const lastPart = fieldParts[fieldParts.length - 1];
    return INTERNAL_FIELDS.has(field) || INTERNAL_FIELDS.has(lastPart);
  };

  const formatFieldLabel = (field = "Field") =>
    BUSINESS_FIELD_LABELS[field] ||
    String(field)
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/^./, (str) => str.toUpperCase());

  const getObjectDisplayValue = (value) => {
    if (!value || typeof value !== "object") return null;

    return (
      value.name ||
      value.vendorName ||
      value.clientName ||
      value.companyName ||
      value.accountName ||
      value.poNumber ||
      value.invoiceNo ||
      value.number ||
      value.description ||
      value.itemDescription ||
      value.serviceName ||
      null
    );
  };

  const formatAuditDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatAuditCurrency = (value) => {
    if (value === undefined || value === null || value === "") return "N/A";
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return String(value);
    return `₹${numericValue.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  };

  const shouldFormatAsDate = (field, value) => {
    if (!value || typeof value !== "string") return false;
    if (!/date/i.test(field)) return false;
    return !Number.isNaN(new Date(value).getTime());
  };

  const shouldFormatAsCurrency = (field) =>
    /amount|total|value|payable|rate|price|taxable/i.test(field);

  const getItemAmount = (item = {}) =>
    item.total ??
    item.amount ??
    item.totalAmount ??
    item.netAmount ??
    item.taxableValue ??
    item.rate ??
    item.price ??
    0;

  const getItemLabel = (item = {}, index) =>
    item.description ||
    item.itemDescription ||
    item.serviceName ||
    item.itemName ||
    item.name ||
    item.hsnDescription ||
    `Item ${index + 1}`;

  const simplifyAuditValue = (field, value) => {
    const parsedValue = parseMaybeJson(value);

    if (parsedValue === null || parsedValue === undefined || parsedValue === "") {
      return { kind: "empty", label: "N/A" };
    }

    if (Array.isArray(parsedValue)) {
      return {
        kind: "array",
        count: parsedValue.length,
        items: parsedValue.slice(0, 8).map((item, index) => ({
          label:
            typeof item === "object"
              ? getItemLabel(item, index)
              : String(item || `Item ${index + 1}`),
          amount:
            typeof item === "object" && shouldFormatAsCurrency(field)
              ? formatAuditCurrency(getItemAmount(item))
              : typeof item === "object" && field === "items"
                ? formatAuditCurrency(getItemAmount(item))
                : null,
        })),
      };
    }

    if (typeof parsedValue === "object") {
      const displayValue = getObjectDisplayValue(parsedValue);
      return { kind: "text", label: displayValue || "Updated object" };
    }

    if (typeof parsedValue === "boolean") {
      return { kind: "text", label: parsedValue ? "Yes" : "No" };
    }

    if (shouldFormatAsDate(field, parsedValue)) {
      return { kind: "text", label: formatAuditDate(parsedValue) };
    }

    if (typeof parsedValue === "number" && shouldFormatAsCurrency(field)) {
      return { kind: "text", label: formatAuditCurrency(parsedValue) };
    }

    return { kind: "text", label: String(parsedValue) };
  };

  const valuesAreSame = (oldValue, newValue) =>
    JSON.stringify(parseMaybeJson(oldValue)) === JSON.stringify(parseMaybeJson(newValue));

  const getChangeType = (change) => {
    const oldValue = parseMaybeJson(change.oldValue);
    const newValue = parseMaybeJson(change.newValue);
    const oldEmpty = isEmptyAuditValue(change.oldValue);
    const newEmpty = isEmptyAuditValue(change.newValue);

    if (oldEmpty && (!newEmpty || Array.isArray(newValue))) return "added";
    if (!oldEmpty && newEmpty) return "removed";
    if (Array.isArray(oldValue) || Array.isArray(newValue)) {
      return "array";
    }
    return "updated";
  };

  const getBusinessValue = (source, key) => {
    if (!source || typeof source !== "object") return undefined;
    if (source[key] !== undefined) return source[key];

    if (key === "vendor") return source.vendorName || source.vendor?.name || source.vendor?.vendorName;
    if (key === "client") return source.clientName || source.client?.name || source.client?.clientName;
    return undefined;
  };

  const getKeyInformation = (log) => {
    const source =
      log.actionCode === "DELETE"
        ? parseMaybeJson(log.oldValues)
        : parseMaybeJson(log.newValues);

    const fields = [
      "poNumber",
      "invoiceNo",
      "poDate",
      "invoiceDate",
      "deliveryDate",
      "dueDate",
      "vendor",
      "client",
      "totalAmount",
      "amountDue",
      "netPayable",
      "status",
      "approvalStatus",
    ];

    return fields
      .map((field) => {
        const value = getBusinessValue(source, field);
        if (value === undefined || value === null || value === "") return null;

        const formattedValue = simplifyAuditValue(field, value);
        return {
          label: formatFieldLabel(field),
          value: formattedValue.label,
        };
      })
      .filter(Boolean)
      .slice(0, 6);
  };

  const getFallbackChanges = (log) => {
    const source =
      log.actionCode === "DELETE"
        ? parseMaybeJson(log.oldValues)
        : parseMaybeJson(log.newValues);

    if (!source || typeof source !== "object") return [];

    return Object.entries(source)
      .filter(([field, value]) => !isInternalField(field) && !isEmptyAuditValue(value))
      .map(([field, value]) => ({
        field,
        oldValue: log.actionCode === "DELETE" ? value : undefined,
        newValue: log.actionCode === "DELETE" ? undefined : value,
      }));
  };

  const getAuditChanges = (log) => {
    const rawChanges = Array.isArray(log.changes)
      ? log.changes
      : Array.isArray(log.logs)
        ? log.logs
        : [];

    const changes = rawChanges.length > 0 ? rawChanges : getFallbackChanges(log);

    return changes
      .filter((change) => change && !isInternalField(change.field))
      .filter((change) => !valuesAreSame(change.oldValue, change.newValue))
      .map((change) => ({
        field: change.field,
        label: formatFieldLabel(change.field),
        type: getChangeType(change),
        old: simplifyAuditValue(change.field, change.oldValue),
        new: simplifyAuditValue(change.field, change.newValue),
      }));
  };

  const getActionMeta = (actionCode = "") => {
    if (/delete|removed/i.test(actionCode)) {
      return {
        iconClass: "bg-red-500",
        titleVerb: "Deleted",
        badgeClass: "bg-red-50 text-red-700 border-red-200",
      };
    }

    if (/create|added|import|bulk/i.test(actionCode)) {
      return {
        iconClass: "bg-green-500",
        titleVerb: "Created",
        badgeClass: "bg-green-50 text-green-700 border-green-200",
      };
    }

    return {
      iconClass: "bg-yellow-400",
      titleVerb: "Updated",
      badgeClass: "bg-yellow-50 text-yellow-800 border-yellow-200",
    };
  };

  const getEntityTitle = (log) => {
    const source =
      log.actionCode === "DELETE"
        ? parseMaybeJson(log.oldValues)
        : parseMaybeJson(log.newValues);

    return (
      source?.poNumber ||
      source?.invoiceNo ||
      source?.number ||
      source?.name ||
      source?.vendorName ||
      source?.clientName ||
      source?.accountName ||
      source?.companyName ||
      ""
    );
  };

  function formatAuditLog(log) {
    const actionMeta = getActionMeta(log.actionCode || log.action || "");
    const entityLabel = (log.entityType || log.module || "Activity")
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2");

    return {
      id: log.id || log._id || `${log.timestamp}-${log.description}`,
      title: log.description || `${actionMeta.titleVerb} ${entityLabel}`,
      entityTitle: getEntityTitle(log),
      user: log.performedBy?.name || "System",
      role: log.performedBy?.role || "Unknown",
      time: log.date && log.time ? `${log.date}, ${log.time}` : `${formatDate(log.timestamp || log.createdAt)}, ${formatTime(log.timestamp || log.createdAt)}`,
      status: log.status || "SUCCESS",
      actionCode: log.actionCode || log.action,
      actionMeta,
      keyInformation: getKeyInformation(log),
      changes: getAuditChanges(log),
    };
  }

  const renderAuditValue = (value, tone = "neutral") => {
    if (value.kind === "array") {
      return (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">
            {value.count} item{value.count === 1 ? "" : "s"}
          </div>
          {value.items.length > 0 && (
            <div className="space-y-1">
              {value.items.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-gray-700">{item.label}</span>
                  {item.amount && <span className="font-medium text-gray-900 whitespace-nowrap">{item.amount}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const toneClass =
      tone === "old"
        ? "text-red-700"
        : tone === "new"
          ? "text-green-700"
          : "text-gray-700";

    return <div className={`text-xs ${toneClass}`}>{value.label}</div>;
  };

  const renderStructuredAuditLog = (log) => {
    const auditLog = formatAuditLog(log);
    const visibleChanges = expandedLogChanges[auditLog.id]
      ? auditLog.changes
      : auditLog.changes.slice(0, 3);

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-3 w-3 rounded-full ${auditLog.actionMeta.iconClass}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{auditLog.title}</h3>
                  {auditLog.entityTitle && (
                    <p className="mt-1 text-sm font-semibold text-gray-700">{auditLog.entityTitle}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${auditLog.actionMeta.badgeClass}`}>
                  {auditLog.status}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-gray-600">
                <div>{auditLog.user} ({auditLog.role})</div>
                <div>{auditLog.time}</div>
              </div>
            </div>
          </div>
        </div>

        {auditLog.keyInformation.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">Key Information</h4>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {auditLog.keyInformation.map((item) => (
                <div key={item.label}>
                  <div className="text-[11px] font-medium text-gray-500">{item.label}</div>
                  <div className="mt-0.5 text-sm font-semibold text-gray-900">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Changes ({auditLog.changes.length})
            </h4>
            {auditLog.changes.length > 3 && (
              <button
                type="button"
                onClick={() =>
                  setExpandedLogChanges((prev) => ({
                    ...prev,
                    [auditLog.id]: !prev[auditLog.id],
                  }))
                }
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                {expandedLogChanges[auditLog.id] ? "View Less" : "View More"}
              </button>
            )}
          </div>

          {auditLog.changes.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No changed business fields available.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleChanges.map((change, index) => {
                const changeId = `${auditLog.id}-${change.field}-${index}`;
                const isExpanded = expandedChanges[changeId] ?? index < 3;
                const isArrayChange = change.old.kind === "array" || change.new.kind === "array";
                const oldEmpty = change.old.kind === "empty";
                const newEmpty = change.new.kind === "empty";

                return (
                  <div key={changeId} className="rounded-lg border border-gray-200 bg-white">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedChanges((prev) => ({
                          ...prev,
                          [changeId]: !isExpanded,
                        }))
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {isArrayChange ? `${change.label} Updated (${change.new.count || change.old.count} items)` : change.label}
                        </div>
                        {(change.type === "added" || change.type === "removed") && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {change.type === "added" ? `Added (${change.new.count ?? 0} items)` : "Removed"}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-500">{isExpanded ? "Collapse" : "Expand"}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3">
                        {isArrayChange && oldEmpty ? (
                          <div className="text-sm text-gray-600">
                            {change.label}: Added ({change.new.count ?? 0} items)
                          </div>
                        ) : isArrayChange && newEmpty ? (
                          <div className="text-sm text-gray-600">
                            {change.label}: Removed ({change.old.count ?? 0} items)
                          </div>
                        ) : isArrayChange ? (
                          renderAuditValue(change.new, "new")
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-md border border-red-100 bg-red-50 p-3">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-500">Old</div>
                              {renderAuditValue(change.old, "old")}
                            </div>
                            <div className="rounded-md border border-green-100 bg-green-50 p-3">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-green-600">New</div>
                              {renderAuditValue(change.new, "new")}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Get color for action type badge
  const getActionTypeColor = (actionType) => {
    const actionMap = {
      // Green for creation actions
      CREATE: "bg-green-100 text-green-800 border border-green-200",
      CLIENT_CREATED: "bg-green-100 text-green-800 border border-green-200",
      VENDOR_CREATED: "bg-green-100 text-green-800 border border-green-200",
      SALES_JOURNAL_CREATED:
        "bg-green-100 text-green-800 border border-green-200",
      ACCOUNT_CREATED: "bg-green-100 text-green-800 border border-green-200",
      PO_CREATED: "bg-green-100 text-green-800 border border-green-200",
      // New creation actions
      USER_REGISTERED: "bg-green-100 text-green-800 border border-green-200",
      COMPANY_CREATED: "bg-green-100 text-green-800 border border-green-200",
      EMPLOYEE_ADDED: "bg-green-100 text-green-800 border border-green-200",
      GROUP_CREATED: "bg-green-100 text-green-800 border border-green-200",
      HSN_CREATED: "bg-green-100 text-green-800 border border-green-200",

      // Yellow for update actions
      UPDATE: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      CLIENT_UPDATED: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      VENDOR_UPDATED: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      PO_UPDATED: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      // New update actions
      EMPLOYEE_UPDATED:
        "bg-yellow-100 text-yellow-800 border border-yellow-200",
      GROUP_UPDATED: "bg-yellow-100 text-yellow-800 border border-yellow-200",
      HSN_UPDATED: "bg-yellow-100 text-yellow-800 border border-yellow-200",

      // Red for delete/reversal actions
      DELETE: "bg-red-100 text-red-800 border border-red-200",
      PO_DELETED: "bg-red-100 text-red-800 border border-red-200",
      // New delete actions
      GROUP_DELETED: "bg-red-100 text-red-800 border border-red-200",
      HSN_DELETED: "bg-red-100 text-red-800 border border-red-200",

      // Blue for status/process actions
      SALES_JOURNAL_POSTED: "bg-blue-100 text-blue-800 border border-blue-200",
      // New auth actions
      USER_LOGIN: "bg-blue-100 text-blue-800 border border-blue-200",
      USER_LOGOUT: "bg-blue-100 text-blue-800 border border-blue-200",

      "PO_CREATED From Excal sheets":
        "bg-green-100 text-green-800 border border-green-200",
      BULK_CREATE: "bg-green-100 text-green-800 border border-green-200",

      PAYMENT_RECORDED_AND_JOURNAL_POSTED:
        "bg-blue-100 text-blue-800 border border-blue-200",
    };

    return (
      actionMap[actionType] ||
      "bg-gray-100 text-gray-800 border border-gray-200"
    );
  };

  // Get display text for action type
  const getActionDisplayText = (actionType) => {
    const displayMap = {
      CREATE: "Created",
      UPDATE: "Updated",
      DELETE: "Deleted",
      CLIENT_CREATED: "Client Created",
      CLIENT_UPDATED: "Client Updated",
      VENDOR_CREATED: "Vendor Created",
      VENDOR_UPDATED: "Vendor Updated",
      ACCOUNT_CREATED: "Account Created",
      SALES_JOURNAL_POSTED: "Sales Journal Posted",
      PO_CREATED: "PO Created",
      PO_UPDATED: "PO Updated",
      PO_DELETED: "PO Deleted",
      // New action display texts
      USER_REGISTERED: "User Registered",
      USER_LOGIN: "User Login",
      USER_LOGOUT: "User Logout",
      COMPANY_CREATED: "Company Created",
      EMPLOYEE_ADDED: "Employee Added",
      EMPLOYEE_UPDATED: "Employee Updated",
      GROUP_CREATED: "Group Created",
      GROUP_UPDATED: "Group Updated",
      GROUP_DELETED: "Group Deleted",
      HSN_CREATED: "HSN Created",
      HSN_UPDATED: "HSN Updated",
      HSN_DELETED: "HSN Deleted",
      PAYMENT_RECORDED_AND_JOURNAL_POSTED: "Payment Recorded & Journal Posted",
      "PO_CREATED From Excal sheets": "PO Created (Excel)",
      BULK_CREATE: "Invoice Create(Excel)",
    };

    return displayMap[actionType] || String(actionType || "Activity").replace(/_/g, " ");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Sidebar */}
      <div className="relative ml-auto w-[700px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Filters Section */}
          <div className=" border-b border-gray-200 bg-white px-6 py-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Activity Filters
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Filter system activities by date and module
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    <svg
                      className="w-3 h-3 mr-1.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Filters Active
                  </span>
                </div>
              </div>

              {/* Row 1: Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <div className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    Select Date Range
                  </div>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* FROM DATE */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-2">
                      From
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg
                          className="w-4 h-4 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                   hover:border-gray-400 transition-colors"
                      />
                    </div>
                  </div>

                  {/* TO DATE */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-2">
                      To
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg
                          className="w-4 h-4 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
                          />
                        </svg>
                      </div>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                   hover:border-gray-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Module Select + Navigation Buttons */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Module Select on Left - Only show for home page */}
                {isHomePage && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      <div className="flex items-center">
                        <svg
                          className="w-4 h-4 mr-2 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                          />
                        </svg>
                        Filter by Module
                      </div>
                    </label>
                    <div className="relative">
                      <select
                        value={module}
                        onChange={(e) => setModule(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors appearance-none bg-white"
                      >
                        <option value="">All Modules</option>
                        <option value="AUTH">Auth</option>
                        <option value="COMPANY">Company</option>
                        <option value="GROUP">Group</option>
                        <option value="HSN">HSN</option>
                        <option value="JOURNAL">Journal</option>
                        <option value="INVOICE">Invoice</option>
                        <option value="INVOICE_ACCOUNTING">
                          Invoice Accounting
                        </option>
                        <option value="PAYMENT">Payment</option>
                        <option value="CLIENT">Client</option>
                        <option value="VENDOR">Vendor</option>
                        <option value="ACCOUNT">Account</option>
                        <option value="PURCHASE_ORDER">Purchase Order</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg
                          className="w-5 h-5 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons on Right */}
                <div className={isHomePage ? "" : "col-span-2"}>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <div className="flex items-center">
                      <svg
                        className="w-4 h-4 mr-2 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        />
                      </svg>
                      Navigate Days
                    </div>
                  </label>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => navigateDateRange("prev")}
                      className="flex-1 flex items-center justify-center px-4 py-3 border border-blue-600 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 hover:border-blue-700 transition-colors shadow-sm"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      Previous Day
                    </button>
                    <button
                      onClick={() => navigateDateRange("next")}
                      className="flex-1 flex items-center justify-center px-4 py-3 border border-blue-600 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 hover:border-blue-700 transition-colors shadow-sm"
                    >
                      Next Day
                      <svg
                        className="w-4 h-4 ml-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 3: Action Buttons */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {fromDate && toDate && (
                      <div className="flex items-center">
                        <svg
                          className="w-4 h-4 mr-2 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="font-medium">Showing:</span>
                        <span className="ml-2 text-gray-800">
                          {formatDate(fromDate)}
                        </span>
                        <span className="mx-2 text-gray-400">→</span>
                        <span className="text-gray-800">
                          {formatDate(toDate)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        const today = new Date().toISOString().split("T")[0];
                        setFromDate(today);
                        setToDate(today);
                        if (isHomePage) {
                          setModule("");
                        }
                      }}
                      className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                    >
                      Clear Filters
                    </button>
                    <button
                      onClick={loadLogs}
                      disabled={isLoading}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                    >
                      {isLoading ? (
                        <div className="flex items-center">
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Loading...
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <svg
                            className="w-4 h-4 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                          Apply Filters
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Logs Content */}
          <div className=" p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <svg
                  className="animate-spin h-8 w-8 text-blue-600 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-gray-600">Loading activity logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg
                  className="w-16 h-16 text-gray-300 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No activity logs found
                </h3>
                <p className="text-gray-600 max-w-md">
                  {fromDate && toDate
                    ? `No activities recorded between ${formatDate(fromDate)} and ${formatDate(toDate)}`
                    : "No activities recorded for the selected filters"}
                </p>
                <button
                  onClick={loadLogs}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-blue-800">
                        {filteredLogs.length} activit
                        {filteredLogs.length === 1 ? "y" : "ies"} found
                      </div>
                      <div className="text-xs text-blue-600 mt-1">
                        {fromDate &&
                          toDate &&
                          `Showing activities from ${formatDate(fromDate)} to ${formatDate(toDate)}`}
                        {isHomePage &&
                          module &&
                          ` • Module: ${module.replace(/_/g, " ")}`}
                        {!isHomePage &&
                          modules.length > 0 &&
                          ` • Modules: ${modules.map((m) => m.replace(/_/g, " ")).join(", ")}`}
                      </div>
                    </div>
                    <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                      Sorted by latest
                    </div>
                  </div>
                </div>

                {/* Logs List */}
                <div className="space-y-4">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id || log._id}
                      className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="p-5">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getActionTypeColor(log.actionCode)}`}
                              >
                                {getActionDisplayText(log.actionCode)}
                              </span>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  log.module === "PAYMENT"
                                    ? "bg-teal-100 text-teal-800 border border-teal-200"
                                    : log.module === "AUTH"
                                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                                      : log.module === "COMPANY"
                                        ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                        : log.module === "GROUP"
                                          ? "bg-pink-100 text-pink-800 border border-pink-200"
                                          : log.module === "HSN"
                                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                                            : log.module === "JOURNAL"
                                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                                              : log.module === "INVOICE"
                                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                                : log.module ===
                                                    "INVOICE_ACCOUNTING"
                                                  ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                                  : log.module === "PAYMENT"
                                                    ? "bg-green-100 text-green-800 border border-green-200"
                                                    : log.module === "CLIENT"
                                                      ? "bg-orange-100 text-orange-800 border border-orange-200"
                                                      : log.module === "VENDOR"
                                                        ? "bg-red-100 text-red-800 border border-red-200"
                                                        : log.module ===
                                                            "ACCOUNT"
                                                          ? "bg-teal-100 text-teal-800 border border-teal-200"
                                                          : log.module ===
                                                              "PURCHASE_ORDER"
                                                            ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                                            : "bg-gray-100 text-gray-800 border border-gray-200"
                                }`}
                              >
                                {(log.module || "General").replace(/_/g, " ")}
                              </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-600">
                              <svg
                                className="w-4 h-4 mr-1.5 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                              </svg>
                              <span className="font-medium mr-2">By:</span>{" "}
                              {log.performedBy?.name || "System"}
                              {log.performedBy?.role && (
                                <span className="ml-1 text-gray-500">
                                  ({log.performedBy.role})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">
                              {log.time || formatTime(log.timestamp || log.createdAt)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {log.date || formatDate(log.timestamp || log.createdAt)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                          {renderStructuredAuditLog(log)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* End of logs message */}
                <div className="mt-8 text-center text-sm text-gray-500 border-t border-gray-200 pt-6">
                  <svg
                    className="w-5 h-5 inline-block mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  End of activity logs
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLogSidebar;
