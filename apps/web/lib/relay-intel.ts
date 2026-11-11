import type { Doubt, Evidence, EvidenceSource, Role } from './triage-types';

export interface Citation {
  label: string;
  doubtId: string;
  evidenceId?: string;
  source?: EvidenceSource;
}

export interface IntelAnswer {
  id: string;
  prompt: string;
  title: string;
  body: string;
  bullets: string[];
  citations: Citation[];
  confidence: number;
  verdict?: 'GO' | 'NO-GO' | 'CONDITIONAL';
  kind: 'status' | 'topic' | 'owner' | 'decision' | 'confidence' | 'plan' | 'sources' | 'help';
  grounded: true;
}

const SOURCE_LABEL: Record<EvidenceSource, string> = {
  slack: 'Slack',
  github: 'GitHub',
  notion: 'Notion',
  jira: 'Jira',
  code: 'Code',
  email: 'Email',
};

function clean(value: string, max = 150): string {
  const single = value.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

export function citationLabel(evidence: Evidence): string {
  const channel = evidence.channel ?? '';
  if (evidence.source === 'slack' && channel.startsWith('#')) return channel;
  if (evidence.source === 'github' && evidence.commit) return evidence.commit;
  if (evidence.source === 'jira' && channel) return channel.split(' · ')[0];
  if (evidence.source === 'code' && channel) return channel.split(' ')[0];
  if (channel) return channel.length > 26 ? `${channel.slice(0, 25)}…` : channel;
  return SOURCE_LABEL[evidence.source];
}

function evidenceRank(evidence: Evidence[], polarity?: string): Evidence[] {
  return [...evidence].sort((a, b) => {
    if (polarity) {
      const aMatch = a.polarity === polarity ? 1 : 0;
      const bMatch = b.polarity === polarity ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
    }
    return (b.relevance ?? 0.5) - (a.relevance ?? 0.5);
  });
}

function citationsFor(doubt: Doubt, limit = 3): Citation[] {
  return evidenceRank(doubt.evidence, 'contradicts')
    .slice(0, limit)
    .map((evidence) => ({
      label: citationLabel(evidence),
      doubtId: doubt.id,
      evidenceId: evidence.id,
      source: evidence.source,
    }));
}

function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.doubtId}:${citation.evidenceId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decisionLine(doubt: Doubt): string | null {
  if (!doubt.decision) return null;
  const resolution = doubt.resolutions.find(
    (item) => item.id === doubt.resolvedWith,
  );
  const signoff = doubt.decision.signedOff
    ? ` · signed off${doubt.decision.signoffName ? ` by ${doubt.decision.signoffName}` : ''}`
    : '';
  const verification =
    doubt.decision.verification === 'verified'
      ? ' · verification passed'
      : doubt.decision.verification === 'waived'
        ? ' · verification waived'
        : ' · verification pending';
  return `${resolution?.label ?? 'Resolved'} · ${doubt.decision.type}${signoff}${verification}`;
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2 } as const;

function openDoubts(doubts: Doubt[]): Doubt[] {
  return doubts
    .filter((doubt) => doubt.status !== 'resolved')
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.confidence - a.confidence,
    );
}

function statusAnswer(
  prompt: string,
  doubts: Doubt[],
  readiness: number,
  simulate: boolean,
): IntelAnswer {
  const open = openDoubts(doubts);
  const critical = open.filter((doubt) => doubt.severity === 'critical');
  const resolved = doubts.filter((doubt) => doubt.status === 'resolved');
  const verdict =
    doubts.length > 0 && resolved.length === doubts.length
      ? 'GO'
      : critical.length > 0
        ? 'NO-GO'
        : open.length > 0
          ? 'CONDITIONAL'
          : 'GO';

  const bullets = open.slice(0, 4).map((doubt, index) => {
    const decision = decisionLine(doubt);
    return `${index + 1}. [${doubt.severity}] ${doubt.area} — ${doubt.title} (${Math.round(
      doubt.confidence * 100,
    )}% confidence)${decision ? ` · ${decision}` : ''}`;
  });

  if (bullets.length === 0) {
    bullets.push(
      'Every doubt has a human decision. The handover artifact is ready to export.',
    );
  }

  const body = simulate
    ? `Relay simulated the v2 production launch deterministically: ${critical.length} unresolved critical blocker${
        critical.length === 1 ? '' : 's'
      }, ${open.length} open doubt${open.length === 1 ? '' : 's'}, ${readiness}% severity-weighted readiness. Verdict: ${verdict}. This is a rules engine over the board, not a language-model guess.`
    : `${critical.length} critical blocker${
        critical.length === 1 ? '' : 's'
      } and ${open.length} open doubt${
        open.length === 1 ? '' : 's'
      } stand between this team and a clean v2 handover. Severity-weighted readiness is ${readiness}%.`;

  return {
    id: `status-${verdict}`,
    prompt,
    title: simulate ? 'Production launch simulation' : 'What blocks the launch?',
    body,
    bullets,
    citations: uniqueCitations(open.slice(0, 4).flatMap((doubt) => citationsFor(doubt, 2))),
    confidence: readiness,
    verdict,
    kind: 'status',
    grounded: true,
  };
}

