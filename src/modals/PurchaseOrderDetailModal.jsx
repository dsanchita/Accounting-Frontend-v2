// components/PurchaseOrderDetailModal.jsx
import React, { useState, useEffect } from "react";
import {
  X,
  Printer,
  Download,
  Copy,
  FileText,
  Calendar,
  Package,
  CreditCard,
  Truck,
  AlertCircle,
  CheckCircle,
  Building,
  Clock,
  FileSignature,
  MessageSquare,
  Tag,
  ShoppingBag,
  Percent,
  Hash,
  User,
  ChevronRight,
} from "lucide-react";
import dayjs from "dayjs";
import { getPurchaseOrderApi, downloadPdfPurchaseOrderApi, downloadWordPurchaseOrderApi } from "../apis/purchaseOrderApi";
import { motion, AnimatePresence } from "framer-motion";
import InvoiceDetailsModal from "./InvoiceDetailsModal";
import { useNavigate } from "react-router-dom";
import { splitMonthlyPeriods, calculateMonthlyDistributionBreakdown } from "../utils/monthlyPeriodUtils";

/* ── helpers ──────────────────────────────────────────── */
const fmt = (d) => (d ? dayjs(d).format("DD MMM YYYY") : "—");
const fmtT = (d) => (d ? dayjs(d).format("DD MMM YYYY, hh:mm A") : "—");
const normalizeCurrency = (currency = "INR") => {
  const code = String(currency || "INR").trim().toUpperCase();
  if (["RS", "₹", "RUPEE", "RUPEES"].includes(code)) return "INR";
  return /^[A-Z]{3}$/.test(code) ? code : "INR";
};
const fmtC = (amt, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: normalizeCurrency(currency),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amt || 0);

const getPrimaryTaxLabel = (po = {}) =>
  po?.taxLabel || po?.taxType || po?.taxSummary?.[0]?.label || po?.taxSummary?.[0]?.taxType || "Tax";

const getItemTaxRate = (item = {}) =>
  Number(item?.taxRate ?? item?.combinedTaxRate ?? item?.gstRate ?? 0);

const getItemTaxAmount = (item = {}) =>
  Number(item?.taxAmount ?? item?.gstAmount ?? 0);

const PAYMENT_TERM_DAYS = {
  "net-15": 15,
  "net-30": 30,
  "net-45": 45,
  "net-60": 60,
  "net-90": 90,
};

const roundMoney = (value = 0) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getInvoiceTimelineBreakdown = (invoice = {}) => {
  const lineItems = Array.isArray(invoice.items) ? invoice.items : [];
  const termInvoiceAmount = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + Number(item.total || item.totalAmount || 0), 0)
    : Number(invoice.invoiceAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const tdsAmount = Number(invoice.tdsAmount || 0);
  const netPayable = Math.max(0, termInvoiceAmount - tdsAmount);
  const remainingAmount = Math.max(0, netPayable - paidAmount);

  return {
    termInvoiceAmount,
    paidAmount,
    remainingAmount,
    tdsAmount,
    netPayable,
  };
};

const calculatePaymentDistributions = (po) => {
  if (!po) return [];
  const start = dayjs(po.referenceDate || po.poDate);
  const end = dayjs(po.deliveryDate);
  const totalAmount = Number(po.totalAmount || 0);

  if (po.paymentTerms === "milestone") {
    return (po.milestones || []).map((m, idx) => ({
      _id: m._id,
      title: m.title || `Milestone ${idx + 1}`,
      amount: Number(m.amount || 0),
      percentage: Number(m.percentage || 0),
      dueDate: m.dueDate,
      type: "milestone",
      index: idx,
    }));
  }

  const result = [];
  if (!start.isValid() || !end.isValid() || end.isBefore(start) || totalAmount <= 0) return [];

  if (po.paymentTerms === "monthly") {
    if (Array.isArray(po.distributionSchedule) && po.distributionSchedule.length > 0) {
      return po.distributionSchedule.map((dist, i) => ({
        title: dist.period || dist.monthName || `Month ${i + 1}`,
        periodLabel: dist.periodLabel || `${dist.startDate} – ${dist.endDate}`,
        amount: Number(dist.amount || 0),
        rate: Number(dist.rate || 0),
        startDate: dist.startDate,
        endDate: dist.endDate,
        daysInPeriod: dist.daysInPeriod,
        totalDaysInMonth: dist.totalDaysInMonth,
        type: "monthly",
        index: i,
      }));
    }

    const distResult = calculateMonthlyDistributionBreakdown({
      poDate: po.poDate,
      deliveryDate: po.deliveryDate || po.dueDate,
      items: po.items || [],
      taxType: po.taxType || "GST",
    });

    if (distResult.breakdown.length > 0) {
      const sumBreakdown = distResult.totalAmount;
      const poTotal = Number(po.totalAmount || 0);
      const diff = poTotal > 0 ? poTotal - sumBreakdown : 0;

      return distResult.breakdown.map((item, idx) => {
        let amount = item.amount;
        if (idx === distResult.breakdown.length - 1 && Math.abs(diff) > 0.001) {
          amount = Math.max(0, Math.round((amount + diff) * 100) / 100);
        }
        return {
          title: item.period,
          periodLabel: item.periodLabel,
          amount,
          rate: item.rate,
          startDate: item.startDate,
          endDate: item.endDate,
          daysInPeriod: item.daysInPeriod,
          totalDaysInMonth: item.totalDaysInMonth,
          type: "monthly",
          index: idx,
        };
      });
    }
  } else if (po.paymentTerms === "weekly") {
    const totalDays = end.diff(start, "day") + 1;
    let numWeeks = Math.ceil(totalDays / 7);
    if (numWeeks < 1) numWeeks = 1;
    const amountPerWeek = totalAmount / numWeeks;
    let current = start.clone();
    for (let i = 0; i < numWeeks; i++) {
      let weekEnd = current.add(6, "day");
      if (weekEnd.isAfter(end)) weekEnd = end;
      result.push({
        title: `Week ${i + 1}`,
        amount: amountPerWeek,
        startDate: current.format("YYYY-MM-DD"),
        endDate: weekEnd.format("YYYY-MM-DD"),
        type: "weekly",
        index: i,
      });
      current = weekEnd.add(1, "day");
    }
  }

  return result;
};

const getTermTimelineSummary = ({ po, invoice, invoiceIndex, orderedInvoices }) => {
  const termDays = PAYMENT_TERM_DAYS[po?.paymentTerms] || 0;
  const scheduleStart = po?.referenceDate || po?.poDate;
  const scheduleEnd = po?.deliveryDate;

  if (!termDays || !scheduleStart || !scheduleEnd) {
    return null;
  }

  const startDate = new Date(scheduleStart);
  const endDate = new Date(scheduleEnd);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const totalDurationDays = Math.max(
    1,
    Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)),
  );
  const totalInstallments = Math.max(1, Math.ceil(totalDurationDays / termDays));
  const installmentAmount = roundMoney((Number(po?.totalAmount || 0)) / totalInstallments);
  const installmentNo = invoiceIndex + 1;

  const actualRaisedAmounts = orderedInvoices.map((entry) => getInvoiceTimelineBreakdown(entry).termInvoiceAmount);
  const actualRaisedTillPrevious = roundMoney(
    actualRaisedAmounts.slice(0, invoiceIndex).reduce((sum, amount) => sum + amount, 0),
  );
  const actualRaisedTillCurrent = roundMoney(actualRaisedTillPrevious + actualRaisedAmounts[invoiceIndex]);

  const scheduledTillPrevious = roundMoney(
    Math.min(Number(po?.totalAmount || 0), installmentAmount * Math.max(0, installmentNo - 1)),
  );
  const scheduledTillCurrent = roundMoney(
    Math.min(Number(po?.totalAmount || 0), installmentAmount * installmentNo),
  );
  const scheduledTillNext = roundMoney(
    Math.min(Number(po?.totalAmount || 0), installmentAmount * Math.min(totalInstallments, installmentNo + 1)),
  );
  const carryForwardFromPrevious = roundMoney(
    Math.max(0, scheduledTillPrevious - actualRaisedTillPrevious),
  );
  const currentTermRaisedAmount = roundMoney(
    Math.max(0, actualRaisedAmounts[invoiceIndex] - carryForwardFromPrevious),
  );
  const remainingFromThisTerm = roundMoney(
    Math.max(0, (scheduledTillCurrent - scheduledTillPrevious) - currentTermRaisedAmount),
  );

  return {
    installmentNo,
    totalInstallments,
    scheduledTermAmount: roundMoney(scheduledTillCurrent - scheduledTillPrevious),
    carryForwardFromPrevious,
    actualRaisedAmount: actualRaisedAmounts[invoiceIndex],
    currentTermRaisedAmount,
    remainingFromThisTerm,
    nextExpectedInvoiceAmount: roundMoney(Math.max(0, scheduledTillNext - actualRaisedTillCurrent)),
  };
};

const getMilestoneOpenAmountBeforeInvoice = (milestone = {}) => {
  const explicitRemainingBefore = Number(milestone.remainingAmountBefore);
  if (Number.isFinite(explicitRemainingBefore) && explicitRemainingBefore >= 0) {
    return roundMoney(explicitRemainingBefore);
  }

  const raisedNow = Number(milestone.invoicedAmount || milestone.amount || 0);
  const remainingAfter = Number(milestone.remainingAmountAfter || 0);
  return roundMoney(Math.max(0, raisedNow + remainingAfter));
};

