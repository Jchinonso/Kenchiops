/**
 * Knowledge Base URL Builders
 *
 * Pure functions for constructing RAG API URLs.
 */

/** Validate doc type format before including in URL. */
const isValidDocType = (value: string): boolean => /^[a-z][a-z0-9_]*$/.test(value);

/** Build the URL for listing knowledge documents. */
export const buildKnowledgeDocsUrl = (limit: number, offset: number, docType?: string): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (docType && isValidDocType(docType)) {
    params.set("docType", docType);
  }
  // RAG routes are mounted at /api/rag/ (not /api/v1/) per the API route structure.
  return `/api/rag/documents?${params.toString()}`;
};
