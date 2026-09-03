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
