const STORAGE_KEY = "sunrise-villa-bookings-v1";
const TAX_PLAN_KEY = "sunrise-villa-tax-plan-v1";
const DOCUMENTS_KEY = "sunrise-villa-documents-v1";
const PROFIT_KEY = "sunrise-villa-profit-v1";
const SETTINGS_KEY = "sunrise-villa-settings-v1";

const issuers = {
  "Sunrise Villa Ventures": {
    code: "SVV",
    registration: "IP0601606-K (202403277555)",
    address: "59, Jalan Rimba 2, Taman Puncak Rimba, 28750 Bentong, Pahang.",
    contact: "+6016-2461128",
    email: "sunrisevilla28@gmail.com",
  },
  "Windmill Villa Ventures": {
    code: "WVV",
    registration: "",
    address: "",
    contact: "",
    email: "",
  },
};

const sampleBookings = [
  { id: crypto.randomUUID(), channel: "Direct", guest: "Amira Tan", contact: "+60 12-345 6789", arrival: "2026-05-03", nights: 3, revenue: 1800, paid: 900, depositAmount: 500, depositPaid: true, depositRefunded: false },
  { id: crypto.randomUUID(), channel: "Airbnb", guest: "Jonathan", contact: "", arrival: "2026-05-10", nights: 2, revenue: 1300, paid: 1300, depositAmount: 0, depositPaid: false, depositRefunded: false },
  { id: crypto.randomUUID(), channel: "Direct", guest: "Mei Ling", contact: "+60 17-555 0199", arrival: "2026-05-18", nights: 4, revenue: 2600, paid: 1500, depositAmount: 500, depositPaid: true, depositRefunded: false },
  { id: crypto.randomUUID(), channel: "Airbnb", guest: "Sofia Rahman", contact: "", arrival: "2026-06-06", nights: 3, revenue: 1950, paid: 1000, depositAmount: 0, depositPaid: false, depositRefunded: false },
];

const defaultCommitments = [
  { id: "property-loan", name: "Property Loan", amount: 6583, category: "Property", expires: "" },
  { id: "housekeeper", name: "Housekeeper", amount: 2100, category: "Operations", expires: "" },
  { id: "maintenance", name: "Maintenance", amount: 1300, category: "Operations", expires: "" },
  { id: "electricity-water", name: "Electricity & Water", amount: 2000, category: "Utilities", expires: "" },
  { id: "cc-sc", name: "SC Credit Card Loan", amount: 2167.18, category: "CC Loan", expires: "2029-09" },
  { id: "cc-uob-1", name: "UOB Credit Card Loan", amount: 569.82, category: "CC Loan", expires: "2026-12" },
  { id: "cc-uob-2", name: "UOB Credit Card Loan", amount: 353.85, category: "CC Loan", expires: "2030-06" },
  { id: "cc-cimb", name: "CIMB Credit Card Loan", amount: 914.7, category: "CC Loan", expires: "2029-07" },
  { id: "cc-hlb", name: "HLB Credit Card Loan", amount: 1667, category: "CC Loan", expires: "2028-01" },
];

let bookings = loadBookings();
let documents = loadDocuments();
let profitData = loadProfitData();
let appSettings = loadAppSettings();
let selectedMonth = initialMonth();
let activeView = "calendar";

const els = {
  monthPicker: document.querySelector("#monthPicker"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  pageTitle: document.querySelector("#pageTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  detailMonth: document.querySelector("#detailMonth"),
  bookingCount: document.querySelector("#bookingCount"),
  detailsList: document.querySelector("#detailsList"),
  downloadQuickView: document.querySelector("#downloadQuickView"),
  bookingRows: document.querySelector("#bookingRows"),
  bookingSearch: document.querySelector("#bookingSearch"),
  channelFilter: document.querySelector("#channelFilter"),
  paymentFilter: document.querySelector("#paymentFilter"),
  depositFilter: document.querySelector("#depositFilter"),
  summaryRows: document.querySelector("#summaryRows"),
  upcomingRows: document.querySelector("#upcomingRows"),
  incomeChart: document.querySelector("#incomeChart"),
  channelList: document.querySelector("#channelList"),
  channelMixTitle: document.querySelector("#channelMixTitle"),
  sideRevenue: document.querySelector("#sideRevenue"),
  sideTotalToReceive: document.querySelector("#sideTotalToReceive"),
  sideBalance: document.querySelector("#sideBalance"),
  sideUpcomingPayments: document.querySelector("#sideUpcomingPayments"),
  sideNights: document.querySelector("#sideNights"),
  backupStatus: document.querySelector("#backupStatus"),
  backupNow: document.querySelector("#backupNow"),
  restoreBackup: document.querySelector("#restoreBackup"),
  showDashboardSections: document.querySelector("#showDashboardSections"),
  overallTitle: document.querySelector("#overallTitle"),
  overallRevenue: document.querySelector("#overallRevenue"),
  overallTotalToReceive: document.querySelector("#overallTotalToReceive"),
  overallPaid: document.querySelector("#overallPaid"),
  overallBalance: document.querySelector("#overallBalance"),
  overallUpcomingPayments: document.querySelector("#overallUpcomingPayments"),
  overallDepositHeld: document.querySelector("#overallDepositHeld"),
  overallRefundPending: document.querySelector("#overallRefundPending"),
  monthlyTitle: document.querySelector("#monthlyTitle"),
  kpiRevenue: document.querySelector("#kpiRevenue"),
  kpiTotalToReceive: document.querySelector("#kpiTotalToReceive"),
  kpiPaid: document.querySelector("#kpiPaid"),
  kpiBalance: document.querySelector("#kpiBalance"),
  kpiDepositHeld: document.querySelector("#kpiDepositHeld"),
  kpiRefundPending: document.querySelector("#kpiRefundPending"),
  kpiNights: document.querySelector("#kpiNights"),
  kpiBookings: document.querySelector("#kpiBookings"),
  profitTitle: document.querySelector("#profitTitle"),
  netProfitOut: document.querySelector("#netProfitOut"),
  totalExpensesOut: document.querySelector("#totalExpensesOut"),
  fixedCommitmentsOut: document.querySelector("#fixedCommitmentsOut"),
  adHocExpensesOut: document.querySelector("#adHocExpensesOut"),
  commitmentBreakdownSummary: document.querySelector("#commitmentBreakdownSummary"),
  oneOffTotalOut: document.querySelector("#oneOffTotalOut"),
  oneOffCostList: document.querySelector("#oneOffCostList"),
  addOneOffCost: document.querySelector("#addOneOffCost"),
  pnlCards: document.querySelector("#pnlCards"),
  pnlRows: document.querySelector("#pnlRows"),
  expenseCleaning: document.querySelector("#expenseCleaning"),
  expenseUtilities: document.querySelector("#expenseUtilities"),
  expenseMaintenance: document.querySelector("#expenseMaintenance"),
  expenseSupplies: document.querySelector("#expenseSupplies"),
  expensePlatform: document.querySelector("#expensePlatform"),
  expenseOther: document.querySelector("#expenseOther"),
  expenseNotes: document.querySelector("#expenseNotes"),
  addCommitment: document.querySelector("#addCommitment"),
  commitmentList: document.querySelector("#commitmentList"),
  annualCommitmentRows: document.querySelector("#annualCommitmentRows"),
  occupancyTitle: document.querySelector("#occupancyTitle"),
  occupancyRate: document.querySelector("#occupancyRate"),
  bookedNights: document.querySelector("#bookedNights"),
  availableNights: document.querySelector("#availableNights"),
  weekdayNights: document.querySelector("#weekdayNights"),
  weekendNights: document.querySelector("#weekendNights"),
  avgWeekdayRate: document.querySelector("#avgWeekdayRate"),
  avgWeekendRate: document.querySelector("#avgWeekendRate"),
  dialog: document.querySelector("#bookingDialog"),
  form: document.querySelector("#bookingForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  bookingId: document.querySelector("#bookingId"),
  channelInput: document.querySelector("#channelInput"),
  guestTitleInput: document.querySelector("#guestTitleInput"),
  guestInput: document.querySelector("#guestInput"),
  contactInput: document.querySelector("#contactInput"),
  arrivalInput: document.querySelector("#arrivalInput"),
  nightsInput: document.querySelector("#nightsInput"),
  revenueInput: document.querySelector("#revenueInput"),
  paidInput: document.querySelector("#paidInput"),
  depositAmountInput: document.querySelector("#depositAmountInput"),
  depositPaidInput: document.querySelector("#depositPaidInput"),
  depositRefundedInput: document.querySelector("#depositRefundedInput"),
  excludeCalculationsInput: document.querySelector("#excludeCalculationsInput"),
  addFromBookingsGuide: document.querySelector("#addFromBookingsGuide"),
  messageBookingSelect: document.querySelector("#messageBookingSelect"),
  messageGuestTitle: document.querySelector("#messageGuestTitle"),
  messageGuestName: document.querySelector("#messageGuestName"),
  messagePhone: document.querySelector("#messagePhone"),
  messageSecurityCode: document.querySelector("#messageSecurityCode"),
  messageCheckinTime: document.querySelector("#messageCheckinTime"),
  messageAddress: document.querySelector("#messageAddress"),
  messageCodeDisplay: document.querySelector("#messageCodeDisplay"),
  checkinMessagePreview: document.querySelector("#checkinMessagePreview"),
  copyCheckinMessage: document.querySelector("#copyCheckinMessage"),
  openWhatsappMessage: document.querySelector("#openWhatsappMessage"),
  documentForm: document.querySelector("#documentForm"),
  documentId: document.querySelector("#documentId"),
  documentCodePreview: document.querySelector("#documentCodePreview"),
  docType: document.querySelector("#docType"),
  docIssuer: document.querySelector("#docIssuer"),
  docDate: document.querySelector("#docDate"),
  docStatus: document.querySelector("#docStatus"),
  docBookingType: document.querySelector("#docBookingType"),
  docGuestName: document.querySelector("#docGuestName"),
  docBillTo: document.querySelector("#docBillTo"),
  docProperty: document.querySelector("#docProperty"),
  docCheckIn: document.querySelector("#docCheckIn"),
  docCheckOut: document.querySelector("#docCheckOut"),
  docNights: document.querySelector("#docNights"),
  docAccommodationFee: document.querySelector("#docAccommodationFee"),
  docDepositAmount: document.querySelector("#docDepositAmount"),
  docRemarks: document.querySelector("#docRemarks"),
  receiptPaymentSection: document.querySelector("#receiptPaymentSection"),
  paymentRows: document.querySelector("#paymentRows"),
  addPaymentRow: document.querySelector("#addPaymentRow"),
  generateDocument: document.querySelector("#generateDocument"),
  saveDocument: document.querySelector("#saveDocument"),
  newDocument: document.querySelector("#newDocument"),
  duplicateDocument: document.querySelector("#duplicateDocument"),
  printDocument: document.querySelector("#printDocument"),
  printOwnerReport: document.querySelector("#printOwnerReport"),
  ownerReportPrint: document.querySelector("#ownerReportPrint"),
  documentPreview: document.querySelector("#documentPreview"),
  documentSearch: document.querySelector("#documentSearch"),
  documentTypeFilter: document.querySelector("#documentTypeFilter"),
  documentArchiveRows: document.querySelector("#documentArchiveRows"),
  taxYearInput: document.querySelector("#taxYearInput"),
  sdnStartInput: document.querySelector("#sdnStartInput"),
  enterpriseExpenseInput: document.querySelector("#enterpriseExpenseInput"),
  sdnExpenseInput: document.querySelector("#sdnExpenseInput"),
  salaryInput: document.querySelector("#salaryInput"),
  personalReliefInput: document.querySelector("#personalReliefInput"),
  enterpriseProfitOut: document.querySelector("#enterpriseProfitOut"),
  enterpriseRevenueOut: document.querySelector("#enterpriseRevenueOut"),
  sdnProfitOut: document.querySelector("#sdnProfitOut"),
  sdnRevenueOut: document.querySelector("#sdnRevenueOut"),
  salaryOut: document.querySelector("#salaryOut"),
  salaryMonthsOut: document.querySelector("#salaryMonthsOut"),
  totalTaxOut: document.querySelector("#totalTaxOut"),
  sdnGrossOut: document.querySelector("#sdnGrossOut"),
  sdnExpenseOut: document.querySelector("#sdnExpenseOut"),
  salaryDeductionOut: document.querySelector("#salaryDeductionOut"),
  companyTaxOut: document.querySelector("#companyTaxOut"),
  personalEnterpriseOut: document.querySelector("#personalEnterpriseOut"),
  personalSalaryOut: document.querySelector("#personalSalaryOut"),
  reliefOut: document.querySelector("#reliefOut"),
  personalTaxOut: document.querySelector("#personalTaxOut"),
  taxNoteBooks: document.querySelector("#taxNoteBooks"),
  taxNoteSalary: document.querySelector("#taxNoteSalary"),
  taxNoteCp204: document.querySelector("#taxNoteCp204"),
  taxNoteDocs: document.querySelector("#taxNoteDocs"),
};

let taxPlan = loadTaxPlan();

function loadBookings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return sampleBookings.map(normalizeBooking);
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(normalizeBooking) : sampleBookings.map(normalizeBooking);
  } catch {
    return sampleBookings.map(normalizeBooking);
  }
}

function normalizeBooking(booking) {
  const channel = booking.channel === "Airbnb" ? "Airbnb" : "Direct";
  const depositAmount = Number(booking.depositAmount ?? defaultDepositForChannel(channel));
  return {
    id: booking.id || crypto.randomUUID(),
    channel,
    guestTitle: booking.guestTitle === "Ms" ? "Ms" : "Mr",
    guest: String(booking.guest || ""),
    contact: String(booking.contact || ""),
    excludeFromCalculations: Boolean(booking.excludeFromCalculations),
    arrival: String(booking.arrival || ""),
    nights: Number(booking.nights || 1),
    revenue: Number(booking.revenue || 0),
    paid: Number(booking.paid || 0),
    depositAmount: channel === "Airbnb" && !booking.depositPaid && depositAmount === 500 ? 0 : depositAmount,
    depositPaid: Boolean(booking.depositPaid),
    depositRefunded: Boolean(booking.depositRefunded),
  };
}

function saveBookings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

function defaultTaxPlan() {
  const year = currentYear();
  return {
    year,
    sdnStart: `${year}-06`,
    enterpriseExpenses: 0,
    sdnExpenses: 0,
    monthlySalary: 0,
    personalReliefs: 9000,
    notes: {
      books: false,
      salary: false,
      cp204: false,
      docs: false,
    },
  };
}

function loadTaxPlan() {
  const fallback = defaultTaxPlan();
  const stored = localStorage.getItem(TAX_PLAN_KEY);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...fallback,
      ...parsed,
      notes: { ...fallback.notes, ...(parsed.notes || {}) },
    };
  } catch {
    return fallback;
  }
}

