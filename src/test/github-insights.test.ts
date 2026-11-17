import { describe, expect, it } from "vitest";

import {
  calculateEngagementScore,
  getRecencyMultiplier,
  normalizeOwnerInput,
} from "@/lib/github-insights";

describe("GitHub insight calculations", () => {
  it("normalizes usernames, profile URLs, and repository URLs to their owner", () => {
    expect(normalizeOwnerInput("@octocat")).toBe("octocat");
    expect(normalizeOwnerInput("https://github.com/octocat/Hello-World")).toBe("octocat");
    expect(normalizeOwnerInput("github.com/vercel/next.js/")).toBe("vercel");
  });

  it("uses the presentation's 1.50x, 1.25x, 1.00x, and 0.60x recency tiers", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    expect(getRecencyMultiplier("2026-11-01T00:00:00Z", now)).toBe(1.5);
    expect(getRecencyMultiplier("2026-09-01T00:00:00Z", now)).toBe(1.25);
    expect(getRecencyMultiplier("2026-03-01T00:00:00Z", now)).toBe(1);
    expect(getRecencyMultiplier("2025-01-01T00:00:00Z", now)).toBe(0.6);
  });

  it("applies the presentation's weighted score with the 30-day minimum age", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const score = calculateEngagementScore({
      id: 1,
      name: "sample",
      full_name: "octocat/sample",
      html_url: "https://github.com/octocat/sample",
      description: null,
      language: "TypeScript",
      stargazers_count: 10,
      forks_count: 2,
      watchers_count: 4,
      open_issues_count: 6,
      created_at: "2026-10-18T00:00:00Z",
      pushed_at: "2026-11-01T00:00:00Z",
      fork: false,
      archived: false,
    }, now);

    expect(score).toBeCloseTo(((3 * 10 + 5 * 2 + 4 + 0.5 * 6) / (30 / 365)) * 1.5, 6);
  });
});