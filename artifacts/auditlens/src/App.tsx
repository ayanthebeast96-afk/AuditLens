import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  Filter,
  Landmark,
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

type Risk = 'High' | 'Medium' | 'Low';
type ExceptionType = 'Duplicate transaction' | 'Approval proximity' | 'Weekend posting' | 'Unusually large' | 'New vendor risk';
type Transaction = {
  id: string;
  date: string;
  account: string;
  vendor: string;
  amount: number;
  description: string;
};
type Finding = Transaction & {
  type: ExceptionType;
  risk: Risk;
  why: string;
  details: string;
  related: string[];
  followUp: string;
};

const sampleTransactions: Transaction[] = [
  { id: 'GL-2401', date: '2024-06-03', account: '6100 · Facilities', vendor: 'Northstar Facilities', amount: 8420, description: 'June building services' },
  { id: 'GL-2402', date: '2024-06-04', account: '6210 · Software', vendor: 'Cedar Cloud Tools', amount: 9940, description: 'Annual collaboration licenses' },
  { id: 'GL-2403', date: '2024-06-05', account: '6210 · Software', vendor: 'Cedar Cloud Tools', amount: 9940, description: 'Annual collaboration licenses' },
  { id: 'GL-2404', date: '2024-06-07', account: '6400 · Travel', vendor: 'Pine & Rail Travel', amount: 2180, description: 'Client site travel' },
  { id: 'GL-2405', date: '2024-06-08', account: '6300 · Contractors', vendor: 'Morrow Studio LLC', amount: 12850, description: 'Brand system phase two' },
  { id: 'GL-2406', date: '2024-06-10', account: '6000 · Office', vendor: 'Paper Kite Supply', amount: 3760, description: 'Quarterly office supplies' },
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
  { type: 'Duplicate transaction', label: 'Duplicate transactions', rule: 'Same vendor, date, amount, and description', tone: 'rose' },
  { type: 'Approval proximity', label: 'Approval threshold proximity', rule: 'Amount falls within 5% below approval threshold', tone: 'amber' },
  { type: 'Weekend posting', label: 'Weekend postings', rule: 'Transaction date is Saturday or Sunday', tone: 'sky' },
  { type: 'Unusually large', label: 'Unusually large transactions', rule: 'Amount is at least $25,000', tone: 'plum' },
  { type: 'New vendor risk', label: 'New vendor risk', rule: 'Vendor appears exactly once in the review period', tone: 'lime' },
];

