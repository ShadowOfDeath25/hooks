import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import IORedis from 'ioredis';

/**
 * Reads and validates webhook rate limit configuration from environment variables.
 *
 * @returns {{ limit: number, windowMs: number, delayMs: number }}
 */
export function getWebhookRateLimitConfig() {
    const limit = Number(process.env.WEBHOOK_RATE_LIMIT);
    const windowMs = Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS);

    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('WEBHOOK_RATE_LIMIT must be a positive integer');
    }

    if (!Number.isInteger(windowMs) || windowMs <= 0) {
        throw new Error('WEBHOOK_RATE_LIMIT_WINDOW_MS must be a positive integer');
    }

    let delayMs = windowMs;
    if (process.env.WEBHOOK_RATE_LIMIT_DELAY_MS !== undefined && process.env.WEBHOOK_RATE_LIMIT_DELAY_MS !== '') {
        delayMs = Number(process.env.WEBHOOK_RATE_LIMIT_DELAY_MS);
        if (!Number.isInteger(delayMs) || delayMs <= 0) {
            throw new Error('WEBHOOK_RATE_LIMIT_DELAY_MS must be a positive integer');
        }
    }

    return { limit, windowMs, delayMs };
}

/**
 * Distributed rate limiter for outgoing webhook requests.
 * Uses rate-limiter-flexible backed by Redis to coordinate per-endpoint limits across worker instances.
 */
export class WebhookRateLimiter {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.limit] - Max attempts per window. Defaults to WEBHOOK_RATE_LIMIT.
     * @param {number} [options.windowMs] - Window size in ms. Defaults to WEBHOOK_RATE_LIMIT_WINDOW_MS.
     * @param {number} [options.delayMs] - Delay in ms when rate limited. Defaults to WEBHOOK_RATE_LIMIT_DELAY_MS or windowMs.
     * @param {IORedis} [options.connection] - Existing Redis connection.
     * @param {string} [options.redisUrl] - Redis URL if connection is not provided.
     * @param {Object} [options.clientOptions] - Additional options for IORedis.
     * @param {string} [options.groupId] - Bottleneck Group ID prefix (alias for keyPrefix). Defaults to 'webhook:rate-limit:endpoint'.
     * @param {string} [options.keyPrefix] - Key prefix. Defaults to groupId or 'webhook:rate-limit:endpoint'.
     * @param {string} [options.datastore] - Datastore type ('ioredis', 'redis', 'local').
     * @param {Object} [options.logger] - Logger with .error method. Defaults to console.
     * @param {number} [options.checkTimeoutMs] - Timeout in ms for rate-limit check before failing closed. Defaults to 2000.
     */
    constructor(options = {}) {
        let envConfig = null;
        if (options.limit === undefined || options.windowMs === undefined || options.delayMs === undefined) {
            try {
                envConfig = getWebhookRateLimitConfig();
            } catch (err) {
                if (options.limit === undefined || options.windowMs === undefined) {
                    throw err;
                }
            }
        }

        this.limit = options.limit ?? envConfig?.limit;
        this.windowMs = options.windowMs ?? envConfig?.windowMs;
        this.delayMs = options.delayMs ?? envConfig?.delayMs ?? this.windowMs;
        this.keyPrefix = options.keyPrefix || options.groupId || 'webhook:rate-limit:endpoint';
        this.groupId = this.keyPrefix;
        this.logger = options.logger || console;
        this.checkTimeoutMs = options.checkTimeoutMs ?? 2000;
        this.datastore = options.datastore;

        // In rate-limiter-flexible, duration is in seconds.
        // Ensure at least 1 second duration for Redis key TTL expiration.
        this.duration = Math.max(1, Math.ceil(this.windowMs / 1000));

        this.sharedConnection = Boolean(options.connection);
        this.client = null;

        if (this.datastore === 'local') {
            this.limiter = new RateLimiterMemory({
                points: this.limit,
                duration: this.duration,
                keyPrefix: this.keyPrefix
            });
        } else {
            if (options.connection) {
                this.client = options.connection;
            } else {
                const redisUrl = options.redisUrl || process.env.REDIS_URL;
                if (redisUrl) {
                    this.client = new IORedis(redisUrl, {
                        maxRetriesPerRequest: null,
                        ...(options.clientOptions || {})
                    });
                }
            }

            if (this.client) {
                this.limiter = new RateLimiterRedis({
                    storeClient: this.client,
                    points: this.limit,
                    duration: this.duration,
                    keyPrefix: this.keyPrefix
                });
            } else {
                this.limiter = new RateLimiterMemory({
                    points: this.limit,
                    duration: this.duration,
                    keyPrefix: this.keyPrefix
                });
            }
        }

        this.connection = this.client;
    }

    /**
     * Gets the configured delay in ms for jobs delayed by rate limiting.
     * @returns {number}
     */
    getDelayMs() {
        return this.delayMs;
    }

    /**
     * Checks if an outgoing attempt is allowed for the given endpoint.
     * Non-blocking, immediate resolution.
     * Fails closed on Redis/infrastructure errors.
     *
     * @param {number|string} endpointId
     * @returns {Promise<boolean>} - true if allowed, false if rate limited
     */
    async allow(endpointId) {
        if (endpointId === undefined || endpointId === null) {
            throw new Error('endpointId is required for rate limit check');
        }

        const key = String(endpointId);

        try {
            let checkPromise = this.limiter.consume(key);

            if (this.checkTimeoutMs > 0) {
                let timer;
                const timeoutPromise = new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        reject(new Error(`Rate limiter check timed out after ${this.checkTimeoutMs}ms`));
                    }, this.checkTimeoutMs);
                });

                checkPromise = Promise.race([checkPromise, timeoutPromise]).finally(() => {
                    if (timer) clearTimeout(timer);
                });
            }

            await checkPromise;
            return true;
        } catch (error) {
            if (error instanceof RateLimiterRes) {
                return false;
            }

            // Infrastructure error (Redis connection dropped, timeout, etc.)
            // FAIL CLOSED: deny request to prevent unthrottled traffic, log the error.
            this.logger.error(
                `[RateLimiter] Infrastructure error checking rate limit for endpoint ${endpointId}; failing closed: ${error?.message || error}`
            );
            return false;
        }
    }

    /**
     * Disconnects the rate limiter and optionally the underlying Redis connection.
     * @param {boolean} [flush=false]
     * @param {Object} [options={}]
     * @param {boolean} [options.closeConnection=false] - Whether to close the underlying connection
     */
    async disconnect(flush = false, { closeConnection = false } = {}) {
        if (this.client && (closeConnection || !this.sharedConnection)) {
            if (flush && typeof this.client.disconnect === 'function') {
                this.client.disconnect();
            } else if (typeof this.client.quit === 'function') {
                try {
                    await this.client.quit();
                } catch {
                    if (typeof this.client.disconnect === 'function') {
                        this.client.disconnect();
                    }
                }
            } else if (typeof this.client.disconnect === 'function') {
                this.client.disconnect();
            }
        }
    }
}

/**
 * Factory function to create a WebhookRateLimiter instance.
 *
 * @param {Object} [options={}]
 * @returns {WebhookRateLimiter}
 */
export function createWebhookRateLimiter(options = {}) {
    return new WebhookRateLimiter(options);
}