function saveTaxPlan() {
  localStorage.setItem(TAX_PLAN_KEY, JSON.stringify(taxPlan));
}

function loadDocuments() {
  const stored = localStorage.getItem(DOCUMENTS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(normalizeDocument) : [];
  } catch {
    return [];
  }
}

function normalizeDocument(doc) {
  const now = new Date().toISOString();
  const type = ["Quotation", "Invoice", "Official Receipt"].includes(doc.type) ? doc.type : "Quotation";
  const issuer = issuers[doc.issuer] ? doc.issuer : "Sunrise Villa Ventures";
  const bookingType = doc.bookingType === "Airbnb Booking" ? "Airbnb Booking" : "Direct Booking";
  const checkIn = String(doc.checkIn || isoDate(new Date()));
  const nights = Math.max(1, Number(doc.nights || nightsBetween(checkIn, doc.checkOut) || 1));
  const checkOut = String(doc.checkOut || isoDate(addDays(dateObj(checkIn), nights)));
  const normalized = {
    id: doc.id || crypto.randomUUID(),
    type,
    issuer,
    date: String(doc.date || isoDate(new Date())),
    status: String(doc.status || "Draft"),
    bookingType,
    guestName: String(doc.guestName || ""),
    billTo: String(doc.billTo || ""),
    propertyName: String(doc.propertyName || "Sunrise Villa"),
    checkIn,
    checkOut,
    nights,
    accommodationFee: Number(doc.accommodationFee || 0),
    securityDeposit: Number(doc.securityDeposit ?? 500),
    remarks: String(doc.remarks || ""),
    payments: Array.isArray(doc.payments) ? doc.payments.map(normalizePayment) : [],
    createdAt: doc.createdAt || now,
    updatedAt: doc.updatedAt || now,
  };
  return { ...normalized, code: documentCodeFor(normalized), totalAmount: documentTotalFor(normalized) };
}

function normalizePayment(payment) {
  return {
    mode: String(payment.mode || ""),
    reference: String(payment.reference || ""),
    date: String(payment.date || isoDate(new Date())),
    amount: Number(payment.amount || 0),
  };
}

function saveDocuments() {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
}

function defaultProfitMonth() {
  return {
    cleaning: 0,
    utilities: 0,
    maintenance: 0,
    supplies: 0,
    platform: 0,
    other: 0,
    oneOffCosts: [],
    notes: "",
  };
}

function normalizeOneOffCost(cost = {}) {
  return {
    id: cost.id || crypto.randomUUID(),
    category: String(cost.category || "Supplies"),
    description: String(cost.description || ""),
    amount: Number(cost.amount || 0),
    receiptImage: String(cost.receiptImage || ""),
    receiptName: String(cost.receiptName || ""),
  };
}

function loadProfitData() {
  const stored = localStorage.getItem(PROFIT_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeProfitMonth(monthData = {}) {
  const fallback = defaultProfitMonth();
  return {
    cleaning: Number(monthData.cleaning || 0),
    utilities: Number(monthData.utilities || 0),
    maintenance: Number(monthData.maintenance || 0),
    supplies: Number(monthData.supplies || 0),
    platform: Number(monthData.platform || 0),
    other: Number(monthData.other || 0),
    oneOffCosts: Array.isArray(monthData.oneOffCosts) ? monthData.oneOffCosts.map(normalizeOneOffCost) : [],
    notes: String(monthData.notes || fallback.notes),
  };
}

function profitMonth(monthValue) {
  return normalizeProfitMonth(profitData[monthValue]);
}

function expenseTotalFor(monthValue) {
  return expenseBreakdownFor(monthValue).total;
}

function saveProfitData() {
  localStorage.setItem(PROFIT_KEY, JSON.stringify(profitData));
}

function defaultAppSettings() {
  return {
    lastBackupAt: "",
    dashboardHidden: {},
    commitments: defaultCommitments,
    message: {
      checkinTime: "3:00 PM",
      address: "No. 59, Jalan Rimba 2, Taman Puncak Rimba, 28750 Bentong, Pahang",
      mapsLink: "https://g.co/kgs/DYpYPSh",
    },
  };
}

function loadAppSettings() {
  const fallback = defaultAppSettings();
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...fallback,
      ...parsed,
      dashboardHidden: { ...fallback.dashboardHidden, ...(parsed.dashboardHidden || {}) },
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments.map(normalizeCommitment) : fallback.commitments,
      message: { ...fallback.message, ...(parsed.message || {}) },
    };
  } catch {
    return fallback;
  }
}

function saveAppSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
}

function normalizeCommitment(commitment = {}) {
  return {
    id: commitment.id || crypto.randomUUID(),
    name: String(commitment.name || "New Commitment"),
    amount: Number(commitment.amount || 0),
    category: String(commitment.category || "Other"),
    expires: String(commitment.expires || ""),
    overrides: commitment.overrides && typeof commitment.overrides === "object" ? commitment.overrides : {},
  };
}

function commitmentActiveInMonth(commitment, monthValue) {
  return !commitment.expires || monthValue <= commitment.expires;
}

function commitmentAmountFor(commitment, monthValue) {
  const override = commitment.overrides?.[monthValue];
  if (override === "" || override === undefined || override === null) return Number(commitment.amount || 0);
  return Number(override || 0);
}

function commitmentsForMonth(monthValue) {
  return (appSettings.commitments || []).map(normalizeCommitment).filter((commitment) => commitmentActiveInMonth(commitment, monthValue));
}

function commitmentTotalFor(monthValue) {
  return commitmentsForMonth(monthValue).reduce((sum, commitment) => sum + commitmentAmountFor(commitment, monthValue), 0);
}

function adHocExpenseTotalFor(monthValue) {
  const expenses = profitMonth(monthValue);
  return expenses.cleaning + expenses.utilities + expenses.maintenance + expenses.supplies + expenses.platform + expenses.other + expenses.oneOffCosts.reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
}

function oneOffCostBucket(cost) {
  const text = `${cost.category} ${cost.description}`.toLowerCase();
  if (text.includes("housekeep") || text.includes("clean") || text.includes("laundry")) return "housekeeping";
  if (text.includes("repair") || text.includes("maintenance")) return "maintenance";
  if (text.includes("electric") || text.includes("water") || text.includes("utility")) return "utilities";
  if (text.includes("grocer") || text.includes("supply") || text.includes("supplies")) return "supplies";
  return "other";
}

function commitmentBucket(commitment) {
  const text = `${commitment.name} ${commitment.category}`.toLowerCase();
  if (text.includes("housekeeper") || text.includes("housekeeping")) return "housekeeping";
  if (text.includes("maintenance")) return "maintenance";
  if (text.includes("electricity") || text.includes("water") || text.includes("utilities")) return "utilities";
  if (text.includes("property")) return "propertyLoan";
  if (text.includes("cc") || text.includes("credit") || text.includes("loan")) return "loans";
  return "other";
}

function expenseBreakdownFor(monthValue) {
  const expenses = profitMonth(monthValue);
  const breakdown = {
    housekeeping: expenses.cleaning,
    maintenance: expenses.maintenance,
    utilities: expenses.utilities,
    propertyLoan: 0,
    loans: expenses.platform,
    supplies: expenses.supplies,
    other: expenses.other,
  };
  expenses.oneOffCosts.forEach((cost) => {
    breakdown[oneOffCostBucket(cost)] += Number(cost.amount || 0);
  });
  commitmentsForMonth(monthValue).forEach((commitment) => {
    const bucket = commitmentBucket(commitment);
    breakdown[bucket] += commitmentAmountFor(commitment, monthValue);
  });
  breakdown.total = breakdown.housekeeping + breakdown.maintenance + breakdown.utilities + breakdown.propertyLoan + breakdown.loans + breakdown.supplies + breakdown.other;
  breakdown.adHoc = adHocExpenseTotalFor(monthValue);
  breakdown.commitments = commitmentTotalFor(monthValue);
  return breakdown;
}

