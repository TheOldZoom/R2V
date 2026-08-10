import { isRetryableStatus, parseRetryAfterMs } from "../http-retry";
import { logger } from "../logger";
import { RetryableError, withRetry } from "../retry";
import type { RedditConfig, RedditPost } from "./types";

interface RedditListingResponse {
  data?: { children?: Array<{ data?: RedditListingPost }> };
}

interface RedditListingPost {
  id?: string;
  subreddit?: string;
  title?: string;
  selftext?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  permalink?: string;
  over_18?: boolean;
  stickied?: boolean;
  is_self?: boolean;
}

export class RedditClient {
  constructor(private readonly config: RedditConfig) {}

  async fetchPosts(subreddit: string): Promise<RedditPost[]> {
    const listing = this.config.listing;
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${listing}.json?limit=${this.config.fetchLimit}&raw_json=1`;
    const response = await withRetry(
      async () => {
        const result = await fetch(url, {
          headers: {
            "User-Agent": this.config.userAgent,
          },
        });
        if (!result.ok) {
          const body = await result.text();
          if (isRetryableStatus(result.status)) {
            throw new RetryableError(
              `Reddit listing failed (${result.status})`,
              parseRetryAfterMs(result, body),
            );
          }
          throw new Error(`Reddit listing failed (${result.status}): ${body}`);
        }
        return result;
      },
      { label: `RedditClient.fetchPosts(${subreddit})`, maxRetries: 3 },
    );
    const payload = (await response.json()) as RedditListingResponse;
    const posts = (payload.data?.children ?? [])
      .map((child) => child.data)
      .filter((post): post is RedditListingPost => Boolean(post))
      .map(toPost)
      .filter((post): post is RedditPost => post !== null);

    logger.info(
      { subreddit, listing, postCount: posts.length },
      "Fetched Reddit posts",
    );
    return posts;
  }
}

function toPost(post: RedditListingPost): RedditPost | null {
  if (
    !post.id ||
    !post.subreddit ||
    !post.title ||
    post.selftext === undefined ||
    !post.author ||
    !post.permalink
  )
    return null;
  return {
    id: post.id,
    subreddit: post.subreddit,
    title: post.title.trim(),
    body: post.is_self === false ? "" : post.selftext.trim(),
    author: post.author,
    score: post.score ?? 0,
    commentCount: post.num_comments ?? 0,
    createdAt: new Date((post.created_utc ?? 0) * 1000).toISOString(),
    permalink: `https://www.reddit.com${post.permalink}`,
    isNsfw: Boolean(post.over_18),
    isStickied: Boolean(post.stickied),
  };
}
