import { API } from "./api";

const INVOICE_BASE = "/invoices";
const INVOICE_ACCOUNTING_BASE = "/invoice-accounting";
const ACCOUNTING_PAYMENT_BASE = "/accounting/payment";

const normalizeInvoicePayload = (payload = {}) => {
  const normalizedItems = (payload.items || []).map((item) => ({
    ...item,
    totalAmount:
      item.totalAmount ??
      item.total ??
      Number(item.taxableValue || 0) + Number((item.taxAmount ?? item.gstAmount) || 0),
  }));

  return {
    ...payload,
    items: normalizedItems,
  };
};

// CREATE
export const createInvoiceApi = async (payload) => {
  const { data } = await API.post(INVOICE_BASE, normalizeInvoicePayload(payload));
  return data;
};

//bulk upload
export const bulkCreateInvoicesApi = async (payload) => {
  const invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
  const createdInvoices = [];
  const errors = [];

  if (invoices.length === 0) {
    return {
      success: false,
      data: { created: 0, invoices: [], errors: [] },
      message: "No invoices to create",
    };
  }

  for (const [index, invoice] of invoices.entries()) {
    try {
      createdInvoices.push(await createInvoiceApi(invoice));
    } catch (error) {
      errors.push({
        index: index + 1,
        error:
          error.response?.data?.message ||
          error.message ||
          "Failed to create invoice",
      });
    }
  }

  return {
    success: errors.length === 0,
    data: {
      created: createdInvoices.length,
      invoices: createdInvoices,
      errors,
    },
    message:
      errors.length === 0
        ? "Invoices created successfully"
        : `Created ${createdInvoices.length} of ${invoices.length} invoice(s)`,
  };
};

// GET LIST
export const getInvoicesApi = async (companyId, params = {}) => {
  const { data } = await API.get(INVOICE_BASE, {
    params: { companyId, ...params },
  });
  return data;
};

const normalizePaymentMode = (paymentMode = "") => {
  const map = {
    bank_transfer: "BANK_TRANSFER",
    cash: "CASH",
    cheque: "CHEQUE",
    card: "CREDIT_CARD",
    online: "DIGITAL_WALLET",
    upi: "DIGITAL_WALLET",
    other: "OTHER",
  };

  return map[paymentMode] || "BANK_TRANSFER";
};

// GET SINGLE
export const getInvoiceByIdApi = async (id) => {
  const { data } = await API.get(`${INVOICE_BASE}/${id}`);
  return data;
};

// UPDATE
export const updateInvoiceApi = async (id, payload) => {
  const { data } = await API.put(`${INVOICE_BASE}/${id}`, normalizeInvoicePayload(payload));
  return data;
};

// DELETE
export const deleteInvoiceApi = async (id) => {
  const { data } = await API.delete(`${INVOICE_BASE}/${id}`);
  return data;
};

// DOWNLOAD
export const downloadInvoicePdfApi = (id) =>
  API.get(`${INVOICE_BASE}/${id}/download/pdf`, {
    responseType: "blob",
  });

export const downloadInvoiceWordApi = (id) =>
  API.get(`${INVOICE_BASE}/${id}/download/word`, {
    responseType: "blob",
  });

// Search invoice by number
export const searchInvoiceByNumberApi = async (invoiceNumber) => {
  const { data } = await API.get(`${INVOICE_BASE}/search/number`, {
    params: { invoiceNo: invoiceNumber },
  });
  return data;
};

// Get invoice by number (for ledger creation)
export const getInvoiceByNumberApi = async (invoiceNo) => {
  const { data } = await API.get(`${INVOICE_BASE}/search/number`, {
    params: { invoiceNo },
  });
  return data;
};

// Get clients from invoices
export const getInvoiceClientsApi = async (companyId) => {
  const { data } = await API.get("/masterData/client", {
    params: companyId ? { companyId } : {},
  });
  return data;
};

// Get TDS details for client
export const getClientTdsDetailsApi = async (clientId) => {
  const { data } = await API.get(`/invoices/client/${clientId}/tds`);
  return data;
};

// Create ledger from invoice
export const createLedgerFromInvoiceApi = async (payload) => {
  const { data } = await API.post(`${INVOICE_BASE}/${payload.invoiceId}/post-sales-journal`);
  return data;
};

// Get all invoice numbers for dropdown
export const getAllInvoiceNumbersApi = async () => {
  const invoices = await getInvoicesApi("", { limit: 10000 });
  return invoices;
};

