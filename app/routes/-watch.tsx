import { Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WatchPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-[var(--destructive)]/10 flex items-center justify-center mb-4 border-2 border-[var(--destructive)]">
            <AlertCircle className="h-6 w-6 text-[var(--destructive)]" />
          </div>
          <CardTitle>Public watch links removed</CardTitle>
          <CardDescription>
            This video can no longer be opened from a public watch URL. Ask the owner for a share link instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/" preload="intent" className="block">
            <Button variant="outline" className="w-full">Go to loam</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
