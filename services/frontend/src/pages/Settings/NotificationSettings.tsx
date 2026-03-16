/**
 * Notification preferences — toast and browser notification toggles.
 */

import { motion } from "motion/react";
import { Bell } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { itemVariants } from "@/lib/animations";
import type { NotificationSettingsProps } from "./types";

export const NotificationSettings = ({
  toastEnabled,
  browserEnabled,
  browserPermissionDenied,
  onToastChange,
  onBrowserChange,
}: NotificationSettingsProps) => (
  <motion.div variants={itemVariants}>
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-500" />
          <CardTitle>Notifications</CardTitle>
        </div>
        <CardDescription>Configure how you receive alerts and updates.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div>
            <p id="toast-label" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              In-App Toast Notifications
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Show popup alerts when failures are detected or analyses complete.
            </p>
          </div>
          <Switch
            checked={toastEnabled}
            onCheckedChange={onToastChange}
            aria-labelledby="toast-label"
          />
        </div>
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div>
            <p id="browser-label" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Browser Notifications
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Receive system notifications even when Kenchi is in the background.
            </p>
            {browserEnabled && browserPermissionDenied && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Browser notifications are blocked. Please allow them in your browser settings.
              </p>
            )}
          </div>
          <Switch
            checked={browserEnabled}
            onCheckedChange={(checked) => {
              void onBrowserChange(checked);
            }}
            aria-labelledby="browser-label"
          />
        </div>
      </CardContent>
    </Card>
  </motion.div>
);
