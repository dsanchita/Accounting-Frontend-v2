const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const round2 = (num) => Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;

export const parseDateOnly = (val) => {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return new Date(val.getFullYear(), val.getMonth(), val.getDate(), 0, 0, 0, 0);
  }
  const str = String(val).trim();
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 0, 0, 0, 0);
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
};

const formatDateISO = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Splits a partial or multi-month date range by calendar month.
 * Example: 26 Oct–31 Oct, 1 Nov–30 Nov, and 1 Dec–26 Dec for a PO running from 26 Oct to 26 Dec.
 */
export const splitMonthlyPeriods = (startDateStr, endDateStr) => {
  const start = parseDateOnly(startDateStr);
  const end = parseDateOnly(endDateStr);
  if (!start || !end || end < start) return [];

  const periods = [];
  let curStart = new Date(start);

  while (curStart <= end) {
    const year = curStart.getFullYear();
    const month = curStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const endOfMonth = new Date(year, month, daysInMonth, 0, 0, 0, 0);
    const curEnd = endOfMonth < end ? endOfMonth : new Date(end);

    const msPerDay = 24 * 60 * 60 * 1000;
    const daysInPeriod = Math.round((curEnd.getTime() - curStart.getTime()) / msPerDay) + 1;
    const ratio = daysInPeriod / daysInMonth;

    const startDay = curStart.getDate();
    const endDay = curEnd.getDate();
    const startMonth = MONTH_NAMES[month];
    const endMonth = MONTH_NAMES[curEnd.getMonth()];
    const endYear = curEnd.getFullYear();

    const monthName = `${startMonth} ${year}`;
    const periodLabel = year === endYear && month === curEnd.getMonth()
      ? `${startDay} ${startMonth} – ${endDay} ${startMonth} ${year}`
      : `${startDay} ${startMonth} ${year} – ${endDay} ${endMonth} ${endYear}`;

    periods.push({
      startDate: formatDateISO(curStart),
      endDate: formatDateISO(curEnd),
      year,
      month: month + 1,
      monthName,
      periodLabel,
      daysInPeriod,
      daysInMonth,
      ratio,
      daysText: `${daysInPeriod}/${daysInMonth}`,
      index: periods.length,
    });

    curStart = new Date(year, month + 1, 1, 0, 0, 0, 0);
  }

  return periods;
};

/**
 * Calculates monthly distribution breakdown for PO display and persistence.
 * For each calendar period:
 *  - Quantity remains the same integer as entered on line items.
 *  - Rate is prorated based on days in that period vs days in the calendar month.
 *  - Taxable and total amounts are computed per period.
 */
export const calculateMonthlyDistributionBreakdown = ({
  poDate,
  deliveryDate,
  items = [],
  taxType = "GST",
}) => {
  const periods = splitMonthlyPeriods(poDate, deliveryDate);
  if (periods.length === 0) {
    return {
      periods: [],
      breakdown: [],
      totalTaxableValue: 0,
      totalGSTAmount: 0,
      totalAmount: 0,
    };
  }

  const breakdown = periods.map((period, periodIdx) => {
    let periodTaxable = 0;
    let periodGST = 0;
    let periodTotal = 0;
    let periodRateSum = 0;

    const periodItems = items.map((item) => {
      const quantity = Math.max(1, Math.round(Number(item.quantity || 1)));
      const baseRate = Number(item.rate || 0);
      const taxRate = Number(item.taxRate ?? item.gstRate ?? 0);

      // Rate prorated by calendar month days ratio
      const periodRate = round2(baseRate * period.ratio);
      const taxableValue = round2(quantity * periodRate);
      const gstAmount = taxRate > 0 ? round2((taxableValue * taxRate) / 100) : 0;
      const totalAmount = round2(taxableValue + (taxType === "RCM" ? 0 : gstAmount));

      periodTaxable = round2(periodTaxable + taxableValue);
      periodGST = round2(periodGST + gstAmount);
      periodTotal = round2(periodTotal + totalAmount);
      periodRateSum = round2(periodRateSum + periodRate);

      return {
        itemId: item.itemId || item._id,
        description: item.description,
        quantity,
        baseRate,
        periodRate,
        taxableValue,
        taxRate,
        gstAmount,
        totalAmount,
      };
    });

    return {
      period: period.monthName,
      periodLabel: period.periodLabel,
      startDate: period.startDate,
      endDate: period.endDate,
      daysInPeriod: period.daysInPeriod,
      totalDaysInMonth: period.daysInMonth,
      daysText: period.daysText,
      ratio: period.ratio,
      rate: periodRateSum,
      taxableValue: periodTaxable,
      taxAmount: periodGST,
      amount: periodTotal,
      items: periodItems,
      index: periodIdx,
    };
  });

  const totalTaxableValue = round2(breakdown.reduce((sum, b) => sum + b.taxableValue, 0));
  const totalGSTAmount = round2(breakdown.reduce((sum, b) => sum + b.taxAmount, 0));
  const totalAmount = round2(breakdown.reduce((sum, b) => sum + b.amount, 0));

  return {
    periods,
    breakdown,
    totalTaxableValue,
    totalGSTAmount,
    totalAmount,
  };
};
