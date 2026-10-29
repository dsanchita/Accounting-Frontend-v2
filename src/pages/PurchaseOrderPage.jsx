import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getallhsn } from "../apis/hsnapi";
import { getClientsPaginatedApi } from "../apis/clientApi";
import { getVendors, getVendorById } from "../apis/vendorApi";
import {
  createPurchaseOrderApi,
  getPurchaseOrderApi,
  updatePurchaseOrderApi,
} from "../apis/purchaseOrderApi";
import { getCompanyByIdApi } from "../apis/userApi";
import { getAllCountryTaxApi } from "../apis/countryTaxApi";
import {
  X,
  ChevronDown,
  Loader2,
  Check,
  Plus,
  Trash2,
  Building,
  FileText,
  Target,
  Calendar,
  Clock,
  ArrowLeft,
  Info,
  AlertCircle,
  ChevronRight,
  Briefcase,
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  CreditCard,
  CalendarDays,
  Receipt,
  ListChecks,
  Edit2,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import dayjs from "dayjs";
import {
  splitMonthlyPeriods,
  calculateMonthlyDistributionBreakdown,
} from "../utils/monthlyPeriodUtils";

// ─────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────

const PAYMENT_TERMS_OPTIONS = [
  {
    key: "milestone",
    label: "Milestone Based",
    icon: Target,
    hint: "Invoice raised when each milestone is completed",
  },
  {
    key: "monthly",
    label: "Monthly",
    icon: Calendar,
    hint: "Fixed monthly invoice raised at the start/end of each month",
  },
  {
    key: "weekly",
    label: "Weekly",
    icon: CalendarDays,
    hint: "Invoice raised every week",
  },
];

const colorMap = {
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    ring: "ring-blue-400",
    dashed: "hover:border-blue-300 hover:text-blue-500",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    ring: "ring-amber-400",
    dashed: "hover:border-amber-300 hover:text-amber-500",
  },
};

const today = () => new Date().toISOString().split("T")[0];

const formatAddressLines = (address = {}) =>
  [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.country,
    address.pinCode,
  ]
    .filter(Boolean)
    .join(", ");

