const STORAGE_KEY = "sunrise-villa-bookings-v1";
const TAX_PLAN_KEY = "sunrise-villa-tax-plan-v1";
const DOCUMENTS_KEY = "sunrise-villa-documents-v1";
const PROFIT_KEY = "sunrise-villa-profit-v1";
const SETTINGS_KEY = "sunrise-villa-settings-v1";
const RECOVERY_KEY = "sunrise-villa-recovery-v1";
const RECOVERY_SESSION_KEY = "sunrise-villa-recovery-session-v1";
const MAX_RECOVERY_SNAPSHOTS = 8;
const SUPABASE_URL = "https://nigzeyamrzrozftbujmm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Hs81yUXxrGC4ydDZ7nWGsQ_MlCtxqED";
const CLOUD_DATA_TYPE = "full_app_backup";
const CLOUD_RECORD_KEY = "sunrise-villa-main";
const APP_VERSION = "2026.05.15";

// --- "Keep me signed in" storage adapter (the only user-approved edit to the frozen auth layer) ---
// Routes the Supabase session token to localStorage (persists across browser restarts) when the
// "keep me signed in" box is checked, or sessionStorage (clears on browser close) when not.
// No new storage key is introduced: the default is inferred from where an existing token already lives.
let svRememberSession = true;
try {
  const svInLocal = Object.keys(window.localStorage).some((k) => k.includes("-auth-token"));
  const svInSession = Object.keys(window.sessionStorage).some((k) => k.includes("-auth-token"));
  if (svInSession && !svInLocal) svRememberSession = false;
} catch (_) {}
const svAuthStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const primary = svRememberSession ? window.localStorage : window.sessionStorage;
      const secondary = svRememberSession ? window.sessionStorage : window.localStorage;
      primary.setItem(key, value);
      secondary.removeItem(key);
    } catch (_) {}
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch (_) {}
  },
};

let supabaseClient = null;
let cloudUser = null;
let cloudRecordId = "";
let cloudKnownUpdatedAt = ""; // last updated_at we loaded/saved — used for optimistic-lock conflict detection
let cloudSaveTimer = null;
let isRestoringCloudData = false;

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

const GUIDE_LINK = "https://bit.ly/sunrisevilla-guest-guide";
const taxExpenseCategories = [
  "Housekeeping",
  "Maintenance",
  "Electricity & Water",
  "Groceries",
  "Gas",
  "Supplies",
  "Repairs",
  "Credit Card / Loans",
  "Bank Charges",
  "Marketing",
  "Accounting & Tax",
  "Insurance",
  "Licences & Fees",
  "Other",
];

const defaultMessageTemplates = {
  quote:
    "Hi {guest},\n\nThanks for your interest in Sunrise Villa. Here are the payment details for your stay:\n\nBooking Details:\nCheck-in: {quoteCheckIn}\nCheck-out: {quoteCheckOut}\n\nPayment Breakdown:\nAccommodation Fee: {quoteAccommodationFee}\nCleaning Fee: {quoteCleaningFee}\nDamage Security Deposit: {quoteDamageDeposit} (Refundable)\nSpecial Discount: {quoteDiscount}\nTotal: {quoteActualCharge} + {quoteDamageDeposit}\n\nPayment Terms:\n• A 50% Deposit (Non-Refundable) + Damage Security Deposit (Refundable) are required to secure your booking.\n• Full payment must be made 28 days before arrival.\n\n{bankDetails}\n\nKindly send the transfer receipt via WhatsApp for confirmation. Thanks",
  checkin:
    "Hi {guest},\n\nWe are excited to welcome you to Sunrise Villa. Here are the arrival details for a smooth check-in:\n\n#Confirmation Code: {code}\n\n#Address: {address}\n\n#Google Maps Link: {mapsLink}\n\n#Finding Us: We are located right behind McDonald's at Genting Sempah R&R.\n\n#Steps to Access:\n1. Drive up the slope to the guardhouse.\n2. Show your reservation details and Confirmation Code to the guards.\n3. Fill in the required guest information at the guardhouse.\n4. Continue driving until you reach the top T-junction. Look for the coconut tree as your landmark.\n\n#Guest Guide (MUST READ): {guideLink}\n\nPlease read the guest guide before arrival. Thank you, and we look forward to hosting you.",
  guide:
    "Hi {guest},\n\nHere is the Sunrise Villa Guest Guide for your stay:\n\n{guideLink}\n\nPlease read it before arrival so your check-in and stay will be smooth. Thank you.",
  reminder:
    "Hi {guest},\n\nA friendly reminder that your stay is coming up in about a week. Here are your details again:\n\nCheck-in time: {checkinTime}\nAddress: {address}\nGoogle Maps: {mapsLink}\n\nGuest Guide (please read before arrival): {guideLink}\n\nKindly confirm your expected arrival time and final guest count. We look forward to hosting you!",
  deposit:
    "Hi {guest},\n\nTo confirm your booking at Sunrise Villa, kindly proceed with the deposit/payment to secure your dates:\n\n{bankDetails}\n\nKindly send the transfer receipt via WhatsApp once done. Thank you!",
  midstay:
    "Hi {guest},\n\nJust checking in — is everything going well with your stay at Sunrise Villa? If you need anything at all, please let us know and we'll be happy to help. Enjoy your time! 🌅",
  review:
    "Hi {guest},\n\nThank you so much for staying at Sunrise Villa — it was a pleasure hosting you! If you enjoyed your stay, we'd be really grateful if you could leave us a short review. It genuinely helps us a lot. Hope to welcome you back soon! 🌅",
  inquiry:
    "Hi {guest},\n\nThanks for your interest in Sunrise Villa! 🌅 Let me check availability for your dates and I'll get right back to you with the full details. 😊",
};

let bookings = loadBookings();
let documents = loadDocuments();
let profitData = loadProfitData();
let appSettings = loadAppSettings();
let selectedMonth = initialMonth();
let activeView = "today";
let pendingTaxExpenseAttachment = null;
let removePendingTaxExpenseAttachment = false;

const els = {
  monthPicker: document.querySelector("#monthPicker"),
  monthButtonGrid: document.querySelector("#monthButtonGrid"),
  monthYearLabel: document.querySelector("#monthYearLabel"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  pageTitle: document.querySelector("#pageTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  detailMonth: document.querySelector("#detailMonth"),
  bookingCount: document.querySelector("#bookingCount"),
  detailsList: document.querySelector("#detailsList"),
  quickColumnControls: document.querySelector("#quickColumnControls"),
  downloadQuickView: document.querySelector("#downloadQuickView"),
  bookingRows: document.querySelector("#bookingRows"),
  bookingsTable: document.querySelector("#bookingsTable"),
  bookingTableTitle: document.querySelector("#bookingTableTitle"),
  bookingColumnControls: document.querySelector("#bookingColumnControls"),
  bookingMonthFilter: document.querySelector("#bookingMonthFilter"),
  bookingSearch: document.querySelector("#bookingSearch"),
  channelFilter: document.querySelector("#channelFilter"),
  paymentFilter: document.querySelector("#paymentFilter"),
  depositFilter: document.querySelector("#depositFilter"),
  contactFilter: document.querySelector("#contactFilter"),
  summaryRows: document.querySelector("#summaryRows"),
  upcomingRows: document.querySelector("#upcomingRows"),
  incomeChart: document.querySelector("#incomeChart"),
  channelList: document.querySelector("#channelList"),
  channelMixTitle: document.querySelector("#channelMixTitle"),
  sideRevenue: document.querySelector("#sideRevenue"),
  sideTotalToReceive: document.querySelector("#sideTotalToReceive"),
  sideRefundPending: document.querySelector("#sideRefundPending"),
  sideBalance: document.querySelector("#sideBalance"),
  sideUpcomingPayments: document.querySelector("#sideUpcomingPayments"),
  sideNights: document.querySelector("#sideNights"),
  backupStatus: document.querySelector("#backupStatus"),
  backupNow: document.querySelector("#backupNow"),
  restoreBackup: document.querySelector("#restoreBackup"),
  syncCloudNow: document.querySelector("#syncCloudNow"),
  recoverySnapshotSelect: document.querySelector("#recoverySnapshotSelect"),
  restoreRecoverySnapshot: document.querySelector("#restoreRecoverySnapshot"),
  downloadRecoverySnapshot: document.querySelector("#downloadRecoverySnapshot"),
  recoveryStatus: document.querySelector("#recoveryStatus"),
  dataHealthStatus: document.querySelector("#dataHealthStatus"),
  dataHealthLastSync: document.querySelector("#dataHealthLastSync"),
  dataHealthBackup: document.querySelector("#dataHealthBackup"),
  dataHealthRecords: document.querySelector("#dataHealthRecords"),
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
  guestEmailInput: document.querySelector("#guestEmailInput"),
  incidentLogInput: document.querySelector("#incidentLogInput"),
  villaInput: document.querySelector("#villaInput"),
  statusInput: document.querySelector("#statusInput"),
  arrivalInput: document.querySelector("#arrivalInput"),
  nightsInput: document.querySelector("#nightsInput"),
  nightsManualInput: document.querySelector("#nightsManualInput"),
  checkoutEcho: document.querySelector("#checkoutEcho"),
  revenueInput: document.querySelector("#revenueInput"),
  paidInput: document.querySelector("#paidInput"),
  depositAmountInput: document.querySelector("#depositAmountInput"),
  depositPaidInput: document.querySelector("#depositPaidInput"),
  depositRefundedInput: document.querySelector("#depositRefundedInput"),
  airbnbEmailInput: document.querySelector("#airbnbEmailInput"),
  airbnbAutofillBtn: document.querySelector("#airbnbAutofillBtn"),
  airbnbAutofillStatus: document.querySelector("#airbnbAutofillStatus"),
  excludeCalculationsInput: document.querySelector("#excludeCalculationsInput"),
  addFromBookingsGuide: document.querySelector("#addFromBookingsGuide"),
  messageBookingSelect: document.querySelector("#messageBookingSelect"),
  messageGuestTitle: document.querySelector("#messageGuestTitle"),
  messageGuestName: document.querySelector("#messageGuestName"),
  messagePhone: document.querySelector("#messagePhone"),
  messageSecurityCode: document.querySelector("#messageSecurityCode"),
  messageCheckinTime: document.querySelector("#messageCheckinTime"),
  messageAddress: document.querySelector("#messageAddress"),
  messageMapsLink: document.querySelector("#messageMapsLink"),
  messageGuideLink: document.querySelector("#messageGuideLink"),
  messageBankDetails: document.querySelector("#messageBankDetails"),
  icalSunriseUrl: document.querySelector("#icalSunriseUrl"),
  icalWindmillUrl: document.querySelector("#icalWindmillUrl"),
  icalSyncBtn: document.querySelector("#icalSyncBtn"),
  icalSyncStatus: document.querySelector("#icalSyncStatus"),
  checkinTemplateInput: document.querySelector("#checkinTemplateInput"),
  guideTemplateInput: document.querySelector("#guideTemplateInput"),
  quoteTemplateInput: document.querySelector("#quoteTemplateInput"),
  quoteGuestTitle: document.querySelector("#quoteGuestTitle"),
  quoteGuestName: document.querySelector("#quoteGuestName"),
  quotePhone: document.querySelector("#quotePhone"),
  quoteCheckIn: document.querySelector("#quoteCheckIn"),
  quoteCheckOut: document.querySelector("#quoteCheckOut"),
  quoteWeekdayNights: document.querySelector("#quoteWeekdayNights"),
  quoteWeekendNights: document.querySelector("#quoteWeekendNights"),
  quoteHolidayNights: document.querySelector("#quoteHolidayNights"),
  quoteWeekdayRate: document.querySelector("#quoteWeekdayRate"),
  quoteWeekendRate: document.querySelector("#quoteWeekendRate"),
  quoteHolidayRate: document.querySelector("#quoteHolidayRate"),
  quoteCleaningFee: document.querySelector("#quoteCleaningFee"),
  quoteDamageDeposit: document.querySelector("#quoteDamageDeposit"),
  quoteActualCharge: document.querySelector("#quoteActualCharge"),
  quoteDiscount: document.querySelector("#quoteDiscount"),
  quoteStandardTotal: document.querySelector("#quoteStandardTotal"),
  quoteGuestTotal: document.querySelector("#quoteGuestTotal"),
  quoteTotalNights: document.querySelector("#quoteTotalNights"),
  messageCodeDisplay: document.querySelector("#messageCodeDisplay"),
  copyCheckinMessage: document.querySelector("#copyCheckinMessage"),
  copyGuideMessage: document.querySelector("#copyGuideMessage"),
  copyQuoteMessage: document.querySelector("#copyQuoteMessage"),
  ackInquiry: document.querySelector("#ackInquiry"),
  aiQuestion: document.querySelector("#aiQuestion"),
  aiDraft: document.querySelector("#aiDraft"),
  aiDraftBtn: document.querySelector("#aiDraftBtn"),
  aiDraftStatus: document.querySelector("#aiDraftStatus"),
  aiPhone: document.querySelector("#aiPhone"),
  aiCopyBtn: document.querySelector("#aiCopyBtn"),
  aiSendBtn: document.querySelector("#aiSendBtn"),
  aiVillaName: document.querySelector("#aiVillaName"),
  openWhatsappMessage: document.querySelector("#openWhatsappMessage"),
  openGuideMessage: document.querySelector("#openGuideMessage"),
  openReminderMessage: document.querySelector("#openReminderMessage"),
  copyReminderMessage: document.querySelector("#copyReminderMessage"),
  reminderTemplateInput: document.querySelector("#reminderTemplateInput"),
  openQuoteMessage: document.querySelector("#openQuoteMessage"),
  messageCopyStatus: document.querySelector("#messageCopyStatus"),
  manualCopyBox: document.querySelector("#manualCopyBox"),
  manualCopyText: document.querySelector("#manualCopyText"),
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
  docBillAddress: document.querySelector("#docBillAddress"),
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
  taxExpenseForm: document.querySelector("#taxExpenseForm"),
  taxExpenseId: document.querySelector("#taxExpenseId"),
  taxExpenseDate: document.querySelector("#taxExpenseDate"),
  taxExpenseEntity: document.querySelector("#taxExpenseEntity"),
  taxExpenseProperty: document.querySelector("#taxExpenseProperty"),
  taxExpenseCategory: document.querySelector("#taxExpenseCategory"),
  taxExpenseAmount: document.querySelector("#taxExpenseAmount"),
  taxExpenseType: document.querySelector("#taxExpenseType"),
  taxExpenseDeductible: document.querySelector("#taxExpenseDeductible"),
  taxExpenseVendor: document.querySelector("#taxExpenseVendor"),
  taxExpensePayment: document.querySelector("#taxExpensePayment"),
  taxExpenseClaimStatus: document.querySelector("#taxExpenseClaimStatus"),
  taxExpenseReceipt: document.querySelector("#taxExpenseReceipt"),
  taxExpenseAttachment: document.querySelector("#taxExpenseAttachment"),
  taxExpenseAttachmentStatus: document.querySelector("#taxExpenseAttachmentStatus"),
  removeTaxExpenseAttachment: document.querySelector("#removeTaxExpenseAttachment"),
  taxExpenseReviewed: document.querySelector("#taxExpenseReviewed"),
  taxExpenseNotes: document.querySelector("#taxExpenseNotes"),
  taxExpenseSummary: document.querySelector("#taxExpenseSummary"),
  taxExpenseRows: document.querySelector("#taxExpenseRows"),
  taxExpenseTableTitle: document.querySelector("#taxExpenseTableTitle"),
  taxExpenseYearFilter: document.querySelector("#taxExpenseYearFilter"),
  taxExpenseMonthFilter: document.querySelector("#taxExpenseMonthFilter"),
  taxExpenseCategoryFilter: document.querySelector("#taxExpenseCategoryFilter"),
  taxExpenseReceiptFilter: document.querySelector("#taxExpenseReceiptFilter"),
  taxExpenseSearch: document.querySelector("#taxExpenseSearch"),
  clearTaxExpense: document.querySelector("#clearTaxExpense"),
  exportTaxExpensesExcel: document.querySelector("#exportTaxExpensesExcel"),
  exportTaxExpensesPdf: document.querySelector("#exportTaxExpensesPdf"),
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
    id: safeRecordId(booking.id),
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
    whatsappSent: Boolean(booking.whatsappSent),
    // --- additive automation/CRM fields (preserved; default-safe for legacy bookings) ---
    villa: booking.villa === "Windmill" ? "Windmill" : "Sunrise",
    status: ["inquiry", "quoted", "confirmed", "in-house", "checked-out"].includes(booking.status) ? booking.status : "confirmed",
    guestEmail: String(booking.guestEmail || ""),
    checkinSentAt: booking.checkinSentAt || null,
    reminderSentAt: booking.reminderSentAt || null,
    incidentLog: String(booking.incidentLog || ""),
    sentLog: booking.sentLog && typeof booking.sentLog === "object" ? booking.sentLog : {}, // { type: 'YYYY-MM-DD' } — which nudges were sent today
  };
}

function saveBookings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  scheduleCloudSave();
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
    expenses: [],
    notes: {
      books: false,
      salary: false,
      cp204: false,
      docs: false,
    },
  };
}

function normalizeTaxExpense(expense = {}) {
  const attachment =
    expense.attachment && typeof expense.attachment === "object"
      ? {
          name: String(expense.attachment.name || ""),
          type: String(expense.attachment.type || ""),
          dataUrl: safeDataUrl(expense.attachment.dataUrl, ["data:image/", "data:application/pdf"]),
          attachedAt: expense.attachment.attachedAt || new Date().toISOString(),
        }
      : null;
  return {
    id: safeRecordId(expense.id),
    date: String(expense.date || isoDate(new Date())),
    entity: ["Enterprise", "Sdn. Bhd.", "Personal / Owner"].includes(expense.entity) ? expense.entity : "Enterprise",
    property: ["Sunrise Villa", "Windmill Villa", "Shared"].includes(expense.property) ? expense.property : "Sunrise Villa",
    category: taxExpenseCategories.includes(expense.category) ? expense.category : "Other",
    type: expense.type === "Recurring" ? "Recurring" : "One-off",
    deductible: ["Deductible", "Partially deductible", "Not deductible", "Ask accountant"].includes(expense.deductible) ? expense.deductible : "Deductible",
    vendor: String(expense.vendor || ""),
    payment: String(expense.payment || "Bank Transfer"),
    claimStatus: ["Paid by business", "Paid personally", "Reimbursed", "Not reimbursed"].includes(expense.claimStatus) ? expense.claimStatus : "Paid by business",
    receipt: String(expense.receipt || ""),
    attachment,
    reviewed: Boolean(expense.reviewed),
    notes: String(expense.notes || ""),
    amount: Number(expense.amount || 0),
    createdAt: expense.createdAt || new Date().toISOString(),
    updatedAt: expense.updatedAt || new Date().toISOString(),
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
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeTaxExpense) : fallback.expenses,
      notes: { ...fallback.notes, ...(parsed.notes || {}) },
    };
  } catch {
    return fallback;
  }
}

function saveTaxPlan() {
  localStorage.setItem(TAX_PLAN_KEY, JSON.stringify(taxPlan));
  scheduleCloudSave();
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
    id: safeRecordId(doc.id),
    type,
    issuer,
    date: String(doc.date || isoDate(new Date())),
    status: String(doc.status || "Draft"),
    bookingType,
    guestName: String(doc.guestName || ""),
    billTo: String(doc.billTo || ""),
    billAddress: String(doc.billAddress || ""),
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
  scheduleCloudSave();
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
    id: safeRecordId(cost.id),
    category: String(cost.category || "Supplies"),
    description: String(cost.description || ""),
    amount: Number(cost.amount || 0),
    receiptImage: safeDataUrl(cost.receiptImage, ["data:image/"]),
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
  scheduleCloudSave();
}