const currency = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactCurrency = (value: number) => value >= 1000000 ? `$${(value / 1000000).toFixed(1)}m` : value >= 1000 ? `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : currency(value);
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const isWeekend = (value: string) => [0, 6].includes(new Date(`${value}T12:00:00`).getDay());
const riskWeight: Record<Risk, number> = { Low: 1, Medium: 2, High: 3 };

function analyze(transactions: Transaction[], threshold: number): Finding[] {
  const counts = transactions.reduce<Record<string, number>>((acc, tx) => ({ ...acc, [tx.vendor]: (acc[tx.vendor] ?? 0) + 1 }), {});
  const duplicates = new Map<string, string[]>();
  transactions.forEach((tx) => {
    const key = `${tx.vendor}|${tx.date}|${tx.amount}|${tx.description}`.toLowerCase();
    duplicates.set(key, [...(duplicates.get(key) ?? []), tx.id]);
  });
  const result: Finding[] = [];
  transactions.forEach((tx) => {
    const key = `${tx.vendor}|${tx.date}|${tx.amount}|${tx.description}`.toLowerCase();
    const duplicateIds = duplicates.get(key) ?? [];
    const add = (type: ExceptionType, risk: Risk, why: string, details: string, related: string[], followUp: string) =>
      result.push({ ...tx, type, risk, why, details, related, followUp });
    if (duplicateIds.length > 1) add('Duplicate transaction', 'High', 'An identical posting appears in the same review period.', `${duplicateIds.length} postings share the same vendor, date, amount, and description.`, duplicateIds.filter((id) => id !== tx.id), 'Compare the source invoice and approval trail; reverse any duplicate posting after confirmation.');
    if (tx.amount >= threshold * 0.95 && tx.amount < threshold) add('Approval proximity', 'Medium', `The amount is ${currency(threshold - tx.amount)} below the configured approval threshold.`, `${currency(tx.amount)} is within the 5% proximity band below ${currency(threshold)}.`, [], 'Inspect the approval matrix and confirm the spend was reviewed at the appropriate level.');
    if (isWeekend(tx.date)) add('Weekend posting', 'Low', 'This transaction was posted on a Saturday or Sunday.', `${dateLabel(tx.date)} falls outside the standard Monday–Friday posting window.`, [], 'Confirm the posting date, supporting document date, and whether a period-end adjustment explains the timing.');
    if (tx.amount >= 25000) add('Unusually large', 'High', 'The amount is materially larger than routine ledger activity.', `${currency(tx.amount)} exceeds the deterministic $25,000 large-transaction marker.`, [], 'Vouch to contract, invoice, receipt, and evidence of service delivery. Confirm authorization.');
    if (counts[tx.vendor] === 1) add('New vendor risk', 'Medium', 'This vendor occurs only once in the supplied review period.', `No second posting for ${tx.vendor} appears in the current dataset, so vendor history cannot be corroborated here.`, [], 'Check vendor onboarding, tax documentation, bank details, and the business purpose before clearing.');
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

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(sampleTransactions);
  const [threshold, setThreshold] = useState(10000);
  const [draftThreshold, setDraftThreshold] = useState('10000');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fileName, setFileName] = useState('fictional_q2_general_ledger.csv');
  const [uploadError, setUploadError] = useState('');
  const [activeNav, setActiveNav] = useState('overview');
  const [selectedId, setSelectedId] = useState<string | null>('GL-2407');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'All risks' | Risk>('All risks');
  const [typeFilter, setTypeFilter] = useState<'All tests' | ExceptionType>('All tests');
  const [sortKey, setSortKey] = useState<'risk' | 'amount' | 'date'>('risk');
  const [sortDescending, setSortDescending] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const findings = useMemo(() => analyze(transactions, threshold), [transactions, threshold]);
  const selected = findings.find((finding) => finding.id === selectedId) ?? findings[0] ?? null;
  const filteredFindings = useMemo(() => {
    const searchTerm = search.toLowerCase();
    return findings.filter((finding) => {
      const matchesSearch = !searchTerm || [finding.id, finding.vendor, finding.account, finding.type].some((value) => value.toLowerCase().includes(searchTerm));
      return matchesSearch && (riskFilter === 'All risks' || finding.risk === riskFilter) && (typeFilter === 'All tests' || finding.type === typeFilter);
    }).sort((a, b) => {
      const comparison = sortKey === 'risk' ? riskWeight[a.risk] - riskWeight[b.risk] : sortKey === 'amount' ? a.amount - b.amount : a.date.localeCompare(b.date);
      return sortDescending ? -comparison : comparison;
    });
  }, [findings, riskFilter, search, sortDescending, sortKey, typeFilter]);
  const uniqueExceptionIds = new Set(findings.map((finding) => finding.id));
  const flaggedDollars = transactions.filter((transaction) => uniqueExceptionIds.has(transaction.id)).reduce((sum, transaction) => sum + transaction.amount, 0);
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
  const exportFindings = () => {
    const header = 'Transaction ID,Date,Account,Vendor,Amount,Exception Type,Risk\n';
    const body = findings.map((finding) => [finding.id, finding.date, finding.account, finding.vendor, finding.amount, finding.type, finding.risk].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
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

  return (
    <div className="audit-noise min-h-[100dvh] bg-background text-foreground">
      <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} data-testid="input-csv-file" />
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

          <section id="source-section" className="audit-rise audit-delay-1 mb-8 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="absolute right-0 top-0 h-full w-1/3 opacity-60" style={{ background: 'radial-gradient(circle at 70% 30%, hsl(67 66% 63% / .22), transparent 60%)' }} />
              <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="mb-2 flex items-center gap-2"><FileCheck2 size={17} className="text-primary" /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Source ledger</span></div><div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-semibold">{fileName}</h2><span className="rounded-full bg-[#e5efd4] px-2 py-1 font-mono text-[9px] uppercase tracking-[.1em] text-[#49623f]">Loaded</span></div><p className="mt-2 text-xs text-muted-foreground">{transactions.length} rows · fictional data · ready for local analysis</p></div><button onClick={() => fileInput.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted" data-testid="button-replace-csv"><Upload size={14} /> Replace file</button></div>
              {uploadError && <div className="relative mt-5 flex items-start gap-3 rounded-lg border border-[#e6b9b0] bg-[#fcf0ed] p-3 text-xs text-[#8d3c31]" data-testid="status-upload-error"><AlertCircle size={16} className="mt-0.5 shrink-0" /><div><div className="font-semibold">We could not load that ledger</div><div className="mt-1 leading-5">{uploadError}</div></div><button onClick={() => setUploadError('')} className="ml-auto p-1" aria-label="Dismiss upload error" data-testid="button-dismiss-upload-error"><X size={14} /></button></div>}
            </div>
            <div id="rules-section" className="rounded-xl border border-border bg-[#e9ecda] p-5 shadow-sm sm:p-6"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Settings2 size={16} className="text-primary" /><span className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Review control</span></div><CircleHelp size={15} className="text-muted-foreground" /></div><label htmlFor="approval-threshold" className="text-xs font-semibold text-foreground">Approval threshold</label><div className="mt-2 flex gap-2"><div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span><input id="approval-threshold" value={draftThreshold} onChange={(event) => setDraftThreshold(event.target.value.replace(/[^\d]/g, ''))} className="w-full rounded-md border border-[#c5ccad] bg-background py-2.5 pl-7 pr-3 font-mono text-sm outline-none ring-primary/20 transition focus:ring-2" data-testid="input-approval-threshold" /></div><button onClick={runAnalysis} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60" disabled={isAnalyzing} data-testid="button-run-analysis">{isAnalyzing ? <Clock3 size={14} className="audit-pulse" /> : <Play size={14} />} {isAnalyzing ? 'Running' : 'Run tests'}</button></div><p className="mt-2 font-mono text-[10px] leading-4 text-muted-foreground">Proximity test flags entries from {currency(Math.max(0, Number(draftThreshold || 0) * .95))} to just below threshold.</p></div>
          </section>

          <section className="audit-rise audit-delay-2 mb-9 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            <Metric label="Transactions analyzed" value={transactions.length.toLocaleString()} detail="in supplied ledger" icon={FileText} />
            <Metric label="Exceptions found" value={findings.length.toString()} detail={`${uniqueExceptionIds.size} unique entries`} icon={ShieldAlert} accent="rose" />
            <Metric label="High risk" value={riskCounts.High.toString()} detail="requires attention" icon={AlertCircle} accent="red" />
            <Metric label="Medium risk" value={riskCounts.Medium.toString()} detail="contextual review" icon={ListFilter} accent="amber" />
            <Metric label="Low risk" value={riskCounts.Low.toString()} detail="timing / context" icon={CalendarDays} accent="teal" />
            <Metric label="Flagged dollars" value={compactCurrency(flaggedDollars)} detail="unique entries" icon={BarChart3} accent="lime" />
          </section>

          <section id="exceptions-section" className="audit-rise audit-delay-3 mb-10">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="mb-1 font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">01 / Exception register</div><h2 className="font-serif text-2xl font-bold tracking-[-.03em]">Review queue</h2></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#d7a72f]" /> {filteredFindings.length} of {findings.length} findings shown</div></div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-[330px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" placeholder="Search ID, vendor, account..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none ring-primary/20 transition placeholder:text-muted-foreground/70 focus:ring-2" data-testid="input-search-exceptions" /></div><div className="flex flex-wrap items-center gap-2"><Filter size={14} className="text-muted-foreground" /><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)} className="rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none" data-testid="select-risk-filter"><option>All risks</option><option>High</option><option>Medium</option><option>Low</option></select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="max-w-[190px] rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none" data-testid="select-type-filter"><option>All tests</option>{testDefinitions.map((test) => <option key={test.type}>{test.type}</option>)}</select><button onClick={() => { setSortKey(sortKey === 'risk' ? 'amount' : sortKey === 'amount' ? 'date' : 'risk'); setSortDescending(!sortDescending); }} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs font-medium hover:bg-muted" data-testid="button-sort-exceptions"><ArrowUpDown size={14} /> Sort</button></div></div>
              {isAnalyzing ? <LoadingRows /> : filteredFindings.length === 0 ? <EmptyState hasFilters={Boolean(search || riskFilter !== 'All risks' || typeFilter !== 'All tests')} onClear={() => { setSearch(''); setRiskFilter('All risks'); setTypeFilter('All tests'); }} /> : <div className="audit-scrollbar overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left"><thead><tr className="border-b border-border bg-[#f1f0e9] font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground"><th className="px-4 py-3 font-medium">Transaction</th><th className="px-4 py-3 font-medium">Posted</th><th className="px-4 py-3 font-medium">Account / vendor</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Exception type</th><th className="px-4 py-3 font-medium">Risk</th><th className="w-10 px-4 py-3" /></tr></thead><tbody>{filteredFindings.map((finding, index) => <tr key={`${finding.id}-${finding.type}`} onClick={() => setSelectedId(finding.id)} className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-[#f6f6ed] ${selected?.id === finding.id ? 'bg-[#eef0df]' : ''}`} data-testid={`row-exception-${finding.id}-${index}`}><td className="px-4 py-3.5"><div className="font-mono text-xs font-medium text-primary">{finding.id}</div><div className="mt-1 max-w-[150px] truncate text-[11px] text-muted-foreground">{finding.description}</div></td><td className="px-4 py-3.5"><div className="text-xs">{dateLabel(finding.date)}</div><div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">{isWeekend(finding.date) ? 'Weekend' : 'Weekday'}</div></td><td className="px-4 py-3.5"><div className="text-xs font-medium">{finding.account}</div><div className="mt-1 text-[11px] text-muted-foreground">{finding.vendor}</div></td><td className="px-4 py-3.5 text-right font-mono text-xs font-medium">{currency(finding.amount)}</td><td className="px-4 py-3.5"><ExceptionTag type={finding.type} /></td><td className="px-4 py-3.5"><RiskBadge risk={finding.risk} /></td><td className="px-4 py-3.5 text-muted-foreground"><ChevronDown size={15} className="-rotate-90" /></td></tr>)}</tbody></table></div>}
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
  const colors: Record<string, string> = { teal: 'text-primary bg-[#dcece7]', rose: 'text-[#9a4b3d] bg-[#f8dfd9]', red: 'text-[#a23b31] bg-[#f8dfd9]', amber: 'text-[#98731e] bg-[#faedc7]', lime: 'text-[#55723e] bg-[#e5efd4]' };
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className={`mb-5 flex h-8 w-8 items-center justify-center rounded-md ${colors[accent]}`}>{<Icon size={16} />}</div><div className="font-mono text-2xl tracking-[-.04em] text-foreground sm:text-[27px]" data-testid={`metric-value-${label.toLowerCase().replace(/\s/g, '-')}`}>{value}</div><div className="mt-1 text-xs font-semibold">{label}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div>;
}

