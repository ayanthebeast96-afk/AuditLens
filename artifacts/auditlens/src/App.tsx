import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileBarChart,
  FileCheck2,
  FileSearch,
  FileText,
  Filter,
  Landmark,
  Link2,
  LockKeyhole,
  LayoutDashboard,
  ListFilter,
  Menu,
  PanelRightOpen,
  Play,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import vendorMasterCsv from '@assets/vendor_master_1788078370267.csv?raw';
import invoicesCsv from '@assets/invoices_1788078370267.csv?raw';
import paymentsCsv from '@assets/payments_1788078370266.csv?raw';

type Risk = 'High' | 'Medium' | 'Low';
type ExceptionType = 'Duplicate transaction' | 'Approval proximity' | 'Weekend posting' | 'Unusually large' | 'New vendor risk' | 'Transaction splitting';
type Transaction = {
  id: string;
  date: string;
  account: string;
  vendor: string;
  amount: number;
  description: string;
};
type VendorRecord = {
  vendorId: string;
  vendorName: string;
  createdDate: string;
  primaryAccount: string;
  bankAccountRef: string;
  status: string;
};
type InvoiceRecord = {
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  glTransactionId: string;
  invoiceDate: string;
  amount: number;
};
type PaymentRecord = {
  paymentId: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  bankAccountRef: string;
};
type MoneyTrailFlag = {
  message: string;
  detail?: string;
};
type MoneyTrail = {
  invoice?: InvoiceRecord;
  vendor?: VendorRecord;
  payment?: PaymentRecord;
  flags: MoneyTrailFlag[];
};
type SupportingData = {
  vendors: VendorRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  vendorFileName: string;
  invoiceFileName: string;
  paymentFileName: string;
};
type TriggeredException = {
  type: ExceptionType;
  risk: Risk;
  why: string;
  details: string;
  related: string[];
  followUp: string;
  relatedTransactions?: Transaction[];
};
type Finding = Transaction & {
  exceptions: TriggeredException[];
  risk: Risk;
  related: string[];
  moneyTrail?: MoneyTrail;
};
type AccountStatistics = {
  mean: number;
  standardDeviation: number;
  min: number;
  max: number;
};

const sampleTransactions: Transaction[] = [
  { id: 'GL-2401', date: '2024-06-03', account: '6100 · Facilities', vendor: 'Northstar Facilities', amount: 8420, description: 'June building services' },
  { id: 'GL-2402', date: '2024-06-04', account: '6210 · Software', vendor: 'Cedar Cloud Tools', amount: 9940, description: 'Annual collaboration licenses' },
  { id: 'GL-2403', date: '2024-06-05', account: '6210 · Software', vendor: 'Cedar Cloud Tools', amount: 9940, description: 'Annual collaboration licenses' },
  { id: 'GL-2404', date: '2024-06-07', account: '6400 · Travel', vendor: 'Pine & Rail Travel', amount: 2180, description: 'Client site travel' },
  { id: 'GL-2405', date: '2024-06-08', account: '6300 · Contractors', vendor: 'Morrow Studio LLC', amount: 12850, description: 'Brand system phase two' },
  { id: 'GL-2406', date: '2024-06-10', account: '6000 · Office', vendor: 'Paper Kite Supply', amount: 3760, description: 'Quarterly office supplies' },
  { id: 'GL-2417', date: '2024-06-03', account: '6000 · Office', vendor: 'Summit Office Interiors', amount: 3200, description: 'Workspace furniture deposit' },
  { id: 'GL-2418', date: '2024-06-06', account: '6000 · Office', vendor: 'Summit Office Interiors', amount: 3800, description: 'Workspace furniture delivery' },
  { id: 'GL-2419', date: '2024-06-11', account: '6000 · Office', vendor: 'Summit Office Interiors', amount: 4200, description: 'Workspace furniture installation' },
  { id: 'GL-2407', date: '2024-06-12', account: '6500 · Professional', vendor: 'Harbor Legal Group', amount: 26800, description: 'Contract review and filing' },
  { id: 'GL-2408', date: '2024-06-14', account: '6300 · Contractors', vendor: 'Morrow Studio LLC', amount: 10120, description: 'Brand system phase two' },
  { id: 'GL-2409', date: '2024-06-15', account: '6800 · Events', vendor: 'Lumen House Events', amount: 7200, description: 'Partner roundtable venue' },
  { id: 'GL-2410', date: '2024-06-18', account: '6100 · Facilities', vendor: 'Northstar Facilities', amount: 8420, description: 'June building services' },
  { id: 'GL-2411', date: '2024-06-21', account: '6710 · Equipment', vendor: 'Atlas Field Systems', amount: 43800, description: 'Mobile scanning equipment' },
  { id: 'GL-2412', date: '2024-06-22', account: '6400 · Travel', vendor: 'Pine & Rail Travel', amount: 1980, description: 'Client site travel' },
  { id: 'GL-2413', date: '2024-06-24', account: '6210 · Software', vendor: 'Cedar Cloud Tools', amount: 2280, description: 'Usage overage' },
  { id: 'GL-2414', date: '2024-06-26', account: '6900 · Miscellaneous', vendor: 'Vela Printworks', amount: 9850, description: 'Campaign materials' },
  { id: 'GL-2415', date: '2024-06-29', account: '6300 · Contractors', vendor: 'Brightline Advisory', amount: 14750, description: 'Operational review sprint' },
  { id: 'GL-2416', date: '2024-07-01', account: '6100 · Facilities', vendor: 'Northstar Facilities', amount: 8600, description: 'July building services' },
];

const testDefinitions: { type: ExceptionType; label: string; rule: string; tone: string }[] = [
  { type: 'Duplicate transaction', label: 'Duplicate transactions', rule: 'Same vendor and account, amount within $1, posted within 3 days', tone: 'rose' },
  { type: 'Approval proximity', label: 'Approval threshold proximity', rule: 'Amount falls within 5% below approval threshold', tone: 'amber' },
  { type: 'Weekend posting', label: 'Weekend postings', rule: 'Transaction date is Saturday or Sunday', tone: 'sky' },
  { type: 'Unusually large', label: 'Unusually large transactions', rule: 'Amount is more than 3 standard deviations above the mean for its own account', tone: 'plum' },
  { type: 'New vendor risk', label: 'New vendor risk', rule: 'Vendor appears exactly once in the review period', tone: 'lime' },
  { type: 'Transaction splitting', label: 'Transaction splitting', rule: '3+ sub-threshold transactions from the same vendor and account total above threshold within 10 days', tone: 'plum' },
];

const currency = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactCurrency = (value: number) => value >= 1000000 ? `$${(value / 1000000).toFixed(1)}m` : value >= 1000 ? `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : currency(value);
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const isWeekend = (value: string) => [0, 6].includes(new Date(`${value}T12:00:00`).getDay());
const calendarDay = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};
const calendarDayDistance = (first: string, second: string) => {
  const firstDay = calendarDay(first);
  const secondDay = calendarDay(second);
  return Number.isFinite(firstDay) && Number.isFinite(secondDay)
    ? Math.round(Math.abs(firstDay - secondDay) / 86_400_000)
    : Number.POSITIVE_INFINITY;
};
const riskWeight: Record<Risk, number> = { Low: 1, Medium: 2, High: 3 };

function getAccountStatistics(transactions: Transaction[]): Map<string, AccountStatistics> {
  const amountsByAccount = new Map<string, number[]>();
  transactions.forEach((tx) => {
    const key = tx.account.trim().toLowerCase();
    amountsByAccount.set(key, [...(amountsByAccount.get(key) ?? []), tx.amount]);
  });

  return new Map(Array.from(amountsByAccount.entries()).map(([account, amounts]) => {
    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const variance = amounts.reduce((sum, amount) => sum + (amount - mean) ** 2, 0) / amounts.length;
    return [account, {
      mean,
      standardDeviation: Math.sqrt(variance),
      min: Math.min(...amounts),
      max: Math.max(...amounts),
    }];
  }));
}

function findSplittingClusters(transactions: Transaction[], threshold: number): Transaction[][] {
  const groups = new Map<string, Transaction[]>();
  transactions.forEach((tx) => {
    const key = `${tx.vendor.trim().toLowerCase()}|${tx.account.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  });

  const clusters: Transaction[][] = [];
  groups.forEach((group) => {
    const ordered = [...group].sort((first, second) => calendarDay(first.date) - calendarDay(second.date) || first.id.localeCompare(second.id));
    let start = 0;
    while (start <= ordered.length - 3) {
      let end = start;
      while (end + 1 < ordered.length && calendarDayDistance(ordered[start].date, ordered[end + 1].date) <= 10) end += 1;
      const cluster = ordered.slice(start, end + 1);
      const total = cluster.reduce((sum, tx) => sum + tx.amount, 0);
      if (cluster.length >= 3 && cluster.every((tx) => tx.amount < threshold) && total > threshold) {
        clusters.push(cluster);
        start = end + 1;
      } else {
        start += 1;
      }
    }
  });
  return clusters;
}

