import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { 
  Calendar, 
  Package, 
  CreditCard, 
  FileText, 
  User, 
  Banknote, 
  ChevronDown, 
  ChevronUp, 
  ShoppingCart, 
  X, 
  Clock, 
  CheckCircle2, 
  Building2 
} from "lucide-react";
import { pendingApprovalPurchaseOrdersApi, updatePurchaseOrderApprovalApi } from "../apis/purchaseOrderApi";
import dayjs from "dayjs";
import { useAuth } from "../contexts/AuthContext";

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
                <ShoppingCart size={22} className="text-white" />
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
          {/* Header Accent Bar (Cross Bar) */}
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
    <ShoppingCart className="h-16 w-16 text-gray-300 mb-4" />
    <h3 className="text-lg font-semibold text-gray-700 mb-2">{title}</h3>
    <p className="text-sm text-gray-500">{subtitle}</p>
  </div>
);

import RejectionReasonModal from "../modals/RejectionReasonModal";

export default function PurchaseOrderApproval({
  open,
  onClose,
}) {
  const { user } = useAuth();
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRejectItem, setSelectedRejectItem] = useState(null);
  const [rejecting, setRejecting] = useState(false);

  const companyId = user?.company?._id || JSON.parse(localStorage.getItem("selectedCompany") || "{}")?._id;

  const getAllPending = async () => {
    try {
      if (!open || !companyId) return;
      setLoading(true);

      const res = await pendingApprovalPurchaseOrdersApi(companyId);

      if (res.data) {
        const mapped = (res.data || [])
          .map((po) => {
            return {
              id: po._id,
              actionType: po.actionType || "create",
              snapshot: po,
              poData: po,
              pendingCreatedAt: po.updatedAt,
              createdAt: po.createdAt,
            };
          });

        const sorted = mapped.sort((a, b) => {
          const timeA = new Date(a.pendingCreatedAt).getTime();
          const timeB = new Date(b.pendingCreatedAt).getTime();
          return timeB - timeA;
        });

        setPendingItems(sorted || []);
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load pending approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAllPending();
  }, [open, companyId]);

  const toggleRowExpand = (poId, e) => {
    e?.stopPropagation();
    setExpandedRows((prev) => ({
      ...prev,
      [poId]: !prev[poId],
    }));
  };

  const handleOpenReject = (item) => {
    setSelectedRejectItem(item);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async (reason) => {
    if (!selectedRejectItem) return;
    try {
      setRejecting(true);
      await updatePurchaseOrderApprovalApi(selectedRejectItem.id, "Rejected", reason);
      toast.success("Purchase Order rejected successfully");
      setPendingItems((prev) => prev.filter((item) => item.id !== selectedRejectItem.id));
      setRejectModalOpen(false);
      setSelectedRejectItem(null);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Rejection action failed");
    } finally {
      setRejecting(false);
    }
  };

  const handleSubmit = async (id, approvalStatus) => {
    try {
      setLoading(true);
      await updatePurchaseOrderApprovalApi(id, approvalStatus, "");
      toast.success(`Purchase Order ${approvalStatus.toLowerCase()} successfully`);
      
      // Remove the approved/rejected PO from the list
      setPendingItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error(err);
      toast.error("Approval action failed");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = "₹") =>
    `${currency} ${(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (date) =>
    date ? dayjs(date).format("DD-MMM-YYYY") : "-";

  const getItemSummary = (items) => {
    if (!items || items.length === 0) return "No items";
    return `${items.length} item${items.length > 1 ? "s" : ""}`;
  };

  const calculateTotalTax = (po) => {
    const cgst = po.totalCGSTAmount || 0;
    const sgst = po.totalSGSTAmount || 0;
    const igst = po.totalIGSTAmount || 0;
    return (cgst + sgst + igst).toFixed(2);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "closed":
      case "fully_invoiced":
        return "border-emerald-200 text-emerald-700 bg-emerald-50";
      case "open":
      case "partially_invoiced":
        return "border-amber-200 text-amber-700 bg-amber-50";
      default:
        return "border-slate-200 text-slate-600 bg-slate-50";
    }
  };

  const getActionBadge = (actionType) => {
    switch (actionType?.toLowerCase()) {
      case "create":
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 uppercase tracking-wider">
            Create Request
          </span>
        );
      case "update":
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-blue-200 text-blue-700 bg-blue-50 uppercase tracking-wider">
            Update Request
          </span>
        );
      case "delete":
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
      return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    } else {
      return dayjs(date).format("DD-MMM-YYYY HH:mm");
    }
  };

  const renderContent = () => {
    if (loading)
      return <LoadingComponent title="Getting Purchase Order Approvals..." />;

    if (!pendingItems.length)
      return (
        <EmptyComponent
          title="No pending approvals"
          subtitle="All clear! No purchase orders are awaiting approval."
        />
      );

    return (
      <div className="space-y-3">
        {pendingItems.map((item) => {
          const po = item.snapshot;
          const isExpanded = expandedRows[item.id];
          const isReceivable = po.direction === "receivable";

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-blue-200"
            >
              {/* PO Header */}
              <div
                onClick={(e) => toggleRowExpand(item.id, e)}
                className="px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex justify-between items-center gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border border-blue-100"
                      style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)" }}>
                      <ShoppingCart size={17} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">{po.poNumber}</h3>
                        {getActionBadge(item.actionType)}
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black rounded-full border uppercase tracking-wider ${getStatusColor(
                            po.status
                          )}`}
                        >
                          {po.status}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wider ${isReceivable ? "border-indigo-200 text-indigo-700 bg-indigo-50" : "border-amber-200 text-amber-700 bg-amber-50"}`}>
                          {isReceivable ? "Receivable" : "Payable"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} />
                          {formatDate(po.poDate)}
                        </div>
                        <div className="flex items-center gap-1">
                          {isReceivable ? <User size={11} /> : <Building2 size={11} />}
                          <span className="truncate max-w-[150px]">
                            {isReceivable ? (po.client?.name || po.vendor?.name) : (po.vendor?.name || po.client?.name)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Package size={11} />
                          {getItemSummary(po.items)}
                        </div>
                        <div className="flex items-center gap-1 text-indigo-500 italic font-semibold">
                          <Clock size={11} />
                          {item.pendingCreatedAt ? formatTimeAgo(item.pendingCreatedAt) : "Recently"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Amount</p>
                      <p className="text-base font-black text-slate-900 tabular-nums">
                        {formatCurrency(po.totalAmount, po.currency)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => toggleRowExpand(item.id, e)}
                      className={`p-2 rounded-xl transition-all ${isExpanded ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="p-5 border-t bg-[#fafafa]">
                  {/* Item List Header */}
                  <div className="mb-4">
                    <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1">
                      <Package size={13} className="text-blue-500" /> Item Details
                    </h4>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="px-4 py-2.5">Item Description</th>
                            <th className="px-4 py-2.5">HSN/SAC</th>
                            <th className="px-4 py-2.5 text-right">Qty</th>
                            <th className="px-4 py-2.5 text-right">Rate</th>
                            <th className="px-4 py-2.5 text-right">Taxable</th>
                            <th className="px-4 py-2.5 text-right">GST Rate</th>
                            <th className="px-4 py-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {po.items?.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-medium text-slate-900">{item.description}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-600">{item.hsnSac || "-"}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{item.quantity}</td>
                              <td className="px-4 py-2.5 text-right">{formatCurrency(item.rate, po.currency)}</td>
                              <td className="px-4 py-2.5 text-right">{formatCurrency(item.taxableValue, po.currency)}</td>
                              <td className="px-4 py-2.5 text-right">{item.gstRate}%</td>
                              <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(item.totalAmount, po.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    {/* Entity Details */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                      <h4 className="font-bold text-slate-700 flex items-center text-xs">
                        <User className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                        {isReceivable ? "Client Details" : "Vendor Details"}
                      </h4>
                      <div className="space-y-1.5 text-xs text-slate-600">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Party</p>
                          <p className="font-semibold text-slate-900 truncate">
                            {isReceivable ? (po.client?.name || po.vendor?.name) : (po.vendor?.name || po.client?.name)}
                          </p>
                          <p className="text-[11px] leading-relaxed truncate">
                            {isReceivable ? (po.client?.address || po.vendor?.address) : (po.vendor?.address || po.client?.address)}
                          </p>
                          {(po.vendor?.GSTIN || po.client?.GSTIN) && (
                            <p className="text-[10px] text-slate-500 mt-0.5">GSTIN: {po.vendor?.GSTIN || po.client?.GSTIN}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Deliver To</p>
                          <p className="font-semibold text-slate-900 truncate">{po.deliverTo?.name || "-"}</p>
                          <p className="text-[11px] leading-relaxed truncate">{po.deliverTo?.address || "-"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Financial Details */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                      <h4 className="font-bold text-slate-700 flex items-center text-xs">
                        <CreditCard className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                        Financial Details
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Taxable Value</p>
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(po.totalTaxableValue, po.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Tax</p>
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(calculateTotalTax(po), po.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Category</p>
                          <p className="font-semibold text-slate-900 capitalize">{po.poCategory || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Delivery Date</p>
                          <p className="font-semibold text-slate-900">{formatDate(po.deliveryDate)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Payment Terms</p>
                          <p className="font-semibold text-slate-900 capitalize">{po.paymentTerms || "-"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Tax Breakdown */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                      <h4 className="font-bold text-slate-700 flex items-center text-xs">
                        <Banknote className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
                        Tax Breakdown
                      </h4>
                      <div className="space-y-1.5 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span className="text-slate-500">CGST</span>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(po.totalCGSTAmount, po.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">SGST</span>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(po.totalSGSTAmount, po.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">IGST</span>
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(po.totalIGSTAmount, po.currency)}
                          </span>
                        </div>
                        <div className="border-t pt-1.5 mt-1.5 flex justify-between font-extrabold text-sm">
                          <span className="text-slate-900">Total Amount</span>
                          <span className="text-blue-600">
                            {formatCurrency(po.totalAmount, po.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {po.notes && (
                    <div className="mb-4 p-3 bg-white rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-xs text-slate-700 font-medium whitespace-pre-line">{po.notes}</p>
                    </div>
                  )}

                  {/* Approval Action Buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => handleOpenReject(item)}
                      className="px-5 py-2.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-full hover:bg-red-100 transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 duration-200 cursor-pointer"
                    >
                      <X size={14} />
                      Reject Request
                    </button>
                    <button
                      onClick={() => handleSubmit(item.id, "Approved")}
                      className="px-5 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-all flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 duration-200 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      Approve Request
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <SideDialogBox
        open={open}
        onClose={onClose}
        title="Purchase Order Approval"
        subtitle="Review and approve pending purchase order creation, update, and deletion requests"
        contents={renderContent()}
      />
      <RejectionReasonModal
        open={rejectModalOpen}
        onClose={() => {
          if (!rejecting) {
            setRejectModalOpen(false);
            setSelectedRejectItem(null);
          }
        }}
        onSubmit={handleConfirmReject}
        loading={rejecting}
        title="Reject Purchase Order"
        subtitle={
          selectedRejectItem?.poData?.poNumber
            ? `Please provide a reason for rejecting purchase order ${selectedRejectItem.poData.poNumber}.`
            : "Please provide a reason for rejecting this purchase order."
        }
      />
    </>
  );
}