const getMilestoneIdentity = (milestone = {}) => ({
  id: String(milestone?.milestoneId || milestone?._id || "").trim(),
  title: String(milestone?.title || milestone?.description || "").trim().toLowerCase(),
  index:
    milestone?.milestoneIndex !== undefined && milestone?.milestoneIndex !== null
      ? Number(milestone.milestoneIndex)
      : null,
});

const getMatchedInvoiceMilestones = (invoice = {}, distribution = {}) => {
  const milestones = Array.isArray(invoice?.milestones) ? invoice.milestones : [];
  const distributionId = String(distribution?._id || "");
  const distributionTitle = String(distribution?.title || "").trim().toLowerCase();
  const distributionIndex = Number(distribution?.index);

  const byIdOrTitle = milestones.filter((milestone) => {
    const identity = getMilestoneIdentity(milestone);
    return (
      (distributionId && identity.id && distributionId === identity.id) ||
      (distributionTitle && identity.title && distributionTitle === identity.title)
    );
  });

  if (byIdOrTitle.length > 0) return byIdOrTitle;

  if (Number.isFinite(distributionIndex)) {
    const byIndex = milestones.filter((milestone) => {
      const identity = getMilestoneIdentity(milestone);
      return Number.isFinite(identity.index) && identity.index === distributionIndex;
    });
    if (byIndex.length > 0) return byIndex;
  }

  return [];
};

const getMilestoneEntryGrossAmount = (milestone = {}) => {
  const taxableAmount = Number(milestone?.invoicedAmount ?? milestone?.amount ?? milestone?.taxableValue ?? 0);
  const taxAmount = Number(milestone?.gstAmount ?? milestone?.taxAmount ?? milestone?.totalTaxAmount ?? 0);

  return roundMoney(
    Number(
      milestone?.total ??
        milestone?.totalAmount ??
        milestone?.invoiceAmount ??
        (taxableAmount + taxAmount),
    ),
  );
};

const getMilestoneInvoiceGrossAmount = (invoice = {}, distribution = {}) => {
  const matchedMilestones = getMatchedInvoiceMilestones(invoice, distribution);
  const grossFromMilestones = matchedMilestones.reduce(
    (sum, milestone) => sum + getMilestoneEntryGrossAmount(milestone),
    0,
  );

  if (grossFromMilestones > 0) return roundMoney(grossFromMilestones);

  const grossFromItems = (invoice?.items || []).reduce(
    (sum, item) => sum + Number(item?.totalAmount ?? item?.total ?? 0),
    0,
  );

  return roundMoney(grossFromItems || Number(invoice?.invoiceAmount || 0));
};

const getPOMilestoneInvoicedAmount = (milestone = {}, index = 0, invoices = []) => {
  const distribution = {
    _id: milestone?._id,
    title: milestone?.title,
    index,
  };

  return roundMoney(
    invoices.reduce((sum, invoice) => {
      if (getMatchedInvoiceMilestones(invoice, distribution).length === 0) return sum;
      return sum + getMilestoneInvoiceGrossAmount(invoice, distribution);
    }, 0),
  );
};

const getMilestoneTimelineSummary = ({ po, invoice, invoiceIndex, orderedInvoices }) => {
  const milestones = Array.isArray(invoice?.milestones) ? invoice.milestones : [];
  if (!milestones.length) return null;

  const normalizedMilestones = milestones.map((milestone) => {
    const originalAmount = Number(milestone.originalAmount || milestone.amount || 0);
    const raisedNow = Number(milestone.invoicedAmount || milestone.amount || 0);
    const remainingAfter = Number(milestone.remainingAmountAfter || 0);
    const openAmountBefore = getMilestoneOpenAmountBeforeInvoice(milestone);
    const alreadyInvoicedBefore = Number.isFinite(Number(milestone.alreadyInvoicedAmount))
      ? Number(milestone.alreadyInvoicedAmount)
      : Math.max(0, originalAmount - openAmountBefore);

    return {
      title: milestone.title,
      originalAmount: roundMoney(originalAmount),
      raisedNow: roundMoney(raisedNow),
      remainingAfter: roundMoney(Math.max(0, remainingAfter)),
      openAmountBefore,
      alreadyInvoicedBefore: roundMoney(Math.max(0, alreadyInvoicedBefore)),
    };
  });

  const scheduledTermAmount = roundMoney(
    normalizedMilestones.reduce((sum, milestone) => sum + milestone.openAmountBefore, 0),
  );
  const actualRaisedAmount = roundMoney(
    normalizedMilestones.reduce((sum, milestone) => sum + milestone.raisedNow, 0),
  );
  const remainingFromThisTerm = roundMoney(
    normalizedMilestones.reduce((sum, milestone) => sum + milestone.remainingAfter, 0),
  );
  const carryForwardFromPrevious = roundMoney(
    normalizedMilestones.reduce(
      (sum, milestone) => sum + (milestone.alreadyInvoicedBefore > 0 ? milestone.openAmountBefore : 0),
      0,
    ),
  );

  let nextExpectedInvoiceAmount = 0;
  const nextInvoice = orderedInvoices?.[invoiceIndex + 1];
  if (Array.isArray(nextInvoice?.milestones) && nextInvoice.milestones.length > 0) {
    nextExpectedInvoiceAmount = roundMoney(
      nextInvoice.milestones.reduce(
        (sum, milestone) => sum + getMilestoneOpenAmountBeforeInvoice(milestone),
        0,
      ),
    );
  } else if (Array.isArray(po?.milestones) && po.milestones.length > 0) {
    const currentInvoiceMilestoneIds = new Set(
      normalizedMilestones.map((milestone) => String(milestone.title || "")),
    );
    nextExpectedInvoiceAmount = roundMoney(
      po.milestones.reduce((sum, milestone) => {
        const milestoneRemaining = Number(milestone.remainingAmount ?? milestone.amount ?? 0);
        const milestoneKey = String(milestone.title || "");
        if (currentInvoiceMilestoneIds.has(milestoneKey)) {
          return sum;
        }
        return sum + Math.max(0, milestoneRemaining);
      }, remainingFromThisTerm),
    );
  }

  const previousMilestoneRemaining = normalizedMilestones
    .filter((milestone) => milestone.remainingAfter > 0)
    .map((milestone) => ({
      title: milestone.title,
      remainingAmount: milestone.remainingAfter,
    }));

  return {
    scheduledTermAmount,
    actualRaisedAmount,
    carryForwardFromPrevious,
    remainingFromThisTerm,
    nextExpectedInvoiceAmount,
    previousMilestoneRemaining,
  };
};

