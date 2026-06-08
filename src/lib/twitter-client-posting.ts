import type { AbstractConstructor, Mixin, TwitterClientBase } from './twitter-client-base.js';
import { TWITTER_API_BASE, TWITTER_GRAPHQL_POST_URL, TWITTER_STATUS_UPDATE_URL } from './twitter-client-constants.js';
import {
  buildNoteTweetCreateFeatures,
  buildNoteTweetFieldToggles,
  buildTweetCreateFeatures,
} from './twitter-client-features.js';
import type { CreateTweetResponse, TweetResult } from './twitter-client-types.js';

export interface TwitterClientPostingMethods {
  tweet(text: string, mediaIds?: string[]): Promise<TweetResult>;
  reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult>;
}

const STANDARD_TWEET_MAX_WEIGHTED_LENGTH = 280;
const URL_WEIGHTED_LENGTH = 23;
const URL_REGEX = /https?:\/\/\S+/g;

/**
 * Approximate X's weighted tweet length: URLs count as 23 chars (t.co wrapping),
 * everything else as code points. Used to decide CreateTweet vs CreateNoteTweet —
 * note tweets (long posts) require X Premium, so only route there when the text
 * genuinely exceeds the standard limit.
 */
export function weightedTweetLength(text: string): number {
  const withoutUrls = text.replace(URL_REGEX, '');
  const urlCount = (text.match(URL_REGEX) ?? []).length;
  return [...withoutUrls].length + urlCount * URL_WEIGHTED_LENGTH;
}

