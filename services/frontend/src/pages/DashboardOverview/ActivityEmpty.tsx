import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertTriangle, Activity } from "lucide-react";

export const ActivityEmpty = () => (
  <Card className="mb-6 sm:mb-8">
    <CardHeader className="border-b">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <CardTitle>
          <h2>Recent Activity</h2>
        </CardTitle>
      </div>
      <CardDescription>
        CI failures, analyses, and incidents from your connected repositories.
      </CardDescription>
    </CardHeader>
    <CardContent className="py-12 text-center">
      <Activity className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No recent activity</p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
        Activity from your connected repositories will appear here.
      </p>
    </CardContent>
  </Card>
);