// Get pending invoice approvals
export const pendingApprovalInvoiceApi = (companyId, signal) =>
  API.get(`${INVOICE_BASE}/approvals/pending`, {
    params: { companyId },
    signal,
  });

// approve / reject invoice
export const updateInvoiceApprovalApi = (id, versionNo, approvalStatus, approvalComments = "") =>
  API.post(
    `${INVOICE_BASE}/${id}/${approvalStatus === "Approved" ? "approve" : "reject"}`,
    { versionNo, approvalStatus, approvalComments, rejectionReason: approvalComments }
  );

export const validateInvoiceAccountsApi = async (companyId) => {
  const { data } = await API.get(`${INVOICE_ACCOUNTING_BASE}/validate-accounts/${companyId}`);
  return data;
};

export const createClientLedgerFromInvoiceApi = async (companyId, invoiceId) => {
  const { data } = await API.post(`${INVOICE_ACCOUNTING_BASE}/${companyId}/create-ledger`, { invoiceId });
  return data;
};

export const createJournalFromInvoiceApi = async (companyId, invoiceId) => {
  const { data } = await API.post(`${INVOICE_ACCOUNTING_BASE}/${companyId}/create-journal`, { invoiceId });
  return data;
};

export const completeInvoiceAccountingApi = async (companyId, invoiceId) => {
  const { data } = await API.post(`${INVOICE_ACCOUNTING_BASE}/${companyId}/complete-accounting`, { invoiceId });
  return data;
};

export const getInvoiceAccountingStatusApi = async (companyId, invoiceId) => {
  const { data } = await API.get(`${INVOICE_ACCOUNTING_BASE}/${companyId}/status/${invoiceId}`);
  return data;
};

export const postInvoiceSalesJournalApi = async (invoiceId) => {
  const { data } = await API.post(`${INVOICE_BASE}/${invoiceId}/post-sales-journal`);
  return data;
};

export const getInvoicePaymentsApi = async (companyId, invoiceId) => {
  const { data } = await API.get(`${ACCOUNTING_PAYMENT_BASE}/invoice/search`, {
    params: { companyId, invoiceId },
  });
  return data;
};

export const getPOTaxReportApi = async (params = {}) => {
  const { data } = await API.get(`${INVOICE_BASE}/reports/po-tax`, {
    params,
  });
  return data;
};

export const getClientTaxReportApi = async (params = {}) => {
  const { data } = await API.get(`${INVOICE_BASE}/reports/client-tax`, {
    params,
  });
  return data;
};

export const getTaxSummaryApi = async (params = {}) => {
  const { data } = await API.get(`${INVOICE_BASE}/reports/tax-summary`, {
    params,
  });
  return data;
};

export const recordInvoicePaymentApi = async ({
  invoiceId,
  companyId,
  clientId,
  amountPaid,
  tdsAmount,
  paymentDate,
  referenceNumber,
  remarks,
  paymentMode,
  bankLedgerId,
  expectedAmount,
  adjustmentSource,
}) => {
  const normalizedAmountPaid = Number(amountPaid || 0);
  const normalizedTdsAmount = Number(tdsAmount || 0);
  const normalizedExpectedAmount = Number(expectedAmount ?? normalizedAmountPaid);

  const { data } = await API.post(`${INVOICE_ACCOUNTING_BASE}/${companyId}/record-payment`, {
    invoiceId,
    companyId,
    clientId,
    amountPaid: normalizedAmountPaid,
    tdsAmount: normalizedTdsAmount,
    expectedAmount: normalizedExpectedAmount,
    adjustmentSource,
    grossAmount: normalizedExpectedAmount + normalizedTdsAmount,
    paymentMode: normalizePaymentMode(paymentMode),
    bankLedgerId,
    paymentDate,
    reference: referenceNumber,
    notes: remarks,
  });
  return {
    payment: { data: data?.data?.payment || null },
    invoice: { data: data?.data?.invoice || null },
    journal: { data: data?.data?.journal || null },
    ledger: { data: data?.data?.ledger || null },
    message: data?.message,
    success: data?.success,
  };
};

export const getInvoiceTdsReportApi = async ({
  companyId,
  fromDate,
  toDate,
}) => {
  const { data } = await API.get(`${INVOICE_ACCOUNTING_BASE}/${companyId}/tds-report`, {
    params: {
      fromDate,
      toDate,
    },
  });
  return data;
};

export const reverseInvoicePaymentApi = async ({ companyId, paymentId, invoiceId }) => {
  const { data } = await API.post(`${INVOICE_ACCOUNTING_BASE}/${companyId}/reverse-payment`, {
    paymentId,
    invoiceId,
  });
  return data;
};
