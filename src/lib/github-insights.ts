export type GithubProfile = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  type: "User" | "Organization" | string;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  public_repos: number;
};

export type GithubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  created_at: string;
  pushed_at: string | null;
  fork: boolean;
  archived: boolean;
};

export type GithubAccount = {
  profile: GithubProfile;
  repositories: GithubRepository[];
};

export type TrendSnapshot = {
  date: string;
  stars: number;
  repositories: number;
};

export function normalizeOwnerInput(input: string): string {
  const value = input.trim();
  if (!value) return "";

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (url.hostname === "github.com" || url.hostname === "www.github.com") {
      return decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "").replace(/^@/, "");
    }
  } catch {
    // Treat non-URL input as a username or organization name.
  }

  return value.replace(/^@/, "").replace(/\/$/, "");
}

export function getRecencyMultiplier(pushedAt: string | null, now = new Date()): number {
  if (!pushedAt) return 0.6;
  const days = (now.getTime() - new Date(pushedAt).getTime()) / 86_400_000;
  if (days < 30) return 1.5;
  if (days < 90) return 1.25;
  if (days < 365) return 1;
  return 0.6;
}

export function calculateEngagementScore(
  repository: GithubRepository,
  now = new Date(),
): number {
  const createdAt = new Date(repository.created_at).getTime();
  const ageYears = Math.max((now.getTime() - createdAt) / (365 * 86_400_000), 30 / 365);
  const activity =
    3 * repository.stargazers_count +
    5 * repository.forks_count +
    repository.watchers_count +
    0.5 * repository.open_issues_count;
  return (activity / ageYears) * getRecencyMultiplier(repository.pushed_at, now);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export async function fetchGithubAccount(ownerInput: string): Promise<GithubAccount> {
  const owner = normalizeOwnerInput(ownerInput);
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner)) {
    throw new Error("Enter a valid GitHub username, organization, or profile URL.");
  }

  const headers = { Accept: "application/vnd.github+json" };
  let profileResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}`, {
    headers,
  });
  if (profileResponse.status === 404) {
    profileResponse = await fetch(`https://api.github.com/orgs/${encodeURIComponent(owner)}`, {
      headers,
    });
  }

  if (!profileResponse.ok) {
    if (profileResponse.status === 404) throw new Error(`No public GitHub profile found for “${owner}”.`);
    if (profileResponse.status === 403 || profileResponse.status === 429) {
      throw new Error("GitHub’s public request limit has been reached. Please try again later.");
    }
    throw new Error(`GitHub could not load this profile (HTTP ${profileResponse.status}).`);
  }

  const profile = (await profileResponse.json()) as GithubProfile;
  const endpoint = profile.type === "Organization" ? "orgs" : "users";
  const repositories: GithubRepository[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `https://api.github.com/${endpoint}/${encodeURIComponent(owner)}/repos?type=${endpoint === "orgs" ? "public" : "owner"}&sort=updated&per_page=100&page=${page}`,
      { headers },
    );
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub’s public request limit has been reached. Please try again later.");
      }
      throw new Error(`GitHub could not load this repository list (HTTP ${response.status}).`);
    }
    const batch = (await response.json()) as GithubRepository[];
    repositories.push(...batch);
    if (batch.length < 100) break;
  }

  return { profile, repositories: repositories.filter((repository) => !repository.fork) };
}

export function makeCsv(repositories: GithubRepository[]): string {
  const columns: (keyof GithubRepository | "engagement_score")[] = [
    "name",
    "full_name",
    "html_url",
    "description",
    "language",
    "stargazers_count",
    "forks_count",
    "watchers_count",
    "open_issues_count",
    "created_at",
    "pushed_at",
    "engagement_score",
  ];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = repositories.map((repository) =>
    columns.map((column) =>
      escape(column === "engagement_score" ? calculateEngagementScore(repository).toFixed(2) : repository[column]),
    ),
  );
  return [columns.map(escape).join(","), ...rows.map((row) => row.join(","))].join("\r\n");
}