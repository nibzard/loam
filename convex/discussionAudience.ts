export type DiscussionAudience = "team" | "share";

type AudienceRecord = {
  audience?: DiscussionAudience | null;
};

export function resolveDiscussionAudience(record: AudienceRecord): DiscussionAudience {
  return record.audience ?? "team";
}

export function isVisibleToShareDiscussion(record: AudienceRecord) {
  return resolveDiscussionAudience(record) === "share";
}

