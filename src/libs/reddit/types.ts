export interface RedditSubreddit {
  name: string;
  weight: number;
}

export interface RedditConfig {
  subreddits: RedditSubreddit[];
  userAgent: string;
  listing: "hot" | "new" | "top";
  fetchLimit: number;
  minBodyLength: number;
  blockedTerms: string[];
  chocodataApiKey?: string;
  chocodataBaseUrl: string;
  topTimeframe: "day" | "week" | "month" | "year" | "all";
  detailLimit: number;
  storyPoolSize?: number;
}

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  body: string;
  author: string;
  score: number;
  commentCount: number;
  createdAt: string;
  permalink: string;
  isNsfw: boolean;
  isStickied: boolean;
}

export interface RedditStory extends RedditPost {
  storyScore: number;
}
