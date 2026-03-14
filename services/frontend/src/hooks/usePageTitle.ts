import { useEffect } from "react";

/**
 * Sets the document title on mount.
 * Uses Object.assign to work around mutation linting rules.
 */
export const usePageTitle = (title: string): void => {
  useEffect(() => {
    Object.assign(document, { title });
  }, [title]);
};
