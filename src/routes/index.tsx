import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Code2,
  Download,
  ExternalLink,
  GitBranch,
  GitFork,
  Github,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  calculateEngagementScore,
  fetchGithubAccount,
  formatCompact,
  makeCsv,
  normalizeOwnerInput,
  type GithubAccount,
  type GithubRepository,
  type TrendSnapshot,
} from "@/lib/github-insights";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RepoScope — GitHub Repository Insights" },
      {
        name: "description",
        content: "Explore public GitHub repositories, engagement scores, and portfolio signals.",
      },
      { property: "og:title", content: "RepoScope — GitHub Repository Insights" },
      {
        property: "og:description",
        content: "Explore public GitHub repositories, engagement scores, and portfolio signals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SAMPLE_OWNERS = ["vercel", "torvalds", "shadcn"];
const HISTORY_PREFIX = "reposcope:snapshots:";

type SortField = "stargazers_count" | "forks_count" | "open_issues_count" | "pushed_at" | "score";

const languageColors: Record<string, string> = {
  TypeScript: "bg-chart-1",
  JavaScript: "bg-chart-4",
  Python: "bg-chart-3",
  Go: "bg-chart-2",
  Rust: "bg-chart-5",
};

function Index() {
  const [ownerInput, setOwnerInput] = useState("vercel");
  const [activeOwner, setActiveOwner] = useState("vercel");
  const [account, setAccount] = useState<GithubAccount | null>(null);
  const [snapshots, setSnapshots] = useState<TrendSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("stargazers_count");
  const [sortDescending, setSortDescending] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAccount(null);

    fetchGithubAccount(activeOwner, controller.signal)
      .then((result) => setAccount(result))
      .catch((fetchError: unknown) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load this account.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeOwner]);

  useEffect(() => {
    if (!account) return;
    const normalizedOwner = account.profile.login.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const stars = account.repositories.reduce((sum, repository) => sum + repository.stargazers_count, 0);
    const currentSnapshot: TrendSnapshot = {
      date: today,
      stars,
      repositories: account.repositories.length,
    };
    let previousSnapshots: TrendSnapshot[] = [];
    try {
      previousSnapshots = JSON.parse(
        window.localStorage.getItem(`${HISTORY_PREFIX}${normalizedOwner}`) ?? "[]",
      ) as TrendSnapshot[];
    } catch {
      previousSnapshots = [];
    }
    const nextSnapshots = [
      ...previousSnapshots.filter((snapshot) => snapshot.date !== today),
      currentSnapshot,
    ].slice(-30);
    window.localStorage.setItem(`${HISTORY_PREFIX}${normalizedOwner}`, JSON.stringify(nextSnapshots));
    setSnapshots(nextSnapshots);
  }, [account]);

  const now = new Date();
  const repositories = account?.repositories ?? [];
  const scoredRepositories = useMemo(
    () => repositories.map((repository) => ({
      repository,
      score: calculateEngagementScore(repository, now),
    })),
    [repositories],
  );
  const totals = useMemo(() => ({
    stars: repositories.reduce((sum, repository) => sum + repository.stargazers_count, 0),
    forks: repositories.reduce((sum, repository) => sum + repository.forks_count, 0),
    issues: repositories.reduce((sum, repository) => sum + repository.open_issues_count, 0),
    score: repositories.length
      ? scoredRepositories.reduce((sum, item) => sum + item.score, 0) / repositories.length
      : 0,
  }), [repositories, scoredRepositories]);
  const languages = useMemo(() => {
    const counts = new Map<string, { count: number; stars: number }>();
    for (const repository of repositories) {
      const language = repository.language ?? "Not specified";
      const existing = counts.get(language) ?? { count: 0, stars: 0 };
      counts.set(language, {
        count: existing.count + 1,
        stars: existing.stars + repository.stargazers_count,
      });
    }
    return [...counts.entries()].map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.count - a.count);
  }, [repositories]);
  const rankedLanguages = useMemo(() => [...languages].sort((a, b) => b.stars - a.stars), [languages]);
  const activeLast90 = repositories.filter((repository) => repository.pushed_at &&
    now.getTime() - new Date(repository.pushed_at).getTime() < 90 * 86_400_000).length;
  const archivedCount = repositories.filter((repository) => repository.archived).length;
  const missingDescription = repositories.filter((repository) => !repository.description).length;
  const concentration = totals.stars > 0
    ? Math.max(...repositories.map((repository) => repository.stargazers_count), 0) / totals.stars
    : 0;
  const filteredRepositories = useMemo(() => {
    const search = query.trim().toLowerCase();
    return scoredRepositories
      .filter(({ repository }) => !search || `${repository.name} ${repository.description ?? ""} ${repository.language ?? ""}`.toLowerCase().includes(search))
      .sort((a, b) => {
        const left = sortField === "score" ? a.score : sortField === "pushed_at"
          ? new Date(a.repository.pushed_at ?? 0).getTime()
          : a.repository[sortField];
        const right = sortField === "score" ? b.score : sortField === "pushed_at"
          ? new Date(b.repository.pushed_at ?? 0).getTime()
          : b.repository[sortField];
        return (typeof left === "number" && typeof right === "number" ? left - right : 0) * (sortDescending ? -1 : 1);
      });
  }, [scoredRepositories, query, sortField, sortDescending]);
  const displayedRepositories = showAll ? filteredRepositories : filteredRepositories.slice(0, 8);
  const growth = snapshots.length > 1 ? snapshots.at(-1)!.stars - snapshots.at(-2)!.stars : null;

  function startAnalysis(event?: FormEvent<HTMLFormElement>, selectedOwner?: string) {
    event?.preventDefault();
    const normalized = normalizeOwnerInput(selectedOwner ?? ownerInput);
    if (!normalized) return;
    setOwnerInput(normalized);
    setActiveOwner(normalized);
    setQuery("");
    setShowAll(false);
  }

  function exportCsv() {
    const file = new Blob([makeCsv(repositories)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${account?.profile.login ?? "github"}-repositories.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function changeSort(field: SortField) {
    if (sortField === field) setSortDescending((current) => !current);
    else {
      setSortField(field);
      setSortDescending(true);
    }
  }

  return (
    <div className="dashboard-frame flex bg-background text-foreground">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <a href="#overview" className="flex h-[68px] items-center gap-3 border-b border-sidebar-border px-5">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><Github size={18} /></span>
          <span className="font-display text-[15px] font-semibold">repo<span className="text-primary">scope</span></span>
        </a>
        <div className="px-3 pt-6">
          <p className="mb-2 px-3 font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>
          <nav aria-label="Dashboard sections" className="space-y-1">
            <a href="#overview" className="sidebar-link-active flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"><LayoutDashboard size={16} /> Overview</a>
            <a href="#repositories" className="sidebar-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"><GitBranch size={16} /> Repositories</a>
            <a href="#trends" className="sidebar-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"><TrendingUp size={16} /> Trends</a>
            <a href="#signals" className="sidebar-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"><ShieldCheck size={16} /> Portfolio health</a>
          </nav>
        </div>
        <div className="mt-8 px-3">
          <p className="mb-2 px-3 font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Quick scan</p>
          <div className="space-y-1">
            {SAMPLE_OWNERS.map((sample) => (
              <button key={sample} onClick={() => startAnalysis(undefined, sample)} className="sidebar-link flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm">
                <span className="size-1.5 rounded-full bg-primary/80" />{sample}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-chart-2" /> Public GitHub data</div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Repository snapshots are saved on this device.</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6 xl:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground lg:hidden"><Github size={17} /></div>
            <div className="hidden min-w-0 sm:block"><p className="font-display text-xs text-muted-foreground">WORKSPACE / REPOSITORY ANALYTICS</p><p className="mt-0.5 truncate text-sm font-medium">{account?.profile.login ?? "GitHub overview"}</p></div>
            <nav aria-label="Mobile dashboard sections" className="flex items-center gap-1 lg:hidden">
              <a className="rounded px-2 py-1 text-xs text-foreground" href="#overview">Overview</a>
              <a className="rounded px-2 py-1 text-xs text-muted-foreground" href="#repositories">Repos</a>
              <a className="rounded px-2 py-1 text-xs text-muted-foreground" href="#trends">Trends</a>
            </nav>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <form onSubmit={startAnalysis} className="flex min-w-0 flex-1 items-center gap-2 sm:w-[330px] sm:flex-none">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">GitHub username, organization, or URL</span>
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={ownerInput}
                  onChange={(event) => setOwnerInput(event.target.value)}
                  placeholder="Username, organization, or URL"
                  className="h-9 w-full rounded-md border border-input bg-surface-inset pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                />
              </label>
              <Button type="submit" size="sm" className="h-9 px-3"><span className="hidden sm:inline">Analyze</span><Search className="sm:hidden" /></Button>
            </form>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 xl:px-9">
          <section id="overview" className="scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.12em] text-primary"><span className="size-1.5 rounded-full bg-primary" /> Repository intelligence</div>
                <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Portfolio overview</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Public repository performance, engagement, and maintenance signals.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-2" disabled={loading || !account} onClick={() => startAnalysis()} title="Refresh analysis"><RefreshCw className={loading ? "animate-spin" : ""} size={14} /><span className="hidden sm:inline">Refresh</span></Button>
                <Button variant="outline" size="sm" className="h-9 gap-2" disabled={!account} onClick={exportCsv} title="Export repositories as CSV"><Download size={14} /><span className="hidden sm:inline">Export CSV</span></Button>
              </div>
            </div>

            {loading && (
              <div role="status" className="mb-5 flex items-center gap-3 border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><LoaderCircle size={16} className="animate-spin text-primary" /> Gathering public repositories for {normalizeOwnerInput(activeOwner)}…</div>
            )}
            {error && (
              <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-destructive"><CircleAlert size={16} />{error}</span>
                <Button variant="outline" size="sm" onClick={() => startAnalysis()}>Try again</Button>
              </div>
            )}

            {account && (
              <div className="load-in mb-5 flex flex-wrap items-center gap-4 border border-border bg-card px-4 py-4 sm:px-5">
                <img src={account.profile.avatar_url} alt={`${account.profile.login} avatar`} className="size-12 rounded-full border border-border" />
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{account.profile.name || account.profile.login}</h2><span className="rounded-sm border border-border bg-secondary px-2 py-0.5 font-display text-[10px] uppercase text-muted-foreground">{account.profile.type === "Organization" ? "Organization" : "User"}</span></div>
                  <a href={account.profile.html_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 font-display text-xs text-primary hover:underline">@{account.profile.login}<ExternalLink size={11} /></a>
                  {account.profile.bio && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{account.profile.bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {account.profile.company && <span>{account.profile.company}</span>}
                    {account.profile.location && <span className="inline-flex items-center gap-1"><MapPin size={12} />{account.profile.location}</span>}
                    <span className="inline-flex items-center gap-1"><UsersRound size={12} />{formatCompact(account.profile.followers)} followers</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Snapshot {new Date().toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                </div>
                <a href={account.profile.html_url} target="_blank" rel="noreferrer" aria-label="Open GitHub profile" className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><ArrowUpRight size={17} /></a>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard title="Original repositories" value={account ? formatCompact(repositories.length) : "—"} note={account ? `${formatCompact(account.profile.public_repos)} public total · forks excluded` : "Forks excluded"} icon={<GitBranch size={16} />} loading={loading} />
              <MetricCard title="Community stars" value={account ? formatCompact(totals.stars) : "—"} note={growth === null ? "Daily trend begins with your next snapshot" : `${growth >= 0 ? "+" : ""}${formatCompact(growth)} vs previous snapshot`} icon={<Star size={16} />} loading={loading} accent />
              <MetricCard title="Forks & open issues" value={account ? `${formatCompact(totals.forks)} / ${formatCompact(totals.issues)}` : "—"} note="Forks received / open issues" icon={<GitFork size={16} />} loading={loading} />
              <MetricCard title="Avg. engagement score" value={account ? formatCompact(totals.score) : "—"} note="Age-normalized, recency-weighted" icon={<Sparkles size={16} />} loading={loading} accent />
            </div>
          </section>

          <section id="trends" className="mt-5 grid scroll-mt-24 gap-4 xl:grid-cols-[1.7fr_1fr]">
            <div className="panel min-w-0 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div><div className="flex items-center gap-2"><h2 className="font-display text-sm font-medium">Star growth</h2><span className="rounded-sm border border-border px-1.5 py-0.5 font-display text-[9px] uppercase text-muted-foreground">Daily snapshot</span></div><p className="mt-1 text-xs text-muted-foreground">Repository stars captured on this device over time</p></div>
                <div className="text-right"><p className="metric-value text-lg font-semibold">{account ? formatCompact(totals.stars) : "—"}</p><p className="text-[10px] text-muted-foreground">total stars</p></div>
              </div>
              <TrendChart snapshots={snapshots} loading={loading} />
              {snapshots.length < 2 && account && <p className="mt-2 text-center text-[11px] text-muted-foreground">A new daily snapshot will reveal star growth here.</p>}
            </div>
            <div className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between"><div><h2 className="font-display text-sm font-medium">Top repositories</h2><p className="mt-1 text-xs text-muted-foreground">Ranked by recency-adjusted engagement</p></div><BarChart3 size={16} className="text-muted-foreground" /></div>
              <div className="space-y-4">
                {account && scoredRepositories.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No original repositories found.</p>}
                {scoredRepositories.slice().sort((a, b) => b.score - a.score).slice(0, 5).map(({ repository, score }, index) => {
                  const maximum = Math.max(...scoredRepositories.map((item) => item.score), 1);
                  return <div key={repository.id}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 truncate text-xs"><span className="font-display text-[10px] text-muted-foreground">0{index + 1}</span><a className="truncate hover:text-primary" href={repository.html_url} target="_blank" rel="noreferrer">{repository.name}</a></span><span className="metric-value shrink-0 text-[10px] text-muted-foreground">{formatCompact(score)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((score / maximum) * 100, 2)}%` }} /></div></div>;
                })}
                {loading && <div className="flex h-40 items-center justify-center text-muted-foreground"><LoaderCircle className="animate-spin" size={18} /></div>}
              </div>
            </div>
          </section>

          <section id="signals" className="mt-5 grid scroll-mt-24 gap-4 xl:grid-cols-[1.1fr_1fr_1fr]">
            <div className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-sm font-medium">Language mix</h2><p className="mt-1 text-xs text-muted-foreground">Share of original repositories</p></div><Code2 size={16} className="text-muted-foreground" /></div>
              {account && languages.length ? <div className="space-y-3">{languages.slice(0, 5).map((language) => <div key={language.name}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 truncate"><span className={`size-2 rounded-full ${languageColors[language.name] ?? "bg-muted-foreground"}`} />{language.name}</span><span className="font-display text-[10px] text-muted-foreground">{language.count} <span className="ml-1">· {formatCompact(language.stars)} ★</span></span></div><div className="h-1 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${languageColors[language.name] ?? "bg-muted-foreground"}`} style={{ width: `${(language.count / Math.max(repositories.length, 1)) * 100}%` }} /></div></div>)}</div> : <EmptyInline loading={loading} />}
            </div>
            <div className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-sm font-medium">Maintenance health</h2><p className="mt-1 text-xs text-muted-foreground">Recent activity and repo hygiene</p></div><Activity size={16} className="text-muted-foreground" /></div>
              <HealthMeter label="Active in last 90 days" count={activeLast90} total={repositories.length} color="bg-chart-2" loading={loading} />
              <SignalRow icon={<Archive size={14} />} label="Archived repositories" value={account ? `${archivedCount}` : "—"} />
              <SignalRow icon={<CircleAlert size={14} />} label="Missing descriptions" value={account ? `${missingDescription}` : "—"} warn={missingDescription > 0} />
              <SignalRow icon={<Globe2 size={14} />} label="Languages represented" value={account ? `${languages.length}` : "—"} />
            </div>
            <div className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-sm font-medium">Portfolio signals</h2><p className="mt-1 text-xs text-muted-foreground">Concentration and creation pace</p></div><ShieldCheck size={16} className="text-muted-foreground" /></div>
              <div className="border-b border-border pb-3"><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Top repository star share</span><span className={`font-display ${concentration > 0.25 ? "text-primary" : "text-chart-2"}`}>{account ? `${Math.round(concentration * 100)}%` : "—"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(concentration * 100, 100)}%` }} /></div><p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">{concentration > 0.25 ? <CircleAlert className="mt-0.5 shrink-0 text-primary" size={12} /> : <Check className="mt-0.5 shrink-0 text-chart-2" size={12} />}{account ? concentration > 0.25 ? "High concentration: top repo exceeds the 25% portfolio threshold." : "No single repository exceeds the 25% portfolio threshold." : "Measures how much of the portfolio is concentrated in one repository."}</p></div>
              <div className="pt-3"><p className="mb-2 text-xs text-muted-foreground">Repositories created by year</p><CreationTimeline repositories={repositories} loading={loading} /></div>
            </div>
          </section>

          <section id="repositories" className="panel mt-5 scroll-mt-24 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div><div className="flex items-center gap-2"><h2 className="font-display text-sm font-medium">Repositories</h2><span className="rounded-sm bg-secondary px-1.5 py-0.5 font-display text-[10px] text-muted-foreground">{account ? repositories.length : "—"}</span></div><p className="mt-1 text-xs text-muted-foreground">Forks excluded · sorted by {sortField === "score" ? "engagement" : sortField.replaceAll("_", " ")}</p></div>
              <label className="relative w-full sm:w-[250px]"><span className="sr-only">Filter repositories</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter name or language…" className="h-8 w-full rounded-md border border-input bg-surface-inset pl-8 pr-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" />{query && <button type="button" aria-label="Clear repository filter" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={13} /></button>}</label>
            </div>
            <div className="scrollbar-quiet overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead className="bg-surface-inset text-[10px] uppercase text-muted-foreground"><tr>
                  <th scope="col" className="px-4 py-3 font-medium sm:px-5">Repository</th><th scope="col" className="px-3 py-3 font-medium">Language</th>
                  <SortHeader title="Stars" field="stargazers_count" sortField={sortField} descending={sortDescending} onSort={changeSort} />
                  <SortHeader title="Forks" field="forks_count" sortField={sortField} descending={sortDescending} onSort={changeSort} />
                  <SortHeader title="Issues" field="open_issues_count" sortField={sortField} descending={sortDescending} onSort={changeSort} />
                  <SortHeader title="Score" field="score" sortField={sortField} descending={sortDescending} onSort={changeSort} />
                  <SortHeader title="Last push" field="pushed_at" sortField={sortField} descending={sortDescending} onSort={changeSort} />
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {displayedRepositories.map(({ repository, score }) => <RepositoryRow key={repository.id} repository={repository} score={score} />)}
                  {loading && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground"><LoaderCircle className="mx-auto mb-2 animate-spin" size={18} />Loading repositories</td></tr>}
                  {!loading && account && displayedRepositories.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">{repositories.length ? "No repositories match this filter." : "This account has no original public repositories."}</td></tr>}
                  {error && !loading && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Repository data is unavailable until an account loads.</td></tr>}
                </tbody>
              </table>
            </div>
            {filteredRepositories.length > 8 && <div className="border-t border-border px-4 py-3 text-center"><Button variant="ghost" size="sm" onClick={() => setShowAll((current) => !current)} className="gap-1.5 text-xs">{showAll ? "Show fewer" : `Show all ${filteredRepositories.length} repositories`}<ChevronDown className={`transition-transform ${showAll ? "rotate-180" : ""}`} size={14} /></Button></div>}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 px-1 py-5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><CircleDot size={11} className="text-chart-2" /> Public GitHub profile data · forked repositories excluded</span>
            <span className="font-display">REPOSCOPE / v1</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, note, icon, loading, accent = false }: {
  title: string; value: string; note: string; icon: React.ReactNode; loading: boolean; accent?: boolean;
}) {
  return <div className="panel min-w-0 p-3.5 sm:p-4"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs text-muted-foreground">{title}</p><span className={`grid size-7 shrink-0 place-items-center rounded-md ${accent ? "bg-ember-soft text-primary" : "bg-secondary text-muted-foreground"}`}>{icon}</span></div><p className="metric-value mt-3 truncate text-xl font-semibold sm:text-2xl">{loading ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-secondary align-middle" /> : value}</p><p className="mt-1 truncate text-[10px] text-muted-foreground" title={note}>{note}</p></div>;
}

function TrendChart({ snapshots, loading }: { snapshots: TrendSnapshot[]; loading: boolean }) {
  const width = 700;
  const height = 190;
  const left = 42;
  const right = 8;
  const top = 12;
  const bottom = 30;
  const values = snapshots.map((snapshot) => snapshot.stars);
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 1);
  const range = Math.max(maximum - minimum, 1);
  const points = snapshots.map((snapshot, index) => ({
    x: snapshots.length === 1 ? width / 2 : left + (index / (snapshots.length - 1)) * (width - left - right),
    y: top + (1 - (snapshot.stars - minimum) / range) * (height - top - bottom),
    snapshot,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = points.length > 1 ? `${line} L${points.at(-1)?.x},${height - bottom} L${points[0]?.x},${height - bottom} Z` : "";
  if (loading) return <div className="flex h-[190px] items-center justify-center text-muted-foreground"><LoaderCircle size={18} className="animate-spin" /></div>;
  if (!snapshots.length) return <div className="flex h-[190px] items-center justify-center text-xs text-muted-foreground">Snapshot data will appear here.</div>;
  return <svg role="img" aria-label="Historical daily star-count snapshots" viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full" preserveAspectRatio="none">
    {[0, 1, 2, 3].map((lineIndex) => { const y = top + (lineIndex / 3) * (height - top - bottom); return <g key={lineIndex}><line x1={left} x2={width - right} y1={y} y2={y} className="chart-grid" /><text x="2" y={y + 3} className="fill-muted-foreground" fontSize="9">{formatCompact(maximum - (lineIndex / 3) * range)}</text></g>; })}
    {area && <path d={area} fill="var(--ember-soft)" />}
    {line && <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {points.map((point) => <g key={point.snapshot.date}><circle cx={point.x} cy={point.y} r="4" fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth="2" /><text x={point.x} y={height - 7} textAnchor="middle" className="fill-muted-foreground" fontSize="9">{new Date(`${point.snapshot.date}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</text></g>)}
  </svg>;
}

function EmptyInline({ loading }: { loading: boolean }) {
  return <div className="flex h-36 items-center justify-center gap-2 text-xs text-muted-foreground">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <SlidersHorizontal size={14} />} {loading ? "Analyzing languages…" : "No language data available."}</div>;
}

function HealthMeter({ label, count, total, color, loading }: { label: string; count: number; total: number; color: string; loading: boolean }) {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return <div className="mb-3 border-b border-border pb-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-display text-[10px]">{loading ? "—" : `${percent}%`}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${color}`} style={{ width: `${percent}%` }} /></div><p className="mt-1.5 text-[10px] text-muted-foreground">{loading ? "Loading activity…" : `${count} of ${total} repositories`}</p></div>;
}

function SignalRow({ icon, label, value, warn = false }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return <div className="flex items-center justify-between gap-3 py-2 text-xs"><span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span><span className={warn ? "font-display text-primary" : "font-display"}>{value}</span></div>;
}

function CreationTimeline({ repositories, loading }: { repositories: GithubRepository[]; loading: boolean }) {
  if (loading) return <div className="flex h-20 items-center justify-center text-muted-foreground"><LoaderCircle size={15} className="animate-spin" /></div>;
  const years = new Map<number, number>();
  for (const repository of repositories) {
    const year = new Date(repository.created_at).getFullYear();
    years.set(year, (years.get(year) ?? 0) + 1);
  }
  const latest = [...years.entries()].sort(([a], [b]) => a - b).slice(-5);
  const largest = Math.max(...latest.map(([, count]) => count), 1);
  if (!latest.length) return <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground">No repository history.</div>;
  return <div className="flex h-[82px] items-end justify-between gap-2">{latest.map(([year, count]) => <div key={year} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"><span className="font-display text-[9px] text-muted-foreground">{count}</span><div title={`${count} repositories created in ${year}`} className="w-full max-w-8 rounded-t-sm bg-chart-3/70" style={{ height: `${Math.max((count / largest) * 42, 3)}px` }} /><span className="font-display text-[9px] text-muted-foreground">{year}</span></div>)}</div>;
}

function SortHeader({ title, field, sortField, descending, onSort }: {
  title: string; field: SortField; sortField: SortField; descending: boolean; onSort: (field: SortField) => void;
}) {
  const selected = field === sortField;
  return <th scope="col" className="px-3 py-3 font-medium"><button type="button" onClick={() => onSort(field)} aria-sort={selected ? (descending ? "descending" : "ascending") : "none"} className={`inline-flex items-center gap-1 ${selected ? "text-foreground" : "hover:text-foreground"}`}>{title}{selected ? descending ? <ArrowDown size={11} /> : <ArrowUp size={11} /> : null}</button></th>;
}

function RepositoryRow({ repository, score }: { repository: GithubRepository; score: number }) {
  const colorClass = repository.language ? languageColors[repository.language] ?? "bg-muted-foreground" : "bg-muted-foreground";
  return <tr className="table-row transition-colors">
    <td className="max-w-[340px] px-4 py-3.5 sm:px-5"><div className="flex items-center gap-2"><a href={repository.html_url} target="_blank" rel="noreferrer" className="truncate font-medium text-foreground hover:text-primary">{repository.name}</a><a href={repository.html_url} target="_blank" rel="noreferrer" aria-label={`Open ${repository.name} on GitHub`} className="shrink-0 text-muted-foreground hover:text-primary"><ExternalLink size={12} /></a></div><p className="mt-1 truncate text-[10px] text-muted-foreground">{repository.description || "No description provided"}</p></td>
    <td className="px-3 py-3.5"><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground"><span className={`size-2 rounded-full ${colorClass}`} />{repository.language ?? "—"}</span></td>
    <td className="metric-value px-3 py-3.5">{formatCompact(repository.stargazers_count)}</td><td className="metric-value px-3 py-3.5">{formatCompact(repository.forks_count)}</td><td className="metric-value px-3 py-3.5">{formatCompact(repository.open_issues_count)}</td><td className="metric-value px-3 py-3.5 text-primary">{formatCompact(score)}</td>
    <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{repository.pushed_at ? new Date(repository.pushed_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
  </tr>;
}
