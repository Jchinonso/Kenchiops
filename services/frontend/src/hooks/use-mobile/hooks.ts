import * as React from "react";
import { MOBILE_BREAKPOINT } from "./constants";

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
};
