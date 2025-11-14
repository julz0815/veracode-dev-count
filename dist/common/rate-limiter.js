"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
class RateLimiter {
    constructor(config = {}) {
        this.requestTimes = [];
        this.lastRequestTime = 0;
        this.config = {
            requestsPerHour: config.requestsPerHour || 4000, // Conservative limit for GitHub API
            requestsPerMinute: config.requestsPerMinute || 60, // 1 request per second
            delayBetweenRequests: config.delayBetweenRequests || 1000, // 1 second between requests
            maxRetries: config.maxRetries || 5,
            backoffMultiplier: config.backoffMultiplier || 2
        };
    }
    /**
     * Wait for the appropriate delay before making the next request
     */
    async waitForNextRequest() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.delayBetweenRequests) {
            const waitTime = this.config.delayBetweenRequests - timeSinceLastRequest;
            await this.sleep(waitTime);
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * Check if we can make a request based on rate limits
     */
    canMakeRequest() {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        const oneHourAgo = now - 60 * 60 * 1000;
        // Remove old request times
        this.requestTimes = this.requestTimes.filter(time => time > oneHourAgo);
        // Check minute limit
        const requestsInLastMinute = this.requestTimes.filter(time => time > oneMinuteAgo).length;
        if (requestsInLastMinute >= this.config.requestsPerMinute) {
            return false;
        }
        // Check hour limit
        const requestsInLastHour = this.requestTimes.length;
        if (requestsInLastHour >= this.config.requestsPerHour) {
            return false;
        }
        return true;
    }
    /**
     * Record a request
     */
    recordRequest() {
        this.requestTimes.push(Date.now());
    }
    /**
     * Calculate delay needed before next request
     */
    getDelayUntilNextRequest() {
        if (this.canMakeRequest()) {
            return 0;
        }
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        const oneHourAgo = now - 60 * 60 * 1000;
        // Check minute limit
        const requestsInLastMinute = this.requestTimes.filter(time => time > oneMinuteAgo).length;
        if (requestsInLastMinute >= this.config.requestsPerMinute) {
            const oldestRequestInMinute = Math.min(...this.requestTimes.filter(time => time > oneMinuteAgo));
            return Math.max(0, (oldestRequestInMinute + 60 * 1000) - now);
        }
        // Check hour limit
        const requestsInLastHour = this.requestTimes.length;
        if (requestsInLastHour >= this.config.requestsPerHour) {
            const oldestRequest = Math.min(...this.requestTimes);
            return Math.max(0, (oldestRequest + 60 * 60 * 1000) - now);
        }
        return 0;
    }
    /**
     * Wait for rate limit reset
     */
    async waitForRateLimitReset() {
        const delay = this.getDelayUntilNextRequest();
        if (delay > 0) {
            console.log(`Rate limit reached. Waiting ${Math.ceil(delay / 1000)} seconds...`);
            await this.sleep(delay);
        }
    }
    /**
     * Execute a function with rate limiting and retry logic
     */
    async executeWithRateLimit(fn, retryCount = 0) {
        try {
            // Wait for rate limit reset if needed
            await this.waitForRateLimitReset();
            // Wait for next request slot
            await this.waitForNextRequest();
            // Record this request
            this.recordRequest();
            // Execute the function
            return await fn();
        }
        catch (error) {
            // Check if it's a rate limit error
            if (this.isRateLimitError(error) && retryCount < this.config.maxRetries) {
                const retryDelay = this.calculateRetryDelay(retryCount);
                console.log(`Rate limit error. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`);
                await this.sleep(retryDelay);
                return this.executeWithRateLimit(fn, retryCount + 1);
            }
            throw error;
        }
    }
    /**
     * Check if an error is a rate limit error
     */
    isRateLimitError(error) {
        return (error?.status === 403 ||
            error?.status === 429 ||
            error?.message?.includes('rate limit') ||
            error?.message?.includes('API rate limit'));
    }
    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(retryCount) {
        const baseDelay = 1000; // 1 second
        return baseDelay * Math.pow(this.config.backoffMultiplier, retryCount);
    }
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Update rate limit info from GitHub API headers
     */
    updateFromHeaders(headers) {
        const limit = parseInt(headers['x-ratelimit-limit'] || '0');
        const remaining = parseInt(headers['x-ratelimit-remaining'] || '0');
        const reset = parseInt(headers['x-ratelimit-reset'] || '0');
        if (limit > 0) {
            // Update our internal limits based on actual GitHub limits
            this.config.requestsPerHour = limit;
            this.config.requestsPerMinute = Math.floor(limit / 60); // Distribute evenly across the hour
        }
        // If we're close to the limit, be more conservative
        if (remaining < 100) {
            this.config.delayBetweenRequests = 2000; // 2 seconds between requests
        }
        else if (remaining < 500) {
            this.config.delayBetweenRequests = 1500; // 1.5 seconds between requests
        }
        else {
            this.config.delayBetweenRequests = 1000; // 1 second between requests
        }
    }
    /**
     * Get current rate limit status
     */
    getStatus() {
        return {
            canMakeRequest: this.canMakeRequest(),
            delayUntilNext: this.getDelayUntilNextRequest(),
            requestsInLastHour: this.requestTimes.length
        };
    }
}
exports.RateLimiter = RateLimiter;