function defaultAppSettings() {
  return {
    lastBackupAt: "",
    lastCloudSyncAt: "",
    activeVilla: "Sunrise",
    guestProfiles: {}, // CRM: keyed by normalized phone/name -> { notes, tags:[], blocklist, consent, displayName }
    guidebook: {}, // per-villa guest guidebook content -> { Sunrise: {...}, Windmill: {...} }
    dashboardHidden: {},
    dashboardMode: "monthly",
    bookingMonthFilter: "Selected",
    bookingColumns: {
      record: false,
      prefix: false,
      contact: true,
      full: true,
      refund: true,
    },
    bookingColumnWidths: {},
    quickColumns: {
      deposit: false,
      total: false,
      full: false,
      refund: false,
    },
    quickColumnWidths: {},
    commitments: defaultCommitments,
    message: {
      checkinTime: "3:00 PM",
      address: "No. 59, Jalan Rimba 2, Taman Puncak Rimba, 28750 Bentong, Pahang",
      mapsLink: "https://g.co/kgs/DYpYPSh",
      guideLink: GUIDE_LINK,
      bankDetails: "",
      templates: defaultMessageTemplates,
      // Per-villa override block. Blank by default ON PURPOSE so Windmill never inherits
      // Sunrise's address, directions, bank details or templates. Filled in when on Windmill.
      windmill: {
        checkinTime: "3:00 PM",
        address: "",
        mapsLink: "",
        guideLink: "",
        bankDetails: "",
        templates: { quote: "", checkin: "", guide: "", reminder: "" },
      },
    },
    ical: { sources: [], imported: [], lastSyncedAt: "", lastStatus: "", lastError: "" },
  };
}

function loadAppSettings() {
  const fallback = defaultAppSettings();
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored);
    const result = {
      ...fallback,
      ...parsed,
      activeVilla: parsed.activeVilla === "Windmill" ? "Windmill" : "Sunrise",
      guestProfiles: { ...fallback.guestProfiles, ...(parsed.guestProfiles || {}) },
      guidebook: { ...fallback.guidebook, ...(parsed.guidebook || {}) },
      dashboardHidden: { ...fallback.dashboardHidden, ...(parsed.dashboardHidden || {}) },
      dashboardMode: parsed.dashboardMode === "annual" ? "annual" : "monthly",
      bookingMonthFilter: parsed.bookingMonthFilter || fallback.bookingMonthFilter,
      bookingColumns: { ...fallback.bookingColumns, ...(parsed.bookingColumns || {}) },
      bookingColumnWidths: { ...fallback.bookingColumnWidths, ...(parsed.bookingColumnWidths || {}) },
      quickColumns: { ...fallback.quickColumns, ...(parsed.quickColumns || {}) },
      quickColumnWidths: { ...fallback.quickColumnWidths, ...(parsed.quickColumnWidths || {}) },
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments.map(normalizeCommitment) : fallback.commitments,
      message: {
        ...fallback.message,
        ...(parsed.message || {}),
        templates: { ...defaultMessageTemplates, ...(parsed.message?.templates || {}) },
        windmill: {
          ...fallback.message.windmill,
          ...(parsed.message?.windmill || {}),
          templates: { ...fallback.message.windmill.templates, ...(parsed.message?.windmill?.templates || {}) },
        },
      },
      ical: { ...fallback.ical, ...(parsed.ical || {}) },
    };
    // One-time migration: lift bank details out of the (now public-sanitized) quote
    // template into a private field so they live only in your synced data, never in source.
    if (!result.message.bankDetails) {
      const savedQuote = result.message.templates?.quote || "";
      const match = savedQuote.match(/Bank Details:[\s\S]*?Account Number:[^\n]*/i);
      result.message.bankDetails = match ? match[0] : "";
    }
    return result;
  } catch {
    return fallback;
  }
}

function saveAppSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  scheduleCloudSave();
}

function normalizeCommitment(commitment = {}) {
  return {
    id: safeRecordId(commitment.id),
    name: String(commitment.name || "New fixed cost"),
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

function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function safeDataUrl(value, allowedPrefixes = []) {
  const url = String(value || "").trim();
  const lower = url.toLowerCase();
  return allowedPrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase())) ? url : "";
}

function safeRecordId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9_-]{3,120}$/i.test(id) ? id : crypto.randomUUID();
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

// Villa scope (Sunrise ⇄ Windmill): every display/financial calc flows through this,
// so a Windmill booking can NEVER count toward Sunrise's revenue and vice versa.
function scopedBookings() {
  const villa = appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise";
  return bookings.filter((booking) => (booking.villa === "Windmill" ? "Windmill" : "Sunrise") === villa);
}

function calculationBookings(list = scopedBookings()) {
  return list.filter((booking) => !isExcludedBooking(booking));
}

// --- Guest CRM (improvement: repeat-guest detection + lightweight profiles) ---
// Derived stats come straight from bookings; only notes/tags/blocklist/consent are stored
// (in appSettings.guestProfiles, keyed by normalized phone or name — additive, cloud-synced).
function guestKeyFor(booking) {
  const phone = formatPhoneForWhatsapp(booking?.contact);
  if (phone) return "p:" + phone;
  const name = String(booking?.guest || "").trim().toLowerCase();
  return name ? "n:" + name : "";
}
function guestProfile(key) {
  return (appSettings.guestProfiles && appSettings.guestProfiles[key]) || {};
}
function setGuestProfile(key, patch) {
  if (!key) return;
  const next = { ...guestProfile(key), ...patch };
  appSettings = { ...appSettings, guestProfiles: { ...(appSettings.guestProfiles || {}), [key]: next } };
  saveAppSettings();
}
function guestStatsList(list = scopedBookings()) {
  const map = new Map();
  [...list].sort((a, b) => a.arrival.localeCompare(b.arrival)).forEach((b) => {
    const key = guestKeyFor(b);
    if (!key) return;
    if (!map.has(key)) map.set(key, { key, name: b.guest, phone: formatPhoneForWhatsapp(b.contact), email: b.guestEmail || "", stays: 0, revenue: 0, nights: 0, firstStay: b.arrival, lastStay: b.arrival, channels: new Set() });
    const g = map.get(key);
    g.stays += 1;
    g.revenue += isExcludedBooking(b) ? 0 : Number(b.revenue || 0);
    g.nights += Number(b.nights || 0);
    if (b.arrival < g.firstStay) g.firstStay = b.arrival;
    if (b.arrival > g.lastStay) g.lastStay = b.arrival;
    if (b.guest) g.name = b.guest;
    if (!g.phone && formatPhoneForWhatsapp(b.contact)) g.phone = formatPhoneForWhatsapp(b.contact);
    if (!g.email && b.guestEmail) g.email = b.guestEmail;
    g.channels.add(b.channel);
  });
  return [...map.values()].map((g) => ({ ...g, channels: [...g.channels] }));
}
function guestStayTotal(booking, list = scopedBookings()) {
  const key = guestKeyFor(booking);
  if (!key) return 1;
  return list.reduce((n, b) => n + (guestKeyFor(b) === key ? 1 : 0), 0);
}
function returningBadgeHtml(booking, list = scopedBookings()) {
  const total = guestStayTotal(booking, list);
  if (total <= 1) return "";
  return `<span class="returning-badge" title="Returning guest — ${total} stays on record">★ ${total}× guest</span>`;
}
function blocklistBadgeHtml(booking) {
  return guestProfile(guestKeyFor(booking)).blocklist ? `<span class="blocklist-badge" title="Flagged guest">⚑ flagged</span>` : "";
}

function renderGuests() {
  const host = document.querySelector("#guestsList");
  const summary = document.querySelector("#guestsSummary");
  if (!host) return;
  const search = (document.querySelector("#guestSearch")?.value || "").trim().toLowerCase();
  const returningOnly = !!document.querySelector("#guestReturningOnly")?.checked;
  let guests = guestStatsList().sort((a, b) => b.stays - a.stays || b.revenue - a.revenue || (a.name || "").localeCompare(b.name || ""));
  const totalGuests = guests.length;
  const returningCount = guests.filter((g) => g.stays > 1).length;
  if (summary) {
    const repeatRate = totalGuests ? Math.round((returningCount / totalGuests) * 100) : 0;
    summary.innerHTML = `
      <div class="guest-stat"><strong>${totalGuests}</strong><span>guests</span></div>
      <div class="guest-stat"><strong>${returningCount}</strong><span>returning</span></div>
      <div class="guest-stat"><strong>${repeatRate}%</strong><span>repeat rate</span></div>`;
  }
  if (returningOnly) guests = guests.filter((g) => g.stays > 1);
  if (search) guests = guests.filter((g) => `${g.name} ${g.phone} ${g.email}`.toLowerCase().includes(search));
  if (!guests.length) {
    host.innerHTML = `<div class="today-empty">No guests match. Add bookings with a name or phone to build your guest book for ${escapeHtml(activeVillaKey())}.</div>`;
    return;
  }
  host.innerHTML = guests
    .map((g) => {
      const p = guestProfile(g.key);
      const tags = Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || "";
      return `
      <article class="guest-card${p.blocklist ? " flagged" : ""}" data-guest-key="${escapeHtml(g.key)}">
        <div class="guest-card-head">
          <div class="guest-card-name">
            <strong>${escapeHtml(g.name || "—")}</strong>
            ${g.stays > 1 ? `<span class="returning-badge">★ ${g.stays}× guest</span>` : ""}
            ${p.blocklist ? `<span class="blocklist-badge">⚑ flagged</span>` : ""}
          </div>
          ${g.phone ? `<button class="small-action wa-action" type="button" data-guest-wa="${escapeHtml(g.phone)}" title="Open WhatsApp chat">WhatsApp</button>` : ""}
        </div>
        <div class="guest-card-meta">
          <span>${g.stays} stay${g.stays === 1 ? "" : "s"}</span>
          <span>${g.nights} nights</span>
          <span>LTV ${money(g.revenue)}</span>
          <span>Last ${shortDate(g.lastStay)}</span>
          <span>${escapeHtml(g.channels.join(" / "))}</span>
          ${g.phone ? `<span>${escapeHtml(g.phone)}</span>` : `<span class="contact-missing">no phone</span>`}
          ${g.email ? `<span>${escapeHtml(g.email)}</span>` : ""}
        </div>
        <div class="guest-card-edit">
          <input type="text" data-guest-notes placeholder="Private notes (preferences…)" value="${escapeHtml(p.notes || "")}" aria-label="Notes for ${escapeHtml(g.name || "guest")}" />
          <input type="text" data-guest-tags placeholder="Tags (family, pet…)" value="${escapeHtml(tags)}" aria-label="Tags" />
          <label class="guest-toggle"><input type="checkbox" data-guest-blocklist ${p.blocklist ? "checked" : ""} /> Flag</label>
          <label class="guest-toggle"><input type="checkbox" data-guest-consent ${p.consent ? "checked" : ""} /> Consent</label>
        </div>
      </article>`;
    })
    .join("");
}

// --- Digital guidebook (per villa) ---
function guidebookFor(villa) {
  return (appSettings.guidebook && appSettings.guidebook[villa]) || {};
}
function setGuidebookField(field, value) {
  const villa = activeVillaKey();
  appSettings = { ...appSettings, guidebook: { ...(appSettings.guidebook || {}), [villa]: { ...guidebookFor(villa), [field]: value } } };
  saveAppSettings();
}
function renderGuide() {
  const villa = activeVillaKey();
  const label = document.querySelector("#guideVillaLabel");
  if (label) label.textContent = villa;
  const g = guidebookFor(villa);
  document.querySelectorAll("#guideView [data-guide]").forEach((el) => {
    el.value = g[el.dataset.guide] || "";
  });
}
function guidebookHtml(villa) {
  const g = guidebookFor(villa);
  const block = messageBlockForVilla(villa) || {};
  const section = (title, body) => (body && String(body).trim() ? `<section><h2>${escapeHtml(title)}</h2><p>${escapeMultiline(body)}</p></section>` : "");
  const wifi = g.wifiName || g.wifiPassword
    ? `<section><h2>WiFi</h2><p><strong>Network:</strong> ${escapeHtml(g.wifiName || "—")}<br><strong>Password:</strong> ${escapeHtml(g.wifiPassword || "—")}</p></section>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(villa)} Villa — Guest Guide</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:32px 22px;color:#2a2a2a;line-height:1.55}
    h1{font-size:26px;margin:0 0 2px}.sub{color:#b07a30;font-weight:600;margin:0 0 22px;letter-spacing:.02em}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#c08a3e;border-bottom:1px solid #eee;padding-bottom:6px;margin:24px 0 8px}
    p{margin:0 0 6px;white-space:pre-wrap}@media print{body{padding:0}}</style></head>
    <body>
      <h1>${escapeHtml(villa)} Villa</h1>
      <p class="sub">Guest Guide</p>
      ${section("Welcome", g.welcome)}
      ${section("Address", block.address)}
      ${wifi}
      ${section("Check-in", g.checkin)}
      ${section("Check-out", g.checkout)}
      ${section("House Rules", g.houseRules)}
      ${section("Appliances & How-tos", g.amenities)}
      ${section("Local Recommendations", g.localTips)}
      ${section("Emergency / Host Contact", g.emergency)}
    </body></html>`;
}
function previewGuidebook() {
  const win = window.open("", "_blank");
  if (!win) {
    window.alert("Allow pop-ups to preview the guide.");
    return;
  }
  win.document.write(guidebookHtml(activeVillaKey()));
  win.document.close();
}