export function withPosting<TBase extends AbstractConstructor<TwitterClientBase>>(
  Base: TBase,
): Mixin<TBase, TwitterClientPostingMethods> {
  abstract class TwitterClientPosting extends Base {
    // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
    constructor(...args: any[]) {
      super(...args);
    }

    /**
     * Post a new tweet. Text over the standard 280 weighted-char limit is sent
     * as a long post (note tweet) via CreateNoteTweet — requires X Premium.
     */
    async tweet(text: string, mediaIds?: string[]): Promise<TweetResult> {
      const variables = {
        tweet_text: text,
        dark_request: false,
        media: {
          media_entities: (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] })),
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      };

      const operation = this.pickCreateOperation(text);
      return this.createTweet(variables, this.featuresFor(operation), operation, this.fieldTogglesFor(operation));
    }

    /**
     * Reply to an existing tweet. Long replies route through CreateNoteTweet
     * (requires X Premium), same as tweet().
     */
    async reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult> {
      const variables = {
        tweet_text: text,
        reply: {
          in_reply_to_tweet_id: replyToTweetId,
          exclude_reply_user_ids: [],
        },
        dark_request: false,
        media: {
          media_entities: (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] })),
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      };

      const operation = this.pickCreateOperation(text);
      return this.createTweet(variables, this.featuresFor(operation), operation, this.fieldTogglesFor(operation));
    }

    private pickCreateOperation(text: string): 'CreateTweet' | 'CreateNoteTweet' {
      return weightedTweetLength(text) > STANDARD_TWEET_MAX_WEIGHTED_LENGTH ? 'CreateNoteTweet' : 'CreateTweet';
    }

    private featuresFor(operation: 'CreateTweet' | 'CreateNoteTweet'): Record<string, boolean> {
      return operation === 'CreateNoteTweet' ? buildNoteTweetCreateFeatures() : buildTweetCreateFeatures();
    }

    private fieldTogglesFor(operation: 'CreateTweet' | 'CreateNoteTweet'): Record<string, boolean> | undefined {
      // CreateNoteTweet declares fieldToggles in the live client; CreateTweet does not.
      return operation === 'CreateNoteTweet' ? buildNoteTweetFieldToggles() : undefined;
    }

    private extractTweetId(data: CreateTweetResponse): string | undefined {
      return (
        data.data?.create_tweet?.tweet_results?.result?.rest_id ??
        data.data?.notetweet_create?.tweet_results?.result?.rest_id
      );
    }

    private async createTweet(
      variables: Record<string, unknown>,
      features: Record<string, boolean>,
      operation: 'CreateTweet' | 'CreateNoteTweet' = 'CreateTweet',
      fieldToggles?: Record<string, boolean>,
    ): Promise<TweetResult> {
      await this.ensureClientUserId();

      // Prepare transaction ID for POST (fixes error 226)
      await this.prepareTransactionId('POST', `/i/api/graphql/${operation}`);

      let queryId = await this.getQueryId(operation);
      let urlWithOperation = `${TWITTER_API_BASE}/${queryId}/${operation}`;

      const buildBody = () =>
        JSON.stringify(fieldToggles ? { variables, features, fieldToggles, queryId } : { variables, features, queryId });
      let body = buildBody();

      try {
        const headers = { ...this.getHeaders(), referer: 'https://x.com/compose/post' };
        let response = await this.fetchWithTimeout(urlWithOperation, {
          method: 'POST',
          headers,
          body,
        });

        // Twitter increasingly prefers POST to /i/api/graphql with queryId in the payload.
        // If the operation URL 404s, retry the generic endpoint.
        if (response.status === 404) {
          await this.refreshQueryIds();
          queryId = await this.getQueryId(operation);
          urlWithOperation = `${TWITTER_API_BASE}/${queryId}/${operation}`;
          body = buildBody();

          response = await this.fetchWithTimeout(urlWithOperation, {
            method: 'POST',
            headers: { ...this.getHeaders(), referer: 'https://x.com/compose/post' },
            body,
          });

          if (response.status === 404) {
            const retry = await this.fetchWithTimeout(TWITTER_GRAPHQL_POST_URL, {
              method: 'POST',
              headers: { ...this.getHeaders(), referer: 'https://x.com/compose/post' },
              body,
            });

            if (!retry.ok) {
              const text = await retry.text();
              return { success: false, error: `HTTP ${retry.status}: ${text.slice(0, 200)}` };
            }

            const data = (await retry.json()) as CreateTweetResponse;

            if (data.errors && data.errors.length > 0) {
              const fallback =
                operation === 'CreateTweet' ? await this.tryStatusUpdateFallback(data.errors, variables) : null;
              if (fallback) {
                return fallback;
              }
              return { success: false, error: this.formatErrors(data.errors) };
            }

            const tweetId = this.extractTweetId(data);
            if (tweetId) {
              return { success: true, tweetId };
            }

            return { success: false, error: 'Tweet created but no ID returned' };
          }
        }

        if (!response.ok) {
          const text = await response.text();
          return {
            success: false,
            error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
          };
        }

        const data = (await response.json()) as CreateTweetResponse;

        if (data.errors && data.errors.length > 0) {
          const fallback =
            operation === 'CreateTweet' ? await this.tryStatusUpdateFallback(data.errors, variables) : null;
          if (fallback) {
            return fallback;
          }
          return {
            success: false,
            error: this.formatErrors(data.errors),
          };
        }

        const tweetId = this.extractTweetId(data);
        if (tweetId) {
          return {
            success: true,
            tweetId,
          };
        }

        return {
          success: false,
          error: 'Tweet created but no ID returned',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    private formatErrors(errors: Array<{ message: string; code?: number }>): string {
      return errors
        .map((error) => (typeof error.code === 'number' ? `${error.message} (${error.code})` : error.message))
        .join(', ');
    }

    private statusUpdateInputFromCreateTweetVariables(variables: Record<string, unknown>): {
      text: string;
      inReplyToTweetId?: string;
      mediaIds?: string[];
    } | null {
      const text = typeof variables.tweet_text === 'string' ? variables.tweet_text : null;
      if (!text) {
        return null;
      }

      const reply = variables.reply;
      const inReplyToTweetId =
        reply &&
        typeof reply === 'object' &&
        typeof (reply as { in_reply_to_tweet_id?: unknown }).in_reply_to_tweet_id === 'string'
          ? (reply as { in_reply_to_tweet_id: string }).in_reply_to_tweet_id
          : undefined;

      const media = variables.media;
      const mediaEntities =
        media && typeof media === 'object' ? (media as { media_entities?: unknown }).media_entities : undefined;

      const mediaIds = Array.isArray(mediaEntities)
        ? mediaEntities
            .map((entity) =>
              entity && typeof entity === 'object' && 'media_id' in (entity as Record<string, unknown>)
                ? (entity as { media_id?: unknown }).media_id
                : undefined,
            )
            .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
            .map((value) => String(value))
        : undefined;

      return { text, inReplyToTweetId, mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined };
    }

    private async postStatusUpdate(input: {
      text: string;
      inReplyToTweetId?: string;
      mediaIds?: string[];
    }): Promise<TweetResult> {
      const params = new URLSearchParams();
      params.set('status', input.text);
      if (input.inReplyToTweetId) {
        params.set('in_reply_to_status_id', input.inReplyToTweetId);
        params.set('auto_populate_reply_metadata', 'true');
      }
      if (input.mediaIds && input.mediaIds.length > 0) {
        params.set('media_ids', input.mediaIds.join(','));
      }

      try {
        const response = await this.fetchWithTimeout(TWITTER_STATUS_UPDATE_URL, {
          method: 'POST',
          headers: {
            ...this.getBaseHeaders(),
            'content-type': 'application/x-www-form-urlencoded',
            referer: 'https://x.com/compose/post',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const text = await response.text();
          return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        const data = (await response.json()) as {
          id_str?: string;
          id?: string | number;
          errors?: Array<{ message: string; code?: number }>;
        };

        if (data.errors && data.errors.length > 0) {
          return { success: false, error: this.formatErrors(data.errors) };
        }

        const tweetId =
          typeof data.id_str === 'string' ? data.id_str : data.id !== undefined ? String(data.id) : undefined;

        if (tweetId) {
          return { success: true, tweetId };
        }
        return { success: false, error: 'Tweet created but no ID returned' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    private async tryStatusUpdateFallback(
      errors: Array<{ message: string; code?: number }>,
      variables: Record<string, unknown>,
    ): Promise<TweetResult | null> {
      if (!errors.some((error) => error.code === 226)) {
        return null;
      }
      const input = this.statusUpdateInputFromCreateTweetVariables(variables);
      if (!input) {
        return null;
      }

      const fallback = await this.postStatusUpdate(input);
      if (fallback.success) {
        return fallback;
      }

      return {
        success: false,
        error: `${this.formatErrors(errors)} | fallback: ${fallback.error ?? 'Unknown error'}`,
      };
    }
  }

  return TwitterClientPosting;
}
