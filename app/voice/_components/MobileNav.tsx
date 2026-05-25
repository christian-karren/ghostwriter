"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MobileNavContextValue = {
  historyOpen: boolean;
  openHistory: () => void;
  closeHistory: () => void;
};

const MobileNavContext = createContext<MobileNavContextValue>({
  historyOpen: false,
  openHistory: () => {},
  closeHistory: () => {},
});

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <MobileNavContext.Provider
      value={{
        historyOpen,
        openHistory: () => setHistoryOpen(true),
        closeHistory: () => setHistoryOpen(false),
      }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext);
}