// Compliance: Registration of Guests Act 1965 — exportable register of all stays.
function exportGuestRegister() {
  const rows = [["Guest name", "Phone", "Email", "Check-in", "Check-out", "Nights", "Villa", "Channel", "Confirmation code"]];
  [...bookings]
    .sort((a, b) => a.arrival.localeCompare(b.arrival))
    .forEach((b) => {
      rows.push([b.guest || "", b.contact || "", b.guestEmail || "", b.arrival || "", departureFor(b), b.nights || "", b.villa === "Windmill" ? "Windmill" : "Sunrise", b.channel || "", bookingConfirmationCode(b)]);
    });
  downloadCsv(`guest-register-${isoDate(new Date())}.csv`, rows);
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

function whatsappSentControl(booking) {
  return `
    <label class="wa-toggle" title="WhatsApp check-in details sent">
      <input type="checkbox" data-whatsapp-sent="${booking.id}" ${booking.whatsappSent ? "checked" : ""} />
      <span class="sr-only">WhatsApp sent</span>
    </label>
  `;
}

const quickColumnOptions = [
  { key: "guest", label: "Guest", locked: true },
  { key: "type", label: "Type" },
  { key: "checkin", label: "Check-in", locked: true },
  { key: "nights", label: "Nights", locked: true },
  { key: "wa", label: "W/A", locked: true },
  { key: "revenue", label: "Accommodation" },
  { key: "deposit", label: "Deposit" },
  { key: "total", label: "Total" },
  { key: "received", label: "Received" },
  { key: "full", label: "Full received" },
  { key: "balance", label: "Balance", locked: true },
  { key: "refund", label: "Refund" },
];

function isQuickColumnVisible(key) {
  const column = quickColumnOptions.find((item) => item.key === key);
  if (column?.locked) return true;
  return appSettings.quickColumns?.[key] !== false;
}

function quickCell(col, content, extraClass = "") {
  const hidden = isQuickColumnVisible(col) ? "" : " hidden-col";
  return `<td data-col="${col}" class="${`${extraClass}${hidden}`.trim()}">${content}</td>`;
}

function renderQuickColumnControls() {
  if (!els.quickColumnControls) return;
  els.quickColumnControls.innerHTML = quickColumnOptions
    .filter((column) => !column.locked)
    .map(
      (column) => `
        <label class="column-toggle">
          <input type="checkbox" data-quick-column="${column.key}" ${isQuickColumnVisible(column.key) ? "checked" : ""} />
          <span>${column.label}</span>
        </label>
      `,
    )
    .join("");
  document.querySelectorAll("#quickViewTable [data-col]").forEach((cell) => {
    cell.classList.toggle("hidden-col", !isQuickColumnVisible(cell.dataset.col));
  });
  applyTableColumnWidths("#quickViewTable", appSettings.quickColumnWidths || {});
  setupTableColumnResizers("#quickViewTable", "quick");
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

function setWhatsappSent(id, checked) {
  bookings = bookings.map((booking) => (booking.id === id ? { ...booking, whatsappSent: Boolean(checked) } : booking));
  saveBookings();
  renderDetails();
}

// Improvement #2: capture / edit a guest phone inline, no dialog. Saves and re-renders.
function setBookingContact(id, value) {
  const next = String(value || "").trim();
  bookings = bookings.map((booking) => (booking.id === id ? { ...booking, contact: next } : booking));
  saveBookings();
  renderAll();
}

// Improvement #1: stamp a comms timestamp so the "Send today" list self-clears once messaged.
function markBookingMessaged(id, field) {
  const key = field === "reminder" ? "reminderSentAt" : "checkinSentAt";
  const stamp = isoDate(new Date());
  bookings = bookings.map((booking) => (booking.id === id ? { ...booking, [key]: stamp } : booking));
  saveBookings();
  renderToday();
}

// Brief visual "saved" confirmation on a field that persists silently (reuses the calm
// feedback idiom rather than a toast framework). Gated behind prefers-reduced-motion in CSS.
function flashSaved(el) {
  if (!el) return;
  el.classList.add("just-saved");
  window.setTimeout(() => el.classList.remove("just-saved"), 1100);
}

// Record that a Send-today nudge of a given type was sent today, so the list reflects it
// (check-in/mid-stay/review self-clear; deposit stays until paid but shows "requested").
function markNudgeSent(id, type) {
  const stamp = isoDate(new Date());
  bookings = bookings.map((booking) =>
    booking.id === id
      ? { ...booking, sentLog: { ...(booking.sentLog || {}), [type]: stamp }, ...(type === "checkin" ? { checkinSentAt: stamp } : {}) }
      : booking,
  );
  saveBookings();
  renderToday();
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

function shortMonthName(monthIndex) {
  // en-MY renders September as "Sept" (4 chars); normalise to 3-letter for consistency
  return new Date(2026, monthIndex, 1).toLocaleDateString("en-MY", { month: "short" }).replace("Sept", "Sep");
}

function shortDate(iso) {
  return dateObj(iso).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }).replace("Sept", "Sep");
}

function longDate(iso) {
  return dateObj(iso).toLocaleDateString("en-MY", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function quickDate(iso) {
  const date = dateObj(iso);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${date.toLocaleDateString("en-MY", { month: "short" }).replace("Sept", "Sep")} ${day}${suffix}`;
}

function quoteDate(iso) {
  if (!iso) return "-";
  const date = dateObj(iso);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${date.toLocaleDateString("en-MY", { month: "short" }).replace("Sept", "Sep")} ${day}${suffix}, ${date.getFullYear()}`;
}

function prefixFor(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (parts[0] || "").slice(0, 2).toUpperCase();
  // Initials are rendered via innerHTML in several places (avatars, codes); escape
  // so a malicious guest name like "<img…" can never inject markup. Defense-in-depth
  // on top of the CSP, and hardens against null/undefined names.
  return escapeHtml(initials);
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

function syncGuestTitleChoice() {
  document.querySelectorAll("[data-title-choice]").forEach((button) => {
    const isActive = button.dataset.titleChoice === els.guestTitleInput.value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setNightsChoice(value) {
  const numeric = Number(value);
  if (value === "manual" || numeric > 3) {
    els.nightsManualInput?.classList.remove("hidden");
    if (els.nightsManualInput) els.nightsManualInput.value = numeric > 3 ? numeric : els.nightsManualInput.value || 4;
    els.nightsInput.value = els.nightsManualInput?.value || 4;
  } else {
    els.nightsManualInput?.classList.add("hidden");
    if (els.nightsManualInput) els.nightsManualInput.value = "";
    els.nightsInput.value = String(numeric || 1);
  }
  syncNightsChoice();
}

function syncNightsChoice() {
  const value = Number(els.nightsInput.value || 1);
  document.querySelectorAll("[data-nights-choice]").forEach((button) => {
    const choice = button.dataset.nightsChoice;
    const isActive = choice === "manual" ? value > 3 : Number(choice) === value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  updateCheckoutEcho();
}

// Echo the computed check-out date in the booking dialog so off-by-one nights are caught.
function updateCheckoutEcho() {
  if (!els.checkoutEcho) return;
  const arrival = els.arrivalInput?.value;
  const nights = Number(els.nightsInput?.value || 0);
  els.checkoutEcho.textContent = arrival && nights ? `Check-out: ${shortDate(isoDate(addDays(dateObj(arrival), nights)))} · ${nights} night${nights === 1 ? "" : "s"}` : "";
}

function departureFor(booking) {
  return isoDate(addDays(dateObj(booking.arrival), Number(booking.nights) || 0));
}

// When Airbnb releases the host payout: about 24h after the guest's check-in.
// For a 1-night stay that lands on checkout day; for a multi-night stay it's the day
// after check-in. Both work out to arrival + 1 day.
function airbnbReleaseDate(booking) {
  return isoDate(addDays(dateObj(booking.arrival), 1));
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
  return scopedBookings()
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
    today: "Today",
    calendar: "Monthly Calendar",
    dashboard: "Income Dashboard",
    bookings: "Bookings",
    guests: "Guest Book",
    guide: "Digital Guidebook",
    messages: "Guest Messages",
    documents: "Villa Documents",
    tax: "Tax Plan",
  }[view];
}

function setMessageFlow(flow) {
  const mode = flow === "checkin" ? "checkin" : "quote";
  const messagesView = document.querySelector("#messagesView");
  messagesView?.classList.toggle("message-mode-quote", mode === "quote");
  messagesView?.classList.toggle("message-mode-checkin", mode === "checkin");
  document.querySelectorAll("[data-message-flow]").forEach((button) => {
    const active = button.dataset.messageFlow === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (els.messageCopyStatus) {
    els.messageCopyStatus.textContent =
      mode === "quote"
        ? "Quick Quotation is for enquiries before the booking is saved."
        : "Check-in Flow uses confirmed bookings already saved in your database.";
  }
  els.manualCopyBox?.classList.add("hidden");
}

function setTaxInnerTab(mode) {
  const nextMode = mode === "expenses" ? "expenses" : "plan";
  document.querySelectorAll("[data-tax-inner-tab]").forEach((button) => {
    const active = button.dataset.taxInnerTab === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-tax-inner-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.taxInnerPanel === nextMode);
  });
  if (nextMode === "expenses") renderTaxExpenses();
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
  const bookings = scopedBookings();
  const activeVilla = appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise";
  const [year, month] = selectedMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  const todayIso = isoDate(new Date());
  els.calendarGrid.innerHTML = "";

  // De-duplicate the iCal layer: an Airbnb reservation that's already recorded as a
  // real booking would otherwise show twice (the named pill AND a generic "Airbnb · …"
  // pill from the calendar feed). Keep only imported blocks for THIS villa that no real
  // booking overlaps — so each reservation appears once, and the feed now flags only
  // Airbnb stays you haven't entered yet. Render-only; nothing stored is changed.
  const importedBlocks = (appSettings.ical?.imported || []).filter((b) => {
    const villa = b.villa === "Windmill" ? "Windmill" : "Sunrise";
    if (villa !== activeVilla) return false;
    const alreadyRecorded = bookings.some((bk) => b.start < departureFor(bk) && bk.arrival < b.end);
    return !alreadyRecorded;
  });

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
      chip.className = `booking-chip stay-segment clickable ${isExcludedBooking(booking) ? "influencer" : booking.channel.toLowerCase()} ${staySegmentClass(booking, dayIso)} ${label ? "" : "label-hidden"}`;
      chip.dataset.bookingId = booking.id;
      // Channel is already carried by the chip's color + dot, so the in-cell text shows only
      // the guest name (full width = readable). Channel/nights move to the hover title.
      chip.title = `${booking.guest} · ${isExcludedBooking(booking) ? "Influencer" : booking.channel} · ${booking.nights} night${booking.nights === 1 ? "" : "s"} — click to edit`;
      chip.innerHTML = label
        ? `<strong>${escapeHtml(booking.guest)}</strong>`
        : `<span aria-label="${escapeHtml(booking.guest)} ${escapeHtml(booking.channel)} booking">&nbsp;</span>`;
      cell.appendChild(chip);
    });

    if (booked.length > 3) {
      const more = document.createElement("div");
      more.className = "booking-chip";
      more.textContent = `+${booked.length - 3} more`;
      cell.appendChild(more);
    }

    // Imported Airbnb blocks (improvement #5): availability only, not financial bookings.
    // A block covers [start, end) — end is the checkout/exclusive date.
    const importedToday = importedBlocks.filter((b) => b.start <= dayIso && dayIso < b.end);
    importedToday.slice(0, 2).forEach((b) => {
      const chip = document.createElement(b.reservationUrl ? "a" : "div");
      chip.className = "booking-chip airbnb-import";
      if (b.reservationUrl) {
        chip.href = b.reservationUrl;
        chip.target = "_blank";
        chip.rel = "noopener noreferrer";
        chip.title = "Open this reservation in Airbnb";
      }
      chip.innerHTML = `<span>Airbnb · ${escapeHtml(b.villa)}${b.reservationUrl ? " ↗" : ""}</span>`;
      cell.appendChild(chip);
    });

    els.calendarGrid.appendChild(cell);
  }
}

// --- Airbnb calendar sync (improvement #5): pulls blocked dates in via the ical-import Edge Function ---
function icalSourcesFromInputs() {
  const sources = [];
  const s = els.icalSunriseUrl?.value?.trim();
  const w = els.icalWindmillUrl?.value?.trim();
  if (s) sources.push({ villa: "Sunrise", url: s });
  if (w) sources.push({ villa: "Windmill", url: w });
  return sources;
}

function persistIcalSources() {
  appSettings = { ...appSettings, ical: { ...(appSettings.ical || {}), sources: icalSourcesFromInputs() } };
  saveAppSettings();
}

function renderIcalSettings() {
  if (!els.icalSyncStatus) return;
  const ical = appSettings.ical || {};
  const bySrc = {};
  (ical.sources || []).forEach((src) => {
    if (src && src.villa) bySrc[src.villa] = src.url || "";
  });
  if (els.icalSunriseUrl && !els.icalSunriseUrl.value && bySrc.Sunrise) els.icalSunriseUrl.value = bySrc.Sunrise;
  if (els.icalWindmillUrl && !els.icalWindmillUrl.value && bySrc.Windmill) els.icalWindmillUrl.value = bySrc.Windmill;
  const count = (ical.imported || []).length;
  if (ical.lastStatus === "error") {
    els.icalSyncStatus.className = "ical-sync-status err";
    els.icalSyncStatus.textContent = `Sync failed — ${ical.lastError || "try again"}`;
  } else if (ical.lastSyncedAt) {
    const when = new Date(ical.lastSyncedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    els.icalSyncStatus.className = "ical-sync-status ok";
    els.icalSyncStatus.textContent = `✓ Synced ${when} · ${count} dates`;
  } else {
    els.icalSyncStatus.className = "ical-sync-status";
    els.icalSyncStatus.textContent = "Not synced yet";
  }
}

async function syncIcalNow() {
  if (!els.icalSyncStatus) return;
  const sources = icalSourcesFromInputs();
  if (!sources.length) {
    els.icalSyncStatus.className = "ical-sync-status err";
    els.icalSyncStatus.textContent = "Paste your Airbnb .ics link first";
    return;
  }
  if (!supabaseClient) initSupabaseClient();
  if (!supabaseClient) {
    els.icalSyncStatus.className = "ical-sync-status err";
    els.icalSyncStatus.textContent = "Cloud not connected — log in first";
    return;
  }
  persistIcalSources();
  if (els.icalSyncBtn) els.icalSyncBtn.disabled = true;
  els.icalSyncStatus.className = "ical-sync-status";
  els.icalSyncStatus.textContent = "Syncing…";
  try {
    const { data, error } = await supabaseClient.functions.invoke("ical-import", { body: { sources } });
    if (error) throw error;
    const results = Array.isArray(data?.results) ? data.results : [];
    const imported = [];
    const seen = new Set();
    let failed = "";
    for (const r of results) {
      if (!r.ok) {
        failed = r.error || "fetch failed";
        continue;
      }
      for (const ev of r.events || []) {
        const key = `${r.villa}|${ev.uid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        imported.push({ villa: r.villa, uid: ev.uid, start: ev.start, end: ev.end, reservationUrl: ev.reservationUrl || "" });
      }
    }
    appSettings = {
      ...appSettings,
      ical: {
        ...(appSettings.ical || {}),
        sources,
        imported,
        lastSyncedAt: data?.syncedAt || new Date().toISOString(),
        lastStatus: failed ? "error" : "ok",
        lastError: failed,
      },
    };
    saveAppSettings();
    renderAll();
  } catch (e) {
    appSettings = { ...appSettings, ical: { ...(appSettings.ical || {}), lastStatus: "error", lastError: e?.message || "sync failed" } };
    saveAppSettings();
    renderIcalSettings();
  } finally {
    if (els.icalSyncBtn) els.icalSyncBtn.disabled = false;
  }
}

// Auto-sync (improvement #5b): when the dashboard opens and a feed is configured,
// refresh automatically if the last sync is older than ~2 hours — so no manual clicking.
function maybeAutoSyncIcal() {
  const ical = appSettings.ical || {};
  if (!(ical.sources || []).length) return;
  const last = ical.lastSyncedAt ? new Date(ical.lastSyncedAt).getTime() : 0;
  const ageHours = (Date.now() - last) / 3600000;
  if (ageHours >= 2) syncIcalNow();
}

// Villa switch (Sunrise ⇄ Windmill): reflect the active villa on the toggle + body.
function renderVillaSwitch() {
  const active = appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise";
  document.querySelectorAll(".villa-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.villa === active);
  });
  document.body.dataset.villa = active;
}

// --- Booking candidates queue (improvement #6): auto-parsed Airbnb bookings awaiting review ---
let bookingCandidates = [];

async function loadBookingCandidates() {
  if (!supabaseClient || !cloudUser) return;
  try {
    const { data, error } = await supabaseClient
      .from("booking_candidates")
      .select("*")
      .eq("status", "new")
      .order("created_at", { ascending: false });
    if (error) return; // table may not exist yet — fail quietly
    bookingCandidates = Array.isArray(data) ? data : [];
    renderBookingCandidates();
  } catch (e) {}
}

function renderBookingCandidates() {
  const host = document.querySelector("#bookingCandidatesQueue");
  if (!host) return;
  if (!bookingCandidates.length) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <div class="candidates-head">${bookingCandidates.length} new Airbnb booking${bookingCandidates.length === 1 ? "" : "s"} to review</div>
    ${bookingCandidates
      .map(
        (c) => `
      <div class="candidate-row">
        <div class="candidate-info">
          <strong>${escapeHtml(c.guest || "Guest")}</strong>
          <span>${escapeHtml(c.villa || "")} · ${shortDate(c.arrival)} · ${c.nights || "?"} night${Number(c.nights) === 1 ? "" : "s"} · ${c.revenue != null ? money(c.revenue) : "—"}</span>
        </div>
        <div class="candidate-actions">
          <button class="ghost-button compact" data-dismiss-candidate="${escapeHtml(c.id)}" type="button">Dismiss</button>
          <button class="primary-button compact" data-add-candidate="${escapeHtml(c.id)}" type="button">Add booking</button>
        </div>
      </div>`,
      )
      .join("")}
  `;
}

async function importBookingCandidate(id) {
  const c = bookingCandidates.find((x) => x.id === id);
  if (!c) return;
  const booking = normalizeBooking({
    channel: "Airbnb",
    guest: c.guest || "Guest",
    villa: c.villa === "Windmill" ? "Windmill" : "Sunrise",
    arrival: c.arrival || `${selectedMonth}-01`,
    nights: Number(c.nights) || 1,
    revenue: Number(c.revenue) || 0,
    paid: Number(c.revenue) || 0,
    status: "confirmed",
  });
  bookings = [...bookings, booking];
  saveBookings();
  if (supabaseClient) {
    try {
      await supabaseClient.from("booking_candidates").update({ status: "imported" }).eq("id", id);
    } catch (e) {}
  }
  bookingCandidates = bookingCandidates.filter((x) => x.id !== id);
  renderAll();
}

async function dismissBookingCandidate(id) {
  if (supabaseClient) {
    try {
      await supabaseClient.from("booking_candidates").update({ status: "dismissed" }).eq("id", id);
    } catch (e) {}
  }
  bookingCandidates = bookingCandidates.filter((x) => x.id !== id);
  renderBookingCandidates();
}

function renderDetails() {
  const monthBookings = bookingsForMonth(selectedMonth);
  els.detailMonth.textContent = monthLabel(selectedMonth);
  els.bookingCount.textContent = `${monthBookings.length} booking${monthBookings.length === 1 ? "" : "s"}`;
  els.detailsList.innerHTML = "";

  if (!monthBookings.length) {
    els.detailsList.innerHTML = `<div class="empty-state">No bookings for this month.</div>`;
    renderQuickColumnControls();
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentBookings = monthBookings.filter((booking) => dateObj(booking.arrival) <= today && dateObj(departureFor(booking)) > today);
  const upcomingBookings = monthBookings.filter((booking) => dateObj(booking.arrival) > today);
  const pastBookings = monthBookings.filter((booking) => dateObj(departureFor(booking)) <= today);
  const bookingRows = (items) =>
    items
      .map((booking) => {
        const balance = balanceFor(booking);
        return `
          <tr>
            ${quickCell("guest", `
              <div class="guest-cell">
                <span class="guest-code">${prefixFor(booking.guest)}</span>
                <span class="guest-meta">
                  <strong>${escapeHtml(booking.guest)}</strong>
                  <span>${shortDate(departureFor(booking))} out</span>
                </span>
              </div>
            `)}
            ${quickCell("type", channelBadgeFor(booking))}
            ${quickCell("checkin", `<strong>${quickDate(booking.arrival)}</strong>`)}
            ${quickCell("nights", `<strong>${booking.nights}</strong>`)}
            ${quickCell("wa", whatsappSentControl(booking))}
            ${quickCell("revenue", money(booking.revenue), "amount-cell")}
            ${quickCell("deposit", money(booking.depositAmount), "amount-cell")}
            ${quickCell("total", money(totalToReceiveFor(booking)), "amount-cell")}
            ${quickCell("received", money(booking.paid), "amount-cell")}
            ${quickCell("full", fullReceivedControl(booking))}
            ${quickCell("balance", money(balance), `amount-cell ${balance > 0 ? "balance-due" : ""}`)}
            ${quickCell("refund", refundControl(booking))}
          </tr>
        `;
      })
      .join("");

  els.detailsList.innerHTML = `
    <div class="quick-view-card">
      <table class="quick-view-table" id="quickViewTable" aria-label="Quick booking list">
        <thead>
          <tr>
            <th data-col="guest">Guest</th>
            <th data-col="type">Type</th>
            <th data-col="checkin">Check-in</th>
            <th data-col="nights">Nights</th>
            <th data-col="wa">W/A</th>
            <th data-col="revenue">Accommodation Fees</th>
            <th data-col="deposit">Damage Deposit</th>
            <th data-col="total">Total to Receive</th>
            <th data-col="received">Received</th>
            <th data-col="full">Full Received</th>
            <th data-col="balance">Balance</th>
            <th data-col="refund">Refund</th>
          </tr>
        </thead>
        <tbody>
          <tr class="quick-section-row current"><td colspan="12">Current Guests</td></tr>
          ${currentBookings.length ? bookingRows(currentBookings) : `<tr><td colspan="12" class="empty-row">No current guests for this selected month.</td></tr>`}
          <tr class="quick-section-row"><td colspan="12">Upcoming Guests</td></tr>
          ${upcomingBookings.length ? bookingRows(upcomingBookings) : `<tr><td colspan="12" class="empty-row">No upcoming guests for this selected month.</td></tr>`}
          <tr class="quick-section-row past"><td colspan="12">Past Guests</td></tr>
          ${pastBookings.length ? bookingRows(pastBookings) : `<tr><td colspan="12" class="empty-row">No past guests for this selected month.</td></tr>`}
        </tbody>
      </table>
      <div class="quick-summary">
        <div><span>Accommodation Fees</span><strong>${money(monthBookings.reduce((sum, booking) => sum + Number(booking.revenue || 0), 0))}</strong></div>
        <div><span>Total to Receive</span><strong>${money(monthBookings.reduce((sum, booking) => sum + totalToReceiveFor(booking), 0))}</strong></div>
        <div><span>Balance</span><strong>${money(monthBookings.reduce((sum, booking) => sum + balanceFor(booking), 0))}</strong></div>
      </div>
    </div>
  `;
  renderQuickColumnControls();
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
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    bookings,
    documents,
    taxPlan,
    profitData,
    appSettings,
  };
}

function recoveryCounts(data = allAppData()) {
  return {
    bookings: Array.isArray(data.bookings) ? data.bookings.length : 0,
    documents: Array.isArray(data.documents) ? data.documents.length : 0,
    expenses: Array.isArray(data.taxPlan?.expenses) ? data.taxPlan.expenses.length : 0,
  };
}

function hasMeaningfulAppData(data = allAppData()) {
  const counts = recoveryCounts(data);
  return counts.bookings > 0 || counts.documents > 0 || counts.expenses > 0;
}

function incomingDataLooksSmaller(incomingData, currentData = allAppData()) {
  const incoming = recoveryCounts(incomingData);
  const current = recoveryCounts(currentData);
  return (
    (current.bookings > 0 && incoming.bookings < current.bookings) ||
    (current.documents > 0 && incoming.documents < current.documents) ||
    (current.expenses > 0 && incoming.expenses < current.expenses)
  );
}

function loadRecoverySnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecoverySnapshots(snapshots) {
  let next = snapshots.slice(0, MAX_RECOVERY_SNAPSHOTS);
  while (next.length) {
    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(next));
      return true;
    } catch {
      next = next.slice(0, -1);
    }
  }
  return false;
}

function createRecoverySnapshot(reason, data = allAppData()) {
  if (!hasMeaningfulAppData(data)) return false;
  const snapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason,
    appVersion: APP_VERSION,
    counts: recoveryCounts(data),
    data,
  };
  const snapshots = [snapshot, ...loadRecoverySnapshots().filter((item) => item?.id !== snapshot.id)];
  const saved = writeRecoverySnapshots(snapshots);
  renderRecoverySnapshots();
  return saved;
}

function recoverySnapshotLabel(snapshot) {
  const date = new Date(snapshot.createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const counts = snapshot.counts || recoveryCounts(snapshot.data || {});
  return `${dateLabel} · ${snapshot.reason || "Safety copy"} · ${counts.bookings || 0} bookings · ${counts.documents || 0} docs`;
}

function renderRecoverySnapshots() {
  if (!els.recoverySnapshotSelect) return;
  const snapshots = loadRecoverySnapshots();
  els.recoverySnapshotSelect.innerHTML = snapshots.length
    ? snapshots.map((snapshot) => `<option value="${snapshot.id}">${escapeHtml(recoverySnapshotLabel(snapshot))}</option>`).join("")
    : `<option value="">No recovery point saved</option>`;
  if (els.recoveryStatus) {
    els.recoveryStatus.textContent = snapshots.length
      ? `${snapshots.length} recovery point${snapshots.length === 1 ? "" : "s"} saved in this browser.`
      : "No recovery point yet.";
  }
}

function selectedRecoverySnapshot() {
  const id = els.recoverySnapshotSelect?.value;
  return loadRecoverySnapshots().find((snapshot) => snapshot.id === id);
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function createStartupRecoverySnapshot() {
  if (sessionStorage.getItem(RECOVERY_SESSION_KEY)) {
    renderRecoverySnapshots();
    return;
  }
  sessionStorage.setItem(RECOVERY_SESSION_KEY, "1");
  createRecoverySnapshot("Before this session loaded");
}

function cloudEls() {
  return {
    panel: document.querySelector("#cloudAuthPanel"),
    appShell: document.querySelector("#appShell"),
    form: document.querySelector("#cloudLoginForm"),
    email: document.querySelector("#cloudEmail"),
    password: document.querySelector("#cloudPassword"),
    logout: document.querySelector("#cloudLogout"),
    title: document.querySelector("#cloudStatusTitle"),
    text: document.querySelector("#cloudStatusText"),
    dot: document.querySelector("#cloudStatusDot"),
    remember: document.querySelector("#cloudRemember"),
    passwordToggle: document.querySelector("#cloudPasswordToggle"),
    greeting: document.querySelector("#cloudGreeting"),
    dateLine: document.querySelector("#cloudDateLine"),
  };
}

function setCloudStatus(mode, title, text) {
  const ui = cloudEls();
  ui.panel?.dataset && (ui.panel.dataset.status = mode);
  if (ui.title) ui.title.textContent = title;
  if (ui.text) ui.text.textContent = text;
  renderDataHealth(mode);
}

function syncCloudAuthUi() {
  const ui = cloudEls();
  if (!ui.form || !ui.logout) return;
  const isLoggedIn = Boolean(cloudUser);
  ui.appShell?.classList.toggle("private-locked", !isLoggedIn);
  if (ui.appShell) ui.appShell.hidden = !isLoggedIn;
  ui.form.classList.toggle("hidden", isLoggedIn);
  ui.logout.classList.toggle("hidden", !isLoggedIn);
  if (isLoggedIn) {
    setCloudStatus("connected", "Cloud storage connected", `Signed in as ${cloudUser.email}. Changes save to Supabase automatically.`);
  } else {
    setCloudStatus("offline", "Cloud storage not connected", "Log in to save bookings, documents, expenses, and settings to Supabase.");
  }
}

function initSupabaseClient() {
  if (!window.supabase?.createClient) {
    setCloudStatus("error", "Supabase library not loaded", "Check your internet connection, then refresh this page.");
    return null;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: svAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return supabaseClient;
}

function scheduleCloudSave() {
  if (isRestoringCloudData || !supabaseClient || !cloudUser) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(saveCloudSnapshot, 700);
}

async function saveCloudSnapshot(force = false) {
  if (!supabaseClient || !cloudUser) return false;
  const stamp = new Date().toISOString();

  // Optimistic concurrency: before a normal auto-save, check whether the row changed on
  // another device since we last loaded/saved it. If so, HOLD the save instead of
  // clobbering the whole dataset. "Sync cloud now" forces past this. Both timestamps come
  // from PostgREST responses, so the comparison is exact (no format-mismatch false alarms).
  if (cloudRecordId && !force && cloudKnownUpdatedAt) {
    const { data: current, error: checkError } = await supabaseClient
      .from("app_data")
      .select("updated_at")
      .eq("id", cloudRecordId)
      .maybeSingle();
    if (!checkError && current && current.updated_at && current.updated_at !== cloudKnownUpdatedAt) {
      createRecoverySnapshot("Save held — data changed on another device");
      setCloudStatus(
        "error",
        "Save paused — changed on another device",
        "Another device updated your data, so this save was held to avoid overwriting it. Your edits are safe on this device. Reload to pull the other version, or click ‘Sync cloud now’ to force-save this one.",
      );
      return false;
    }
  }

  const payload = {
    user_id: cloudUser.id,
    data_type: CLOUD_DATA_TYPE,
    record_key: CLOUD_RECORD_KEY,
    data: allAppData(),
    updated_at: stamp,
  };
  const request = cloudRecordId
    ? supabaseClient.from("app_data").update(payload).eq("id", cloudRecordId).select("id, updated_at").single()
    : supabaseClient.from("app_data").insert(payload).select("id, updated_at").single();

  const { data, error } = await request;
  if (error) {
    setCloudStatus("error", "Cloud save failed", error.message || "Supabase could not save the latest changes.");
    return false;
  }
  cloudRecordId = data?.id || cloudRecordId;
  cloudKnownUpdatedAt = data?.updated_at || stamp;
  appSettings = { ...appSettings, lastCloudSyncAt: stamp };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  setCloudStatus("connected", "Cloud storage connected", `Saved to Supabase at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  return true;
}

async function loadCloudSnapshot() {
  if (!supabaseClient || !cloudUser) return;
  setCloudStatus("syncing", "Loading cloud data", "Checking Supabase for your latest Sunrise Villa data.");
  const { data, error } = await supabaseClient
    .from("app_data")
    .select("id, data, updated_at")
    .eq("data_type", CLOUD_DATA_TYPE)
    .eq("record_key", CLOUD_RECORD_KEY)
    .eq("user_id", cloudUser.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    setCloudStatus("error", "Cloud load failed", error.message || "Supabase could not load your saved data.");
    return;
  }

  if (data?.data) {
    cloudRecordId = data.id;
    cloudKnownUpdatedAt = data.updated_at || "";
    if (incomingDataLooksSmaller(data.data)) {
      createRecoverySnapshot("Cloud load paused before overwrite");
      setCloudStatus(
        "error",
        "Cloud load paused",
        "Supabase has fewer records than this browser. Your browser data was kept. Use Sync cloud now if this version is correct, or Recovery history to restore an older copy.",
      );
      return;
    }
    isRestoringCloudData = true;
    createRecoverySnapshot("Before cloud data loaded");
    restoreAppData(data.data);
    isRestoringCloudData = false;
    appSettings = { ...appSettings, lastCloudSyncAt: data.updated_at || new Date().toISOString() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
    setCloudStatus("connected", "Cloud storage connected", "Loaded your latest Supabase data.");
    return;
  }

  setCloudStatus("syncing", "Creating first cloud backup", "No cloud data found yet, so the current website data will be saved now.");
  await saveCloudSnapshot();
}

async function initCloudStorage() {
  const client = initSupabaseClient();
  syncCloudAuthUi();
  if (!client) return;

  const { data } = await client.auth.getSession();
  cloudUser = data.session?.user || null;
  syncCloudAuthUi();
  if (cloudUser) {
    await loadCloudSnapshot();
    maybeAutoSyncIcal();
    loadBookingCandidates();
  }

  client.auth.onAuthStateChange((_event, session) => {
    cloudUser = session?.user || null;
    if (!cloudUser) cloudRecordId = "";
    syncCloudAuthUi();
    if (cloudUser) loadCloudSnapshot().then(() => { maybeAutoSyncIcal(); loadBookingCandidates(); });
  });
}

cloudEls().form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) initSupabaseClient();
  if (!supabaseClient) return;
  const ui = cloudEls();
  svRememberSession = ui.remember ? ui.remember.checked : true;
  setCloudStatus("syncing", "Logging in", "Connecting to Supabase.");
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: ui.email.value.trim(),
    password: ui.password.value,
  });
  if (error) {
    setCloudStatus("error", "Login failed", error.message || "Check your Supabase email and password.");
    return;
  }
  ui.password.value = "";
});

function purgeLocalSensitiveData() {
  // Called on sign-out AFTER the cloud is confirmed to hold the latest data.
  // Clears every local copy so a shared/stolen device can't read the P&C data after
  // logout. Everything is restored from Supabase on the next login. In-memory is left
  // EMPTY (not via the loaders, which would seed demo data) so the cloud copy always
  // wins the "is the incoming data smaller?" guard on the next load.
  cloudUser = null;
  cloudRecordId = "";
  cloudKnownUpdatedAt = "";
  window.clearTimeout(cloudSaveTimer);
  try {
    [STORAGE_KEY, TAX_PLAN_KEY, DOCUMENTS_KEY, PROFIT_KEY, SETTINGS_KEY, RECOVERY_KEY, RECOVERY_SESSION_KEY].forEach((key) =>
      localStorage.removeItem(key),
    );
  } catch (error) {}
  bookings = [];
  documents = [];
  profitData = {};
  taxPlan = defaultTaxPlan();
  appSettings = defaultAppSettings();
  try {
    renderAll();
  } catch (error) {}
}

cloudEls().logout?.addEventListener("click", async () => {
  if (!supabaseClient) return;
  // Fail-safe: confirm the cloud has the latest data BEFORE clearing anything local.
  if (cloudUser) {
    window.clearTimeout(cloudSaveTimer);
    setCloudStatus("syncing", "Saving before sign out", "Making sure your latest data is safe in the cloud before clearing this device.");
    const saved = await saveCloudSnapshot();
    if (!saved) {
      setCloudStatus(
        "error",
        "Stayed signed in",
        "Could not sync your latest changes, so nothing was cleared and you are still signed in. Reconnect and try again — your data is safe.",
      );
      return;
    }
  }
  await supabaseClient.auth.signOut();
  purgeLocalSensitiveData();
});

function downloadBackup() {
  appSettings = { ...appSettings, lastBackupAt: new Date().toISOString() };
  saveAppSettings();
  downloadJsonFile(`sunrise-villa-backup-${isoDate(new Date())}.json`, allAppData());
  renderBackupStatus();
}

function renderBackupStatus() {
  if (!els.backupStatus) return;
  if (!appSettings.lastBackupAt) {
    els.backupStatus.textContent = "Not yet";
    if (els.dataHealthBackup) els.dataHealthBackup.textContent = "JSON export: not yet";
    return;
  }
  const last = new Date(appSettings.lastBackupAt);
  const days = Math.floor((Date.now() - last.getTime()) / 86400000);
  const label = days <= 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} ago`;
  els.backupStatus.textContent = label;
  if (els.dataHealthBackup) els.dataHealthBackup.textContent = `JSON export: ${label}`;
}

function shortDateTimeLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderDataHealth(statusMode = "") {
  if (els.dataHealthStatus) {
    const cloudLabel = cloudUser
      ? statusMode === "syncing"
        ? "Cloud: syncing"
        : statusMode === "error"
          ? "Cloud: needs attention"
          : "Cloud: connected"
      : "Cloud: login required";
    els.dataHealthStatus.textContent = cloudLabel;
    els.dataHealthStatus.dataset.status = statusMode || (cloudUser ? "connected" : "offline");
  }
  if (els.dataHealthLastSync) {
    els.dataHealthLastSync.textContent = `Last synced: ${shortDateTimeLabel(appSettings.lastCloudSyncAt)}`;
  }
  if (els.dataHealthRecords) {
    els.dataHealthRecords.textContent = `${bookings.length} booking${bookings.length === 1 ? "" : "s"} saved`;
  }
  renderBackupStatus();
}

async function syncCloudNow() {
  if (!supabaseClient) initSupabaseClient();
  if (!supabaseClient || !cloudUser) {
    setCloudStatus("error", "Cloud login needed", "Log in first, then use Sync cloud now.");
    return;
  }
  setCloudStatus("syncing", "Saving cloud backup", "Sending your latest website data to Supabase.");
  await saveCloudSnapshot(true); // manual sync = force-push, overriding the optimistic-lock guard
}

async function restoreJsonFromInput(event, label = "backup file") {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    restoreAppData(parsed);
  } catch (error) {
    window.alert(`Could not restore this ${label}. Please choose a valid Sunrise Villa JSON backup file.`);
    console.error("Restore failed", error);
  } finally {
    event.target.value = "";
  }
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
                        <img src="${escapeHtml(safeDataUrl(cost.receiptImage, ["data:image/"]))}" alt="Receipt for ${escapeHtml(cost.description || cost.category)}" />
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
  if (!isRestoringCloudData) createRecoverySnapshot("Before data restore/import");
  if (Array.isArray(data)) {
    bookings = data.map(normalizeBooking);
  } else {
    bookings = Array.isArray(data.bookings) ? data.bookings.map(normalizeBooking) : bookings;
    documents = Array.isArray(data.documents) ? data.documents.map(normalizeDocument) : documents;
    taxPlan = data.taxPlan
      ? {
          ...defaultTaxPlan(),
          ...data.taxPlan,
          expenses: Array.isArray(data.taxPlan.expenses) ? data.taxPlan.expenses.map(normalizeTaxExpense) : [],
          notes: { ...defaultTaxPlan().notes, ...(data.taxPlan.notes || {}) },
        }
      : taxPlan;
    profitData = data.profitData && typeof data.profitData === "object" ? data.profitData : profitData;
    appSettings = data.appSettings
      ? {
          ...defaultAppSettings(),
          ...data.appSettings,
          activeVilla: data.appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise",
          guestProfiles: { ...defaultAppSettings().guestProfiles, ...(data.appSettings.guestProfiles || {}) },
          guidebook: { ...defaultAppSettings().guidebook, ...(data.appSettings.guidebook || {}) },
          dashboardMode: data.appSettings.dashboardMode === "annual" ? "annual" : "monthly",
          bookingMonthFilter: data.appSettings.bookingMonthFilter || defaultAppSettings().bookingMonthFilter,
          bookingColumns: { ...defaultAppSettings().bookingColumns, ...(data.appSettings.bookingColumns || {}) },
          bookingColumnWidths: { ...defaultAppSettings().bookingColumnWidths, ...(data.appSettings.bookingColumnWidths || {}) },
          quickColumns: { ...defaultAppSettings().quickColumns, ...(data.appSettings.quickColumns || {}) },
          quickColumnWidths: { ...defaultAppSettings().quickColumnWidths, ...(data.appSettings.quickColumnWidths || {}) },
          message: {
            ...defaultAppSettings().message,
            ...(data.appSettings.message || {}),
            templates: { ...defaultMessageTemplates, ...(data.appSettings.message?.templates || {}) },
            windmill: {
              ...defaultAppSettings().message.windmill,
              ...(data.appSettings.message?.windmill || {}),
              templates: { ...defaultAppSettings().message.windmill.templates, ...(data.appSettings.message?.windmill?.templates || {}) },
            },
          },
          ical: { ...defaultAppSettings().ical, ...(data.appSettings.ical || {}) },
        }
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

// --- Per-villa message resolution (improvement #7) -------------------------------
// Sunrise uses the top-level message block (unchanged). Windmill uses its own block
// so Sunrise's address, directions, bank details and templates can never leak across.
function messageBlockForVilla(villa) {
  return villa === "Windmill" ? (appSettings.message.windmill || {}) : appSettings.message;
}
function activeMessageBlock() {
  return messageBlockForVilla(appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise");
}
function templateForVilla(villa, key) {
  const t = messageBlockForVilla(villa)?.templates?.[key];
  if (typeof t === "string" && t.trim()) return t;
  // Sunrise falls back to the built-in defaults; Windmill stays blank (never Sunrise text).
  return villa === "Windmill" ? "" : defaultMessageTemplates[key];
}

function templateValuesForBooking(booking = selectedMessageBooking()) {
  const title = booking?.guestTitle === "Ms" ? "Ms" : "Mr";
  const guestName = String(booking?.guest || els.messageGuestName?.value || "Guest").trim();
  const guest = guestName === "Guest" ? guestName : `${title} ${guestName}`;
  return templateValues({ guest, booking });
}

function templateValuesForQuote() {
  const title = els.quoteGuestTitle?.value === "Ms" ? "Ms" : "Mr";
  const name = String(els.quoteGuestName?.value || "Guest").trim();
  const guest = name === "Guest" ? name : `${title} ${name}`;
  return templateValues({ guest, booking: null });
}

function templateValues({ guest, booking }) {
  const quote = quoteCalculation();
  const villa = booking
    ? (booking.villa === "Windmill" ? "Windmill" : "Sunrise")
    : (appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise");
  const block = messageBlockForVilla(villa);
  const isW = villa === "Windmill";
  return {
    guest,
    code: booking ? bookingConfirmationCode(booking) : "SV-DDMM-A08",
    address: els.messageAddress?.value?.trim() || block.address || "",
    mapsLink: els.messageMapsLink?.value?.trim() || block.mapsLink || (isW ? "" : "https://g.co/kgs/DYpYPSh"),
    checkinTime: els.messageCheckinTime?.value || block.checkinTime || "3:00 PM",
    guideLink: els.messageGuideLink?.value?.trim() || block.guideLink || (isW ? "" : GUIDE_LINK),
    bankDetails: (els.messageBankDetails && els.messageBankDetails.value.trim()) || block.bankDetails || "",
    quoteCheckIn: quoteDate(quote.checkIn),
    quoteCheckOut: quoteDate(quote.checkOut),
    quoteAccommodationFee: money(quote.accommodationFee),
    quoteCleaningFee: money(quote.cleaningFee),
    quoteDamageDeposit: money(quote.damageDeposit),
    quoteDiscount: money(quote.discount),
    quoteActualCharge: money(quote.actualCharge),
    quoteStandardTotal: money(quote.standardTotal),
    quoteTotalNights: quote.totalNights,
  };
}

function applyTemplate(template, values) {
  return String(template || "")
    .replaceAll("{guest}", values.guest)
    .replaceAll("{code}", values.code)
    .replaceAll("{address}", values.address)
    .replaceAll("{mapsLink}", values.mapsLink)
    .replaceAll("{checkinTime}", values.checkinTime)
    .replaceAll("{guideLink}", values.guideLink)
    .replaceAll("{bankDetails}", values.bankDetails || "")
    .replaceAll("{quoteCheckIn}", values.quoteCheckIn)
    .replaceAll("{quoteCheckOut}", values.quoteCheckOut)
    .replaceAll("{quoteAccommodationFee}", values.quoteAccommodationFee)
    .replaceAll("{quoteCleaningFee}", values.quoteCleaningFee)
    .replaceAll("{quoteDamageDeposit}", values.quoteDamageDeposit)
    .replaceAll("{quoteDiscount}", values.quoteDiscount)
    .replaceAll("{quoteActualCharge}", values.quoteActualCharge)
    .replaceAll("{quoteStandardTotal}", values.quoteStandardTotal)
    .replaceAll("{quoteTotalNights}", values.quoteTotalNights);
}

function messageBookingOptions() {
  const bookings = scopedBookings();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = [...bookings]
    .filter((booking) => dateObj(departureFor(booking)) >= today)
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
  const groups = upcoming.reduce((acc, booking) => {
    const monthValue = booking.arrival.slice(0, 7);
    if (!acc.has(monthValue)) acc.set(monthValue, []);
    acc.get(monthValue).push(booking);
    return acc;
  }, new Map());
  return [...groups]
    .map(
      ([monthValue, items]) => `
        <optgroup label="${escapeHtml(monthLabel(monthValue))}">
          ${items.map((booking) => `<option value="${booking.id}">${escapeHtml(quickDate(booking.arrival))} · ${escapeHtml(booking.guest)}</option>`).join("")}
        </optgroup>
      `,
    )
    .join("");
}

function selectedMessageBooking() {
  const bookings = scopedBookings();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    bookings.find((booking) => booking.id === els.messageBookingSelect?.value) ||
    [...bookings]
      .filter((booking) => dateObj(departureFor(booking)) >= today)
      .sort((a, b) => a.arrival.localeCompare(b.arrival))[0]
  );
}

function quoteNightBreakdown(checkIn, checkOut) {
  let weekday = 0;
  let weekend = 0;
  if (!checkIn || !checkOut) return { weekday, weekend };
  for (let stayDate = dateObj(checkIn); stayDate < dateObj(checkOut); stayDate = addDays(stayDate, 1)) {
    if (isWeekendNight(isoDate(stayDate))) weekend += 1;
    else weekday += 1;
  }
  return { weekday, weekend };
}

function quoteCalculation() {
  const checkIn = els.quoteCheckIn?.value || "";
  const checkOut = els.quoteCheckOut?.value || "";
  const weekdayNights = Math.max(0, Number(els.quoteWeekdayNights?.value || 0));
  const weekendNights = Math.max(0, Number(els.quoteWeekendNights?.value || 0));
  const holidayNights = Math.max(0, Number(els.quoteHolidayNights?.value || 0));
  const weekdayRate = Math.max(0, Number(els.quoteWeekdayRate?.value || 2488));
  const weekendRate = Math.max(0, Number(els.quoteWeekendRate?.value || 2888));
  const holidayRate = Math.max(0, Number(els.quoteHolidayRate?.value || 3688));
  const cleaningFee = Math.max(0, Number(els.quoteCleaningFee?.value || 200));
  const damageDeposit = Math.max(0, Number(els.quoteDamageDeposit?.value || 500));
  const chargeableHolidayNights = Math.min(holidayNights, weekdayNights + weekendNights);
  const weekdayHolidayNights = Math.min(chargeableHolidayNights, weekdayNights);
  const weekendHolidayNights = Math.max(0, chargeableHolidayNights - weekdayHolidayNights);
  const chargeableWeekdayNights = Math.max(0, weekdayNights - weekdayHolidayNights);
  const chargeableWeekendNights = Math.max(0, weekendNights - weekendHolidayNights);
  const accommodationFee = chargeableWeekdayNights * weekdayRate + chargeableWeekendNights * weekendRate + chargeableHolidayNights * holidayRate;
  const standardTotal = accommodationFee + cleaningFee;
  const actualCharge = Math.max(0, Number(els.quoteActualCharge?.value || standardTotal));
  const discount = Math.max(0, standardTotal - actualCharge);
  return {
    checkIn,
    checkOut,
    weekdayNights,
    weekendNights,
    holidayNights,
    weekdayRate,
    weekendRate,
    holidayRate,
    cleaningFee,
    damageDeposit,
    accommodationFee,
    standardTotal,
    actualCharge,
    discount,
    totalNights: weekdayNights + weekendNights,
  };
}

function syncQuoteNightsFromDates(forceActualCharge = false) {
  if (!els.quoteCheckIn || !els.quoteCheckOut) return;
  const breakdown = quoteNightBreakdown(els.quoteCheckIn.value, els.quoteCheckOut.value);
  if (els.quoteWeekdayNights) els.quoteWeekdayNights.value = breakdown.weekday;
  if (els.quoteWeekendNights) els.quoteWeekendNights.value = breakdown.weekend;
  if (els.quoteHolidayNights && !els.quoteHolidayNights.value) els.quoteHolidayNights.value = 0;
  renderQuickQuote(forceActualCharge);
}

function renderQuickQuote(forceActualCharge = false) {
  const initial = quoteCalculation();
  if (forceActualCharge && els.quoteActualCharge) els.quoteActualCharge.value = initial.standardTotal;
  const quote = quoteCalculation();
  if (els.quoteDiscount) els.quoteDiscount.value = quote.discount.toFixed(0);
  if (els.quoteStandardTotal) els.quoteStandardTotal.textContent = money(quote.standardTotal);
  if (els.quoteGuestTotal) els.quoteGuestTotal.textContent = `${money(quote.actualCharge)} + ${money(quote.damageDeposit)}`;
  if (els.quoteTotalNights) els.quoteTotalNights.textContent = quote.totalNights;
}

function fillMessageFromBooking(force = false) {
  const booking = selectedMessageBooking();
  if (!booking || !els.messageGuestName) return;
  if (els.messageGuestTitle) els.messageGuestTitle.value = booking.guestTitle === "Ms" ? "Ms" : "Mr";
  if (force || !els.messageGuestName.value) els.messageGuestName.value = booking.guest;
  if (force || !els.messagePhone.value) els.messagePhone.value = booking.contact || "";
  const block = activeMessageBlock();
  const isW = activeVillaKey() === "Windmill";
  if (force || !els.messageCheckinTime.value) els.messageCheckinTime.value = block.checkinTime || "3:00 PM";
  els.messageSecurityCode.value = bookingConfirmationCode(booking);
  if (els.messageCodeDisplay) els.messageCodeDisplay.textContent = bookingConfirmationCode(booking);
  if (force || !els.messageAddress.value) els.messageAddress.value = block.address || "";
  if (els.messageMapsLink && (force || !els.messageMapsLink.value)) els.messageMapsLink.value = block.mapsLink || (isW ? "" : "https://g.co/kgs/DYpYPSh");
  if (els.messageGuideLink && (force || !els.messageGuideLink.value)) els.messageGuideLink.value = block.guideLink || (isW ? "" : GUIDE_LINK);
  if (els.messageBankDetails && (force || !els.messageBankDetails.value)) els.messageBankDetails.value = block.bankDetails || "";
  renderQuickQuote(false);
  renderCheckinMessage();
}

function activeVillaKey() {
  return appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise";
}
function villaOf(booking) {
  return booking ? (booking.villa === "Windmill" ? "Windmill" : "Sunrise") : activeVillaKey();
}

function checkinMessageText() {
  return applyTemplate(templateForVilla(villaOf(selectedMessageBooking()), "checkin"), templateValuesForBooking());
}

function checkinMessageTextForBooking(booking) {
  return applyTemplate(templateForVilla(villaOf(booking), "checkin"), templateValuesForBooking(booking));
}

function guestGuideMessageTextForBooking(booking) {
  return applyTemplate(templateForVilla(villaOf(booking), "guide"), templateValuesForBooking(booking));
}

function reminderMessageTextForBooking(booking) {
  return applyTemplate(templateForVilla(villaOf(booking), "reminder"), templateValuesForBooking(booking));
}

function depositMessageTextForBooking(booking) {
  return applyTemplate(templateForVilla(villaOf(booking), "deposit"), templateValuesForBooking(booking));
}

function midstayMessageTextForBooking(booking) {
  return applyTemplate(templateForVilla(villaOf(booking), "midstay"), templateValuesForBooking(booking));
}

function reviewMessageTextForBooking(booking) {
  return applyTemplate(templateForVilla(villaOf(booking), "review"), templateValuesForBooking(booking));
}

function quoteMessageText() {
  return applyTemplate(templateForVilla(activeVillaKey(), "quote"), templateValuesForQuote());
}

function openWhatsappMessage(phoneValue, text) {
  const phone = formatPhoneForWhatsapp(phoneValue || "");
  if (!phone) {
    window.alert("Add the guest WhatsApp number first.");
    return;
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) window.location.href = url;
}

function openWhatsappForBooking(booking, template) {
  const text =
    template === "guide" ? guestGuideMessageTextForBooking(booking)
    : template === "reminder" ? reminderMessageTextForBooking(booking)
    : template === "deposit" ? depositMessageTextForBooking(booking)
    : template === "midstay" ? midstayMessageTextForBooking(booking)
    : template === "review" ? reviewMessageTextForBooking(booking)
    : checkinMessageTextForBooking(booking);
  openWhatsappMessage(booking?.contact || "", text);
}

function inquiryAckText() {
  return applyTemplate(templateForVilla(activeVillaKey(), "inquiry"), templateValuesForQuote());
}
function openInquiryAck() {
  openWhatsappMessage(els.quotePhone?.value || "", inquiryAckText());
}

// --- AI guest Q&A drafter (grounded in the per-villa Guidebook; draft-only) ---
// Compiles the active villa's Guidebook + address into a plain-text facts block.
function gatherVillaFacts(villa) {
  const g = guidebookFor(villa);
  const block = messageBlockForVilla(villa) || {};
  const parts = [];
  if (block.address) parts.push(`Address: ${block.address}`);
  if (block.checkinTime) parts.push(`Standard check-in time: ${block.checkinTime}`);
  if (g.wifiName || g.wifiPassword) parts.push(`WiFi — network: ${g.wifiName || "(not set)"}, password: ${g.wifiPassword || "(not set)"}`);
  if (g.checkin) parts.push(`Check-in steps: ${g.checkin}`);
  if (g.checkout) parts.push(`Check-out instructions: ${g.checkout}`);
  if (g.houseRules) parts.push(`House rules: ${g.houseRules}`);
  if (g.amenities) parts.push(`Appliances & how-tos: ${g.amenities}`);
  if (g.localTips) parts.push(`Local recommendations: ${g.localTips}`);
  if (g.emergency) parts.push(`Emergency / host contact: ${g.emergency}`);
  return parts.join("\n");
}

function setAiStatus(text, kind) {
  if (!els.aiDraftStatus) return;
  els.aiDraftStatus.textContent = text || "";
  els.aiDraftStatus.className = `ai-draft-status${kind ? " " + kind : ""}`;
}

async function draftGuestReply() {
  const question = els.aiQuestion?.value?.trim();
  if (!question) {
    setAiStatus("Type the guest's question first.", "err");
    els.aiQuestion?.focus();
    return;
  }
  if (!supabaseClient || !cloudUser) {
    setAiStatus("Log in first — the drafter runs through your secure cloud function.", "err");
    return;
  }
  const villa = activeVillaKey();
  const facts = gatherVillaFacts(villa);
  if (!facts) {
    setAiStatus(`No ${villa} Guidebook facts yet — fill the Guidebook tab so the draft has something to ground on.`, "err");
    return;
  }
  if (els.aiDraftBtn) els.aiDraftBtn.disabled = true;
  setAiStatus("Drafting…");
  try {
    const { data, error } = await supabaseClient.functions.invoke("guest-reply-draft", { body: { question, villa, facts } });
    if (error) throw new Error(error.message || "request failed");
    if (data?.error) {
      const lowBalance = /credit|balance|billing|quota/i.test(data.detail || "");
      throw new Error(lowBalance ? "Anthropic balance is empty — add funds in the Console, then try again." : data.detail || data.error);
    }
    if (els.aiDraft) els.aiDraft.value = data.draft || "";
    if (els.aiPhone && !els.aiPhone.value && selectedMessageBooking()?.contact) els.aiPhone.value = selectedMessageBooking().contact;
    setAiStatus("Draft ready — review and edit before sending.", "ok");
  } catch (e) {
    setAiStatus(e?.message || "Could not draft a reply.", "err");
  } finally {
    if (els.aiDraftBtn) els.aiDraftBtn.disabled = false;
  }
}

function openWhatsappForQuote() {
  openWhatsappMessage(els.quotePhone?.value || "", quoteMessageText());
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

function showManualCopy(text) {
  if (!els.manualCopyBox || !els.manualCopyText) return;
  els.manualCopyBox.classList.remove("hidden");
  els.manualCopyText.value = text;
  els.manualCopyText.textContent = text;
  els.manualCopyText.focus();
  els.manualCopyText.select();
  els.manualCopyText.setSelectionRange(0, els.manualCopyText.value.length);
}

async function copyMessageWithFeedback(text, button, defaultLabel) {
  renderCheckinMessage();
  els.manualCopyBox?.classList.add("hidden");
  try {
    const copied = await copyTextToClipboard(text);
    if (!copied) throw new Error("Copy blocked");
    button.textContent = "Copied";
    if (els.messageCopyStatus) els.messageCopyStatus.textContent = "Message copied. You can paste it into WhatsApp now.";
  } catch {
    showManualCopy(text);
    button.textContent = "Select to Copy";
    if (els.messageCopyStatus) els.messageCopyStatus.textContent = "Copy was blocked by the browser, so I selected the message for manual copy.";
  }
  window.setTimeout(() => {
    button.textContent = defaultLabel;
  }, 1600);
}

function renderCheckinMessage() {
  if (els.messageCodeDisplay) els.messageCodeDisplay.textContent = selectedMessageBooking() ? bookingConfirmationCode(selectedMessageBooking()) : "SV-DDMM-A08";
  const isW = activeVillaKey() === "Windmill";
  const base = activeMessageBlock();
  const dflt = (key) => (isW ? "" : defaultMessageTemplates[key]);
  const block = {
    checkinTime: els.messageCheckinTime?.value || "3:00 PM",
    address: els.messageAddress?.value || "",
    mapsLink: els.messageMapsLink?.value || base.mapsLink || (isW ? "" : "https://g.co/kgs/DYpYPSh"),
    guideLink: els.messageGuideLink?.value || base.guideLink || (isW ? "" : GUIDE_LINK),
    bankDetails: els.messageBankDetails ? els.messageBankDetails.value : (base.bankDetails || ""),
    templates: {
      quote: els.quoteTemplateInput?.value || dflt("quote"),
      checkin: els.checkinTemplateInput?.value || dflt("checkin"),
      guide: els.guideTemplateInput?.value || dflt("guide"),
      reminder: els.reminderTemplateInput?.value || dflt("reminder"),
    },
  };
  // Write only the ACTIVE villa's block; the other villa's settings are preserved untouched.
  appSettings = isW
    ? { ...appSettings, message: { ...appSettings.message, windmill: { ...(appSettings.message.windmill || {}), ...block } } }
    : { ...appSettings, message: { ...appSettings.message, ...block } };
  saveAppSettings();
}

function renderMessageGenerator() {
  if (!els.messageBookingSelect) return;
  const current = els.messageBookingSelect.value;
  els.messageBookingSelect.innerHTML = messageBookingOptions() || `<option value="">No bookings yet</option>`;
  if (current && [...els.messageBookingSelect.options].some((option) => option.value === current)) els.messageBookingSelect.value = current;
  if (els.quoteTemplateInput && !els.quoteTemplateInput.value) els.quoteTemplateInput.value = templateForVilla(activeVillaKey(), "quote");
  if (els.checkinTemplateInput && !els.checkinTemplateInput.value) els.checkinTemplateInput.value = templateForVilla(activeVillaKey(), "checkin");
  if (els.guideTemplateInput && !els.guideTemplateInput.value) els.guideTemplateInput.value = templateForVilla(activeVillaKey(), "guide");
  if (els.reminderTemplateInput && !els.reminderTemplateInput.value) els.reminderTemplateInput.value = templateForVilla(activeVillaKey(), "reminder");
  if (els.aiVillaName) els.aiVillaName.textContent = activeVillaKey();
  fillMessageFromBooking(false);
}

// Force the message form + template editors to show the ACTIVE villa's saved block.
// Called when the villa switch flips so Sunrise text is never left sitting in Windmill's editor.
function loadVillaMessageIntoForm() {
  const villa = activeVillaKey();
  const block = messageBlockForVilla(villa);
  const isW = villa === "Windmill";
  if (els.messageCheckinTime) els.messageCheckinTime.value = block.checkinTime || "3:00 PM";
  if (els.messageAddress) els.messageAddress.value = block.address || "";
  if (els.messageMapsLink) els.messageMapsLink.value = block.mapsLink || (isW ? "" : "https://g.co/kgs/DYpYPSh");
  if (els.messageGuideLink) els.messageGuideLink.value = block.guideLink || (isW ? "" : GUIDE_LINK);
  if (els.messageBankDetails) els.messageBankDetails.value = block.bankDetails || "";
  if (els.quoteTemplateInput) els.quoteTemplateInput.value = templateForVilla(villa, "quote");
  if (els.checkinTemplateInput) els.checkinTemplateInput.value = templateForVilla(villa, "checkin");
  if (els.guideTemplateInput) els.guideTemplateInput.value = templateForVilla(villa, "guide");
  if (els.reminderTemplateInput) els.reminderTemplateInput.value = templateForVilla(villa, "reminder");
}

const bookingColumnOptions = [
  { key: "channel", label: "Channel", locked: true },
  { key: "record", label: "Record type" },
  { key: "guest", label: "Guest", locked: true },
  { key: "contact", label: "Contact" },
  { key: "prefix", label: "Prefix" },
  { key: "arrival", label: "Arrival", locked: true },
  { key: "nights", label: "Nights", locked: true },
  { key: "revenue", label: "Accommodation" },
  { key: "deposit", label: "Deposit" },
  { key: "total", label: "Total" },
  { key: "received", label: "Received" },
  { key: "full", label: "Full received" },
  { key: "balance", label: "Balance", locked: true },
  { key: "refund", label: "Refund" },
  { key: "actions", label: "Actions", locked: true },
];

function isBookingColumnVisible(key) {
  const column = bookingColumnOptions.find((item) => item.key === key);
  if (column?.locked) return true;
  return appSettings.bookingColumns?.[key] !== false;
}

function bookingCell(col, content, extraClass = "") {
  const hidden = isBookingColumnVisible(col) ? "" : " hidden-col";
  return `<td data-col="${col}" class="${`${extraClass}${hidden}`.trim()}">${content}</td>`;
}

function renderBookingColumnControls() {
  if (!els.bookingColumnControls) return;
  els.bookingColumnControls.innerHTML = bookingColumnOptions
    .filter((column) => !column.locked)
    .map(
      (column) => `
        <label class="column-toggle">
          <input type="checkbox" data-booking-column="${column.key}" ${isBookingColumnVisible(column.key) ? "checked" : ""} />
          <span>${column.label}</span>
        </label>
      `,
    )
    .join("");
  document.querySelectorAll("#bookingsTable [data-col]").forEach((cell) => {
    cell.classList.toggle("hidden-col", !isBookingColumnVisible(cell.dataset.col));
  });
  applyTableColumnWidths("#bookingsTable", appSettings.bookingColumnWidths || {});
  setupTableColumnResizers("#bookingsTable", "booking");
}

const quickColumnWidthLimits = {
  guest: 180,
  type: 78,
  checkin: 82,
  nights: 52,
  wa: 36,
  revenue: 102,
  deposit: 102,
  total: 102,
  received: 102,
  full: 96,
  balance: 102,
  refund: 86,
};

function applyTableColumnWidths(tableSelector, widths) {
  document.querySelectorAll(`${tableSelector} [data-col]`).forEach((cell) => {
    const storedWidth = Number(widths[cell.dataset.col] || 0);
    const width = tableSelector === "#quickViewTable" && quickColumnWidthLimits[cell.dataset.col]
      ? Math.min(storedWidth, quickColumnWidthLimits[cell.dataset.col])
      : storedWidth;
    if (width > 0) {
      cell.style.width = `${width}px`;
      cell.style.minWidth = `${width}px`;
    } else {
      cell.style.width = "";
      cell.style.minWidth = "";
    }
  });
}

let activeColumnResize = null;

function setupTableColumnResizers(tableSelector, tableType) {
  document.querySelectorAll(`${tableSelector} thead th[data-col]`).forEach((th) => {
    if (th.dataset.resizeReady) return;
    th.dataset.resizeReady = "true";
    const handle = document.createElement("span");
    handle.className = "column-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activeColumnResize = {
        tableType,
        tableSelector,
        key: th.dataset.col,
        startX: event.clientX,
        startWidth: th.getBoundingClientRect().width,
      };
      document.body.classList.add("resizing-column");
    });
    th.appendChild(handle);
  });
}

document.addEventListener("mousemove", (event) => {
  if (!activeColumnResize) return;
  const maxWidth = activeColumnResize.tableType === "quick" ? (quickColumnWidthLimits[activeColumnResize.key] || 160) : 260;
  const minWidth = activeColumnResize.tableType === "quick" ? 34 : 64;
  const nextWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(activeColumnResize.startWidth + event.clientX - activeColumnResize.startX)));
  const key = activeColumnResize.tableType === "quick" ? "quickColumnWidths" : "bookingColumnWidths";
  appSettings = {
    ...appSettings,
    [key]: {
      ...(appSettings[key] || {}),
      [activeColumnResize.key]: nextWidth,
    },
  };
  applyTableColumnWidths(activeColumnResize.tableSelector, appSettings[key] || {});
});

document.addEventListener("mouseup", () => {
  if (!activeColumnResize) return;
  activeColumnResize = null;
  document.body.classList.remove("resizing-column");
  saveAppSettings();
});

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

function applyDashboardMode() {
  const mode = appSettings.dashboardMode === "annual" ? "annual" : "monthly";
  const dashboard = document.querySelector("#dashboardView");
  if (dashboard) {
    dashboard.classList.toggle("mode-annual", mode === "annual");
    dashboard.classList.toggle("mode-monthly", mode === "monthly");
  }
  document.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
    const isActive = button.dataset.dashboardMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
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
  if (dashboardGuideTitle) dashboardGuideTitle.textContent = appSettings.dashboardMode === "annual" ? `${year} Annual Dashboard` : `${monthLabel(selectedMonth)} Monthly Dashboard`;
  els.sideRevenue.textContent = money(totals.revenue);
  if (els.sideTotalToReceive) els.sideTotalToReceive.textContent = money(totals.totalToReceive);
  if (els.sideRefundPending) els.sideRefundPending.textContent = money(totals.refundPending);
  els.sideBalance.textContent = money(totals.balance);
  els.sideUpcomingPayments.textContent = money(upcomingPayments);
  els.sideNights.textContent = `${selectedPerformance.bookedNights}/${selectedPerformance.availableNights} (${percent(selectedPerformance.occupancyRate)})`;
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
  const occHero = els.occupancyRate?.closest(".performance-hero");
  if (occHero) occHero.style.setProperty("--occ", Math.max(0, Math.min(100, Number(selectedPerformance.occupancyRate) || 0)));
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

  if (els.upcomingRows) {
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
  }

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
  const bookings = scopedBookings();
  renderBookingMonthFilter();
  const search = els.bookingSearch?.value.trim().toLowerCase() || "";
  const monthFilter = els.bookingMonthFilter?.value || appSettings.bookingMonthFilter || "Selected";
  const effectiveMonth = monthFilter === "Selected" ? selectedMonth : monthFilter;
  if (els.bookingTableTitle) {
    els.bookingTableTitle.textContent = effectiveMonth === "All" ? "All Bookings" : `${monthLabel(effectiveMonth)} Bookings`;
  }
  const channel = els.channelFilter?.value || "All";
  const payment = els.paymentFilter?.value || "All";
  const deposit = els.depositFilter?.value || "All";
  const contactState = els.contactFilter?.value || "All";
  const sorted = [...bookings]
    .filter((booking) => {
      const balance = balanceFor(booking);
      const hasPhone = !!formatPhoneForWhatsapp(booking.contact);
      const haystack = `${booking.guest} ${booking.contact} ${prefixFor(booking.guest)} ${booking.channel} ${isExcludedBooking(booking) ? "influencer complimentary free record only" : "financial"}`.toLowerCase();
      if (effectiveMonth !== "All" && !bookingMonthOverlap(booking, effectiveMonth)) return false;
      if (search && !haystack.includes(search)) return false;
      if (channel !== "All" && booking.channel !== channel) return false;
      if (payment === "Due" && balance <= 0) return false;
      if (payment === "Paid" && balance > 0) return false;
      if (deposit === "Unpaid" && booking.depositPaid) return false;
      if (deposit === "Held" && (!booking.depositPaid || booking.depositRefunded)) return false;
      if (deposit === "RefundDue" && refundPendingFor(booking) <= 0) return false;
      if (deposit === "Refunded" && !booking.depositRefunded) return false;
      if (contactState === "Missing" && hasPhone) return false;
      if (contactState === "Has" && !hasPhone) return false;
      return true;
    })
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
  let currentMonthHeader = "";
  const bookingRowHtml = sorted
    .map((booking) => {
      const balance = balanceFor(booking);
      const monthValue = booking.arrival.slice(0, 7);
      const monthHeader =
        effectiveMonth === "All" && monthValue !== currentMonthHeader
          ? ((currentMonthHeader = monthValue), `<tr class="booking-month-row"><td colspan="15">${escapeHtml(monthLabel(monthValue))}</td></tr>`)
          : "";
      return `
        ${monthHeader}
        <tr>
          ${bookingCell("channel", channelBadgeFor(booking))}
          ${bookingCell("record", isExcludedBooking(booking) ? `<span class="channel-badge influencer">Record only</span>` : `<span class="channel-badge direct">Financial</span>`)}
          ${bookingCell("guest", `${escapeHtml(booking.guest)} ${returningBadgeHtml(booking, bookings)}${blocklistBadgeHtml(booking)}`, "booking-guest-cell")}
          ${bookingCell("contact", formatPhoneForWhatsapp(booking.contact) ? escapeHtml(booking.contact) : `<span class="contact-missing" title="No WhatsApp number saved">⚠ no phone</span>`, "contact-cell")}
          ${bookingCell("prefix", `<strong>${prefixFor(booking.guest)}</strong>`)}
          ${bookingCell("arrival", shortDate(booking.arrival), "date-cell")}
          ${bookingCell("nights", booking.nights)}
          ${bookingCell("revenue", money(booking.revenue), "money-cell")}
          ${bookingCell("deposit", money(booking.depositAmount), "money-cell")}
          ${bookingCell("total", money(totalToReceiveFor(booking)), "money-cell")}
          ${bookingCell("received", money(booking.paid), "money-cell")}
          ${bookingCell("full", fullReceivedControl(booking))}
          ${bookingCell("balance", money(balance), balance > 0 ? "money-cell balance-due" : "money-cell")}
          ${bookingCell("refund", refundControl(booking))}
          ${bookingCell("actions", `
            <button class="small-action wa-action" type="button" data-wa="${booking.id}" title="Open WhatsApp with the check-in message">WhatsApp</button>
            <button class="small-action" type="button" data-edit="${booking.id}">Edit</button>
            <button class="small-action danger" type="button" data-delete="${booking.id}">Delete</button>
          `, "actions")}
        </tr>
      `;
    })
    .join("");
  els.bookingRows.innerHTML = bookingRowHtml || `<tr><td colspan="15" class="empty-row">No bookings match these filters.</td></tr>`;
  renderBookingColumnControls();
}

function renderBookingMonthFilter() {
  const bookings = scopedBookings();
  if (!els.bookingMonthFilter) return;
  const current = els.bookingMonthFilter.value || appSettings.bookingMonthFilter || "Selected";
  const months = Array.from(new Set([selectedMonth, ...bookings.map((booking) => booking.arrival?.slice(0, 7)).filter(Boolean)])).sort();
  els.bookingMonthFilter.innerHTML = [
    `<option value="Selected">Selected month (${monthLabel(selectedMonth)})</option>`,
    `<option value="All">All months</option>`,
    ...months.map((monthValue) => `<option value="${monthValue}">${monthLabel(monthValue)}</option>`),
  ].join("");
  els.bookingMonthFilter.value = [...months, "All", "Selected"].includes(current) ? current : "Selected";
}

function renderOwnerReport() {
  if (!els.ownerReportPrint) return;
  const villa = activeVillaKey();
  const isWindmill = villa === "Windmill";
  const totals = totalsFor(selectedMonth);
  const performance = stayPerformanceForMonth(selectedMonth);
  const breakdown = expenseBreakdownFor(selectedMonth);
  const netProfit = totals.revenue - breakdown.total;
  const paidBookings = calculationBookings(arrivalsForMonth(selectedMonth));
  const influencerBookings = arrivalsForMonth(selectedMonth).filter(isExcludedBooking);
  // Windmill is managed for its owner (Austin earns nothing from it) and the expense data
  // tracked here is Sunrise's, so a Windmill statement reports revenue/occupancy/bookings
  // only — never Sunrise's P&L. Sunrise keeps the full owner report.
  const summaryGrid = isWindmill
    ? `
    <section class="owner-report-grid">
      <article><span>Accommodation Fees</span><strong>${money(totals.revenue)}</strong></article>
      <article><span>Occupancy</span><strong>${percent(performance.occupancyRate)}</strong></article>
      <article><span>Nights Booked</span><strong>${performance.bookedNights}</strong></article>
      <article><span>Bookings</span><strong>${paidBookings.length}</strong></article>
    </section>`
    : `
    <section class="owner-report-grid">
      <article><span>Accommodation Fees</span><strong>${money(totals.revenue)}</strong></article>
      <article><span>Total Expenses</span><strong>${money(breakdown.total)}</strong></article>
      <article><span>Net Profit</span><strong>${money(netProfit)}</strong></article>
      <article><span>Occupancy</span><strong>${percent(performance.occupancyRate)}</strong></article>
    </section>`;
  const pnlSection = isWindmill
    ? ""
    : `
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
    </section>`;
  els.ownerReportPrint.innerHTML = `
    <div class="owner-report-head">
      <div>
        <p>${escapeHtml(villa)} Villa</p>
        <h1>Monthly Owner Report</h1>
        <span>${monthLabel(selectedMonth)}</span>
      </div>
      <strong>${isoDate(new Date())}</strong>
    </div>
    ${summaryGrid}
    ${pnlSection}
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

// --- Paste-to-import: auto-fill a booking from a real Airbnb confirmation email ---
const AIRBNB_MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function airbnbInferDate(mon, day) {
  const m = AIRBNB_MONTHS[mon];
  if (!m) return "";
  const mk = (y) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const now = new Date();
  let y = now.getFullYear();
  // Airbnb omits the year; if that date already rolled well past, it's next year.
  if (new Date(`${mk(y)}T00:00:00`) < new Date(now.getTime() - 60 * 86400000)) y += 1;
  return mk(y);
}
function parseAirbnbBookingEmail(text) {
  const t = String(text || "").replace(/\r/g, "");
  const grab = (re) => (t.match(re) || [])[1] || "";
  const name = grab(/New booking confirmed!\s+(.+?)\s+arrives/i) || grab(/Get ready for\s+(.+?)[’']s arrival/i);
  const listing = grab(/([^\n]*(?:Sunrise|Windmill)[^\n]*)/i);
  const villa = /windmill/i.test(listing) ? "Windmill" : "Sunrise";
  const ci = t.match(/Check-?in\s+[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2})/i);
  const co = t.match(/Check-?out\s+[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2})/i);
  let arrival = ci ? airbnbInferDate(ci[1], Number(ci[2])) : "";
  if (!arrival) {
    // Fallback: the headline "…arrives Jul 3" is in every booking email (plain-text safe).
    const am = t.match(/arrives\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/i);
    if (am) arrival = airbnbInferDate(am[1], Number(am[2]));
  }
  const checkout = co ? airbnbInferDate(co[1], Number(co[2])) : "";
  let nights = Number(grab(/x\s*(\d+)\s*night/i)) || 0;
  if (!nights && arrival && checkout) nights = Math.round((new Date(checkout) - new Date(arrival)) / 86400000);
  return {
    name: name.trim(),
    villa,
    arrival,
    nights,
    guests: grab(/Guests\s+(\d+\s*adults?[^\n]*)/i),
    code: grab(/Confirmation code\s+([A-Z0-9]{6,})/i),
    totalPaid: grab(/Total \(MYR\)\s+RM\s*([\d,]+\.\d{2})/i).replace(/,/g, ""),
    hostPayout: grab(/You earn\s+RM\s*([\d,]+\.\d{2})/i).replace(/,/g, ""),
  };
}
function autofillBookingFromAirbnbEmail() {
  const parsed = parseAirbnbBookingEmail(els.airbnbEmailInput?.value || "");
  const status = els.airbnbAutofillStatus;
  if (!parsed.name && !parsed.arrival) {
    if (status) {
      status.textContent = "Couldn't read that — paste the full Airbnb booking email.";
      status.className = "airbnb-import-status err";
    }
    return;
  }
  document.querySelector('[data-form-channel="Airbnb"]')?.click(); // channel = Airbnb (+ its deposit default)
  if (els.villaInput && parsed.villa) els.villaInput.value = parsed.villa; // villa auto-detected from listing
  if (els.guestInput && parsed.name) els.guestInput.value = parsed.name;
  if (els.arrivalInput && parsed.arrival) els.arrivalInput.value = parsed.arrival;
  if (parsed.nights) setNightsChoice(parsed.nights);
  if (els.revenueInput && parsed.hostPayout) els.revenueInput.value = parsed.hostPayout; // YOUR payout, not guest total
  if (els.paidInput && parsed.hostPayout) els.paidInput.value = parsed.hostPayout; // Airbnb collects in full -> no balance to chase
  if (status) {
    const bits = [parsed.name, parsed.villa, parsed.arrival, parsed.nights ? `${parsed.nights}n` : "", parsed.hostPayout ? `RM ${parsed.hostPayout}` : ""].filter(Boolean).join(" · ");
    status.textContent = `Filled: ${bits}${parsed.code ? ` · ${parsed.code}` : ""}. Add the guest's phone if you'll WhatsApp them, then Save.`;
    status.className = "airbnb-import-status ok";
  }
}

function openBookingDialog(booking = null) {
  els.dialogTitle.textContent = booking ? "Edit Booking" : "Add Booking";
  els.bookingId.value = booking?.id || "";
  els.channelInput.value = booking?.channel || "Direct";
  syncBookingChannelChoice();
  if (els.guestTitleInput) els.guestTitleInput.value = booking?.guestTitle === "Ms" ? "Ms" : "Mr";
  syncGuestTitleChoice();
  els.guestInput.value = booking?.guest || "";
  els.contactInput.value = booking?.contact || "";
  if (els.guestEmailInput) els.guestEmailInput.value = booking?.guestEmail || "";
  if (els.incidentLogInput) els.incidentLogInput.value = booking?.incidentLog || "";
  if (els.villaInput) els.villaInput.value = booking ? (booking.villa === "Windmill" ? "Windmill" : "Sunrise") : (appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise");
  if (els.statusInput) els.statusInput.value = booking?.status || (booking ? "confirmed" : "confirmed");
  els.excludeCalculationsInput.checked = Boolean(booking?.excludeFromCalculations);
  els.arrivalInput.value = booking?.arrival || `${selectedMonth}-01`;
  setNightsChoice(booking?.nights || 1);
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
    billAddress: "",
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
    id: safeRecordId(els.documentId.value),
    type: els.docType.value,
    issuer: els.docIssuer.value,
    date: els.docDate.value || isoDate(new Date()),
    status: els.docStatus.value,
    bookingType: els.docBookingType.value,
    guestName: els.docGuestName.value.trim(),
    billTo: els.docBillTo.value.trim(),
    billAddress: els.docBillAddress.value.trim(),
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
  els.docBillAddress.value = normalized.billAddress;
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
  if (els.documentCodePreview) els.documentCodePreview.textContent = normalized.code;
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
        ${normalized.billTo ? `<p>${escapeHtml(normalized.billTo)}</p>` : ""}
        ${normalized.billAddress ? `<p class="doc-address">${escapeMultiline(normalized.billAddress)}</p>` : ""}
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
  if (els.documentCodePreview) els.documentCodePreview.textContent = current.code;
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
  createRecoverySnapshot("Before document deleted");
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
      const haystack = `${doc.code} ${doc.type} ${doc.issuer} ${doc.guestName} ${doc.billTo} ${doc.billAddress} ${doc.propertyName} ${doc.checkIn} ${doc.checkOut}`.toLowerCase();
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
  renderTaxExpenses();
}

function taxExpenseFilters() {
  return {
    year: Number(els.taxExpenseYearFilter?.value || taxPlan.year || currentYear()),
    month: els.taxExpenseMonthFilter?.value || "All",
    category: els.taxExpenseCategoryFilter?.value || "All",
    receipt: els.taxExpenseReceiptFilter?.value || "All",
    search: els.taxExpenseSearch?.value.trim().toLowerCase() || "",
  };
}

function filteredTaxExpenses() {
  const filters = taxExpenseFilters();
  return (taxPlan.expenses || [])
    .filter((expense) => {
      const date = new Date(`${expense.date}T00:00:00`);
      if (Number.isNaN(date.getTime())) return false;
      if (date.getFullYear() !== filters.year) return false;
      if (filters.month !== "All" && expense.date.slice(5, 7) !== filters.month) return false;
      if (filters.category !== "All" && expense.category !== filters.category) return false;
      if (filters.receipt === "Missing" && (expense.receipt || expense.attachment?.dataUrl)) return false;
      if (filters.receipt === "Attached" && !expense.attachment?.dataUrl) return false;
      if (filters.receipt === "Review" && expense.reviewed) return false;
      const haystack = `${expense.entity} ${expense.property} ${expense.category} ${expense.type} ${expense.deductible} ${expense.vendor} ${expense.payment} ${expense.claimStatus} ${expense.receipt} ${expense.notes}`.toLowerCase();
      return !filters.search || haystack.includes(filters.search);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderTaxExpenseSelects() {
  if (els.taxExpenseCategory && !els.taxExpenseCategory.options.length) {
    els.taxExpenseCategory.innerHTML = taxExpenseCategories.map((category) => `<option>${escapeHtml(category)}</option>`).join("");
  }
  if (els.taxExpenseCategoryFilter && els.taxExpenseCategoryFilter.options.length <= 1) {
    els.taxExpenseCategoryFilter.innerHTML = `<option value="All">All categories</option>${taxExpenseCategories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}`;
  }
}

function clearTaxExpenseForm() {
  if (!els.taxExpenseForm) return;
  els.taxExpenseForm.reset();
  els.taxExpenseId.value = "";
  els.taxExpenseDate.value = isoDate(new Date());
  els.taxExpenseEntity.value = "Enterprise";
  els.taxExpenseProperty.value = "Sunrise Villa";
  els.taxExpenseCategory.value = "Housekeeping";
  els.taxExpenseType.value = "One-off";
  els.taxExpenseDeductible.value = "Deductible";
  els.taxExpensePayment.value = "Bank Transfer";
  els.taxExpenseClaimStatus.value = "Paid by business";
  els.taxExpenseReviewed.checked = false;
  pendingTaxExpenseAttachment = null;
  removePendingTaxExpenseAttachment = false;
  if (els.taxExpenseAttachment) els.taxExpenseAttachment.value = "";
  if (els.taxExpenseAttachmentStatus) els.taxExpenseAttachmentStatus.textContent = "No file attached";
}

function formTaxExpense() {
  const now = new Date().toISOString();
  const existing = (taxPlan.expenses || []).find((expense) => expense.id === els.taxExpenseId.value);
  return normalizeTaxExpense({
    id: safeRecordId(els.taxExpenseId.value),
    date: els.taxExpenseDate.value || isoDate(new Date()),
    entity: els.taxExpenseEntity.value,
    property: els.taxExpenseProperty.value,
    category: els.taxExpenseCategory.value,
    type: els.taxExpenseType.value,
    deductible: els.taxExpenseDeductible.value,
    vendor: els.taxExpenseVendor.value.trim(),
    payment: els.taxExpensePayment.value,
    claimStatus: els.taxExpenseClaimStatus.value,
    receipt: els.taxExpenseReceipt.value.trim(),
    attachment: pendingTaxExpenseAttachment || (removePendingTaxExpenseAttachment ? null : existing?.attachment || null),
    reviewed: els.taxExpenseReviewed.checked,
    notes: els.taxExpenseNotes.value.trim(),
    amount: Number(els.taxExpenseAmount.value || 0),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
}

function fileToTaxAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        dataUrl: String(reader.result || ""),
        attachedAt: new Date().toISOString(),
      });
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function receiptLabel(expense) {
  if (expense.attachment?.dataUrl) return "Attached";
  if (expense.receipt) return "Ref only";
  return "Missing";
}

function attachmentLink(expense) {
  const href = safeDataUrl(expense.attachment?.dataUrl, ["data:image/", "data:application/pdf"]);
  if (!href) return "";
  return `<a class="small-action" href="${escapeHtml(href)}" download="${escapeHtml(expense.attachment.name || "receipt")}" title="${escapeHtml(expense.attachment.name || "Receipt")}">View</a>`;
}

function fillTaxExpenseForm(id) {
  const expense = (taxPlan.expenses || []).find((item) => item.id === id);
  if (!expense) return;
  renderTaxExpenseSelects();
  els.taxExpenseId.value = expense.id;
  els.taxExpenseDate.value = expense.date;
  els.taxExpenseEntity.value = expense.entity;
  els.taxExpenseProperty.value = expense.property;
  els.taxExpenseCategory.value = expense.category;
  els.taxExpenseType.value = expense.type;
  els.taxExpenseDeductible.value = expense.deductible;
  els.taxExpenseAmount.value = expense.amount;
  els.taxExpenseVendor.value = expense.vendor;
  els.taxExpensePayment.value = expense.payment;
  els.taxExpenseClaimStatus.value = expense.claimStatus;
  els.taxExpenseReceipt.value = expense.receipt;
  els.taxExpenseReviewed.checked = Boolean(expense.reviewed);
  els.taxExpenseNotes.value = expense.notes;
  pendingTaxExpenseAttachment = null;
  removePendingTaxExpenseAttachment = false;
  if (els.taxExpenseAttachment) els.taxExpenseAttachment.value = "";
  if (els.taxExpenseAttachmentStatus) {
    els.taxExpenseAttachmentStatus.textContent = expense.attachment?.name ? `Attached: ${expense.attachment.name}` : "No file attached";
  }
}

function saveTaxExpense(event) {
  event.preventDefault();
  if (!els.taxExpenseForm.reportValidity()) return;
  const expense = formTaxExpense();
  taxPlan = {
    ...taxPlan,
    expenses: (taxPlan.expenses || []).some((item) => item.id === expense.id)
      ? taxPlan.expenses.map((item) => (item.id === expense.id ? expense : item))
      : [expense, ...(taxPlan.expenses || [])],
  };
  saveTaxPlan();
  clearTaxExpenseForm();
  renderTaxExpenses();
}

function deleteTaxExpense(id) {
  if (!window.confirm("Delete this expense record?")) return;
  createRecoverySnapshot("Before tax expense deleted");
  taxPlan = { ...taxPlan, expenses: (taxPlan.expenses || []).filter((expense) => expense.id !== id) };
  saveTaxPlan();
  renderTaxExpenses();
}

function taxExpenseExportRows(rows = filteredTaxExpenses()) {
  return rows.map((expense) => [
    expense.date,
    expense.entity,
    expense.property,
    expense.category,
    expense.type,
    expense.deductible,
    expense.vendor || "-",
    expense.notes || "-",
    expense.payment || "-",
    expense.claimStatus,
    expense.receipt || "-",
    expense.attachment?.name || "-",
    expense.reviewed ? "Reviewed" : "Pending",
    Number(expense.amount || 0),
  ]);
}

function renderTaxExpenses() {
  if (!els.taxExpenseRows) return;
  renderTaxExpenseSelects();
  if (els.taxExpenseYearFilter && !els.taxExpenseYearFilter.value) els.taxExpenseYearFilter.value = taxPlan.year || currentYear();
  if (els.taxExpenseDate && !els.taxExpenseDate.value) clearTaxExpenseForm();
  const rows = filteredTaxExpenses();
  const filters = taxExpenseFilters();
  const total = rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const missingReceiptCount = rows.filter((expense) => !expense.receipt && !expense.attachment?.dataUrl).length;
  const reviewPendingCount = rows.filter((expense) => !expense.reviewed).length;
  const byCategory = rows.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + Number(expense.amount || 0);
    return acc;
  }, {});
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (els.taxExpenseTableTitle) els.taxExpenseTableTitle.textContent = `${filters.year} Expense List`;
  if (els.taxExpenseSummary) {
    els.taxExpenseSummary.innerHTML = `
      <article class="tax-expense-card"><span>Total expenses</span><strong>${money(total)}</strong></article>
      <article class="tax-expense-card"><span>Missing receipts</span><strong>${missingReceiptCount}</strong></article>
      <article class="tax-expense-card"><span>Review pending</span><strong>${reviewPendingCount}</strong></article>
      <article class="tax-expense-card"><span>Top category</span><strong>${escapeHtml(topCategories[0]?.[0] || "-")}</strong></article>
    `;
  }
  els.taxExpenseRows.innerHTML = rows.length
    ? rows
        .map(
          (expense) => `
            <tr>
              <td>${shortDate(expense.date)}</td>
              <td>${escapeHtml(expense.entity)}</td>
              <td>${escapeHtml(expense.property)}</td>
              <td><span class="doc-status">${escapeHtml(expense.category)}</span></td>
              <td>${escapeHtml(expense.vendor || "-")}</td>
              <td>${escapeHtml(receiptLabel(expense))}<br><span class="table-muted">${escapeHtml(expense.receipt || expense.attachment?.name || "-")}</span>${attachmentLink(expense)}</td>
              <td>${expense.reviewed ? "Reviewed" : "Pending"}</td>
              <td><strong>${money(expense.amount)}</strong></td>
              <td class="actions">
                <button class="small-action" type="button" data-edit-tax-expense="${expense.id}">Edit</button>
                <button class="small-action danger-action" type="button" data-delete-tax-expense="${expense.id}">Delete</button>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="9" class="empty-state">No expense records for this filter.</td></tr>`;
}

function exportTaxExpensesExcel() {
  const headers = ["Date", "Business", "Property", "Category", "Type", "Tax Status", "Supplier", "Description", "Payment", "Claim Status", "Receipt", "Attachment", "Review", "Amount"];
  const rows = taxExpenseExportRows();
  const tableHtml = `
    <table>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      ${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}
    </table>
  `;
  const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel" });
  const link = document.createElement("a");
  link.download = `sunrise-villa-tax-expenses-${taxExpenseFilters().year}.xls`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportTaxExpensesPdf() {
  const filters = taxExpenseFilters();
  const rows = filteredTaxExpenses();
  const total = rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>Sunrise Villa Tax Expenses</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 28px; color: #2f1e28; }
          h1 { margin: 0 0 6px; }
          p { margin: 0 0 18px; color: #6f5b64; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e8cfc8; padding: 8px; text-align: left; }
          th { background: #fff1f6; }
          .total { margin: 18px 0; font-weight: 800; }
        </style>
      </head>
      <body>
        <h1>Sunrise Villa Tax Expense Report</h1>
        <p>${filters.year} ${filters.month === "All" ? "All months" : monthLabel(`${filters.year}-${filters.month}`)} · ${filters.category === "All" ? "All categories" : escapeHtml(filters.category)}</p>
        <div class="total">Total Expenses: ${money(total)}</div>
        <table>
          <thead><tr><th>Date</th><th>Business</th><th>Property</th><th>Category</th><th>Tax</th><th>Claim</th><th>Receipt</th><th>Review</th><th>Amount</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (expense) => `
                  <tr>
                    <td>${shortDate(expense.date)}</td>
                    <td>${escapeHtml(expense.entity)}</td>
                    <td>${escapeHtml(expense.property)}</td>
                    <td>${escapeHtml(expense.category)}</td>
                    <td>${escapeHtml(expense.deductible)}</td>
                    <td>${escapeHtml(expense.claimStatus)}</td>
                    <td>${escapeHtml(expense.receipt || expense.attachment?.name || receiptLabel(expense))}</td>
                    <td>${expense.reviewed ? "Reviewed" : "Pending"}</td>
                    <td>${money(expense.amount)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function renderMonthButtons() {
  if (!els.monthButtonGrid) return;
  const [year, selectedMonthNumber] = selectedMonth.split("-").map(Number);
  if (els.monthYearLabel) els.monthYearLabel.textContent = String(year);
  els.monthButtonGrid.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const monthValue = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const monthTotals = totalsFor(monthValue);
    const isActive = monthNumber === selectedMonthNumber;
    const hasBookings = monthTotals.bookings > 0;
    return `
      <button class="month-button ${isActive ? "active" : ""} ${hasBookings ? "has-bookings" : ""}" type="button" data-month-value="${monthValue}" aria-pressed="${isActive}">
        <span>${shortMonthName(index)}</span>
        ${hasBookings ? `<small>${monthTotals.bookings}</small>` : ""}
      </button>
    `;
  }).join("");
}

function setSelectedMonth(monthValue, syncBookingFilter = true) {
  selectedMonth = monthValue;
  if (syncBookingFilter) {
    appSettings = { ...appSettings, bookingMonthFilter: "Selected" };
    if (els.bookingMonthFilter) els.bookingMonthFilter.value = "Selected";
    saveAppSettings();
  }
}

// Improvement #1: guests arriving soon who still need their check-in info OR a phone number.
// Typed Send-today items across the guest lifecycle. Each type ages out naturally
// (no extra stored flags) so the list stays a clean "what to message right now".
function sendTodayItems() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = isoDate(today);
  const horizon7 = addDays(today, 7);
  const items = [];
  scopedBookings().forEach((b) => {
    const arr = dateObj(b.arrival);
    const dep = dateObj(departureFor(b));
    const hasPhone = !!formatPhoneForWhatsapp(b.contact);
    // 1) Pre-arrival check-in info (≤7 days out, not yet sent OR phone missing)
    if (arr >= today && arr <= horizon7 && (!b.checkinSentAt || !hasPhone)) {
      items.push({ booking: b, type: "checkin", label: `arrives ${shortDate(b.arrival)} · check-in info` });
    }
    // 2) Deposit not received (current/future booking with an expected deposit)
    if (dep >= today && Number(b.depositAmount || 0) > 0 && !b.depositPaid) {
      items.push({ booking: b, type: "deposit", label: `arrives ${shortDate(b.arrival)} · deposit ${money(b.depositAmount)} unpaid` });
    }
    // 3) Mid-stay check-in (stay ≥3 nights, the day after arrival only) — clears once sent today
    if (Number(b.nights || 0) >= 3 && isoDate(addDays(arr, 1)) === todayIso && b.sentLog?.midstay !== todayIso) {
      items.push({ booking: b, type: "midstay", label: `in-house · mid-stay check` });
    }
    // 4) Review request (departed today or in the last 2 days) — clears once sent today; not nagged beyond the window
    if (dep <= today && dep >= addDays(today, -2) && b.sentLog?.review !== todayIso) {
      items.push({ booking: b, type: "review", label: `checked out ${shortDate(departureFor(b))} · ask for review` });
    }
  });
  const order = { checkin: 0, deposit: 1, midstay: 2, review: 3 };
  return items.sort((a, b) => (order[a.type] - order[b.type]) || a.booking.arrival.localeCompare(b.booking.arrival));
}

// Improvement #3: open / gap nights in the active villa's calendar for the next window.
// "gap" = empty nights bounded by bookings on both sides (hardest to fill); "open" = open-ended.
function upcomingVacancies(daysAhead = 45) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = addDays(today, daysAhead);
  const intervals = scopedBookings()
    .map((b) => ({ start: dateObj(b.arrival), end: dateObj(departureFor(b)) }))
    .filter((iv) => iv.end > today)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  intervals.forEach((iv) => {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      merged.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  });
  const clip = (d) => (d < today ? today : d > horizon ? horizon : d);
  const out = [];
  let cursor = today;
  let passed = false;
  merged.forEach((iv) => {
    const gapStart = clip(cursor);
    const gapEnd = clip(iv.start);
    if (gapEnd > gapStart) {
      const nights = Math.round((gapEnd - gapStart) / 86400000);
      if (nights > 0) out.push({ start: isoDate(gapStart), end: isoDate(gapEnd), nights, type: passed ? "gap" : "open" });
    }
    if (iv.end > cursor) {
      cursor = iv.end;
      passed = true;
    }
  });
  if (cursor < horizon) {
    const s = clip(cursor);
    const nights = Math.round((horizon - s) / 86400000);
    if (nights > 0) out.push({ start: isoDate(s), end: isoDate(horizon), nights, type: "open" });
  }
  return out;
}

function renderToday() {
  const bookings = scopedBookings();
  const host = document.querySelector("#todayContent");
  if (!host) return;
  const todayIso = isoDate(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmtNights = (n) => `${n} night${Number(n) === 1 ? "" : "s"}`;

  const arrivals = bookings.filter((b) => b.arrival === todayIso).sort((a, b) => a.guest.localeCompare(b.guest));
  const departures = bookings.filter((b) => departureFor(b) === todayIso);
  const inhouse = bookings.filter((b) => overlapsDate(b, todayIso));

  const daysFromToday = (iso) => Math.round((dateObj(iso) - today) / 86400000);
  const airbnbPayouts = [];
  const directBalances = [];
  const depositRefunds = [];
  bookings.forEach((b) => {
    if (isExcludedBooking(b)) return;
    const dep = dateObj(departureFor(b));
    const bal = balanceFor(b);
    if (b.channel === "Airbnb") {
      // Money owed by Airbnb (held until release ~24h after check-in). Show near-term ones.
      const release = airbnbReleaseDate(b);
      const relDays = daysFromToday(release);
      if (relDays >= 0 && relDays <= 30) airbnbPayouts.push({ b, release, relDays, amount: Number(b.revenue || 0) });
    } else if (bal > 0 && dep >= today) {
      // Direct: balance still owed (should be settled 2–4 weeks before arrival).
      directBalances.push({ b, bal, daysToArrival: daysFromToday(b.arrival), depositPaid: b.depositPaid, depositAmount: Number(b.depositAmount || 0) });
    }
    // Security deposit to refund after checkout (both channels).
    if (b.depositPaid && !b.depositRefunded && Number(b.depositAmount || 0) > 0 && dep < today) {
      depositRefunds.push({ b, dep });
    }
  });
  airbnbPayouts.sort((a, b) => a.release.localeCompare(b.release));
  directBalances.sort((a, b) => a.b.arrival.localeCompare(b.b.arrival));
  depositRefunds.sort((a, b) => a.dep - b.dep);
  const attentionCount = airbnbPayouts.length + directBalances.length + depositRefunds.length;

  const guestRow = (b, meta) => `
    <div class="today-row">
      <span class="today-avatar">${prefixFor(b.guest)}</span>
      <div class="today-row-main">
        <strong>${escapeHtml(b.guest)} ${returningBadgeHtml(b, bookings)}${blocklistBadgeHtml(b)}</strong>
        <span>${b.villa === "Windmill" ? "Windmill" : "Sunrise"} · ${meta}</span>
      </div>
      ${channelBadgeFor(b)}
    </div>`;

  const emptyMsg = (t) => `<div class="today-empty">${t}</div>`;
  const col = (title, count, rowsHtml, emptyText) => `
    <section class="today-card">
      <div class="today-card-head"><h3>${title}</h3><span class="count-pill">${count}</span></div>
      <div class="today-card-body">${rowsHtml || emptyMsg(emptyText)}</div>
    </section>`;

  // --- "Send today": typed lifecycle nudges with inline phone capture ---
  const fmtN = (n) => `${n} night${Number(n) === 1 ? "" : "s"}`;
  const sendList = sendTodayItems();
  const sendBtnLabel = { checkin: "Send check-in", deposit: "Request deposit", midstay: "Mid-stay check", review: "Ask for review" };
  const sendRows = sendList
    .map(({ booking: b, type, label }) => {
      const villa = b.villa === "Windmill" ? "Windmill" : "Sunrise";
      const hasPhone = !!formatPhoneForWhatsapp(b.contact);
      const sentToday = !!(b.sentLog && b.sentLog[type] === todayIso);
      const btnText = sentToday ? "✓ Sent · resend" : type === "checkin" && b.checkinSentAt ? "Resend check-in" : sendBtnLabel[type];
      const action = hasPhone
        ? `<button class="small-action wa-action${sentToday ? " sent" : ""}" type="button" data-send="${type}" data-send-id="${b.id}">${btnText}</button>`
        : `<div class="send-phone">
             <input type="tel" inputmode="tel" placeholder="+60 12-345 6789" data-contact-input="${b.id}" aria-label="WhatsApp number for ${escapeHtml(b.guest)}" />
             <button class="small-action" type="button" data-set-contact="${b.id}">Save</button>
           </div>`;
      return `
        <div class="today-row send-row send-${type}${sentToday ? " sent" : ""}">
          <span class="today-avatar">${prefixFor(b.guest)}</span>
          <div class="today-row-main">
            <strong>${escapeHtml(b.guest)} ${returningBadgeHtml(b, bookings)}${blocklistBadgeHtml(b)}</strong>
            <span>${villa} · ${label}${hasPhone ? "" : " · <em>needs WhatsApp number</em>"}</span>
          </div>
          ${action}
        </div>`;
    })
    .join("");
  const sendCard = `
    <section class="today-card today-send">
      <div class="today-card-head"><h3>Send today</h3><span class="count-pill">${sendList.length}</span></div>
      <div class="today-card-body">${sendRows || emptyMsg("Nothing to send right now.")}</div>
    </section>`;

  // --- Improvement #3: open / gap nights ahead ---
  const vacancies = upcomingVacancies(45);
  const vacRows = vacancies
    .slice(0, 6)
    .map((v) => {
      const tight = v.type === "gap" && v.nights <= 2;
      const tag = v.type === "gap" ? "gap between stays" : "open";
      return `
        <div class="today-row vacancy-row${tight ? " tight" : ""}">
          <div class="today-row-main">
            <strong>${shortDate(v.start)} → ${shortDate(v.end)}</strong>
            <span>${fmtN(v.nights)} free · ${tag}</span>
          </div>
          ${tight ? `<span class="today-flag due">Hard to fill</span>` : ""}
        </div>`;
    })
    .join("");
  const vacancyCard = `
    <section class="today-card today-vacancy">
      <div class="today-card-head"><h3>Open nights ahead</h3><span class="count-pill">${vacancies.length}</span></div>
      <div class="today-card-body">${vacRows || emptyMsg("Fully booked for the next 6 weeks. 🎉")}</div>
    </section>`;

  // --- Needs your attention: split by money type (Airbnb payouts / Direct balances / refunds) ---
  const attnRow = (b, flag, sub) => `
    <div class="today-row">
      <span class="today-avatar">${prefixFor(b.guest)}</span>
      <div class="today-row-main"><strong>${escapeHtml(b.guest)} ${returningBadgeHtml(b, bookings)}${blocklistBadgeHtml(b)}</strong><span>${b.villa === "Windmill" ? "Windmill" : "Sunrise"} · ${sub}</span></div>
      ${flag}
    </div>`;
  const relText = (d) => (d === 0 ? "today" : `in ${d}d`);
  const airbnbRowsHtml = airbnbPayouts
    .map(({ b, release, relDays, amount }) => attnRow(b, `<span class="today-flag pend">Airbnb payout ${money(amount)}</span>`, `releases ${shortDate(release)} (${relText(relDays)})`))
    .join("");
  const arrivalText = (d) => (d > 0 ? `arrives in ${d} day${d === 1 ? "" : "s"}` : d === 0 ? "arrives today" : "in-house — balance overdue");
  const depositText = (paid, amt) => (amt > 0 ? (paid ? `deposit ${money(amt)} ✓ held` : `deposit ${money(amt)} ⚠ not collected`) : "");
  const directRowsHtml = directBalances
    .map(({ b, bal, daysToArrival, depositPaid, depositAmount }) => {
      const tone = daysToArrival <= 28 ? "due" : "pend"; // within the 4-week payment window = urgent
      const dep = depositText(depositPaid, depositAmount);
      return attnRow(b, `<span class="today-flag ${tone}">${money(bal)} balance</span>`, `${arrivalText(daysToArrival)}${dep ? " · " + dep : ""}`);
    })
    .join("");
  const refundRowsHtml = depositRefunds
    .map(({ b }) => attnRow(b, `<span class="today-flag pend">Refund ${money(b.depositAmount)}</span>`, `checked out ${shortDate(departureFor(b))}`))
    .join("");
  const groupLabel = (t) => `<div class="attn-group-label">${t}</div>`;
  const attentionBody = attentionCount
    ? [
        airbnbRowsHtml ? groupLabel("Airbnb — payout pending") + airbnbRowsHtml : "",
        directRowsHtml ? groupLabel("Direct — balance due") + directRowsHtml : "",
        refundRowsHtml ? groupLabel("Deposit refunds due") + refundRowsHtml : "",
      ].join("")
    : emptyMsg("All caught up — nothing needs action.");

  host.innerHTML = `
    <div class="today-headline">
      <p class="eyebrow">Daily operations</p>
      <h3 class="today-date">${new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace("Sept", "Sep")}</h3>
    </div>
    <div class="today-columns">
      ${col("Arrivals today", arrivals.length, arrivals.map((b) => guestRow(b, `${fmtNights(b.nights)} · out ${shortDate(departureFor(b))}`)).join(""), "No arrivals today.")}
      ${col("In-house now", inhouse.length, inhouse.map((b) => guestRow(b, `until ${shortDate(departureFor(b))}`)).join(""), "No guests in-house.")}
      ${col("Departures today", departures.length, departures.map((b) => guestRow(b, "checking out")).join(""), "No departures today.")}
    </div>
    <div class="today-action-grid">
      ${sendCard}
      ${vacancyCard}
    </div>
    <section class="today-card today-attention">
      <div class="today-card-head"><h3>Needs your attention</h3><span class="count-pill">${attentionCount}</span></div>
      <div class="today-card-body">${attentionBody}</div>
    </section>`;
}

function renderAll() {
  applyAccent();
  renderVillaSwitch();
  renderBookingCandidates();
  renderToday();
  els.monthPicker.value = selectedMonth;
  renderMonthButtons();
  renderCalendar();
  renderIcalSettings();
  renderDetails();
  renderDashboard();
  renderBookingsTable();
  renderGuests();
  renderGuide();
  renderMessageGenerator();
  renderDataHealth();
  renderDocuments();
  renderTaxPlan();
  setupDashboardToggles();
  applyDashboardMode();
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
    renderAll();
  });
});

els.icalSyncBtn?.addEventListener("click", syncIcalNow);
els.icalSunriseUrl?.addEventListener("change", persistIcalSources);
els.icalWindmillUrl?.addEventListener("change", persistIcalSources);

document.querySelectorAll(".villa-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    appSettings = { ...appSettings, activeVilla: tab.dataset.villa === "Windmill" ? "Windmill" : "Sunrise" };
    saveAppSettings();
    loadVillaMessageIntoForm(); // show the active villa's own message block (no Sunrise↔Windmill bleed)
    renderAll();
  });
});

els.airbnbAutofillBtn?.addEventListener("click", autofillBookingFromAirbnbEmail);

document.querySelector("#bookingCandidatesQueue")?.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add-candidate]");
  const dismiss = event.target.closest("[data-dismiss-candidate]");
  if (add) importBookingCandidate(add.dataset.addCandidate);
  else if (dismiss) dismissBookingCandidate(dismiss.dataset.dismissCandidate);
});