function analyze(transactions: Transaction[], threshold: number, moneyTrailMap: Map<string, MoneyTrail>): Finding[] {
  const counts = transactions.reduce<Record<string, number>>((acc, tx) => ({ ...acc, [tx.vendor]: (acc[tx.vendor] ?? 0) + 1 }), {});
  const accountStatistics = getAccountStatistics(transactions);
  const splittingClusterById = new Map<string, Transaction[]>();
  findSplittingClusters(transactions, threshold).forEach((cluster) => {
    cluster.forEach((tx) => splittingClusterById.set(tx.id, cluster));
  });
  const result: Finding[] = [];
  transactions.forEach((tx) => {
    const duplicateMatches = transactions.filter((candidate) =>
      candidate.id !== tx.id
      && candidate.vendor.trim().toLowerCase() === tx.vendor.trim().toLowerCase()
      && candidate.account.trim().toLowerCase() === tx.account.trim().toLowerCase()
      && Math.abs(candidate.amount - tx.amount) <= 1
      && calendarDayDistance(candidate.date, tx.date) <= 3,
    );
    const exceptions: TriggeredException[] = [];
    const add = (type: ExceptionType, risk: Risk, why: string, details: string, related: string[], followUp: string, relatedTransactions?: Transaction[]) =>
      exceptions.push({ type, risk, why, details, related, followUp, relatedTransactions });
    if (duplicateMatches.length > 0) {
      const duplicateDetails = duplicateMatches.map((match) => {
        const daysApart = calendarDayDistance(tx.date, match.date);
        const dayLabel = daysApart === 1 ? 'day' : 'days';
        const timing = daysApart === 0
          ? `posted on the same date (${dateLabel(match.date)})`
          : calendarDay(match.date) < calendarDay(tx.date)
            ? `posted ${daysApart} ${dayLabel} earlier (${dateLabel(match.date)})`
            : `posted ${daysApart} ${dayLabel} later (${dateLabel(match.date)})`;
        return `Matches transaction ${match.id}, ${timing}; this transaction was posted ${dateLabel(tx.date)}. Both use the same vendor and account, with amount within $1.`;
      }).join(' ');
      add('Duplicate transaction', 'High', 'A nearby posting matches the same vendor, account, and amount within the three-day review window.', duplicateDetails, duplicateMatches.map((match) => match.id), 'Compare the source invoice and approval trail for each related posting; reverse any duplicate posting after confirmation.');
    }
    if (tx.amount >= threshold * 0.95 && tx.amount < threshold) add('Approval proximity', 'Medium', `The amount is ${currency(threshold - tx.amount)} below the configured approval threshold.`, `${currency(tx.amount)} is within the 5% proximity band below ${currency(threshold)}.`, [], 'Inspect the approval matrix and confirm the spend was reviewed at the appropriate level.');
    if (isWeekend(tx.date)) add('Weekend posting', 'Low', 'This transaction was posted on a Saturday or Sunday.', `${dateLabel(tx.date)} falls outside the standard Monday–Friday posting window.`, [], 'Confirm the posting date, supporting document date, and whether a period-end adjustment explains the timing.');
    const accountStats = accountStatistics.get(tx.account.trim().toLowerCase());
    if (accountStats && accountStats.standardDeviation > 0 && tx.amount > accountStats.mean + 3 * accountStats.standardDeviation) {
      const standardDeviationsAboveMean = (tx.amount - accountStats.mean) / accountStats.standardDeviation;
      add(
        'Unusually large',
        'High',
        `This transaction is ${currency(tx.amount)}. The typical range for ${tx.account} transactions is ${currency(accountStats.min)}–${currency(accountStats.max)} (average ${currency(accountStats.mean)}). This transaction is approximately ${standardDeviationsAboveMean.toFixed(1)} standard deviations above normal for this account.`,
        `The account mean is ${currency(accountStats.mean)} with a population standard deviation of ${currency(accountStats.standardDeviation)}. The 3-standard-deviation review point is ${currency(accountStats.mean + 3 * accountStats.standardDeviation)}, and this transaction is above it.`,
        [],
        'Vouch to contract, invoice, receipt, and evidence of service delivery. Confirm authorization.',
      );
    }
    if (counts[tx.vendor] === 1) add('New vendor risk', 'Medium', 'This vendor occurs only once in the supplied review period.', `No second posting for ${tx.vendor} appears in the current dataset, so vendor history cannot be corroborated here.`, [], 'Check vendor onboarding, tax documentation, bank details, and the business purpose before clearing.');
    const splittingCluster = splittingClusterById.get(tx.id);
    if (splittingCluster) {
      const orderedCluster = [...splittingCluster].sort((first, second) => calendarDay(first.date) - calendarDay(second.date) || first.id.localeCompare(second.id));
      const clusterStart = orderedCluster[0];
      const clusterEnd = orderedCluster[orderedCluster.length - 1];
      const clusterTotal = splittingCluster.reduce((sum, clusterTransaction) => sum + clusterTransaction.amount, 0);
      const clusterDetails = `${splittingCluster.length} transactions totaling ${currency(clusterTotal)} were posted to the same vendor (${tx.vendor}) and account (${tx.account}) within a 10-day window (${dateLabel(clusterStart.date)}–${dateLabel(clusterEnd.date)}), each individually below the ${currency(threshold)} approval threshold. This pattern may indicate an attempt to avoid required approval.`;
      add('Transaction splitting', 'High', 'A cluster of sub-threshold postings from the same vendor and account exceeds the configured approval threshold in aggregate.', clusterDetails, splittingCluster.filter((clusterTransaction) => clusterTransaction.id !== tx.id).map((clusterTransaction) => clusterTransaction.id), 'Review the purchase order, invoices, receiving evidence, and approval trail together for the full cluster. Confirm whether the postings represent one coordinated purchase.', splittingCluster);
    }
    if (exceptions.length > 0) {
      const highestRisk = exceptions.reduce<Risk>((highest, exception) =>
        riskWeight[exception.risk] > riskWeight[highest] ? exception.risk : highest, 'Low');
      result.push({
        ...tx,
        exceptions,
        risk: highestRisk,
        related: Array.from(new Set(exceptions.flatMap((exception) => exception.related))),
        moneyTrail: moneyTrailMap.get(tx.id),
      });
    }
  });
  return result;
}

function parseCsv(text: string): { rows: Transaction[]; error?: string } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: 'The file needs a header row and at least one transaction.' };
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
      else cell += character;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = parseLine(lines[0]).map((item) => item.toLowerCase().replace(/[\s-]+/g, '_'));
  const find = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const idIndex = find(['id', 'transaction_id', 'transactionid']);
  const dateIndex = find(['date', 'transaction_date', 'posting_date']);
  const accountIndex = find(['account', 'account_name', 'gl_account']);
  const vendorIndex = find(['vendor', 'vendor_name', 'payee']);
  const amountIndex = find(['amount', 'value', 'transaction_amount']);
  const descriptionIndex = find(['description', 'memo', 'details']);
  if ([idIndex, dateIndex, accountIndex, vendorIndex, amountIndex].some((index) => index === -1)) return { rows: [], error: 'Missing required columns. Include ID, date, account, vendor, and amount.' };
  const rows: Transaction[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseLine(lines[index]);
    const amount = Number(cells[amountIndex].replace(/[$,]/g, ''));
    if (!cells[idIndex] || !cells[dateIndex] || !cells[vendorIndex] || !Number.isFinite(amount)) return { rows: [], error: `Row ${index + 1} is missing an ID, date, vendor, or valid numeric amount.` };
    rows.push({ id: cells[idIndex], date: cells[dateIndex], account: cells[accountIndex] || 'Unassigned account', vendor: cells[vendorIndex], amount, description: descriptionIndex > -1 ? cells[descriptionIndex] || 'No description' : 'No description' });
  }
  return { rows, error: rows.length > 5000 ? 'This portfolio view supports up to 5,000 rows at a time.' : undefined };
}

type SupportingFileKind = 'vendor' | 'invoice' | 'payment';
type CsvTable = { headers: string[]; rows: string[][]; error?: string };

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function parseCsvTable(text: string): CsvTable {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [], error: 'The file needs a header row and at least one data row.' };
  return {
    headers: parseCsvLine(lines[0]).map((item) => item.toLowerCase().replace(/[\s-]+/g, '_')),
    rows: lines.slice(1).map(parseCsvLine),
  };
}

