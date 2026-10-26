import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Search,
  FileText,
  Users,
  Package,
  CreditCard,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import { bulkCreateInvoicesApi } from "../apis/invoice.api";
import { getClientsApi } from "../apis/clientApi";
import { getallhsn } from "../apis/hsnapi";
import { getAllPurchaseOrdersApi } from "../apis/purchaseOrderApi";

const getRemainingPOItemQuantity = (item = {}) => {
  if (item.remainingQuantity !== undefined && item.remainingQuantity !== null) {
    return Math.max(0, Number(item.remainingQuantity || 0));
  }

  return Math.max(
    0,
    Number(item.quantity || 0) - Number(item.invoicedQuantity || 0),
  );
};

const hasInvoiceablePOItems = (po = {}) =>
  !Array.isArray(po.items) || po.items.some((item) => getRemainingPOItemQuantity(item) > 0);

const BulkInvoiceUploadModal = ({
  open,
  onClose,
  onSuccess,
  companyId,
  userId,
}) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [clients, setClients] = useState([]);
  const [hsnList, setHsnList] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [clientMap, setClientMap] = useState({});
  const [hsnMap, setHsnMap] = useState({});
  const [poMap, setPoMap] = useState({});
  const [activeTab, setActiveTab] = useState("upload");
  const [enrichedRowsData, setEnrichedRowsData] = useState([]);
  const purchaseOrdersRef = useRef([]);

  // Fetch all required data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!open) return;

      setLoadingData(true);
      try {
        // Fetch all clients (global master data) - no companyId filter
        const clientsResponse = await getClientsApi();
        const clientsData = clientsResponse.data || [];
        setClients(clientsData);

        // Create client lookup map
        const clientLookup = {};
        clientsData.forEach((client) => {
          const name = client.clientName || client.name || "";
          if (name) clientLookup[name.toString().trim().toLowerCase()] = client;
          if (client.clientCode) {
            clientLookup[client.clientCode.toString().trim().toLowerCase()] = client;
          }
        });
        setClientMap(clientLookup);

        // Fetch all HSN codes (global master data) - no companyId filter
        const hsnResponse = await getallhsn();
        const hsnData = hsnResponse.data || [];
        setHsnList(hsnData);

        // Create HSN lookup map
        const hsnLookup = {};
        hsnData.forEach((hsn) => {
          if (hsn.hsnCode) {
            hsnLookup[hsn.hsnCode.toString().trim().toUpperCase()] = hsn;
          }
        });
        setHsnMap(hsnLookup);

        // Fetch Purchase Orders
        await fetchPurchaseOrders();
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load client and HSN data");
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [open, companyId]);

  // Fetch Purchase Orders
  const fetchPurchaseOrders = async () => {
    if (!companyId) return;

    setLoadingPOs(true);
    try {
      console.log("Fetching POs for company:", companyId);

      const response = await getAllPurchaseOrdersApi(companyId, { limit: 10000 });
      const poList = response.data || [];
      
      if (poList.length === 0) {
        console.warn("No POs returned from API");
        setPurchaseOrders([]);
        purchaseOrdersRef.current = [];
        setPoMap({});
        return;
      }

      // Log first PO to see structure
      // if (poList.length > 0) {
      //   console.log("Sample PO structure:", {
      //     id: poList[0]._id,
      //     poNumber: poList[0].poNumber,
      //     companyId: poList[0].companyId,
      //     deliverTo: poList[0].deliverTo,
      //   });
      // }

      // The backend should already filter by companyId, but double-check
      const companyPOs = poList.filter((po) => {
        const poCompanyId = po.companyId?.toString();
        const currentCompanyId = companyId?.toString();
        return poCompanyId === currentCompanyId;
      });


      const activePOs = companyPOs.filter(
        (po) =>
          !["cancelled", "closed", "CLOSED", "FULLY_INVOICED"].includes(po.status) &&
          Number(po.remainingInvoicableAmount ?? po.totalAmount ?? 0) > 0 &&
          hasInvoiceablePOItems(po),
      );

      console.log(`Active POs: ${activePOs.length}`);

      setPurchaseOrders(activePOs);
      purchaseOrdersRef.current = activePOs;

      // Create lookup map with multiple formats
      const poLookup = {};
      activePOs.forEach((po) => {
        if (po.poNumber) {
          const original = po.poNumber.toString().trim();
          const noSpaces = original.replace(/\s+/g, "");
          const lowerNoSpaces = noSpaces.toLowerCase();
          const withHyphen = original.replace(/\s+/g, "-");
          const withoutHyphen = original.replace(/[-_\s]/g, "");
          const upperCase = original.toUpperCase();
          const lowerCase = original.toLowerCase();

          // Store all variations
          poLookup[original] = po;
          poLookup[noSpaces] = po;
          poLookup[lowerNoSpaces] = po;
          poLookup[withHyphen] = po;
          poLookup[withoutHyphen] = po;
          poLookup[upperCase] = po;
          poLookup[lowerCase] = po;

          // Also store without any prefix/suffix
          const numberOnly = original.replace(/[^0-9]/g, "");
          if (numberOnly) {
            poLookup[numberOnly] = po;
          }
        }
      });

      setPoMap(poLookup);
    } catch (err) {
      console.error("Error fetching purchase orders:", err);
      console.error("Error details:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      toast.error(
        "Failed to fetch Purchase Orders: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setLoadingPOs(false);
    }
  };

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
          "Item Quantity*": "",
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
        { wch: 10 }, // Item Quantity*
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

  // Parse date with multiple format support
  const parseDate = (dateStr) => {
    if (!dateStr) return null;

    const str = dateStr.toString().trim();

    // Handle DD/MM/YYYY format
    if (str.includes("/")) {
      const parts = str.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);

        if (year < 100) {
          year = year + 2000;
        }

        const date = new Date(year, month, day);
        return isNaN(date.getTime()) ? null : date;
      }
    }

    // Handle YYYY-MM-DD format
    if (str.includes("-")) {
      const parts = str.split(" ");
      const datePart = parts[0];
      const [year, month, day] = datePart.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  };

  // Auto-fetch client by code or name
  const findClient = (clientCode, clientName) => {
    if (clientCode && clientCode.toString().trim()) {
      const code = clientCode.toString().trim().toLowerCase();
      if (clientMap[code]) {
        return clientMap[code];
      }
    }

    if (clientName && clientName.toString().trim()) {
      const name = clientName.toString().trim().toLowerCase();

      if (clientMap[name]) {
        return clientMap[name];
      }
    }

    return null;
  };

  // Auto-fetch PO by number
  const findPurchaseOrder = (poNumber) => {
    if (!poNumber) return null;

    // Convert to string and clean
    const poStr = poNumber.toString().trim();

    // Try direct match first
    if (poMap[poStr]) {
      console.log(`PO found via direct match: ${poStr}`);
      return poMap[poStr];
    }

    // Try case-insensitive match
    const poLower = poStr.toLowerCase();
    if (poMap[poLower]) {
      console.log(`PO found via lowercase match: ${poLower}`);
      return poMap[poLower];
    }

    // Remove all spaces and special characters
    const cleanStr = poStr.replace(/[\s-_]/g, "").toLowerCase();
    if (poMap[cleanStr]) {
      console.log(`PO found via cleaned match: ${cleanStr}`);
      return poMap[cleanStr];
    }

    // Try with only numbers
    const numberOnly = poStr.replace(/[^0-9]/g, "");
    if (numberOnly && poMap[numberOnly]) {
      console.log(`PO found via number-only match: ${numberOnly}`);
      return poMap[numberOnly];
    }

    // Try fuzzy match - search through all POs
    const poList = purchaseOrdersRef.current;
    if (!poList || poList.length === 0) {
      console.log("PO list empty during lookup");
      return null;
    }

    // Find by contains match
    const containsMatch = poList.find((po) => {
      if (!po.poNumber) return false;
      const poNumStr = po.poNumber.toString().toLowerCase();
      return poNumStr.includes(poLower) || poLower.includes(poNumStr);
    });

    if (containsMatch) {
      console.log(
        `PO found via contains match: ${poStr} -> ${containsMatch.poNumber}`,
      );
      return containsMatch;
    }

    console.log(`No PO found for: ${poStr}`);
    return null;
  };

  const getClientData = (client) => {
    // If no client found, return default empty object with all fields
    if (!client) {
      return {
        name: "",
        address: "",
        city: "",
        state: "",
        stateCode: "",
        country: "India",
        pinCode: "",
        GSTIN: "", // Backend expects GSTIN, not taxIdentifierNumber
        taxIdentifierType: "",
        taxIdentifierNumber: "",
      };
    }

    // Get GST number - backend expects this as GSTIN
    const gstNumber = client.gstNumber || client.GSTIN || "";

    // Get PAN/EIN/VAT as taxIdentifierNumber
    const taxIdentifierNumber =
      client.panNumber ||
      client.einNumber ||
      client.vatNumber ||
      client.ssnNumber ||
      client.nationalIdNumber ||
      "";

    const taxIdentifierType =
      client.taxIdentifierType ||
      (client.gstNumber
        ? "GST"
        : client.panNumber
          ? "PAN"
          : client.einNumber
            ? "EIN"
            : client.vatNumber
              ? "VAT"
              : client.ssnNumber
                ? "SSN"
                : client.nationalIdNumber
                  ? "National ID"
                  : "");

    const fullAddress = [
      client.clientAddress || client.address || "",
      client.clientCity || client.city || "",
      client.clientState || client.state || "",
      client.pinCode || "",
      client.clientCountry || client.country || "India",
    ]
      .filter(Boolean)
      .join(", ");

    return {
      name: client.clientName || client.name || "",
      address: fullAddress || client.clientAddress || client.address || "",
      city: client.clientCity || client.city || "",
      state: client.clientState || client.state || "",
      stateCode: client.stateCode || client.gstStateCode || "",
      country: client.clientCountry || client.country || "India",
      pinCode: client.pinCode || "",
      GSTIN: gstNumber, // Backend expects this field
      gstNumber: gstNumber, // Also include for compatibility
      taxIdentifierType: taxIdentifierType,
      taxIdentifierNumber: taxIdentifierNumber,
    };
  };

  // Auto-fetch HSN data
  const getHsnData = (hsnCode) => {
    if (!hsnCode) return null;

    const code = hsnCode.toString().trim().toUpperCase();
    return (
      hsnMap[code] ||
      hsnList.find((h) => h.hsnCode?.toString().trim().toUpperCase() === code)
    );
  };

  // Calculate GST split based on state codes
  const calculateGstSplit = (gstAmount, billToStateCode, shipToStateCode) => {
    let cgst = 0,
      sgst = 0,
      igst = 0;

    if (
      billToStateCode &&
      shipToStateCode &&
      billToStateCode.toString() === shipToStateCode.toString()
    ) {
      cgst = parseFloat((gstAmount / 2).toFixed(2));
      sgst = parseFloat((gstAmount / 2).toFixed(2));
    } else {
      igst = gstAmount;
    }

    return { cgst, sgst, igst };
  };

  // Group invoices by Invoice Group ID
  const groupInvoicesByGroupId = (rows) => {
    const groups = {};

    if (!rows || !Array.isArray(rows)) return groups;

    rows.forEach((row, index) => {
      if (!row) return;

      const groupId = row["Invoice Group ID*"];
      if (!groupId || groupId.toString().trim() === "") {
        const uniqueId = `ROW-${index + 1}`;
        if (!groups[uniqueId]) {
          groups[uniqueId] = [];
        }
        groups[uniqueId].push(row);
      } else {
        const groupIdStr = groupId.toString().trim();
        if (!groups[groupIdStr]) {
          groups[groupIdStr] = [];
        }
        groups[groupIdStr].push(row);
      }
    });

    return groups;
  };

 const validateRows = (rows) => {
  const allErrors = [];
  const enrichedRows = [];

  if (!rows || !Array.isArray(rows)) {
    return { errors: ["Invalid data format"], enrichedRows: [] };
  }

  // First pass: collect PO references for each group
  const groupPOReferences = {};
  
  rows.forEach((row, index) => {
    // Check if row is completely empty
    const isRowEmpty = Object.values(row).every(
      (value) =>
        value === undefined ||
        value === null ||
        value.toString().trim() === "",
    );

    if (isRowEmpty) {
      return; // Skip empty rows
    }

    const groupId = row["Invoice Group ID*"];
    if (groupId && groupId.toString().trim() !== "") {
      const groupIdStr = groupId.toString().trim();
      const poRef = row["PO Reference"] ? row["PO Reference"].toString().trim() : "";
      
      if (!groupPOReferences[groupIdStr]) {
        groupPOReferences[groupIdStr] = new Set();
      }
      if (poRef) {
        groupPOReferences[groupIdStr].add(poRef);
      }
    }
  });

  // Second pass: validate rows
  rows.forEach((row, index) => {
    // Check if row is completely empty
    const isRowEmpty = Object.values(row).every(
      (value) =>
        value === undefined ||
        value === null ||
        value.toString().trim() === "",
    );

    if (isRowEmpty) {
      console.log(`Row ${index + 2}: Skipping empty row`);
      return;
    }

    const rowNum = index + 2;
    const errors = [];
    let hasValidationError = false;

    // NEW VALIDATION: Check if group has multiple different PO references
    const groupId = row["Invoice Group ID*"] ? row["Invoice Group ID*"].toString().trim() : "";
    if (groupId && groupPOReferences[groupId] && groupPOReferences[groupId].size > 1) {
      const poRefs = Array.from(groupPOReferences[groupId]).join(", ");
      errors.push(`Row ${rowNum}: Invoice Group "${groupId}" contains multiple different PO References (${poRefs}).For different PO group id should also be different.`);
      hasValidationError = true;
    }

    // Check if PO is provided
    const hasPO =
      row["PO Reference"] && row["PO Reference"].toString().trim() !== "";
    console.log(
      `Row ${rowNum}: PO Reference =`,
      row["PO Reference"],
      "hasPO =",
      hasPO,
    );

    // If PO is provided, try to fetch it first
    let poData = null;
    if (hasPO) {
      const poRef = row["PO Reference"].toString().trim();
      console.log(`Row ${rowNum}: Looking for PO:`, poRef);

      poData = findPurchaseOrder(poRef);
      console.log(`Row ${rowNum}: PO Data found =`, poData ? "Yes" : "No");

      if (poData) {
        // Store PO data for later use
        row._poData = JSON.parse(JSON.stringify(poData)); // Deep clone
        row._poFound = true;

      } else {
        // PO not found - mark as error but still include in preview
        row._poFound = false;
        row._poError = `PO Reference "${poRef}" not found in this company`;
        errors.push(row._poError);
        hasValidationError = true;
        console.log(`Row ${rowNum}: PO not found:`, poRef);
      }
    }

    {
      if (!poData) {
        console.log(`Row ${rowNum}: No valid PO, performing full validation`);
      }

      // Required fields validation
      if (
        !row["Invoice Group ID*"] ||
        row["Invoice Group ID*"].toString().trim() === ""
      ) {
        errors.push(`Row ${rowNum}: Invoice Group ID is required`);
        hasValidationError = true;
      }

      // Invoice Date validation
      if (
        !poData &&
        (!row["Invoice Date*"] || !row["Invoice Date*"].toString().trim())
      ) {
        errors.push(`Row ${rowNum}: Invoice Date is required`);
        hasValidationError = true;
      } else if (row["Invoice Date*"]) {
        const parsedDate = parseDate(row["Invoice Date*"]);
        if (!parsedDate) {
          errors.push(
            `Row ${rowNum}: Invalid Invoice Date format. Use DD/MM/YYYY`,
          );
          hasValidationError = true;
        }
      }

      // Client validation
      const hasClientName =
        row["Client Name*"] && row["Client Name*"].toString().trim() !== "";
      const hasClientCode =
        row["Client Code"] && row["Client Code"].toString().trim() !== "";

      if (!poData && !hasClientName && !hasClientCode) {
        errors.push(
          `Row ${rowNum}: Either Client Name or Client Code is required`,
        );
        hasValidationError = true;
      }

      // Items validation
      let itemFound = false;
      for (let i = 1; i <= 5; i++) {
        const descField =
          i === 1 ? "Item Description*" : `Item ${i} Description*`;
        const description = row[descField] || row[`Item ${i} - Description*`];

        if (description && description.toString().trim() !== "") {
          itemFound = true;

          const hsnField = i === 1 ? "Item HSN/SAC*" : `Item ${i} HSN/SAC*`;
          const rateField = i === 1 ? "Item Rate*" : `Item ${i} Rate*`;

          const hsnCode = row[hsnField] || row[`Item ${i} - HSN/SAC*`];
          if (!hsnCode || hsnCode.toString().trim() === "") {
            errors.push(`Row ${rowNum}, Item ${i}: HSN/SAC is required`);
            hasValidationError = true;
          } else {
            const hsn = getHsnData(hsnCode);
            if (!hsn) {
              errors.push(
                `Row ${rowNum}, Item ${i}: HSN/SAC code "${hsnCode}" does not exist in HSN master data`,
              );
              hasValidationError = true;
            }
          }

          const quantity =
            (i === 1
              ? row["Item Quantity*"] ?? row["Item Quantity"]
              : row[`Item ${i} Quantity*`] ?? row[`Item ${i} Quantity`]) ??
            row[`Item ${i} - Quantity`];
          if (quantity === undefined || quantity === null || quantity.toString().trim() === "") {
            errors.push(`Row ${rowNum}, Item ${i}: Quantity is required`);
            hasValidationError = true;
          } else if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
            errors.push(`Row ${rowNum}, Item ${i}: Quantity must be a positive number`);
            hasValidationError = true;
          }

          const rate = parseFloat(row[rateField] || row[`Item ${i} - Rate*`]);
          if (isNaN(rate) || rate <= 0) {
            errors.push(
              `Row ${rowNum}, Item ${i}: Rate must be a positive number`,
            );
            hasValidationError = true;
          }
        }
      }

      if (!poData && !itemFound) {
        errors.push(`Row ${rowNum}: At least one item is required`);
        hasValidationError = true;
      }

      // Auto-fetch client if code provided
      if (hasClientCode) {
        const client = findClient(row["Client Code"].toString().trim(), null);
        if (client) {
          row._clientData = client;
          if (hasClientName) {
            const namedClient = findClient(
              null,
              row["Client Name*"].toString().trim(),
            );
            if (!namedClient) {
              errors.push(
                `Row ${rowNum}: Client "${row["Client Name*"]}" does not exist in client master data`,
              );
              hasValidationError = true;
            } else if (String(namedClient._id) !== String(client._id)) {
              errors.push(
                `Row ${rowNum}: Client Name "${row["Client Name*"]}" does not match Client Code "${row["Client Code"]}"`,
              );
              hasValidationError = true;
            }
          }
        } else {
          errors.push(
            `Row ${rowNum}: Client Code "${row["Client Code"]}" does not exist in client master data`,
          );
          hasValidationError = true;
        }
      } else if (hasClientName) {
        const client = findClient(
          null,
          row["Client Name*"].toString().trim(),
        );
        if (client) {
          row._clientData = client;
        } else {
          errors.push(
            `Row ${rowNum}: Client "${row["Client Name*"]}" does not exist in client master data`,
          );
          hasValidationError = true;
        }
      }
    }

    // Mark row as having validation errors if any
    if (errors.length > 0) {
      row._hasErrors = true;
      row._errors = errors;
    } else {
      row._hasErrors = false;
      row._errors = [];
    }

    allErrors.push(...errors);
    enrichedRows.push(row);
  });

  console.log("Validation complete. Errors:", allErrors.length);
  console.log("Enriched rows count:", enrichedRows.length);
  return { errors: allErrors, enrichedRows };
};
  const transformToInvoices = (rows, companyId, userId) => {
    const invoices = [];

    // Group rows by Invoice Group ID
    const groupedRows = groupInvoicesByGroupId(rows);

    Object.keys(groupedRows).forEach((groupId) => {
      const groupRows = groupedRows[groupId];
      const firstRow = groupRows[0];

      // Skip if no first row
      if (!firstRow) return;

      console.log(`Processing group ${groupId}:`, firstRow);

      // Get PO data from the row (stored during validation)
      const poData = firstRow._poData;
      if (poData) {
        console.log(`Group ${groupId} has PO data:`, poData.poNumber);
      }

      // Determine invoice date
      let invoiceDate = null;
      if (firstRow["Invoice Date*"]) {
        invoiceDate = parseDate(firstRow["Invoice Date*"]);
      }
      if (!invoiceDate && poData?.poDate) {
        invoiceDate = new Date(poData.poDate);
      }
      if (!invoiceDate) {
        invoiceDate = new Date();
      }

      // Determine due date
      let dueDate = null;
      if (poData?.deliveryDate) {
        dueDate = new Date(poData.deliveryDate);
      } else if (firstRow["Invoice Date*"]) {
        dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + 7);
      } else {
        dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + 7);
      }

      // Get client data - from PO first, then from Excel
      let client = null;
      let billTo = null;
      let stateCode = null;

      if (poData?.deliverTo) {
        // Try to find client in system by name from PO
        const poClientName = poData.deliverTo.name;
        if (poClientName) {
          client = findClient(null, poClientName);
        }

        // Get state code from client or PO
        stateCode =
          client?.stateCode ||
          client?.gstStateCode ||
          poData.deliverTo.stateCode ||
          "";

        // Create billTo from PO data
        billTo = {
          name: poData.deliverTo.name || "",
          address: poData.deliverTo.address || "",
          city: poData.deliverTo.city || "",
          state: poData.deliverTo.state || "",
          stateCode: stateCode,
          country: poData.deliverTo.country || "India",
          pinCode: poData.deliverTo.pinCode || "",
          GSTIN: poData.deliverTo.GSTIN || "",
          gstNumber: poData.deliverTo.GSTIN || "",
          taxIdentifierType: poData.deliverTo.GSTIN ? "GST" : "",
          taxIdentifierNumber: poData.deliverTo.GSTIN || "",
        };
      }

      // If no PO client, try from Excel
      if (!billTo) {
        const hasClientCode =
          firstRow["Client Code"] &&
          firstRow["Client Code"].toString().trim() !== "";
        const hasClientName =
          firstRow["Client Name*"] &&
          firstRow["Client Name*"].toString().trim() !== "";

        if (hasClientCode) {
          client = findClient(firstRow["Client Code"].toString().trim(), null);
        } else if (hasClientName) {
          client = findClient(null, firstRow["Client Name*"].toString().trim());
        }

        billTo = getClientData(client);
        stateCode = billTo?.stateCode || "";

        // If still no name, use from Excel
        if (!billTo.name && firstRow["Client Name*"]) {
          billTo.name = firstRow["Client Name*"].toString().trim();
        }
      }

      // Process items - from Excel first, then from PO
      let items = [];
      let totalTaxableValue = 0;
      let totalCGSTAmount = 0;
      let totalSGSTAmount = 0;
      let totalIGSTAmount = 0;
      let totalTDSAmount = 0;

      // Check for Excel items
      const excelItems = groupRows.filter(
        (row) =>
          row["Item Description*"] &&
          row["Item Description*"].toString().trim() !== "",
      );

      if (excelItems.length > 0) {
        // Process Excel items
        excelItems.forEach((row) => {
          const description = row["Item Description*"].toString().trim();
          const hsnCode = row["Item HSN/SAC*"]
            ? row["Item HSN/SAC*"].toString().trim()
            : "";
          const quantity = Number(
            row["Item Quantity*"] ?? row["Item Quantity"] ?? 0,
          );
          const rate = row["Item Rate*"]
            ? parseFloat(row["Item Rate*"]) || 0
            : 0;

          const hsn = hsnCode ? getHsnData(hsnCode) : null;
          const gstRate = hsn
            ? stateCode
              ? (hsn.cgst || 0) + (hsn.sgst || 0)
              : hsn.igst || 0
            : 0;
          const tdsRate = hsn?.tdsRate || 0;

          const taxableValue = parseFloat((quantity * rate).toFixed(2));
          const gstAmount = parseFloat(
            ((taxableValue * gstRate) / 100).toFixed(2),
          );
          const itemTDSAmount = parseFloat(
            ((taxableValue * tdsRate) / 100).toFixed(2),
          );

          let cgst = 0,
            sgst = 0,
            igst = 0;
          if (stateCode) {
            cgst = parseFloat((gstAmount / 2).toFixed(2));
            sgst = parseFloat((gstAmount / 2).toFixed(2));
          } else {
            igst = gstAmount;
          }

          items.push({
            description,
            hsnSac: hsnCode,
            quantity,
            rate,
            taxableValue,
            gstRate,
            gstAmount,
            total: taxableValue + gstAmount,
            cgst,
            sgst,
            igst,
          });

          totalTaxableValue += taxableValue;
          totalCGSTAmount += cgst;
          totalSGSTAmount += sgst;
          totalIGSTAmount += igst;
          totalTDSAmount += itemTDSAmount;
        });
      } else if (poData?.items && poData.items.length > 0) {
        // Use PO items - RECALCULATE TAXES based on client state
        poData.items.forEach((item) => {
          // Get HSN data for this item
          const hsnCode = item.hsnSac || "";
          const hsn = hsnCode ? getHsnData(hsnCode) : null;

          // Calculate GST rate based on client state
          const gstRate = hsn
            ? stateCode
              ? (hsn.cgst || 0) + (hsn.sgst || 0)
              : hsn.igst || 0
            : 0;
          const tdsRate = hsn?.tdsRate || 0;

          // Use item values from PO or defaults
          const quantity = item.quantity || 1;
          const rate = item.rate || 0;
          const taxableValue = item.taxableValue || quantity * rate;

          // Recalculate GST amount based on client state
          const gstAmount = parseFloat(
            ((taxableValue * gstRate) / 100).toFixed(2),
          );
          const itemTDSAmount = parseFloat(
            ((taxableValue * tdsRate) / 100).toFixed(2),
          );

          // Determine CGST/SGST/IGST based on client state
          let cgst = 0,
            sgst = 0,
            igst = 0;
          if (stateCode) {
            cgst = parseFloat((gstAmount / 2).toFixed(2));
            sgst = parseFloat((gstAmount / 2).toFixed(2));
          } else {
            igst = gstAmount;
          }

          items.push({
            description: item.description || "",
            hsnSac: hsnCode,
            quantity,
            rate,
            taxableValue,
            gstRate,
            gstAmount,
            total: taxableValue + gstAmount,
            cgst,
            sgst,
            igst,
          });

          totalTaxableValue += taxableValue;
          totalCGSTAmount += cgst;
          totalSGSTAmount += sgst;
          totalIGSTAmount += igst;
          totalTDSAmount += itemTDSAmount;
        });
      }

      const amountDue =
        totalTaxableValue + totalCGSTAmount + totalSGSTAmount + totalIGSTAmount;

      // Get payment terms from PO or default
      const paymentTerms = poData?.paymentTerms || "Net 30 Days";

      // Get currency from PO or Excel
      const currency = poData?.currency || firstRow["Currency"] || "INR";

      // Payment mode from Excel
      const paymentMode = firstRow["Payment Mode"] || "Bank-Transfer";

      // Digital signature
      const digitalSignature =
        firstRow && firstRow["Digital Signature"]
          ? firstRow["Digital Signature"].toString().toLowerCase() === "yes"
          : false;

      // Manual TDS
      const manualTDSAmount =
        firstRow && firstRow["Manual TDS Amount"]
          ? parseFloat(firstRow["Manual TDS Amount"]) || 0
          : 0;
      const finalTDSAmount =
        totalTDSAmount > 0 ? totalTDSAmount : manualTDSAmount;

      // Create shipTo as copy of billTo
      const shipTo = { ...billTo };

      const invoice = {
        companyId,
        createdBy: userId,
        poreferencevalue: firstRow["PO Reference"]?.toString().trim() || "",
        invoiceDate,
        dueDate,
        referenceDate: invoiceDate,
        currency,
        paymentMode,
        paymentTerms,
        billTo,
        shipTo,
        items,
        totalTaxableValue,
        totalCGSTAmount,
        totalSGSTAmount,
        totalIGSTAmount,
        tdsAmount: finalTDSAmount,
        totalTDSAmount: finalTDSAmount,
        amountDue,
        netPayable: amountDue - finalTDSAmount,
        withSignature: digitalSignature,
      };

      console.log(`Generated invoice for group ${groupId}:`, invoice);
      invoices.push(invoice);
    });

    return invoices;
  };

  // Helper function to process items
  const processItems = (groupRows, billTo) => {
    const items = [];

    groupRows.forEach((row) => {
      const description =
        row && row["Item Description*"]
          ? row["Item Description*"].toString().trim()
          : "";
      const hsnCode =
        row && row["Item HSN/SAC*"]
          ? row["Item HSN/SAC*"].toString().trim()
          : "";
      const quantity = Number(
        row?.["Item Quantity*"] ?? row?.["Item Quantity"] ?? 0,
      );
      const rate =
        row && row["Item Rate*"] ? parseFloat(row["Item Rate*"]) || 0 : 0;

      if (!description) return;

      const hsn = hsnCode ? getHsnData(hsnCode) : null;
      const gstRate = hsn
        ? billTo?.stateCode
          ? (hsn.cgst || 0) + (hsn.sgst || 0)
          : hsn.igst || 0
        : 0;

      const taxableValue = parseFloat((quantity * rate).toFixed(2));
      const gstAmount = parseFloat(((taxableValue * gstRate) / 100).toFixed(2));

      let cgst = 0,
        sgst = 0,
        igst = 0;
      if (billTo?.stateCode) {
        cgst = parseFloat((gstAmount / 2).toFixed(2));
        sgst = parseFloat((gstAmount / 2).toFixed(2));
      } else {
        igst = gstAmount;
      }

      items.push({
        description,
        hsnSac: hsnCode,
        quantity,
        rate,
        taxableValue,
        gstRate,
        gstAmount,
        total: taxableValue + gstAmount,
        cgst,
        sgst,
        igst,
      });
    });

    return items;
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setShowPreview(false);
    setValidationErrors([]);
    setPreviewData([]);
    setEnrichedRowsData([]);
  };

  const handlePreview = async () => {
    if (!file) return;

    if (loadingData) {
      toast.error("Please wait while data is loading...");
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: true,
        dateNF: "dd/mm/yyyy",
      });

      // Get the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: "dd/mm/yyyy",
        defval: "",
      });

      if (jsonData.length === 0) {
        toast.error("The Excel file is empty!");
        return;
      }

      // Validate rows - this will also fetch PO data
      const { errors, enrichedRows } = validateRows(jsonData);

      setEnrichedRowsData(enrichedRows);

      // Group the enriched rows by Invoice Group ID
      const groupedInvoices = groupInvoicesByGroupId(enrichedRows);

      // Create a preview-friendly structure with PO data
      const previewInvoices = [];

      Object.keys(groupedInvoices).forEach((groupId) => {
        const groupRows = groupedInvoices[groupId];
        const firstRow = groupRows[0];

        // Check if any row in this group has errors
        const groupHasErrors = groupRows.some((row) => row._hasErrors);
        const groupErrors = groupRows
          .filter((row) => row._hasErrors)
          .flatMap((row) => row._errors || []);

        // Get PO data from the row (stored during validation)
        const poData = firstRow._poData;
        const poFound = firstRow._poFound;
        const poError = firstRow._poError;

        console.log(`Preview - Group ${groupId}:`, {
          hasPO: !!poData,
          poNumber: poData?.poNumber,
          poItems: poData?.items?.length,
          poFound,
          poError,
          groupHasErrors,
        });

        // Get client info - first from PO, then from Excel
        // Get client info - first from PO, then from Excel
        let clientName = "";
        let clientCode = "";
        let client = null;
        let invoiceDate = firstRow["Invoice Date*"] || "";
        let poRef = firstRow["PO Reference"] || "—";
        let currency = firstRow["Currency"] || "INR";
        let paymentTerms = "Net 30 Days";

        if (poData) {
          // Use PO data for preview
          poRef = poData.poNumber || poRef;
          currency = poData.currency || currency;
          paymentTerms = poData.paymentTerms || paymentTerms;

          // Get client from PO
          if (poData.deliverTo) {
            clientName = poData.deliverTo.name || "";

            // Try to find client in system by name to get client code
            if (clientName) {
              client = findClient(null, clientName);
              if (client) {
                clientCode = client.clientCode || client.code || "";
              }
            }
          }

          // Use PO date if available and no Excel date
          if (!invoiceDate && poData.poDate) {
            const date = new Date(poData.poDate);
            invoiceDate = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
          }
        }

        // If no PO client, use from Excel
        if (!clientName) {
          clientName = firstRow["Client Name*"] || "";
          clientCode = firstRow["Client Code"] || "";

          // Try to find client by code first (if provided)
          if (clientCode && clientCode !== "") {
            client = findClient(clientCode, null);
            if (client) {
              clientName = client.clientName || client.name || clientName;
              console.log(`Found client by code ${clientCode}:`, clientName);
            }
          }

          // If still no client, try by name
          if (!client && clientName && clientName !== "") {
            client = findClient(null, clientName);
          }

          // If client found but code wasn't set, get the code
          if (client) {
            if (!clientCode || clientCode === "") {
              clientCode = client.clientCode || client.code || "—";
            }
            // Ensure we have the client name
            if (!clientName || clientName === "") {
              clientName = client.clientName || client.name || "Unknown";
            }
          }

          // If still no client name after all attempts, set to "Unknown" only if we have a code
          if (!clientName && clientCode && clientCode !== "") {
            clientName = "Unknown";
          } else if (!clientName) {
            clientName = "Unknown";
          }

          // If no client code, set to "—"
          if (!clientCode || clientCode === "") {
            clientCode = "—";
          }
        }

        // Process items - from Excel first, then from PO
        let items = [];

        // Check for Excel items
        const excelItems = groupRows.filter(
          (row) =>
            row["Item Description*"] &&
            row["Item Description*"].toString().trim() !== "",
        );

        if (excelItems.length > 0) {
          items = excelItems.map((row) => ({
            description: row["Item Description*"],
            hsn: row["Item HSN/SAC*"],
            quantity: row["Item Quantity*"] ?? row["Item Quantity"] ?? "",
            rate: row["Item Rate*"],
            hasHsn: getHsnData(row["Item HSN/SAC*"]) ? true : false,
          }));
        } else if (poData?.items && poData.items.length > 0) {
          // Use PO items
          items = poData.items.map((item) => ({
            description: item.description || "",
            hsn: item.hsnSac || "",
            quantity: item.quantity,
            rate: item.rate || 0,
            hasHsn: getHsnData(item.hsnSac) ? true : false,
          }));
        }

        // Calculate total
        let totalAmount = 0;
        items.forEach((item) => {
          const qty = parseFloat(item.quantity) || 1;
          const rate = parseFloat(item.rate) || 0;
          const hsn = getHsnData(item.hsn);
          const stateCode =
            client?.stateCode || poData?.deliverTo?.stateCode || "";
          const gstRate = hsn
            ? stateCode
              ? hsn.cgst + hsn.sgst
              : hsn.igst
            : 0;
          const taxable = qty * rate;
          totalAmount += taxable + (taxable * gstRate) / 100;
        });

        // If no items calculated but PO has total, use that
        if (totalAmount === 0 && poData?.totalAmount) {
          totalAmount = poData.totalAmount;
        }

        previewInvoices.push({
          groupId,
          invoiceDate,
          poRef,
          poData,
          clientName,
          clientCode: clientCode || "—",
          clientData: client,
          currency: currency,
          paymentMode: firstRow["Payment Mode"] || "Bank-Transfer",
          paymentTerms: paymentTerms,
          items,
          itemCount: items.length,
          totalAmount: totalAmount.toFixed(2),
          hasClient: !!(client || poData?.deliverTo),
          hasPO: !!poData,
          poFound: poFound,
          poError: poError,
          hasErrors: groupHasErrors,
          errors: groupErrors,
          digitalSignature: firstRow["Digital Signature"] || "No",
          manualTDS: firstRow["Manual TDS Amount"] || "0",
        });
      });

      setPreviewData(previewInvoices);

      // Calculate valid and invalid counts
      const validCount = previewInvoices.filter((inv) => !inv.hasErrors).length;
      const invalidCount = previewInvoices.filter(
        (inv) => inv.hasErrors,
      ).length;

      // Show appropriate message based on errors
      if (errors.length > 0) {
        setValidationErrors(errors);
        setShowPreview(true);

        if (validCount > 0 && invalidCount > 0) {
          // Mixed: some valid, some invalid
          toast.warning(
            `⚠️ ${validCount} invoice(s) are valid. ${invalidCount} invoice(s) have errors and will be skipped.`,
          );
        } else if (validCount === 0) {
          // All invalid
          toast.error(
            `❌ All ${invalidCount} invoice(s) have validation errors. Please fix them before uploading.`,
          );
          setValidationErrors(errors);
        } else {
          // This case shouldn't happen since errors.length > 0, but just in case
          toast.warning(
            `Found ${errors.length} validation error(s). Please review before uploading.`,
          );
        }
      } else {
        setValidationErrors([]);
        setShowPreview(true);
        toast.success(
          `✅ Validation successful! All ${validCount} invoice(s) are ready to upload.`,
        );
      }
    } catch (error) {
      console.error("Error reading file:", error);
      toast.error("Error reading Excel file. Please check the file format.");
    }
  };

  const handleUpload = async () => {
    if (!showPreview || previewData.length === 0) return;

    setUploading(true);
    try {
      // Filter out rows with errors before uploading
      const validEnrichedRows = enrichedRowsData.filter(
        (row) => !row._hasErrors,
      );

      if (validEnrichedRows.length === 0) {
        toast.error("No valid rows to upload. Please fix the errors first.");
        setUploading(false);
        return;
      }

      // Transform only valid rows to invoices
      const invoices = transformToInvoices(
        validEnrichedRows,
        companyId,
        userId,
      );

      // Format invoices exactly as backend expects
      const formattedInvoices = invoices.map((inv) => {
        // Ensure dates are in ISO format that can be converted to Date objects
        const formatDateForBackend = (date) => {
          if (!date) return new Date().toISOString();
          if (date instanceof Date) return date.toISOString();
          return new Date(date).toISOString();
        };

        // Make sure all required fields are present
        return {
          companyId: inv.companyId,
          createdBy: inv.createdBy,
          poreferencevalue: inv.poreferencevalue || "",
          invoiceDate: formatDateForBackend(inv.invoiceDate),
          dueDate: formatDateForBackend(inv.dueDate),
          referenceDate: formatDateForBackend(
            inv.referenceDate || inv.invoiceDate,
          ),
          currency: inv.currency || "INR",
          paymentMode: inv.paymentMode || "Bank-Transfer",
          billTo: {
            name: inv.billTo?.name || "",
            address: inv.billTo?.address || "",
            city: inv.billTo?.city || "",
            state: inv.billTo?.state || "",
            stateCode: inv.billTo?.stateCode || "",
            country: inv.billTo?.country || "India",
            pinCode: inv.billTo?.pinCode || "",
            GSTIN: inv.billTo?.GSTIN || inv.billTo?.gstNumber || "",
            gstNumber: inv.billTo?.GSTIN || inv.billTo?.gstNumber || "",
            taxIdentifierType: inv.billTo?.taxIdentifierType || "",
            taxIdentifierNumber: inv.billTo?.taxIdentifierNumber || "",
          },
          shipTo: {
            name: inv.shipTo?.name || inv.billTo?.name || "",
            address: inv.shipTo?.address || inv.billTo?.address || "",
            city: inv.shipTo?.city || inv.billTo?.city || "",
            state: inv.shipTo?.state || inv.billTo?.state || "",
            stateCode: inv.shipTo?.stateCode || inv.billTo?.stateCode || "",
            country: inv.shipTo?.country || inv.billTo?.country || "India",
            pinCode: inv.shipTo?.pinCode || inv.billTo?.pinCode || "",
            GSTIN:
              inv.shipTo?.GSTIN ||
              inv.billTo?.GSTIN ||
              inv.billTo?.gstNumber ||
              "",
            gstNumber:
              inv.shipTo?.GSTIN ||
              inv.billTo?.GSTIN ||
              inv.billTo?.gstNumber ||
              "",
            taxIdentifierType:
              inv.shipTo?.taxIdentifierType ||
              inv.billTo?.taxIdentifierType ||
              "",
            taxIdentifierNumber:
              inv.shipTo?.taxIdentifierNumber ||
              inv.billTo?.taxIdentifierNumber ||
              "",
          },
          items: inv.items.map((item) => ({
            description: item.description || "",
            hsnSac: item.hsnSac || "",
            quantity: item.quantity,
            rate: item.rate || 0,
            taxableValue: item.taxableValue || 0,
            gstRate: item.gstRate || 0,
            gstAmount: item.gstAmount || 0,
            total: item.total || 0,
            cgst: item.cgst || 0,
            sgst: item.sgst || 0,
            igst: item.igst || 0,
          })),
          totalTaxableValue: inv.totalTaxableValue || 0,
          totalCGSTAmount: inv.totalCGSTAmount || 0,
          totalSGSTAmount: inv.totalSGSTAmount || 0,
          totalIGSTAmount: inv.totalIGSTAmount || 0,
          tdsAmount: inv.tdsAmount || 0,
          totalTDSAmount: inv.totalTDSAmount || 0,
          amountDue: inv.amountDue || 0,
          netPayable: inv.netPayable || 0,
          valueInWords: inv.valueInWords || convertToWords(inv.netPayable || 0),
          withSignature: inv.withSignature || false,
          status: "pending",
          approvalStatus: "Pending",
          accountingStatus: "pending",
        };
      });

      // Call bulk create API
      const response = await bulkCreateInvoicesApi({
        invoices: formattedInvoices,
      });

      if (response?.data?.created > 0) {
        const skippedCount = previewData.filter((invoice) => invoice.hasErrors).length;
        toast.success(
          `Successfully created ${response.data.created} invoice(s).` +
            (skippedCount ? ` ${skippedCount} invoice(s) skipped due to validation errors.` : ""),
        );

        response.data.errors?.forEach((err) => {
          toast.error(`Invoice ${err.index}: ${err.error}`);
        });
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(response?.message || "Bulk upload failed");
        response?.data?.errors?.forEach((err) => {
          toast.error(`Invoice ${err.index}: ${err.error}`);
        });
      }
    } catch (error) {
      console.error("Upload error:", error);

      if (error.response) {
        console.error("Error response data:", error.response.data);
        console.error("Error response status:", error.response.status);

        const errorMessage =
          error.response.data?.message || "Failed to upload invoices";
        toast.error(errorMessage);

        if (error.response.data?.data?.errors) {
          error.response.data.data.errors.forEach((err) => {
            toast.error(`Invoice ${err.index}: ${err.error}`);
          });
        }
      } else {
        toast.error(error.message || "Failed to upload invoices");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setValidationErrors([]);
    setPreviewData([]);
    setEnrichedRowsData([]);
    setShowPreview(false);
    setActiveTab("upload");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[120vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <FileSpreadsheet className="mr-3" size={28} />
              <div>
                <h2 className="text-2xl font-bold">📦 Bulk Invoice Upload</h2>
                <p className="text-sm text-blue-100 mt-1">
                  Upload multiple invoices with variable items using Excel
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab("upload")}
              className={`py-3 px-2 font-medium text-sm border-b-2 transition ${
                activeTab === "upload"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📤 Upload
            </button>
            <button
              onClick={() => setActiveTab("instructions")}
              className={`py-3 px-2 font-medium text-sm border-b-2 transition ${
                activeTab === "instructions"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📖 Instructions
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {activeTab === "instructions" ? (
            /* ===== INSTRUCTIONS TAB ===== */
            <div className="space-y-6">
              {/* Quick Start */}
              <div className="bg-blue-50 p-5 rounded-lg border border-blue-200">
                <h3 className="font-bold text-lg mb-3 flex items-center text-blue-800">
                  <FileText className="mr-2" size={20} />
                  Quick Start Guide
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-2xl mb-2">1️⃣</div>
                    <h4 className="font-semibold mb-1">Download Template</h4>
                    <p className="text-sm text-gray-600">
                      Click the Download button below to get the Excel template
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-2xl mb-2">2️⃣</div>
                    <h4 className="font-semibold mb-1">Fill Your Data</h4>
                    <p className="text-sm text-gray-600">
                      Enter invoice details - one row per item, same Group ID
                      for multiple items
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-2xl mb-2">3️⃣</div>
                    <h4 className="font-semibold mb-1">Upload & Create</h4>
                    <p className="text-sm text-gray-600">
                      Upload the filled template, preview, and create invoices
                    </p>
                  </div>
                </div>
              </div>

              {/* Template Columns */}
              <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                <h3 className="font-bold text-lg mb-3 flex items-center">
                  <FileSpreadsheet className="mr-2" size={20} />
                  Template Columns Explained
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left">Column</th>
                        <th className="px-4 py-2 text-left">Description</th>
                        <th className="px-4 py-2 text-left">Required</th>
                        <th className="px-4 py-2 text-left">Example</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      <tr>
                        <td className="px-4 py-2 whitespace-normal break-words font-medium">
                          Invoice Group ID*
                        </td>
                        <td className="px-4 py-2">
                          All items with the same Invoice Group ID <br />
                          will be combined into a single invoice.
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-red-600">Yes</span>
                        </td>
                        <td className="px-4 py-2">INV001</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">PO Reference</td>
                        <td className="px-4 py-2">Purchase Order number</td>
                        <td className="px-4 py-2">No</td>
                        <td className="px-4 py-2">PO-2024-001</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Invoice Date*</td>
                        <td className="px-4 py-2">Date in DD/MM/YYYY format</td>
                        <td className="px-4 py-2">
                          <span className="text-red-600">Yes</span>
                        </td>
                        <td className="px-4 py-2">12/02/2026</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Currency</td>
                        <td className="px-4 py-2">INR, USD, EUR, GBP</td>
                        <td className="px-4 py-2">No</td>
                        <td className="px-4 py-2">INR</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Payment Mode</td>
                        <td className="px-4 py-2">
                          Bank-Transfer, UPI, Cash, etc.
                        </td>
                        <td className="px-4 py-2">No</td>
                        <td className="px-4 py-2">Bank-Transfer</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Client Code</td>
                        <td className="px-4 py-2">
                          Unique client code from system
                        </td>
                        <td className="px-4 py-2">No*</td>
                        <td className="px-4 py-2">CL001</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Client Name*</td>
                        <td className="px-4 py-2">Client name (if no code)</td>
                        <td className="px-4 py-2">
                          <span className="text-red-600">Yes*</span>
                        </td>
                        <td className="px-4 py-2">AC Company</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">
                          Item Description*
                        </td>
                        <td className="px-4 py-2">
                          Description of product/service
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-red-600">Yes</span>
                        </td>
                        <td className="px-4 py-2">Consulting</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Item HSN/SAC*</td>
                        <td className="px-4 py-2">HSN/SAC code</td>
                        <td className="px-4 py-2">
                          <span className="text-red-600">Yes</span>
                        </td>
                        <td className="px-4 py-2">998314</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Item Quantity*</td>
                        <td className="px-4 py-2">Quantity (defaults to 1)</td>
                        <td className="px-4 py-2">No</td>
                        <td className="px-4 py-2">2</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">Item Rate*</td>
                        <td className="px-4 py-2">Unit price</td>
                        <td className="px-4 py-2">
                          <span className="text-red-600">Yes</span>
                        </td>
                        <td className="px-4 py-2">10000</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">
                          Manual TDS Amount
                        </td>
                        <td className="px-4 py-2">
                          Override auto TDS if needed
                        </td>
                        <td className="px-4 py-2">No</td>
                        <td className="px-4 py-2">0</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium">
                          Digital Signature
                        </td>
                        <td className="px-4 py-2">Yes/No (Default: No)</td>
                        <td className="px-4 py-2">No</td>
                        <td className="px-4 py-2">No</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Examples */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-semibold mb-2 text-green-800">
                    ✅ Example: Invoice with 3 items
                  </h4>
                  <div className="bg-white p-3 rounded text-sm font-mono">
                    <p>
                      INV001 | 12/02/2026 | CL001 | Item1 | 998314 | 1 | 10000
                    </p>
                    <p>
                      INV001 | 12/02/2026 | CL001 | Item2 | 998315 | 2 | 5000
                    </p>
                    <p>
                      INV001 | 12/02/2026 | CL001 | Item3 | 998316 | 3 | 2000
                    </p>
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-semibold mb-2 text-green-800">
                    ✅ Example: Invoice with 1 item
                  </h4>
                  <div className="bg-white p-3 rounded text-sm font-mono">
                    <p>
                      INV002 | 15/02/2026 | CL002 | Training | 998317 | 1 |
                      15000
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ===== UPLOAD TAB ===== */
            <>
              {/* Loading Indicator */}
              {loadingData && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <Loader2
                      className="animate-spin text-blue-600 mr-3"
                      size={20}
                    />
                    <p className="text-sm text-blue-900">
                      Loading client, HSN, and PO data...
                    </p>
                  </div>
                </div>
              )}

              {/* Data Loaded Banner */}
              {!loadingData && (
                <div className="bg-gradient-to-r from-green-50 to-teal-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <Info
                      className="text-green-600 mr-3 mt-1 flex-shrink-0"
                      size={20}
                    />
                    <div className="text-sm text-green-800">
                      <p className="font-semibold mb-1">
                        📋 Data Loaded Successfully:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-white px-3 py-1 rounded-full text-xs shadow-sm">
                          👥 {clients.length} Clients
                        </span>
                        <span className="bg-white px-3 py-1 rounded-full text-xs shadow-sm">
                          📊 {hsnList.length} HSN Codes
                        </span>
                        <span className="bg-white px-3 py-1 rounded-full text-xs shadow-sm">
                          📦 {purchaseOrders.length} POs
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Download Template Button */}
              <div className="mb-6">
                <button
                  onClick={handleDownloadTemplate}
                  disabled={loadingData}
                  className={`w-full py-4 px-4 rounded-xl flex items-center justify-center font-semibold transition shadow-lg ${
                    loadingData
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                  }`}
                >
                  <Download className="mr-2" size={24} />
                  <span className="text-lg">📥 Download Excel Template</span>
                </button>
              </div>

              {/* File Upload */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📎 Upload Filled Template
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      disabled={loadingData}
                      className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      id="file-upload"
                    />
                    {!file && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400">
                        <Upload className="mr-2" size={20} />
                        <span>Click to browse or drag & drop</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handlePreview}
                    disabled={!file || loadingData}
                    className={`px-8 py-3 rounded-lg font-semibold transition flex items-center ${
                      file && !loadingData
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    <Search className="mr-2" size={20} />
                    Preview
                  </button>
                </div>
                {file && (
                  <p className="text-sm text-gray-600 mt-2 flex items-center">
                    <CheckCircle2 className="text-green-500 mr-1" size={16} />
                    Selected: {file.name}
                  </p>
                )}
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <div className="flex items-start mb-3">
                    <AlertCircle
                      className="text-red-600 mr-2 flex-shrink-0"
                      size={20}
                    />
                    <h3 className="font-semibold text-red-800">
                      ⚠️ Validation Errors ({validationErrors.length})
                    </h3>
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-white rounded-lg p-3">
                    <ul className="space-y-1 text-sm text-red-700">
                      {validationErrors.map((error, index) => (
                        <li
                          key={index}
                          className="flex items-start border-b border-red-100 pb-1 last:border-0"
                        >
                          <span className="mr-2">•</span>
                          <span>{error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Preview Success */}
              {/* Preview Success - Updated to show valid/invalid counts */}
              {showPreview && previewData.length > 0 && (
                <div
                  className={`mb-6 border-2 rounded-lg p-4 ${
                    previewData.some((inv) => inv.hasErrors)
                      ? previewData.every((inv) => inv.hasErrors)
                        ? "bg-red-50 border-red-200" // All errors
                        : "bg-yellow-50 border-yellow-200" // Mixed
                      : "bg-green-50 border-green-200" // All valid
                  }`}
                >
                  <div className="flex items-center">
                    <div
                      className={`rounded-full p-2 mr-3 ${
                        previewData.some((inv) => inv.hasErrors)
                          ? previewData.every((inv) => inv.hasErrors)
                            ? "bg-red-100"
                            : "bg-yellow-100"
                          : "bg-green-100"
                      }`}
                    >
                      {previewData.some((inv) => inv.hasErrors) ? (
                        previewData.every((inv) => inv.hasErrors) ? (
                          <AlertCircle className="text-red-600" size={24} />
                        ) : (
                          <AlertCircle className="text-yellow-600" size={24} />
                        )
                      ) : (
                        <CheckCircle2 className="text-green-600" size={24} />
                      )}
                    </div>
                    <div>
                      <h3
                        className={`font-semibold text-lg ${
                          previewData.some((inv) => inv.hasErrors)
                            ? previewData.every((inv) => inv.hasErrors)
                              ? "text-red-800"
                              : "text-yellow-800"
                            : "text-green-800"
                        }`}
                      >
                        {previewData.every((inv) => inv.hasErrors)
                          ? "❌ Validation Failed"
                          : previewData.some((inv) => inv.hasErrors)
                            ? "⚠️ Partial Validation"
                            : "✅ Validation Successful!"}
                      </h3>
                      <p
                        className={`text-sm ${
                          previewData.some((inv) => inv.hasErrors)
                            ? previewData.every((inv) => inv.hasErrors)
                              ? "text-red-700"
                              : "text-yellow-700"
                            : "text-green-700"
                        }`}
                      >
                        {previewData.filter((inv) => !inv.hasErrors).length}{" "}
                        valid invoice(s) ready to upload
                        {previewData.filter((inv) => inv.hasErrors).length >
                          0 &&
                          `, ${previewData.filter((inv) => inv.hasErrors).length} invoice(s) with errors will be skipped`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Invoices - Grouped by Invoice */}
              {showPreview && previewData.length > 0 && (
                <div className="border-2 border-gray-200 rounded-lg overflow-hidden mb-6">
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex justify-between items-center">
                    <h3 className="font-semibold text-white flex items-center">
                      <FileText className="mr-2" size={18} />
                      📋 Preview: {previewData.length} Invoice(s)
                    </h3>
                    <span className="bg-white text-blue-600 px-3 py-1 rounded-full text-xs font-semibold">
                      {previewData.reduce((acc, inv) => acc + inv.itemCount, 0)}{" "}
                      Total Items
                    </span>
                  </div>

                  <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                    {previewData.map((invoice, index) => (
                      <div key={index} className="p-4 hover:bg-gray-50">
                        {/* Invoice Header */}
                        <div className="bg-blue-50 p-3 rounded-lg mb-3">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            <div>
                              <span className="text-xs text-gray-500">
                                Invoice Group
                              </span>
                              <div className="font-bold text-blue-700">
                                {invoice.groupId}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">
                                Invoice Date
                              </span>
                              <div className="font-medium">
                                {invoice.invoiceDate}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">
                                PO Reference
                              </span>
                              <div className="flex items-center">
                                <span className="font-medium">
                                  {invoice.poRef}
                                </span>
                                {invoice.hasPO && (
                                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                    ✓ PO Found
                                  </span>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">
                                Total Amount
                              </span>
                              <div className="font-bold text-green-600">
                                {invoice.currency} {invoice.totalAmount}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">
                                Status
                              </span>
                              <div>
                                {invoice.hasErrors ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    <AlertCircle size={12} className="mr-1" />
                                    Has Errors
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle2 size={12} className="mr-1" />
                                    Valid
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Client Info */}
                          <div className="mt-2 p-2 bg-white rounded border border-blue-100">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Users
                                  size={14}
                                  className="text-gray-400 mr-1"
                                />
                                <span className="text-sm font-medium">
                                  {invoice.clientName}
                                </span>
                                {invoice.clientCode !== "—" && (
                                  <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
                                    Code: {invoice.clientCode}
                                  </span>
                                )}
                              </div>
                              {invoice.hasClient ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center">
                                  <CheckCircle2 size={12} className="mr-1" />
                                  Client Verified
                                </span>
                              ) : (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                                  New Client
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Error Display Section */}
                          {invoice.hasErrors &&
                            invoice.errors &&
                            invoice.errors.length > 0 && (
                              <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-xs font-medium text-red-800 mb-2 flex items-center">
                                  <AlertCircle size={14} className="mr-1" />
                                  Validation Errors:
                                </p>
                                <ul className="list-disc list-inside space-y-1">
                                  {invoice.errors
                                    .slice(0, 3)
                                    .map((err, idx) => (
                                      <li
                                        key={idx}
                                        className="text-xs text-red-600"
                                      >
                                        {err}
                                      </li>
                                    ))}
                                  {invoice.errors.length > 3 && (
                                    <li className="text-xs text-red-600">
                                      ... and {invoice.errors.length - 3} more
                                      errors
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}
                        </div>

                        {/* Items Table */}
                        <div className="ml-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                            <Package size={14} className="mr-1" />
                            Items ({invoice.itemCount})
                          </h4>
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                                  #
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                                  Description
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                                  HSN/SAC
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                  Qty
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                  Rate
                                </th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {invoice.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-xs">
                                    {idx + 1}
                                  </td>
                                  <td className="px-3 py-2 text-xs font-medium">
                                    {item.description}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {item.hsn}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right">
                                    {item.quantity}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-right">
                                    {item.rate}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-center">
                                    {item.hasHsn ? (
                                      <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs">
                                        ✓ HSN OK
                                      </span>
                                    ) : (
                                      <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs">
                                        ⚠ Check HSN
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Additional Info */}
                        <div className="mt-3 ml-4 flex flex-wrap gap-3 text-xs text-gray-500">
                          <span className="flex items-center">
                            <CreditCard size={12} className="mr-1" /> Payment:{" "}
                            {invoice.paymentMode}
                          </span>
                          <span className="flex items-center">
                            <span className="mr-1">💰</span> TDS:{" "}
                            {invoice.manualTDS !== "0"
                              ? `₹${invoice.manualTDS}`
                              : "Auto"}
                          </span>
                          <span className="flex items-center">
                            <span className="mr-1">🖊️</span> Signature:{" "}
                            {invoice.digitalSignature}
                          </span>
                        </div>

                        {/* Separator */}
                        {index < previewData.length - 1 && (
                          <div className="my-4 border-t-2 border-dashed border-gray-300"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-semibold transition disabled:opacity-50"
          >
            Cancel
          </button>
          {activeTab === "upload" && (
            <button
              onClick={handleUpload}
              disabled={
                !showPreview ||
                previewData.length === 0 ||
                uploading ||
                loadingData ||
                enrichedRowsData.filter((row) => !row._hasErrors).length === 0
              }
              className={`px-8 py-2 rounded-lg font-semibold transition flex items-center ${
                showPreview &&
                previewData.length > 0 &&
                !uploading &&
                !loadingData &&
                enrichedRowsData.filter((row) => !row._hasErrors).length > 0
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Creating Invoices...
                </>
              ) : (
                <>
                  <Upload className="mr-2" size={20} />
                  {enrichedRowsData.filter((row) => !row._hasErrors).length > 0
                    ? `Create Invoice(s)`
                    : "No Valid Invoices"}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function to convert number to words
const convertToWords = (num) => {
  if (num === 0) return "Zero Only";
  if (num < 0) return "Minus " + convertToWords(Math.abs(num));

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const convertTwoDigits = (n) => {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
  };

  let result = "";
  let integerPart = Math.floor(num);

  if (integerPart >= 10000000) {
    const crores = Math.floor(integerPart / 10000000);
    result += convertTwoDigits(crores) + " Crore ";
    integerPart %= 10000000;
  }

  if (integerPart >= 100000) {
    const lakhs = Math.floor(integerPart / 100000);
    result += convertTwoDigits(lakhs) + " Lakh ";
    integerPart %= 100000;
  }

  if (integerPart >= 1000) {
    const thousands = Math.floor(integerPart / 1000);
    result += convertTwoDigits(thousands) + " Thousand ";
    integerPart %= 1000;
  }

  if (integerPart >= 100) {
    result += ones[Math.floor(integerPart / 100)] + " Hundred ";
    integerPart %= 100;
  }

  if (integerPart > 0) {
    result += convertTwoDigits(integerPart) + " ";
  }

  const decimal = Math.round((num - Math.floor(num)) * 100);
  if (decimal > 0) {
    result += "and " + convertTwoDigits(decimal) + " Paise ";
  }

  return result.trim() + " Only";
};

export default BulkInvoiceUploadModal;
