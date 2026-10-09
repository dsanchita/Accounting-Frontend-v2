import { API } from "./api";

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPeriodDates = ({ periodType = "yearly", year, quarter = "Q4", month = "3" } = {}) => {
  const endingYear = Number.parseInt(year, 10);
  const startYear = endingYear - 1;

  if (periodType === "quarterly") {
    const map = {
      Q1: [new Date(startYear, 3, 1), new Date(startYear, 5, 30)],
      Q2: [new Date(startYear, 6, 1), new Date(startYear, 8, 30)],
      Q3: [new Date(startYear, 9, 1), new Date(startYear, 11, 31)],
      Q4: [new Date(endingYear, 0, 1), new Date(endingYear, 2, 31)],
    };
    const [startDate, endDate] = map[quarter] || map.Q4;
    return { startDate, endDate, asOfDate: endDate };
  }

  if (periodType === "monthly") {
    const monthNumber = Number.parseInt(month, 10);
    const actualYear = monthNumber >= 4 ? startYear : endingYear;
    const startDate = new Date(actualYear, monthNumber - 1, 1);
    const endDate = new Date(actualYear, monthNumber, 0);
    return { startDate, endDate, asOfDate: endDate };
  }

  const startDate = new Date(startYear, 3, 1);
  const endDate = new Date(endingYear, 2, 31);
  return { startDate, endDate, asOfDate: endDate };
};

const formatDisplayDate = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

const slugify = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const buildNote = (title, noteNo, items = []) => ({
  noteCode: slugify(`${noteNo || title}`) || `note-${Math.random().toString(36).slice(2, 8)}`,
  noteNo: noteNo || "",
  title,
  total: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  items: items.map((item) => ({
    kind: item.accountId ? "ledger" : "summary",
    label: item.name || item.label,
    ledgerName: item.name || item.label || "",
    ledgerCode: item.code || "",
    sourceGroup: item.groupName || item.scheduleLineItem || "",
    account: item.accountId
      ? {
          _id: item.accountId,
          name: item.name || "",
          code: item.code || "",
          groupName: item.groupName || "",
          openingBalance: Number(item.openingBalance || 0),
          openingType: `${item.normalBalance || "Debit"}`.toLowerCase(),
          type: item.normalBalance || "Debit",
          linkedClientId: item.linkedClientId || null,
          linkedVendorId: item.linkedVendorId || null,
          linkedPartyType: item.linkedPartyType || "",
          partyName: item.partyName || "",
        }
      : null,
    amount: Number(item.amount || 0),
  })),
});

const toBalanceSheetRowsAndNotes = (report = {}) => {
  const rows = [];
  const notes = [];

  // Assets Section
  rows.push({
    code: "assets",
    label: "Assets",
    nodeType: "section",
    level: 0,
    amount: Number(report.assets?.total || 0),
  });

  [
    ["non-current-assets", "Non-Current Assets", report.assets?.nonCurrent],
    ["current-assets", "Current Assets", report.assets?.current],
  ].forEach(([groupCode, groupLabel, section]) => {
    rows.push({
      code: groupCode,
      label: groupLabel,
      nodeType: "subsection",
      level: 1,
      amount: Number(section?.total || 0),
    });

    Object.entries(section?.lineItems || {}).forEach(([lineLabel, lineData]) => {
      const items = lineData?.items || [];
      const note = buildNote(lineLabel, "", items);
      if (items.length) notes.push(note);
      
      rows.push({
        code: `${groupCode}-${slugify(lineLabel)}`,
        label: lineLabel,
        nodeType: "line_item",
        level: 2,
        noteCode: items.length ? note.noteCode : null,
        noteNo: "",
        amount: Number(lineData?.total || 0),
      });
    });
  });

  rows.push({
    code: "assets-total",
    label: "Total Assets",
    nodeType: "section",
    level: 0,
    amount: Number(report.assets?.total || 0),
  });

  // Equity and Liabilities Section
  rows.push({
    code: "equity-liabilities",
    label: "Equity and Liabilities",
    nodeType: "section",
    level: 0,
    amount: Number(report.liabilitiesAndEquity?.total || 0),
  });

  [
    ["shareholders-funds", "Shareholders' Funds", report.liabilitiesAndEquity?.equity?.shareholders],
    ["other-equity", "Other Equity", report.liabilitiesAndEquity?.equity?.other],
    ["non-current-liabilities", "Non-Current Liabilities", report.liabilitiesAndEquity?.liabilities?.nonCurrent],
    ["current-liabilities", "Current Liabilities", report.liabilitiesAndEquity?.liabilities?.current],
  ].forEach(([groupCode, groupLabel, section]) => {
    rows.push({
      code: groupCode,
      label: groupLabel,
      nodeType: "subsection",
      level: 1,
      amount: Number(section?.total || 0),
    });

    Object.entries(section?.lineItems || {}).forEach(([lineLabel, lineData]) => {
      const items = lineData?.items || [];
      const note = buildNote(lineLabel, "", items);
      if (items.length) notes.push(note);
      
      rows.push({
        code: `${groupCode}-${slugify(lineLabel)}`,
        label: lineLabel,
        nodeType: "line_item",
        level: 2,
        noteCode: items.length ? note.noteCode : null,
        noteNo: "",
        amount: Number(lineData?.total || 0),
      });
    });
  });

  rows.push({
    code: "equity-liabilities-total",
    label: "Total Equity and Liabilities",
    nodeType: "section",
    level: 0,
    amount: Number(report.liabilitiesAndEquity?.total || 0),
  });

  return { rows, notes };
};

