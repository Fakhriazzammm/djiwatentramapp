export type CommunityMediaType = "image" | "video";

export type CommunityAuthor = {
  sourceId: string;
  name: string;
  username: string | null;
};

export type CommunityProductSummary = {
  sourceId: string;
  name: string;
  price: number;
  promoPrice: number | null;
  image: string | null;
  isAvailable: boolean;
  quantity: number | null;
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
  savedByMe: boolean;
  followingByMe: boolean;
  author: CommunityAuthor;
  products: CommunityProductSummary[];
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


export type PurchaseActivityNameMode = "first_name" | "full_name";

export type CommunityPurchaseActivity = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  productSourceId: string;
  productName: string;
  productImageUrl: string | null;
  price: number | null;
  nutrition: Record<string, unknown> | null;
  orderSettledAt: string;
  visibleAt: string;
  verified: boolean;
  activityGroupKey?: string;
};

export type CommunityPurchaseActivityPage = {
  activities: CommunityPurchaseActivity[];
  nextCursor: string | null;
  hasMore: boolean;
};
