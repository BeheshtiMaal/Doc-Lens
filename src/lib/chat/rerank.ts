type Rerankable = { content: string; distance: number };

function terms(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Fuse vector-nearest order with lexical BM25 order over the bounded candidate set. */
export function rerankEvidence<T extends Rerankable>(query: string, candidates: T[], limit: number): T[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Rerank limit must be a positive integer.");
  if (candidates.length <= 1) return candidates.slice(0, limit);

  const queryTerms = [...new Set(terms(query))];
  const docs = candidates.map((candidate) => terms(candidate.content));
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, docs.reduce((count, doc) => count + (doc.includes(term) ? 1 : 0), 0));
  }
  const averageLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
  const lexicalScores = docs.map((doc) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = doc.filter((word) => word === term).length;
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const inverseDocumentFrequency = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      const normalization = frequency + 1.2 * (1 - 0.75 + 0.75 * doc.length / averageLength);
      score += inverseDocumentFrequency * frequency * 2.2 / normalization;
    }
    return score;
  });

  // With no lexical match, preserve vector order exactly; otherwise fuse both ranks.
  if (lexicalScores.every((score) => score === 0)) return candidates.slice(0, limit);
  const maxLexicalScore = Math.max(...lexicalScores);
  return candidates.map((candidate, vectorRank) => ({
    candidate,
    score: 0.65 * lexicalScores[vectorRank] / maxLexicalScore
      + 0.35 * (1 - vectorRank / candidates.length),
    vectorRank,
  })).sort((left, right) => right.score - left.score || left.vectorRank - right.vectorRank)
    .slice(0, limit).map(({ candidate }) => candidate);
}