const STATUS_CFG = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  issued: { label: "Issued", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  acknowledged: { label: "Acknowledged", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  partially_received: { label: "Partially Received", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  fully_received: { label: "Fully Received", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700 border-red-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  OPEN: { label: "Open", cls: "bg-red-100 text-red-700 border-red-200" },
  PARTIALLY_INVOICED: { label: "Partially Invoiced", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  FULLY_INVOICED: { label: "Fully Invoiced", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  CLOSED: { label: "Closed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const deliveryStatus = (d) => {
  const diff = dayjs(d).diff(dayjs(), "day");
  if (diff < 0) return { text: "Overdue", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
  if (diff <= 3) return { text: "Due Soon", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" };
  return { text: "On Track", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
};

/* Small field */
const F = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
    <p className={`text-xs font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

/* Section wrapper */
const Card = ({ title, icon: Icon, accent, children, extra }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div
      className="flex items-center justify-between px-4 py-3 border-b border-slate-100"
      style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
        <Icon size={13} className="text-slate-500" />
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title}</p>
      </div>
      {extra}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const canCreateInvoice = (status) =>
  !["FULLY_INVOICED", "Fully Invoiced", "CLOSED", "Closed"].includes(status);

const hasMeaningfulItemData = (item) => {
  if (!item) return false;

  const description = typeof item.description === "string" ? item.description.trim() : "";
  const hsnSac = typeof item.hsnSac === "string" ? item.hsnSac.trim() : "";

  return (
    description.length > 0 ||
    hsnSac.length > 0 ||
    Number(item.rate || 0) > 0 ||
    Number(item.taxableValue || 0) > 0 ||
    Number(item.total || 0) > 0 ||
    Number(item.totalAmount || 0) > 0 ||
    Number(item.gstAmount || 0) > 0 ||
    Number(item.gstRate || 0) > 0
  );
};

/* ── Derive which tabs are meaningful for a given PO ── */
const getAvailableTabs = (po) => {
  if (!po) return ["overview"];
  const tabs = ["overview"];

  const hasItems = Array.isArray(po?.items) && po.items.some(hasMeaningfulItemData);
  const hasResources = Array.isArray(po.resources) && po.resources.length > 0;
  const hasMilestones = Array.isArray(po.milestones) && po.milestones.length > 0;
  const hasAttendance = Array.isArray(po.attendanceRecords) && po.attendanceRecords.length > 0;
  const isRetainer = po.poCategory === "retainer";

  // Show the details/items tab only when there's actually something to display
  const hasRetainerData =
    po?.poCategory === "retainer" &&
    (
      po?.totalAmount > 0 ||
      po?.paymentSchedule ||
      po?.paymentTerms
    );

  if (hasItems || hasResources || hasMilestones || hasAttendance || hasRetainerData) {
    tabs.push("details");
  }

  // Timeline always makes sense
  tabs.push("timeline");

  // Payment Terms
  if (po.totalAmount > 0 || hasMilestones) {
    tabs.push("paymentTerms");
  }

  // Documents are available only after approval.
  if (po.approvalStatus === "Approved") {
    tabs.push("documents");
  }

  return tabs;
};

const TAB_LABELS = {
  overview: "Overview",
  details: "Details",
  timeline: "Timeline",
  paymentTerms: "Payment Terms",
  documents: "Documents",
};

const PurchaseOrderDetailModal = ({ isOpen, onClose, purchaseOrderId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [po, setPo] = useState(null);
  const [tab, setTab] = useState("overview");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const orderedInvoices = [...(po?.linkedInvoices || [])]
    .sort((a, b) => new Date(a?.invoiceDate || 0) - new Date(b?.invoiceDate || 0));

  useEffect(() => {
    if (isOpen && purchaseOrderId) fetchPO();
  }, [isOpen, purchaseOrderId]);

  // Reset tab to overview whenever the modal opens (so stale "details" tab is not shown
  // if the newly-opened PO has no details tab)
  useEffect(() => {
    if (isOpen) setTab("overview");
  }, [isOpen, purchaseOrderId]);

  const fetchPO = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPurchaseOrderApi(purchaseOrderId);
      const data = res?.data || res;
      setPo(data);
    } catch {
      setError("Failed to load purchase order details");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!po) return;
    if (po.approvalStatus !== "Approved") {
      alert("Only approved purchase orders can be downloaded");
      return;
    }
    try {
      const res = await downloadPdfPurchaseOrderApi(po._id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `PO_${po.poNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch {
      alert("Failed to download PDF");
    }
  };
    const handleDownloadWord = async (poId, poNumber, e) => {
    if (po?.approvalStatus !== "Approved") {
      setError("Only approved purchase orders can be downloaded");
      return;
    }

    try {
      const response = await downloadWordPurchaseOrderApi(poId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `PurchaseOrder_${poNumber}.docx`;
      link.click();
    } catch (err) {
      console.error(err);
      setError("Failed to download Word document");
    }
  };

  const handleCreateInvoice = () => {
    if (po?.approvalStatus !== "Approved") {
      setError("Invoice can be created only for approved purchase orders");
      return;
    }
    if (po?._id) {
      navigate(`/master-data/manual-invoice?poId=${po._id}`);
      onClose();
    }
  };

  const handleCopy = () => {
    if (po?.poNumber) navigator.clipboard.writeText(po.poNumber);
  };

  if (!isOpen) return null;

  const status = po ? STATUS_CFG[po.status] || STATUS_CFG.draft : null;
  const isApprovedPO = po?.approvalStatus === "Approved";
  const isRejectedPO = po?.approvalStatus === "Rejected";
  const rejectionReason = po?.rejectionReason || po?.approvalComments || po?.rejectionHistory?.[po.rejectionHistory.length - 1]?.reason;
  const delSt = po?.deliveryDate ? deliveryStatus(po.deliveryDate) : null;
  const currency = po?.currency || "INR";
  const activeOrderedInvoices = orderedInvoices.filter(
    (invoice) => !["CANCELLED", "CANCELED", "VOID", "REVERSED"].includes(String(invoice?.status || "").toUpperCase()),
  );
  const derivedTotalInvoicedAmount = activeOrderedInvoices.length > 0
    ? roundMoney(activeOrderedInvoices.reduce((sum, invoice) => sum + Number(invoice?.invoiceAmount || 0), 0))
    : Number(po?.totalInvoicedAmount || 0);
  const openAmount = Math.max(
    0,
    (po?.totalAmount || 0) - derivedTotalInvoicedAmount,
  );

  // ── Precompute what this PO actually has ──────────────────────
  const lineItems = Array.isArray(po?.items) ? po.items.filter(hasMeaningfulItemData) : [];
  const hasItems = lineItems.length > 0;
  const hasResources = Array.isArray(po?.resources) && po.resources.length > 0;
  const hasMilestones = Array.isArray(po?.milestones) && po.milestones.length > 0;
  const hasAttendance = Array.isArray(po?.attendanceRecords) && po.attendanceRecords.length > 0;
  const isStaffing = po?.poCategory === "staffing";
  const isProject = po?.poCategory === "project";
  const isRetainer = po?.poCategory === "retainer";

  const hasRetainerData =
    isRetainer &&
    (
      po?.totalAmount > 0 ||
      po?.paymentSchedule ||
      po?.paymentTerms
    );

  const hasAnyDetailsData =
    hasItems ||
    hasResources ||
    hasMilestones ||
    hasAttendance ||
    hasRetainerData;
  const showRatePerDay = hasResources && po.resources.some((r) => Number(r?.ratePerDay || 0) > 0);
  const showRatePerHour = hasResources && po.resources.some((r) => Number(r?.ratePerHour || 0) > 0);
  const showRatePerMonth = hasResources && po.resources.some((r) => Number(r?.ratePerMonth || 0) > 0);
  // Tax values — only "real" if non-zero
  const hasTaxValues = po
    ? (po.totalCGSTAmount || 0) + (po.totalSGSTAmount || 0) + (po.totalIGSTAmount || 0) > 0
    : false;
  const hasTaxableValue = po ? (po.totalTaxableValue || 0) > 0 : false;

  const availableTabs = getAvailableTabs(po);
  
  // ── Smart Invoice Matching for Payment Terms ──────────────────
  const baseDistributions = po ? calculatePaymentDistributions(po) : [];
  const matchedInvoiceIds = new Set();
  
  // Create mapping array
  const distributionsWithInvoices = baseDistributions.map(dist => ({
    ...dist,
    invoices: [],
  }));

  // Phase 1: Explicit Matching (Labels, IDs)
  if (po) {
    orderedInvoices.forEach(inv => {
      let matchedIdx = -1;
      
      if (po.paymentTerms === "milestone") {
        matchedIdx = distributionsWithInvoices.findIndex((dist) => {
          const distId = String(dist?._id || "").trim();
          const distTitle = String(dist?.title || "").trim().toLowerCase();
          const invoiceMilestoneId = String(inv?.milestoneId || "").trim();
          const invoiceDescription = String(inv?.description || "").trim().toLowerCase();

          return (
            (distId && invoiceMilestoneId && distId === invoiceMilestoneId) ||
            (distTitle && invoiceDescription && invoiceDescription === distTitle) ||
            getMatchedInvoiceMilestones(inv, dist).length > 0 ||
            (inv.items || []).some((item) => {
              const itemMilestoneId = String(item?.milestoneId || item?.sourceId || "").trim();
              const itemMilestoneTitle = String(item?.milestoneTitle || item?.description || "").trim().toLowerCase();
              return (
                (distId && itemMilestoneId && distId === itemMilestoneId) ||
                (distTitle && itemMilestoneTitle && itemMilestoneTitle === distTitle)
              );
            })
          );
        });
      } else {
        matchedIdx = distributionsWithInvoices.findIndex(dist => 
          inv.periodLabel === dist.title || 
          inv.monthlyBillingInfo?.periodLabel === dist.title ||
          (inv.items || []).some(item => item.periodLabel === dist.title)
        );
      }

      if (matchedIdx !== -1) {
        distributionsWithInvoices[matchedIdx].invoices.push(inv);
        matchedInvoiceIds.add(inv._id);
      }
    });

    // Phase 2: Fallback Matching (By Order for periodic terms)
    if (po.paymentTerms !== "milestone") {
      let distIdx = 0;
      orderedInvoices.forEach(inv => {
        if (matchedInvoiceIds.has(inv._id)) return;

        // Find the next distribution that doesn't have an explicitly matched invoice
        while (distIdx < distributionsWithInvoices.length && distributionsWithInvoices[distIdx].invoices.length > 0) {
          distIdx++;
        }

        if (distIdx < distributionsWithInvoices.length) {
          distributionsWithInvoices[distIdx].invoices.push(inv);
          matchedInvoiceIds.add(inv._id);
          distIdx++;
        }
      });
    }
  }

  // Final data calculation
  const paymentDistributions = distributionsWithInvoices.map(dist => {
    const termInvoices = dist.invoices;
    const isMilestoneTerm = dist.type === "milestone";
    const totalInvoiced = termInvoices.reduce(
      (sum, inv) =>
        sum + (isMilestoneTerm ? getMilestoneInvoiceGrossAmount(inv, dist) : Number(inv.invoiceAmount || 0)),
      0,
    );
    const totalInvoiceGross = termInvoices.reduce((sum, inv) => sum + Number(inv.invoiceAmount || 0), 0);
    const totalPaid = termInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);
    const totalTds = termInvoices.reduce((sum, inv) => sum + Number(inv.tdsAmount || 0), 0);
    const netPayable = Math.max(0, totalInvoiceGross - totalTds);
    
    // Status & progress based on net payable (invoice amount minus TDS)
    let status = "unpaid";
    const baseAmount = isMilestoneTerm ? Number(dist.amount || 0) : (netPayable > 0 ? netPayable : (dist.amount || 0));
    
    if (termInvoices.length > 0) {
      const allPaid = termInvoices.every((inv) =>
        ["PAID", "RECONCILED"].includes(String(inv.status || "").toUpperCase()) ||
        inv.isFullyPaid ||
        Number(inv.remainingAmount || 0) <= 0.01,
      );
      if (allPaid) status = "paid";
      else if (totalPaid > 0 || totalTds > 0) status = "partial";
      else status = "invoiced";
    }

    const progressAmount = status === "paid" && isMilestoneTerm ? baseAmount : totalPaid;
    const paidPercentage = baseAmount > 0 ? Math.min(100, (progressAmount / baseAmount) * 100) : 0;

    return {
      ...dist,
      invoices: termInvoices,
      totalInvoiced,
      totalPaid,
      totalTds,
      netPayable,
      displayBaseAmount: baseAmount,
      status,
      paidPercentage
    };
  });

  // Badge helpers used in details tab
  const catBadge = {
    staffing: "bg-violet-100 text-violet-700 border-violet-200",
    project: "bg-blue-100 text-blue-700 border-blue-200",
    retainer: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  const modelBadge = {
    daily: "bg-amber-100 text-amber-700 border-amber-200",
    monthly: "bg-amber-100 text-amber-700 border-amber-200",
    hourly: "bg-amber-100 text-amber-700 border-amber-200",
    milestone: "bg-indigo-100 text-indigo-700 border-indigo-200",
    headcount: "bg-cyan-100 text-cyan-700 border-cyan-200",
    fixed: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const msCfg = {
    pending: "bg-slate-100 text-slate-600 border-slate-200",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    partially_invoiced: "bg-amber-100 text-amber-700 border-amber-200",
    invoiced: "bg-violet-100 text-violet-700 border-violet-200",
  };

  const getStatusColor = (status = "") => {
    const s = String(status || "").toLowerCase();
    if (s.includes("paid") || s === "completed") return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    if (s.includes("partial") || s === "partially_invoiced") return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    if (s === "invoiced" || s === "approved" || s === "sent") return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
    return { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
  };


  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-6 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* ── Modal Header ── */}
        <div className="shrink-0 rounded-t-2xl overflow-hidden">
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ background: "linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#60a5fa 100%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl border border-white/25">
                <ShoppingBag size={16} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-extrabold text-white tracking-tight">
                    {po?.poNumber ? `Purchase Order #${po.poNumber}` : "Purchase Order"}
                  </h2>
                  {status && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${status.cls}`}>
                      {status.label}
                    </span>
                  )}
                  {delSt && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${delSt.bg} ${delSt.color} ${delSt.border}`}>
                      {delSt.text}
                    </span>
                  )}
                </div>
                {po && (
                  <p className="text-blue-200 text-[11px] mt-0.5">Created {fmtT(po.createdAt)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {po?._id && isApprovedPO && canCreateInvoice(po.status) && (
                <button
                  onClick={handleCreateInvoice}
                  className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all text-xs font-bold flex items-center gap-1.5"
                  title="Create Invoice"
                >
                  <FileText size={13} /> Create Invoice
                </button>
              )}
              <button onClick={handleCopy} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Copy PO Number">
                <Copy size={14} />
              </button>
              {isApprovedPO && (
                <>
                  <button onClick={() => window.print()} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Print">
                    <Printer size={14} />
                  </button>
                  <button onClick={handleDownloadPDF} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Download PDF">
                    <Download size={14} />
                  </button>
                </>
              )}
              <button onClick={onClose} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all" title="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          {isRejectedPO && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-red-700 text-xs">
              <span className="font-black">Rejected</span>
              {rejectionReason ? <span className="ml-2">Reason: {rejectionReason}</span> : null}
            </div>
          )}

          {/* Tabs — only render tabs that are relevant for this PO */}
          <div className="flex bg-white border-b border-slate-200 px-2">
            {availableTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${tab === t
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Loading purchase order…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle size={36} className="text-red-400" />
              <p className="text-sm font-semibold text-red-600">{error}</p>
              <button
                onClick={fetchPO}
                className="px-4 py-2 text-xs font-bold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                Try Again
              </button>
            </div>
          )}

          {!loading && po && (
            <>
              {/* ══ OVERVIEW ══════════════════════════════════════════ */}
              {tab === "overview" && (
                <div className="space-y-4">

                  {/* Top stat strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {[
                      {
                        label: "Total Amount",
                        value: fmtC(po.totalAmount, currency),
                        g: "linear-gradient(135deg,#1e3a8a,#2563eb)",
                        blob: "#93c5fd",
                      },
                      {
                        label: "Invoiced %",
                        value: `${(derivedTotalInvoicedAmount / Math.max(po.totalAmount || 1, 1) * 100).toFixed(1)}%`,
                        g: "linear-gradient(135deg,#064e3b,#059669)",
                        blob: "#6ee7b7",
                      },
                      {
                        label: "Reconciled %",
                        value: `${Number(po.progress?.reconciledPct || ((po.totalReconciledAmount || 0) / Math.max(po.totalAmount || 1, 1)) * 100).toFixed(1)}%`,
                        g: "linear-gradient(135deg,#0f766e,#14b8a6)",
                        blob: "#99f6e4",
                      },
                      {
                        label: "Open Amount",
                        value: `${fmtC(openAmount, currency)} / ${fmtC(po.totalAmount, currency)}`,
                        g: "linear-gradient(135deg,#7f1d1d,#dc2626)",
                        blob: "#fca5a5",
                      },
                      po.deliveryDate
                        ? {
                          label: "Delivery Date",
                          value: fmt(po.deliveryDate),
                          sub: delSt?.text,
                          g: "linear-gradient(135deg,#312e81,#7c3aed)",
                          blob: "#c4b5fd",
                        }
                        : null,
                    ]
                      .filter(Boolean)
                      .map((s, i) => (
                        <div
                          key={i}
                          className="relative overflow-hidden rounded-2xl p-4 shadow-md group cursor-default"
                          style={{ background: s.g }}
                        >
                          <div
                            className="absolute -top-4 -right-4 w-16 h-12 rounded-full opacity-25 blur-xl"
                            style={{ background: `radial-gradient(ellipse,${s.blob},transparent)` }}
                          />
                          <div className="absolute top-0 right-10 w-px h-full bg-white/15 rotate-12 scale-y-150" />
                          <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1 relative z-10">{s.label}</p>
                          <p className="text-sm font-black text-white relative z-10">{s.value}</p>
                          {s.sub && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded-full relative z-10">
                              {s.sub}
                            </span>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                        </div>
                      ))}
                  </div>

                  {/* ── PO Category / Billing info strip (only shown when fields exist) ── */}
                  {(po.poCategory || po.billingModel || po.paymentTerms || po.paymentSchedule) && (
                    <div className="flex items-center gap-2 flex-wrap px-1">
                      {/* {po.poCategory && (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${catBadge[po.poCategory] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {po.poCategory.charAt(0).toUpperCase() + po.poCategory.slice(1)}
                        </span>
                      )}
                      {po.billingModel && (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${modelBadge[po.billingModel] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {po.billingModel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      )} */}
                      {po.paymentTerms && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black border bg-slate-100 text-slate-600 border-slate-200">
                          {po.paymentTerms.replace(/-/g, " ").toUpperCase()}
                        </span>
                      )}
                      {/* {po.paymentSchedule && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black border bg-teal-50 text-teal-700 border-teal-200">
                          {po.paymentSchedule.replace(/_/g, " ").toUpperCase()}
                        </span>
                      )} */}
                    </div>
                  )}

                  {/* Client + Deliver To */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {po.client?.name && (
                      <Card title="Client Details" icon={Building} accent="linear-gradient(180deg,#2563eb,#60a5fa)">
                        <div className="grid grid-cols-2 gap-3">
                          <F label="Company" value={po.client?.name} />
                          {po.client?.stateCode && <F label="State Code" value={po.client?.stateCode} />}
                          {po.client?.address && (
                            <div className="col-span-2">
                              <F label="Address" value={po.client?.address} />
                            </div>
                          )}
                          {(po.client?.GSTIN || po.client?.taxNumber) && (
                            <F label="GSTIN" value={po.client?.GSTIN || po.client?.taxNumber} mono />
                          )}
                          {po.client?.taxIdentifierType && (
                            <F label="Tax Type" value={po.client?.taxIdentifierType} />
                          )}
                        </div>
                      </Card>
                    )}

                    {po.deliverTo?.name && (
                      <Card title="Deliver To" icon={Truck} accent="linear-gradient(180deg,#059669,#34d399)">
                        <div className="grid grid-cols-2 gap-3">
                          <F label="Name" value={po.deliverTo?.name} />
                          {po.deliverTo?.stateCode && <F label="State Code" value={po.deliverTo?.stateCode} />}
                          {po.deliverTo?.address && (
                            <div className="col-span-2">
                              <F label="Address" value={po.deliverTo?.address} />
                            </div>
                          )}
                          {(po.deliverTo?.GSTIN || po.deliverTo?.taxNumber) && (
                            <F label="GSTIN" value={po.deliverTo?.GSTIN || po.deliverTo?.taxNumber} mono />
                          )}
                          {po.deliverTo?.taxIdentifierType && (
                            <F label="Tax Type" value={po.deliverTo?.taxIdentifierType} />
                          )}
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* Key dates */}
                  {(po.poDate || po.deliveryDate || po.referenceDate) && (
                    <Card title="Key Dates" icon={Calendar} accent="linear-gradient(180deg,#0f766e,#14b8a6)">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {po.poDate && <F label="PO Date" value={fmt(po.poDate)} />}
                        {po.deliveryDate && <F label="Delivery / End Date" value={fmt(po.deliveryDate)} />}
                        {po.referenceDate && <F label="Reference Date" value={fmt(po.referenceDate)} />}
                        {po.poreferencevalue && <F label="Reference No." value={po.poreferencevalue} mono />}
                        {po.currency && po.currency !== "INR" && <F label="Currency" value={po.currency} />}
                      </div>
                    </Card>
                  )}

                  {/* Financial Summary — only shown when there's meaningful tax/total data */}
                  {(po.totalAmount > 0) && (
                    <Card title="Financial Summary" icon={CreditCard} accent="linear-gradient(180deg,#d97706,#fbbf24)">
                      <div className="space-y-3">

                        {/* Tax row — only when any tax value is non-zero */}
                        {(hasTaxValues || (Array.isArray(po.taxSummary) && po.taxSummary.length > 0)) && (
                          <div className="grid grid-cols-3 gap-3">
                            {Array.isArray(po.taxSummary) && po.taxSummary.length > 0
                              ? po.taxSummary.map((tax, idx) => ({
                                  l: tax.label || tax.taxType || `Tax ${idx + 1}`,
                                  v: fmtC(tax.amount || 0, currency),
                                  cls: idx % 3 === 0 ? "border-blue-100 bg-blue-50/80 text-blue-700" :
                                       idx % 3 === 1 ? "border-violet-100 bg-violet-50/80 text-violet-700" :
                                       "border-emerald-100 bg-emerald-50/80 text-emerald-700"
                                })).map((t) => (
                                  <div key={t.l} className={`flex flex-col items-center px-3 py-2.5 rounded-xl border ${t.cls}`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">{t.l}</span>
                                    <span className="text-sm font-black">{t.v}</span>
                                  </div>
                                ))
                              : [
                                  { l: "CGST", v: fmtC(po.totalCGSTAmount, currency), cls: "border-blue-100 bg-blue-50/80 text-blue-700", show: (po.totalCGSTAmount || 0) > 0 && !(po.totalIGSTAmount > 0) },
                                  { l: "SGST", v: fmtC(po.totalSGSTAmount, currency), cls: "border-violet-100 bg-violet-50/80 text-violet-700", show: (po.totalSGSTAmount || 0) > 0 && !(po.totalIGSTAmount > 0) },
                                  { l: "IGST", v: fmtC(po.totalIGSTAmount, currency), cls: "border-emerald-100 bg-emerald-50/80 text-emerald-700", show: (po.totalIGSTAmount || 0) > 0 },
                                ]
                                .filter((t) => t.show)
                                .map((t) => (
                                  <div key={t.l} className={`flex flex-col items-center px-3 py-2.5 rounded-xl border ${t.cls}`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">{t.l}</span>
                                    <span className="text-sm font-black">{t.v}</span>
                                  </div>
                                ))
                            }
                          </div>
                        )}

                        {/* Taxable value row */}
                        {hasTaxableValue && (
                          <div className="flex items-center justify-between rounded-xl px-4 py-2.5 bg-slate-50 border border-slate-200">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxable Value</span>
                            <span className="text-xs font-black text-slate-700 tabular-nums">{fmtC(po.totalTaxableValue, currency)}</span>
                          </div>
                        )}

                        {/* Total bar */}
                        <div
                          className="flex items-center justify-between rounded-xl px-5 py-3 border border-blue-200"
                          style={{ background: "linear-gradient(90deg,#eff6ff,#dbeafe)" }}
                        >
                          <div>
                            <p className="text-xs font-black text-blue-900">Total Amount</p>
                            {po.valueInWords && (
                              <p className="text-[10px] text-blue-600 mt-0.5 italic">{po.valueInWords}</p>
                            )}
                          </div>
                          <p className="text-xl font-black text-blue-900 tabular-nums">{fmtC(po.totalAmount, currency)}</p>
                        </div>

                        {/* Invoiced / paid breakdown — only when values exist */}
                        {(derivedTotalInvoicedAmount > 0 || (po.totalPaidAmount || 0) > 0) && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                            {derivedTotalInvoicedAmount > 0 && (
                              <div className="flex flex-col items-center px-3 py-2.5 rounded-xl border border-amber-100 bg-amber-50/80">
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5 text-amber-700">Invoiced</span>
                                <span className="text-sm font-black text-amber-700">{fmtC(derivedTotalInvoicedAmount, currency)}</span>
                              </div>
                            )}
                            {(po.totalPaidAmount || 0) > 0 && (
                              <div className="flex flex-col items-center px-3 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50/80">
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5 text-emerald-700">Paid</span>
                                <span className="text-sm font-black text-emerald-700">{fmtC(po.totalPaidAmount, currency)}</span>
                              </div>
                            )}
                            {(po.totalReconciledAmount || 0) > 0 && (
                              <div className="flex flex-col items-center px-3 py-2.5 rounded-xl border border-teal-100 bg-teal-50/80">
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5 text-teal-700">Reconciled</span>
                                <span className="text-sm font-black text-teal-700">{fmtC(po.totalReconciledAmount, currency)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* ══ DETAILS ════════════════════════════════════════════ */}
              {tab === "details" && hasAnyDetailsData && (
                <div className="space-y-4">

                  {/* ── PO type / model badge strip ── */}
                  {(po.poCategory || po.billingModel || po.paymentTerms || po.paymentSchedule) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* {po.poCategory && (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${catBadge[po.poCategory] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {po.poCategory.charAt(0).toUpperCase() + po.poCategory.slice(1)}
                        </span>
                      )}
                      {po.billingModel && (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${modelBadge[po.billingModel] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {po.billingModel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      )} */}
                      {po.paymentTerms && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black border bg-slate-100 text-slate-600 border-slate-200">
                          {po.paymentTerms.replace(/-/g, " ").toUpperCase()}
                        </span>
                      )}
                      {/* {po.paymentSchedule && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black border bg-teal-50 text-teal-700 border-teal-200">
                          {po.paymentSchedule.replace(/_/g, " ").toUpperCase()}
                        </span>
                      )} */}
                    </div>
                  )}

                  {/* ════════════════════════════════════════════
                      STANDARD LINE ITEMS
                      Only rendered when this PO actually has items
                  ════════════════════════════════════════════ */}
                  {hasItems && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eff6ff 100%)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#1e3a8a,#60a5fa)" }} />
                        <Package size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Line Items</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                          style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                          {lineItems.length}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                              {["#", "Description", "HSN/SAC", "Qty", "Rate", "Taxable Value", `${getPrimaryTaxLabel(po)} %`, `${getPrimaryTaxLabel(po)} Amt`, "Total"].map((h) => (
                                <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {lineItems.map((item, i) => (
                              <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-400">{i + 1}</td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{item.description || "—"}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{item.hsnSac || "—"}</span>
                                </td>
                                <td className="px-4 py-3 font-black text-slate-700 tabular-nums">{item.quantity ?? "—"}</td>
                                <td className="px-4 py-3 tabular-nums text-slate-700">{item.rate != null ? fmtC(item.rate, currency) : "—"}</td>
                                <td className="px-4 py-3 tabular-nums text-slate-700">{item.taxableValue != null ? fmtC(item.taxableValue, currency) : "—"}</td>
                                <td className="px-4 py-3">
                                  {getItemTaxRate(item) > 0 || getItemTaxAmount(item) > 0
                                    ? <div className="flex flex-col gap-1">
                                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[10px] font-black w-fit">
                                          {getItemTaxRate(item)}%
                                        </span>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                                          {item.taxLabel || item.taxType || getPrimaryTaxLabel(po)}
                                        </span>
                                      </div>
                                    : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-amber-700 font-semibold">{getItemTaxAmount(item) > 0 ? fmtC(getItemTaxAmount(item), currency) : "—"}</td>
                                <td className="px-4 py-3 font-black text-slate-900 tabular-nums">
                                  {fmtC(item.total ?? item.totalAmount ?? 0, currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#dbeafe 100%)" }}>
                              <td colSpan={5} className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Totals</td>
                              <td className="px-4 py-3 font-black text-slate-700 tabular-nums">{fmtC(po.totalTaxableValue, currency)}</td>
                              <td className="px-4 py-3" />
                              <td className="px-4 py-3 font-black text-amber-700 tabular-nums">
                                {fmtC(po.totalTaxAmount ?? (po.totalCGSTAmount || 0) + (po.totalSGSTAmount || 0) + (po.totalIGSTAmount || 0), currency)}
                              </td>
                              <td className="px-4 py-3 font-black text-blue-700 tabular-nums text-sm">{fmtC(po.totalAmount, currency)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {Array.isArray(po.taxSummary) && po.taxSummary.length > 0 && (
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60">
                          <div className={`grid gap-3 ${po.taxSummary.length > 1 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
                            {po.taxSummary.map((entry, idx) => (
                              <div key={`${entry.taxType || entry.label || idx}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                  {entry.label || entry.taxType || getPrimaryTaxLabel(po)}
                                </span>
                                <span className="text-xs font-black tabular-nums text-slate-800">
                                  {fmtC(entry.amount || 0, currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ════════════════════════════════════════════
                      RESOURCES / HEADCOUNT
                      Shown for staffing POs and project-headcount POs
                  ════════════════════════════════════════════ */}
                  {hasResources && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#f5f3ff 100%)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#7c3aed,#a78bfa)" }} />
                        <User size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Resources / Headcount</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                          style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                          {po.resources.length}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#ede9fe 100%)" }}>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">#</th>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Name</th>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Role</th>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Employee ID</th>
                              {showRatePerDay && (
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Rate/Day</th>
                              )}
                              {showRatePerHour && (
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Rate/Hour</th>
                              )}
                              {showRatePerMonth && (
                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Rate/Month</th>
                              )}
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Start Date</th>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">End Date</th>
                              <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {po.resources.map((r, i) => (
                              <tr key={i} className="hover:bg-violet-50/30 transition-colors group">
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-400">{i + 1}</td>
                                <td className="px-4 py-3 font-bold text-slate-800 group-hover:text-violet-700 transition-colors">{r.name}</td>
                                <td className="px-4 py-3 text-slate-600">{r.role || "—"}</td>
                                <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{r.employeeId || "—"}</td>
                                {showRatePerDay && (
                                  <td className="px-4 py-3 tabular-nums text-slate-700">{Number(r.ratePerDay || 0) > 0 ? fmtC(r.ratePerDay, currency) : "—"}</td>
                                )}
                                {showRatePerHour && (
                                  <td className="px-4 py-3 tabular-nums text-slate-700">{Number(r.ratePerHour || 0) > 0 ? fmtC(r.ratePerHour, currency) : "—"}</td>
                                )}
                                {showRatePerMonth && (
                                  <td className="px-4 py-3 tabular-nums text-slate-700">{Number(r.ratePerMonth || 0) > 0 ? fmtC(r.ratePerMonth, currency) : "—"}</td>
                                )}
                                <td className="px-4 py-3 text-[10px] text-slate-500 whitespace-nowrap">{fmt(r.startDate)}</td>
                                <td className="px-4 py-3 text-[10px] text-slate-500 whitespace-nowrap">{fmt(r.endDate)}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${r.isActive !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                                    {r.isActive !== false ? "Active" : "Inactive"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Staffing config — only if present AND has non-default meaningful data */}
                      {po.staffingConfig && (isStaffing || po.billingModel === "headcount") && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/60">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Staffing Configuration</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {po.staffingConfig.defaultWorkingDaysPerMonth != null && (
                              <F label="Working Days / Month" value={String(po.staffingConfig.defaultWorkingDaysPerMonth)} />
                            )}
                            {po.staffingConfig.billingUnit && (
                              <F label="Billing Unit" value={po.staffingConfig.billingUnit.toUpperCase()} />
                            )}
                            {po.staffingConfig.overtimeRateMultiplier != null && (
                              <F label="OT Multiplier" value={`${po.staffingConfig.overtimeRateMultiplier}×`} />
                            )}
                            {po.staffingConfig.holidayRateMultiplier != null && (
                              <F label="Holiday Rate" value={`${po.staffingConfig.holidayRateMultiplier}×`} />
                            )}
                            {po.staffingConfig.leavePolicy && (
                              <F label="Leave Policy" value={po.staffingConfig.leavePolicy.replace(/_/g, " ")} />
                            )}
                            <F label="Public Holidays as Working" value={po.staffingConfig.countPublicHolidaysAsWorking ? "Yes" : "No"} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ════════════════════════════════════════════
                      ATTENDANCE RECORDS
                      Shown when any attendance data exists
                  ════════════════════════════════════════════ */}
                  {hasAttendance && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#ecfdf5 100%)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#059669,#34d399)" }} />
                        <Calendar size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Attendance Records</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                          style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
                          {po.attendanceRecords.length}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "linear-gradient(90deg,#f1f5f9 0%,#d1fae5 100%)" }}>
                              {["#", "Resource", "Period", "Std. Days", "Leaves", "Unpaid", "Holiday Work", "Worked Days", "Billable Days", "Billable Hrs", "Billable Amt", "Invoiced"].map((h) => (
                                <th key={h} className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {po.attendanceRecords.map((a, i) => (
                              <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                                <td className="px-3 py-3 text-[10px] font-mono text-slate-400">{i + 1}</td>
                                <td className="px-3 py-3 font-bold text-slate-800">{a.resourceName || "—"}</td>
                                <td className="px-3 py-3 text-[10px] text-slate-500 whitespace-nowrap">
                                  {a.periodStart || a.periodEnd ? `${fmt(a.periodStart)} → ${fmt(a.periodEnd)}` : "—"}
                                </td>
                                <td className="px-3 py-3 tabular-nums text-center text-slate-700">{a.standardWorkingDays ?? "—"}</td>
                                <td className="px-3 py-3 tabular-nums text-center text-amber-700">{a.leaveDays ?? 0}</td>
                                <td className="px-3 py-3 tabular-nums text-center text-red-600">{a.unpaidLeaveDays ?? 0}</td>
                                <td className="px-3 py-3 tabular-nums text-center text-blue-700">{a.holidayWorkedDays ?? 0}</td>
                                <td className="px-3 py-3 tabular-nums text-center font-bold text-slate-800">{a.actualWorkedDays ?? "—"}</td>
                                <td className="px-3 py-3 tabular-nums text-center font-bold text-emerald-700">{a.billableDays ?? "—"}</td>
                                <td className="px-3 py-3 tabular-nums text-center text-slate-700">{a.billableHours ?? "—"}</td>
                                <td className="px-3 py-3 tabular-nums font-black text-slate-900">{a.billableAmount != null ? fmtC(a.billableAmount, currency) : "—"}</td>
                                <td className="px-3 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${a.isInvoiced ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                                    {a.isInvoiced ? "Invoiced" : "Pending"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ════════════════════════════════════════════
                      MILESTONES
                      Shown only when this PO actually has milestones
                  ════════════════════════════════════════════ */}
                  {hasMilestones && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#eef2ff 100%)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#4f46e5,#818cf8)" }} />
                        <CheckCircle size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Milestones</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                          style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                          {po.milestones.length}
                        </span>
                      </div>
                      <div className="p-4 space-y-3">
                        {po.milestones.map((m, i) => {
                          const milestoneInvoicedAmount = getPOMilestoneInvoicedAmount(m, i, activeOrderedInvoices) || Number(m.invoicedAmount || 0);
                          const milestoneRemainingAmount = Math.max(0, Number(m.amount || 0) - milestoneInvoicedAmount);

                          return (
                          <div key={i} className="border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-200 transition-colors">
                            <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                  style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                                  {i + 1}
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{m.title}</p>
                                  {m.description && <p className="text-[10px] text-slate-400 mt-0.5">{m.description}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${msCfg[m.status] || msCfg.pending}`}>
                                  {m.status ? m.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Pending"}
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black border bg-indigo-50 text-indigo-700 border-indigo-200">
                                  {m.percentage ?? 0}%
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${m.percentage ?? 0}%`, background: "linear-gradient(90deg,#4f46e5,#818cf8)" }} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-3">
                              <F label="Amount" value={fmtC(m.amount, currency)} />
                              <F label="Invoiced" value={fmtC(milestoneInvoicedAmount, currency)} />
                              <F label="Remaining" value={fmtC(milestoneRemainingAmount, currency)} />
                              {m.dueDate && <F label="Due Date" value={fmt(m.dueDate)} />}
                              {m.completedDate && <F label="Completed" value={fmt(m.completedDate)} />}
                              {m.notes && <F label="Notes" value={m.notes} />}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                      <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/60 flex items-center justify-between">
                        <div className="flex gap-4 text-[10px] text-slate-500">
                          <span>Fully Invoiced: <strong className="text-emerald-700">{po.milestones.filter((m, i) => (getPOMilestoneInvoicedAmount(m, i, activeOrderedInvoices) || Number(m.invoicedAmount || 0)) >= (m.amount || 0) && (m.amount || 0) > 0).length}</strong></span>
                          <span>Partially Invoiced: <strong className="text-indigo-700">{po.milestones.filter((m, i) => {
                            const invoicedAmount = getPOMilestoneInvoicedAmount(m, i, activeOrderedInvoices) || Number(m.invoicedAmount || 0);
                            return invoicedAmount > 0 && invoicedAmount < (m.amount || 0);
                          }).length}</strong></span>
                          <span>Pending: <strong className="text-amber-700">{po.milestones.filter((m, i) => !((getPOMilestoneInvoicedAmount(m, i, activeOrderedInvoices) || Number(m.invoicedAmount || 0)) > 0)).length}</strong></span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Total Milestone Value</p>
                          <p className="text-sm font-black text-slate-800">{fmtC(po.milestones.reduce((s, m) => s + (m.amount || 0), 0), currency)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ════════════════════════════════════════════
                      RETAINER — config card only for retainer POs
                  ════════════════════════════════════════════ */}
                  {isRetainer && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#ecfdf5 100%)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#0f766e,#14b8a6)" }} />
                        <CreditCard size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Retainer Configuration</p>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {po.billingModel && <F label="Billing Model" value={po.billingModel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} />}
                        {po.paymentSchedule && <F label="Payment Schedule" value={po.paymentSchedule.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} />}
                        {po.paymentTerms && <F label="Payment Terms" value={po.paymentTerms.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} />}
                        <F label="Total PO Value" value={fmtC(po.totalAmount, currency)} />
                        {derivedTotalInvoicedAmount > 0 && <F label="Invoiced to Date" value={fmtC(derivedTotalInvoicedAmount, currency)} />}
                        <F label="Remaining" value={fmtC(Math.max(0, (po.totalAmount || 0) - derivedTotalInvoicedAmount), currency)} />
                        {po.poDate && <F label="Start Date" value={fmt(po.poDate)} />}
                        {po.deliveryDate && <F label="End / Delivery" value={fmt(po.deliveryDate)} />}
                      </div>
                    </div>
                  )}

                  {/* ════════════════════════════════════════════
                      TAX SUMMARY — shown when values exist
                  ════════════════════════════════════════════ */}
                  {(hasTaxableValue || hasTaxValues) && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
                        style={{ background: "linear-gradient(90deg,#f8fafc 0%,#fffbeb 100%)" }}>
                        <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#d97706,#fbbf24)" }} />
                        <Percent size={13} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Tax & Financial Summary</p>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            ...(hasTaxableValue ? [{ l: "Taxable Value", v: fmtC(po.totalTaxableValue, currency), cls: "border-slate-200 bg-slate-50 text-slate-700" }] : []),
                            ...(Array.isArray(po.taxSummary) && po.taxSummary.length > 0
                              ? po.taxSummary.map((tax, idx) => ({
                                  l: tax.label || tax.taxType || `Tax ${idx + 1}`,
                                  v: fmtC(tax.amount || 0, currency),
                                  cls: idx % 4 === 0 ? "border-blue-100 bg-blue-50/80 text-blue-700" :
                                       idx % 4 === 1 ? "border-violet-100 bg-violet-50/80 text-violet-700" :
                                       idx % 4 === 2 ? "border-emerald-100 bg-emerald-50/80 text-emerald-700" :
                                       "border-amber-100 bg-amber-50/80 text-amber-700"
                                }))
                              : [
                                  { l: "CGST", v: fmtC(po.totalCGSTAmount, currency), cls: "border-blue-100 bg-blue-50/80 text-blue-700", show: (po.totalCGSTAmount || 0) > 0 && !(po.totalIGSTAmount > 0) },
                                  { l: "SGST", v: fmtC(po.totalSGSTAmount, currency), cls: "border-violet-100 bg-violet-50/80 text-violet-700", show: (po.totalSGSTAmount || 0) > 0 && !(po.totalIGSTAmount > 0) },
                                  { l: "IGST", v: fmtC(po.totalIGSTAmount, currency), cls: "border-emerald-100 bg-emerald-50/80 text-emerald-700", show: (po.totalIGSTAmount || 0) > 0 },
                                ].filter((t) => t.show !== false)
                            )
                          ]
                            .map((t) => (
                              <div key={t.l} className={`flex flex-col items-center px-3 py-2.5 rounded-xl border ${t.cls}`}>
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">{t.l}</span>
                                <span className="text-sm font-black">{t.v}</span>
                              </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between rounded-xl px-5 py-3 border border-blue-200"
                          style={{ background: "linear-gradient(90deg,#eff6ff,#dbeafe)" }}>
                          <div>
                            <p className="text-xs font-black text-blue-900">Grand Total</p>
                            {po.valueInWords && <p className="text-[10px] text-blue-600 mt-0.5 italic">{po.valueInWords}</p>}
                          </div>
                          <p className="text-xl font-black text-blue-900 tabular-nums">{fmtC(po.totalAmount, currency)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "paymentTerms" && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-6">
                    {paymentDistributions.length === 0 ? (
                      <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                        <CreditCard className="mx-auto text-slate-300 mb-4" size={40} />
                        <p className="text-base font-bold text-slate-500">No payment terms defined</p>
                        <p className="text-xs text-slate-400 mt-1">This PO doesn't have any specific milestones or periodic distribution scheduled.</p>
                      </div>
                    ) : (
                      paymentDistributions.map((dist, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => dist.invoices.length > 0 && setSelectedInvoiceId(dist.invoices[0]._id)}
                          className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group transition-all ${
                            dist.invoices.length > 0 ? "cursor-pointer hover:border-blue-400 hover:shadow-md" : ""
                          }`}
                        >
                          {/* Term Header */}
                          <div className="p-4 pb-3">
                            <div className="flex justify-between items-start mb-3">
                              <div className="space-y-1">
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                  dist.type === "milestone" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {dist.type}
                                </span>
                                <h4 className="text-sm font-black text-slate-900 tracking-tight">{dist.title}</h4>
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <Clock size={10} />
                                  <p className="text-[9px] font-bold uppercase tracking-wider">
                                    {dist.dueDate ? `Due: ${fmt(dist.dueDate)}` : `${fmt(dist.startDate)} — ${fmt(dist.endDate)}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-base font-black text-slate-900 leading-none">{fmtC(dist.amount, currency)}</p>
                                <div className="flex items-center gap-1 justify-end mt-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    dist.status === "paid" ? "bg-emerald-500" : dist.status === "partial" ? "bg-amber-500" : dist.status === "invoiced" ? "bg-blue-500" : "bg-slate-300"
                                  }`} />
                                  <span className={`text-[9px] font-black uppercase tracking-tighter ${
                                    dist.status === "paid" ? "text-emerald-600" : dist.status === "partial" ? "text-amber-600" : dist.status === "invoiced" ? "text-blue-600" : "text-slate-400"
                                  }`}>
                                    {dist.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Term Progress Bar */}
                            <div className="space-y-1.5 mb-1">
                              <div className="flex justify-between items-end">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Payment Progress</p>
                                <p className="text-[9px] font-black text-slate-900 leading-none">{dist.paidPercentage.toFixed(0)}%</p>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${dist.paidPercentage}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className={`h-full rounded-full ${
                                    dist.status === "paid" ? "bg-emerald-500" : dist.status === "partial" ? "bg-amber-500" : "bg-blue-500"
                                  }`}
                                />
                              </div>
                              <div className="flex justify-between text-[8px] font-bold text-slate-400">
                                <span>{fmtC(dist.totalPaid, currency)} Paid</span>
                                <span>
                                  {fmtC(
                                    dist.type === "milestone"
                                      ? Math.max(0, (dist.displayBaseAmount || dist.amount || 0) - dist.totalInvoiced)
                                      : Math.max(0, (dist.displayBaseAmount || dist.amount || 0) - dist.totalPaid),
                                    currency,
                                  )} Remaining
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Payment History timeline */}
                          {dist.invoices.length > 0 && (
                            <div className="bg-slate-50/30 p-4 pt-3 border-t border-slate-50">
                              <div className="space-y-3">
                                <div className="relative pl-5 space-y-3 before:content-[''] before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                                  {dist.invoices.map((inv) => {
                                    const s = getStatusColor(inv.status);
                                    const invTds = Number(inv.tdsAmount || 0);
                                    const invNetPayable = Number(inv.invoiceAmount || 0) - invTds;
                                    const milestoneInvoiceAmount = dist.type === "milestone"
                                      ? getMilestoneInvoiceGrossAmount(inv, dist)
                                      : 0;
                                    return (
                                      <div key={inv._id} className="relative">
                                        <div className={`absolute -left-[20px] top-1 w-2 h-2 rounded-full border-2 border-white ring-1 ring-slate-100 ${s.bg} ${s.text.replace("text-", "bg-")}`} />
                                        <div className="text-[10px] space-y-0.5">
                                          <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                              <span className="font-black text-slate-700 tracking-tight uppercase">{inv.invoiceNo}</span>
                                              <span className="text-slate-400 font-bold">{fmt(inv.invoiceDate)}</span>
                                            </div>
                                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.25 rounded border ${s.bg} ${s.text} ${s.border}`}>
                                              {inv.status?.replace("_", " ")}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center text-[9px]">
                                            <span className="text-slate-400">
                                              {dist.type === "milestone" ? "Milestone Invoice" : "Total Invoice"}
                                            </span>
                                            <span className="font-black text-slate-700">
                                              {fmtC(dist.type === "milestone" ? milestoneInvoiceAmount : inv.invoiceAmount, currency)}
                                            </span>
                                          </div>
                                          {invTds > 0 && (
                                            <div className="flex justify-between items-center text-[9px]">
                                              <span className="text-violet-500">TDS</span>
                                              <span className="font-bold text-violet-600">– {fmtC(invTds, currency)}</span>
                                            </div>
                                          )}
                                          <div className="flex justify-between items-center text-[9px]">
                                            <span className="text-emerald-600 font-medium">Net Payable</span>
                                            <span className="font-black text-emerald-700">{fmtC(invNetPayable, currency)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ══ TIMELINE ══════════════════════════════════════════ */}
              {tab === "timeline" && (
                <div className="space-y-4">
                  <Card
                    title="PO Timeline & Audit Trail"
                    icon={Clock}
                    accent="linear-gradient(180deg,#2563eb,#60a5fa)"
                  >
                    <div className="relative pl-8">
                      {/* vertical line */}
                      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-300 via-slate-200 to-transparent rounded-full" />

                      <div className="space-y-5">
                        {/* Created */}
                        <div className="relative flex gap-4">
                          <div className="absolute -left-8 w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center">
                            <FileText size={10} className="text-white" />
                          </div>
                          <div className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-xs font-bold text-slate-800">Purchase Order Created</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">PO #{po.poNumber} was created</p>
                                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                  <Calendar size={10} /> {fmtT(po.createdAt)}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full border border-blue-200">Created</span>
                            </div>
                          </div>
                        </div>

                        {/* Status update */}
                        {po.status !== "draft" && (
                          <div className="relative flex gap-4">
                            <div className="absolute -left-8 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white shadow-md flex items-center justify-center">
                              <CheckCircle size={10} className="text-white" />
                            </div>
                            <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-xs font-bold text-slate-800">Status Updated</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Changed to <span className="font-black text-slate-700">{po.status.replace("_", " ").toUpperCase()}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                    <Calendar size={10} /> {fmtT(po.updatedAt)}
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-200">Updated</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {orderedInvoices.map((invoice, index) => (
                          (() => {
                            const breakdown = getInvoiceTimelineBreakdown(invoice);
                            const isMilestoneInvoice =
                              po?.billingModel === "milestone" &&
                              Array.isArray(invoice?.milestones) &&
                              invoice.milestones.length > 0;

                            const termSummary =
                              !isMilestoneInvoice && index >= 0
                                ? getTermTimelineSummary({
                                  po,
                                  invoice,
                                  invoiceIndex: index,
                                  orderedInvoices,
                                })
                                : null;

                            const milestoneSummary = isMilestoneInvoice
                              ? getMilestoneTimelineSummary({
                                po,
                                invoice,
                                invoiceIndex: index,
                                orderedInvoices,
                              })
                              : null;

                            const timelineSummary = milestoneSummary || termSummary;

                            // Fallback: use distributionsWithInvoices for monthly/weekly POs
                            const matchedDist = !timelineSummary
                              ? distributionsWithInvoices.find(d => d.invoices?.some(inv => inv._id === invoice._id))
                              : null;
                            const termAmount = timelineSummary
                              ? timelineSummary.scheduledTermAmount
                              : matchedDist
                                ? roundMoney(matchedDist.amount || 0)
                                : null;
                            const termLabel = termSummary
                              ? `Invoice Term Amount (Term ${termSummary.installmentNo}/${termSummary.totalInstallments})`
                              : matchedDist
                                ? `Invoice Term Amount (${matchedDist.title || `Term ${(matchedDist.index ?? 0) + 1}`})`
                                : timelineSummary
                                  ? "Invoice Term Amount"
                                  : null;
                            const actualInvoiceAmount = invoice.amountDue || invoice.invoiceAmount || breakdown.termInvoiceAmount;
                            const remainingFromTerm = timelineSummary
                              ? timelineSummary.remainingFromThisTerm
                              : (termAmount != null ? roundMoney(Math.max(0, termAmount - actualInvoiceAmount)) : 0);

                            return (
                              <div key={invoice._id || index} className="relative flex gap-4">
                                <div className="absolute -left-8 w-6 h-6 rounded-full bg-amber-500 border-2 border-white shadow-md flex items-center justify-center">
                                  <FileSignature size={10} className="text-white" />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedInvoiceId(invoice._id)}
                                  className="flex-1 text-left bg-amber-50 border border-amber-100 rounded-2xl p-4 hover:border-amber-300 hover:bg-amber-100/60 transition-all"
                                >
                                  <div className="flex justify-between items-start gap-3">
                                    <div>
                                      <p className="text-xs font-bold text-slate-800">Invoice Generated</p>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        {invoice.invoiceNo} · {fmtC(actualInvoiceAmount, currency)}
                                      </p>
                                      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                        <Calendar size={10} /> {fmtT(invoice.invoiceDate || invoice.createdAt)}
                                      </p>
                                      <p className="text-[10px] text-slate-400 mt-1.5">
                                        Status: <span className="font-black text-slate-700">{invoice.status?.replaceAll("_", " ")}</span>
                                      </p>

                                      {/* Invoice Term & Amount Breakdown */}
                                      <div className="mt-2 bg-white/70 border border-amber-200/60 rounded-xl p-2.5 space-y-1.5">
                                        {termAmount != null && termLabel && (
                                          <p className="text-[10px] text-slate-500">
                                            {termLabel}:{" "}
                                            <span className="font-black text-blue-700">{fmtC(termAmount, currency)}</span>
                                          </p>
                                        )}
                                        <p className="text-[10px] text-slate-500">
                                          Actual Invoice Amount:{" "}
                                          <span className="font-black text-slate-800">{fmtC(actualInvoiceAmount, currency)}</span>
                                        </p>
                                        {remainingFromTerm > 0 && (
                                          <p className="text-[10px] text-slate-500">
                                            Remaining from this term (carries to next):{" "}
                                            <span className="font-black text-amber-700">{fmtC(remainingFromTerm, currency)}</span>
                                          </p>
                                        )}
                                        {timelineSummary && timelineSummary.carryForwardFromPrevious > 0 && (
                                          <p className="text-[10px] text-slate-500">
                                            Carry forward from previous term:{" "}
                                            <span className="font-black text-violet-700">{fmtC(timelineSummary.carryForwardFromPrevious, currency)}</span>
                                          </p>
                                        )}
                                      </div>

                                      {/* Payment Info */}
                                      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {breakdown.tdsAmount > 0 && (
                                          <p className="text-[10px] text-slate-500">
                                            TDS Deducted: <span className="font-black text-violet-700">{fmtC(breakdown.tdsAmount, currency)}</span>
                                          </p>
                                        )}
                                        {breakdown.tdsAmount > 0 && (
                                          <p className="text-[10px] text-slate-500">
                                            Net Payable: <span className="font-black text-emerald-700">{fmtC(breakdown.netPayable, currency)}</span>
                                          </p>
                                        )}
                                        <p className="text-[10px] text-slate-500">
                                          Paid till date: <span className="font-black text-emerald-700">{fmtC(breakdown.paidAmount, currency)}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                          Remaining Amount: <span className="font-black text-amber-700">{fmtC(breakdown.remainingAmount, currency)}</span>
                                        </p>
                                      </div>
                                    </div>
                                    <span className="px-2 py-0.5 bg-white text-amber-700 text-[10px] font-black rounded-full border border-amber-200 whitespace-nowrap">View Invoice</span>
                                  </div>
                                </button>
                              </div>
                            );
                          })()
                        ))}

                        {/* Delivery — only if a delivery date exists */}
                        {po.deliveryDate && (
                          <div className="relative flex gap-4">
                            <div className="absolute -left-8 w-6 h-6 rounded-full bg-violet-500 border-2 border-white shadow-md flex items-center justify-center">
                              <Truck size={10} className="text-white" />
                            </div>
                            <div className="flex-1 bg-violet-50 border border-violet-100 rounded-2xl p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-xs font-bold text-slate-800">Delivery Schedule</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">Expected: {fmt(po.deliveryDate)}</p>
                                  {delSt && (
                                    <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-black border ${delSt.bg} ${delSt.color} ${delSt.border}`}>
                                      {delSt.text}
                                    </span>
                                  )}
                                </div>
                                <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-[10px] font-black rounded-full border border-violet-200">Scheduled</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* ══ DOCUMENTS ════════════════════════════════════════ */}
              {tab === "documents" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card
                      title="Generated Documents"
                      icon={FileText}
                      accent="linear-gradient(180deg,#1e3a8a,#60a5fa)"
                    >
                      <div className="space-y-2.5">
                        {[
                          {
                            label: "Purchase Order PDF",
                            sub: "Official document with signature",
                            accent: "bg-red-50 border-red-100",
                            icon: <FileText size={16} className="text-red-600" />,
                            type: "pdf",
                          },
                          {
                            label: "Purchase Order Word",
                            sub: "Editable Word document",
                            accent: "bg-blue-50 border-blue-100",
                            icon: <FileText size={16} className="text-blue-600" />,
                            type: "word",
                          },
                        ].map((d) => (
                          <button
                            key={d.label}
                            onClick={() => d.type === "word" ? handleDownloadWord(po._id, po.poNumber) : handleDownloadPDF()}
                            className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl border ${d.accent}`}>{d.icon}</div>
                              <div className="text-left">
                                <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{d.label}</p>
                                <p className="text-[10px] text-slate-400">{d.sub}</p>
                              </div>
                            </div>
                            <Download size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </Card>

                    <Card
                      title="Additional Information"
                      icon={MessageSquare}
                      accent="linear-gradient(180deg,#7c3aed,#a78bfa)"
                    >
                      <div className="space-y-4">
                        {po.notes && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notes</p>
                            <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 italic">"{po.notes}"</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Digital Signature</p>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border ${po.withSignature ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                            {po.withSignature ? <CheckCircle size={10} /> : <X size={10} />}
                            {po.withSignature ? "Signature included" : "No signature"}
                          </span>
                        </div>
                        {po.poreferencevalue && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reference</p>
                            <p className="text-xs font-mono font-semibold text-slate-800">{po.poreferencevalue}</p>
                          </div>
                        )}
                        {!po.notes && !po.poreferencevalue && (
                          <p className="text-xs text-slate-400 italic text-center py-4">No additional information available</p>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-slate-200 px-6 py-3 bg-white rounded-b-2xl flex items-center justify-between">
          <p className="text-[10px] text-slate-400">
            {po ? (
              <>Last updated: <span className="font-semibold text-slate-600">{fmtT(po.updatedAt)}</span></>
            ) : ""}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all"
            >
              Close
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}
            >
              <Printer size={13} /> Print PO
            </button>
          </div>
        </div>
      </div>

      <InvoiceDetailsModal
        isOpen={Boolean(selectedInvoiceId)}
        onClose={() => {
          setSelectedInvoiceId(null);
          fetchPO();
        }}
        invoiceId={selectedInvoiceId}
      />
    </div>
  );
};

export default PurchaseOrderDetailModal;