els.monthPicker.addEventListener("change", () => {
  setSelectedMonth(els.monthPicker.value);
  renderAll();
});

els.monthButtonGrid?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-month-value]");
  if (!button) return;
  setSelectedMonth(button.dataset.monthValue);
  renderAll();
});

els.prevMonth.addEventListener("click", () => {
  const [year, month] = selectedMonth.split("-").map(Number);
  setSelectedMonth(`${year - 1}-${String(month).padStart(2, "0")}`);
  renderAll();
});

els.nextMonth.addEventListener("click", () => {
  const [year, month] = selectedMonth.split("-").map(Number);
  setSelectedMonth(`${year + 1}-${String(month).padStart(2, "0")}`);
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

document.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
  button.addEventListener("click", (event) => {
    const modeButton = event.currentTarget;
    appSettings = { ...appSettings, dashboardMode: modeButton.dataset.dashboardMode === "annual" ? "annual" : "monthly" };
    saveAppSettings();
    applyDashboardMode();
    renderAll();
  });
});

document.querySelectorAll("[data-form-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    els.channelInput.value = button.dataset.formChannel;
    syncBookingChannelChoice();
    applyChannelDepositDefault();
  });
});

document.querySelectorAll("[data-title-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    els.guestTitleInput.value = button.dataset.titleChoice;
    syncGuestTitleChoice();
  });
});