function parseVendorMasterCsv(text: string): { rows: VendorRecord[]; error?: string } {
  const table = parseCsvTable(text);
  if (table.error) return { rows: [], error: table.error };
  const find = (name: string) => table.headers.indexOf(name);
  const indexes = {
    vendorId: find('vendor_id'),
    vendorName: find('vendor_name'),
    createdDate: find('created_date'),
    primaryAccount: find('primary_account'),
    bankAccountRef: find('bank_account_ref'),
    status: find('status'),
  };
  if (Object.values(indexes).some((index) => index === -1)) return { rows: [], error: 'Vendor master is missing one of: vendor_id, vendor_name, created_date, primary_account, bank_account_ref, status.' };
  const rows: VendorRecord[] = [];
  for (let index = 0; index < table.rows.length; index += 1) {
    const cells = table.rows[index];
    const values = Object.fromEntries(Object.entries(indexes).map(([key, column]) => [key, cells[column] ?? '']));
    if (Object.values(values).some((value) => !value)) return { rows: [], error: `Vendor master row ${index + 2} is missing a required value.` };
    rows.push({
      vendorId: values.vendorId,
      vendorName: values.vendorName,
      createdDate: values.createdDate,
      primaryAccount: values.primaryAccount,
      bankAccountRef: values.bankAccountRef,
      status: values.status,
    });
  }
  return { rows };
}

function parseInvoicesCsv(text: string): { rows: InvoiceRecord[]; error?: string } {
  const table = parseCsvTable(text);
  if (table.error) return { rows: [], error: table.error };
  const find = (name: string) => table.headers.indexOf(name);
  const indexes = {
    invoiceId: find('invoice_id'),
    invoiceNumber: find('invoice_number'),
    vendorId: find('vendor_id'),
    glTransactionId: find('gl_transaction_id'),
    invoiceDate: find('invoice_date'),
    amount: find('amount'),
  };
  if (Object.values(indexes).some((index) => index === -1)) return { rows: [], error: 'Invoices is missing one of: invoice_id, invoice_number, vendor_id, gl_transaction_id, invoice_date, amount.' };
  const rows: InvoiceRecord[] = [];
  for (let index = 0; index < table.rows.length; index += 1) {
    const cells = table.rows[index];
    const values = Object.fromEntries(Object.entries(indexes).map(([key, column]) => [key, cells[column] ?? '']));
    const amount = Number(values.amount.replace(/[$,]/g, ''));
    if (!values.invoiceId || !values.invoiceNumber || !values.vendorId || !values.glTransactionId || !values.invoiceDate || !Number.isFinite(amount)) return { rows: [], error: `Invoices row ${index + 2} is missing a required value or valid amount.` };
    rows.push({
      invoiceId: values.invoiceId,
      invoiceNumber: values.invoiceNumber,
      vendorId: values.vendorId,
      glTransactionId: values.glTransactionId,
      invoiceDate: values.invoiceDate,
      amount,
    });
  }
  return { rows };
}

function parsePaymentsCsv(text: string): { rows: PaymentRecord[]; error?: string } {
  const table = parseCsvTable(text);
  if (table.error) return { rows: [], error: table.error };
  const find = (name: string) => table.headers.indexOf(name);
  const indexes = {
    paymentId: find('payment_id'),
    invoiceId: find('invoice_id'),
    paymentDate: find('payment_date'),
    amount: find('amount'),
    bankAccountRef: find('bank_account_ref'),
  };
  if (Object.values(indexes).some((index) => index === -1)) return { rows: [], error: 'Payments is missing one of: payment_id, invoice_id, payment_date, amount, bank_account_ref.' };
  const rows: PaymentRecord[] = [];
  for (let index = 0; index < table.rows.length; index += 1) {
    const cells = table.rows[index];
    const values = Object.fromEntries(Object.entries(indexes).map(([key, column]) => [key, cells[column] ?? '']));
    const amount = Number(values.amount.replace(/[$,]/g, ''));
    if (!values.paymentId || !values.invoiceId || !values.paymentDate || !Number.isFinite(amount) || !values.bankAccountRef) return { rows: [], error: `Payments row ${index + 2} is missing a required value or valid amount.` };
    rows.push({
      paymentId: values.paymentId,
      invoiceId: values.invoiceId,
      paymentDate: values.paymentDate,
      amount,
      bankAccountRef: values.bankAccountRef,
    });
  }
  return { rows };
}

function invoiceNumberParts(value: string): { prefix: string; number: number } | null {
  const match = value.trim().match(/^(.*?)(\d+)$/);
  return match ? { prefix: match[1], number: Number(match[2]) } : null;
}

function breaksInvoiceNumberPattern(invoice: InvoiceRecord, vendorInvoices: InvoiceRecord[]): boolean {
  if (vendorInvoices.length < 3) return false;
  const ordered = [...vendorInvoices].sort((first, second) => calendarDay(first.invoiceDate) - calendarDay(second.invoiceDate) || first.invoiceId.localeCompare(second.invoiceId));
  const currentIndex = ordered.findIndex((candidate) => candidate.invoiceId === invoice.invoiceId);
  const parsed = ordered.map((candidate) => invoiceNumberParts(candidate.invoiceNumber));
  const deltas = parsed.slice(1).flatMap((current, index) => {
    const previous = parsed[index];
    return current && previous && current.prefix === previous.prefix && current.number > previous.number ? [current.number - previous.number] : [];
  });
  if (currentIndex === -1 || deltas.length < 2) return false;
  const frequency = new Map<number, number>();
  deltas.forEach((delta) => frequency.set(delta, (frequency.get(delta) ?? 0) + 1));
  const typicalStep = [...frequency.entries()].sort((first, second) => second[1] - first[1] || first[0] - second[0])[0][0];
  const currentParts = parsed[currentIndex];
  if (!currentParts) return false;
  const adjacentDeltas: number[] = [];
  if (currentIndex > 0) {
    const previous = parsed[currentIndex - 1];
    if (!previous || previous.prefix !== currentParts.prefix) return false;
    adjacentDeltas.push(currentParts.number - previous.number);
  }
  if (currentIndex < parsed.length - 1) {
    const next = parsed[currentIndex + 1];
    if (!next || next.prefix !== currentParts.prefix) return false;
    adjacentDeltas.push(next.number - currentParts.number);
  }
  return adjacentDeltas.some((delta) => delta !== typicalStep);
}

function buildMoneyTrailMap(data: SupportingData): Map<string, MoneyTrail> {
  const vendorsById = new Map(data.vendors.map((vendor) => [vendor.vendorId, vendor]));
  const paymentsByInvoiceId = new Map(data.payments.map((payment) => [payment.invoiceId, payment]));
  const invoicesByVendorId = new Map<string, InvoiceRecord[]>();
  const vendorsByBankAccount = new Map<string, VendorRecord[]>();
  data.invoices.forEach((invoice) => invoicesByVendorId.set(invoice.vendorId, [...(invoicesByVendorId.get(invoice.vendorId) ?? []), invoice]));
  data.vendors.forEach((vendor) => {
    const key = vendor.bankAccountRef.trim().toLowerCase();
    if (key) vendorsByBankAccount.set(key, [...(vendorsByBankAccount.get(key) ?? []), vendor]);
  });

  return new Map(data.invoices.map((invoice) => {
    const vendor = vendorsById.get(invoice.vendorId);
    const payment = paymentsByInvoiceId.get(invoice.invoiceId);
    const flags: MoneyTrailFlag[] = [];
    if (vendor && calendarDay(vendor.createdDate) <= calendarDay(invoice.invoiceDate) && calendarDayDistance(vendor.createdDate, invoice.invoiceDate) <= 14) {
      flags.push({ message: 'Vendor was created shortly before this transaction.' });
    }
    if (vendor) {
      const matchingVendors = (vendorsByBankAccount.get(vendor.bankAccountRef.trim().toLowerCase()) ?? []).filter((candidate) => candidate.vendorId !== vendor.vendorId);
      if (matchingVendors.length > 0) flags.push({ message: `This vendor's banking information matches another vendor: ${matchingVendors.map((candidate) => candidate.vendorName).join(', ')}.` });
      const vendorInvoices = invoicesByVendorId.get(vendor.vendorId) ?? [];
      if (breaksInvoiceNumberPattern(invoice, vendorInvoices)) flags.push({ message: "This invoice number breaks the vendor's normal numbering pattern." });
    }
    return [invoice.glTransactionId, { invoice, vendor, payment, flags }];
  }));
}