interface Topic {
  id: string;
  keys: string[];
  doubtId: string;
  title: string;
}

const TOPICS: Topic[] = [
  {
    id: 'datastore',
    keys: ['firebase', 'supabase', 'firestore', 'database', 'datastore', 'migration'],
    doubtId: 'd-001',
    title: 'Datastore mandate vs production reality',
  },
  {
    id: 'export',
    keys: ['bucket', 'export', 'cron', 'pii', 'personal', 's3', 'retention'],
    doubtId: 'd-002',
    title: 'Customer export ownership',
  },
  {
    id: 'secret',
    keys: ['secret', 'kms', 'password', 'credential', 'config.ts', 'hardcoded', 'security'],
    doubtId: 'd-003',
    title: 'Hardcoded staging secret',
  },
  {
    id: 'billing',
    keys: ['billing', 'stripe', 'retry', 'retries', 'renewal', 'revenue', 'webhook'],
    doubtId: 'd-004',
    title: 'Billing retry drift',
  },
  {
    id: 'node',
    keys: ['node', 'version', 'ci', 'build', 'onboarding', 'engine'],
    doubtId: 'd-005',
    title: 'Node version mismatch',
  },
  {
    id: 'rollback',
    keys: ['rollback', 'recovery', 'revert', 'incident', 'runbook', 'launch plan'],
    doubtId: 'd-006',
    title: 'Missing v2 rollback plan',
  },
];

function topicAnswer(prompt: string, topic: Topic, doubts: Doubt[]): IntelAnswer | null {
  const doubt = doubts.find((item) => item.id === topic.doubtId);
  if (!doubt) return null;

  const decisive = evidenceRank(doubt.evidence, 'contradicts').slice(0, 3);
  const bullets = [
    `Engine read: ${doubt.engineHint}`,
    ...decisive.map(
      (evidence) =>
        `${citationLabel(evidence)} · ${SOURCE_LABEL[evidence.source]} · ${clean(
          evidence.quote,
          150,
        )}`,
    ),
  ];

  const decision = decisionLine(doubt);
  if (decision) bullets.push(`Human decision: ${decision}`);

  return {
    id: `topic-${topic.id}`,
    prompt,
    title: topic.title,
    body: doubt.claim,
    bullets,
    citations: uniqueCitations(citationsFor(doubt, 4)),
    confidence: Math.round(doubt.confidence * 100),
    kind: 'topic',
    grounded: true,
  };
}

function ownerAnswer(prompt: string, doubts: Doubt[], role: Role): IntelAnswer {
  const bullets: string[] = [];
  const citations: Citation[] = [];

  for (const doubt of doubts) {
    const owner =
      doubt.decision?.owner ??
      (role === 'junior' ? doubt.implementation?.owner : undefined);
    if (owner) {
      bullets.push(`${doubt.area}: ${owner}${doubt.decision?.signedOff ? ' · signed off' : ''}`);
    } else {
      const author = evidenceRank(doubt.evidence, 'contradicts')[0]?.author;
      if (author) {
        bullets.push(`${doubt.area}: no named owner · last decisive voice ${author}`);
      }
    }
    citations.push(...citationsFor(doubt, 1));
  }

  if (role === 'manager') {
    bullets.push(
      'Repository owners are withheld in the executive lens. Assign an owner in the decision console to make it explicit.',
    );
  }

  return {
    id: 'owners',
    prompt,
    title: 'Who owns the open risk?',
    body:
      'Relay only states an owner when the board contains one. It does not infer ownership from a message author unless that author is the decisive evidence.',
    bullets: bullets.slice(0, 7),
    citations: uniqueCitations(citations).slice(0, 6),
    confidence: 100,
    kind: 'owner',
    grounded: true,
  };
}