document.querySelectorAll("[data-nights-choice]").forEach((button) => {
  button.addEventListener("click", () => setNightsChoice(button.dataset.nightsChoice));
});

els.nightsManualInput?.addEventListener("input", () => {
  els.nightsInput.value = Math.max(4, Number(els.nightsManualInput.value || 4));
  syncNightsChoice();
});

els.arrivalInput?.addEventListener("change", updateCheckoutEcho);

els.excludeCalculationsInput?.addEventListener("change", applyExcludedBookingDefaults);

els.form.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const id = safeRecordId(els.bookingId.value);
  const excluded = els.excludeCalculationsInput.checked;
  // Guard the costliest data-entry mistake: a paying booking saved at RM 0 silently
  // corrupts every downstream total. Confirm before allowing it (skip for complimentary).
  if (!excluded && Number(els.revenueInput.value || 0) === 0) {
    if (!window.confirm("Accommodation fee is RM 0 for this booking. Save it as a zero-revenue booking?")) {
      els.revenueInput.focus();
      return;
    }
  }
  const existing = bookings.find((booking) => booking.id === id);
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
    // additive automation/CRM fields
    villa: els.villaInput?.value === "Windmill" ? "Windmill" : "Sunrise",
    status: els.statusInput?.value || "confirmed",
    guestEmail: els.guestEmailInput?.value.trim() || "",
    checkinSentAt: existing?.checkinSentAt ?? null,
    reminderSentAt: existing?.reminderSentAt ?? null,
    incidentLog: els.incidentLogInput?.value.trim() ?? (existing?.incidentLog || ""),
  };

  bookings = bookings.some((booking) => booking.id === id)
    ? bookings.map((booking) => (booking.id === id ? nextBooking : booking))
    : [...bookings, nextBooking];

  setSelectedMonth(nextBooking.arrival.slice(0, 7));
  saveBookings();
  els.dialog.close();
  renderAll();
});

