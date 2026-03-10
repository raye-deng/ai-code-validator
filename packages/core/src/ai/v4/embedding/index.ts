/**
 * Embedding providers for the V4 AI pipeline Stage 1.
 *
 * @since 0.4.0
 */

export { LocalEmbeddingProvider, tokenize } from './local.js';
export { OpenAIEmbeddingProvider } from './openai.js';
export { cosineSimilarity, findTopMatches } from './similarity.js';
