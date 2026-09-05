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
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
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

export type CommunityComment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: CommunityAuthor;
};

export type CommunityCommentPage = {
  data: CommunityComment[];
  nextCursor: string | null;
};

export class CommunityClientError extends Error {}