const toProfitLossRowsAndNotes = (report = {}) => {
  const rows = [];
  const notes = [];

  rows.push({
    code: "revenue",
    label: "Revenue",
    nodeType: "section",
    level: 0,
    amount: Number(report.revenue?.total || 0),
  });

  Object.entries(report.revenue?.lineItems || {}).forEach(([label, items]) => {
    const note = buildNote(label, "", items || []);
    if ((items || []).length) notes.push(note);
    rows.push({
      code: `revenue-${slugify(label)}`,
      label,
      nodeType: "line_item",
      level: 1,
      noteCode: (items || []).length ? note.noteCode : null,
      noteNo: "",
      amount: Number(note.total || 0),
    });
  });

  rows.push({
    code: "revenue-total",
    label: "Total Revenue",
    nodeType: "subsection",
    level: 1,
    amount: Number(report.revenue?.total || 0),
  });

  rows.push({
    code: "expenses",
    label: "Expenses",
    nodeType: "section",
    level: 0,
    amount: Number(report.expenses?.total || 0),
  });

  Object.entries(report.expenses?.lineItems || {}).forEach(([label, items]) => {
    const note = buildNote(label, "", items || []);
    if ((items || []).length) notes.push(note);
    rows.push({
      code: `expense-${slugify(label)}`,
      label,
      nodeType: "line_item",
      level: 1,
      noteCode: (items || []).length ? note.noteCode : null,
      noteNo: "",
      amount: Number(note.total || 0),
    });
  });

  rows.push({
    code: "expenses-total",
    label: "Total Expenses",
    nodeType: "subsection",
    level: 1,
    amount: Number(report.expenses?.total || 0),
  });

  rows.push({
    code: "profit-before-tax",
    label: "Profit Before Tax",
    nodeType: "section",
    level: 0,
    amount: Number(report.profitAndLoss?.netProfitBeforeTax || 0),
  });

  return { rows, notes };
};

export const getScheduleIIIBalanceSheetApi = async (companyId, params, signal) => {
  const { asOfDate } = getPeriodDates(params);
  const endingYear = Number.parseInt(params?.year, 10);
  const financialYearStartDate = Number.isFinite(endingYear)
    ? new Date(endingYear - 1, 3, 1)
    : new Date(asOfDate.getFullYear() - (asOfDate.getMonth() < 3 ? 1 : 0), 3, 1);
  const { data } = await API.get(`/accounting/report/${companyId}/balance-sheet`, {
    params: {
      asOfDate: formatDate(asOfDate),
      periodStartDate: formatDate(financialYearStartDate),
    },
    signal,
  });

  const report = data.data || {};
  const { rows, notes } = toBalanceSheetRowsAndNotes(report);

  return {
    ...data,
    data: {
      title: "Schedule III Balance Sheet",
      financialYear: `${params?.year || ""}`,
      asOfDate: formatDate(asOfDate),
      reportPeriodLabel: `As of ${formatDisplayDate(asOfDate)}`,
      rows,
      notes,
      issues: (report.validation?.mappingIssues || []).map((account) => ({
        code: "unmapped-ledger",
        message: `Ledger ${account.accountCode ? `${account.accountCode} - ` : ""}${account.accountName || "Unknown"} has a missing or invalid Schedule III mapping.`,
      })),
      warnings: [],
      summary: {
        totalAssets: Number(report.assets?.total || 0),
        totalEquityLiabilities: Number(report.liabilitiesAndEquity?.total || 0),
        profitTransferredToReserves: Number(report.profitTransferredToReserves || 0),
        difference: Number(report.validation?.difference || 0),
        isBalanced: Boolean(report.validation?.assetsEqualLiabilitiesPlusEquity),
      },
    },
  };
};

export const getBusinessInsightsReportApi = async (companyId, params = {}, signal) => {
  const { data } = await API.get(`/accounting/reports/${companyId}/business-insights`, {
    params,
    signal,
  });
  return data;
};

export const getScheduleIIIProfitLossApi = async (companyId, params, signal) => {
  const { startDate, endDate } = getPeriodDates(params);
  const { data } = await API.get(`/accounting/report/${companyId}/profit-loss`, {
    params: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    },
    signal,
  });

  const report = data.data || {};
  const { rows, notes } = toProfitLossRowsAndNotes(report);

  return {
    ...data,
    data: {
      title: "Schedule III Profit and Loss",
      financialYear: `${params?.year || ""}`,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      reportPeriodLabel: `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`,
      rows,
      notes,
      issues: [],
      warnings: [],
      summary: {
        totalRevenue: Number(report.revenue?.total || 0),
        totalExpenses: Number(report.expenses?.total || 0),
        profitForPeriod: Number(report.profitAndLoss?.netProfitBeforeTax || 0),
      },
    },
  };
};
