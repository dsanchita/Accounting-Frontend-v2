import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Calendar, Package, CreditCard, FileText, User, Banknote, Percent, ChevronDown, ChevronUp, Receipt, Clock, Edit, Trash2, X } from "lucide-react";
import dayjs from "dayjs";
import InvoiceDetailModal from "../modals/InvoiceDetailsModal";
import { useNavigate } from "react-router-dom";
import { deleteInvoiceApi, pendingApprovalInvoiceApi, getInvoicesApi } from "../apis/invoice.api";

// Premium SideDialogBox (matching admin approval style)
const SideDialogBox = ({ open, onClose, title, subtitle, contents }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-4xl bg-[#f8fafc] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500 border-l border-white/20">
        {/* Premium Header */}
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl shadow-lg shrink-0"
                style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                <Receipt size={22} className="text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-900 tracking-tight leading-tight">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-slate-400 font-medium mt-1 truncate">{subtitle}</p>
                )}
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all group"
              aria-label="Close"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
          {/* Header Accent Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-transparent opacity-60" />
        </div>

        <div className="p-8 pb-20">
          {contents}
        </div>
      </div>
    </div>
  );
};

const LoadingComponent = ({ title }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-600 mb-4" />
    <p className="text-gray-600">{title}</p>
  </div>
);

const EmptyComponent = ({ title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <FileText className="h-16 w-16 text-gray-300 mb-4" />
    <h3 className="text-lg font-semibold text-gray-700 mb-2">{title}</h3>
    <p className="text-sm text-gray-500">{subtitle}</p>
  </div>
);

export default function UserPendingInvoices({ open, onClose, user }) {
  const [pendingItems, setPendingItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'pending' | 'rejected'
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();

    const fetchPending = async () => {
      try {
        if (!open || !user?.company?._id) return;
        setLoading(true);

        // Fetch both Pending and Rejected invoices so user can track and edit them
        const res = await getInvoicesApi(user.company._id, {
          approvalStatus: "Pending,Rejected",
          limit: 100,
          sort: "-createdAt",
        });

        if (res.data) {
          const mapped = (res.data.data || [])
            .map(invoice => {
              return {
                id: invoice._id,
                versionNo: invoice.versionNo,
                actionType: invoice.actionType || (invoice.versionNo === 1 ? "create" : "update"),
                snapshot: invoice,
                invoiceData: invoice,
                pendingCreatedAt: invoice.updatedAt,
                createdAt: invoice.createdAt
              };
            })
            .filter(Boolean);

          const sorted = mapped.sort((a, b) => {
            const timeA = new Date(a.pendingCreatedAt).getTime();
            const timeB = new Date(b.pendingCreatedAt).getTime();
            if (timeA && timeB) {
              return timeB - timeA;
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          setPendingItems(sorted);
        }
      } catch (error) {
        console.error("Error fetching pending invoices:", error);
        toast.error("Failed to load pending invoices");
      } finally {
        setLoading(false);
      }
    };

    fetchPending();
    return () => controller.abort();
  }, [open, user]);

  const handleEditPending = (item, e) => {
    e.stopPropagation();
    navigate(`/master-data/manual-invoice?editPending=${item.id}`, {
      state: {
        pendingVersion: {
          versionNo: item.versionNo,
          snapshot: item.snapshot,
        },
        invoiceData: item.invoiceData,
      },
    });
    onClose(); // close the pending invoices modal
  };

  const handleDeletePending = async (item, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this pending invoice?")) return;
    try {
      setLoading(true);
      await deleteInvoiceApi(item.id);
      toast.success("Pending invoice deleted");
      setPendingItems(prev => prev.filter(i => i.id !== item.id));
    } catch (error) {
      toast.error("Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleRowExpand = (invoiceId, e) => {
    e?.stopPropagation();
    setExpandedRows((prev) => ({
      ...prev,
      [invoiceId]: !prev[invoiceId],
    }));
  };

  const handleViewDetails = (invoiceId, e) => {
    e.stopPropagation();
    setSelectedInvoiceId(invoiceId);
    setDetailModalOpen(true);
  };

  // Formatting helpers
  const formatCurrency = (amount, currency = "₹") =>
    `${currency} ${(amount || 0).toFixed(2)}`;

  const formatDate = (date) =>
    date ? dayjs(date).format("DD-MMM-YYYY") : "-";

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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "border-emerald-200 text-emerald-700 bg-emerald-50";
      case "inprogress":
      case "pending":
        return "border-amber-200 text-amber-700 bg-amber-50";
      case "inactive":
      case "cancelled":
        return "border-red-200 text-red-700 bg-red-50";
      default:
        return "border-slate-200 text-slate-600 bg-slate-50";
    }
  };

  const getActionBadge = (actionType) => {
    switch (actionType?.toLowerCase()) {
      case 'create':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 uppercase tracking-wider">
            Create Request
          </span>
        );
      case 'update':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-blue-200 text-blue-700 bg-blue-50 uppercase tracking-wider">
            Update Request
          </span>
        );
      case 'delete':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-red-200 text-red-700 bg-red-50 uppercase tracking-wider">
            Delete Request
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-slate-200 text-slate-700 bg-slate-50 uppercase tracking-wider">
            Pending Request
          </span>
        );
    }
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return dayjs(date).format('DD-MMM-YYYY HH:mm');
    }
  };

  const renderContent = () => {
    if (loading) return <LoadingComponent title="Loading invoices..." />;
    
    const pendingCount = pendingItems.filter(i => (i.snapshot?.approvalStatus || "Pending") === "Pending").length;
    const rejectedCount = pendingItems.filter(i => i.snapshot?.approvalStatus === "Rejected").length;

    const displayedItems = pendingItems.filter(item => {
      const status = item.snapshot?.approvalStatus || "Pending";
      if (activeFilter === "pending") return status === "Pending";
      if (activeFilter === "rejected") return status === "Rejected";
      return true;
    });

    return (
      <div className="space-y-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              activeFilter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            All ({pendingItems.length})
          </button>
          <button
            onClick={() => setActiveFilter("pending")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              activeFilter === "pending"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setActiveFilter("rejected")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              activeFilter === "rejected"
                ? "bg-red-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>

        {!displayedItems.length ? (
          <EmptyComponent
            title={activeFilter === "rejected" ? "No rejected invoices" : "No invoices found"}
            subtitle={activeFilter === "rejected" ? "Rejected invoices will appear here with reviewer comments" : "Invoices waiting for action will appear here"}
          />
        ) : (
          <div className="space-y-3">
            {displayedItems.map((item) => {
              const invoice = item.snapshot;
              const isExpanded = expandedRows[item.id];

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-blue-200"
            >
              {/* Invoice Header */}
              <div
                onClick={(e) => toggleRowExpand(item.id, e)}
                className="px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex justify-between items-center gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border border-blue-100"
                      style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)" }}>
                      <Receipt size={17} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">{invoice.invoiceNo}</h3>
                        {getActionBadge(item.actionType)}
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black rounded-full border uppercase tracking-wider ${
                            invoice.approvalStatus === "Rejected"
                              ? "border-red-300 text-red-700 bg-red-100"
                              : getStatusColor(invoice.status)
                          }`}
                        >
                          {invoice.approvalStatus === "Rejected" ? "Rejected" : invoice.status}
                        </span>
                        {invoice.tdsAmount > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded-full border border-violet-200 text-violet-700 bg-violet-50 uppercase tracking-wider">
                            TDS: ₹{invoice.tdsAmount?.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} />
                          {formatDate(invoice.invoiceDate)}
                        </div>
                        <div className="flex items-center gap-1">
                          <User size={11} />
                          <span className="truncate max-w-[150px]">
                            {invoice.billTo?.name || "No client"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Package size={11} />
                          {getItemSummary(invoice.items)}
                        </div>
                        <div className="flex items-center gap-1 text-indigo-500 italic font-semibold">
                          <Clock size={11} />
                          {item.pendingCreatedAt ? formatTimeAgo(item.pendingCreatedAt) : 'Recently'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Amount Due</p>
                      <p className="text-base font-black text-slate-900 tabular-nums">
                        {formatCurrency(invoice.amountDue, invoice.currency)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => toggleRowExpand(item.id, e)}
                      className={`p-2 rounded-xl transition-all ${isExpanded ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} className="rotate-0" />
                      ) : (
                        <ChevronDown size={14} className="rotate-0" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="p-4 border-t">
                  {invoice.approvalStatus === "Rejected" && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                      <div className="p-1.5 bg-red-100 rounded-lg text-red-600 shrink-0">
                        <X size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-red-900">Invoice Rejected by Reviewer</h4>
                        <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                          <span className="font-semibold">Reason:</span>{" "}
                          {invoice.rejectionReason ||
                            invoice.approvalComments ||
                            invoice.rejectionHistory?.[invoice.rejectionHistory.length - 1]?.reason ||
                            "No reason specified"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    {/* Client Details */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-gray-700 flex items-center text-xs">
                        <User className="h-3 w-3 mr-1.5" />
                        Client Details
                      </h4>
                      <div className="space-y-1.5">
                        <div>
                          <p className="text-[10px] text-gray-500">Bill To</p>
                          <p className="font-medium text-xs truncate">{invoice.billTo?.name || "-"}</p>
                          <p className="text-[10px] text-gray-600 truncate">
                            {invoice.billTo?.address || "-"}
                          </p>
                          {invoice.billTo?.GSTIN && (
                            <p className="text-[10px] text-gray-500">GSTIN: {invoice.billTo.GSTIN}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Ship To</p>
                          <p className="font-medium text-xs truncate">{invoice.shipTo?.name || "-"}</p>
                          <p className="text-[10px] text-gray-600 truncate">
                            {invoice.shipTo?.address || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Financial Details */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-gray-700 flex items-center text-xs">
                        <CreditCard className="h-3 w-3 mr-1.5" />
                        Financial Details
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-gray-500">Taxable Value</p>
                          <p className="font-medium text-xs">
                            {invoice.currency || "₹"} {(invoice.totalTaxableValue || 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Total Tax</p>
                          <p className="font-medium text-xs">
                            {invoice.currency || "₹"} {calculateTotalTax(invoice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Payment Mode</p>
                          <p className="font-medium text-xs truncate">{invoice.paymentMode || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Due Date</p>
                          <p className="font-medium text-xs">{formatDate(invoice.dueDate)}</p>
                        </div>
                        {invoice.tdsAmount > 0 && (
                          <div className="col-span-2">
                            <div className="flex justify-between items-center p-1.5 bg-purple-50 rounded-md border border-purple-200">
                              <div className="flex items-center">
                                <Percent className="h-3 w-3 mr-1.5 text-purple-600" />
                                <span className="text-[10px] font-medium text-purple-700">TDS Amount</span>
                              </div>
                              <span className="font-bold text-xs text-purple-700">
                                {invoice.currency || "₹"} {(invoice.tdsAmount || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tax Breakdown */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-gray-700 flex items-center text-xs">
                        <Banknote className="h-3 w-3 mr-1.5" />
                        Tax Breakdown
                      </h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-gray-600">CGST</span>
                          <span className="font-medium text-xs">
                            {invoice.currency || "₹"} {(invoice.totalCGSTAmount || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] text-gray-600">SGST</span>
                          <span className="font-medium text-xs">
                            {invoice.currency || "₹"} {(invoice.totalSGSTAmount || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] text-gray-600">IGST</span>
                          <span className="font-medium text-xs">
                            {invoice.currency || "₹"} {(invoice.totalIGSTAmount || 0).toFixed(2)}
                          </span>
                        </div>
                        {invoice.tdsAmount > 0 && (
                          <div className="flex justify-between border-t border-dashed border-gray-300 pt-1.5">
                            <span className="text-[10px] text-purple-600 font-medium">TDS</span>
                            <span className="font-medium text-xs text-purple-600">
                              {invoice.currency || "₹"} {(invoice.tdsAmount || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="border-t pt-1.5">
                          <div className="flex justify-between font-semibold text-xs">
                            <span>Total Amount</span>
                            <span className="text-neutral-700">
                              {invoice.currency || "₹"} {(invoice.amountDue || 0).toFixed(2)}
                            </span>
                          </div>
                          {invoice.netPayable && invoice.netPayable !== invoice.amountDue && (
                            <div className="flex justify-between text-[10px] mt-1">
                              <span className="text-gray-500">Net Payable (after TDS):</span>
                              <span className="font-medium">
                                {invoice.currency || "₹"} {(invoice.netPayable || 0).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Person & Company Details */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                    <h4 className="font-semibold text-gray-700 mb-2 text-xs">Contact & Company Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-500">Contact Person</p>
                        <p className="font-medium text-xs">{invoice.billTo?.contactPerson || "N/A"}</p>
                        <p className="text-[10px] text-gray-600">{invoice.billTo?.contactNumber || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500">Email</p>
                        <p className="font-medium text-xs">{invoice.billTo?.email || "N/A"}</p>
                        <p className="text-[10px] text-gray-600">{invoice.billTo?.website || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500">Address</p>
                        <p className="font-medium text-xs">{invoice.billTo?.city || "N/A"}, {invoice.billTo?.state || "N/A"}</p>
                        <p className="text-[10px] text-gray-600">{invoice.billTo?.country || "N/A"} - {invoice.billTo?.pincode || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500">Payment Terms</p>
                        <p className="font-medium text-xs">{invoice.paymentTerms || "N/A"}</p>
                        <p className="text-[10px] text-gray-600">Remarks: {invoice.remarks || "N/A"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      onClick={(e) => handleEditPending(item, e)}
                      className="px-5 py-2 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-full hover:bg-blue-100 transition-all flex items-center gap-2"
                    >
                      <Edit size={14} />
                      Edit Request
                    </button>
                    <button
                      onClick={(e) => handleDeletePending(item, e)}
                      className="px-5 py-2 text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-full hover:bg-red-100 transition-all flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Delete Request
                    </button>
                    <button
                      onClick={(e) => handleViewDetails(item.id, e)}
                      className="px-5 py-2 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <FileText size={14} />
                      View Details
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);
};

  return (
    <>
      <SideDialogBox
        open={open}
        onClose={onClose}
        title="Pending & Rejected Invoices"
        subtitle="Manage pending approval requests and review rejected invoices"
        contents={renderContent()}
      />
      <InvoiceDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        invoiceId={selectedInvoiceId}
      />
    </>
  );
}
