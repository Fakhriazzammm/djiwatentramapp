export type StoryMediaType = "image" | "video";

export type CustomerStory = {
  storyId: string;
  ownerSourceId: string;
  ownerLabel: string;
  ownerPhotoUrl: string | null;
  mediaType: StoryMediaType;
  mediaUrl: string;
  createdAt: string;
  expiresAt: string;
  viewed?: boolean;
  viewerCount?: number;
};

export type StoryUploadGrant = {
  storyId: string;
  uploadUrl: string;
  mediaUrl?: string;
  expiresAt: string;
  headers?: Record<string, string>;
};

export type StoryApiState = "disabled" | "loading" | "ready" | "error";

export type StoryListResponse = { data?: CustomerStory[]; error?: string; details?: unknown };

export type StoryUploadInput = {
  file: File;
  mediaType: StoryMediaType;
  durationSeconds?: number;
};

export type StoryViewer = {
  sourceId: string;
  label: string;
  viewedAt: string;
};

export type StoryViewersResponse = { data?: StoryViewer[]; error?: string };