function initialMonth() {
  const current = new Date().toISOString().slice(0, 7);
  const nextBooking = [...bookings].sort((a, b) => a.arrival.localeCompare(b.arrival)).find((booking) => booking.arrival.slice(0, 7) >= current);
  return nextBooking ? nextBooking.arrival.slice(0, 7) : current;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return `RM ${(Number(value) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function percent(value) {
  return `${(Number(value) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function defaultDepositForChannel(channel) {
  return channel === "Airbnb" ? 0 : 500;
}

function isExcludedBooking(booking) {
  return Boolean(booking?.excludeFromCalculations);
}

function calculationBookings(list = bookings) {
  return list.filter((booking) => !isExcludedBooking(booking));
}

function applyChannelDepositDefault(force = false) {
  const nextDefault = defaultDepositForChannel(els.channelInput.value);
  const currentAmount = Number(els.depositAmountInput.value || 0);
  const currentLooksDefault = currentAmount === 0 || currentAmount === 500;
  if (force || currentLooksDefault) {
    els.depositAmountInput.value = nextDefault;
  }
  if (nextDefault === 0 && Number(els.depositAmountInput.value || 0) === 0) {
    els.depositPaidInput.checked = false;
    els.depositRefundedInput.checked = false;
  }
}

function applyExcludedBookingDefaults() {
  if (!els.excludeCalculationsInput?.checked) return;
  els.revenueInput.value = 0;
  els.paidInput.value = 0;
  els.depositAmountInput.value = 0;
  els.depositPaidInput.checked = false;
  els.depositRefundedInput.checked = false;
}

function depositPortionFor(booking) {
  if (isExcludedBooking(booking)) return 0;
  if (!booking.depositPaid) return 0;
  return Math.min(Number(booking.depositAmount || 0), Number(booking.paid || 0));
}

function accommodationPaidFor(booking) {
  return Math.max(0, Number(booking.paid || 0) - depositPortionFor(booking));
}

function totalToReceiveFor(booking) {
  if (isExcludedBooking(booking)) return 0;
  return Number(booking.revenue || 0) + Number(booking.depositAmount || 0);
}

function balanceFor(booking) {
  if (isExcludedBooking(booking)) return 0;
  return Math.max(0, totalToReceiveFor(booking) - Number(booking.paid || 0));
}

function refundPendingFor(booking) {
  if (isExcludedBooking(booking)) return 0;
  return booking.depositPaid && !booking.depositRefunded ? Number(booking.depositAmount || 0) : 0;
}

function refundControl(booking) {
  if (isExcludedBooking(booking)) return "-";
  if (!booking.depositPaid || Number(booking.depositAmount || 0) <= 0) return "-";
  return `
    <label class="refund-toggle">
      <input type="checkbox" data-refund-toggle="${booking.id}" ${booking.depositRefunded ? "checked" : ""} />
      <span>${booking.depositRefunded ? "Refunded" : "Pending"}</span>
    </label>
  `;
}

function fullReceivedControl(booking) {
  if (isExcludedBooking(booking)) return "-";
  const isFull = balanceFor(booking) <= 0;
  return `
    <label class="refund-toggle">
      <input type="checkbox" data-full-received="${booking.id}" ${isFull ? "checked" : ""} />
      <span>${isFull ? "Full" : "Mark full"}</span>
    </label>
  `;
}

function setDepositRefunded(id, refunded) {
  bookings = bookings.map((booking) =>
    booking.id === id
      ? { ...booking, depositRefunded: Boolean(refunded) && booking.depositPaid }
      : booking,
  );
  saveBookings();
  renderAll();
}

function setFullReceived(id, checked) {
  if (!checked) {
    renderAll();
    return;
  }
  bookings = bookings.map((booking) =>
    booking.id === id
      ? { ...booking, paid: totalToReceiveFor(booking) }
      : booking,
  );
  saveBookings();
  renderAll();
}

function currentYear() {
  return new Date().getFullYear();
}

function bookingsForYear(year) {
  return calculationBookings().filter((booking) => dateObj(booking.arrival).getFullYear() === year);
}

function totalsForBookings(list) {
  return calculationBookings(list).reduce(
    (acc, booking) => {
      acc.bookings += 1;
      acc.revenue += Number(booking.revenue) || 0;
      acc.totalToReceive += totalToReceiveFor(booking);
      acc.paid += Number(booking.paid) || 0;
      acc.balance += balanceFor(booking);
      acc.depositHeld += booking.depositPaid && !booking.depositRefunded ? Number(booking.depositAmount || 0) : 0;
      acc.refundPending += refundPendingFor(booking);
      acc.nights += Number(booking.nights) || 0;
      return acc;
    },
    { bookings: 0, revenue: 0, totalToReceive: 0, paid: 0, balance: 0, depositHeld: 0, refundPending: 0, nights: 0 },
  );
}

function upcomingPaymentsThroughYearEnd(year = currentYear()) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearEnd = new Date(year, 11, 31);
  return calculationBookings()
    .filter((booking) => {
      const arrival = dateObj(booking.arrival);
      return arrival >= today && arrival <= yearEnd;
    })
    .reduce((sum, booking) => sum + balanceFor(booking), 0);
}

function companyTaxEstimate(profit) {
  const chargeable = Math.max(0, Number(profit) || 0);
  const firstBand = Math.min(chargeable, 150000) * 0.15;
  const secondBand = Math.min(Math.max(chargeable - 150000, 0), 450000) * 0.17;
  const finalBand = Math.max(chargeable - 600000, 0) * 0.24;
  return firstBand + secondBand + finalBand;
}

function personalTaxEstimate(chargeableIncome) {
  const income = Math.max(0, Number(chargeableIncome) || 0);
  const bands = [
    { limit: 5000, rate: 0 },
    { limit: 20000, rate: 0.01 },
    { limit: 35000, rate: 0.03 },
    { limit: 50000, rate: 0.06 },
    { limit: 70000, rate: 0.11 },
    { limit: 100000, rate: 0.19 },
    { limit: 400000, rate: 0.25 },
    { limit: 600000, rate: 0.26 },
    { limit: 2000000, rate: 0.28 },
    { limit: Infinity, rate: 0.3 },
  ];
  let previous = 0;
  return bands.reduce((tax, band) => {
    if (income <= previous) return tax;
    const taxableAtBand = Math.min(income, band.limit) - previous;
    previous = band.limit;
    return tax + taxableAtBand * band.rate;
  }, 0);
}

function revenueForPeriod(year, startMonth, mode) {
  const startDate = dateObj(`${startMonth}-01`);
  return calculationBookings()
    .filter((booking) => {
      const arrival = dateObj(booking.arrival);
      if (arrival.getFullYear() !== year) return false;
      return mode === "before" ? arrival < startDate : arrival >= startDate;
    })
    .reduce((sum, booking) => sum + Number(booking.revenue || 0), 0);
}

function salaryMonthsForPlan(year, startMonth) {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  if (startYear !== year) return 0;
  return Math.max(0, 12 - startMonthNumber + 1);
}

function dateObj(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = dateObj(checkIn);
  const end = dateObj(checkOut);
  const diff = Math.round((end - start) / 86400000);
  return Math.max(0, diff);
}

function monthLabel(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

function shortDate(iso) {
  return dateObj(iso).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function longDate(iso) {
  return dateObj(iso).toLocaleDateString("en-MY", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function quickDate(iso) {
  const date = dateObj(iso);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${date.toLocaleDateString("en-MY", { month: "short" })} ${day}${suffix}`;
}

function prefixFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || "").slice(0, 2).toUpperCase();
}

function documentTypeCode(type) {
  return { Quotation: "Q", Invoice: "I", "Official Receipt": "R" }[type] || "Q";
}

function documentNightsCode(nights) {
  const count = Number(nights || 1);
  if (count === 1) return "A";
  if (count === 2) return "B";
  if (count === 3) return "C";
  return "D";
}

function bookingConfirmationCode(booking) {
  if (!booking?.arrival) return "SV-DDMM-A08";
  const [, month = "01", day = "01"] = booking.arrival.split("-");
  return `SV-${day}${month}-${documentNightsCode(booking.nights)}${booking.channel === "Airbnb" ? "18" : "08"}`;
}

function bookingSourceCode(bookingType) {
  return bookingType === "Airbnb Booking" ? "18" : "08";
}

function documentCodeFor(doc) {
  const issuerCode = issuers[doc.issuer]?.code || "SVV";
  const checkIn = doc.checkIn || isoDate(new Date());
  const [, month = "01", day = "01"] = checkIn.split("-");
  return `${issuerCode}-${month}${day}-${documentTypeCode(doc.type)}${documentNightsCode(doc.nights)}${bookingSourceCode(doc.bookingType)}`;
}

function documentTotalFor(doc) {
  return Number(doc.accommodationFee || 0) + Number(doc.securityDeposit || 0);
}

function paymentTotalFor(doc) {
  return (doc.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function documentStatusClass(status) {
  return String(status || "Draft").toLowerCase().replaceAll(" ", "-");
}

function channelBadgeFor(booking) {
  if (isExcludedBooking(booking)) return `<span class="channel-badge influencer">Influencer</span>`;
  return `<span class="channel-badge ${booking.channel.toLowerCase()}">${escapeHtml(booking.channel)}</span>`;
}

function titledGuestName(booking) {
  const title = booking?.guestTitle === "Ms" ? "Ms" : "Mr";
  const name = String(booking?.guest || "").trim();
  return name ? `${title} ${name}` : title;
}

function syncBookingChannelChoice() {
  document.querySelectorAll("[data-form-channel]").forEach((button) => {
    const isActive = button.dataset.formChannel === els.channelInput.value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function departureFor(booking) {
  return isoDate(addDays(dateObj(booking.arrival), Number(booking.nights) || 0));
}

function overlapsDate(booking, dayIso) {
  const day = dateObj(dayIso);
  const start = dateObj(booking.arrival);
  const end = dateObj(departureFor(booking));
  return start <= day && day < end;
}

function bookingMonthOverlap(booking, monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const startOfNextMonth = new Date(year, month, 1);
  const start = dateObj(booking.arrival);
  const end = dateObj(departureFor(booking));
  return start < startOfNextMonth && end > startOfMonth;
}

function arrivalInMonth(booking, monthValue) {
  return booking.arrival.slice(0, 7) === monthValue;
}

function bookingsForMonth(monthValue) {
  return bookings
    .filter((booking) => bookingMonthOverlap(booking, monthValue))
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
}

function arrivalsForMonth(monthValue) {
  return bookings
    .filter((booking) => arrivalInMonth(booking, monthValue))
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
}

function totalsFor(monthValue) {
  return totalsForBookings(bookingsForMonth(monthValue));
}

function daysInMonth(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function isWeekendNight(iso) {
  const day = dateObj(iso).getDay();
  return day === 5 || day === 6 || day === 0;
}

function stayPerformanceForMonth(monthValue) {
  const bookedDates = new Set();
  let weekdayNights = 0;
  let weekendNights = 0;
  let weekdayRevenue = 0;
  let weekendRevenue = 0;
  const [year, month] = monthValue.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  calculationBookings(bookingsForMonth(monthValue)).forEach((booking) => {
    const nightlyRate = Number(booking.revenue || 0) / Math.max(1, Number(booking.nights || 1));
    for (let stayDate = dateObj(booking.arrival); stayDate < dateObj(departureFor(booking)); stayDate = addDays(stayDate, 1)) {
      if (stayDate < monthStart || stayDate >= monthEnd) continue;
      const stayIso = isoDate(stayDate);
      bookedDates.add(stayIso);
      if (isWeekendNight(stayIso)) {
        weekendNights += 1;
        weekendRevenue += nightlyRate;
      } else {
        weekdayNights += 1;
        weekdayRevenue += nightlyRate;
      }
    }
  });

  const availableNights = daysInMonth(monthValue);
  const bookedNights = bookedDates.size;
  return {
    availableNights,
    bookedNights,
    occupancyRate: availableNights ? (bookedNights / availableNights) * 100 : 0,
    weekdayNights,
    weekendNights,
    avgWeekdayRate: weekdayNights ? weekdayRevenue / weekdayNights : 0,
    avgWeekendRate: weekendNights ? weekendRevenue / weekendNights : 0,
  };
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}View`));
  document.querySelectorAll(".nav-button").forEach((node) => node.classList.toggle("active", node.dataset.view === view));
  els.pageTitle.textContent = {
    calendar: "Monthly Calendar",
    dashboard: "Income Dashboard",
    bookings: "Bookings",
    documents: "Villa Documents",
    tax: "Tax Plan",
  }[view];
}

function staySegmentClass(booking, dayIso) {
  const start = booking.arrival;
  const end = isoDate(addDays(dateObj(departureFor(booking)), -1));
  const day = dateObj(dayIso);
  const isMonday = day.getDay() === 1;
  const isSunday = day.getDay() === 0;
  const starts = dayIso === start || isMonday;
  const ends = dayIso === end || isSunday;
  if (starts && ends) return "single";
  if (starts) return "start";
  if (ends) return "end";
  return "middle";
}

function shouldShowStayLabel(booking, dayIso) {
  const day = dateObj(dayIso);
  return dayIso === booking.arrival || day.getDay() === 1 || day.getDate() === 1;
}

function renderCalendar() {
  const [year, month] = selectedMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  const todayIso = isoDate(new Date());
  els.calendarGrid.innerHTML = "";

  for (let i = 0; i < 42; i += 1) {
    const day = addDays(gridStart, i);
    const dayIso = isoDate(day);
    const cell = document.createElement("article");
    cell.className = "day-cell";
    if (day.getMonth() !== month - 1) cell.classList.add("outside");
    if (dayIso === todayIso) cell.classList.add("today");

    const booked = bookings.filter((booking) => overlapsDate(booking, dayIso));
    cell.innerHTML = `
      <div class="date-number">
        <span>${day.getDate()}</span>
        ${booked.length ? `<span class="status-pill">${booked.length}</span>` : ""}
      </div>
    `;

    booked.slice(0, 3).forEach((booking) => {
      const chip = document.createElement("div");
      const label = shouldShowStayLabel(booking, dayIso);
      chip.className = `booking-chip stay-segment ${isExcludedBooking(booking) ? "influencer" : booking.channel.toLowerCase()} ${staySegmentClass(booking, dayIso)} ${label ? "" : "label-hidden"}`;
      chip.innerHTML = label
        ? `<strong>${escapeHtml(booking.guest)}</strong><span>${isExcludedBooking(booking) ? "Influencer" : escapeHtml(booking.channel)} · ${booking.nights} nights</span>`
        : `<span aria-label="${escapeHtml(booking.guest)} ${escapeHtml(booking.channel)} booking">&nbsp;</span>`;
      cell.appendChild(chip);
    });

    if (booked.length > 3) {
      const more = document.createElement("div");
      more.className = "booking-chip";
      more.textContent = `+${booked.length - 3} more`;
      cell.appendChild(more);
    }

    els.calendarGrid.appendChild(cell);
  }
}

function renderDetails() {
  const monthBookings = bookingsForMonth(selectedMonth);
  els.detailMonth.textContent = monthLabel(selectedMonth);
  els.bookingCount.textContent = `${monthBookings.length} booking${monthBookings.length === 1 ? "" : "s"}`;
  els.detailsList.innerHTML = "";

  if (!monthBookings.length) {
    els.detailsList.innerHTML = `<div class="empty-state">No bookings for this month.</div>`;
    return;
  }

  els.detailsList.innerHTML = `
    <div class="quick-view-card">
      <table class="quick-view-table" aria-label="Quick booking list">
        <thead>
          <tr>
            <th>Guest</th>
            <th>Type</th>
            <th>Check-in</th>
            <th>Nights</th>
            <th>Accommodation Fees</th>
            <th>Damage Deposit</th>
            <th>Total to Receive</th>
            <th>Received</th>
            <th>Full Received</th>
            <th>Balance</th>
            <th>Refund</th>
          </tr>
        </thead>
        <tbody>
          ${monthBookings
            .map((booking) => {
              const balance = balanceFor(booking);
              const channelClass = booking.channel.toLowerCase();
              return `
                <tr>
                  <td>
                    <div class="guest-cell">
                      <span class="guest-code">${prefixFor(booking.guest)}</span>
                      <span class="guest-meta">
                        <strong>${escapeHtml(booking.guest)}</strong>
                        <span>${shortDate(departureFor(booking))} out</span>
                      </span>
                    </div>
                  </td>
                  <td>${channelBadgeFor(booking)}</td>
                  <td><strong>${quickDate(booking.arrival)}</strong></td>
                  <td><strong>${booking.nights}</strong></td>
                  <td class="amount-cell">${money(booking.revenue)}</td>
                  <td class="amount-cell">${money(booking.depositAmount)}</td>
                  <td class="amount-cell">${money(totalToReceiveFor(booking))}</td>
                  <td class="amount-cell">${money(booking.paid)}</td>
                  <td>${fullReceivedControl(booking)}</td>
                  <td class="amount-cell ${balance > 0 ? "balance-due" : ""}">${money(balance)}</td>
                  <td>${refundControl(booking)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <div class="quick-summary">
        <div><span>Accommodation Fees</span><strong>${money(monthBookings.reduce((sum, booking) => sum + Number(booking.revenue || 0), 0))}</strong></div>
        <div><span>Total to Receive</span><strong>${money(monthBookings.reduce((sum, booking) => sum + totalToReceiveFor(booking), 0))}</strong></div>
        <div><span>Balance</span><strong>${money(monthBookings.reduce((sum, booking) => sum + balanceFor(booking), 0))}</strong></div>
      </div>
    </div>
  `;
}

function drawQuickViewImage() {
  const monthBookings = bookingsForMonth(selectedMonth);
  const rowHeight = 78;
  const headerHeight = 168;
  const footerHeight = 42;
  const width = 1580;
  const height = Math.max(420, headerHeight + rowHeight * Math.max(monthBookings.length, 1) + footerHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f7f9";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#17324d";
  ctx.fillRect(0, 0, width, 118);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 42px system-ui";
  ctx.fillText("Sunrise Villa", 48, 58);
  ctx.font = "700 28px system-ui";
  ctx.fillText(`${monthLabel(selectedMonth)} Booking Quick View`, 48, 98);

  const cols = [48, 330, 460, 610, 720, 875, 1035, 1190, 1320];
  const headers = ["Guest", "Type", "Check-in", "Nights", "Fees", "Deposit", "Total", "Received", "Balance"];
  ctx.fillStyle = "#e8f1f7";
  ctx.fillRect(32, 136, width - 64, 44);
  ctx.fillStyle = "#17324d";
  ctx.font = "800 19px system-ui";
  headers.forEach((header, index) => ctx.fillText(header, cols[index], 165));

  if (!monthBookings.length) {
    ctx.fillStyle = "#657386";
    ctx.font = "700 28px system-ui";
    ctx.fillText("No bookings for this month.", 48, 250);
    return canvas;
  }

  monthBookings.forEach((booking, index) => {
    const y = 180 + index * rowHeight;
    const balance = balanceFor(booking);
    ctx.fillStyle = index % 2 === 0 ? "#ffffff" : "#f9fbfc";
    ctx.fillRect(32, y, width - 64, rowHeight);
    ctx.strokeStyle = "#d9e0e8";
    ctx.beginPath();
    ctx.moveTo(32, y + rowHeight);
    ctx.lineTo(width - 32, y + rowHeight);
    ctx.stroke();

    ctx.fillStyle = "#17324d";
    ctx.fillRect(cols[0], y + 18, 46, 42);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(prefixFor(booking.guest), cols[0] + 23, y + 46);
    ctx.textAlign = "left";

    ctx.fillStyle = "#17212f";
    ctx.font = "800 24px system-ui";
    ctx.fillText(booking.guest, cols[0] + 62, y + 36);
    ctx.fillStyle = "#657386";
    ctx.font = "600 17px system-ui";
    ctx.fillText(`${shortDate(departureFor(booking))} out`, cols[0] + 62, y + 60);

    ctx.fillStyle = booking.channel === "Direct" ? "#2e7d54" : "#c97920";
    ctx.font = "800 21px system-ui";
    ctx.fillText(booking.channel, cols[1], y + 45);
    ctx.fillStyle = "#17212f";
    ctx.fillText(quickDate(booking.arrival), cols[2], y + 45);
    ctx.fillText(String(booking.nights), cols[3], y + 45);
    ctx.textAlign = "right";
    ctx.fillText(money(booking.revenue), cols[4] + 120, y + 45);
    ctx.fillText(money(booking.depositAmount), cols[5] + 120, y + 45);
    ctx.fillText(money(totalToReceiveFor(booking)), cols[6] + 120, y + 45);
    ctx.fillText(money(booking.paid), cols[7] + 120, y + 45);
    ctx.fillStyle = balance > 0 ? "#b42318" : "#17212f";
    ctx.fillText(money(balance), cols[8] + 120, y + 45);
    ctx.textAlign = "left";
  });

  return canvas;
}

function allAppData() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    bookings,
    documents,
    taxPlan,
    profitData,
    appSettings,
  };
}

function downloadBackup() {
  appSettings = { ...appSettings, lastBackupAt: new Date().toISOString() };
  saveAppSettings();
  const blob = new Blob([JSON.stringify(allAppData(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.download = `sunrise-villa-backup-${isoDate(new Date())}.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  renderBackupStatus();
}

function renderBackupStatus() {
  if (!els.backupStatus) return;
  if (!appSettings.lastBackupAt) {
    els.backupStatus.textContent = "Not yet";
    return;
  }
  const last = new Date(appSettings.lastBackupAt);
  const days = Math.floor((Date.now() - last.getTime()) / 86400000);
  els.backupStatus.textContent = days <= 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} ago`;
}

function saveSelectedProfitMonth(nextMonthData) {
  profitData = {
    ...profitData,
    [selectedMonth]: normalizeProfitMonth(nextMonthData),
  };
  saveProfitData();
}

function receiptImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read receipt image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not load receipt image."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderOneOffCosts() {
  if (!els.oneOffCostList) return;
  const expenses = profitMonth(selectedMonth);
  const oneOffTotal = expenses.oneOffCosts.reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  if (els.oneOffTotalOut) els.oneOffTotalOut.textContent = money(oneOffTotal);
  els.oneOffCostList.innerHTML = expenses.oneOffCosts.length
    ? expenses.oneOffCosts
        .map(
          (cost) => `
            <div class="one-off-row">
              <label>Type
                <select data-one-off-field="category" data-one-off-id="${cost.id}">
                  ${["Groceries", "Gas", "Supplies", "Repair", "Laundry", "Utilities", "Other"]
                    .map((category) => `<option ${cost.category === category ? "selected" : ""}>${category}</option>`)
                    .join("")}
                </select>
              </label>
              <label>Description
                <input data-one-off-field="description" data-one-off-id="${cost.id}" value="${escapeHtml(cost.description)}" placeholder="Example: BBQ charcoal, towels, petrol" />
              </label>
              <label>Amount
                <input data-one-off-field="amount" data-one-off-id="${cost.id}" type="number" min="0" step="0.01" value="${Number(cost.amount || 0)}" />
              </label>
              <div class="receipt-field">
                <span>Receipt Image</span>
                ${
                  cost.receiptImage
                    ? `<div class="receipt-preview">
                        <img src="${cost.receiptImage}" alt="Receipt for ${escapeHtml(cost.description || cost.category)}" />
                        <div>
                          <strong>${escapeHtml(cost.receiptName || "Receipt attached")}</strong>
                          <button class="small-action danger" type="button" data-remove-receipt="${cost.id}">Remove receipt</button>
                        </div>
                      </div>`
                    : `<label class="receipt-upload">
                        Attach receipt
                        <input data-receipt-upload="${cost.id}" type="file" accept="image/*" />
                      </label>`
                }
              </div>
              <button class="small-action danger" type="button" data-delete-one-off="${cost.id}">Delete</button>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-one-off">No one-off costs recorded for ${monthLabel(selectedMonth)}.</div>`;
}

function renderCommitments() {
  const breakdown = expenseBreakdownFor(selectedMonth);
  const [selectedYear] = selectedMonth.split("-").map(Number);
  if (els.commitmentBreakdownSummary) {
    const rows = [
      ["Housekeeping", breakdown.housekeeping],
      ["Maintenance", breakdown.maintenance],
      ["Electricity & Water", breakdown.utilities],
      ["Property Loan", breakdown.propertyLoan],
      ["Credit Card / Loans", breakdown.loans],
      ["Other Costs", breakdown.supplies + breakdown.other],
    ];
    els.commitmentBreakdownSummary.innerHTML = rows
      .map(
        ([label, value]) => `
          <div>
            <span>${label}</span>
            <strong>${money(value)}</strong>
          </div>
        `,
      )
      .join("");
  }
  if (!els.commitmentList) return;
  const commitments = appSettings.commitments || [];
  const activeTotal = commitmentTotalFor(selectedMonth);
  els.commitmentList.innerHTML = `
    <div class="commitment-summary">
      <span>Active this month</span>
      <strong>${money(activeTotal)}</strong>
      <small>Loans automatically stop after their expiry month.</small>
    </div>
    ${commitments
      .map(
        (commitment) => `
          <div class="commitment-row ${commitmentActiveInMonth(commitment, selectedMonth) ? "" : "inactive"}">
            <label>Name
              <input data-commitment-field="name" data-commitment-id="${commitment.id}" value="${escapeHtml(commitment.name)}" />
            </label>
            <label>Monthly Amount
              <input data-commitment-field="amount" data-commitment-id="${commitment.id}" type="number" min="0" step="0.01" value="${Number(commitment.amount || 0)}" />
            </label>
            <label>Category
              <input data-commitment-field="category" data-commitment-id="${commitment.id}" value="${escapeHtml(commitment.category)}" />
            </label>
            <label>Expires
              <input data-commitment-field="expires" data-commitment-id="${commitment.id}" type="month" value="${escapeHtml(commitment.expires)}" />
            </label>
            <button class="small-action danger" type="button" data-delete-commitment="${commitment.id}">Delete</button>
          </div>
        `,
      )
      .join("")}
  `;
  if (els.annualCommitmentRows) {
    const months = Array.from({ length: 12 }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, "0")}`);
    els.annualCommitmentRows.innerHTML = commitments
      .map(
        (commitment) => `
          <tr>
            <td><strong>${escapeHtml(commitment.name)}</strong><br><span class="table-muted">${escapeHtml(commitment.category)}</span></td>
            ${months
              .map(
                (monthValue) => `
                  <td>
                    <input class="annual-amount-input" data-annual-commitment-id="${commitment.id}" data-annual-month="${monthValue}" type="number" min="0" step="0.01" value="${commitmentAmountFor(commitment, monthValue)}" />
                  </td>
                `,
              )
              .join("")}
          </tr>
        `,
      )
      .join("");
  }
}

function restoreAppData(data) {
  if (Array.isArray(data)) {
    bookings = data.map(normalizeBooking);
  } else {
    bookings = Array.isArray(data.bookings) ? data.bookings.map(normalizeBooking) : bookings;
    documents = Array.isArray(data.documents) ? data.documents.map(normalizeDocument) : documents;
    taxPlan = data.taxPlan
      ? { ...defaultTaxPlan(), ...data.taxPlan, notes: { ...defaultTaxPlan().notes, ...(data.taxPlan.notes || {}) } }
      : taxPlan;
    profitData = data.profitData && typeof data.profitData === "object" ? data.profitData : profitData;
    appSettings = data.appSettings
      ? { ...defaultAppSettings(), ...data.appSettings, message: { ...defaultAppSettings().message, ...(data.appSettings.message || {}) } }
      : appSettings;
  }
  saveBookings();
  saveDocuments();
  saveTaxPlan();
  saveProfitData();
  saveAppSettings();
  renderAll();
}

function formatPhoneForWhatsapp(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function messageBookingOptions() {
  const sorted = [...bookings].sort((a, b) => a.arrival.localeCompare(b.arrival));
  return sorted
    .map((booking) => `<option value="${booking.id}">${escapeHtml(shortDate(booking.arrival))} · ${escapeHtml(booking.guest)}</option>`)
    .join("");
}

function selectedMessageBooking() {
  return bookings.find((booking) => booking.id === els.messageBookingSelect?.value) || [...bookings].sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
}

function fillMessageFromBooking(force = false) {
  const booking = selectedMessageBooking();
  if (!booking || !els.messageGuestName) return;
  if (els.messageGuestTitle) els.messageGuestTitle.value = booking.guestTitle === "Ms" ? "Ms" : "Mr";
  if (force || !els.messageGuestName.value) els.messageGuestName.value = booking.guest;
  if (force || !els.messagePhone.value) els.messagePhone.value = booking.contact || "";
  if (force || !els.messageCheckinTime.value) els.messageCheckinTime.value = appSettings.message.checkinTime || "3:00 PM";
  els.messageSecurityCode.value = bookingConfirmationCode(booking);
  if (els.messageCodeDisplay) els.messageCodeDisplay.textContent = bookingConfirmationCode(booking);
  if (force || !els.messageAddress.value) els.messageAddress.value = appSettings.message.address || "";
  renderCheckinMessage();
}

function checkinMessageText() {
  const booking = selectedMessageBooking();
  const title = els.messageGuestTitle?.value || booking?.guestTitle || "Mr";
  const guestName = els.messageGuestName?.value.trim() || booking?.guest || "Guest";
  const guest = guestName === "Guest" ? guestName : `${title} ${guestName}`;
  const securityCode = booking ? bookingConfirmationCode(booking) : "SV-DDMM-A08";
  const address = els.messageAddress?.value.trim() || appSettings.message.address;
  const mapsLink = appSettings.message.mapsLink || "https://g.co/kgs/DYpYPSh";
  return `Hi ${guest},\n\nWe are excited to welcome you to Sunrise Villa. Here are the arrival details for a smooth check-in:\n\n#Confirmation Code: ${securityCode}\n\n#Address: ${address}\n\n#Google Maps Link: ${mapsLink}\n\n#Finding Us: We are located right behind McDonald's at Genting Sempah R&R.\n\n#Steps to Access:\n1. Drive up the slope to the guardhouse.\n2. Show your reservation details and Confirmation Code to the guards.\n3. Fill in the required guest information at the guardhouse.\n4. Continue driving until you reach the top T-junction. Look for the coconut tree as your landmark.\n\n#Guest Guide (MUST READ): https://bit.ly/sunrisevilla-guest-guide\n\nPlease read the guest guide before arrival. Thank you, and we look forward to hosting you.`;
}

function renderCheckinMessage() {
  if (!els.checkinMessagePreview) return;
  if (els.messageCodeDisplay) els.messageCodeDisplay.textContent = selectedMessageBooking() ? bookingConfirmationCode(selectedMessageBooking()) : "SV-DDMM-A08";
  els.checkinMessagePreview.value = checkinMessageText();
  appSettings = {
    ...appSettings,
    message: {
      checkinTime: els.messageCheckinTime?.value || "3:00 PM",
      address: els.messageAddress?.value || "",
      mapsLink: appSettings.message.mapsLink || "https://g.co/kgs/DYpYPSh",
    },
  };
  saveAppSettings();
}

function renderMessageGenerator() {
  if (!els.messageBookingSelect) return;
  const current = els.messageBookingSelect.value;
  els.messageBookingSelect.innerHTML = messageBookingOptions() || `<option value="">No bookings yet</option>`;
  if (current && bookings.some((booking) => booking.id === current)) els.messageBookingSelect.value = current;
  fillMessageFromBooking(false);
}

function setupDashboardToggles() {
  document.querySelectorAll("#dashboardView .dashboard-section").forEach((section, index) => {
    const heading = section.querySelector(".section-heading");
    if (!heading || heading.querySelector("[data-dashboard-toggle]")) return;
    const key = section.querySelector("h3")?.id || `section-${index}`;
    section.dataset.dashboardKey = key;
    const button = document.createElement("button");
    button.className = "ghost-button compact dashboard-toggle";
    button.type = "button";
    button.dataset.dashboardToggle = key;
    heading.appendChild(button);
  });
  applyDashboardToggles();
}

function applyDashboardToggles() {
  document.querySelectorAll("#dashboardView .dashboard-section").forEach((section) => {
    const key = section.dataset.dashboardKey;
    const isHidden = Boolean(appSettings.dashboardHidden?.[key]);
    section.classList.toggle("collapsed", isHidden);
    const button = section.querySelector("[data-dashboard-toggle]");
    if (button) button.textContent = isHidden ? "Show" : "Hide";
  });
}

function renderDashboard() {
  const totals = totalsFor(selectedMonth);
  const selectedPerformance = stayPerformanceForMonth(selectedMonth);
  const selectedExpenses = profitMonth(selectedMonth);
  const selectedExpenseTotal = expenseTotalFor(selectedMonth);
  const selectedBreakdown = expenseBreakdownFor(selectedMonth);
  const selectedNetProfit = Number(totals.revenue || 0) - selectedExpenseTotal;
  const year = currentYear();
  const overall = totalsForBookings(bookingsForYear(year));
  const upcomingPayments = upcomingPaymentsThroughYearEnd(year);
  const dashboardGuideTitle = document.querySelector("#dashboardGuideTitle");
  if (dashboardGuideTitle) dashboardGuideTitle.textContent = `${monthLabel(selectedMonth)} Operations`;
  els.sideRevenue.textContent = money(totals.revenue);
  els.sideTotalToReceive.textContent = money(totals.totalToReceive);
  els.sideBalance.textContent = money(totals.balance);
  els.sideUpcomingPayments.textContent = money(upcomingPayments);
  els.sideNights.textContent = totals.nights;
  els.overallTitle.textContent = `${year} Overall Summary`;
  els.overallRevenue.textContent = money(overall.revenue);
  els.overallTotalToReceive.textContent = money(overall.totalToReceive);
  els.overallPaid.textContent = money(overall.paid);
  els.overallBalance.textContent = money(overall.balance);
  els.overallUpcomingPayments.textContent = money(upcomingPayments);
  els.overallDepositHeld.textContent = money(overall.depositHeld);
  els.overallRefundPending.textContent = money(overall.refundPending);
  els.monthlyTitle.textContent = `${monthLabel(selectedMonth)} Monthly Summary`;
  els.kpiRevenue.textContent = money(totals.revenue);
  els.kpiTotalToReceive.textContent = money(totals.totalToReceive);
  els.kpiPaid.textContent = money(totals.paid);
  els.kpiBalance.textContent = money(totals.balance);
  els.kpiDepositHeld.textContent = money(totals.depositHeld);
  els.kpiRefundPending.textContent = money(totals.refundPending);
  if (els.kpiBookings) els.kpiBookings.textContent = totals.bookings;
  els.profitTitle.textContent = `${monthLabel(selectedMonth)} Monthly Profit View`;
  if (els.expenseCleaning) els.expenseCleaning.value = selectedExpenses.cleaning;
  if (els.expenseUtilities) els.expenseUtilities.value = selectedExpenses.utilities;
  if (els.expenseMaintenance) els.expenseMaintenance.value = selectedExpenses.maintenance;
  if (els.expenseSupplies) els.expenseSupplies.value = selectedExpenses.supplies;
  if (els.expensePlatform) els.expensePlatform.value = selectedExpenses.platform;
  if (els.expenseOther) els.expenseOther.value = selectedExpenses.other;
  if (els.expenseNotes) els.expenseNotes.value = selectedExpenses.notes;
  els.netProfitOut.textContent = money(selectedNetProfit);
  els.totalExpensesOut.textContent = money(selectedExpenseTotal);
  els.fixedCommitmentsOut.textContent = money(selectedBreakdown.commitments);
  if (els.adHocExpensesOut) els.adHocExpensesOut.textContent = money(selectedBreakdown.adHoc);
  renderOneOffCosts();
  renderCommitments();
  els.occupancyTitle.textContent = `${monthLabel(selectedMonth)} Occupancy & Nightly Rates`;
  els.occupancyRate.textContent = percent(selectedPerformance.occupancyRate);
  els.bookedNights.textContent = selectedPerformance.bookedNights;
  els.availableNights.textContent = selectedPerformance.availableNights;
  els.weekdayNights.textContent = selectedPerformance.weekdayNights;
  els.weekendNights.textContent = selectedPerformance.weekendNights;
  els.avgWeekdayRate.textContent = money(selectedPerformance.avgWeekdayRate);
  els.avgWeekendRate.textContent = money(selectedPerformance.avgWeekendRate);
  els.channelMixTitle.textContent = `${monthLabel(selectedMonth)} Direct vs Airbnb`;

  const [selectedYear] = selectedMonth.split("-").map(Number);
  const monthSummaries = Array.from({ length: 12 }, (_, index) => {
    const monthValue = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
    return { monthValue, label: monthLabel(monthValue).replace(` ${selectedYear}`, ""), ...totalsFor(monthValue), performance: stayPerformanceForMonth(monthValue) };
  });
  const maxRevenue = Math.max(...monthSummaries.map((item) => item.revenue), 1);

  els.incomeChart.innerHTML = monthSummaries
    .map(
      (item) => `
        <div class="bar-row">
          <strong>${item.label}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${(item.revenue / maxRevenue) * 100}%"></div></div>
          <span>${money(item.revenue)}</span>
        </div>
      `,
    )
    .join("");

  els.summaryRows.innerHTML = monthSummaries
    .map(
      (item) => `
        <tr>
          <td>${item.label} ${selectedYear}</td>
          <td>${item.bookings}</td>
          <td>${money(item.revenue)}</td>
          <td>${money(expenseTotalFor(item.monthValue))}</td>
          <td>${money(item.revenue - expenseTotalFor(item.monthValue))}</td>
          <td>${money(item.totalToReceive)}</td>
          <td>${money(item.paid)}</td>
          <td>${money(item.balance)}</td>
          <td>${percent(item.performance.occupancyRate)}</td>
          <td>${money(item.depositHeld)}</td>
          <td>${money(item.refundPending)}</td>
          <td>${item.performance.bookedNights}</td>
        </tr>
      `,
    )
    .join("");

  const pnlSummaries = monthSummaries.map((item) => {
    const breakdown = expenseBreakdownFor(item.monthValue);
    const netProfit = item.revenue - breakdown.total;
    return { ...item, breakdown, netProfit, margin: item.revenue ? (netProfit / item.revenue) * 100 : 0 };
  });
  const bestMonth = pnlSummaries.reduce((best, item) => (item.netProfit > best.netProfit ? item : best), pnlSummaries[0]);
  const totalYearProfit = pnlSummaries.reduce((sum, item) => sum + item.netProfit, 0);
  const totalYearExpenses = pnlSummaries.reduce((sum, item) => sum + item.breakdown.total, 0);
  els.pnlCards.innerHTML = `
    <article class="mini-kpi"><span>Year Net Profit</span><strong>${money(totalYearProfit)}</strong><small>${selectedYear}</small></article>
    <article class="mini-kpi"><span>Year Expenses</span><strong>${money(totalYearExpenses)}</strong><small>Recurring commitments included</small></article>
    <article class="mini-kpi"><span>Best Month</span><strong>${bestMonth?.label || "-"}</strong><small>${money(bestMonth?.netProfit || 0)} net profit</small></article>
  `;
  els.pnlRows.innerHTML = pnlSummaries
    .map(
      (item) => `
        <tr>
          <td>${item.label} ${selectedYear}</td>
          <td>${money(item.revenue)}</td>
          <td>${money(item.breakdown.commitments)}</td>
          <td>${money(item.breakdown.total)}</td>
          <td class="${item.netProfit < 0 ? "balance-due" : ""}">${money(item.netProfit)}</td>
          <td>${percent(item.margin)}</td>
        </tr>
      `,
    )
    .join("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = calculationBookings()
    .filter((booking) => dateObj(booking.arrival) >= today)
    .sort((a, b) => a.arrival.localeCompare(b.arrival))
    .slice(0, 6);

  els.upcomingRows.innerHTML = upcoming.length
    ? upcoming
        .map((booking) => {
          const balance = balanceFor(booking);
          return `
          <tr>
            <td><strong>${escapeHtml(booking.guest)}</strong><br><span class="table-muted">${prefixFor(booking.guest)}</span></td>
            <td><span class="channel-badge ${booking.channel.toLowerCase()}">${escapeHtml(booking.channel)}</span></td>
            <td>${shortDate(booking.arrival)}</td>
            <td>${booking.nights}</td>
            <td class="${balance > 0 ? "balance-due" : ""}">${money(balance)}</td>
            <td>${fullReceivedControl(booking)}</td>
            <td>${money(booking.depositAmount)}</td>
            <td>${refundControl(booking)}</td>
          </tr>
        `;
        })
        .join("")
    : `<tr><td colspan="8" class="empty-row">No upcoming arrivals.</td></tr>`;

  const direct = calculationBookings(bookingsForMonth(selectedMonth)).filter((booking) => booking.channel === "Direct");
  const airbnb = calculationBookings(bookingsForMonth(selectedMonth)).filter((booking) => booking.channel === "Airbnb");
  const channelTotals = [
    { label: "Direct", value: direct.reduce((sum, item) => sum + Number(item.revenue || 0), 0) },
    { label: "Airbnb", value: airbnb.reduce((sum, item) => sum + Number(item.revenue || 0), 0) },
  ];
  const maxChannel = Math.max(...channelTotals.map((item) => item.value), 1);
  els.channelList.innerHTML = channelTotals
    .map(
      (item) => `
      <div class="channel-item">
        <strong><span>${item.label}</span><span>${money(item.value)}</span></strong>
        <div class="channel-meter"><span style="width:${(item.value / maxChannel) * 100}%"></span></div>
      </div>
    `,
    )
    .join("");
}

function renderBookingsTable() {
  const search = els.bookingSearch?.value.trim().toLowerCase() || "";
  const channel = els.channelFilter?.value || "All";
  const payment = els.paymentFilter?.value || "All";
  const deposit = els.depositFilter?.value || "All";
  const sorted = [...bookings]
    .filter((booking) => {
      const balance = balanceFor(booking);
      const haystack = `${booking.guest} ${booking.contact} ${prefixFor(booking.guest)} ${booking.channel} ${isExcludedBooking(booking) ? "influencer complimentary free record only" : "financial"}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (channel !== "All" && booking.channel !== channel) return false;
      if (payment === "Due" && balance <= 0) return false;
      if (payment === "Paid" && balance > 0) return false;
      if (deposit === "Unpaid" && booking.depositPaid) return false;
      if (deposit === "Held" && (!booking.depositPaid || booking.depositRefunded)) return false;
      if (deposit === "RefundDue" && refundPendingFor(booking) <= 0) return false;
      if (deposit === "Refunded" && !booking.depositRefunded) return false;
      return true;
    })
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
  els.bookingRows.innerHTML = sorted
    .map((booking) => {
      const balance = balanceFor(booking);
      return `
        <tr>
          <td>${channelBadgeFor(booking)}</td>
          <td>${isExcludedBooking(booking) ? `<span class="channel-badge influencer">Record only</span>` : `<span class="channel-badge direct">Financial</span>`}</td>
          <td>${escapeHtml(booking.guest)}</td>
          <td>${escapeHtml(booking.contact || "-")}</td>
          <td><strong>${prefixFor(booking.guest)}</strong></td>
          <td>${shortDate(booking.arrival)}</td>
          <td>${booking.nights}</td>
          <td>${money(booking.revenue)}</td>
          <td>${money(booking.depositAmount)}</td>
          <td>${money(totalToReceiveFor(booking))}</td>
          <td>${money(booking.paid)}</td>
          <td>${fullReceivedControl(booking)}</td>
          <td class="${balance > 0 ? "balance-due" : ""}">${money(balance)}</td>
          <td>${refundControl(booking)}</td>
          <td class="actions">
            <button class="small-action" type="button" data-edit="${booking.id}">Edit</button>
            <button class="small-action danger" type="button" data-delete="${booking.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="15" class="empty-row">No bookings match these filters.</td></tr>`;
}

function renderOwnerReport() {
  if (!els.ownerReportPrint) return;
  const totals = totalsFor(selectedMonth);
  const performance = stayPerformanceForMonth(selectedMonth);
  const breakdown = expenseBreakdownFor(selectedMonth);
  const netProfit = totals.revenue - breakdown.total;
  const paidBookings = calculationBookings(arrivalsForMonth(selectedMonth));
  const influencerBookings = arrivalsForMonth(selectedMonth).filter(isExcludedBooking);
  els.ownerReportPrint.innerHTML = `
    <div class="owner-report-head">
      <div>
        <p>Sunrise Villa</p>
        <h1>Monthly Owner Report</h1>
        <span>${monthLabel(selectedMonth)}</span>
      </div>
      <strong>${isoDate(new Date())}</strong>
    </div>

    <section class="owner-report-grid">
      <article><span>Accommodation Fees</span><strong>${money(totals.revenue)}</strong></article>
      <article><span>Total Expenses</span><strong>${money(breakdown.total)}</strong></article>
      <article><span>Net Profit</span><strong>${money(netProfit)}</strong></article>
      <article><span>Occupancy</span><strong>${percent(performance.occupancyRate)}</strong></article>
    </section>

    <section class="owner-report-section">
      <h2>P&L Breakdown</h2>
      <table>
        <tbody>
          <tr><td>Housekeeping</td><td>${money(breakdown.housekeeping)}</td></tr>
          <tr><td>Maintenance</td><td>${money(breakdown.maintenance)}</td></tr>
          <tr><td>Electricity & Water</td><td>${money(breakdown.utilities)}</td></tr>
          <tr><td>Property Loan</td><td>${money(breakdown.propertyLoan)}</td></tr>
          <tr><td>Credit Card / Loans</td><td>${money(breakdown.loans)}</td></tr>
          <tr><td>Other Costs</td><td>${money(breakdown.supplies + breakdown.other)}</td></tr>
          <tr class="report-total"><td>Total Expenses</td><td>${money(breakdown.total)}</td></tr>
          <tr class="report-total"><td>Net Profit</td><td>${money(netProfit)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="owner-report-section">
      <h2>Paid Booking Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Guest</th>
            <th>Channel</th>
            <th>Check-in</th>
            <th>Nights</th>
            <th>Accommodation Fees</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          ${
            paidBookings.length
              ? paidBookings
                  .map(
                    (booking) => `
                      <tr>
                        <td>${escapeHtml(booking.guest)}</td>
                        <td>${escapeHtml(booking.channel)}</td>
                        <td>${shortDate(booking.arrival)}</td>
                        <td>${booking.nights}</td>
                        <td>${money(booking.revenue)}</td>
                        <td>${money(balanceFor(booking))}</td>
                      </tr>
                    `,
                  )
                  .join("")
              : `<tr><td colspan="6">No paid bookings this month.</td></tr>`
          }
        </tbody>
      </table>
    </section>

    <section class="owner-report-section">
      <h2>Complimentary / Influencer Stays</h2>
      <table>
        <thead>
          <tr>
            <th>Guest</th>
            <th>Check-in</th>
            <th>Nights</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${
            influencerBookings.length
              ? influencerBookings
                  .map(
                    (booking) => `
                      <tr>
                        <td>${escapeHtml(booking.guest)}</td>
                        <td>${shortDate(booking.arrival)}</td>
                        <td>${booking.nights}</td>
                        <td>Recorded only. Excluded from P&L, occupancy, and revenue calculations.</td>
                      </tr>
                    `,
                  )
                  .join("")
              : `<tr><td colspan="4">No complimentary influencer stays recorded this month.</td></tr>`
          }
        </tbody>
      </table>
    </section>
  `;
}

function printOwnerReport() {
  renderOwnerReport();
  document.body.classList.add("printing-owner-report");
  window.print();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = word;
      row += 1;
    } else {
      line = testLine;
    }
  });
  ctx.fillText(line, x, y + row * lineHeight);
}

function openBookingDialog(booking = null) {
  els.dialogTitle.textContent = booking ? "Edit Booking" : "Add Booking";
  els.bookingId.value = booking?.id || "";
  els.channelInput.value = booking?.channel || "Direct";
  syncBookingChannelChoice();
  if (els.guestTitleInput) els.guestTitleInput.value = booking?.guestTitle === "Ms" ? "Ms" : "Mr";
  els.guestInput.value = booking?.guest || "";
  els.contactInput.value = booking?.contact || "";
  els.excludeCalculationsInput.checked = Boolean(booking?.excludeFromCalculations);
  els.arrivalInput.value = booking?.arrival || `${selectedMonth}-01`;
  els.nightsInput.value = booking?.nights || 1;
  els.revenueInput.value = booking?.revenue || 0;
  els.paidInput.value = booking?.paid || 0;
  els.depositAmountInput.value = booking?.depositAmount ?? defaultDepositForChannel(els.channelInput.value);
  els.depositPaidInput.checked = Boolean(booking?.depositPaid);
  els.depositRefundedInput.checked = Boolean(booking?.depositRefunded);
  if (!booking) applyChannelDepositDefault(true);
  els.dialog.showModal();
}

function defaultDocumentDraft() {
  const today = isoDate(new Date());
  return normalizeDocument({
    type: "Quotation",
    issuer: "Sunrise Villa Ventures",
    date: today,
    status: "Draft",
    bookingType: "Direct Booking",
    guestName: "",
    billTo: "",
    propertyName: "Sunrise Villa",
    checkIn: today,
    checkOut: isoDate(addDays(new Date(), 1)),
    nights: 1,
    accommodationFee: 0,
    securityDeposit: 500,
    remarks: "",
    payments: [],
  });
}

function formDocument() {
  const raw = {
    id: els.documentId.value || crypto.randomUUID(),
    type: els.docType.value,
    issuer: els.docIssuer.value,
    date: els.docDate.value || isoDate(new Date()),
    status: els.docStatus.value,
    bookingType: els.docBookingType.value,
    guestName: els.docGuestName.value.trim(),
    billTo: els.docBillTo.value.trim(),
    propertyName: els.docProperty.value.trim(),
    checkIn: els.docCheckIn.value || isoDate(new Date()),
    checkOut: els.docCheckOut.value || isoDate(addDays(new Date(), 1)),
    nights: Number(els.docNights.value || 1),
    accommodationFee: Number(els.docAccommodationFee.value || 0),
    securityDeposit: Number(els.docDepositAmount.value || 0),
    remarks: els.docRemarks.value.trim(),
    payments: els.docType.value === "Official Receipt" ? paymentRowsFromForm() : [],
  };
  const existing = documents.find((doc) => doc.id === raw.id);
  return normalizeDocument({
    ...raw,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function fillDocumentForm(doc) {
  const normalized = normalizeDocument(doc);
  els.documentId.value = normalized.id;
  els.docType.value = normalized.type;
  els.docIssuer.value = normalized.issuer;
  els.docDate.value = normalized.date;
  els.docStatus.value = normalized.status;
  els.docBookingType.value = normalized.bookingType;
  els.docGuestName.value = normalized.guestName;
  els.docBillTo.value = normalized.billTo;
  els.docProperty.value = normalized.propertyName;
  els.docCheckIn.value = normalized.checkIn;
  els.docCheckOut.value = normalized.checkOut;
  els.docNights.value = normalized.nights;
  els.docAccommodationFee.value = normalized.accommodationFee;
  els.docDepositAmount.value = normalized.securityDeposit;
  els.docRemarks.value = normalized.remarks;
  renderPaymentRows(normalized.payments.length ? normalized.payments : [normalizePayment({})]);
  updateReceiptVisibility();
  renderDocumentPreview(normalized);
}

function paymentRowsFromForm() {
  return [...els.paymentRows.querySelectorAll(".payment-row")]
    .map((row) =>
      normalizePayment({
        mode: row.querySelector("[data-payment-mode]")?.value,
        reference: row.querySelector("[data-payment-reference]")?.value,
        date: row.querySelector("[data-payment-date]")?.value,
        amount: row.querySelector("[data-payment-amount]")?.value,
      }),
    )
    .filter((payment) => payment.mode || payment.reference || payment.amount);
}

function renderPaymentRows(payments = [normalizePayment({})]) {
  els.paymentRows.innerHTML = payments
    .map(
      (payment, index) => `
        <div class="payment-row">
          <label>Payment Mode
            <input data-payment-mode value="${escapeHtml(payment.mode)}" placeholder="Bank transfer, cash, card" />
          </label>
          <label>Reference No.
            <input data-payment-reference value="${escapeHtml(payment.reference)}" placeholder="Transaction ID" />
          </label>
          <label>Transaction Date
            <input data-payment-date type="date" value="${escapeHtml(payment.date)}" />
          </label>
          <label>Amount Received
            <input data-payment-amount type="number" min="0" step="0.01" value="${Number(payment.amount || 0)}" />
          </label>
          <button class="small-action danger" type="button" data-remove-payment="${index}">Remove</button>
        </div>
      `,
    )
    .join("");
}

function updateReceiptVisibility() {
  const isReceipt = els.docType.value === "Official Receipt";
  els.receiptPaymentSection.hidden = !isReceipt;
  if (isReceipt && !els.paymentRows.children.length) renderPaymentRows([normalizePayment({})]);
}

function syncDocumentDates() {
  const checkIn = els.docCheckIn.value;
  const checkOut = els.docCheckOut.value;
  if (!checkIn || !checkOut) return;
  const nights = nightsBetween(checkIn, checkOut);
  if (nights > 0) els.docNights.value = nights;
}

function syncDocumentCheckout() {
  const checkIn = els.docCheckIn.value;
  const nights = Number(els.docNights.value || 0);
  if (!checkIn || nights < 1) return;
  els.docCheckOut.value = isoDate(addDays(dateObj(checkIn), nights));
}

function renderDocumentPreview(doc = formDocument()) {
  const normalized = normalizeDocument(doc);
  const issuer = issuers[normalized.issuer] || issuers["Sunrise Villa Ventures"];
  const isReceipt = normalized.type === "Official Receipt";
  const totalPayments = paymentTotalFor(normalized);
  const balance = Math.max(0, normalized.totalAmount - totalPayments);
  els.documentCodePreview.textContent = normalized.code;
  els.documentPreview.innerHTML = `
    <div class="doc-paper-head">
      <div>
        <h2>${escapeHtml(normalized.issuer)}</h2>
        ${issuer.registration ? `<p>Business Registration No.: ${escapeHtml(issuer.registration)}</p>` : ""}
        ${issuer.address ? `<p>${escapeHtml(issuer.address)}</p>` : ""}
        ${[issuer.contact, issuer.email].filter(Boolean).length ? `<p>${[issuer.contact, issuer.email].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : ""}
      </div>
      <div class="doc-title-box">
        <span>${escapeHtml(normalized.type)}</span>
        <strong>${escapeHtml(normalized.code)}</strong>
        <small>${shortDate(normalized.date)}</small>
      </div>
    </div>

    <div class="doc-info-grid">
      <section>
        <h4>Bill To</h4>
        <p><strong>${escapeHtml(normalized.guestName || "Guest Name")}</strong></p>
        <p>${escapeHtml(normalized.billTo || normalized.guestName || "-")}</p>
      </section>
      <section>
        <h4>Booking Details</h4>
        <p><strong>${escapeHtml(normalized.propertyName || "-")}</strong></p>
        <p>${shortDate(normalized.checkIn)} to ${shortDate(normalized.checkOut)}</p>
        <p>${normalized.nights} night${normalized.nights === 1 ? "" : "s"}</p>
      </section>
    </div>

    <table class="doc-item-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Accommodation Fee</td>
          <td>${money(normalized.accommodationFee)}</td>
        </tr>
        <tr>
          <td>Refundable Damage Security Deposit</td>
          <td>${money(normalized.securityDeposit)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th>Total Amount</th>
          <th>${money(normalized.totalAmount)}</th>
        </tr>
      </tfoot>
    </table>

    ${
      isReceipt
        ? `
          <section class="doc-payment-section">
            <h4>Payment Received</h4>
            <table class="doc-item-table compact-doc-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Reference No.</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${
                  normalized.payments.length
                    ? normalized.payments
                        .map(
                          (payment) => `
                            <tr>
                              <td>${escapeHtml(payment.mode || "-")}</td>
                              <td>${escapeHtml(payment.reference || "-")}</td>
                              <td>${payment.date ? shortDate(payment.date) : "-"}</td>
                              <td>${money(payment.amount)}</td>
                            </tr>
                          `,
                        )
                        .join("")
                    : `<tr><td colspan="4">No payment transaction entered.</td></tr>`
                }
              </tbody>
              <tfoot>
                <tr>
                  <th colspan="3">Total Received</th>
                  <th>${money(totalPayments)}</th>
                </tr>
                <tr>
                  <th colspan="3">Balance</th>
                  <th>${money(balance)}</th>
                </tr>
              </tfoot>
            </table>
          </section>
        `
        : ""
    }

    <section class="doc-remarks">
      <h4>Remarks</h4>
      <p>${escapeHtml(normalized.remarks || "-")}</p>
    </section>

    <div class="doc-signatures">
      <div>
        <span></span>
        <strong>Prepared by</strong>
      </div>
      <div>
        <span></span>
        <strong>${isReceipt ? "Received by" : "Accepted by"}</strong>
      </div>
    </div>
  `;
}

function renderDocuments() {
  if (!els.documentForm) return;
  updateReceiptVisibility();
  const current = formDocument();
  els.documentCodePreview.textContent = current.code;
  renderDocumentArchive();
}

function saveCurrentDocument() {
  if (!els.documentForm.reportValidity()) return;
  const doc = formDocument();
  documents = documents.some((item) => item.id === doc.id) ? documents.map((item) => (item.id === doc.id ? doc : item)) : [doc, ...documents];
  saveDocuments();
  fillDocumentForm(doc);
  renderDocumentArchive();
}

function duplicateCurrentDocument() {
  const source = formDocument();
  const copy = normalizeDocument({
    ...source,
    id: crypto.randomUUID(),
    status: "Draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  fillDocumentForm(copy);
}

function openSavedDocument(id) {
  const doc = documents.find((item) => item.id === id);
  if (doc) fillDocumentForm(doc);
}

function duplicateSavedDocument(id) {
  const doc = documents.find((item) => item.id === id);
  if (!doc) return;
  fillDocumentForm(
    normalizeDocument({
      ...doc,
      id: crypto.randomUUID(),
      status: "Draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
}

function deleteSavedDocument(id) {
  const doc = documents.find((item) => item.id === id);
  if (!window.confirm(`Delete ${doc?.code || "this document"}?`)) return;
  documents = documents.filter((item) => item.id !== id);
  saveDocuments();
  renderDocumentArchive();
}

function printDocumentPreview() {
  if (!els.documentForm.reportValidity()) return;
  renderDocumentPreview(formDocument());
  document.body.classList.add("printing-document");
  window.print();
}

function renderDocumentArchive() {
  if (!els.documentArchiveRows) return;
  const search = els.documentSearch?.value.trim().toLowerCase() || "";
  const type = els.documentTypeFilter?.value || "All";
  const filtered = documents
    .filter((doc) => {
      const haystack = `${doc.code} ${doc.type} ${doc.issuer} ${doc.guestName} ${doc.billTo} ${doc.propertyName} ${doc.checkIn} ${doc.checkOut}`.toLowerCase();
      if (type !== "All" && doc.type !== type) return false;
      return !search || haystack.includes(search);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  els.documentArchiveRows.innerHTML = filtered.length
    ? filtered
        .map(
          (doc) => `
            <tr>
              <td><strong>${escapeHtml(doc.code)}</strong><br><span class="table-muted">${shortDate(doc.date)}</span></td>
              <td>${escapeHtml(doc.type)}</td>
              <td>${escapeHtml(issuers[doc.issuer]?.code || doc.issuer)}</td>
              <td>${escapeHtml(doc.guestName || "-")}</td>
              <td>${escapeHtml(doc.billTo || "-")}</td>
              <td>${shortDate(doc.checkIn)}<br><span class="table-muted">${doc.nights} night${doc.nights === 1 ? "" : "s"}</span></td>
              <td>${money(doc.totalAmount)}</td>
              <td><span class="doc-status ${documentStatusClass(doc.status)}">${escapeHtml(doc.status)}</span></td>
              <td class="actions">
                <button class="small-action" type="button" data-open-document="${doc.id}">Open</button>
                <button class="small-action" type="button" data-duplicate-document="${doc.id}">Duplicate</button>
                <button class="small-action" type="button" data-print-document="${doc.id}">Print</button>
                <button class="small-action danger" type="button" data-delete-document="${doc.id}">Delete</button>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="9" class="empty-row">No saved documents yet.</td></tr>`;
}

function renderTaxPlan() {
  if (!els.taxYearInput) return;
  const year = Number(taxPlan.year || currentYear());
  const sdnStart = taxPlan.sdnStart || `${year}-06`;
  const enterpriseRevenue = revenueForPeriod(year, sdnStart, "before");
  const sdnRevenue = revenueForPeriod(year, sdnStart, "after");
  const enterpriseExpenses = Number(taxPlan.enterpriseExpenses || 0);
  const sdnExpenses = Number(taxPlan.sdnExpenses || 0);
  const monthlySalary = Number(taxPlan.monthlySalary || 0);
  const personalReliefs = Number(taxPlan.personalReliefs || 0);
  const salaryMonths = salaryMonthsForPlan(year, sdnStart);
  const annualSalary = monthlySalary * salaryMonths;
  const enterpriseProfit = Math.max(0, enterpriseRevenue - enterpriseExpenses);
  const sdnProfit = Math.max(0, sdnRevenue - sdnExpenses - annualSalary);
  const companyTax = companyTaxEstimate(sdnProfit);
  const personalTaxable = Math.max(0, enterpriseProfit + annualSalary - personalReliefs);
  const personalTax = personalTaxEstimate(personalTaxable);

  els.taxYearInput.value = year;
  els.sdnStartInput.value = sdnStart;
  els.enterpriseExpenseInput.value = enterpriseExpenses;
  els.sdnExpenseInput.value = sdnExpenses;
  els.salaryInput.value = monthlySalary;
  els.personalReliefInput.value = personalReliefs;
  els.taxNoteBooks.checked = Boolean(taxPlan.notes?.books);
  els.taxNoteSalary.checked = Boolean(taxPlan.notes?.salary);
  els.taxNoteCp204.checked = Boolean(taxPlan.notes?.cp204);
  els.taxNoteDocs.checked = Boolean(taxPlan.notes?.docs);

  els.enterpriseProfitOut.textContent = money(enterpriseProfit);
  els.enterpriseRevenueOut.textContent = `Accommodation fees: ${money(enterpriseRevenue)}`;
  els.sdnProfitOut.textContent = money(sdnProfit);
  els.sdnRevenueOut.textContent = `Accommodation fees: ${money(sdnRevenue)}`;
  els.salaryOut.textContent = money(annualSalary);
  els.salaryMonthsOut.textContent = `${salaryMonths} month${salaryMonths === 1 ? "" : "s"} planned`;
  els.totalTaxOut.textContent = money(companyTax + personalTax);
  els.sdnGrossOut.textContent = money(sdnRevenue);
  els.sdnExpenseOut.textContent = money(sdnExpenses);
  els.salaryDeductionOut.textContent = money(annualSalary);
  els.companyTaxOut.textContent = money(companyTax);
  els.personalEnterpriseOut.textContent = money(enterpriseProfit);
  els.personalSalaryOut.textContent = money(annualSalary);
  els.reliefOut.textContent = money(personalReliefs);
  els.personalTaxOut.textContent = money(personalTax);
}

function renderAll() {
  els.monthPicker.value = selectedMonth;
  renderCalendar();
  renderDetails();
  renderDashboard();
  renderBookingsTable();
  renderMessageGenerator();
  renderBackupStatus();
  renderDocuments();
  renderTaxPlan();
  setupDashboardToggles();
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
    renderAll();
  });
});

els.monthPicker.addEventListener("change", () => {
  selectedMonth = els.monthPicker.value;
  renderAll();
});

els.prevMonth.addEventListener("click", () => {
  const [year, month] = selectedMonth.split("-").map(Number);
  selectedMonth = isoDate(new Date(year, month - 2, 1)).slice(0, 7);
  renderAll();
});

els.nextMonth.addEventListener("click", () => {
  const [year, month] = selectedMonth.split("-").map(Number);
  selectedMonth = isoDate(new Date(year, month, 1)).slice(0, 7);
  renderAll();
});

document.querySelector("#openAddBooking").addEventListener("click", () => openBookingDialog());
document.querySelector("#addFromTable").addEventListener("click", () => openBookingDialog());
document.querySelector("#closeBookingDialog")?.addEventListener("click", () => els.dialog.close());
document.querySelector("#cancelBookingDialog")?.addEventListener("click", () => els.dialog.close());
els.addFromBookingsGuide?.addEventListener("click", () => openBookingDialog());
els.showDashboardSections?.addEventListener("click", () => {
  appSettings = { ...appSettings, dashboardHidden: {} };
  saveAppSettings();
  applyDashboardToggles();
});

document.querySelectorAll("[data-form-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    els.channelInput.value = button.dataset.formChannel;
    syncBookingChannelChoice();
    applyChannelDepositDefault();
  });
});
els.excludeCalculationsInput?.addEventListener("change", applyExcludedBookingDefaults);

els.form.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const id = els.bookingId.value || crypto.randomUUID();
  const excluded = els.excludeCalculationsInput.checked;
  const nextBooking = {
    id,
    channel: els.channelInput.value,
    guestTitle: els.guestTitleInput?.value === "Ms" ? "Ms" : "Mr",
    guest: els.guestInput.value.trim(),
    contact: els.contactInput.value.trim(),
    excludeFromCalculations: excluded,
    arrival: els.arrivalInput.value,
    nights: Number(els.nightsInput.value),
    revenue: excluded ? 0 : Number(els.revenueInput.value),
    paid: excluded ? 0 : Number(els.paidInput.value),
    depositAmount: excluded ? 0 : Number(els.depositAmountInput.value || 0),
    depositPaid: excluded ? false : els.depositPaidInput.checked,
    depositRefunded: excluded ? false : els.depositPaidInput.checked && els.depositRefundedInput.checked,
  };

  bookings = bookings.some((booking) => booking.id === id)
    ? bookings.map((booking) => (booking.id === id ? nextBooking : booking))
    : [...bookings, nextBooking];

  selectedMonth = nextBooking.arrival.slice(0, 7);
  saveBookings();
  els.dialog.close();
  renderAll();
});

els.bookingRows.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const booking = bookings.find((item) => item.id === editId);
    if (booking) openBookingDialog(booking);
  }
  if (deleteId) {
    const booking = bookings.find((item) => item.id === deleteId);
    if (!window.confirm(`Delete booking for ${booking?.guest || "this guest"}?`)) return;
    bookings = bookings.filter((item) => item.id !== deleteId);
    saveBookings();
    renderAll();
  }
});

els.bookingRows.addEventListener("change", (event) => {
  const fullReceivedId = event.target.dataset.fullReceived;
  if (fullReceivedId) setFullReceived(fullReceivedId, event.target.checked);
  const refundId = event.target.dataset.refundToggle;
  if (refundId) setDepositRefunded(refundId, event.target.checked);
});

els.detailsList.addEventListener("change", (event) => {
  const fullReceivedId = event.target.dataset.fullReceived;
  if (fullReceivedId) setFullReceived(fullReceivedId, event.target.checked);
  const refundId = event.target.dataset.refundToggle;
  if (refundId) setDepositRefunded(refundId, event.target.checked);
});

els.upcomingRows.addEventListener("change", (event) => {
  const fullReceivedId = event.target.dataset.fullReceived;
  if (fullReceivedId) setFullReceived(fullReceivedId, event.target.checked);
  const refundId = event.target.dataset.refundToggle;
  if (refundId) setDepositRefunded(refundId, event.target.checked);
});

els.downloadQuickView.addEventListener("click", () => {
  const canvas = drawQuickViewImage();
  const link = document.createElement("a");
  link.download = `sunrise-villa-${selectedMonth}-quick-view.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

document.querySelector("#exportJson").addEventListener("click", () => {
  downloadBackup();
});

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelector("#exportSheets").addEventListener("click", () => {
  const headers = [
    "Channel",
    "Record Type",
    "Guest Title",
    "Guest Name",
    "Guest Contact",
    "Prefix",
    "Arrival",
    "Nights",
    "Departure",
    "Accommodation Fees",
    "Damage Deposit Amount",
    "Total Amount to Receive",
    "Amount Received",
    "Amount Received Excluding Deposit",
    "Damage Deposit Paid",
    "Damage Deposit Refunded",
    "Balance",
  ];
  const rows = bookings
    .slice()
    .sort((a, b) => a.arrival.localeCompare(b.arrival))
    .map((booking) => [
      booking.channel,
      isExcludedBooking(booking) ? "Influencer / Complimentary" : "Financial",
      booking.guestTitle,
      booking.guest,
      booking.contact,
      prefixFor(booking.guest),
      booking.arrival,
      booking.nights,
      departureFor(booking),
      booking.revenue,
      booking.depositAmount,
      totalToReceiveFor(booking),
      booking.paid,
      accommodationPaidFor(booking),
      booking.depositPaid ? "Yes" : "No",
      booking.depositRefunded ? "Yes" : "No",
      balanceFor(booking),
    ]);
  downloadCsv("sunrise-villa-google-sheets-export.csv", [headers, ...rows]);
});

document.querySelector("#importJson").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  restoreAppData(parsed);
  event.target.value = "";
});

[els.bookingSearch, els.channelFilter, els.paymentFilter, els.depositFilter].forEach((control) => {
  control?.addEventListener("input", renderBookingsTable);
  control?.addEventListener("change", renderBookingsTable);
});

[
  els.expenseCleaning,
  els.expenseUtilities,
  els.expenseMaintenance,
  els.expenseSupplies,
  els.expensePlatform,
  els.expenseOther,
  els.expenseNotes,
].forEach((control) => {
  control?.addEventListener("input", () => {
    const current = profitMonth(selectedMonth);
    saveSelectedProfitMonth({
      ...current,
      cleaning: Number(els.expenseCleaning.value || 0),
      utilities: Number(els.expenseUtilities.value || 0),
      maintenance: Number(els.expenseMaintenance.value || 0),
      supplies: Number(els.expenseSupplies.value || 0),
      platform: Number(els.expensePlatform.value || 0),
      other: Number(els.expenseOther.value || 0),
      notes: els.expenseNotes.value,
    });
    renderDashboard();
  });
});

els.addOneOffCost?.addEventListener("click", () => {
  const current = profitMonth(selectedMonth);
  saveSelectedProfitMonth({
    ...current,
    oneOffCosts: [...current.oneOffCosts, normalizeOneOffCost({ category: "Groceries", description: "", amount: 0 })],
  });
  renderDashboard();
  document.querySelector(".one-off-block")?.setAttribute("open", "");
});

els.oneOffCostList?.addEventListener("change", (event) => {
  const receiptId = event.target.dataset.receiptUpload;
  if (receiptId) {
    const file = event.target.files?.[0];
    if (!file) return;
    receiptImageFromFile(file)
      .then((receiptImage) => {
        const current = profitMonth(selectedMonth);
        saveSelectedProfitMonth({
          ...current,
          oneOffCosts: current.oneOffCosts.map((cost) => (cost.id === receiptId ? normalizeOneOffCost({ ...cost, receiptImage, receiptName: file.name }) : cost)),
        });
        renderDashboard();
        document.querySelector(".one-off-block")?.setAttribute("open", "");
      })
      .catch((error) => window.alert(error.message || "Could not attach receipt image."));
    return;
  }
  const id = event.target.dataset.oneOffId;
  const field = event.target.dataset.oneOffField;
  if (!id || !field) return;
  const current = profitMonth(selectedMonth);
  saveSelectedProfitMonth({
    ...current,
    oneOffCosts: current.oneOffCosts.map((cost) =>
      cost.id === id
        ? normalizeOneOffCost({
            ...cost,
            [field]: field === "amount" ? Number(event.target.value || 0) : event.target.value,
          })
        : cost,
    ),
  });
  renderDashboard();
  document.querySelector(".one-off-block")?.setAttribute("open", "");
});

els.oneOffCostList?.addEventListener("click", (event) => {
  const receiptId = event.target.dataset.removeReceipt;
  if (receiptId) {
    const current = profitMonth(selectedMonth);
    saveSelectedProfitMonth({
      ...current,
      oneOffCosts: current.oneOffCosts.map((cost) => (cost.id === receiptId ? normalizeOneOffCost({ ...cost, receiptImage: "", receiptName: "" }) : cost)),
    });
    renderDashboard();
    document.querySelector(".one-off-block")?.setAttribute("open", "");
    return;
  }
  const id = event.target.dataset.deleteOneOff;
  if (!id) return;
  const current = profitMonth(selectedMonth);
  saveSelectedProfitMonth({
    ...current,
    oneOffCosts: current.oneOffCosts.filter((cost) => cost.id !== id),
  });
  renderDashboard();
  document.querySelector(".one-off-block")?.setAttribute("open", "");
});

els.backupNow?.addEventListener("click", downloadBackup);

els.restoreBackup?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  restoreAppData(JSON.parse(text));
  event.target.value = "";
});

els.messageBookingSelect?.addEventListener("change", () => fillMessageFromBooking(true));

[els.messageGuestTitle, els.messageGuestName, els.messagePhone, els.messageSecurityCode, els.messageCheckinTime, els.messageAddress].forEach((control) => {
  control?.addEventListener("input", renderCheckinMessage);
  control?.addEventListener("change", renderCheckinMessage);
});

els.copyCheckinMessage?.addEventListener("click", async () => {
  renderCheckinMessage();
  try {
    await navigator.clipboard.writeText(els.checkinMessagePreview.value);
    els.copyCheckinMessage.textContent = "Copied";
    window.setTimeout(() => {
      els.copyCheckinMessage.textContent = "Copy";
    }, 1200);
  } catch {
    els.checkinMessagePreview.select();
    document.execCommand("copy");
  }
});

els.openWhatsappMessage?.addEventListener("click", () => {
  renderCheckinMessage();
  const phone = formatPhoneForWhatsapp(els.messagePhone.value);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(els.checkinMessagePreview.value)}`
    : `https://wa.me/?text=${encodeURIComponent(els.checkinMessagePreview.value)}`;
  window.open(url, "_blank");
});

els.addCommitment?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  appSettings = {
    ...appSettings,
    commitments: [
      ...(appSettings.commitments || []),
      normalizeCommitment({ name: "New Commitment", amount: 0, category: "Other", expires: "" }),
    ],
  };
  saveAppSettings();
  renderDashboard();
  const drawer = document.querySelector(".commitments-block");
  if (drawer) drawer.open = true;
});

els.commitmentList?.addEventListener("change", (event) => {
  const id = event.target.dataset.commitmentId;
  const field = event.target.dataset.commitmentField;
  if (!id || !field) return;
  appSettings = {
    ...appSettings,
    commitments: (appSettings.commitments || []).map((commitment) =>
      commitment.id === id ? normalizeCommitment({ ...commitment, [field]: field === "amount" ? Number(event.target.value || 0) : event.target.value }) : commitment,
    ),
  };
  saveAppSettings();
  renderDashboard();
});

els.commitmentList?.addEventListener("click", (event) => {
  const id = event.target.dataset.deleteCommitment;
  if (!id) return;
  appSettings = {
    ...appSettings,
    commitments: (appSettings.commitments || []).filter((commitment) => commitment.id !== id),
  };
  saveAppSettings();
  renderDashboard();
});

els.annualCommitmentRows?.addEventListener("change", (event) => {
  const id = event.target.dataset.annualCommitmentId;
  const monthValue = event.target.dataset.annualMonth;
  if (!id || !monthValue) return;
  appSettings = {
    ...appSettings,
    commitments: (appSettings.commitments || []).map((commitment) =>
      commitment.id === id
        ? normalizeCommitment({
            ...commitment,
            overrides: { ...(commitment.overrides || {}), [monthValue]: Number(event.target.value || 0) },
          })
        : commitment,
    ),
  };
  saveAppSettings();
  renderDashboard();
  const drawer = document.querySelector(".commitments-block");
  if (drawer) drawer.open = true;
  const annual = document.querySelector(".annual-commitments");
  if (annual) annual.open = true;
});

document.querySelector("#dashboardView")?.addEventListener("click", (event) => {
  const key = event.target.dataset.dashboardToggle;
  if (!key) return;
  appSettings = {
    ...appSettings,
    dashboardHidden: {
      ...(appSettings.dashboardHidden || {}),
      [key]: !appSettings.dashboardHidden?.[key],
    },
  };
  saveAppSettings();
  applyDashboardToggles();
});

[
  els.docType,
  els.docIssuer,
  els.docDate,
  els.docStatus,
  els.docBookingType,
  els.docGuestName,
  els.docBillTo,
  els.docProperty,
  els.docAccommodationFee,
  els.docDepositAmount,
  els.docRemarks,
].forEach((control) => {
  control?.addEventListener("input", () => renderDocumentPreview(formDocument()));
  control?.addEventListener("change", () => {
    updateReceiptVisibility();
    renderDocumentPreview(formDocument());
  });
});

els.docCheckIn?.addEventListener("change", () => {
  syncDocumentCheckout();
  renderDocumentPreview(formDocument());
});

els.docCheckOut?.addEventListener("change", () => {
  syncDocumentDates();
  renderDocumentPreview(formDocument());
});

els.docNights?.addEventListener("input", () => {
  syncDocumentCheckout();
  renderDocumentPreview(formDocument());
});

els.paymentRows?.addEventListener("input", () => renderDocumentPreview(formDocument()));

els.paymentRows?.addEventListener("click", (event) => {
  const removeIndex = event.target.dataset.removePayment;
  if (removeIndex === undefined) return;
  const payments = paymentRowsFromForm();
  payments.splice(Number(removeIndex), 1);
  renderPaymentRows(payments.length ? payments : [normalizePayment({})]);
  renderDocumentPreview(formDocument());
});

els.addPaymentRow?.addEventListener("click", () => {
  renderPaymentRows([...paymentRowsFromForm(), normalizePayment({})]);
});

els.generateDocument?.addEventListener("click", () => renderDocumentPreview(formDocument()));
els.saveDocument?.addEventListener("click", saveCurrentDocument);
els.newDocument?.addEventListener("click", () => fillDocumentForm(defaultDocumentDraft()));
els.duplicateDocument?.addEventListener("click", duplicateCurrentDocument);
els.printDocument?.addEventListener("click", printDocumentPreview);
els.printOwnerReport?.addEventListener("click", printOwnerReport);
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-document", "printing-owner-report");
});