// Calendar: a manual booking chip opens that booking (it looked clickable but was inert).
els.calendarGrid?.addEventListener("click", (event) => {
  const chip = event.target.closest(".booking-chip.clickable");
  if (!chip || !chip.dataset.bookingId) return;
  const booking = bookings.find((b) => b.id === chip.dataset.bookingId);
  if (booking) openBookingDialog(booking);
});

els.bookingRows.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  const waId = event.target.dataset.wa;
  if (waId) {
    const booking = bookings.find((item) => item.id === waId);
    if (booking) openWhatsappForBooking(booking, "checkin"); // one-click: opens WhatsApp with the check-in message
    return;
  }
  if (editId) {
    const booking = bookings.find((item) => item.id === editId);
    if (booking) openBookingDialog(booking);
  }
  if (deleteId) {
    const booking = bookings.find((item) => item.id === deleteId);
    if (!window.confirm(`Delete booking for ${booking?.guest || "this guest"}?`)) return;
    createRecoverySnapshot("Before booking deleted");
    bookings = bookings.filter((item) => item.id !== deleteId);
    saveBookings();
    renderAll();
  }
});

// Improvement #1 + #2: "Send today" card — one-click check-in send + inline phone capture.
const todayContentEl = document.querySelector("#todayContent");
todayContentEl?.addEventListener("click", (event) => {
  const sendBtn = event.target.closest("[data-send]");
  if (sendBtn) {
    const type = sendBtn.dataset.send;
    const booking = bookings.find((b) => b.id === sendBtn.dataset.sendId);
    if (booking) {
      try {
        openWhatsappForBooking(booking, type);
      } catch (_) {
        /* popup blocked in some browsers — still record below */
      }
      markNudgeSent(booking.id, type);
    }
    return;
  }
  const saveBtn = event.target.closest("[data-set-contact]");
  if (saveBtn) {
    const id = saveBtn.dataset.setContact;
    const input = todayContentEl.querySelector(`[data-contact-input="${id}"]`);
    const value = input?.value || "";
    if (!formatPhoneForWhatsapp(value)) {
      window.alert("Enter a valid WhatsApp number first.");
      input?.focus();
      return;
    }
    setBookingContact(id, value);
  }
});
todayContentEl?.addEventListener("keydown", (event) => {
  const input = event.target.closest?.("[data-contact-input]");
  if (input && event.key === "Enter") {
    event.preventDefault();
    if (!formatPhoneForWhatsapp(input.value)) {
      window.alert("Enter a valid WhatsApp number first.");
      return;
    }
    setBookingContact(input.dataset.contactInput, input.value);
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
  const whatsappId = event.target.dataset.whatsappSent;
  if (whatsappId) setWhatsappSent(whatsappId, event.target.checked);
});

els.upcomingRows?.addEventListener("change", (event) => {
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

// Guest Book (CRM) wiring
const guestsListEl = document.querySelector("#guestsList");
guestsListEl?.addEventListener("change", (event) => {
  const card = event.target.closest("[data-guest-key]");
  if (!card) return;
  const key = card.dataset.guestKey;
  if (event.target.matches("[data-guest-notes]")) { setGuestProfile(key, { notes: event.target.value }); flashSaved(event.target); }
  else if (event.target.matches("[data-guest-tags]")) { setGuestProfile(key, { tags: event.target.value.split(",").map((s) => s.trim()).filter(Boolean) }); flashSaved(event.target); }
  else if (event.target.matches("[data-guest-blocklist]")) { setGuestProfile(key, { blocklist: event.target.checked }); renderGuests(); }
  else if (event.target.matches("[data-guest-consent]")) setGuestProfile(key, { consent: event.target.checked });
});
guestsListEl?.addEventListener("click", (event) => {
  const wa = event.target.closest("[data-guest-wa]");
  if (wa) openWhatsappMessage(wa.dataset.guestWa, "");
});
document.querySelector("#guestSearch")?.addEventListener("input", renderGuests);
document.querySelector("#guestReturningOnly")?.addEventListener("change", renderGuests);
document.querySelector("#exportGuestRegister")?.addEventListener("click", exportGuestRegister);

// Digital guidebook wiring
document.querySelector("#guideView")?.addEventListener("input", (event) => {
  const field = event.target.dataset.guide;
  if (field) setGuidebookField(field, event.target.value);
});
document.querySelector("#previewGuidebook")?.addEventListener("click", previewGuidebook);

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


[els.bookingMonthFilter, els.bookingSearch, els.channelFilter, els.paymentFilter, els.depositFilter, els.contactFilter].forEach((control) => {
  control?.addEventListener("input", renderBookingsTable);
  control?.addEventListener("change", () => {
    if (control === els.bookingMonthFilter) {
      appSettings = { ...appSettings, bookingMonthFilter: els.bookingMonthFilter.value };
      saveAppSettings();
    }
    renderBookingsTable();
  });
});

els.bookingColumnControls?.addEventListener("change", (event) => {
  const key = event.target.dataset.bookingColumn;
  if (!key) return;
  appSettings = {
    ...appSettings,
    bookingColumns: {
      ...(appSettings.bookingColumns || {}),
      [key]: event.target.checked,
    },
  };
  saveAppSettings();
  renderBookingsTable();
});

els.quickColumnControls?.addEventListener("change", (event) => {
  const key = event.target.dataset.quickColumn;
  if (!key) return;
  appSettings = {
    ...appSettings,
    quickColumns: {
      ...(appSettings.quickColumns || {}),
      [key]: event.target.checked,
    },
  };
  saveAppSettings();
  renderDetails();
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
  createRecoverySnapshot("Before one-off cost deleted");
  const current = profitMonth(selectedMonth);
  saveSelectedProfitMonth({
    ...current,
    oneOffCosts: current.oneOffCosts.filter((cost) => cost.id !== id),
  });
  renderDashboard();
  document.querySelector(".one-off-block")?.setAttribute("open", "");
});

els.backupNow?.addEventListener("click", downloadBackup);
els.syncCloudNow?.addEventListener("click", syncCloudNow);

els.restoreBackup?.addEventListener("change", (event) => restoreJsonFromInput(event, "backup file"));

els.restoreRecoverySnapshot?.addEventListener("click", () => {
  const snapshot = selectedRecoverySnapshot();
  if (!snapshot?.data) return;
  if (!window.confirm("Restore this recovery point? Your current data will be saved as a recovery point first.")) return;
  restoreAppData(snapshot.data);
});

els.downloadRecoverySnapshot?.addEventListener("click", () => {
  const snapshot = selectedRecoverySnapshot();
  if (!snapshot?.data) return;
  downloadJsonFile(`sunrise-villa-recovery-${isoDate(new Date(snapshot.createdAt))}.json`, snapshot.data);
});

els.messageBookingSelect?.addEventListener("change", () => fillMessageFromBooking(true));

document.querySelectorAll("[data-message-flow]").forEach((button) => {
  button.addEventListener("click", () => setMessageFlow(button.dataset.messageFlow));
});

document.querySelectorAll("[data-tax-inner-tab]").forEach((button) => {
  button.addEventListener("click", () => setTaxInnerTab(button.dataset.taxInnerTab));
});

[els.messageGuestTitle, els.messageGuestName, els.messagePhone, els.messageSecurityCode, els.messageCheckinTime, els.messageAddress, els.messageMapsLink, els.messageGuideLink, els.quoteGuestTitle, els.quoteGuestName, els.quotePhone, els.quoteTemplateInput, els.checkinTemplateInput, els.guideTemplateInput].forEach((control) => {
  control?.addEventListener("input", renderCheckinMessage);
  control?.addEventListener("change", renderCheckinMessage);
});

[
  els.quoteWeekdayNights,
  els.quoteWeekendNights,
  els.quoteHolidayNights,
  els.quoteWeekdayRate,
  els.quoteWeekendRate,
  els.quoteHolidayRate,
  els.quoteCleaningFee,
  els.quoteDamageDeposit,
  els.quoteActualCharge,
].forEach((control) => {
  control?.addEventListener("input", () => {
    renderQuickQuote(false);
    renderCheckinMessage();
  });
});

[els.quoteCheckIn, els.quoteCheckOut].forEach((control) => {
  control?.addEventListener("change", () => {
    syncQuoteNightsFromDates(true);
    renderCheckinMessage();
  });
});

els.copyQuoteMessage?.addEventListener("click", async () => {
  renderQuickQuote(false);
  renderCheckinMessage();
  await copyMessageWithFeedback(quoteMessageText(), els.copyQuoteMessage, "Copy Quote");
});

els.copyCheckinMessage?.addEventListener("click", async () => {
  await copyMessageWithFeedback(checkinMessageText(), els.copyCheckinMessage, "Copy Check-in");
});

els.copyGuideMessage?.addEventListener("click", async () => {
  const booking = selectedMessageBooking();
  const message = booking ? guestGuideMessageTextForBooking(booking) : applyTemplate(appSettings.message.templates?.guide || defaultMessageTemplates.guide, templateValuesForBooking());
  await copyMessageWithFeedback(message, els.copyGuideMessage, "Copy Guide");
});

els.openWhatsappMessage?.addEventListener("click", () => {
  renderCheckinMessage();
  const booking = selectedMessageBooking();
  if (booking) openWhatsappForBooking(booking, "checkin");
});

els.openQuoteMessage?.addEventListener("click", () => {
  renderQuickQuote(false);
  renderCheckinMessage();
  openWhatsappForQuote();
});

els.ackInquiry?.addEventListener("click", openInquiryAck);

// AI guest Q&A drafter wiring
els.aiDraftBtn?.addEventListener("click", draftGuestReply);
els.aiCopyBtn?.addEventListener("click", () => {
  if (els.aiDraft?.value) copyMessageWithFeedback(els.aiDraft.value, els.aiCopyBtn, "Copy");
});
els.aiSendBtn?.addEventListener("click", () => {
  const text = els.aiDraft?.value?.trim();
  if (!text) {
    setAiStatus("Draft a reply first.", "err");
    return;
  }
  openWhatsappMessage(els.aiPhone?.value || "", text);
});

els.openGuideMessage?.addEventListener("click", () => {
  renderCheckinMessage();
  const booking = selectedMessageBooking();
  if (booking) openWhatsappForBooking(booking, "guide");
});

els.openReminderMessage?.addEventListener("click", () => {
  renderCheckinMessage();
  const booking = selectedMessageBooking();
  if (booking) openWhatsappForBooking(booking, "reminder");
});

els.copyReminderMessage?.addEventListener("click", async () => {
  const booking = selectedMessageBooking();
  const message = booking
    ? reminderMessageTextForBooking(booking)
    : applyTemplate(appSettings.message.templates?.reminder || defaultMessageTemplates.reminder, templateValuesForBooking());
  await copyMessageWithFeedback(message, els.copyReminderMessage, "Copy Reminder");
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
  createRecoverySnapshot("Before monthly commitment deleted");
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
  els.docBillAddress,
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

els.taxExpenseForm?.addEventListener("submit", saveTaxExpense);
els.clearTaxExpense?.addEventListener("click", clearTaxExpenseForm);
els.removeTaxExpenseAttachment?.addEventListener("click", () => {
  pendingTaxExpenseAttachment = null;
  removePendingTaxExpenseAttachment = true;
  if (els.taxExpenseAttachment) els.taxExpenseAttachment.value = "";
  if (els.taxExpenseAttachmentStatus) els.taxExpenseAttachmentStatus.textContent = "Attachment will be removed";
});
els.taxExpenseAttachment?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 2_500_000) {
    event.target.value = "";
    if (els.taxExpenseAttachmentStatus) els.taxExpenseAttachmentStatus.textContent = "File too large. Use below 2.5 MB.";
    return;
  }
  try {
    pendingTaxExpenseAttachment = await fileToTaxAttachment(file);
    removePendingTaxExpenseAttachment = false;
    if (els.taxExpenseAttachmentStatus) els.taxExpenseAttachmentStatus.textContent = `Ready: ${file.name}`;
  } catch {
    pendingTaxExpenseAttachment = null;
    if (els.taxExpenseAttachmentStatus) els.taxExpenseAttachmentStatus.textContent = "Could not read file";
  }
});
[els.taxExpenseYearFilter, els.taxExpenseMonthFilter, els.taxExpenseCategoryFilter, els.taxExpenseReceiptFilter, els.taxExpenseSearch].forEach((control) => {
  control?.addEventListener("input", renderTaxExpenses);
  control?.addEventListener("change", renderTaxExpenses);
});
els.taxExpenseRows?.addEventListener("click", (event) => {
  const editId = event.target.dataset.editTaxExpense;
  if (editId) fillTaxExpenseForm(editId);
  const deleteId = event.target.dataset.deleteTaxExpense;
  if (deleteId) deleteTaxExpense(deleteId);
});
els.exportTaxExpensesExcel?.addEventListener("click", exportTaxExpensesExcel);
els.exportTaxExpensesPdf?.addEventListener("click", exportTaxExpensesPdf);

// ---------------- Theme picker (8 accents, persisted in appSettings.accent -> cloud) ----------------
const SV_THEMES = [
  // `ink` = a darkened accent that stays AA-readable (>=4.5:1 on white) for small text.
  { name: "Sage", hex: "#4B6B5B", ink: "#3E5A4C" },
  { name: "Meadow", hex: "#3FAE7C", ink: "#1F7048" },
  { name: "Teal", hex: "#2FAFA3", ink: "#1B6F67" },
  { name: "Sky", hex: "#4C9FD6", ink: "#2A6A99" },
  { name: "Lavender", hex: "#8A7BD8", ink: "#574BA0" },
  { name: "Blossom", hex: "#E175A4", ink: "#A83C68" },
  { name: "Coral", hex: "#F26D5B", ink: "#B23F2E" },
  { name: "Honey", hex: "#E0A23C", ink: "#7E5A12" },
];

function svActiveAccent() {
  return (appSettings && typeof appSettings.accent === "string" && appSettings.accent) || "#4B6B5B";
}
function svActiveInk() {
  const a = svActiveAccent().toLowerCase();
  const theme = SV_THEMES.find((t) => t.hex.toLowerCase() === a);
  return (theme && theme.ink) || a; // custom accent (no theme match) falls back to the raw accent
}

function applyAccent() {
  const a = svActiveAccent();
  const root = document.documentElement;
  root.style.setProperty("--accent", a);
  root.style.setProperty("--accent-soft", a + "22");
  root.style.setProperty("--cbc", a);
  root.style.setProperty("--accent-ink", svActiveInk());
  // faint accent wash over the warm page base (matches the reference prototypes)
  document.body.style.background = `linear-gradient(${a}12, ${a}12), #F8F8F5`;
  const dot = document.querySelector(".theme-swatch-dot");
  if (dot) dot.style.background = a;
  document.querySelectorAll(".theme-swatch").forEach((sw) => {
    sw.classList.toggle("selected", (sw.dataset.accent || "").toLowerCase() === a.toLowerCase());
  });
}

function initThemePicker() {
  const wrap = document.querySelector("#themeSwatches");
  const trigger = document.querySelector("#themeTrigger");
  const popover = document.querySelector("#themePopover");
  if (wrap && !wrap.childElementCount) {
    wrap.innerHTML = SV_THEMES.map(
      (t) => `<button class="theme-swatch" type="button" data-accent="${t.hex}" style="--sw:${t.hex}" title="${t.name}" aria-label="${t.name}"></button>`,
    ).join("");
    wrap.addEventListener("click", (event) => {
      const swatch = event.target.closest("[data-accent]");
      if (!swatch) return;
      appSettings = { ...appSettings, accent: swatch.dataset.accent };
      saveAppSettings();
      applyAccent();
    });
  }
  if (trigger && popover) {
    const close = () => {
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = popover.hidden;
      popover.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
    document.addEventListener("click", (event) => {
      if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }
  applyAccent();
}

// ---------------- Sidebar: reference hover-expand + pin model (persisted via appSettings.sidebarPinned -> cloud) ----------------
function initSidebar() {
  const shell = document.querySelector("#appShell");
  const sidebar = shell?.querySelector(".sidebar");
  const toggle = document.querySelector("#sidebarToggle");
  if (!shell || !sidebar) return;

  // Default rail = not pinned. Restore the persisted pin preference.
  const pinnedInitial = !!(appSettings && appSettings.sidebarPinned);

  // Scrim behind the hover overlay (created once, toggled via CSS class).
  let scrim = shell.querySelector(".sidebar-scrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.className = "sidebar-scrim";
    scrim.setAttribute("aria-hidden", "true");
    shell.appendChild(scrim);
  }

  const setPinned = (pinned) => {
    shell.classList.toggle("sidebar-pinned", pinned);
    if (pinned) shell.classList.remove("sidebar-hover"); // pinned overrides hover
    appSettings = { ...appSettings, sidebarPinned: pinned };
    saveAppSettings();
  };

  // Apply persisted state on boot.
  shell.classList.toggle("sidebar-pinned", pinnedInitial);

  // Hover-to-expand as overlay — only when NOT pinned (mouse + keyboard focus).
  const openHover = () => {
    if (!shell.classList.contains("sidebar-pinned")) shell.classList.add("sidebar-hover");
  };
  const closeHover = () => shell.classList.remove("sidebar-hover");

  sidebar.addEventListener("mouseenter", openHover);
  sidebar.addEventListener("mouseleave", closeHover);
  sidebar.addEventListener("focusin", openHover);
  sidebar.addEventListener("focusout", (e) => {
    if (!sidebar.contains(e.relatedTarget)) closeHover();
  });
  scrim.addEventListener("click", closeHover);

  // The toggle pins / unpins and persists.
  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    setPinned(!shell.classList.contains("sidebar-pinned"));
  });
}

// ---------------- Login UI niceties (greeting, date, show/hide password) ----------------
function initLoginUi() {
  const ui = cloudEls();
  if (ui.greeting || ui.dateLine) {
    const now = new Date();
    const hour = now.getHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    if (ui.greeting) ui.greeting.textContent = `${part}, Austin`;
    if (ui.dateLine) ui.dateLine.textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (ui.passwordToggle && ui.password) {
    ui.passwordToggle.addEventListener("click", () => {
      const reveal = ui.password.type === "password";
      ui.password.type = reveal ? "text" : "password";
      ui.passwordToggle.textContent = reveal ? "Hide" : "Show";
      ui.passwordToggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    });
  }
  if (ui.remember) ui.remember.checked = svRememberSession;
}

createStartupRecoverySnapshot();
fillDocumentForm(defaultDocumentDraft());
setMessageFlow("quote");
setTaxInnerTab("plan");
setView(activeView);
initThemePicker();
initSidebar();
initLoginUi();
renderAll();
initCloudStorage();
