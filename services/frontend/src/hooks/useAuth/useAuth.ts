import { useContext } from "react";
import type { AuthContextValue } from "./types";
import { AuthContext } from "./AuthContext";

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new TypeError("useAuth must be used within an AuthProvider");
  }

  return context;
};
