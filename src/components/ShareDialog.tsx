"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Eye,
  Lock,
  ExternalLink,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/utils";
import {
  buildRestrictedSharePath,
  buildRestrictedShareUrl,
  copyTextToClipboard,
} from "@/lib/shareLinks";

interface ShareDialogProps {
  videoId: Id<"videos">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ videoId, open, onOpenChange }: ShareDialogProps) {
  const accessSettings = useQuery(api.videos.getAccessSettings, { videoId });
  const shareLinks = useQuery(api.shareLinks.list, { videoId });
  const createShareLink = useMutation(api.shareLinks.create);
  const deleteShareLink = useMutation(api.shareLinks.remove);
  const updateAccessSettings = useMutation(api.videos.updateAccessSettings);

  const [isCreating, setIsCreating] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draftAccessMode, setDraftAccessMode] = useState<"team" | "restricted">("team");
  const [grantedUserIds, setGrantedUserIds] = useState<string[]>([]);
  const [newLinkOptions, setNewLinkOptions] = useState({
    allowDownload: false,
    expiresInDays: undefined as number | undefined,
    password: undefined as string | undefined,
  });

  useEffect(() => {
    if (!accessSettings) {
      return;
    }

    setDraftAccessMode(accessSettings.accessMode);
    setGrantedUserIds(accessSettings.grantedUserClerkIds);
  }, [accessSettings]);

  const handleCreateLink = async () => {
    setIsCreating(true);
    try {
      await createShareLink({
        videoId,
        allowDownload: newLinkOptions.allowDownload,
        expiresInDays: newLinkOptions.expiresInDays,
        password: newLinkOptions.password,
      });
      setNewLinkOptions({
        allowDownload: false,
        expiresInDays: undefined,
        password: undefined,
      });
    } catch (error) {
      console.error("Failed to create share link:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveAccess = async () => {
    setIsSavingAccess(true);
    try {
      await updateAccessSettings({
        accessMode: draftAccessMode,
        grantedUserClerkIds: grantedUserIds,
        videoId,
      });
    } catch (error) {
      console.error("Failed to update video access:", error);
    } finally {
      setIsSavingAccess(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const url = buildRestrictedShareUrl(token, window.location.origin);
    const copied = await copyTextToClipboard(url);
    if (!copied) return;
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteLink = async (linkId: Id<"shareLinks">) => {
    if (!confirm("Are you sure you want to delete this share link?")) return;
    try {
      await deleteShareLink({ linkId });
    } catch (error) {
      console.error("Failed to delete share link:", error);
    }
  };

  const openInNewTab = (path: string) => {
    const opened = window.open(path, "_blank", "noopener,noreferrer");
    if (opened) {
      opened.opener = null;
    }
  };

  const toggleGrantedUser = (userClerkId: string) => {
    setGrantedUserIds((current) =>
      current.includes(userClerkId)
        ? current.filter((id) => id !== userClerkId)
        : [...current, userClerkId],
    );
  };

  const teamMembers = accessSettings?.teamMembers.filter(
    (member) => member.userClerkId !== accessSettings.uploaderClerkId,
  ) ?? [];
  const accessDirty =
    accessSettings !== undefined &&
    (draftAccessMode !== accessSettings?.accessMode ||
      JSON.stringify([...grantedUserIds].sort()) !==
        JSON.stringify([...(accessSettings?.grantedUserClerkIds ?? [])].sort()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share video</DialogTitle>
          <DialogDescription>
            Team members can see team-visible videos. Restricted videos are only visible to selected teammates. External viewers always use tokenized share links, and they must sign in before they can comment or react.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 border-2 border-[var(--border)] p-4 bg-[var(--surface-alt)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-[var(--foreground)]">Internal access</h3>
              <p className="text-xs text-[var(--foreground-subtle)]">
                Pick whether this video is visible to the whole team or only selected teammates.
              </p>
            </div>
            <Badge variant={draftAccessMode === "team" ? "success" : "secondary"}>
              {draftAccessMode === "team" ? "Team-visible" : "Restricted"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={draftAccessMode === "team" ? "default" : "outline"}
              onClick={() => setDraftAccessMode("team")}
            >
              <Users className="mr-2 h-4 w-4" />
              Team-visible
            </Button>
            <Button
              variant={draftAccessMode === "restricted" ? "default" : "outline"}
              onClick={() => setDraftAccessMode("restricted")}
            >
              <Lock className="mr-2 h-4 w-4" />
              Restricted
            </Button>
          </div>

          {draftAccessMode === "restricted" ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--foreground-subtle)]">
                Selected teammates can view this video inside the workspace. The uploader always keeps access.
              </p>
              <div className="max-h-48 overflow-y-auto border-2 border-[var(--border)] divide-y-2 divide-[var(--border)]">
                {accessSettings === undefined ? (
                  <div className="p-3 text-sm text-[var(--foreground-muted)]">Loading teammates...</div>
                ) : teamMembers.length === 0 ? (
                  <div className="p-3 text-sm text-[var(--foreground-muted)]">No additional teammates to grant.</div>
                ) : (
                  teamMembers.map((member) => {
                    const granted = grantedUserIds.includes(member.userClerkId);
                    return (
                      <button
                        key={member.userClerkId}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--background)] transition-colors"
                        onClick={() => toggleGrantedUser(member.userClerkId)}
                      >
                        <div>
                          <p className="font-medium text-sm text-[var(--foreground)]">{member.userName}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{member.role}</p>
                        </div>
                        <Badge variant={granted ? "success" : "secondary"}>
                          {granted ? "Allowed" : "No access"}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <Button
            onClick={() => void handleSaveAccess()}
            disabled={isSavingAccess || !accessDirty}
            className="w-full"
          >
            {isSavingAccess ? "Saving access..." : "Save internal access"}
          </Button>
        </div>

        <div className="space-y-4 border-2 border-[var(--border)] p-4 bg-[var(--surface-alt)]">
          <h3 className="font-bold text-sm text-[var(--foreground)]">External share links</h3>
          <p className="text-xs text-[var(--foreground-subtle)]">
            These links are for outside viewers. They can watch with the link, but they must sign in before they can comment or react.
          </p>

          <div>
            <label className="text-sm text-[var(--foreground-muted)]">Expiration</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between mt-1">
                  {newLinkOptions.expiresInDays
                    ? `${newLinkOptions.expiresInDays} days`
                    : "Never"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() =>
                    setNewLinkOptions((o) => ({ ...o, expiresInDays: undefined }))
                  }
                >
                  Never
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setNewLinkOptions((o) => ({ ...o, expiresInDays: 1 }))
                  }
                >
                  1 day
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setNewLinkOptions((o) => ({ ...o, expiresInDays: 7 }))
                  }
                >
                  7 days
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setNewLinkOptions((o) => ({ ...o, expiresInDays: 30 }))
                  }
                >
                  30 days
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <label className="text-sm text-[var(--foreground-muted)]">Password (optional)</label>
            <Input
              type="password"
              placeholder="Leave empty for no password"
              value={newLinkOptions.password || ""}
              onChange={(e) =>
                setNewLinkOptions((o) => ({
                  ...o,
                  password: e.target.value || undefined,
                }))
              }
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm text-[var(--foreground-muted)]">Downloads</label>
            <Button
              type="button"
              variant={newLinkOptions.allowDownload ? "default" : "outline"}
              className="mt-1 w-full justify-between"
              onClick={() =>
                setNewLinkOptions((options) => ({
                  ...options,
                  allowDownload: !options.allowDownload,
                }))
              }
            >
              <span>Allow recipients to download the original file</span>
              <span>{newLinkOptions.allowDownload ? "Enabled" : "Disabled"}</span>
            </Button>
          </div>

          <Button onClick={() => void handleCreateLink()} disabled={isCreating} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            {isCreating ? "Creating..." : "Create external share link"}
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-bold text-sm text-[var(--foreground)]">External links</h3>
          {shareLinks === undefined ? (
            <p className="text-sm text-[var(--foreground-muted)]">Loading...</p>
          ) : shareLinks.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">No share links yet</p>
          ) : (
            <div className="space-y-2">
              {shareLinks.map((link) => (
                <div
                  key={link._id}
                  className="flex items-center justify-between p-3 border-2 border-[var(--border)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-[var(--surface-alt)] px-2 py-0.5 font-mono truncate max-w-[200px]">
                        {buildRestrictedSharePath(link.token)}
                      </code>
                      {link.isExpired ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--foreground-muted)]">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {link.viewCount} views
                      </span>
                      {link.hasPassword ? (
                        <span className="flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Protected
                        </span>
                      ) : null}
                      {link.allowDownload ? <span>Downloads enabled</span> : null}
                      {link.expiresAt ? (
                        <span>
                          Expires {formatRelativeTime(link.expiresAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleCopyLink(link.token)}
                    >
                      {copiedId === link.token ? (
                        <Check className="h-4 w-4 text-[var(--accent)]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openInNewTab(`/share/${link.token}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                      onClick={() => handleDeleteLink(link._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
