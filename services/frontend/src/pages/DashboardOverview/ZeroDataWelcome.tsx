import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Rocket } from "lucide-react";

export const ZeroDataWelcome = () => (
  <Card className="mb-6 sm:mb-8">
    <CardContent className="py-12 text-center">
      <div className="relative mx-auto mb-4 w-16 h-16">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)",
            transform: "scale(2)",
          }}
        />
        <div className="relative w-full h-full rounded-full flex items-center justify-center border border-amber-500/20 bg-amber-500/10">
          <Rocket className="w-7 h-7 text-amber-400" />
        </div>
      </div>
      <h2 className="text-lg font-display font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
        Welcome to Kenchi
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mb-4">
        Connect your repositories to start analyzing CI/CD failures automatically.
      </p>
      <Link
        to="/dashboard/integrations"
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
      >
        Connect a CI Provider
      </Link>
    </CardContent>
  </Card>
);
