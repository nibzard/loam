"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/tanstack-react-start";
import { api } from "../../../convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { teamHomePath } from "@/lib/routes";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTeamDialog({ open, onOpenChange }: CreateTeamDialogProps) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createTeam = useMutation(api.teams.create);
  const { isLoaded: isAuthLoaded, getToken } = useAuth();
  const navigate = useNavigate({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (!isAuthLoaded) {
        setErrorMessage("Authentication is still loading. Try again in a moment.");
        return;
      }

      try {
        const token = await getToken({ template: "convex", skipCache: true });
        if (!token) {
          setErrorMessage("Your session is missing the Convex token. Refresh and try again.");
          return;
        }
      } catch {
        setErrorMessage(
          "Clerk could not issue a Convex token. Configure the Clerk JWT template named `convex` for this environment.",
        );
        return;
      }

      const createdTeam = await createTeam({ name: name.trim() });
      onOpenChange(false);
      setName("");
      setErrorMessage(null);
      navigate({ to: teamHomePath(createdTeam.slug) });
    } catch (error) {
      console.error("Failed to create team:", error);
      const message =
        error &&
        typeof error === "object" &&
        "data" in error &&
        error.data &&
        typeof error.data === "object" &&
        "message" in error.data &&
        typeof error.data.message === "string"
          ? error.data.message
          : "Could not create the team. Try again.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a new team</DialogTitle>
            <DialogDescription>
              Teams let you collaborate on video projects with others.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {errorMessage ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading ? "Creating..." : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
