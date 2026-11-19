import { buildFallbackSnapshot } from './github-sample';
import {
  GITHUB_PRESETS,
  type GithubPreset,
  type GithubSnapshot,
  type SnapshotCommit,
} from './github-types';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const USER_AGENT = 'relay-handover-agent/3.0';
const MAX_FILES = 18;
const MAX_FILE_BYTES = 24_000;

export class GitHubFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'GitHubFetchError';
  }
}

export function normalizeRepo(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new GitHubFetchError('Repository is required', 400);

  const fromUrl = trimmed
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  const parts = fromUrl.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new GitHubFetchError('Use owner/repository or a GitHub URL', 400);
  }
  const owner = parts[0];
  const name = parts[1];
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new GitHubFetchError('Repository name contains invalid characters', 400);
  }
  return `${owner}/${name}`;
}

export function presetById(id: string | undefined): GithubPreset | null {
  if (!id) return null;
  return GITHUB_PRESETS.find((preset) => preset.id === id) ?? null;
}

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    base.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return base;
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: headers(),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new GitHubFetchError(
      `GitHub API unreachable: ${
        error instanceof Error ? error.message : 'network error'
      }`,
    );
  }

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const detail =
      response.status === 403 && remaining === '0'
        ? 'unauthenticated GitHub rate limit reached'
        : `GitHub API returned ${response.status}`;
    throw new GitHubFetchError(detail, response.status);
  }

  return (await response.json()) as T;
}

async function fetchRaw(
  fullName: string,
  sha: string,
  path: string,
): Promise<string | null> {
  const encoded = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  try {
    const response = await fetch(`${RAW}/${fullName}/${sha}/${encoded}`, {
      headers: { 'user-agent': USER_AGENT },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.slice(0, MAX_FILE_BYTES);
  } catch {
    return null;
  }
}

interface RepoMeta {
  full_name: string;
  default_branch: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  license: { spdx_id?: string; name?: string } | null;
}

interface CommitPayload {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
  };
  author?: { login?: string } | null;
}

interface TreePayload {
  sha: string;
  truncated: boolean;
  tree: { path: string; type: string }[];
}

function priority(path: string): number {
  const lower = path.toLowerCase();
  if (lower === 'package.json') return 0;
  if (lower === 'readme.md' || lower === 'readme') return 1;
  if (/^\.github\/workflows\//.test(lower)) return 2;
  if (/^\.nvmrc$|^\.node-version$/.test(lower)) return 3;
  if (/(^|\/)dockerfile/.test(lower)) return 4;
  if (lower === 'security.md' || lower === 'codeowners') return 5;
  if (/docs?\/(runbook|rollback|release|incident|architecture|deploy|billing)/.test(lower)) {
    return 6;
  }
  if (/(webhook|retry|billing|config|db|client|datastore|server)/.test(lower)) {
    return 7;
  }
  if (/^docs?\//.test(lower) && lower.endsWith('.md')) return 8;
  return 20;
}

function isFetchable(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md') || lower === 'codeowners') return true;
  if (lower === 'package.json') return true;
  if (lower === '.nvmrc' || lower === '.node-version') return true;
  if (/(^|\/)dockerfile/.test(lower)) return true;
  if (/^\.github\/workflows\/.+\.ya?ml$/.test(lower)) return true;
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|yml|yaml)$/.test(lower);
}

function selectPaths(paths: string[]): string[] {
  return paths
    .filter((path) => !path.includes('node_modules/') && isFetchable(path))
    .filter((path) => {
      const lower = path.toLowerCase();
      // Prefer root manifests and handover docs over thousands of source files.
      return (
        priority(path) <= 8 ||
        /^services?\//.test(lower) ||
        /^src\//.test(lower) ||
        /^\.github\//.test(lower)
      );
    })
    .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))
    .slice(0, MAX_FILES);
}

/** Fetch a real snapshot using only the unauthenticated GitHub REST API. */
export async function fetchGithubSnapshot(
  repoInput: string,
): Promise<GithubSnapshot> {
  const fullName = normalizeRepo(repoInput);
  const meta = await fetchJson<RepoMeta>(`${API}/repos/${fullName}`);
  const commitsPayload = await fetchJson<CommitPayload[]>(
    `${API}/repos/${fullName}/commits?per_page=8`,
  );

  const commits: SnapshotCommit[] = commitsPayload.map((commit) => ({
    sha: commit.sha,
    message: (commit.commit.message ?? '').split('\n')[0].slice(0, 180),
    date: commit.commit.author?.date ?? new Date(0).toISOString(),
    author: commit.author?.login ?? commit.commit.author?.name ?? 'unknown',
  }));

  const headSha = commits[0]?.sha ?? meta.default_branch;
  const tree = await fetchJson<TreePayload>(
    `${API}/repos/${fullName}/git/trees/${encodeURIComponent(headSha)}?recursive=1`,
  );

  const paths = tree.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path);
  const selected = selectPaths(paths);

  const files: Record<string, string> = {};
  // Small concurrency window keeps the raw fetches fast without tripping
  // connection limits on a serverless runtime.
  for (let index = 0; index < selected.length; index += 6) {
    const batch = selected.slice(index, index + 6);
    const contents = await Promise.all(
      batch.map((path) => fetchRaw(fullName, headSha, path)),
    );
    batch.forEach((path, batchIndex) => {
      const content = contents[batchIndex];
      if (content != null) files[path] = content;
    });
  }

  const [owner, name] = fullName.split('/');

  return {
    owner,
    name,
    fullName,
    defaultBranch: meta.default_branch,
    htmlUrl: meta.html_url,
    description: meta.description,
    language: meta.language,
    stars: meta.stargazers_count,
    license: meta.license?.spdx_id ?? meta.license?.name ?? null,
    headSha,
    headCommittedAt:
      commits[0]?.date ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    paths,
    files,
    commits,
    truncated: Boolean(tree.truncated),
  };
}

export interface FetchedSnapshot {
  snapshot: GithubSnapshot;
  mode: 'live' | 'fallback';
  fallbackReason?: string;
}

/**
 * Try the real API, then degrade to the labelled fixture. The fallback is never
 * presented as live in the API response or the UI.
 */
export async function fetchSnapshotWithFallback(
  repoInput: string,
): Promise<FetchedSnapshot> {
  const repo = normalizeRepo(repoInput);
  try {
    const snapshot = await fetchGithubSnapshot(repo);
    return { snapshot, mode: 'live' };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'GitHub API unavailable';
    return {
      snapshot: buildFallbackSnapshot(repo, reason),
      mode: 'fallback',
      fallbackReason: reason,
    };
  }
}
