"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
  Globe,
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
  const video = useQuery(api.videos.get, { videoId });
  const shareLinks = useQuery(api.shareLinks.list, { videoId });
  const createShareLink = useMutation(api.shareLinks.create);
  const deleteShareLink = useMutation(api.shareLinks.remove);
  const setVisibility = useMutation(api.videos.setVisibility);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newLinkOptions, setNewLinkOptions] = useState({
    allowDownload: false,
    expiresInDays: undefined as number | undefined,
    password: undefined as string | undefined,
  });

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

  const handleSetVisibility = async (visibility: "public" | "private") => {
    if (!video || isUpdatingVisibility || video.visibility === visibility) return;
    setIsUpdatingVisibility(true);
    try {
      await setVisibility({ videoId, visibility });
    } catch (error) {
      console.error("Failed to update visibility:", error);
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const url = buildRestrictedShareUrl(token, window.location.origin);
    const copied = await copyTextToClipboard(url);
    if (!copied) return;
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyPublicLink = async () => {
    if (!video?.publicId) return;
    const url = `${window.location.origin}/watch/${video.publicId}`;
    const copied = await copyTextToClipboard(url);
    if (!copied) return;
    setCopiedId("public");
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

  const publicWatchPath = video?.publicId ? `/watch/${video.publicId}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share video</DialogTitle>
          <DialogDescription>
            Restricted share links are the default way to share externally. Enable a public URL only when you intentionally want anyone with the link to view it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-2 border-[var(--border)] p-4 bg-[var(--surface-alt)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-[var(--foreground)]">Public URL (advanced)</h3>
              <p className="text-xs text-[var(--foreground-subtle)]">
                Keep videos private by default. Restricted share links still work while the video stays private.
              </p>
            </div>
            <Badge variant={video?.visibility === "public" ? "success" : "secondary"}>
              {video?.visibility === "public" ? "Public" : "Private"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={video?.visibility === "public" ? "default" : "outline"}
              disabled={isUpdatingVisibility || video === undefined}
              onClick={() => void handleSetVisibility("public")}
            >
              <Globe className="mr-2 h-4 w-4" />
              Public
            </Button>
            <Button
              variant={video?.visibility === "private" ? "default" : "outline"}
              disabled={isUpdatingVisibility || video === undefined}
              onClick={() => void handleSetVisibility("private")}
            >
              <Lock className="mr-2 h-4 w-4" />
              Private
            </Button>
          </div>

          {publicWatchPath ? (
            <div className="p-3 border-2 border-[var(--border)] bg-[var(--background)] space-y-2">
              <div className="text-xs text-[var(--foreground-subtle)]">Public URL</div>
              <code className="block text-sm bg-[var(--surface-alt)] px-2 py-1 font-mono truncate">
                {publicWatchPath}
              </code>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void handleCopyPublicLink()}
                  disabled={video?.visibility !== "public"}
                >
                  {copiedId === "public" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  Copy URL
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={video?.visibility !== "public"}
                  onClick={() => openInNewTab(publicWatchPath)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 border-2 border-[var(--border)] p-4 bg-[var(--surface-alt)]">
          <h3 className="font-bold text-sm text-[var(--foreground)]">Restricted sharing (default)</h3>
          <p className="text-xs text-[var(--foreground-subtle)]">
            Dashboard sharing creates or reuses a default restricted link automatically. Use this panel when you need extra links with expiration, password protection, or download permission.
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
            {isCreating ? "Creating..." : "Create extra restricted link"}
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-bold text-sm text-[var(--foreground)]">Restricted links</h3>
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