function decisionAnswer(prompt: string, doubts: Doubt[]): IntelAnswer {
  const decided = doubts.filter((doubt) => doubt.decision);
  const bullets = decided.slice(0, 6).map((doubt) => {
    const resolution = doubt.resolutions.find(
      (item) => item.id === doubt.resolvedWith,
    );
    const rationale = doubt.decision?.rationale
      ? ` · “${clean(doubt.decision.rationale, 100)}”`
      : '';
    return `${doubt.area}: ${resolution?.label ?? 'Resolved'} (${doubt.decision?.type})${rationale}`;
  });

  if (bullets.length === 0) {
    bullets.push(
      'No decisions yet. Confirm a blocker, accept risk with sign-off, escalate to an owner, or request verification.',
    );
    bullets.push(
      ...openDoubts(doubts)
        .slice(0, 3)
        .map((doubt) => `${doubt.area}: still open · ${doubt.title}`),
    );
  }

  return {
    id: 'decisions',
    prompt,
    title: 'Decision ledger',
    body: `${decided.length} of ${doubts.length} doubts carry a recorded human decision. Every row below is server-authoritative.`,
    bullets,
    citations: uniqueCitations(
      (decided.length ? decided : openDoubts(doubts).slice(0, 3)).flatMap((doubt) =>
        citationsFor(doubt, 1),
      ),
    ),
    confidence: 100,
    kind: 'decision',
    grounded: true,
  };
}

function confidenceAnswer(prompt: string, doubts: Doubt[]): IntelAnswer {
  const ranked = [...doubts].sort((a, b) => b.confidence - a.confidence);
  const high = ranked[0];
  const low = ranked[ranked.length - 1];
  const bullets = ranked
    .slice(0, 5)
    .map(
      (doubt) =>
        `${Math.round(doubt.confidence * 100)}% · ${doubt.area} — ${
          doubt.synthesis?.injectedCount
            ? `${doubt.synthesis.injectedCount} live signal(s) · ${doubt.synthesis.formula}`
            : doubt.title
        }`,
    );

  return {
    id: 'confidence',
    prompt,
    title: 'Confidence ledger',
    body: high && low
      ? `Highest: ${high.area} at ${Math.round(high.confidence * 100)}%. Lowest: ${low.area} at ${Math.round(
          low.confidence * 100,
        )}%. Confidence is deterministic: seeded confidence plus fixed signal mass.`
      : 'No doubts are loaded.',
    bullets,
    citations: uniqueCitations(
      [high, low].filter(Boolean).flatMap((doubt) => citationsFor(doubt as Doubt, 1)),
    ),
    confidence: 100,
    kind: 'confidence',
    grounded: true,
  };
}

function planAnswer(prompt: string, doubts: Doubt[]): IntelAnswer {
  const ordered = openDoubts(doubts);
  const bullets = ordered.slice(0, 6).map((doubt, index) => {
    const target =
      doubt.implementation?.pr ??
      doubt.decision?.owner ??
      doubt.evidence[0]?.channel ??
      doubt.area;
    return `${index + 1}. [${doubt.severity}] ${doubt.title} · start at ${target}`;
  });

  if (bullets.length === 0) {
    bullets.push('All doubts are decided. Export the handover artifact and run the Day-1 plan.');
  }

  return {
    id: 'day1',
    prompt,
    title: 'Day-1 survival plan',
    body:
      bullets.length === 0
        ? 'The board is clear.'
        : `Work top-down. Severity and confidence decide the order, and every step links back to its evidence. ${ordered.length} item${ordered.length === 1 ? '' : 's'} remain.`,
    bullets,
    citations: uniqueCitations(ordered.slice(0, 6).flatMap((doubt) => citationsFor(doubt, 1))),
    confidence: 100,
    kind: 'plan',
    grounded: true,
  };
}