const buildTaxDetails = (entity = {}) => {
  const normalizedTaxDetails = Array.isArray(entity.taxDetails)
    ? entity.taxDetails
      .map((tax) => ({
        label: tax?.label || tax?.taxType || "",
        taxType: tax?.taxType || tax?.label || "",
        taxNumber: tax?.taxNumber || "",
      }))
      .filter((tax) => tax.label && tax.taxNumber)
    : [];

  const legacyTaxFields = [
    ["GST", entity.GSTIN || entity.gstNumber || entity.gstin],
    ["PAN", entity.panNumber],
    ["VAT", entity.vatNumber],
    ["EIN", entity.einNumber],
    ["SSN", entity.ssnNumber],
    ["Company No.", entity.companyNumber],
    ["National ID", entity.nationalIdNumber],
    [entity.taxIdentifierType || "Tax ID", entity.taxIdentificationNumber],
  ]
    .filter(([, value]) => value)
    .map(([label, taxNumber]) => ({
      label,
      taxType: label,
      taxNumber,
    }));

  const seen = new Set();
  return [...normalizedTaxDetails, ...legacyTaxFields].filter((tax) => {
    const key = `${tax.label}-${tax.taxNumber}`;
    if (!tax.taxNumber || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildAddressOption = (address = {}, fallbackEntity = {}) => {
  const taxDetails = buildTaxDetails({
    taxDetails: address.taxDetails,
    gstNumber: address.taxNumber,
    GSTIN: address.taxNumber,
  });

  return {
    _id: address._id || fallbackEntity._id,
    label: address.label || "",
    type: address.type || (address.isShipTo ? "SHIP_TO" : address.isDefault ? "DEFAULT" : "OTHER"),
    name:
      address.label ||
      address.name ||
      fallbackEntity.clientName ||
      fallbackEntity.vendorName ||
      fallbackEntity.name ||
      "",
    address: formatAddressLines(address) || fallbackEntity.address || "",
    line1: address.line1 || "",
    line2: address.line2 || "",
    city: address.city || "",
    state: address.state || "",
    country: address.country || fallbackEntity.clientCountry || fallbackEntity.country || "",
    pinCode: address.pinCode || "",
    stateCode: address.stateCode || address.gstStateCode || fallbackEntity.stateCode || "",
    GSTIN: address.taxNumber || fallbackEntity.GSTIN || "",
    taxDetails,
    isDefault: !!address.isDefault,
    isShipTo: !!address.isShipTo,
  };
};

const STEPS = [
  { id: 1, label: "Entity", icon: Building },
  { id: 2, label: "PO Details & Items", icon: FileText },
  { id: 3, label: "Payment Terms", icon: Briefcase },
  { id: 4, label: "Review", icon: Check },
];

// ─────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function PurchaseOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const editId = searchParams.get("edit");
  const prefilledClientId = searchParams.get("clientId");
  const prefilledVendorId = searchParams.get("vendorId");
  const urlDirection = searchParams.get("direction");

  const isVendorMode = !!prefilledVendorId || urlDirection === "payable";
  const mode = isVendorMode ? "vendor" : "client";
  const lockedDirection = mode === "client" ? "receivable" : "payable";

  const selectedCompany = JSON.parse(localStorage.getItem("selectedCompany") || "{}");
  const companyId =
    localStorage.getItem("selectedCompanyId") ||
    user?.company?._id ||
    selectedCompany?._id;

  const [step, setStep] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [createdPOId, setCreatedPOId] = useState(null);

  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [hsnList, setHsnList] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [countryTaxList, setCountryTaxList] = useState([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const [deliverToSearch, setDeliverToSearch] = useState("");
  const [deliverToDropdownOpen, setDeliverToDropdownOpen] = useState(false);
  const [distributionBreakdown, setDistributionBreakdown] = useState([]);

  const [form, setForm] = useState({
    companyId,
    direction: lockedDirection,
    paymentTerms: "",
    poCategory: "project",
    billingModel: "fixed",
    poDate: today(),
    deliveryDate: today(),
    poreferencevalue: "",
    currency: "INR",
    client: { _id: "", name: "", address: "", stateCode: "", GSTIN: "", taxDetails: [], currencySymbol: "₹", currencyCode: "INR", currencyName: "Indian Rupee", defaultAddress: null, addressOptions: [] },
    vendor: { _id: "", name: "", address: "", stateCode: "", GSTIN: "", taxDetails: [], currencySymbol: "₹", currencyCode: "INR", currencyName: "Indian Rupee", defaultAddress: null, addressOptions: [] },
    deliverTo: { name: "", address: "", stateCode: "", GSTIN: "", taxDetails: [], country: "", line1: "", line2: "", city: "", state: "", pinCode: "" },
    items: [
      {
        description: "",
        hsnSac: "",
        hsnId: null,
        quantity: 1,
        unit: "each",
        rate: 0,
        taxableValue: 0,
        gstRate: 18,
        gstAmount: 0,
        totalAmount: 0,
      },
    ],
    milestones: [],
    totalAmount: 0,
    totalTaxableValue: 0,
    totalGSTAmount: 0,
    totalCGSTAmount: 0,
    totalSGSTAmount: 0,
    totalIGSTAmount: 0,
    valueInWords: "",
    withSignature: false,
    notes: "",
    invoiceSchedule: [],
  });

  const toDateInputValue = (isoString) => {
    if (!isoString) return "";
    return new Date(isoString).toISOString().split("T")[0]; // "2026-04-28"
  };



  const [sameAsDeliverTo, setSameAsDeliverTo] = useState(false);
  const directionColor = form.direction === "payable" ? "amber" : "blue";
  const colors = colorMap[directionColor];

  const getTotalGstRate = (hsn) => {
    if (hsn.igst && hsn.igst > 0) return Number(hsn.igst);
    return (Number(hsn.cgst) || 0) + (Number(hsn.sgst) || 0);
  };

  // ─────────────────────────────────────────────────────────────
  //  TAX TYPE DECISION LAYER
  // ─────────────────────────────────────────────────────────────
  /**
   * Returns 'IN' for India, or the country code (uppercase) for foreign.
   */
  const getCountryFlag = (countryStr = "") => {
    if (!countryStr) return "IN"; // default India
    const normalized = countryStr.trim().toLowerCase();
    if (
      normalized === "india" ||
      normalized === "in" ||
      normalized === "ind"
    ) return "IN";

    // Attempt exact dictionary match using the fetched master data
    // to map strings like "United States" to "US" correctly.
    if (countryTaxList && countryTaxList.length > 0) {
      const match = countryTaxList.find((ct) =>
        ct.countryName.toLowerCase() === normalized ||
        ct.countryCode.toLowerCase() === normalized
      );
      if (match) return match.countryCode.toUpperCase();
    }

    // Try to extract ISO code from something like 'US', 'USA'
    // Fallback for missing configurations
    if (normalized === "usa" || normalized === "united states") return "US";
    if (normalized === "uk" || normalized === "united kingdom") return "GB";

    return countryStr.trim().toUpperCase().substring(0, 2);
  };

  /**
   * Get the party (client/vendor) country code.
   */
  const getPartyCountry = () => {
    const entity = mode === "client" ? form.client : form.vendor;
    const raw =
      entity?.clientCountry ||
      entity?.country ||
      entity?.defaultAddress?.country ||
      "";
    return getCountryFlag(raw);
  };

  /**
   * Get the company's country code.
   */
  const getCompanyCountry = () => {
    const raw =
      companyInfo?.country ||
      companyInfo?.address?.country ||
      companyInfo?.registeredAddress?.country ||
      "IN";
    return getCountryFlag(raw);
  };

  /**
   * Determine the applicable tax type for the current PO.
   *
   * Returns one of: 'GST' | 'RCM' | 'NONE' | <Dynamic from CountryTaxMaster>
   */
  const determineTaxType = () => {
    const companyCountry = getCompanyCountry();
    const partyCountry = getPartyCountry();

    const isCompanyIndia = companyCountry === "IN";
    const isPartyIndia = partyCountry === "IN" || partyCountry === "";

    // Case 1: India → India → GST
    if (isCompanyIndia && isPartyIndia) return "GST";

    // Case 2: India → Foreign → Retrieve from Country Tax Master (e.g. VAT, SALES_TAX, etc.)
    if (isCompanyIndia && !isPartyIndia) {
      const ct = getForeignCountryTax(partyCountry);
      return ct ? ct.taxType : "SALES_TAX"; // fallback if missing
    }

    // Case 3: Foreign → India → RCM
    if (!isCompanyIndia && isPartyIndia) return "RCM";

    // Case 4: Foreign → Foreign → NONE
    return "NONE";
  };

  /**
   * Get the foreign country tax rate from countryTaxList.
   * Returns { taxRate, taxLabel, taxType } or null.
   */
  const getForeignCountryTax = (partyCountry) => {
    if (!partyCountry || partyCountry === "IN") return null;
    return (
      countryTaxList.find(
        (ct) =>
          ct.countryCode.toUpperCase() === partyCountry.toUpperCase() &&
          ct.isActive
      ) || null
    );
  };

  /**
   * Returns a display label for the current tax regime (e.g. "GST", "Sales Tax", "VAT")
   */
  const getTaxLabel = (short = false) => {
    const taxType = determineTaxType();
    let label = "Tax";
    if (taxType === "GST") label = "GST";
    else if (taxType === "RCM") label = "RCM";
    else if (taxType === "NONE") label = "Tax";
    else {
      const partyCountry = getPartyCountry();
      const ct = getForeignCountryTax(partyCountry);
      if (ct && ct.taxLabel) label = ct.taxLabel;
      else if (ct && ct.taxType) label = ct.taxType.replace("_", " ");
      else label = taxType.replace("_", " ");
    }
    if (short && label.length > 3) {
      return label.substring(0, 3).toUpperCase();
    }
    return label;
  };

  const getTaxIdLabel = () => {
    const country = getPartyCountry();
    if (country === "IN") return "GSTIN";
    if (country === "US") return "EIN / SSN";
    return "Tax ID";
  };

  const normalizeStateCode = (value = "") => {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) return "";
    const digitMatch = normalized.match(/^(\d{2})/);
    if (digitMatch) return digitMatch[1];
    const alphaMatch = normalized.match(/^([A-Z]{2})/);
    return alphaMatch ? alphaMatch[1] : normalized;
  };

  const getCompanyStateCode = () => {
    const companyGstin =
      companyInfo?.taxDetails?.gstin ||
      companyInfo?.taxDetails?.gstNumber ||
      companyInfo?.gstin ||
      companyInfo?.gstNumber ||
      "";
    return normalizeStateCode(companyGstin);
  };

  const calculateGstTotals = (items = []) => {
    let totalTaxable = 0;
    let totalTax = 0;
    let totalAmount = 0;

    items.forEach((item) => {
      totalTaxable += Number(item.taxableValue) || 0;
      totalTax += Number(item.gstAmount) || 0;
      totalAmount += Number(item.totalAmount) || 0;
    });

    const taxType = determineTaxType();

    // Only split CGST/SGST for India→India intra-state GST
    let totalCGSTAmount = 0;
    let totalSGSTAmount = 0;
    let totalIGSTAmount = 0;

    if (taxType === "GST") {
      const companyStateCode = getCompanyStateCode();
      const shipToStateCode = normalizeStateCode(form.deliverTo?.stateCode);
      const isIntraState =
        !!companyStateCode &&
        !!shipToStateCode &&
        companyStateCode === shipToStateCode;

      totalCGSTAmount = isIntraState ? Math.round((totalTax / 2) * 100) / 100 : 0;
      totalSGSTAmount = isIntraState ? Math.round((totalTax / 2) * 100) / 100 : 0;
      totalIGSTAmount = isIntraState ? 0 : Math.round(totalTax * 100) / 100;
    }
    // For SALES_TAX / RCM / NONE — no CGST/SGST/IGST split

    return {
      totalTaxableValue: Math.round(totalTaxable * 100) / 100,
      totalGSTAmount: Math.round(totalTax * 100) / 100,
      totalCGSTAmount,
      totalSGSTAmount,
      totalIGSTAmount,
      totalAmount: Math.round(totalAmount * 100) / 100,
      taxType,
    };
  };

  // Initialize milestones when paymentTerms becomes "milestone"
  useEffect(() => {
    if (form.paymentTerms === "milestone" && form.milestones.length === 0) {
      setForm(prev => ({
        ...prev,
        milestones: [{
          title: "",
          description: "",
          amount: 0,
          percentage: 0,
          dueDate: today(),
          status: "pending",
        }],
      }));
    }
  }, [form.paymentTerms]);

  // ─────────────────────────────────────────────────────────────
  //  DATA LOADING
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        if (mode === "client") {
          const clientsRes = await getClientsPaginatedApi({ companyId, limit: 1000, page: 1 });
          let clientsArray = [];
          if (clientsRes?.data?.clients) clientsArray = clientsRes.data.clients;
          else if (clientsRes?.clients) clientsArray = clientsRes.clients;
          else if (Array.isArray(clientsRes)) clientsArray = clientsRes;
          const normalized = clientsArray.map((c) => {
            const defaultAddress = c.defaultAddress || {};
            const allAddresses = [
              buildAddressOption({ ...defaultAddress, isDefault: true, type: defaultAddress.type || "DEFAULT" }, c),
              ...((c.additionalAddresses || c.addresses || []).map((address) => buildAddressOption(address, c))),
            ].filter((address, index, list) => address.address && list.findIndex((candidate) => candidate._id === address._id && candidate.address === address.address) === index);
            const shipToAddress =
              allAddresses.find((address) => address?.type === "SHIP_TO" || address?.isShipTo) || {};
            const entityTaxDetails = buildTaxDetails(c);

            return {
              _id: c._id,
              name: c.name || c.clientName || c.contactPerson || "",
              address: c.address || c.clientAddress || formatAddressLines(defaultAddress) || "",
              stateCode: c.stateCode || c.gstStateCode || defaultAddress.stateCode || c.clientState || "",
              GSTIN: c.GSTIN || c.gstNumber || "",
              taxNumber: c.taxNumber || c.gstNumber || "",
              taxDetails: entityTaxDetails,
              clientName: c.clientName || c.name,
              clientCode: c.clientCode,
              clientCountry: c.clientCountry || c.country,
              currencyCode: c.currencyCode || c.currency || "INR",
              currencySymbol: c.currencySymbol || c.currency?.symbol || "₹",
              currencyName: c.currencyName || c.currency?.name || "Indian Rupee",
              defaultAddress: allAddresses[0] || null,
              shipToAddress: shipToAddress.address ? shipToAddress : null,
              addressOptions: allAddresses,
            };
          });
          setClients(normalized);
        } else {
          const vendorRes = await getVendors();
          let vendorList = vendorRes.data?.data?.vendors || vendorRes.data?.vendors || [];
          const normalized = vendorList.map((v) => {
            const defaultAddress = v.defaultAddress || v.billingAddress || {};
            const allAddresses = [
              buildAddressOption({ ...defaultAddress, isDefault: true, type: defaultAddress.type || "DEFAULT" }, v),
              ...((v.additionalAddresses || v.addresses || []).map((address) => buildAddressOption(address, v))),
            ].filter((address, index, list) => address.address && list.findIndex((candidate) => candidate._id === address._id && candidate.address === address.address) === index);
            let address = v.address || v.vendorAddress || formatAddressLines(defaultAddress) || v.registeredAddress || "";
            let stateCode = v.stateCode || v.gstStateCode || defaultAddress.stateCode || v.vendorState || "";
            let gstin = v.gstNumber || v.gstin || v.GSTIN || "";
            return {
              _id: v._id,
              name: v.vendorName || v.name || "",
              address: address,
              stateCode: stateCode,
              GSTIN: gstin,
              taxNumber: gstin || v.panNumber || "",
              taxDetails: buildTaxDetails(v),
              vendorName: v.vendorName,
              vendorCode: v.vendorCode,
              country: v.country || "",
              email: v.email || "",
              currencyCode: v.currencyCode || v.currency || "INR",
              currencySymbol: v.currencySymbol || v.currency?.symbol || "₹",
              currencyName: v.currencyName || v.currency?.name || "Indian Rupee",
              defaultAddress: allAddresses[0] || null,
              addressOptions: allAddresses,
            };
          });
          setVendors(normalized);
        }
      } catch (e) {
        console.error("Failed to load entities:", e);
        setError(`Could not load ${mode === "client" ? "clients" : "vendors"}. Please refresh.`);
      }
    })();
  }, [companyId, mode]);

  useEffect(() => {
    // Always fetch all HSN codes (global master data) - no companyId filter
    getallhsn()
      .then(res => {
        let hsnArray = [];
        if (res?.data?.data) hsnArray = res.data.data;
        else if (res?.data) hsnArray = res.data;
        else if (Array.isArray(res)) hsnArray = res;
        setHsnList(hsnArray);
      })
      .catch(console.error);
  }, []);

  // Fetch country tax master list
  useEffect(() => {
    getAllCountryTaxApi()
      .then((res) => setCountryTaxList(res?.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (companyId) {
      getCompanyByIdApi(companyId)
        .then((res) => setCompanyInfo(res?.data?.data || res?.data))
        .catch(console.error);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId || editId) return;
    if (prefilledClientId && mode === "client") {
      const found = clients.find(c => c._id === prefilledClientId);
      if (found) {
        setForm(prev => ({
          ...prev,
          client: {
            ...found,
            address: found.defaultAddress?.address || found.address,
            stateCode: found.defaultAddress?.stateCode || found.stateCode,
          },
          deliverTo: sameAsDeliverTo
            ? (found.defaultAddress?.address ? found.defaultAddress : found)
            : (found.shipToAddress?.address ? found.shipToAddress : prev.deliverTo),
        }));
      }
    } else if (prefilledVendorId && mode === "vendor") {
      getVendorById(prefilledVendorId)
        .then(res => {
          const vendor = res.data?.data || res.data;
          const defaultAddress = vendor.defaultAddress || vendor.billingAddress || {};
          const allAddresses = [
            buildAddressOption({ ...defaultAddress, isDefault: true, type: defaultAddress.type || "DEFAULT" }, vendor),
            ...((vendor.additionalAddresses || vendor.addresses || []).map((address) => buildAddressOption(address, vendor))),
          ].filter((address, index, list) => address.address && list.findIndex((candidate) => candidate._id === address._id && candidate.address === address.address) === index);
          const vendorObj = {
            _id: vendor._id,
            name: vendor.vendorName || vendor.name,
            address: vendor.address || vendor.vendorAddress || formatAddressLines(defaultAddress) || "",
            stateCode: vendor.stateCode || vendor.gstStateCode || defaultAddress.stateCode || "",
            GSTIN: vendor.gstNumber || vendor.gstin || "",
            taxDetails: buildTaxDetails(vendor),
            currencyCode: vendor.currencyCode || vendor.currency || "INR",
            currencySymbol: vendor.currencySymbol || vendor.currency?.symbol || "₹",
            currencyName: vendor.currencyName || vendor.currency?.name || "Indian Rupee",
            defaultAddress: allAddresses[0] || null,
            addressOptions: allAddresses,
          };
          setForm(prev => ({
            ...prev,
            vendor: vendorObj,
            deliverTo: sameAsDeliverTo ? vendorObj : prev.deliverTo,
          }));
        })
        .catch(console.error);
    }
  }, [clients, prefilledClientId, prefilledVendorId, mode, editId, companyId, sameAsDeliverTo]);

  useEffect(() => {
    if (editId) {
      setIsEditing(true);
      getPurchaseOrderApi(editId)
        .then((res) => {
          const d = res.data?.data || res.data;
          const fmt = (date) => (date ? new Date(date).toISOString().split("T")[0] : "");

          // Load items from saved PO
          const loadedItems = d.items?.map((item) => ({ ...item, total: item.totalAmount })) || [];

          // Recalculate tax totals from items (fixes bug where old tax values were persisted)
          const freshTotals = calculateGstTotals(loadedItems);

          setForm(prev => ({
            ...prev,
            ...d,
            paymentTerms: d.paymentTerms || d.billingModel || prev.paymentTerms,
            direction: d.direction || lockedDirection,
            client: d.vendor || d.client || prev.client,
            vendor: d.vendor || d.client || prev.vendor,
            deliverTo: d.deliverTo || prev.deliverTo,
            poDate: fmt(d.poDate),
            deliveryDate: fmt(d.deliveryDate),
            items: loadedItems,
            milestones: (d.milestones || []).map((m) => ({
              ...m,
              dueDate: fmt(m.dueDate), // "2026-04-28T00:00:00.000Z" → "2026-04-28"
            })),
            // Override with recalculated tax totals
            ...freshTotals,
            valueInWords: numberToWords(freshTotals.totalAmount),
          }));
        })
        .catch(err => {
          console.error(err);
          setError("Could not load purchase order details.");
        });
    }
  }, [editId, lockedDirection]);

  useEffect(() => {
    if (form.paymentTerms === "monthly" && form.poDate && form.deliveryDate && form.totalAmount > 0) {
      calculateMonthlyDistribution();
    } else if (form.paymentTerms === "weekly" && form.poDate && form.deliveryDate && form.totalAmount > 0) {
      calculateWeeklyDistribution();
    } else {
      setDistributionBreakdown([]);
    }
    // CRITICAL FIX: Removed form.milestones from dependency array to prevent infinite render loop
    // Breakdown should only recalculate when PO structure changes (dates, terms, total),
    // NOT when individual milestone values are edited by user
  }, [form.paymentTerms, form.poDate, form.deliveryDate, form.totalAmount]);

  // ─── SEPARATE: Update milestone breakdown when milestones are edited ───
  // This effect only updates the display breakdown, NOT the form itself, so no infinite loop
  useEffect(() => {
    if (form.paymentTerms === "milestone" && form.milestones.length > 0) {
      calculateMilestoneBreakdown();
    }
  }, [form.paymentTerms, form.milestones]);

  // ─── FIX: Recalculate milestone amounts when total amount changes ───
  // When editing items in Step 2, total amount changes. Milestones set by percentage
  // must update their amounts to reflect the new total. This ensures milestone amounts
  // are always consistent with the PO total. (REMOVED DUPLICATE useEffect)
  useEffect(() => {
    if (form.paymentTerms === "milestone" && form.milestones.length > 0) {
      setForm(prev => {
        // Check if any milestone actually has a percentage set
        const hasMilestoneWithPercentage = prev.milestones.some(m => m.percentage && m.percentage > 0);
        if (!hasMilestoneWithPercentage) return prev; // No recalculation needed

        const updatedMilestones = prev.milestones.map(m => {
          // If milestone has a percentage, recalculate amount based on new total
          if (m.percentage && m.percentage > 0) {
            const newAmount = Math.round((prev.totalAmount * m.percentage) / 100 * 100) / 100;
            return {
              ...m,
              amount: newAmount,
            };
          }
          return m;
        });
        return { ...prev, milestones: updatedMilestones };
      });
    }
  }, [form.totalAmount]); // Recalculate whenever totalAmount changes

  const calculateMonthlyDistribution = () => {
    const start = dayjs(form.poDate);
    const end = dayjs(form.deliveryDate);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
      setDistributionBreakdown([]);
      return;
    }

    const taxType = determineTaxType();
    const result = calculateMonthlyDistributionBreakdown({
      poDate: form.poDate,
      deliveryDate: form.deliveryDate,
      items: form.items,
      taxType,
    });

    if (result.breakdown.length === 0) {
      setDistributionBreakdown([]);
      return;
    }

    const breakdown = result.breakdown.map((item) => ({
      period: item.period,
      periodLabel: item.periodLabel,
      amount: item.amount,
      taxableValue: item.taxableValue,
      rate: item.rate,
      daysInPeriod: item.daysInPeriod,
      totalDaysInMonth: item.totalDaysInMonth,
      daysText: item.daysText,
      ratio: item.ratio,
      date: item.startDate,
      startDate: dayjs(item.startDate).format("DD MMM YYYY"),
      endDate: dayjs(item.endDate).format("DD MMM YYYY"),
    }));

    setDistributionBreakdown(breakdown);
  };

  const calculateWeeklyDistribution = () => {
    const start = dayjs(form.poDate);
    const end = dayjs(form.deliveryDate);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
      setDistributionBreakdown([]);
      return;
    }
    const totalDays = end.diff(start, "day") + 1;
    let numWeeks = Math.ceil(totalDays / 7);
    if (numWeeks < 1) numWeeks = 1;
    const amountPerWeek = form.totalAmount / numWeeks;
    const breakdown = [];
    let current = start.clone();
    for (let i = 0; i < numWeeks; i++) {
      let weekEnd = current.add(6, "day");
      if (weekEnd.isAfter(end)) weekEnd = end;
      breakdown.push({
        period: `Week ${i + 1}`,
        amount: amountPerWeek,
        date: current.format("YYYY-MM-DD"),
        startDate: current.format("DD MMM YYYY"),
        endDate: weekEnd.format("DD MMM YYYY"),
      });
      current = weekEnd.add(1, "day");
    }
    setDistributionBreakdown(breakdown);
  };

  const calculateMilestoneBreakdown = () => {
    const breakdown = form.milestones.map((m, idx) => ({
      period: m.title || `Milestone ${idx + 1}`,
      amount: m.amount || 0,
      percentage: m.percentage || 0,
      dueDate: m.dueDate,
    }));
    setDistributionBreakdown(breakdown);
  };

  // ─── FIX: Validate milestone percentages and amounts ───
  const validateMilestones = () => {
    if (form.paymentTerms !== "milestone" || form.milestones.length === 0) {
      return { isValid: true, message: "" };
    }

    const totalPercentage = form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0);
    const totalAmount = form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0);

    // Check if all milestones have title
    const hasEmptyTitle = form.milestones.some(m => !m.title || !m.title.trim());
    if (hasEmptyTitle) {
      return { isValid: false, message: "All milestones must have a title." };
    }

    // Check if all milestones have amount > 0
    const hasZeroAmount = form.milestones.some(m => !m.amount || m.amount <= 0);
    if (hasZeroAmount) {
      return { isValid: false, message: "All milestones must have amount > 0." };
    }

    // Validate percentage: Allow 0.5% tolerance for rounding errors
    const percentageTolerance = 0.5;
    if (Math.abs(totalPercentage - 100) > percentageTolerance) {
      return { isValid: false, message: `Milestone percentages must sum to 100% (currently ${totalPercentage.toFixed(2)}%). Adjust milestones to reach exactly 100%.` };
    }

    // Validate amount: Allow ±0.01 per item or 0.1% of total, whichever is larger
    const amountTolerance = Math.max(form.milestones.length * 0.01, form.totalAmount * 0.001);
    const expectedAmount = form.totalAmount;
    if (Math.abs(totalAmount - expectedAmount) > amountTolerance) {
      const difference = Math.abs(totalAmount - expectedAmount);
      return { isValid: false, message: `Milestone amounts must sum to ${formatMoney(expectedAmount)} (currently ${formatMoney(totalAmount)}). Difference: ${formatMoney(difference)}.` };
    }

    return { isValid: true, message: "" };
  };

  const filteredEntities = (mode === "client" ? clients : vendors).filter(e => {
    if (!entitySearch.trim()) return true;
    const q = entitySearch.toLowerCase();
    return (
      (e.name || "").toLowerCase().includes(q) ||
      (e.taxNumber || "").toLowerCase().includes(q) ||
      (e.clientCode || e.vendorCode || "").toLowerCase().includes(q) ||
      (e.address || "").toLowerCase().includes(q) ||
      (e.taxDetails || []).some((tax) => `${tax.label} ${tax.taxNumber}`.toLowerCase().includes(q))
    );
  });

  const selectedEntity = mode === "client" ? form.client : form.vendor;
  const currencySymbol = selectedEntity?.currencySymbol || "₹";
  const currencyCode = selectedEntity?.currencyCode || form.currency || "INR";
  const currencyName = selectedEntity?.currencyName || "Indian Rupee";
  const formatMoney = (value) =>
    `${currencySymbol} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const getTaxDisplay = (entity) =>
    (entity?.taxDetails || []).filter((tax) => tax?.label && tax?.taxNumber);
  const selectedEntityTaxDetails = getTaxDisplay(selectedEntity);
  const deliverToOptions = mode === "client" ? (form.client?.addressOptions || []) : [];
  const filteredDeliverToOptions = deliverToOptions.filter((address) => {
    if (!deliverToSearch.trim()) return true;
    const q = deliverToSearch.toLowerCase();
    return (
      `${address.name} ${address.label} ${address.address} ${address.stateCode} ${address.GSTIN}`
        .toLowerCase()
        .includes(q)
    );
  });

  // ─────────────────────────────────────────────────────────────
  //  FORM HELPERS
  // ─────────────────────────────────────────────────────────────
  const calculateItemValues = (item, paymentTerms, poDate, deliveryDate, taxType) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const rate = Math.max(0, Number(item.rate || 0));
    let taxableValue = 0;

    let periods = [];
    if (paymentTerms === "monthly" && poDate && deliveryDate) {
      periods = splitMonthlyPeriods(poDate, deliveryDate);
    }

    if (paymentTerms === "monthly" && periods.length > 0) {
      taxableValue = periods.reduce((sum, p) => {
        const pRate = Math.round((rate * p.ratio + Number.EPSILON) * 100) / 100;
        return Math.round((sum + quantity * pRate + Number.EPSILON) * 100) / 100;
      }, 0);
    } else {
      taxableValue = Math.round((quantity * rate + Number.EPSILON) * 100) / 100;
    }

    let gstRate = item.gstRate;
    let gstAmount = 0;
    let totalAmount = taxableValue;

    if (taxType === "GST") {
      gstAmount = Math.round(((taxableValue * gstRate) / 100 + Number.EPSILON) * 100) / 100;
      totalAmount = Math.round((taxableValue + gstAmount + Number.EPSILON) * 100) / 100;
    } else if (taxType === "RCM") {
      gstAmount = Math.round(((taxableValue * gstRate) / 100 + Number.EPSILON) * 100) / 100;
      totalAmount = taxableValue;
    } else if (taxType === "NONE") {
      gstRate = 0;
      gstAmount = 0;
      totalAmount = taxableValue;
    } else {
      const partyCountry = getPartyCountry();
      const countryTax = getForeignCountryTax(partyCountry);
      gstRate = countryTax ? countryTax.taxRate : 0;
      gstAmount = Math.round(((taxableValue * gstRate) / 100 + Number.EPSILON) * 100) / 100;
      totalAmount = Math.round((taxableValue + gstAmount + Number.EPSILON) * 100) / 100;
    }

    return {
      ...item,
      quantity,
      rate,
      taxableValue,
      gstRate,
      gstAmount,
      totalAmount,
      taxRate: gstRate,
      taxAmount: gstAmount,
      combinedTaxRate: gstRate,
    };
  };

  const set = (path, value) => {
    setForm((prev) => {
      const parts = path.split(".");
      let updated;
      if (parts.length === 1) {
        updated = { ...prev, [path]: value };
      } else {
        updated = { ...prev };
        let ref = updated;
        for (let i = 0; i < parts.length - 1; i++) {
          ref[parts[i]] = { ...ref[parts[i]] };
          ref = ref[parts[i]];
        }
        ref[parts[parts.length - 1]] = value;
      }

      if ((path === "poDate" || path === "deliveryDate") && updated.paymentTerms === "monthly") {
        const taxType = determineTaxType();
        const recalculatedItems = (updated.items || []).map((item) =>
          calculateItemValues(item, "monthly", updated.poDate, updated.deliveryDate, taxType)
        );
        const totals = calculateGstTotals(recalculatedItems);
        return {
          ...updated,
          items: recalculatedItems,
          ...totals,
          valueInWords: numberToWords(totals.totalAmount),
        };
      }

      return updated;
    });
  };

  const selectEntity = (entity) => {
    setForm(prev => {
      let updatedForm = { ...prev };

      if (mode === "client") {
        const defaultAddress = entity.defaultAddress?.address ? entity.defaultAddress : entity;
        const shipToAddress = entity.shipToAddress?.address ? entity.shipToAddress : null;
        updatedForm = {
          ...updatedForm,
          client: {
            ...entity,
            name: entity.name,
            address: defaultAddress.address || entity.address,
            stateCode: defaultAddress.stateCode || entity.stateCode,
          },
          deliverTo: sameAsDeliverTo
            ? defaultAddress
            : (shipToAddress || prev.deliverTo),
          currency: entity.currencyCode || prev.currency,
        };
        setDeliverToSearch(shipToAddress?.label || shipToAddress?.name || "");
      } else {
        updatedForm = {
          ...updatedForm,
          vendor: entity,
          deliverTo: sameAsDeliverTo ? entity.defaultAddress || entity : prev.deliverTo,
          currency: entity.currencyCode || prev.currency
        };
      }

      // --- RECALCULATE ALL ITEMS TAX BASED ON NEW ENTITY ---
      const companyCountry = getCompanyCountry();
      // Use the newly selected entity's country
      const rawPartyCountry = entity.clientCountry || entity.country || entity.defaultAddress?.country || "";
      const partyCountryCode = getCountryFlag(rawPartyCountry);

      const isCompanyIndia = companyCountry === "IN";
      const isPartyIndia = partyCountryCode === "IN" || partyCountryCode === "";

      let newTaxType = "NONE";
      if (isCompanyIndia && isPartyIndia) newTaxType = "GST";
      else if (isCompanyIndia && !isPartyIndia) newTaxType = "SALES_TAX"; // Placeholder, will fix rate below
      else if (!isCompanyIndia && isPartyIndia) newTaxType = "RCM";

      if (newTaxType === "SALES_TAX") {
        const ct = getForeignCountryTax(partyCountryCode);
        newTaxType = ct ? ct.taxType : "SALES_TAX";
      }

      const updatedItems = updatedForm.items.map(item => {
        const taxableValue = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
        let gstRate = item.gstRate;
        let gstAmount = 0;
        let totalAmount = taxableValue;

        if (newTaxType === "GST") {
          // Keep item's HSN rate if possible, or 18 default
          gstAmount = (taxableValue * gstRate) / 100;
          totalAmount = taxableValue + gstAmount;
        } else if (newTaxType === "RCM") {
          gstAmount = (taxableValue * gstRate) / 100;
          totalAmount = taxableValue; // Buyer pays tax
        } else if (newTaxType === "NONE") {
          gstRate = 0;
          gstAmount = 0;
          totalAmount = taxableValue;
        } else {
          // Foreign (Sales Tax, VAT, etc)
          const ct = getForeignCountryTax(partyCountryCode);
          gstRate = ct ? ct.taxRate : 18;
          gstAmount = (taxableValue * gstRate) / 100;
          totalAmount = taxableValue + gstAmount;
        }

        // CRITICAL: Sync taxRate/taxAmount with gstRate/gstAmount
        return { ...item, gstRate, gstAmount, totalAmount, taxableValue, taxRate: gstRate, taxAmount: gstAmount, combinedTaxRate: gstRate };
      });

      updatedForm.items = updatedItems;
      const finalTotals = calculateGstTotals(updatedItems);
      // Note: calculateGstTotals needs to be called within this logic or slightly adjusted.
      // But we can just use setForm's dependency injection or just merge.

      return { ...updatedForm, ...finalTotals };
    });

    setEntityDropdownOpen(false);
    setEntitySearch("");
  };

  const addMilestone = () => {
    setForm(prev => ({
      ...prev,
      milestones: [...prev.milestones, {
        title: "",
        description: "",
        amount: 0,
        percentage: 0,
        dueDate: today(),
        status: "pending",
      }],
    }));
  };

  const removeMilestone = (idx) => {
    setForm(prev => ({
      ...prev,
      milestones: prev.milestones.filter((_, i) => i !== idx),
    }));
  };




  const updateMilestone = (idx, field, value) => {
    let nextError = null;

    setForm(prev => {
      const milestones = [...prev.milestones];
      const newMilestone = { ...milestones[idx] };

      if (field === "percentage") {
        let percent = value === "" ? 0 : Number(value);
        if (isNaN(percent) || percent < 0) percent = 0;

        // ─── CLAMP: never let total exceed 100% ───
        const totalWithoutCurrent = milestones.reduce(
          (sum, m, i) => i !== idx ? sum + (m.percentage || 0) : sum, 0
        );
        const maxAllowed = Math.max(0, 100 - totalWithoutCurrent);
        percent = Math.min(percent, maxAllowed);

        const newAmount = prev.totalAmount > 0
          ? Math.round((prev.totalAmount * percent) / 100 * 100) / 100
          : 0;
        newMilestone.percentage = Number(percent.toFixed(2));
        newMilestone.amount = newAmount;

      } else if (field === "amount") {
        let amount = value === "" ? 0 : Number(value);
        if (isNaN(amount) || amount < 0) amount = 0;

        // ─── CLAMP: never let total exceed PO total ───
        const totalWithoutCurrent = milestones.reduce(
          (sum, m, i) => i !== idx ? sum + (m.amount || 0) : sum, 0
        );
        const maxAllowed = Math.max(0, prev.totalAmount - totalWithoutCurrent);
        amount = Math.min(amount, maxAllowed);

        const newPercentage = prev.totalAmount > 0
          ? (amount / prev.totalAmount) * 100
          : 0;
        newMilestone.amount = Math.round(amount * 100) / 100;
        newMilestone.percentage = Number(newPercentage.toFixed(2));

      } else if (field === "dueDate") {
        const poDate = dayjs(prev.poDate);
        const deliveryDate = dayjs(prev.deliveryDate);
        const milestoneDueDate = dayjs(value);

        if (milestoneDueDate.isBefore(poDate, "day") || milestoneDueDate.isAfter(deliveryDate, "day")) {
          nextError = `Due date must be between ${poDate.format("DD MMM YYYY")} and ${deliveryDate.format("DD MMM YYYY")}`;
          return prev; // leave form unchanged
        }
        newMilestone[field] = value;

      } else {
        newMilestone[field] = value;
      }

      milestones[idx] = newMilestone;
      return { ...prev, milestones };
    });

    // ✅ Safe — called outside the updater
    setError(nextError);
  };


  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { description: "", hsnSac: "", hsnId: null, quantity: 1, unit: "each", rate: 0, taxableValue: 0, gstRate: 18, gstAmount: 0, totalAmount: 0 }],
    }));
  };

  const removeItem = (idx) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const updateItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };

      if (field === "quantity" || field === "rate" || field === "gstRate") {
        const taxType = determineTaxType();
        items[idx] = calculateItemValues(items[idx], prev.paymentTerms, prev.poDate, prev.deliveryDate, taxType);
      }

      const totals = calculateGstTotals(items);
      return {
        ...prev,
        items,
        ...totals,
        valueInWords: numberToWords(totals.totalAmount),
      };
    });
  };

  useEffect(() => {
    setForm((prev) => {
      const totals = calculateGstTotals(prev.items);
      return {
        ...prev,
        ...totals,
        valueInWords: numberToWords(totals.totalAmount),
      };
    });
  }, [companyInfo, form.deliverTo?.stateCode]);

  // ─── Pure — NO setState, safe to call during render ───
  const canProceed = () => {
    switch (step) {
      case 1: {
        const hasEntity = mode === "client" ? !!form.client?._id : !!form.vendor?._id;
        if (mode === "client" && hasEntity) return !!form.deliverTo?.name?.trim();
        return hasEntity;
      }
      case 2:
        return (
          !!form.poDate &&
          !!form.deliveryDate &&
          form.items.some(i => i.description?.trim() !== "" && i.quantity > 0 && i.rate > 0)
        );
      case 3:
        if (form.paymentTerms === "milestone") {
          return form.milestones.length > 0 && validateMilestones().isValid;
        }
        return !!form.paymentTerms;
      case 4:
        return true;
      default:
        return false;
    }
  };

  // ─── Only called on click — safe to call setError here ───
  const handleContinue = () => {
    if (!canProceed()) {
      if (step === 3 && form.paymentTerms === "milestone") {
        setError(validateMilestones().message || "Please complete all milestone fields.");
      } else {
        setError("Please complete all required fields.");
      }
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!canProceed()) {
      setError("Please complete all required fields.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Map client/vendor based on mode for backend
      // Backend always expects 'vendor' field (the party we're transacting with)
      const vendorForBackend = mode === "client" ? form.client : form.vendor;

      const poData = {
        ...form,
        vendor: vendorForBackend,  // Always send the correct party as 'vendor'
        billingModel: { milestone: "milestone", monthly: "fixed", weekly: "fixed" }[form.paymentTerms] || "fixed",
        poCategory: "project",
        distributionSchedule: form.paymentTerms === "monthly" ? distributionBreakdown : [],
      };

      // Remove the client field since backend only expects vendor
      delete poData.client;

      let result;
      if (isEditing) {
        result = await updatePurchaseOrderApi(editId, poData);
      } else {
        result = await createPurchaseOrderApi(poData);
      }
      setSuccess(true);
      setCreatedPOId(result?.data?._id || result?._id);
      setTimeout(() => navigate("/purchaseorder-data"), 1500);
    } catch (err) {
      setError(err.message || "Failed to save purchase order");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Success!</h2>
          <p className="text-xs text-slate-600 mb-3">
            {isEditing ? "Purchase Order updated" : "Purchase Order created"} successfully.
          </p>
          <Loader2 className="h-4 w-4 animate-spin text-blue-500 mx-auto" />
        </div>
      </div>
    );
  }

  const getQtyLabel = () => {
    if (form.paymentTerms === "weekly") return "Total Hours";
    if (form.paymentTerms === "monthly") return "Quantity";
    return "Quantity";
  };
  const getRateLabel = () => {
    if (form.paymentTerms === "weekly") return `Rate/Hour (${currencySymbol})`;
    if (form.paymentTerms === "monthly") return `Monthly Rate (${currencySymbol})`;
    return `Rate (${currencySymbol})`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-3 sm:p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => navigate("/purchaseorder-data")} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 mb-3">
            <ArrowLeft size={14} /> Back
          </button>
          <h1 className="text-xl font-bold text-slate-800 mb-0.5">
            {isEditing ? "Edit Purchase Order" : "Create Purchase Order"}
          </h1>
          <p className="text-[11px] text-slate-500">
            {mode === "client" ? "From a Client" : "To a Vendor"} • {form.direction === "receivable" ? "Receivable" : "Payable"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-red-900">{error}</p>
          </div>
        )}

        {/* Step Indicator */}
        <div className="mb-6 bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex items-center flex-1">
                <button
                  onClick={() => step > s.id ? setStep(s.id) : undefined}
                  disabled={step < s.id}
                  className={`flex flex-col items-center gap-0.5 transition-all ${step >= s.id ? colors.text : "text-slate-400"} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-semibold text-xs transition-all ${step >= s.id ? `${colors.bg} ${colors.border} border` : "bg-slate-100 border border-slate-200"}`}>
                    {step > s.id ? <Check size={12} /> : s.id}
                  </div>
                  <span className="text-[10px] font-medium text-center max-w-[60px]">{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && <div className={`flex-1 h-px mx-1 transition-all ${step > s.id ? colors.bg : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-5">

          {/* STEP 1: Entity */}
          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-0.5">Select {mode === "client" ? "Client" : "Vendor"}</h2>
              <p className="text-[11px] text-slate-500 mb-4">Choose the {mode === "client" ? "client" : "vendor"} for this purchase order</p>
              <div className="mb-4">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">PO Direction</label>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs border ${colors.bg} ${colors.border} ${colors.text}`}>
                  {form.direction === "receivable" ? <ArrowDownCircle size={13} /> : <ArrowUpCircle size={13} />}
                  {form.direction === "receivable" ? "Receivable — From Client" : "Payable — To Vendor"}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{mode === "client" ? "Client" : "Vendor"}</label>
                <div className="relative">
                  <input type="text" placeholder={`Search ${mode === "client" ? "clients" : "vendors"}...`} value={entitySearch} onChange={(e) => { setEntitySearch(e.target.value); setEntityDropdownOpen(true); }} onFocus={() => setEntityDropdownOpen(true)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none" />
                  {entityDropdownOpen && filteredEntities.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                      {filteredEntities.map((entity) => (
                        <button key={entity._id} onClick={() => selectEntity(entity)} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-slate-800 text-xs">{entity.name}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{entity.clientCode || entity.vendorCode || entity.defaultAddress?.label || "Primary Record"}</div>
                            </div>
                            <div className="text-[10px] font-medium text-slate-600">{entity.currencySymbol || "₹"} {entity.currencyCode || "INR"}</div>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">{entity.defaultAddress?.address || entity.address || "No Address"}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {getTaxDisplay(entity).length > 0 ? getTaxDisplay(entity).map((tax) => (
                              <span key={`${entity._id}-${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600">
                                {tax.label}: {tax.taxNumber}
                              </span>
                            )) : <span className="text-[10px] text-slate-400">No Tax ID</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {(mode === "client" ? form.client?._id : form.vendor?._id) && (
                <div className={`mt-4 p-3 rounded-md border ${colors.bg} ${colors.border}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${colors.text}`}>{mode === "client" ? "Client" : "Vendor"} Details</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><p className="text-[10px] text-slate-500 mb-0.5">Name</p><p className="font-medium text-slate-800 text-xs">{mode === "client" ? form.client.name : form.vendor.name}</p></div>
                    <div><p className="text-[10px] text-slate-500 mb-0.5">Currency</p><p className="font-medium text-slate-800 text-xs">{currencySymbol} {currencyCode} {currencyName}</p></div>
                    {(mode === "client" ? form.client.stateCode : form.vendor.stateCode) && <div><p className="text-[10px] text-slate-500 mb-0.5">State Code</p><p className="font-medium text-slate-800 text-xs">{mode === "client" ? form.client.stateCode : form.vendor.stateCode}</p></div>}
                    <div className={`${(mode === "client" ? form.client.stateCode : form.vendor.stateCode) ? "" : "sm:col-span-2"}`}><p className="text-[10px] text-slate-500 mb-0.5">Default Address</p><p className="font-medium text-slate-800 text-xs">{selectedEntity?.defaultAddress?.address || selectedEntity?.address || "—"}</p></div>
                    <div className="sm:col-span-2"><p className="text-[10px] text-slate-500 mb-0.5">Tax Details</p><div className="flex flex-wrap gap-1.5">{selectedEntityTaxDetails.length > 0 ? selectedEntityTaxDetails.map((tax) => <span key={`${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-2 py-1 rounded bg-white/80 border border-slate-200 text-[10px] text-slate-700">{tax.label}: {tax.taxNumber}</span>) : <p className="font-medium text-slate-800 text-xs">—</p>}</div></div>
                  </div>
                </div>
              )}

              {/* DELIVER TO SECTION - Only for Client Mode */}
              {mode === "client" && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-slate-800">Deliver To</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsDeliverTo}
                        onChange={(e) => {
                          setSameAsDeliverTo(e.target.checked);
                          if (e.target.checked && form.client?._id) {
                            set("deliverTo", {
                              _id: form.client._id,
                              name: form.client.defaultAddress?.name || form.client.name,
                              address: form.client.defaultAddress?.address || form.client.address,
                              stateCode: form.client.defaultAddress?.stateCode || form.client.stateCode,
                              GSTIN: form.client.GSTIN
                            });
                          }
                        }}
                        className="w-4 h-4 border border-slate-300 rounded cursor-pointer"
                      />
                      <span className="text-xs text-slate-600">Same as Client</span>
                    </label>
                  </div>

                  {!sameAsDeliverTo && (
                    <div className={`p-3 rounded-md border ${colors.bg} ${colors.border} space-y-3`}>
                      <div className="relative">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Search Ship To Address</label>
                        <input
                          type="text"
                          placeholder="Search by label, address, state code, GSTIN..."
                          value={deliverToSearch}
                          onChange={(e) => { setDeliverToSearch(e.target.value); setDeliverToDropdownOpen(true); }}
                          onFocus={() => setDeliverToDropdownOpen(true)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                        />
                        {deliverToDropdownOpen && filteredDeliverToOptions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                            {filteredDeliverToOptions.map((address, idx) => (
                              <button
                                key={`${address._id || "address"}-${idx}`}
                                onClick={() => {
                                  set("deliverTo", address);
                                  setDeliverToSearch(address.label || address.name || address.address);
                                  setDeliverToDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition"
                              >
                                <div className="font-medium text-slate-800 text-xs">{address.label || address.name || `Address ${idx + 1}`}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{address.address || "No address"}</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {getTaxDisplay(address).length > 0 ? getTaxDisplay(address).map((tax) => (
                                    <span key={`${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600">
                                      {tax.label}: {tax.taxNumber}
                                    </span>
                                  )) : <span className="text-[10px] text-slate-400">No Tax ID</span>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Name</label>
                        <input
                          type="text"
                          placeholder="Delivery location name"
                          value={form.deliverTo.name}
                          onChange={(e) => set("deliverTo.name", e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Address</label>
                        <input
                          type="text"
                          placeholder="Delivery address"
                          value={form.deliverTo.address}
                          onChange={(e) => set("deliverTo.address", e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">State Code</label>
                          <input
                            type="text"
                            placeholder="e.g., DL, MH, KA"
                            value={form.deliverTo.stateCode}
                            onChange={(e) => set("deliverTo.stateCode", e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">GSTIN</label>
                          <input
                            type="text"
                            placeholder="GSTIN"
                            value={form.deliverTo.GSTIN}
                            onChange={(e) => set("deliverTo.GSTIN", e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Selected Address Tax Details</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getTaxDisplay(form.deliverTo).length > 0 ? getTaxDisplay(form.deliverTo).map((tax) => (
                            <span key={`${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-2 py-1 rounded bg-white/80 border border-slate-200 text-[10px] text-slate-700">
                              {tax.label}: {tax.taxNumber}
                            </span>
                          )) : <span className="text-xs text-slate-500">No saved tax details for this ship-to address.</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {sameAsDeliverTo && form.client?._id && (
                    <div className={`mt-3 p-3 rounded-md border ${colors.bg} ${colors.border}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${colors.text}`}>Delivery Address</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div><p className="text-[10px] text-slate-500 mb-0.5">Name</p><p className="font-medium text-slate-800 text-xs">{form.deliverTo.name}</p></div>
                        <div><p className="text-[10px] text-slate-500 mb-0.5">{getTaxIdLabel()}</p><p className="font-medium text-slate-800 text-xs">{form.deliverTo.GSTIN || "—"}</p></div>
                        {form.deliverTo.stateCode && <div><p className="text-[10px] text-slate-500 mb-0.5">State Code</p><p className="font-medium text-slate-800 text-xs">{form.deliverTo.stateCode}</p></div>}
                        <div className={`${form.deliverTo.stateCode ? "" : "sm:col-span-2"}`}><p className="text-[10px] text-slate-500 mb-0.5">Address</p><p className="font-medium text-slate-800 text-xs">{form.deliverTo.address || "—"}</p></div>
                        <div className="sm:col-span-2"><p className="text-[10px] text-slate-500 mb-0.5">Tax Details</p><div className="flex flex-wrap gap-1.5">{getTaxDisplay(form.deliverTo).length > 0 ? getTaxDisplay(form.deliverTo).map((tax) => <span key={`${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-2 py-1 rounded bg-white/80 border border-slate-200 text-[10px] text-slate-700">{tax.label}: {tax.taxNumber}</span>) : <p className="font-medium text-slate-800 text-xs">—</p>}</div></div>
                      </div>
                    </div>
                  )}

                  {!sameAsDeliverTo && !form.deliverTo?.name?.trim() && form.client?._id && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                      <span className="text-base text-amber-600 mt-0">⚠</span>
                      <p className="text-xs text-amber-800"><strong>Required:</strong> Please enter a delivery location name to proceed.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PO Details & Line Items */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-800 mb-0.5">PO Details & Line Items</h2>
                <p className="text-[11px] text-slate-500 mb-4">Fill in the basic information and add line items</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">PO Date</label><input type="date" value={form.poDate} onChange={(e) => set("poDate", e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none" /></div>
                <div><label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Delivery Date</label><input type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none" /></div>
              </div>
              <div><label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">PO Reference Number (Optional)</label><input type="text" value={form.poreferencevalue} onChange={(e) => set("poreferencevalue", e.target.value)} placeholder="e.g., PO-2024-001" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none" /></div>
              <div><label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows="2" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 outline-none resize-none" /></div>

              {/* Line Items Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800 text-xs">Line Items</h3>
                  <button onClick={addItem} className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition ${colors.bg} ${colors.text}`}><Plus size={13} /> Add Item</button>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
                    <div className="col-span-4">Description</div>
                    <div className="col-span-1">HSN/SAC</div>
                    <div className="col-span-1">{getQtyLabel()}</div>
                    <div className="col-span-1">Unit</div>
                    <div className="col-span-1">{getRateLabel()}</div>
                    <div className="col-span-1">{getTaxLabel(true)} %</div>
                    <div className="col-span-2">{`Total (${currencySymbol})`}</div>
                    <div className="col-span-1"></div>
                  </div>
                  {form.items.map((item, i) => (
                    <div key={i} className="grid sm:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center">
                      <div className="sm:col-span-4"><input type="text" placeholder="Service description" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none" /></div>
                      <div className="sm:col-span-1 relative z-50">
                        <select value={item.hsnId || ""} onChange={(e) => {
                          const id = e.target.value;
                          const taxType = determineTaxType();

                          // Use a single setForm call to atomically update all HSN-related fields
                          setForm(prev => {
                            const items = [...prev.items];
                            const updatedItem = { ...items[i] };

                            if (!id) {
                              // HSN cleared
                              updatedItem.hsnId = null;
                              updatedItem.hsnSac = "";
                              if (taxType === "GST") {
                                updatedItem.gstRate = 18;
                              } else {
                                const partyCountry = getPartyCountry();
                                const ct = getForeignCountryTax(partyCountry);
                                updatedItem.gstRate = ct ? ct.taxRate : 0;
                              }
                            } else {
                              const hsn = hsnList.find(h => h._id === id);
                              if (hsn) {
                                updatedItem.hsnId = id;
                                updatedItem.hsnSac = hsn.hsnCode;
                                if (!updatedItem.description.trim()) updatedItem.description = hsn.serviceType;

                                if (taxType === "GST" || taxType === "RCM") {
                                  updatedItem.gstRate = getTotalGstRate(hsn);
                                } else if (taxType === "NONE") {
                                  updatedItem.gstRate = 0;
                                } else {
                                  const partyCountry = getPartyCountry();
                                  const ct = getForeignCountryTax(partyCountry);
                                  updatedItem.gstRate = ct ? ct.taxRate : 0;
                                }
                              }
                            }

                            // Recalculate tax amounts for this item
                            const taxableValue = (Number(updatedItem.quantity) || 0) * (Number(updatedItem.rate) || 0);
                            updatedItem.taxableValue = taxableValue;
                            if (taxType === "GST") {
                              updatedItem.gstAmount = (taxableValue * updatedItem.gstRate) / 100;
                              updatedItem.totalAmount = taxableValue + updatedItem.gstAmount;
                            } else if (taxType === "RCM") {
                              updatedItem.gstAmount = (taxableValue * updatedItem.gstRate) / 100;
                              updatedItem.totalAmount = taxableValue;
                            } else if (taxType === "NONE") {
                              updatedItem.gstAmount = 0;
                              updatedItem.totalAmount = taxableValue;
                            } else {
                              updatedItem.gstAmount = (taxableValue * updatedItem.gstRate) / 100;
                              updatedItem.totalAmount = taxableValue + updatedItem.gstAmount;
                            }

                            // CRITICAL: Sync taxRate with gstRate so backend uses updated value
                            updatedItem.taxRate = updatedItem.gstRate;
                            updatedItem.taxAmount = updatedItem.gstAmount;
                            updatedItem.combinedTaxRate = updatedItem.gstRate;

                            items[i] = updatedItem;
                            const totals = calculateGstTotals(items);
                            return { ...prev, items, ...totals, valueInWords: numberToWords(totals.totalAmount) };
                          });
                        }} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none">
                          <option value="">HSN</option>
                          {hsnList.map(hsn => <option key={hsn._id} value={hsn._id}>{hsn.hsnCode} – {hsn.serviceType}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-1"><input type="number" min="0" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none" /></div>
                      <div className="sm:col-span-1">
                        <select value={item.unit || "each"} onChange={(e) => updateItem(i, "unit", e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none">
                          <option value="each">Each</option>
                          <option value="hour">Hour</option>
                        </select>
                      </div>
                      <div className="sm:col-span-1"><input type="number" min="0" value={item.rate} onChange={(e) => updateItem(i, "rate", e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none" /></div>
                      <div className="sm:col-span-1"><input type="number" disabled min="0" max="28" value={item.gstRate} onChange={(e) => updateItem(i, "gstRate", e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none" /></div>
                      <div className="sm:col-span-2"><span className="text-sm font-medium text-slate-700">₹ {item.totalAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                      <div className="sm:col-span-1 flex justify-end">{form.items.length > 1 && <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-500 transition"><Trash2 size={15} /></button>}</div>
                    </div>
                  ))}
                  <div className="px-4 py-3 border-b border-slate-100"><button onClick={addItem} className={`flex items-center gap-1.5 text-sm text-slate-400 transition ${colors.dashed}`}><Plus size={14} /> Add Line Item</button></div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-4 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Subtotal (taxable)</span><span>{formatMoney(form.totalTaxableValue)}</span></div>
                  {determineTaxType() === "GST" ? (
                    <>
                      <div className="flex justify-between text-slate-600"><span>CGST</span><span>{formatMoney(form.totalCGSTAmount)}</span></div>
                      <div className="flex justify-between text-slate-600"><span>SGST</span><span>{formatMoney(form.totalSGSTAmount)}</span></div>
                      <div className="flex justify-between text-slate-600"><span>IGST</span><span>{formatMoney(form.totalIGSTAmount)}</span></div>
                    </>
                  ) : determineTaxType() !== "NONE" ? (
                    <div className="flex justify-between text-slate-600">
                      <span>{getTaxLabel()}</span>
                      <span>{formatMoney(form.totalGSTAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between font-semibold text-slate-800 pt-1.5 border-t border-slate-200"><span>Total</span><span>{formatMoney(form.totalAmount)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Payment Terms & Distribution */}
          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-0.5">Payment Terms</h2>
              <p className="text-[11px] text-slate-500 mb-4">Select how the invoicing will be structured</p>
              <div className="grid gap-2 mb-6">
                {PAYMENT_TERMS_OPTIONS.map(opt => (
                  <button key={opt.key}
                    onClick={() => {
                      const taxType = determineTaxType();
                      if (opt.key === "milestone") {
                        const count = window.prompt("How many milestones would you like to create?", "3");
                        const numCount = parseInt(count);
                        if (!isNaN(numCount) && numCount > 0) {
                          setForm(prev => {
                            const recalculatedItems = prev.items.map(item =>
                              calculateItemValues(item, "milestone", prev.poDate, prev.deliveryDate, taxType)
                            );
                            const totals = calculateGstTotals(recalculatedItems);
                            const currentTotal = totals.totalAmount;

                            const newMilestones = Array.from({ length: numCount }, (_, i) => ({
                              title: `Milestone ${i + 1}`,
                              description: "",
                              amount: Number((currentTotal / numCount).toFixed(2)),
                              percentage: Number((100 / numCount).toFixed(2)),
                              dueDate: today(),
                              status: "pending",
                            }));
                            const totalPercentSoFar = newMilestones.slice(0, -1).reduce((s, m) => s + m.percentage, 0);
                            const totalAmountSoFar = newMilestones.slice(0, -1).reduce((s, m) => s + m.amount, 0);
                            newMilestones[newMilestones.length - 1].percentage = Number((100 - totalPercentSoFar).toFixed(2));
                            newMilestones[newMilestones.length - 1].amount = Number((currentTotal - totalAmountSoFar).toFixed(2));

                            return {
                              ...prev,
                              paymentTerms: "milestone",
                              items: recalculatedItems,
                              ...totals,
                              valueInWords: numberToWords(totals.totalAmount),
                              milestones: newMilestones,
                              invoiceSchedule: [],
                            };
                          });
                        }
                      } else {
                        // Switching to monthly or weekly
                        setForm(prev => {
                          const recalculatedItems = prev.items.map(item =>
                            calculateItemValues(item, opt.key, prev.poDate, prev.deliveryDate, taxType)
                          );
                          const totals = calculateGstTotals(recalculatedItems);
                          return {
                            ...prev,
                            paymentTerms: opt.key,
                            items: recalculatedItems,
                            ...totals,
                            valueInWords: numberToWords(totals.totalAmount),
                            milestones: [],
                            invoiceSchedule: [],
                          };
                        });
                      }
                    }} className={`p-3 rounded-lg border transition-all text-left ${form.paymentTerms === opt.key ? `${colors.bg} ${colors.border} ring-1 ${colors.ring}` : "bg-white border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-start gap-2.5">
                      <opt.icon size={15} className={form.paymentTerms === opt.key ? colors.text : "text-slate-400"} />
                      <div><p className={`font-semibold text-xs ${form.paymentTerms === opt.key ? colors.text : "text-slate-700"}`}>{opt.label}</p><p className="text-[10px] text-slate-500 mt-0.5">{opt.hint}</p></div>
                    </div>
                  </button>
                ))}
              </div>

              {/* MILESTONE SECTION */}
              {form.paymentTerms === "milestone" && (
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-800 text-xs">Milestones</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Define milestones and their payment amounts. Line item changes update milestone amounts automatically based on percentages.</p>
                    </div>
                    <button onClick={addMilestone} className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition ${colors.bg} ${colors.text}`}>
                      <Plus size={13} /> Add Milestone
                    </button>
                  </div>

                  {/* Percentage & Amount Progress Bar */}
                  {form.milestones.length > 0 && (
                    <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
                      {/* Percentage Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-700">Percentage Allocated</span>
                          <span className={`text-xs font-semibold ${Math.abs(form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0) - 100) > 0.5 ? "text-red-600" : "text-green-600"}`}>
                            {form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0).toFixed(2)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all ${Math.abs(form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0) - 100) > 0.5
                              ? "bg-red-500"
                              : "bg-green-500"
                              }`}
                            style={{
                              width: `${Math.min(form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0), 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Amount Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-700">Amount Allocated</span>
                          <span className={`text-xs font-semibold ${Math.abs(form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0) - form.totalAmount) > Math.max(form.milestones.length * 0.01, form.totalAmount * 0.001)
                            ? "text-red-600"
                            : "text-green-600"
                            }`}>
                            {formatMoney(form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0))}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all ${Math.abs(form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0) - form.totalAmount) > Math.max(form.milestones.length * 0.01, form.totalAmount * 0.001)
                              ? "bg-red-500"
                              : "bg-green-500"
                              }`}
                            style={{
                              width: `${Math.min((form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0) / form.totalAmount) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Status Messages */}
                      {Math.abs(form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0) - 100) > 0.5 && (
                        <p className="text-xs text-red-600 font-medium">⚠️ Percentage must sum to 100% (currently {form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0).toFixed(2)}%)</p>
                      )}
                      {Math.abs(form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0) - form.totalAmount) > Math.max(form.milestones.length * 0.01, form.totalAmount * 0.001) && (
                        <p className="text-xs text-red-600 font-medium">⚠️ Amount must sum to {formatMoney(form.totalAmount)}</p>
                      )}
                      {Math.abs(form.milestones.reduce((sum, m) => sum + (m.percentage || 0), 0) - 100) <= 0.5 && Math.abs(form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0) - form.totalAmount) <= Math.max(form.milestones.length * 0.01, form.totalAmount * 0.001) && (
                        <p className="text-xs text-green-600 font-medium">✓ Milestones properly allocated</p>
                      )}
                    </div>
                  )}

                  {/* Milestone Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
                    <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
                      <div className="col-span-3">Milestone Name</div>
                      <div className="col-span-2">Due Date</div>
                      <div className="col-span-2">Percentage (%)</div>
                      <div className="col-span-2">{`Amount (${currencySymbol})`}</div>
                      <div className="col-span-2">Description</div>
                      <div className="col-span-1"></div>
                    </div>
                    {form.milestones.map((milestone, idx) => (
                      <div key={idx} className="grid sm:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center">
                        <div className="sm:col-span-3">
                          <input
                            type="text"
                            placeholder="e.g., Design Phase"
                            value={milestone.title}
                            onChange={(e) => updateMilestone(idx, "title", e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="date"
                            value={milestone.dueDate}
                            onChange={(e) => updateMilestone(idx, "dueDate", e.target.value)}
                            min={form.poDate}
                            max={form.deliveryDate}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={milestone.percentage}
                            onChange={(e) => updateMilestone(idx, "percentage", e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={milestone.amount}
                            onChange={(e) => updateMilestone(idx, "amount", e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            placeholder="Optional"
                            value={milestone.description}
                            onChange={(e) => updateMilestone(idx, "description", e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400/30 outline-none"
                          />
                        </div>
                        <div className="sm:col-span-1 flex justify-end">
                          {form.milestones.length > 1 && (
                            <button onClick={() => removeMilestone(idx)} className="text-slate-300 hover:text-red-500 transition">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-3 border-b border-slate-100">
                      <button onClick={addMilestone} className={`flex items-center gap-1.5 text-sm text-slate-400 transition ${colors.dashed}`}>
                        <Plus size={14} /> Add Milestone
                      </button>
                    </div>
                  </div>

                  {/* Milestone breakdown summary */}
                  {distributionBreakdown.length > 0 && (
                    <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <h4 className="font-semibold text-slate-800 mb-2 text-xs">Milestone Breakdown</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Milestone</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">%</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">{`Amount (${currencySymbol})`}</th>
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Due Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {distributionBreakdown.map((item, idx) => (
                              <tr key={idx} className="border-b border-slate-200 last:border-b-0">
                                <td className="px-2 py-1.5 text-slate-700">{item.period}</td>
                                <td className="px-2 py-1.5 text-right text-slate-600">{item.percentage}%</td>
                                <td className="px-2 py-1.5 text-right font-medium text-slate-800">{formatMoney(item.amount)}</td>
                                <td className="px-2 py-1.5 text-slate-600">{item.dueDate ? dayjs(item.dueDate).format("DD MMM YYYY") : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right text-xs font-semibold text-slate-800">
                        {`Total: ${formatMoney(form.totalAmount)}`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.paymentTerms === "monthly" && (
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="font-semibold text-slate-800 mb-1 text-xs">Monthly Distribution</h3>
                  <p className="text-[10px] text-slate-500 mb-3">Based on PO Date ({dayjs(form.poDate).format("DD MMM YYYY")}) to Delivery Date ({dayjs(form.deliveryDate).format("DD MMM YYYY")})</p>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 mb-2">A total of <strong>{distributionBreakdown.length}</strong> monthly invoice{distributionBreakdown.length !== 1 ? "s" : ""} will be generated.</p>
                    {distributionBreakdown.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-blue-200">
                              <th className="px-2 py-1.5 text-left font-medium text-blue-900">Month</th>
                              <th className="px-2 py-1.5 text-left font-medium text-blue-900">Period</th>
                              <th className="px-2 py-1.5 text-center font-medium text-blue-900">Days</th>
                              <th className="px-2 py-1.5 text-right font-medium text-blue-900">{`Rate (${currencySymbol})`}</th>
                              <th className="px-2 py-1.5 text-right font-medium text-blue-900">{`Amount (${currencySymbol})`}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {distributionBreakdown.map((item, idx) => (
                              <tr key={idx} className="border-b border-blue-100 last:border-b-0">
                                <td className="px-2 py-1.5 font-medium text-slate-800">{item.period}</td>
                                <td className="px-2 py-1.5 text-slate-600">{item.startDate} – {item.endDate}</td>
                                <td className="px-2 py-1.5 text-center text-slate-600">{item.daysText || `${item.daysInPeriod}/${item.totalDaysInMonth}`}</td>
                                <td className="px-2 py-1.5 text-right text-slate-600">{formatMoney(item.rate)}</td>
                                <td className="px-2 py-1.5 text-right font-medium text-slate-800">{formatMoney(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-2 text-right text-xs font-semibold text-slate-800">{`Total: ${formatMoney(form.totalAmount)}`}</div>
                  </div>
                </div>
              )}

              {form.paymentTerms === "weekly" && (
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="font-semibold text-slate-800 mb-1 text-xs">Weekly Distribution</h3>
                  <p className="text-[10px] text-slate-500 mb-3">Based on PO Date ({dayjs(form.poDate).format("DD MMM YYYY")}) to Delivery Date ({dayjs(form.deliveryDate).format("DD MMM YYYY")})</p>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 mb-2">A total of <strong>{distributionBreakdown.length}</strong> weekly invoice{distributionBreakdown.length !== 1 ? "s" : ""} will be generated.</p>
                    {distributionBreakdown.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-blue-200"><th className="px-2 py-1.5 text-left font-medium text-blue-900">Week</th><th className="px-2 py-1.5 text-left font-medium text-blue-900">Period</th><th className="px-2 py-1.5 text-right font-medium text-blue-900">{`Amount (${currencySymbol})`}</th></tr></thead>
                          <tbody>{distributionBreakdown.map((item, idx) => (<tr key={idx} className="border-b border-blue-100 last:border-b-0"><td className="px-2 py-1.5 font-medium text-slate-800">{item.period}</td><td className="px-2 py-1.5 text-slate-600">{item.startDate} – {item.endDate}</td><td className="px-2 py-1.5 text-right font-medium text-slate-800">{formatMoney(item.amount)}</td></tr>))}</tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-2 text-right text-xs font-semibold text-slate-800">{`Total: ${formatMoney(form.totalAmount)}`}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800 mb-0.5">Review & Submit</h2>
                <p className="text-[11px] text-slate-500 mb-4">Review all details carefully. Click <strong>Edit</strong> on any section to go back and make changes.</p>
              </div>

              {/* Entity Section */}
              <div className={`border ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    <Building size={14} className={colors.text} />
                    {mode === "client" ? "Client" : "Vendor"} Details
                  </h3>
                  <button onClick={() => setStep(1)} className={`flex items-center gap-1 text-xs ${colors.text} hover:opacity-70 transition`}>
                    <Edit2 size={12} /> Edit
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-600">Name</p>
                      <p className="font-medium text-slate-800">{mode === "client" ? form.client.name : form.vendor.name}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Currency</p>
                      <p className="font-medium text-slate-800">{currencySymbol} {currencyCode} {currencyName}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-600">Default Address</p>
                      <p className="font-medium text-slate-800">{selectedEntity?.defaultAddress?.address || selectedEntity?.address || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">State Code</p>
                      <p className="font-medium text-slate-800">{mode === "client" ? form.client.stateCode : form.vendor.stateCode}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-600">Tax Details</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {selectedEntityTaxDetails.length > 0 ? selectedEntityTaxDetails.map((tax) => (
                          <span key={`${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-2 py-1 rounded bg-white/80 border border-slate-200 text-[10px] text-slate-700">
                            {tax.label}: {tax.taxNumber}
                          </span>
                        )) : <p className="font-medium text-slate-800">—</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deliver To Section */}
              {mode === "client" && (
                <div className={`border ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                      <Building2 size={14} className={colors.text} />
                      Deliver To
                    </h3>
                    <button onClick={() => setStep(1)} className={`flex items-center gap-1 text-xs ${colors.text} hover:opacity-70 transition`}>
                      <Edit2 size={12} /> Edit
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="col-span-2">
                        <p className="text-slate-600">Name</p>
                        <p className="font-medium text-slate-800">{form.deliverTo.name}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-600">Address</p>
                        <p className="font-medium text-slate-800">{form.deliverTo.address}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">State Code</p>
                        <p className="font-medium text-slate-800">{form.deliverTo.stateCode}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">{getTaxIdLabel()}</p>
                        <p className="font-medium text-slate-800">{form.deliverTo.GSTIN || "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-600">Tax Details</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {getTaxDisplay(form.deliverTo).length > 0 ? getTaxDisplay(form.deliverTo).map((tax) => (
                            <span key={`${tax.label}-${tax.taxNumber}`} className="inline-flex items-center px-2 py-1 rounded bg-white/80 border border-slate-200 text-[10px] text-slate-700">
                              {tax.label}: {tax.taxNumber}
                            </span>
                          )) : <p className="font-medium text-slate-800">—</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PO Details & Items Section */}
              <div className={`border ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    <FileText size={14} className={colors.text} />
                    PO Details & Items
                  </h3>
                  <button onClick={() => setStep(2)} className={`flex items-center gap-1 text-xs ${colors.text} hover:opacity-70 transition`}>
                    <Edit2 size={12} /> Edit
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-600">PO Date</p>
                      <p className="font-medium text-slate-800">{dayjs(form.poDate).format("DD MMM YYYY")}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Delivery Date</p>
                      <p className="font-medium text-slate-800">{dayjs(form.deliveryDate).format("DD MMM YYYY")}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Currency</p>
                      <p className="font-medium text-slate-800">{form.currency}</p>
                    </div>
                    {/* <div>
                      <p className="text-slate-600">PO Category</p>
                      <p className="font-medium text-slate-800 capitalize">{form.poCategory}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Billing Model</p>
                      <p className="font-medium text-slate-800 capitalize">{form.billingModel}</p>
                    </div> */}
                    <div>
                      <p className="text-slate-600">PO Reference</p>
                      <p className="font-medium text-slate-800">{form.poreferencevalue || "—"}</p>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Items</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100">
                            <th className="px-2 py-1.5 text-left font-medium text-slate-600">Description</th>
                            <th className="px-2 py-1.5 text-center font-medium text-slate-600">Qty</th>
                            <th className="px-2 py-1.5 text-center font-medium text-slate-600">Unit</th>
                            <th className="px-2 py-1.5 text-right font-medium text-slate-600">Rate</th>
                            <th className="px-2 py-1.5 text-right font-medium text-slate-600">{getTaxLabel(true)} %</th>
                            <th className="px-2 py-1.5 text-right font-medium text-slate-600">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-200 last:border-b-0">
                              <td className="px-2 py-1.5 text-slate-700">{item.description}</td>
                              <td className="px-2 py-1.5 text-center text-slate-700">{item.quantity}</td>
                              <td className="px-2 py-1.5 text-center text-slate-700 capitalize">{item.unit || "each"}</td>
                              <td className="px-2 py-1.5 text-right text-slate-700">{formatMoney(item.rate)}</td>
                              <td className="px-2 py-1.5 text-right text-slate-700">{item.gstRate}%</td>
                              <td className="px-2 py-1.5 text-right font-medium text-slate-800">₹ {item.totalAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="border-t border-slate-200 pt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Taxable Value</span>
                      <span className="font-medium text-slate-800">{formatMoney(form.totalTaxableValue)}</span>
                    </div>
                    {determineTaxType() === "GST" ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-600">CGST</span>
                          <span className="font-medium text-slate-800">{formatMoney(form.totalCGSTAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">SGST</span>
                          <span className="font-medium text-slate-800">{formatMoney(form.totalSGSTAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">IGST</span>
                          <span className="font-medium text-slate-800">{formatMoney(form.totalIGSTAmount)}</span>
                        </div>
                      </>
                    ) : determineTaxType() !== "NONE" ? (
                      <div className="flex justify-between">
                        <span className="text-slate-600">{getTaxLabel()}</span>
                        <span className="font-medium text-slate-800">{formatMoney(form.totalGSTAmount)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                      <span className="font-semibold text-slate-800">Total Amount</span>
                      <span className="font-semibold text-slate-800">{formatMoney(form.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between pt-1 italic text-slate-600">
                      <span>In Words</span>
                      <span className="text-slate-700">{form.valueInWords}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Terms Section */}
              <div className={`border ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    <CreditCard size={14} className={colors.text} />
                    Payment Terms
                  </h3>
                  <button onClick={() => setStep(3)} className={`flex items-center gap-1 text-xs ${colors.text} hover:opacity-70 transition`}>
                    <Edit2 size={12} /> Edit
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-slate-600 text-xs">Payment Terms Type</p>
                    <p className="font-medium text-slate-800 text-xs capitalize">{form.paymentTerms}</p>
                  </div>

                  {/* Milestone Distribution */}
                  {form.paymentTerms === "milestone" && distributionBreakdown.length > 0 && (
                    <div className="border-t border-slate-200 pt-3">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Milestone Breakdown</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100">
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Milestone</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">%</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Amount</th>
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Due Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {distributionBreakdown.map((item, idx) => (
                              <tr key={idx} className="border-b border-slate-200 last:border-b-0">
                                <td className="px-2 py-1.5 text-slate-700">{item.period}</td>
                                <td className="px-2 py-1.5 text-right text-slate-600">{item.percentage}%</td>
                                <td className="px-2 py-1.5 text-right font-medium text-slate-800">{formatMoney(item.amount)}</td>
                                <td className="px-2 py-1.5 text-slate-600">{item.dueDate ? dayjs(item.dueDate).format("DD MMM YYYY") : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Monthly Distribution */}
                  {form.paymentTerms === "monthly" && distributionBreakdown.length > 0 && (
                    <div className="border-t border-slate-200 pt-3">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Monthly Distribution</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100">
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Month</th>
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Period</th>
                              <th className="px-2 py-1.5 text-center font-medium text-slate-600">Days</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Rate</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {distributionBreakdown.map((item, idx) => (
                              <tr key={idx} className="border-b border-slate-200 last:border-b-0">
                                <td className="px-2 py-1.5 font-medium text-slate-800">{item.period}</td>
                                <td className="px-2 py-1.5 text-slate-600">{item.startDate} – {item.endDate}</td>
                                <td className="px-2 py-1.5 text-center text-slate-600">{item.daysText || `${item.daysInPeriod}/${item.totalDaysInMonth}`}</td>
                                <td className="px-2 py-1.5 text-right text-slate-600">{formatMoney(item.rate)}</td>
                                <td className="px-2 py-1.5 text-right font-medium text-slate-800">{formatMoney(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Weekly Distribution */}
                  {form.paymentTerms === "weekly" && distributionBreakdown.length > 0 && (
                    <div className="border-t border-slate-200 pt-3">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Weekly Distribution</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100">
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Week</th>
                              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Period</th>
                              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {distributionBreakdown.map((item, idx) => (
                              <tr key={idx} className="border-b border-slate-200 last:border-b-0">
                                <td className="px-2 py-1.5 font-medium text-slate-800">{item.period}</td>
                                <td className="px-2 py-1.5 text-slate-600">{item.startDate} – {item.endDate}</td>
                                <td className="px-2 py-1.5 text-right font-medium text-slate-800">{formatMoney(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes & Signature Section */}
              <div className={`border ${colors.border} rounded-lg p-4 ${colors.bg}`}>
                <h3 className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <ListChecks size={14} className={colors.text} />
                  Additional Settings
                </h3>
                <div className="space-y-3">
                  {form.notes && (
                    <div>
                      <p className="text-slate-600 text-xs">Notes</p>
                      <p className="font-medium text-slate-800 text-xs whitespace-pre-wrap">{form.notes}</p>
                    </div>
                  )}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.withSignature} onChange={(e) => set("withSignature", e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-500" />
                      <span className="text-xs text-slate-600">Include digital signature in document</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between gap-3">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 transition flex items-center gap-1.5 bg-white"><ArrowLeft size={13} /> Back</button>
          <div className="flex gap-2">
            {step < STEPS.length ? (
              <button
                onClick={handleContinue}
                disabled={!canProceed()}
                className={`px-4 py-2 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${canProceed()
                  ? `${colors.bg} ${colors.text} hover:opacity-90`
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
              >
                Continue <ChevronRight size={13} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-xs font-semibold rounded-md bg-slate-800 text-white hover:bg-slate-700 transition flex items-center gap-1.5 disabled:opacity-60">{loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{isEditing ? "Update PO" : "Create PO"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────────────────────────
function numberToWords(num) {
  if (!num || num === 0) return "Zero Rupees Only";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + inWords(n % 10000000) : "");
  };
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = inWords(rupees) + " Rupees";
  if (paise > 0) result += " and " + inWords(paise) + " Paise";
  return result + " Only";
}