[els.documentSearch, els.documentTypeFilter].forEach((control) => {
  control?.addEventListener("input", renderDocumentArchive);
  control?.addEventListener("change", renderDocumentArchive);
});

els.documentArchiveRows?.addEventListener("click", (event) => {
  const openId = event.target.dataset.openDocument;
  const duplicateId = event.target.dataset.duplicateDocument;
  const deleteId = event.target.dataset.deleteDocument;
  const printId = event.target.dataset.printDocument;
  if (openId) openSavedDocument(openId);
  if (duplicateId) duplicateSavedDocument(duplicateId);
  if (deleteId) deleteSavedDocument(deleteId);
  if (printId) {
    openSavedDocument(printId);
    printDocumentPreview();
  }
});

[els.taxYearInput, els.sdnStartInput, els.enterpriseExpenseInput, els.sdnExpenseInput, els.salaryInput, els.personalReliefInput].forEach((control) => {
  control?.addEventListener("input", () => {
    taxPlan = {
      ...taxPlan,
      year: Number(els.taxYearInput.value || currentYear()),
      sdnStart: els.sdnStartInput.value || `${els.taxYearInput.value || currentYear()}-06`,
      enterpriseExpenses: Number(els.enterpriseExpenseInput.value || 0),
      sdnExpenses: Number(els.sdnExpenseInput.value || 0),
      monthlySalary: Number(els.salaryInput.value || 0),
      personalReliefs: Number(els.personalReliefInput.value || 0),
    };
    saveTaxPlan();
    renderTaxPlan();
  });
});

[els.taxNoteBooks, els.taxNoteSalary, els.taxNoteCp204, els.taxNoteDocs].forEach((control) => {
  control?.addEventListener("change", () => {
    taxPlan = {
      ...taxPlan,
      notes: {
        books: els.taxNoteBooks.checked,
        salary: els.taxNoteSalary.checked,
        cp204: els.taxNoteCp204.checked,
        docs: els.taxNoteDocs.checked,
      },
    };
    saveTaxPlan();
  });
});

fillDocumentForm(defaultDocumentDraft());
setView(activeView);
renderAll();