function sourcesAnswer(prompt: string, doubts: Doubt[]): IntelAnswer {
  const counts = new Map<EvidenceSource, number>();
  for (const doubt of doubts) {
    for (const evidence of doubt.evidence) {
      counts.set(evidence.source, (counts.get(evidence.source) ?? 0) + 1);
    }
  }
  const bullets = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${SOURCE_LABEL[source]}: ${count} visible row${count === 1 ? '' : 's'}`);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  bullets.push(
    `Total visible in this lens: ${total} rows. The API has already removed rows your role may not read.`,
  );

  return {
    id: 'sources',
    prompt,
    title: 'Evidence provenance',
    body:
      'Relay never cites a claim it cannot point at. These are the sources currently visible to your signed role.',
    bullets,
    citations: uniqueCitations(doubts.flatMap((doubt) => citationsFor(doubt, 1))).slice(0, 6),
    confidence: 100,
    kind: 'sources',
    grounded: true,
  };
}

function searchAnswer(prompt: string, doubts: Doubt[]): IntelAnswer {
  const tokens = prompt
    .toLowerCase()
    .split(/[^a-z0-9.+#-]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

  const scored = doubts
    .map((doubt) => {
      const haystack = [
        doubt.title,
        doubt.claim,
        doubt.engineHint,
        doubt.area,
        ...doubt.evidence.map(
          (evidence) => `${evidence.quote} ${evidence.author} ${evidence.channel ?? ''}`,
        ),
      ]
        .join(' ')
        .toLowerCase();
      const score = tokens.reduce(
        (sum, token) => sum + (haystack.includes(token) ? 1 : 0),
        0,
      );
      return { doubt, score };
    })
    .sort((a, b) => b.score - a.score || b.doubt.confidence - a.doubt.confidence);

  const best = scored.filter((item) => item.score > 0).slice(0, 3);

  if (tokens.length === 0 || best.length === 0) {
    return {
      id: 'help',
      prompt,
      title: 'Grounded questions Relay can answer',
      body:
        'Every answer is assembled from the board and its citations. No model call, no invented claim. Try one of these:',
      bullets: [
        'What blocks the launch?',
        'Simulate the production launch',
        'Who owns the staging secret?',
        'What did Slack say about the export bucket?',
        'Show me the decision ledger',
        'Build a Day-1 survival plan',
      ],
      citations: uniqueCitations(
        openDoubts(doubts).slice(0, 3).flatMap((doubt) => citationsFor(doubt, 1)),
      ),
      confidence: 100,
      kind: 'help',
      grounded: true,
    };
  }

  const top = best[0].doubt;
  return {
    id: `search-${top.id}`,
    prompt,
    title: `${top.area} · ${top.title}`,
    body: top.claim,
    bullets: [
      `Engine read: ${top.engineHint}`,
      ...evidenceRank(top.evidence, 'contradicts')
        .slice(0, 3)
        .map(
          (evidence) =>
            `${citationLabel(evidence)} · ${clean(evidence.quote, 150)}`,
        ),
    ],
    citations: uniqueCitations(best.flatMap((item) => citationsFor(item.doubt, 2))),
    confidence: Math.round(top.confidence * 100),
    kind: 'topic',
    grounded: true,
  };
}

const STOPWORDS = new Set([
  'the',
  'and',
  'what',
  'who',
  'why',
  'how',
  'does',
  'did',
  'was',
  'were',
  'are',
  'for',
  'from',
  'with',
  'about',
  'into',
  'this',
  'that',
  'tell',
  'show',
  'give',
  'can',
  'you',
  'our',
  'their',
  'there',
  'has',
  'have',
]);

/**
 * Deterministic, evidence-grounded interrogation of the handover board.
 * This function never calls a model and never states a fact without attaching
 * a citation that resolves to a real doubt or evidence row.
 */
export function interrogate(
  prompt: string,
  doubts: Doubt[],
  role: Role,
  readiness: number,
): IntelAnswer {
  const query = prompt.toLowerCase().trim();
  if (!query) return searchAnswer('', doubts);

  if (
    /simulate|stress.?test|launch day|production launch|go.?no.?go|ship it/.test(
      query,
    )
  ) {
    return statusAnswer(prompt, doubts, readiness, true);
  }

  if (/block|launch|ship|ready|risk|verdict|status/.test(query)) {
    return statusAnswer(prompt, doubts, readiness, false);
  }

  const matched = TOPICS.map((topic) => ({
    topic,
    score: topic.keys.reduce(
      (sum, key) => sum + (query.includes(key) ? 1 : 0),
      0,
    ),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (matched) {
    const answer = topicAnswer(prompt, matched.topic, doubts);
    if (answer) return answer;
  }

  if (/owner|owns|assign|accountable|responsible/.test(query)) {
    return ownerAnswer(prompt, doubts, role);
  }

  if (/decision|resolved|sign.?off|accepted risk|escalat/.test(query)) {
    return decisionAnswer(prompt, doubts);
  }

  if (/confidence|certain|sure|probability/.test(query)) {
    return confidenceAnswer(prompt, doubts);
  }

  if (/day.?1|survival|next|plan|start|priorit|first/.test(query)) {
    return planAnswer(prompt, doubts);
  }

  if (/source|evidence|trace|provenance|where/.test(query)) {
    return sourcesAnswer(prompt, doubts);
  }

  return searchAnswer(prompt, doubts);
}
