import { API } from "./api";

const normalizeOpeningType = (value = "debit") =>
  String(value).trim().toLowerCase() === "credit" ? "credit" : "debit";

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFinancialPeriod = ({ periodType = "yearly", year, quarter = "Q4", month = "3" } = {}) => {
  const endingYear = Number.parseInt(year, 10);
  const startYear = endingYear - 1;

  if (periodType === "quarterly") {
    const quarters = {
      Q1: {
        startDate: new Date(startYear, 3, 1),
        endDate: new Date(startYear, 5, 30),
      },
      Q2: {
        startDate: new Date(startYear, 6, 1),
        endDate: new Date(startYear, 8, 30),
      },
      Q3: {
        startDate: new Date(startYear, 9, 1),
        endDate: new Date(startYear, 11, 31),
      },
      Q4: {
        startDate: new Date(endingYear, 0, 1),
        endDate: new Date(endingYear, 2, 31),
      },
    };
    return quarters[quarter] || quarters.Q4;
  }

  if (periodType === "monthly") {
    const monthNumber = Number.parseInt(month, 10);
    const actualYear = monthNumber >= 4 ? startYear : endingYear;
    return {
      startDate: new Date(actualYear, monthNumber - 1, 1),
      endDate: new Date(actualYear, monthNumber, 0),
    };
  }

  return {
    startDate: new Date(startYear, 3, 1),
    endDate: new Date(endingYear, 2, 31),
  };
};

const inferClosingType = (closingBalance, normalBalance = "Debit") => {
  if (!closingBalance) return normalBalance === "Credit" ? "Cr" : "Dr";
  const isNormalSide = closingBalance >= 0;
  if (normalBalance === "Credit") {
    return isNormalSide ? "Cr" : "Dr";
  }
  return isNormalSide ? "Dr" : "Cr";
};

const extractTimestampFromJournal = (journalNumber) => {
  if (!journalNumber) return null;
  const match = String(journalNumber).match(/^HRMS-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/i);
  if (match) {
    const [, y, m, d, h, min, s] = match;
    return `${y}-${m}-${d}T${h}:${min}:${s}.000Z`;
  }
  return null;
};

const hasExplicitTime = (dateValue) => {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return false;
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) return false;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return false;
  }
  return true;
};

const toLegacyLedgerData = (report = {}) => {
  const openingType = report?.account?.normalBalance || "Debit";
  const closingBalance = Number(report?.summary?.closingBalance || 0);
  const transactions = report?.transactions || [];
  const isBankLedger = (report?.account?.groupName || "").toUpperCase().includes("BANK");

  return {
    account: report.account,
    openingBalance: Number(report?.summary?.openingBalance || 0),
    openingType,
    closingBalance: Math.abs(closingBalance),
    closingType: inferClosingType(closingBalance, openingType),
    entries: transactions.map((transaction, index) => {
      const extractedTime = extractTimestampFromJournal(transaction.journalNumber);
      const rawCreatedAt = transaction.createdAt || transaction.created_at || extractedTime || null;
      let entryDate = transaction.journalDate || transaction.date;

      if (rawCreatedAt && entryDate) {
        const dJournal = new Date(entryDate);
        const dCreated = new Date(rawCreatedAt);
        if (!isNaN(dJournal.getTime()) && !isNaN(dCreated.getTime())) {
          if (dJournal > dCreated && dJournal > new Date()) {
            entryDate = rawCreatedAt;
          }
        }
      } else if (!entryDate && rawCreatedAt) {
        entryDate = rawCreatedAt;
      }

      const isObjectId = (val) => typeof val === "string" && /^[0-9a-fA-F]{24}$/.test(val.trim());
      const counterAccount =
        (!isObjectId(transaction.reference) && transaction.reference) ||
        transaction.narration ||
        transaction.voucherType ||
        "Journal Entry";

      return {
        id: `${transaction.journalNumber || "txn"}-${index}`,
        date: entryDate,
        createdAt: hasExplicitTime(rawCreatedAt) ? rawCreatedAt : null,
        debit: Number(transaction.debit || 0),
        credit: Number(transaction.credit || 0),
        sourceType: transaction.voucherType || "Journal Entry",
        referenceNumber: transaction.journalNumber || "",
        narration: transaction.narration || "",
        externalDocNo: transaction.reference || "",
        partyName: report?.party?.name || "",
        counters: [
          {
            account: counterAccount,
            debit: Number(transaction.credit || 0),
            credit: Number(transaction.debit || 0),
          },
        ],
        reconciliationStatus: isBankLedger ? (transaction.reconciliationStatus || "UNMATCHED") : null,
        isReconciled: isBankLedger ? Boolean(transaction.isReconciled) : false,
        allocatedAmount: isBankLedger ? Number(transaction.allocatedAmount || 0) : 0,
        unreconciledAmount: isBankLedger ? Number(transaction.unreconciledAmount || 0) : 0,
      };
    }),
  };
};

