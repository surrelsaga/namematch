export type Kind = 'startup' | 'side-project' | 'dev-tool';
export type Feel = 'professional' | 'short-cool' | 'random-fun';
export type Audience = 'developers' | 'everyday' | 'businesses';
export const TLDS = ['com', 'dev', 'app', 'tech', 'ai'] as const;
export type Tld = (typeof TLDS)[number];

export type Source =
  | { kind: 'github'; url: string }
  | { kind: 'markdown'; text: string; filename?: string };

export interface SourceText { label: string; text: string }   // text trimmed to ~12k chars

export interface ProjectProfile {
  title?: string;
  summary: string;        // 1 to 2 plain sentences
  keywords: string[];     // 3 to 8
}

export interface NameInputs {
  kind: Kind;
  feels: Feel[];          // 1 or 2
  audience: Audience;
  keep: string[];         // may be empty
  avoid: string[];        // may be empty
  tlds: Tld[];            // 0 to 5; empty = no lookups
}

export interface NamingPlan {
  namers: { feel: Feel; count: number }[];   // 1 or 2 entries, total ~10
  twist: string;
  reasoning: string;                         // one sentence, for the log
}

export interface Candidate { name: string; from: Feel | 'feedback'; meaning: string }
export interface Pick { name: string; whyItFits: string }

export type DomainStatus = 'taken' | 'available' | 'unknown';
export interface DomainResult {
  tld: Tld;
  domain: string;         // "rydo.dev"
  status: DomainStatus;
  registerUrl?: string;   // only when available
}

export interface NameCard {
  id: string;
  name: string;
  from: Feel | 'feedback';
  meaning: string;
  whyItFits: string;
  domains: DomainResult[];   // empty when no tlds
  variantOf?: string;
  round: number;             // 1 = generate, 2+ = feedback rounds
}

export type Actor =
  | 'supervisor' | 'professional' | 'short-cool' | 'random-fun'
  | 'domain-checker' | 'feedback' | 'you' | 'system';

export interface LogLine {
  i: number;              // increasing per session
  at: string;             // ISO
  actor: Actor;
  text: string;
  level: 'info' | 'warn' | 'done';
}

export type Logger = (actor: Actor, text: string, level?: LogLine['level']) => void;

export interface ChatTurn { role: 'user' | 'agent'; text: string; at: string }

export type SessionStatus =
  | 'analyzing' | 'needs-inputs' | 'generating' | 'ready' | 'refining' | 'error';

export interface Session {
  id: string;
  status: SessionStatus;
  sourceLabel: string;
  profile?: ProjectProfile;
  suggested?: NameInputs;
  inputs?: NameInputs;
  cards: NameCard[];      // newest round first
  chat: ChatTurn[];
  logs: LogLine[];
  error?: string;
}

export type SessionView = Session;   // GET returns logs with i > after only
