export type ApprovedKnowledgeCandidate = {
  chunkId: number;
  documentId: number;
  title: string;
  version: string;
  sourceReference: string | null;
  sectionReference: string;
  content: string;
};

export type KnowledgeCitation = ApprovedKnowledgeCandidate & { score: number };

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "what", "when", "where", "which", "with", "why"]);

export function tokenizeKnowledgeQuery(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g)?.filter(token => !STOP_WORDS.has(token)) ?? [])).slice(0, 24);
}

export function rankApprovedKnowledge(question: string, candidates: ApprovedKnowledgeCandidate[], maxResults = 6): KnowledgeCitation[] {
  const tokens = tokenizeKnowledgeQuery(question);
  if (!tokens.length) return [];
  return candidates
    .map(candidate => {
      const title = `${candidate.title} ${candidate.sectionReference}`.toLowerCase();
      const body = candidate.content.toLowerCase();
      const score = tokens.reduce((total, token) => total + (title.includes(token) ? 6 : 0) + (body.includes(token) ? 2 : 0), 0);
      return { ...candidate, score };
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.documentId - right.documentId || left.chunkId - right.chunkId)
    .slice(0, Math.max(1, Math.min(maxResults, 8)));
}