const toLegacyTrialBalanceAccounts = (accounts = []) =>
  accounts.map((account) => ({
    _id: account.accountId,
    name: account.accountName,
    code: account.accountCode,
    groupNature: account.groupName,
    groupName: account.groupName,
    closingBalance: Math.abs(Number(account.closingBalance || 0)),
    closingType: Number(account.closingCredit || 0) > 0 ? "credit" : "debit",
    openingBalance: Math.abs(Number(account.openingBalance || 0)),
    openingType: account.normalBalance?.toLowerCase() || "debit",
    fullAccount: account,
  }));

export const getAccountsApi = async (companyId, signal) => {
  const { data } = await API.get(`/accounting/account`, {
    params: { companyId },
    signal,
  });
  return data;
};

export const addAccountApi = async (form, companyId) => {
  const { data } = await API.post(`/accounting/account`, {
    ...form,
    openingType:
      form.openingType !== undefined ? normalizeOpeningType(form.openingType) : undefined,
    companyId,
  });
  return data;
};

export const suggestAccountScheduleMappingApi = async ({ ledgerName = "", groupId, groupName, companyId }) => {
  const { data } = await API.get(`/accounting/account/schedule/suggest`, {
    params: {
      ledgerName,
      groupId,
      groupName,
      companyId,
    },
  });
  return data;
};

export const updateAccountApi = async (accountId, form) => {
  const { data } = await API.put(`/accounting/account/${accountId}`, {
    ...form,
    openingType:
      form.openingType !== undefined ? normalizeOpeningType(form.openingType) : undefined,
  });
  return data;
};

export const getLedgerApi = async (accountId, companyId, signal, dateRange = null) => {
  let startDate;
  let endDate;

  if (dateRange?.from && dateRange?.to) {
    startDate = new Date(dateRange.from);
    endDate = new Date(dateRange.to);
  } else {
    const today = new Date();
    const currentYear = today.getMonth() + 1 <= 3 ? today.getFullYear() : today.getFullYear() + 1;
    const period = getFinancialPeriod({
      periodType: "yearly",
      year: currentYear,
    });
    startDate = period.startDate;
    endDate = period.endDate;
  }

  const { data } = await API.get(`/accounting/report/${companyId}/ledger`, {
    params: {
      accountId,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    },
    signal,
  });

  return {
    ...data,
    data: toLegacyLedgerData(data.data),
  };
};

export const getAccountBasedOnYearApi = async (companyId, signal) => {
  const today = new Date();
  const currentYear = today.getMonth() + 1 <= 3 ? today.getFullYear() : today.getFullYear() + 1;
  return getAccountByPeriodApi(
    companyId,
    {
      periodType: "yearly",
      year: currentYear,
    },
    signal
  );
};

export const getAccountByPeriodApi = async (companyId, periodData, signal) => {
  const { startDate, endDate } = getFinancialPeriod(periodData);

  const { data } = await API.get(`/accounting/report/${companyId}/trial-balance-period`, {
    params: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    },
    signal,
  });

  return {
    ...data,
    data: {
      ...(data.data || {}),
      accounts: toLegacyTrialBalanceAccounts(data.data?.accounts || []),
    },
  };
};

export const getMonthlyFinancialSummaryFYApi = async (companyId, year, signal) => {
  const endingYear = Number.parseInt(year, 10);
  const startYear = endingYear - 1;
  const months = [
    { value: 4, label: "Apr", actualYear: startYear },
    { value: 5, label: "May", actualYear: startYear },
    { value: 6, label: "Jun", actualYear: startYear },
    { value: 7, label: "Jul", actualYear: startYear },
    { value: 8, label: "Aug", actualYear: startYear },
    { value: 9, label: "Sep", actualYear: startYear },
    { value: 10, label: "Oct", actualYear: startYear },
    { value: 11, label: "Nov", actualYear: startYear },
    { value: 12, label: "Dec", actualYear: startYear },
    { value: 1, label: "Jan", actualYear: endingYear },
    { value: 2, label: "Feb", actualYear: endingYear },
    { value: 3, label: "Mar", actualYear: endingYear },
  ];

  const summary = await Promise.all(
    months.map(async ({ value, label, actualYear }) => {
      const startDate = new Date(actualYear, value - 1, 1);
      const endDate = new Date(actualYear, value, 0);
      const { data } = await API.get(`/accounting/report/${companyId}/profit-loss`, {
        params: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        },
        signal,
      });
      const report = data.data || {};
      const revenue = Number(report.revenue?.total || 0);
      const expense = Number(report.expenses?.total || 0);
      const profit = Number(report.profitAndLoss?.netProfitBeforeTax || 0);
      return { month: label, revenue, expense, profit };
    })
  );

  return {
    data: {
      summary,
    },
  };
};
