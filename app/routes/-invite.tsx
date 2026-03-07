
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Users, Mail, Check } from "lucide-react";
import { teamHomePath } from "@/lib/routes";
import { useInviteData } from "./-invite.data";

export default function InvitePage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const token = params.token as string;
  const { user, isLoaded } = useUser();

  const { invite } = useInviteData({ token });
  const acceptInvite = useMutation(api.teams.acceptInvite);

  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      const team = await acceptInvite({ token });
      if (team) {
        navigate({ to: teamHomePath(team.slug) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setIsAccepting(false);
    }
  };

  if (invite === undefined || !isLoaded) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--foreground-muted)]">Loading...</div>
      </div>
    );
  }

  if (invite === null) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--destructive)]/10 flex items-center justify-center mb-4 border-2 border-[var(--destructive)]">
              <AlertCircle className="h-6 w-6 text-[var(--destructive)]" />
            </div>
            <CardTitle>Invalid or expired invite</CardTitle>
            <CardDescription>
              This invite link is no longer valid. Please ask for a new invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">
                Go to loam
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User not signed in
  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--surface-alt)] flex items-center justify-center mb-4 border-2 border-[var(--border)]">
              <Users className="h-6 w-6 text-[var(--foreground-muted)]" />
            </div>
            <CardTitle>You&apos;re invited to {invite.team?.name}</CardTitle>
            <CardDescription>
              {invite.invitedBy} has invited you to join as a {invite.role}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-[var(--surface-alt)] border-2 border-[var(--border)] flex items-center gap-3">
              <Mail className="h-5 w-5 text-[var(--foreground-muted)]" />
              <div>
                <p className="text-sm text-[var(--foreground-muted)]">Invited email</p>
                <p className="font-bold text-[var(--foreground)]">{invite.email}</p>
              </div>
            </div>
            <p className="text-sm text-[var(--foreground-muted)] text-center">
              Sign in with the email address above to accept this invite.
            </p>
            <a href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`} className="block">
              <Button className="w-full">Sign in to accept</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User signed in but with different email
  if (user.primaryEmailAddress?.emailAddress !== invite.email) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--warning)]/10 flex items-center justify-center mb-4 border-2 border-[var(--warning)]">
              <AlertCircle className="h-6 w-6 text-[var(--warning)]" />
            </div>
            <CardTitle>Different email address</CardTitle>
            <CardDescription>
              This invite was sent to {invite.email}, but you&apos;re signed in as{" "}
              {user.primaryEmailAddress?.emailAddress}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--foreground-muted)] text-center">
              Please sign in with the correct email address to accept this invite.
            </p>
            <a href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`} className="block">
              <Button className="w-full" variant="outline">
                Sign in with different account
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User signed in with correct email
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-[var(--surface-alt)] flex items-center justify-center mb-4 border-2 border-[var(--border)]">
            <Users className="h-6 w-6 text-[var(--foreground-muted)]" />
          </div>
          <CardTitle>Join {invite.team?.name}</CardTitle>
          <CardDescription>
            {invite.invitedBy} has invited you to join as a{" "}
            <Badge variant="secondary">{invite.role}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-[var(--destructive)]/10 text-[var(--destructive)] border-2 border-[var(--destructive)] text-sm">
              {error}
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={isAccepting}
          >
            {isAccepting ? (
              "Joining..."
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Accept invitation
              </>
            )}
          </Button>
          <Link to="/" preload="intent" className="block">
            <Button variant="ghost" className="w-full">
              Decline
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
