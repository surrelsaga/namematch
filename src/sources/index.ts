import type { Source, SourceText } from '../shared/types';

const MAX_CHARS = 12_000;
const README_CHARS = 8_000;
const MANIFEST_CHARS = 1_500;
const MANIFESTS = ['package.json', 'pyproject.toml', 'Cargo.toml'];

export async function readSource(source: Source): Promise<SourceText> {
  if (source.kind === 'markdown') {
    if (!source.text.trim()) throw new Error('The .md text is empty');
    return { label: source.filename ?? 'pasted text', text: source.text.trim().slice(0, MAX_CHARS) };
  }
  return readGithub(source.url);
}

/** Accepts github.com/owner/repo with or without https:// and www, ignores any extra path. */
function parseRepo(url: string): string | null {
  const s = url.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  return /^(www\.)?github\.com$/i.test(u.hostname) && owner && repo ? `${owner}/${repo.replace(/\.git$/, '')}` : null;
}

async function gh(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept, 'User-Agent': 'namematch' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${path}`, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("Couldn't reach GitHub, try again later");
  }
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
    throw new Error('GitHub rate limit hit, try again later');
  }
  return res;
}

// Manifests come from raw.githubusercontent.com so they don't use up the API rate limit (60/hour without a token).
async function raw(fullName: string, branch: string, file: string): Promise<string> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${fullName}/${branch}/${file}`, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

async function readGithub(url: string): Promise<SourceText> {
  const path = parseRepo(url);
  if (!path) throw new Error('Not a GitHub repo URL, expected https://github.com/owner/repo');

  const res = await gh(path);
  if (res.status === 404) throw new Error('Repo not found or private');
  if (!res.ok) throw new Error(`GitHub returned an error (${res.status}), try again later`);
  const info = await res.json() as {
    full_name: string; default_branch: string; description: string | null; topics?: string[]; language: string | null;
  };

  const [readmeRes, ...manifests] = await Promise.all([
    gh(`${info.full_name}/readme`, 'application/vnd.github.raw+json'),
    ...MANIFESTS.map((f) => raw(info.full_name, info.default_branch, f)),
  ]);
  const readme = readmeRes.ok ? await readmeRes.text() : '';

  const parts = [
    `# ${info.full_name}`,
    info.description && `Description: ${info.description}`,
    info.topics?.length && `Topics: ${info.topics.join(', ')}`,
    info.language && `Language: ${info.language}`,
    readme.trim() && `\n## README\n${readme.trim().slice(0, README_CHARS)}`,
    ...MANIFESTS.map((f, i) => manifests[i].trim() && `\n## ${f}\n${manifests[i].trim().slice(0, MANIFEST_CHARS)}`),
  ];
  return { label: info.full_name, text: parts.filter(Boolean).join('\n').slice(0, MAX_CHARS) };
}
