import Bottleneck from 'bottleneck';
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
 * Uses Bottleneck with Redis clustering to coordinate per-endpoint limits across worker instances.
 */
export class WebhookRateLimiter {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.limit] - Max attempts per window. Defaults to WEBHOOK_RATE_LIMIT.
     * @param {number} [options.windowMs] - Window size in ms. Defaults to WEBHOOK_RATE_LIMIT_WINDOW_MS.
     * @param {number} [options.delayMs] - Delay in ms when rate limited. Defaults to WEBHOOK_RATE_LIMIT_DELAY_MS or windowMs.
     * @param {IORedis|Bottleneck.IORedisConnection} [options.connection] - Existing Redis connection or Bottleneck connection.
     * @param {string} [options.redisUrl] - Redis URL if connection is not provided.
     * @param {Object} [options.clientOptions] - Additional options for IORedis.
     * @param {string} [options.groupId] - Bottleneck Group ID prefix. Defaults to 'webhook:rate-limit:endpoint'.
     * @param {string} [options.datastore] - Datastore type ('ioredis', 'redis', 'local').
     * @param {Object} [options.logger] - Logger with .error method. Defaults to console.
     * @param {number} [options.checkTimeoutMs] - Timeout in ms for rate-limit check before failing open. Defaults to 2000.
     * @param {number} [options.timeout] - Inactivity TTL in ms for Redis keys. Defaults to 300000 (5 min).
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
        this.groupId = options.groupId || 'webhook:rate-limit:endpoint';
        this.logger = options.logger || console;
        this.checkTimeoutMs = options.checkTimeoutMs ?? 2000;
        this.timeout = options.timeout ?? 300000;
        this.datastore = options.datastore;

        this.sharedConnection = Boolean(options.connection);
        let bottleneckConnection = null;

        if (options.connection) {
            if (options.connection instanceof Bottleneck.IORedisConnection) {
                bottleneckConnection = options.connection;
            } else {
                bottleneckConnection = new Bottleneck.IORedisConnection({
                    client: options.connection
                });
            }
        } else if (this.datastore !== 'local') {
            const redisUrl = options.redisUrl || process.env.REDIS_URL;
            if (redisUrl) {
                const redisClient = new IORedis(redisUrl, {
                    maxRetriesPerRequest: null,
                    ...(options.clientOptions || {})
                });
                bottleneckConnection = new Bottleneck.IORedisConnection({
                    client: redisClient
                });
            }
        }

        this.connection = bottleneckConnection;

        const groupOptions = {
            id: this.groupId,
            timeout: this.timeout,
            highWater: 0,
            strategy: Bottleneck.strategy.OVERFLOW,
            rejectOnDrop: true,
            reservoir: this.limit,
            reservoirRefreshAmount: this.limit,
            reservoirRefreshInterval: this.windowMs,
            minTime: 0
        };

        if (this.connection) {
            groupOptions.connection = this.connection;
        } else if (this.datastore === 'local') {
            groupOptions.datastore = 'local';
        }

        this.group = new Bottleneck.Group(groupOptions);

        if (this.connection) {
            this.connection.on('error', (err) => {
                this.logger.error(`[RateLimiter] Bottleneck Redis connection error: ${err?.message || err}`);
            });
        }

        this.group.on('error', (err) => {
            this.logger.error(`[RateLimiter] Bottleneck group error: ${err?.message || err}`);
        });

        this.group.on('created', (limiter, key) => {
            limiter.on('error', (err) => {
                this.logger.error(`[RateLimiter] Bottleneck limiter error for endpoint ${key}: ${err?.message || err}`);
            });
        });
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
            const limiter = this.group.key(key);
            let checkPromise = limiter.schedule(() => true);

            if (this.checkTimeoutMs > 0) {
                checkPromise = Promise.race([
                    checkPromise,
                    new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(`Rate limiter check timed out after ${this.checkTimeoutMs}ms`));
                        }, this.checkTimeoutMs);
                    })
                ]);
            }

            await checkPromise;
            return true;
        } catch (error) {
            if (
                error instanceof Bottleneck.BottleneckError ||
                error?.message === 'This job has been dropped by Bottleneck'
            ) {
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
     * Disconnects all limiters and optionally the underlying Redis connection/subscriber.
     * @param {boolean} [flush=false]
     * @param {Object} [options={}]
     * @param {boolean} [options.closeConnection=false] - Whether to close the underlying connection and subscriber
     */
    async disconnect(flush = false, { closeConnection = false } = {}) {
        await this.group.disconnect(flush);
        if (this.connection && (closeConnection || !this.sharedConnection)) {
            await this.connection.disconnect(flush);
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
