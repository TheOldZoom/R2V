import { logger } from "../logger";
import type {
  RedditConfig,
  RedditPost,
  RedditStory,
  RedditSubreddit,
} from "./types";

export function filterAndScorePosts(
  posts: RedditPost[],
  config: RedditConfig,
): RedditStory[] {
  const blockedTerms = config.blockedTerms
    .map((term) => term.toLocaleLowerCase())
    .filter(Boolean);
  return posts
    .filter((post) => isUsableStory(post, config, blockedTerms))
    .map((post) => ({ ...post, storyScore: scoreStory(post) }))
    .sort((left, right) => right.storyScore - left.storyScore);
}

export interface RedditPostClient {
  fetchPosts(subreddit: string): Promise<RedditPost[]>;
}

export async function selectRedditStory(
  client: RedditPostClient,
  config: RedditConfig,
): Promise<RedditStory> {
  const subreddits = weightedShuffle(config.subreddits);
  for (const subreddit of subreddits) {
    const stories = filterAndScorePosts(
      await client.fetchPosts(subreddit.name),
      config,
    );
    if (stories[0]) {
      const picked = pickWeightedStory(stories, config.storyPoolSize ?? 5);
      logger.info(
        {
          subreddit: subreddit.name,
          story: { id: picked.id, storyScore: picked.storyScore },
          candidateCount: stories.length,
        },
        "Selected Reddit story",
      );
      return picked;
    }
    logger.warn(
      { subreddit: subreddit.name },
      "No eligible Reddit stories found; trying next subreddit",
    );
  }
  throw new Error("No eligible Reddit stories found in configured subreddits");
}

function isUsableStory(
  post: RedditPost,
  config: RedditConfig,
  blockedTerms: string[],
): boolean {
  if (post.isNsfw || post.isStickied || post.author === "[deleted]")
    return false;
  if (!post.title || post.body.length < config.minBodyLength) return false;
  if (post.body === "[removed]" || post.body === "[deleted]") return false;
  const content = `${post.title}\n${post.body}`.toLocaleLowerCase();
  return !blockedTerms.some((term) => content.includes(term));
}

function scoreStory(post: RedditPost): number {
  const ageHours = Math.max(
    0,
    (Date.now() - Date.parse(post.createdAt)) / 3_600_000,
  );
  const bodyBonus = Math.min(3, post.body.split(/\s+/).length / 100);
  return (
    Math.log1p(Math.max(0, post.score)) * 4 +
    Math.log1p(Math.max(0, post.commentCount)) * 2 +
    bodyBonus -
    ageHours * 0.03
  );
}

function pickWeightedStory(
  stories: RedditStory[],
  poolSize: number,
): RedditStory {
  const pool = stories.slice(0, Math.max(1, poolSize));
  const minScore = Math.min(...pool.map((story) => story.storyScore));
  const offset = minScore < 0 ? -minScore + 0.01 : 0.01;
  const total = pool.reduce((sum, story) => sum + story.storyScore + offset, 0);

  let target = Math.random() * total;
  for (const story of pool) {
    target -= story.storyScore + offset;
    if (target <= 0) return story;
  }
  return pool[0];
}

function weightedShuffle(subreddits: RedditSubreddit[]): RedditSubreddit[] {
  const remaining = subreddits.filter((subreddit) => subreddit.weight > 0);
  const ordered: RedditSubreddit[] = [];
  while (remaining.length) {
    const total = remaining.reduce(
      (sum, subreddit) => sum + subreddit.weight,
      0,
    );
    let target = Math.random() * total;
    const index = remaining.findIndex((subreddit) => {
      target -= subreddit.weight;
      return target <= 0;
    });
    ordered.push(
      ...remaining.splice(index < 0 ? remaining.length - 1 : index, 1),
    );
  }
  return ordered;
}
