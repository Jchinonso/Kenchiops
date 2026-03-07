export const buildIncidentsUrl = (
  limit: number,
  offset: number,
  severity?: string,
  status?: string,
  source?: string
): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (severity) {
    params.set("severity", severity);
  }
  if (status) {
    params.set("status", status);
  }
  if (source) {
    params.set("source", source);
  }
  return `/api/v1/incidents?${params.toString()}`;
};
