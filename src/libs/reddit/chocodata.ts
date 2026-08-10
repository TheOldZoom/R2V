import { isRetryableStatus, parseRetryAfterMs } from "../http-retry";
import { logger } from "../logger";
import { RetryableError, withRetry } from "../retry";
import type { RedditConfig, RedditPost } from "./types";

export class ChocodataClient {
  constructor(private readonly config: RedditConfig) {}

  async fetchPosts(subreddit: string): Promise<RedditPost[]> {
    if (!this.config.chocodataApiKey) {
      throw new Error(
        "Missing CHOCODATA_API_KEY; add your Chocodata API key to .env",
      );
    }

    const params = new URLSearchParams({
      subreddit,
      sort: this.config.listing,
      limit: String(this.config.fetchLimit),
      api_key: this.config.chocodataApiKey,
    });
    if (this.config.listing === "top")
      params.set("t", this.config.topTimeframe);

    const url = `${this.config.chocodataBaseUrl.replace(/\/+$/, "")}/api/v1/reddit/subreddit?${params}`;
    const response = await withRetry(
      async () => {
        const result = await fetch(url, {
          headers: { "User-Agent": this.config.userAgent },
        });
        if (!result.ok) {
          const body = await result.text();
          if (isRetryableStatus(result.status)) {
            throw new RetryableError(
              `Chocodata request failed (${result.status})`,
              parseRetryAfterMs(result, body),
            );
          }
          throw new Error(
            `Chocodata request failed (${result.status}): ${body}`,
          );
        }
        return result;
      },
      { label: `ChocodataClient.fetchPosts(${subreddit})`, maxRetries: 3 },
    );

    const payload = (await response.json()) as unknown;
    const listingPosts = extractPosts(payload);
    const detailedPosts = await Promise.all(
      listingPosts
        .slice(0, this.config.detailLimit)
        .map((post) => this.enrichPost(post)),
    );
    const posts = [...detailedPosts, ...listingPosts.slice(this.config.detailLimit)];
    logger.info(
      { subreddit, listing: this.config.listing, postCount: posts.length },
      "Fetched posts from Chocodata",
    );
    return posts;
  }

  private async enrichPost(post: RedditPost): Promise<RedditPost> {
    try {
      const postId = post.id.replace(/^t3_/, "");
      const params = new URLSearchParams({
        api_key: this.config.chocodataApiKey!,
        post_id: postId,
        url: post.permalink,
        subreddit: post.subreddit,
        sort: "top",
      });
      const url = `${this.config.chocodataBaseUrl.replace(/\/+$/, "")}/api/v1/reddit/post?${params}`;
      const response = await fetch(url, {
        headers: { "User-Agent": this.config.userAgent },
      });
      if (!response.ok) {
        throw new Error(`detail request returned ${response.status}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const detail = payload.post;
      const detailPost = detail ? toPost(detail) : null;
      const postBody =
        detail && typeof detail === "object"
          ? stringValue((detail as Record<string, unknown>).body) ?? ""
          : "";
      const detailBody =
        postBody || detailPost?.body || extractTopCommentBodies(payload.comments);
      return detailBody
        ? { ...post, ...(detailPost ?? {}), body: detailBody }
        : post;
    } catch (error) {
      logger.warn(
        { postId: post.id, error: error instanceof Error ? error.message : String(error) },
        "Could not fetch Chocodata post details",
      );
      return post;
    }
  }
}

function extractPosts(payload: unknown): RedditPost[] {
  const candidates = findPostArray(payload);
  return candidates
    .map(toPost)
    .filter((post): post is RedditPost => post !== null);
}

function findPostArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  for (const key of ["data", "posts", "results", "items", "children"]) {
    const found = findPostArray(object[key]);
    if (found.length > 0) return found;
  }
  return [];
}

function toPost(value: unknown): RedditPost | null {
  if (!value || typeof value !== "object") return null;
  const post = value as Record<string, unknown>;
  const nested =
    post.data && typeof post.data === "object"
      ? (post.data as Record<string, unknown>)
      : post;
  const title = stringValue(nested.title);
  const body =
    stringValue(nested.selftext ?? nested.body ?? nested.text ?? nested.content) ??
    "";
  const subreddit = stringValue(nested.subreddit ?? nested.subreddit_name);
  const id = stringValue(nested.id ?? nested.post_id ?? nested.name);
  if (!id || !title || !subreddit) return null;

  const permalink = stringValue(nested.permalink ?? nested.url ?? nested.link);
  return {
    id,
    subreddit,
    title: title.trim(),
    body: body.trim(),
    author:
      stringValue(
        nested.author && typeof nested.author === "object"
          ? (nested.author as Record<string, unknown>).username
          : nested.author ?? nested.username,
      ) ?? "[unknown]",
    score: numberValue(nested.score ?? nested.ups ?? nested.upvotes) ?? 0,
    commentCount:
      numberValue(
        nested.num_comments ?? nested.comment_count ?? nested.comments,
      ) ?? 0,
    createdAt: toIsoDate(
      nested.created ??
        nested.created_utc ??
        nested.created_at ??
        nested.timestamp,
    ),
    permalink: permalink?.startsWith("http")
      ? permalink
      : `https://www.reddit.com${permalink ?? ""}`,
    isNsfw: Boolean(nested.over_18 ?? nested.nsfw ?? nested.is_nsfw),
    isStickied: Boolean(nested.stickied ?? nested.is_stickied),
  };
}

function extractTopCommentBodies(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((comment) => {
      if (!comment || typeof comment !== "object") return null;
      const object = comment as Record<string, unknown>;
      return {
        body: stringValue(object.body) ?? "",
        score: numberValue(object.score) ?? 0,
      };
    })
    .filter((comment): comment is { body: string; score: number } => Boolean(comment?.body))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((comment) => comment.body)
    .join("\n\n");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : value === null || value === undefined
      ? null
      : String(value);
}
function numberValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
function toIsoDate(value: unknown): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const numeric = numberValue(value);
  if (numeric === null) return new Date(0).toISOString();
  const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  return new Date(milliseconds).toISOString();
}
