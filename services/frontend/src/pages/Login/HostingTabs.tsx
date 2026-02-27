import { cn } from "@/lib/utils";

interface HostingTabsProps {
  readonly activeTab: "saas" | "selfhosted";
  readonly onTabChange: (tab: "saas" | "selfhosted") => void;
}

const TAB_BASE = "flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all duration-200";
const TAB_ACTIVE = "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm";
const TAB_INACTIVE = "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300";

export const HostingTabs = ({ activeTab, onTabChange }: HostingTabsProps) => (
  <div
    className="flex mb-6 bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-1"
    role="tablist"
    aria-label="Hosting type"
  >
    <button
      type="button"
      role="tab"
      id="tab-saas"
      aria-selected={activeTab === "saas"}
      aria-controls="tabpanel-saas"
      onClick={() => onTabChange("saas")}
      className={cn(TAB_BASE, activeTab === "saas" ? TAB_ACTIVE : TAB_INACTIVE)}
    >
      Cloud
    </button>
    <button
      type="button"
      role="tab"
      id="tab-selfhosted"
      aria-selected={activeTab === "selfhosted"}
      aria-controls="tabpanel-selfhosted"
      onClick={() => onTabChange("selfhosted")}
      className={cn(TAB_BASE, activeTab === "selfhosted" ? TAB_ACTIVE : TAB_INACTIVE)}
    >
      Self-Hosted
    </button>
  </div>
);