const initialSupportingData: SupportingData = {
  vendors: parseVendorMasterCsv(vendorMasterCsv).rows,
  invoices: parseInvoicesCsv(invoicesCsv).rows,
  payments: parsePaymentsCsv(paymentsCsv).rows,
  vendorFileName: 'vendor_master.csv',
  invoiceFileName: 'invoices.csv',
  paymentFileName: 'payments.csv',
};

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(sampleTransactions);
  const [threshold, setThreshold] = useState(10000);
  const [draftThreshold, setDraftThreshold] = useState('10000');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fileName, setFileName] = useState('fictional_q2_general_ledger.csv');
  const [uploadError, setUploadError] = useState('');
  const [supportingData, setSupportingData] = useState<SupportingData>(initialSupportingData);
  const [supportingFileError, setSupportingFileError] = useState('');
  const [hasStartedReview, setHasStartedReview] = useState(false);
  const [activeNav, setActiveNav] = useState('overview');
  const [selectedId, setSelectedId] = useState<string | null>('GL-2407');
  const [search, setSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'All risks' | Risk>('All risks');
  const [typeFilter, setTypeFilter] = useState<'All tests' | ExceptionType>('All tests');
  const [sortKey, setSortKey] = useState<'risk' | 'amount' | 'date'>('risk');
  const [sortDescending, setSortDescending] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const vendorFileInput = useRef<HTMLInputElement>(null);
  const invoiceFileInput = useRef<HTMLInputElement>(null);
  const paymentFileInput = useRef<HTMLInputElement>(null);
  const moneyTrailMap = useMemo(() => buildMoneyTrailMap(supportingData), [supportingData]);
  const findings = useMemo(() => analyze(transactions, threshold, moneyTrailMap), [transactions, threshold, moneyTrailMap]);
  const selected = useMemo(() => {
    const transaction = transactions.find((candidate) => candidate.id === selectedId) ?? transactions[0];
    if (!transaction) return null;
    const finding = findings.find((candidate) => candidate.id === transaction.id);
    return {
      ...transaction,
      exceptions: finding?.exceptions ?? [],
      risk: finding?.risk ?? 'Low',
      related: finding?.related ?? [],
      moneyTrail: moneyTrailMap.get(transaction.id),
    };
  }, [findings, moneyTrailMap, selectedId, transactions]);
  const filteredFindings = useMemo(() => {
    const searchTerm = search.toLowerCase();
    return findings.filter((finding) => {
      const matchesSearch = !searchTerm || [finding.id, finding.vendor, finding.account, ...finding.exceptions.map((exception) => exception.type)].some((value) => value.toLowerCase().includes(searchTerm));
      const matchesType = typeFilter === 'All tests' || finding.exceptions.some((exception) => exception.type === typeFilter);
      return matchesSearch && (riskFilter === 'All risks' || finding.risk === riskFilter) && matchesType;
    }).sort((a, b) => {
      const comparison = sortKey === 'risk' ? riskWeight[a.risk] - riskWeight[b.risk] : sortKey === 'amount' ? a.amount - b.amount : a.date.localeCompare(b.date);
      return sortDescending ? -comparison : comparison;
    });
  }, [findings, riskFilter, search, sortDescending, sortKey, typeFilter]);
  const filteredTransactions = useMemo(() => {
    const searchTerm = sourceSearch.trim().toLowerCase();
    return transactions.filter((transaction) => !searchTerm || [transaction.id, transaction.vendor, transaction.account].some((value) => value.toLowerCase().includes(searchTerm)));
  }, [sourceSearch, transactions]);
  const flaggedDollars = findings.reduce((sum, finding) => sum + finding.amount, 0);
  const riskCounts = findings.reduce<Record<Risk, number>>((acc, finding) => ({ ...acc, [finding.risk]: (acc[finding.risk] ?? 0) + 1 }), { High: 0, Medium: 0, Low: 0 });

  const runAnalysis = () => {
    const parsed = Number(draftThreshold.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) setThreshold(parsed);
    setIsAnalyzing(true);
    window.setTimeout(() => setIsAnalyzing(false), 500);
  };
  const useSample = () => {
    setTransactions(sampleTransactions);
    setFileName('fictional_q2_general_ledger.csv');
    setUploadError('');
    setSelectedId('GL-2407');
  };
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError('');
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('AuditLens accepts CSV files only. Choose a general-ledger export ending in .csv.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseCsv(String(reader.result ?? ''));
      if (result.error || !result.rows.length) setUploadError(result.error ?? 'No usable transactions found.');
      else { setTransactions(result.rows); setFileName(file.name); setSelectedId(result.rows[0].id); }
    };
    reader.onerror = () => setUploadError('The file could not be read. Try exporting the ledger as UTF-8 CSV.');
    reader.readAsText(file);
  };
  const handleSupportingFile = (kind: SupportingFileKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSupportingFileError('');
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setSupportingFileError('Supporting files must be CSV files.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      if (kind === 'vendor') {
        const parsed = parseVendorMasterCsv(text);
        if (parsed.error || !parsed.rows.length) {
          setSupportingFileError(parsed.error ?? 'No usable vendor records found.');
          return;
        }
        setSupportingData((current) => ({ ...current, vendors: parsed.rows, vendorFileName: file.name }));
      } else if (kind === 'invoice') {
        const parsed = parseInvoicesCsv(text);
        if (parsed.error || !parsed.rows.length) {
          setSupportingFileError(parsed.error ?? 'No usable invoice records found.');
          return;
        }
        setSupportingData((current) => ({ ...current, invoices: parsed.rows, invoiceFileName: file.name }));
      } else {
        const parsed = parsePaymentsCsv(text);
        if (parsed.error || !parsed.rows.length) {
          setSupportingFileError(parsed.error ?? 'No usable payment records found.');
          return;
        }
        setSupportingData((current) => ({ ...current, payments: parsed.rows, paymentFileName: file.name }));
      }
    };
    reader.onerror = () => setSupportingFileError(`The ${kind} file could not be read. Try exporting it as UTF-8 CSV.`);
    reader.readAsText(file);
    event.target.value = '';
  };
  const selectTransaction = (id: string) => {
    setSelectedId(id);
    window.setTimeout(() => document.getElementById('investigation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const exportFindings = () => {
    const header = 'Transaction ID,Date,Account,Vendor,Amount,Exception Type,Risk\n';
    const body = findings.map((finding) => [finding.id, finding.date, finding.account, finding.vendor, finding.amount, finding.exceptions.map((exception) => exception.type).join('; '), finding.risk].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'auditlens-exceptions.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const navItems = [
    { id: 'overview', label: 'Review overview', icon: LayoutDashboard },
    { id: 'exceptions', label: 'Exceptions', icon: ShieldAlert, count: findings.length },
    { id: 'data', label: 'Source data', icon: FileBarChart, count: transactions.length },
  ];

  if (!hasStartedReview) {
    return (
      <div className="landing-shell audit-noise" data-testid="landing-state">
        <header className="landing-header flex items-center justify-between px-5 py-5 sm:px-10 lg:px-16">
          <div className="flex items-center gap-3">
            <div className="landing-mark" aria-hidden="true"><Landmark size={18} strokeWidth={2.2} /></div>
            <div>
              <div className="font-serif text-[22px] font-semibold leading-none tracking-[-.04em] text-[#1b2a4a]">AuditLens</div>
              <div className="mt-1 font-mono text-[9px] tracking-[.13em] text-[#2f5d50]">Local review workspace</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[10px] tracking-[.1em] text-[#26282b]/55 sm:flex">
            <LockKeyhole size={13} /> private by default
          </div>
        </header>
        <main className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-16 pt-16 sm:px-10 sm:pt-24 lg:grid-cols-[1.2fr_.8fr] lg:gap-20 lg:px-16 lg:pb-24">
          <section className="max-w-[880px]">
            <div className="landing-kicker mb-7 flex items-center gap-3 font-mono text-[10px] font-medium">
              <span className="landing-rule w-12" /> General ledger exception review
            </div>
            <h1 className="landing-title font-serif font-semibold">
              Put the ledger<br /><em>under a clear light.</em>
            </h1>
            <p className="mt-8 max-w-[640px] text-base leading-7 text-[#26282b]/72 sm:text-lg">
              AuditLens is a transparent first pass over general-ledger exceptions, built to help audit teams move from an unusual entry to the evidence behind it.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setHasStartedReview(true)}
                className="landing-start inline-flex items-center gap-3 px-5 py-3 text-sm font-semibold"
                data-testid="button-start-review"
              >
                Start review <ArrowRight size={16} />
              </button>
              <span className="font-mono text-[10px] tracking-[.08em] text-[#26282b]/55">Sample Q2 ledger ready</span>
            </div>
            <div className="mt-20 grid gap-8 sm:grid-cols-3">
              <div className="landing-feature">
                <div className="landing-feature-index">01</div>
                <div className="mt-3 flex items-center gap-2 text-[#1b2a4a]"><ClipboardCheck size={16} /><h2 className="text-sm font-semibold">Deterministic tests</h2></div>
                <p className="mt-2 text-xs leading-5 text-[#26282b]/65">Six explicit checks show exactly why an entry entered the queue.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-index">02</div>
                <div className="mt-3 flex items-center gap-2 text-[#1b2a4a]"><Link2 size={16} /><h2 className="text-sm font-semibold">Follow the Money</h2></div>
                <p className="mt-2 text-xs leading-5 text-[#26282b]/65">Trace GL entry to invoice, vendor, and payment without leaving the review.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-index">03</div>
                <div className="mt-3 flex items-center gap-2 text-[#1b2a4a]"><LockKeyhole size={16} /><h2 className="text-sm font-semibold">Local and private</h2></div>
                <p className="mt-2 text-xs leading-5 text-[#26282b]/65">Your files stay in this browser. No API calls, inference, or opaque scoring.</p>
              </div>
            </div>
          </section>
          <aside className="landing-rail self-end pl-0 sm:pl-8 lg:mb-4">
            <div className="font-mono text-[10px] tracking-[.14em] text-[#2f5d50]">A reviewer's view</div>
            <div className="mt-6 border-y border-[#1b2a4a]/20 py-6">
              <div className="flex items-start gap-3">
                <FileSearch size={18} className="mt-1 shrink-0 text-[#8b2635]" />
                <div>
                  <div className="font-serif text-2xl font-semibold leading-tight text-[#1b2a4a]">Evidence over spectacle.</div>
                  <p className="mt-3 text-sm leading-6 text-[#26282b]/65">A measured workspace for professional judgment: clear tests, traceable context, and a review queue that respects the source ledger.</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between font-mono text-[10px] text-[#26282b]/55">
              <span>Fictional portfolio / Q2 FY24</span>
              <span className="text-[#c9a227]">01—06</span>
            </div>
            <div className="mt-10 flex items-center gap-2 text-xs text-[#2f5d50]"><CheckCircle2 size={15} /> Ready for local analysis</div>
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="audit-noise workspace-shell min-h-[100dvh] bg-background text-foreground">
      <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} data-testid="input-csv-file" />
      <input ref={vendorFileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleSupportingFile('vendor', event)} data-testid="input-vendor-master-file" />
      <input ref={invoiceFileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleSupportingFile('invoice', event)} data-testid="input-invoices-file" />
      <input ref={paymentFileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleSupportingFile('payment', event)} data-testid="input-payments-file" />
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-sidebar-border px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground"><Landmark size={19} strokeWidth={2.5} /></div>
          <div><div className="font-serif text-[19px] font-bold tracking-[-.03em]">AuditLens</div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/55">ledger intelligence</div></div>
        </div>
        <div className="px-4 pt-8">
          <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Workspace</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
               return <button key={item.id} onClick={() => { setActiveNav(item.id); setMobileNav(false); if (item.id === 'overview') window.scrollTo({ top: 0, behavior: 'smooth' }); if (item.id === 'exceptions') document.getElementById('exceptions-section')?.scrollIntoView({ behavior: 'smooth' }); if (item.id === 'data') document.getElementById('source-section')?.scrollIntoView({ behavior: 'smooth' }); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${activeNav === item.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`button-nav-${item.id}`}><span className="flex items-center gap-3"><Icon size={16} /><span>{item.label}</span></span>{item.count !== undefined && <span className="font-mono text-[10px] text-sidebar-foreground/45">{item.count}</span>}</button>;
            })}
          </nav>
        </div>
        <div className="mt-8 px-4">
          <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Controls</div>
          <button onClick={() => document.getElementById('rules-section')?.scrollIntoView({ behavior: 'smooth' })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground" data-testid="button-nav-rules"><SlidersHorizontal size={16} /><span>Test configuration</span></button>
        </div>
        <div className="mt-auto px-6 pb-7">
          <div className="mb-5 h-px bg-sidebar-border" />
          <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d4dfb1] font-mono text-xs font-medium text-sidebar">AS</div><div><div className="text-xs font-medium">Alex Morgan</div><div className="font-mono text-[10px] text-sidebar-foreground/45">portfolio workspace</div></div></div>
        </div>
      </aside>
      {mobileNav && <button className="fixed inset-0 z-20 bg-sidebar/30 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-navigation" />}
      <main className="min-h-[100dvh] lg:pl-[248px]">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-md p-2 hover:bg-muted lg:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button><div className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Review workspace <span className="mx-2 text-border">/</span> Q2 FY24</div></div>
          <div className="flex items-center gap-2 sm:gap-3"><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-[#78a18e]" />All analysis local</div><button onClick={exportFindings} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold shadow-sm transition hover:-translate-y-px hover:border-primary/40" data-testid="button-export-findings"><Download size={14} /> <span className="hidden sm:inline">Export findings</span></button></div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <section className="audit-rise mb-9 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Active review</div><h1 className="max-w-[720px] font-serif text-4xl font-bold leading-[1.03] tracking-[-.045em] text-foreground sm:text-5xl">Find the entries<br /><span className="text-primary">worth a second look.</span></h1><p className="mt-4 max-w-[590px] text-sm leading-6 text-muted-foreground">A transparent first pass over your general ledger. AuditLens highlights deterministic exceptions so you can spend review time where judgment matters.</p></div>
            <div className="flex shrink-0 items-center gap-2"><button onClick={useSample} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2.5 text-xs font-semibold shadow-sm transition hover:-translate-y-px hover:border-primary/40" data-testid="button-use-sample"><RotateCcw size={14} /> Reset to sample</button><button onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-px hover:brightness-105" data-testid="button-upload-csv"><Upload size={14} /> Upload CSV</button></div>
          </section>

           <section id="supporting-files-section" className="audit-rise audit-delay-1 mb-8 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
             <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="mb-2 flex items-center gap-2"><FileCheck2 size={17} className="text-primary" /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Source ledger</span></div><div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-semibold">{fileName}</h2><span className="rounded-full bg-[#e5efd4] px-2 py-1 font-mono text-[9px] uppercase tracking-[.1em] text-[#49623f]">Loaded</span></div><p className="mt-2 text-xs text-muted-foreground">{transactions.length} rows · fictional data · ready for local analysis</p></div><button onClick={() => fileInput.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted" data-testid="button-replace-csv"><Upload size={14} /> Replace file</button></div>
               {uploadError && <div className="relative mt-5 flex items-start gap-3 rounded-lg border border-[#e6b9b0] bg-[#fcf0ed] p-3 text-xs text-[#8d3c31]" data-testid="status-upload-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><div><div className="font-semibold">We could not load that ledger</div><div className="mt-1 leading-5">{uploadError}</div></div><button onClick={() => setUploadError('')} className="ml-auto p-1" aria-label="Dismiss upload error" data-testid="button-dismiss-upload-error"><X size={14} /></button></div>}
               <div className="relative mt-6 border-t border-border/80 pt-5">
                 <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                   <div>
                     <div className="mb-1 flex items-center gap-2"><Landmark size={15} className="text-primary" /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Follow the money</span></div>
                     <p className="text-xs leading-5 text-muted-foreground">Link local invoices, vendors, and payments to the GL entry in each investigation.</p>
                   </div>
                   <span className="rounded-full bg-[#e5efd4] px-2 py-1 font-mono text-[9px] uppercase tracking-[.1em] text-[#49623f]">Local files</span>
                 </div>
                 <div className="mt-4 grid gap-2 sm:grid-cols-3">
                   <SupportingFileCard label="Vendor master" fileName={supportingData.vendorFileName} rowCount={supportingData.vendors.length} onClick={() => vendorFileInput.current?.click()} />
                   <SupportingFileCard label="Invoices" fileName={supportingData.invoiceFileName} rowCount={supportingData.invoices.length} onClick={() => invoiceFileInput.current?.click()} />
                   <SupportingFileCard label="Payments" fileName={supportingData.paymentFileName} rowCount={supportingData.payments.length} onClick={() => paymentFileInput.current?.click()} />
                 </div>
                 <p className="mt-3 font-mono text-[10px] leading-4 text-muted-foreground">{transactions.filter((transaction) => moneyTrailMap.has(transaction.id)).length.toLocaleString()} invoice links available for the loaded GL · vendor bank-account and invoice-number checks run locally.</p>
                 {supportingFileError && <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#e6b9b0] bg-[#fcf0ed] p-3 text-xs text-[#8d3c31]" data-testid="status-supporting-file-error"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{supportingFileError}</span><button onClick={() => setSupportingFileError('')} className="ml-auto p-1" aria-label="Dismiss supporting file error"><X size={14} /></button></div>}
               </div>
            </div>
            <div id="rules-section" className="rounded-xl border border-border bg-[#e9ecda] p-5 shadow-sm sm:p-6"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Settings2 size={16} className="text-primary" /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Review control</span></div><CircleHelp size={15} className="text-muted-foreground" /></div><label htmlFor="approval-threshold" className="text-xs font-semibold text-foreground">Approval threshold</label><div className="mt-2 flex gap-2"><div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span><input id="approval-threshold" value={draftThreshold} onChange={(event) => setDraftThreshold(event.target.value.replace(/[^\d]/g, ''))} className="w-full rounded-md border border-[#c5ccad] bg-background py-2.5 pl-7 pr-3 font-mono text-sm outline-none ring-primary/20 transition focus:ring-2" data-testid="input-approval-threshold" /></div><button onClick={runAnalysis} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60" disabled={isAnalyzing} data-testid="button-run-analysis">{isAnalyzing ? <Clock3 size={14} className="audit-pulse" /> : <Play size={14} />} {isAnalyzing ? 'Running' : 'Run tests'}</button></div><p className="mt-2 font-mono text-[10px] leading-4 text-muted-foreground">Proximity test flags entries from {currency(Math.max(0, Number(draftThreshold || 0) * .95))} to just below threshold.</p></div>
          </section>

           <section className="audit-rise audit-delay-2 mb-9 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            <Metric label="Transactions analyzed" value={transactions.length.toLocaleString()} detail="in supplied ledger" icon={FileText} />
             <Metric label="Exceptions found" value={findings.length.toString()} detail="unique transactions" icon={ShieldAlert} accent="rose" />
            <Metric label="High risk" value={riskCounts.High.toString()} detail="requires attention" icon={AlertCircle} accent="red" />
            <Metric label="Medium risk" value={riskCounts.Medium.toString()} detail="contextual review" icon={ListFilter} accent="amber" />
            <Metric label="Low risk" value={riskCounts.Low.toString()} detail="timing / context" icon={CalendarDays} accent="teal" />
            <Metric label="Flagged dollars" value={compactCurrency(flaggedDollars)} detail="unique entries" icon={BarChart3} accent="lime" />
          </section>

           <SourceDataSection transactions={transactions} filteredTransactions={filteredTransactions} findings={findings} search={sourceSearch} selectedId={selectedId} onSearch={setSourceSearch} onSelect={selectTransaction} />

          <section id="exceptions-section" className="audit-rise audit-delay-3 mb-10">
             <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">01 / Exception register</div><h2 className="font-serif text-2xl font-bold tracking-[-.03em]">Review queue</h2></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#d7a72f]" /> {filteredFindings.length} of {findings.length} entries shown</div></div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-[330px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" placeholder="Search ID, vendor, account..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none ring-primary/20 transition placeholder:text-muted-foreground/70 focus:ring-2" data-testid="input-search-exceptions" /></div><div className="flex flex-wrap items-center gap-2"><Filter size={14} className="text-muted-foreground" /><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)} className="rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none" data-testid="select-risk-filter"><option>All risks</option><option>High</option><option>Medium</option><option>Low</option></select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="max-w-[190px] rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none" data-testid="select-type-filter"><option>All tests</option>{testDefinitions.map((test) => <option key={test.type}>{test.type}</option>)}</select><button onClick={() => { setSortKey(sortKey === 'risk' ? 'amount' : sortKey === 'amount' ? 'date' : 'risk'); setSortDescending(!sortDescending); }} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs font-medium hover:bg-muted" data-testid="button-sort-exceptions"><ArrowUpDown size={14} /> Sort</button></div></div>
               {isAnalyzing ? <LoadingRows /> : filteredFindings.length === 0 ? <EmptyState hasFilters={Boolean(search || riskFilter !== 'All risks' || typeFilter !== 'All tests')} onClear={() => { setSearch(''); setRiskFilter('All risks'); setTypeFilter('All tests'); }} /> : <div className="audit-scrollbar overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left"><thead><tr className="border-b border-border bg-[#f1f0e9] font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground"><th className="px-4 py-3 font-medium">Transaction</th><th className="px-4 py-3 font-medium">Posted</th><th className="px-4 py-3 font-medium">Account / vendor</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Exception type</th><th className="px-4 py-3 font-medium">Risk</th><th className="w-10 px-4 py-3" /></tr></thead><tbody>{filteredFindings.map((finding, index) => <tr key={finding.id} onClick={() => selectTransaction(finding.id)} className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-[#f6f6ed] ${selected?.id === finding.id ? 'bg-[#eef0df]' : ''}`} data-testid={`row-exception-${finding.id}-${index}`}><td className="px-4 py-3.5"><div className="font-mono text-xs font-medium text-primary">{finding.id}</div><div className="mt-1 max-w-[150px] truncate text-[11px] text-muted-foreground">{finding.description}</div></td><td className="px-4 py-3.5"><div className="text-xs">{dateLabel(finding.date)}</div><div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">{isWeekend(finding.date) ? 'Weekend' : 'Weekday'}</div></td><td className="px-4 py-3.5"><div className="text-xs font-medium">{finding.account}</div><div className="mt-1 text-[11px] text-muted-foreground">{finding.vendor}</div></td><td className="px-4 py-3.5 text-right font-mono text-xs font-medium">{currency(finding.amount)}</td><td className="px-4 py-3.5"><div className="flex max-w-[240px] flex-wrap gap-1.5">{finding.exceptions.map((exception) => <ExceptionTag key={exception.type} type={exception.type} />)}</div></td><td className="px-4 py-3.5"><RiskBadge risk={finding.risk} /></td><td className="px-4 py-3.5 text-muted-foreground"><ChevronDown size={15} className="-rotate-90" /></td></tr>)}</tbody></table></div>}
            </div>
          </section>

          <section className="audit-rise audit-delay-4 grid gap-6 xl:grid-cols-[1fr_380px]">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">02 / Test logic</div><h2 className="font-serif text-2xl font-bold tracking-[-.03em]">Transparent by design</h2></div><div className="rounded-md bg-[#e9ecda] p-2 text-primary"><ClipboardCheck size={18} /></div></div><div className="grid gap-3 md:grid-cols-2">{testDefinitions.map((test, index) => <div key={test.type} className="flex gap-3 rounded-lg border border-border/80 bg-background p-3.5"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-medium ${index === 0 ? 'bg-[#f8dfd9] text-[#8d3c31]' : index === 1 ? 'bg-[#faedc7] text-[#89671c]' : index === 2 ? 'bg-[#dceaf0] text-[#3f6877]' : index === 3 ? 'bg-[#e8dced] text-[#6b4777]' : 'bg-[#e5efd4] text-[#49623f]'}`}>{String(index + 1).padStart(2, '0')}</div><div><div className="text-xs font-semibold">{test.label}</div><div className="mt-1 text-[11px] leading-4 text-muted-foreground">{test.rule}</div></div></div>)}</div><div className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground"><CircleHelp size={14} className="mt-0.5 shrink-0 text-primary" /> Tests are intentionally deterministic. They do not infer intent, contact external services, or replace professional judgment.</div></div>
            <InvestigationPanel finding={selected} />
          </section>
          <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground sm:flex-row"><span>AuditLens / fictional portfolio workspace</span><span>Client-side analysis · no data leaves this browser</span></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, accent = 'teal' }: { label: string; value: string; detail: string; icon: typeof FileText; accent?: string }) {
  const colors: Record<string, string> = { teal: 'text-[#2f5d50] bg-[#e6f0eb]', rose: 'text-[#8b2635] bg-[#f3e3e5]', red: 'text-[#8b2635] bg-[#f3e3e5]', amber: 'text-[#7b6211] bg-[#f6edca]', lime: 'text-[#2f5d50] bg-[#e6f0eb]' };
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className={`mb-5 flex h-8 w-8 items-center justify-center rounded-md ${colors[accent]}`}>{<Icon size={16} />}</div><div className="font-mono text-2xl tracking-[-.04em] text-foreground sm:text-[27px]" data-testid={`metric-value-${label.toLowerCase().replace(/\s/g, '-')}`}>{value}</div><div className="mt-1 text-xs font-semibold">{label}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div>;
}

function SourceDataSection({ transactions, filteredTransactions, findings, search, selectedId, onSearch, onSelect }: { transactions: Transaction[]; filteredTransactions: Transaction[]; findings: Finding[]; search: string; selectedId: string | null; onSearch: (value: string) => void; onSelect: (id: string) => void }) {
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  return (
    <section id="source-section" className="audit-rise audit-delay-3 mb-10">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><div className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">01 / Source data</div><h2 className="font-serif text-2xl font-bold tracking-[-.03em]">Every ledger transaction</h2></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#78a18e]" /> {filteredTransactions.length.toLocaleString()} of {transactions.length.toLocaleString()} transactions shown</div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-[380px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" placeholder="Search transaction ID, vendor, account..." value={search} onChange={(event) => onSearch(event.target.value)} className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none ring-primary/20 transition placeholder:text-muted-foreground/70 focus:ring-2" data-testid="input-search-source-data" /></div>
          <div className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">Click any row to investigate</div>
        </div>
        {filteredTransactions.length === 0 ? <div className="px-6 py-14 text-center"><div className="font-serif text-xl font-bold">No transactions match</div><p className="mt-2 text-xs text-muted-foreground">Search by transaction ID, vendor, or account.</p></div> : <div className="audit-scrollbar max-h-[680px] overflow-auto"><table className="w-full min-w-[850px] border-collapse text-left" data-testid="table-source-data"><thead className="sticky top-0 z-[1]"><tr className="border-b border-border bg-[#f1f0e9] font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground"><th className="px-4 py-3 font-medium">Transaction</th><th className="px-4 py-3 font-medium">Posted</th><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Test status</th><th className="px-4 py-3 font-medium">Risk</th></tr></thead><tbody>{filteredTransactions.map((transaction, index) => {
          const finding = findingsById.get(transaction.id);
          return <tr key={transaction.id} tabIndex={0} onClick={() => onSelect(transaction.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(transaction.id); } }} className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-[#f6f6ed] focus:bg-[#eef0df] focus:outline-none ${selectedId === transaction.id ? 'bg-[#eef0df]' : ''}`} data-testid={`row-source-data-${transaction.id}-${index}`}>
            <td className="px-4 py-3"><div className="font-mono text-xs font-medium text-primary">{transaction.id}</div><div className="mt-1 max-w-[180px] truncate text-[11px] text-muted-foreground">{transaction.description}</div></td>
            <td className="px-4 py-3"><div className="text-xs">{dateLabel(transaction.date)}</div><div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">{isWeekend(transaction.date) ? 'Weekend' : 'Weekday'}</div></td>
            <td className="px-4 py-3 text-xs">{transaction.account}</td>
            <td className="px-4 py-3 text-xs">{transaction.vendor}</td>
            <td className="px-4 py-3 text-right font-mono text-xs font-medium">{currency(transaction.amount)}</td>
            <td className="px-4 py-3"><div className="flex max-w-[270px] flex-wrap gap-1.5">{finding?.exceptions.length ? finding.exceptions.map((exception) => <ExceptionTag key={exception.type} type={exception.type} />) : <span className="text-[10px] text-muted-foreground">Not flagged</span>}</div></td>
            <td className="px-4 py-3">{finding ? <RiskBadge risk={finding.risk} /> : <span className="font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">Unflagged</span>}</td>
          </tr>;
        })}</tbody></table></div>}
      </div>
    </section>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  const classes = risk === 'High' ? 'bg-[#f3e3e5] text-[#8b2635]' : risk === 'Medium' ? 'bg-[#f6edca] text-[#7b6211]' : 'bg-[#e6f0eb] text-[#2f5d50]';
  return <span className={`inline-flex rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[.08em] ${classes}`} data-testid={`status-risk-${risk.toLowerCase()}`}>{risk}</span>;
}

function ExceptionTag({ type }: { type: ExceptionType }) {
  const short = type === 'Approval proximity' ? 'Approval proximity' : type;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#d8d8c6] bg-[#f7f8f1] px-2 py-1 text-[10px] font-medium text-[#536659]"><span className="h-1.5 w-1.5 rounded-full bg-[#c7982e]" />{short}</span>;
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e9ecda] text-primary"><Search size={21} /></div><h3 className="font-serif text-xl font-bold">{hasFilters ? 'No findings match those filters' : 'No exceptions found'}</h3><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">{hasFilters ? 'Try a broader search or clear one of the filters to return to the full review queue.' : 'The six deterministic tests found no entries requiring a second look in this ledger.'}</p>{hasFilters && <button onClick={onClear} className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted" data-testid="button-clear-filters">Clear filters</button>}</div>;
}

function LoadingRows() {
  return <div className="space-y-0" data-testid="status-analysis-loading">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-5 border-b border-border/70 px-4 py-5 last:border-0"><div className="h-8 w-20 animate-pulse rounded bg-muted" /><div className="h-8 w-24 animate-pulse rounded bg-muted" /><div className="h-8 flex-1 animate-pulse rounded bg-muted" /><div className="h-8 w-20 animate-pulse rounded bg-muted" /><div className="h-8 w-28 animate-pulse rounded bg-muted" /></div>)}</div>;
}

function InvestigationPanel({ finding }: { finding: Finding | null }) {
  const [activeTab, setActiveTab] = useState<'details' | 'trail'>('details');
  useEffect(() => {
    setActiveTab('details');
  }, [finding?.id]);
  if (!finding) return <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6"><div className="flex items-center gap-2 text-muted-foreground"><PanelRightOpen size={17} /><span className="font-mono text-[10px] uppercase tracking-[.14em]">Investigation panel</span></div><div className="py-12 text-center"><div className="font-serif text-lg font-bold">Select a finding</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Choose an exception from the register to see the rule, context, and suggested follow-up.</p></div></div>;
  return (
    <aside className="rounded-xl border border-[#b9c7b3] bg-[#edf1e7] p-5 shadow-sm sm:p-6" data-testid={`panel-investigation-${finding.id}`}>
      <div className="flex items-center justify-between border-b border-[#cdd8c8] pb-4">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em] text-primary"><PanelRightOpen size={14} /> Investigation</div>
          <div className="font-mono text-sm font-medium text-primary">{finding.id}</div>
        </div>
        <RiskBadge risk={finding.risk} />
      </div>
      <div className="mb-5 mt-4 grid grid-cols-2 border-b border-[#cdd8c8]" role="tablist" aria-label="Investigation views">
        <button type="button" role="tab" aria-selected={activeTab === 'details'} onClick={() => setActiveTab('details')} className={`border-b-2 px-2 py-2.5 text-left text-xs font-semibold transition-colors ${activeTab === 'details' ? 'border-[#1b2a4a] text-[#1b2a4a]' : 'border-transparent text-[#536659] hover:text-[#1b2a4a]'}`} data-testid={`tab-investigation-details-${finding.id}`}>Details</button>
        <button type="button" role="tab" aria-selected={activeTab === 'trail'} onClick={() => setActiveTab('trail')} className={`border-b-2 px-2 py-2.5 text-left text-xs font-semibold transition-colors ${activeTab === 'trail' ? 'border-[#1b2a4a] text-[#1b2a4a]' : 'border-transparent text-[#536659] hover:text-[#1b2a4a]'}`} data-testid={`tab-investigation-trail-${finding.id}`}>Follow the Money</button>
      </div>
      {activeTab === 'details' ? <div className="space-y-4">
        <div className="pb-1">
          <div className="font-serif text-[22px] font-bold leading-tight tracking-[-.03em]">{finding.exceptions.length ? `${finding.exceptions.length} ${finding.exceptions.length === 1 ? 'test' : 'tests'} triggered` : 'No automated tests triggered'}</div>
          <p className="mt-2 text-xs leading-5 text-[#536659]">{finding.exceptions.length ? 'Review each test below. The displayed risk is the highest level triggered by this transaction.' : 'This transaction is available for direct review even though it did not match an automated exception rule.'}</p>
        </div>
        <InvestigationBlock label="Tests triggered">
          {finding.exceptions.length ? <div className="space-y-3">
            {finding.exceptions.map((exception) => (
              <div key={exception.type} className="rounded-md border border-[#cdd8c8] bg-[#f7f8f1] p-3" data-testid={`detail-exception-${finding.id}-${exception.type.toLowerCase().replace(/\s/g, '-')}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ExceptionTag type={exception.type} />
                  <RiskBadge risk={exception.risk} />
                </div>
                <div className="mt-3 text-[11px] font-semibold text-foreground">Why it was flagged</div>
                <p className="mt-1 text-xs leading-5 text-[#536659]">{exception.why}</p>
                <div className="mt-3 text-[11px] font-semibold text-foreground">What we saw</div>
                <p className="mt-1 text-xs leading-5 text-foreground">{exception.details}</p>
                {exception.relatedTransactions && <div className="mt-3 border-t border-[#dfe5da] pt-3">
                  <div className="mb-2 text-[11px] font-semibold text-foreground">Cluster transactions</div>
                  <div className="space-y-1.5">
                    {exception.relatedTransactions.map((clusterTransaction) => (
                      <div key={clusterTransaction.id} className="flex items-center justify-between gap-3 rounded border border-[#dfe5da] bg-[#eef2e9] px-2.5 py-2 text-[10px]" data-testid={`splitting-cluster-transaction-${clusterTransaction.id}`}>
                        <span className="font-mono font-medium text-primary">{clusterTransaction.id}</span>
                        <span className="text-[#536659]">{dateLabel(clusterTransaction.date)}</span>
                        <span className="font-mono font-medium">{currency(clusterTransaction.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>}
                <div className="mt-3 flex gap-2 border-t border-[#dfe5da] pt-3 text-xs leading-5">
                  <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span><span className="font-semibold">Suggested follow-up:</span> {exception.followUp}</span>
                </div>
              </div>
            ))}
          </div> : <div className="rounded-md border border-dashed border-[#cdd8c8] bg-[#f7f8f1] p-3 text-xs leading-5 text-[#536659]">No exception tests matched this transaction in the current review.</div>}
        </InvestigationBlock>
        <InvestigationBlock label="Transaction context">
          <div className="grid grid-cols-2 gap-y-3 rounded-md border border-[#cdd8c8] bg-[#f7f8f1] p-3">
            <DataPoint label="Date" value={dateLabel(finding.date)} />
            <DataPoint label="Amount" value={currency(finding.amount)} />
            <DataPoint label="Vendor" value={finding.vendor} />
            <DataPoint label="Account" value={finding.account.split(' · ')[1] ?? finding.account} />
          </div>
        </InvestigationBlock>
        {finding.related.length > 0 && <InvestigationBlock label="Related transactions"><div className="flex flex-wrap gap-2">{finding.related.map((id) => <span key={id} className="rounded-md border border-[#cdd8c8] bg-[#f7f8f1] px-2 py-1 font-mono text-[10px] text-primary">{id}</span>)}</div></InvestigationBlock>}
      </div> : <FollowMoneyTrail finding={finding} />}
    </aside>
  );
}

function InvestigationBlock({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="mb-2 font-mono text-[9px] uppercase tracking-[.14em] text-[#718272]">{label}</div>{children}</div>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  const isMoney = label.toLowerCase().includes('amount') || value.includes('$');
  return <div><div className="font-mono text-[9px] uppercase tracking-[.1em] text-[#718272]">{label}</div><div className={`mt-1 truncate pr-2 text-xs font-medium ${isMoney ? 'font-mono' : ''}`} title={value}>{value}</div></div>;
}

function SupportingFileCard({ label, fileName, rowCount, onClick }: { label: string; fileName: string; rowCount: number; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-md border border-[#cdd8c8] bg-[#f7f8f1] p-2.5 text-left transition hover:border-primary/50 hover:bg-[#eef2e9]" type="button"><div className="text-[11px] font-semibold">{label}</div><div className="mt-1 truncate font-mono text-[9px] text-primary" title={fileName}>{fileName}</div><div className="mt-1 text-[10px] text-muted-foreground">{rowCount.toLocaleString()} rows · Replace</div></button>;
}

type TrailStepKey = 'gl' | 'invoice' | 'vendor' | 'payment';

function FollowMoneyTrail({ finding }: { finding: Finding }) {
  const trail = finding.moneyTrail;
  const [activeStep, setActiveStep] = useState<TrailStepKey>('gl');
  useEffect(() => {
    setActiveStep('gl');
  }, [finding.id]);
  const stepIsMissing = (step: TrailStepKey) => step !== 'gl' && !trail?.[step === 'invoice' ? 'invoice' : step === 'vendor' ? 'vendor' : 'payment'];
  const detail = activeStep === 'gl'
    ? <div className="grid grid-cols-2 gap-y-3"><DataPoint label="Amount" value={currency(finding.amount)} /><DataPoint label="Posted" value={dateLabel(finding.date)} /><DataPoint label="Account" value={finding.account} /><DataPoint label="Vendor" value={finding.vendor} /></div>
    : activeStep === 'invoice' && trail?.invoice
      ? <div className="grid grid-cols-2 gap-y-3"><DataPoint label="Invoice number" value={trail.invoice.invoiceNumber} /><DataPoint label="Invoice date" value={dateLabel(trail.invoice.invoiceDate)} /><DataPoint label="Amount" value={currency(trail.invoice.amount)} /><DataPoint label="Invoice ID" value={trail.invoice.invoiceId} /></div>
      : activeStep === 'vendor' && trail?.vendor
        ? <div className="grid grid-cols-2 gap-y-3"><DataPoint label="Name" value={trail.vendor.vendorName} /><DataPoint label="Created" value={dateLabel(trail.vendor.createdDate)} /><DataPoint label="Primary account" value={trail.vendor.primaryAccount} /><DataPoint label="Status" value={trail.vendor.status} /><DataPoint label="Bank account ref" value={trail.vendor.bankAccountRef} /></div>
        : activeStep === 'payment' && trail?.payment
          ? <div className="grid grid-cols-2 gap-y-3"><DataPoint label="Payment date" value={dateLabel(trail.payment.paymentDate)} /><DataPoint label="Amount" value={currency(trail.payment.amount)} /><DataPoint label="Bank account ref" value={trail.payment.bankAccountRef} /><DataPoint label="Payment ID" value={trail.payment.paymentId} /></div>
          : <div className="text-xs leading-5 text-[#8b2635]">This link is missing from the loaded supporting files. The gap is retained so the trail can be followed back to source.</div>;
  const identifiers: Record<TrailStepKey, string> = {
    gl: finding.id,
    invoice: trail?.invoice?.invoiceId ?? 'No link',
    vendor: trail?.vendor?.vendorId ?? 'No link',
    payment: trail?.payment?.paymentId ?? 'No link',
  };
  const labels: Record<TrailStepKey, string> = { gl: 'GL entry', invoice: 'Invoice', vendor: 'Vendor', payment: 'Payment' };
  return (
    <InvestigationBlock label="Follow the money">
      <div data-testid={`money-trail-${finding.id}`}>
        <div className="mb-3 text-xs leading-5 text-[#536659]">Select a step to inspect the linked record. Gaps are shown explicitly rather than inferred.</div>
        <div className="trail-flow">
          {(['gl', 'invoice', 'vendor', 'payment'] as TrailStepKey[]).map((step, index) => (
            <TrailNode key={step} label={labels[step]} identifier={identifiers[step]} index={index + 1} missing={stepIsMissing(step)} selected={activeStep === step} onClick={() => setActiveStep(step)} findingId={finding.id} />
          ))}
        </div>
        <div className={`trail-detail mt-3 p-3 ${stepIsMissing(activeStep) ? 'trail-detail-missing' : ''}`} data-testid={`trail-detail-${finding.id}-${activeStep}`}>
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#dfe5da] pb-2">
            <span className="font-serif text-lg font-semibold text-[#1b2a4a]">{labels[activeStep]}</span>
            <span className="font-mono text-[10px] text-[#2f5d50]">{identifiers[activeStep]}</span>
          </div>
          {detail}
        </div>
      </div>
      {trail?.flags.length ? <div className="mt-4 space-y-2" data-testid={`money-trail-flags-${finding.id}`}>
        <div className="font-mono text-[9px] tracking-[.12em] text-[#8b2635]">Trail flags</div>
        {trail.flags.map((flag) => <div key={flag.message} className="trail-flag flex items-start gap-2 border p-2.5 text-[11px] leading-5 text-[#73551a]"><AlertCircle size={14} className="mt-0.5 shrink-0 text-[#c9a227]" /><span><strong className="font-semibold">Review signal:</strong> {flag.message}{flag.detail && <span className="mt-0.5 block text-[10px] text-[#89671c]">{flag.detail}</span>}</span></div>)}
      </div> : trail && <div className="mt-4 border border-[#cdd8c8] bg-[#f7f8f1] p-2.5 text-[11px] leading-5 text-[#536659]">No trail red flags detected for this transaction.</div>}
      {!trail && <div className="mt-4 border border-dashed border-[#cdd8c8] bg-[#f7f8f1] p-2.5 text-[11px] leading-5 text-[#536659]">No invoice is linked to this GL entry in the loaded supporting files.</div>}
    </InvestigationBlock>
  );
}

function TrailNode({ label, identifier, index, missing, selected, onClick, findingId }: { label: string; identifier: string; index: number; missing: boolean; selected: boolean; onClick: () => void; findingId: string }) {
  return <button type="button" onClick={onClick} className="trail-node" data-selected={selected} data-missing={missing} aria-pressed={selected} data-testid={`button-trail-step-${findingId}-${label.toLowerCase().replace(/\s/g, '-')}`}>
    <span className="trail-node-index">{String(index).padStart(2, '0')}</span>
    <span className="min-w-0"><span className="block text-xs font-semibold text-[#1b2a4a]">{label}</span><span className={`mt-1 block truncate font-mono text-[9px] ${missing ? 'text-[#8b2635]' : 'text-[#2f5d50]'}`}>{identifier}</span><span className="mt-1 block text-[10px] text-[#536659]">{missing ? 'Missing link' : 'Linked record'}</span></span>
  </button>;
}

const queryClient = new QueryClient();
function Root() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><App /></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default Root;