function RiskBadge({ risk }: { risk: Risk }) {
  const classes = risk === 'High' ? 'bg-[#f8dfd9] text-[#923c32]' : risk === 'Medium' ? 'bg-[#faedc7] text-[#89671c]' : 'bg-[#dceaf0] text-[#3f6877]';
  return <span className={`inline-flex rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[.08em] ${classes}`} data-testid={`status-risk-${risk.toLowerCase()}`}>{risk}</span>;
}

function ExceptionTag({ type }: { type: ExceptionType }) {
  const short = type === 'Approval proximity' ? 'Approval proximity' : type;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"><span className="h-1.5 w-1.5 rounded-full bg-[#c7982e]" />{short}</span>;
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e9ecda] text-primary"><Search size={21} /></div><h3 className="font-serif text-xl font-bold">{hasFilters ? 'No findings match those filters' : 'No exceptions found'}</h3><p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">{hasFilters ? 'Try a broader search or clear one of the filters to return to the full review queue.' : 'The five deterministic tests found no entries requiring a second look in this ledger.'}</p>{hasFilters && <button onClick={onClear} className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted" data-testid="button-clear-filters">Clear filters</button>}</div>;
}

function LoadingRows() {
  return <div className="space-y-0" data-testid="status-analysis-loading">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-5 border-b border-border/70 px-4 py-5 last:border-0"><div className="h-8 w-20 animate-pulse rounded bg-muted" /><div className="h-8 w-24 animate-pulse rounded bg-muted" /><div className="h-8 flex-1 animate-pulse rounded bg-muted" /><div className="h-8 w-20 animate-pulse rounded bg-muted" /><div className="h-8 w-28 animate-pulse rounded bg-muted" /></div>)}</div>;
}

function InvestigationPanel({ finding }: { finding: Finding | null }) {
  if (!finding) return <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6"><div className="flex items-center gap-2 text-muted-foreground"><PanelRightOpen size={17} /><span className="font-mono text-[10px] uppercase tracking-[.14em]">Investigation panel</span></div><div className="py-12 text-center"><div className="font-serif text-lg font-bold">Select a finding</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Choose an exception from the register to see the rule, context, and suggested follow-up.</p></div></div>;
  return <aside className="rounded-xl border border-[#b9c7b3] bg-[#edf1e7] p-5 shadow-sm sm:p-6" data-testid={`panel-investigation-${finding.id}`}><div className="flex items-center justify-between border-b border-[#cdd8c8] pb-4"><div><div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em] text-primary"><PanelRightOpen size={14} /> Investigation</div><div className="font-mono text-sm font-medium text-primary">{finding.id}</div></div><RiskBadge risk={finding.risk} /></div><div className="py-5"><div className="font-serif text-[22px] font-bold leading-tight tracking-[-.03em]">{finding.type}</div><p className="mt-2 text-xs leading-5 text-[#536659]">{finding.why}</p></div><div className="space-y-4"><InvestigationBlock label="What we saw"><div className="rounded-md border border-[#cdd8c8] bg-[#f7f8f1] p-3 text-xs leading-5 text-foreground">{finding.details}</div></InvestigationBlock><InvestigationBlock label="Transaction"><div className="grid grid-cols-2 gap-y-3 rounded-md border border-[#cdd8c8] bg-[#f7f8f1] p-3"><DataPoint label="Date" value={dateLabel(finding.date)} /><DataPoint label="Amount" value={currency(finding.amount)} /><DataPoint label="Vendor" value={finding.vendor} /><DataPoint label="Account" value={finding.account.split(' · ')[1] ?? finding.account} /></div></InvestigationBlock>{finding.related.length > 0 && <InvestigationBlock label="Related transactions"><div className="flex flex-wrap gap-2">{finding.related.map((id) => <span key={id} className="rounded-md border border-[#cdd8c8] bg-[#f7f8f1] px-2 py-1 font-mono text-[10px] text-primary">{id}</span>)}</div></InvestigationBlock>}<InvestigationBlock label="Suggested follow-up"><div className="flex gap-2 rounded-md border border-[#cdd8c8] bg-[#f7f8f1] p-3 text-xs leading-5"><Check size={15} className="mt-0.5 shrink-0 text-primary" /><span>{finding.followUp}</span></div></InvestigationBlock></div></aside>;
}

function InvestigationBlock({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="mb-2 font-mono text-[9px] uppercase tracking-[.14em] text-[#718272]">{label}</div>{children}</div>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div><div className="font-mono text-[9px] uppercase tracking-[.1em] text-[#718272]">{label}</div><div className="mt-1 truncate pr-2 text-xs font-medium" title={value}>{value}</div></div>;
}

const queryClient = new QueryClient();
function Root() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><App /></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default Root;