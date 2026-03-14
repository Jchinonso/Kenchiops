/**
 * Validate redirect_after to prevent open redirect attacks (defense-in-depth).
 * The backend already validates this, but we re-validate on the client
 * in case the URL was tampered with after the backend set it.
 *
 * Only allows paths starting with "/" that are not protocol-relative ("//"),
 * do not contain backslashes, encoded sequences, or authority components.
 */
export const isSafeRedirectPath = (path: string): boolean => {
  const trimmed = path.trim();
  return (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes(":") &&
    !trimmed.includes("%2f") &&
    !trimmed.includes("%2F") &&
    !trimmed.includes("%5c") &&
    !trimmed.includes("%5C")
  );
};
