export type CommunityMediaType = "image" | "video";

export type CommunityAuthor = {
  sourceId: string;
  name: string;
  username: string | null;
};

export type CommunityPost = {
  id: string;
  body: string | null;
  mediaType: CommunityMediaType | null;
  mediaContentType: string | null;
  mediaSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
  reportCount: number;
  author: CommunityAuthor;
  mediaUrl: string | null;
};

export type CommunityUploadGrant = {
  postId: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

export type CommunityPage = {
  data: CommunityPost[];
  nextCursor: string | null;
};

export class CommunityClientError extends Error {}
