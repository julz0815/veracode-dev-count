"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpClient = exports.HttpClient = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const tls = __importStar(require("tls"));
const url_1 = require("url");
const rate_limiter_1 = require("./rate-limiter");
/**
 * Centralized HTTP client that handles SSL certificates and proxy configuration
 * for all CI systems. This ensures consistent network behavior across GitHub, GitLab, and Azure DevOps.
 */
class HttpClient {
    constructor() {
        this.requestTimeout = 30000; // 30 seconds
    }
    /**
     * Initialize the HTTP client with global network configuration
     */
    async initialize(config) {
        this.sslConfig = config.ssl;
        this.proxyConfig = config.proxy;
        this.rateLimitConfig = config.rateLimit;
        // Create HTTPS agent if SSL config is provided (even if only rejectUnauthorized is set)
        if (this.sslConfig) {
            this.httpsAgent = await this.createHttpsAgent();
            if (process.argv.includes('--debug')) {
                console.log('HTTP Client: Created HTTPS agent with SSL configuration');
                if (this.sslConfig.rejectUnauthorized === false) {
                    console.log('HTTP Client: SSL verification is DISABLED (rejectUnauthorized=false)');
                }
            }
        }
        // Create rate limiter if rate limit config is provided
        if (this.rateLimitConfig) {
            this.rateLimiter = new rate_limiter_1.RateLimiter(this.rateLimitConfig);
            if (process.argv.includes('--debug')) {
                console.log('HTTP Client: Created rate limiter with configuration');
            }
        }
        if (process.argv.includes('--debug')) {
            console.log('HTTP Client initialized:', {
                hasSSL: !!this.sslConfig,
                sslRejectUnauthorized: this.sslConfig?.rejectUnauthorized,
                hasProxy: !!this.proxyConfig,
                proxyProtocol: this.proxyConfig?.protocol,
                hasRateLimit: !!this.rateLimitConfig,
                hasAgent: !!this.httpsAgent,
                agentRejectUnauthorized: this.httpsAgent ? this.httpsAgent.options?.rejectUnauthorized : undefined,
                hasRateLimiter: !!this.rateLimiter,
            });
        }
    }
    /**
     * Create HTTPS agent with SSL configuration
     */
    async createHttpsAgent() {
        if (!this.sslConfig) {
            return undefined;
        }
        const sslOptions = {
            rejectUnauthorized: this.sslConfig.rejectUnauthorized !== false, // Default to true
        };
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        // Read CA certificate file if provided
        if (this.sslConfig.caFile) {
            try {
                const caContent = await fs.readFile(this.sslConfig.caFile, 'utf8');
                sslOptions.ca = caContent;
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Loaded CA certificate from: ${this.sslConfig.caFile}`);
                }
            }
            catch (error) {
                console.error(`Error reading CA certificate file ${this.sslConfig.caFile}:`, error);
                throw new Error(`Failed to read CA certificate file: ${this.sslConfig.caFile}`);
            }
        }
        // Read client certificate file if provided
        if (this.sslConfig.certFile) {
            try {
                const certContent = await fs.readFile(this.sslConfig.certFile, 'utf8');
                sslOptions.cert = certContent;
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Loaded client certificate from: ${this.sslConfig.certFile}`);
                }
            }
            catch (error) {
                console.error(`Error reading client certificate file ${this.sslConfig.certFile}:`, error);
                throw new Error(`Failed to read client certificate file: ${this.sslConfig.certFile}`);
            }
        }
        // Read client private key file if provided
        if (this.sslConfig.keyFile) {
            try {
                const keyContent = await fs.readFile(this.sslConfig.keyFile, 'utf8');
                sslOptions.key = keyContent;
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Loaded client private key from: ${this.sslConfig.keyFile}`);
                }
            }
            catch (error) {
                console.error(`Error reading client private key file ${this.sslConfig.keyFile}:`, error);
                throw new Error(`Failed to read client private key file: ${this.sslConfig.keyFile}`);
            }
        }
        if (process.argv.includes('--debug')) {
            console.log('HTTP Client: SSL Configuration:', {
                rejectUnauthorized: sslOptions.rejectUnauthorized,
                hasCA: !!sslOptions.ca,
                hasCert: !!sslOptions.cert,
                hasKey: !!sslOptions.key,
            });
        }
        return new https.Agent(sslOptions);
    }
    /**
     * Make an HTTP/HTTPS request with support for SSL, proxy, and rate limiting
     * This is a drop-in replacement for fetch() that handles SSL certificates, proxies, and rate limiting
     * SSL, proxy, and rate limiting are independent - can be used separately or together
     */
    async fetch(url, options = {}) {
        const urlObj = new url_1.URL(url);
        // If we have SSL config, proxy config, or rate limiting, use custom implementation
        // Otherwise, use native fetch for backward compatibility
        if (this.httpsAgent || this.proxyConfig || this.rateLimiter) {
            return this.customFetch(url, options);
        }
        // Use native fetch when no SSL/proxy/rate-limit config (backward compatible)
        return globalThis.fetch(url, options);
    }
    /**
     * Custom fetch implementation that supports SSL certificates, proxy, and rate limiting
     * SSL, proxy, and rate limiting are independent - can be used separately or together
     */
    async customFetch(url, options = {}) {
        // If rate limiting is configured, wrap the request with rate limiter
        if (this.rateLimiter) {
            return this.rateLimiter.executeWithRateLimit(async () => {
                return this.executeFetch(url, options);
            });
        }
        // No rate limiting, execute directly
        return this.executeFetch(url, options);
    }
    /**
     * Execute the actual fetch request (without rate limiting)
     */
    async executeFetch(url, options = {}) {
        const urlObj = new url_1.URL(url);
        const isHttps = urlObj.protocol === 'https:';
        // Priority 1: If proxy is configured, use proxy (works for both HTTP and HTTPS)
        if (this.proxyConfig) {
            return this.fetchViaProxy(url, options);
        }
        // Priority 2: Use direct connection with SSL agent if configured (HTTPS only)
        if (isHttps && this.httpsAgent) {
            return this.fetchWithHttpsAgent(url, options);
        }
        // Fallback to native fetch
        return globalThis.fetch(url, options);
    }
    /**
     * Handle HTTP request/response over a TLS tunnel (used for both HTTP and HTTPS proxy cases)
     */
    handleTunneledRequest(tlsSocket, urlObj, options, resolve, reject, timeoutId) {
        if (process.argv.includes('--debug')) {
            console.log(`HTTP Client: TLS connect() called, waiting for secureConnect event...`);
        }
        // Handle TLS connection errors
        tlsSocket.on('error', (error) => {
            if (timeoutId)
                clearTimeout(timeoutId);
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: TLS connection error:`, error.message);
            }
            reject(new Error(`TLS connection failed: ${error.message}`));
        });
        // Wait for TLS handshake to complete before sending request
        tlsSocket.on('secureConnect', () => {
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: TLS handshake complete for ${urlObj.hostname}`);
            }
            // TLS handshake complete, now make HTTPS request
            const method = options.method || 'GET';
            const requestPath = urlObj.pathname + urlObj.search;
            const headers = options.headers || {};
            // Build HTTP request
            let request = `${method} ${requestPath} HTTP/1.1\r\n`;
            request += `Host: ${urlObj.hostname}${urlObj.port && urlObj.port !== '443' ? `:${urlObj.port}` : ''}\r\n`;
            request += `Connection: close\r\n`;
            for (const [key, value] of Object.entries(headers)) {
                if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'connection') {
                    request += `${key}: ${value}\r\n`;
                }
            }
            request += '\r\n';
            if (options.body) {
                if (typeof options.body === 'string') {
                    request += options.body;
                }
                else if (options.body instanceof ArrayBuffer) {
                    request += Buffer.from(options.body).toString();
                }
                else if (options.body instanceof Uint8Array) {
                    request += Buffer.from(options.body).toString();
                }
            }
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: Sending request through TLS tunnel:\n${request.substring(0, 200)}...`);
            }
            tlsSocket.write(request);
        });
        const chunks = [];
        let responseHeaders = {};
        let statusCode = 200;
        let statusText = 'OK';
        let headerComplete = false;
        let headerBuffer = Buffer.alloc(0);
        tlsSocket.on('data', (chunk) => {
            if (process.argv.includes('--debug') && !headerComplete) {
                console.log(`HTTP Client: Received ${chunk.length} bytes, headerComplete=${headerComplete}`);
            }
            if (!headerComplete) {
                headerBuffer = Buffer.concat([headerBuffer, chunk]);
                const headerEnd = headerBuffer.indexOf('\r\n\r\n');
                if (headerEnd !== -1) {
                    headerComplete = true;
                    const headerText = headerBuffer.subarray(0, headerEnd).toString();
                    const bodyStart = headerEnd + 4;
                    const bodyChunk = headerBuffer.subarray(bodyStart);
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: Response headers received:\n${headerText.substring(0, 500)}`);
                    }
                    // Parse status line and headers
                    const lines = headerText.split('\r\n');
                    if (lines.length > 0) {
                        const statusMatch = lines[0].match(/HTTP\/[\d.]+\s+(\d+)\s+(.+)/);
                        if (statusMatch) {
                            statusCode = parseInt(statusMatch[1]);
                            statusText = statusMatch[2];
                            if (process.argv.includes('--debug')) {
                                console.log(`HTTP Client: Response status: ${statusCode} ${statusText}`);
                            }
                        }
                        else {
                            if (process.argv.includes('--debug')) {
                                console.log(`HTTP Client: Failed to parse status line: ${lines[0]}`);
                            }
                        }
                    }
                    for (let i = 1; i < lines.length; i++) {
                        const colonIndex = lines[i].indexOf(':');
                        if (colonIndex !== -1) {
                            const key = lines[i].substring(0, colonIndex).trim().toLowerCase();
                            const value = lines[i].substring(colonIndex + 1).trim();
                            responseHeaders[key] = value;
                        }
                    }
                    if (bodyChunk.length > 0) {
                        chunks.push(bodyChunk);
                    }
                }
            }
            else {
                chunks.push(chunk);
            }
        });
        tlsSocket.on('end', () => {
            if (timeoutId)
                clearTimeout(timeoutId);
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: TLS socket ended, total body size: ${Buffer.concat(chunks).length} bytes`);
                console.log(`HTTP Client: Response status: ${statusCode}, headers complete: ${headerComplete}`);
            }
            if (!headerComplete) {
                const error = new Error('Connection closed before receiving HTTP response headers');
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Error - ${error.message}`);
                    console.log(`HTTP Client: Received data: ${headerBuffer.toString().substring(0, 200)}`);
                }
                reject(error);
                return;
            }
            const body = Buffer.concat(chunks);
            const response = new Response(body, {
                status: statusCode,
                statusText: statusText,
                headers: responseHeaders,
            });
            resolve(response);
        });
        tlsSocket.on('close', () => {
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: TLS socket closed`);
            }
        });
    }
    /**
     * Fetch via HTTP proxy
     * Supports both HTTP and HTTPS requests
     * For HTTPS: Uses CONNECT tunneling
     * For HTTP: Forwards the request directly
     * SSL config is used when available (for HTTPS through proxy)
     */
    async fetchViaProxy(url, options = {}) {
        const urlObj = new url_1.URL(url);
        const proxy = this.proxyConfig;
        const proxyProtocol = proxy.protocol === 'https' ? https : http;
        const isHttps = urlObj.protocol === 'https:';
        // For HTTP requests, forward directly through proxy
        if (!isHttps) {
            return this.fetchHttpViaProxy(url, options);
        }
        // For HTTPS requests, use CONNECT tunneling
        return new Promise((resolve, reject) => {
            // Build CONNECT request
            const connectPath = `${urlObj.hostname}:${urlObj.port || 443}`;
            const proxyAuth = proxy.auth
                ? Buffer.from(`${proxy.auth.username}:${proxy.auth.password}`).toString('base64')
                : undefined;
            // For HTTPS proxy, we need to establish TLS connection first, then send CONNECT
            if (proxy.protocol === 'https') {
                // Manually establish TLS connection to proxy
                const tlsOptions = {
                    host: proxy.host,
                    port: proxy.port,
                    servername: proxy.host, // SNI for the proxy itself
                };
                // Apply SSL config
                if (this.httpsAgent) {
                    const agentOptions = this.httpsAgent.options;
                    if (agentOptions) {
                        tlsOptions.rejectUnauthorized = agentOptions.rejectUnauthorized !== false;
                        if (agentOptions.ca) {
                            tlsOptions.ca = agentOptions.ca;
                        }
                        if (agentOptions.cert) {
                            tlsOptions.cert = agentOptions.cert;
                        }
                        if (agentOptions.key) {
                            tlsOptions.key = agentOptions.key;
                        }
                    }
                }
                else if (this.sslConfig) {
                    tlsOptions.rejectUnauthorized = this.sslConfig.rejectUnauthorized !== false;
                }
                else {
                    tlsOptions.rejectUnauthorized = true;
                }
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Establishing TLS connection to HTTPS proxy ${proxy.host}:${proxy.port}...`);
                }
                const proxyTlsSocket = tls.connect(tlsOptions, () => {
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: TLS connection to proxy established, sending CONNECT request...`);
                    }
                    // Now send CONNECT request over the TLS connection
                    const connectRequest = `CONNECT ${connectPath} HTTP/1.1\r\n` +
                        `Host: ${connectPath}\r\n` +
                        (proxyAuth ? `Proxy-Authorization: Basic ${proxyAuth}\r\n` : '') +
                        `\r\n`;
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: CONNECT request:\n${connectRequest}`);
                    }
                    proxyTlsSocket.write(connectRequest);
                });
                let connectResponseBuffer = Buffer.alloc(0);
                let connectComplete = false;
                const onProxyData = (chunk) => {
                    if (connectComplete) {
                        return;
                    }
                    connectResponseBuffer = Buffer.concat([connectResponseBuffer, chunk]);
                    const responseText = connectResponseBuffer.toString();
                    // Check if we have complete HTTP response headers
                    const headerEnd = responseText.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                        const headers = responseText.substring(0, headerEnd);
                        const statusMatch = headers.match(/HTTP\/[\d.]+\s+(\d+)\s+(.+)/);
                        if (process.argv.includes('--debug')) {
                            console.log(`HTTP Client: CONNECT response received:\n${headers}`);
                        }
                        if (statusMatch) {
                            const statusCode = parseInt(statusMatch[1]);
                            if (statusCode !== 200) {
                                proxyTlsSocket.destroy();
                                reject(new Error(`Proxy CONNECT failed: ${statusCode} ${statusMatch[2]}`));
                                return;
                            }
                            connectComplete = true;
                            proxyTlsSocket.off('data', onProxyData);
                            // CONNECT successful, now create TLS tunnel to target
                            if (process.argv.includes('--debug')) {
                                console.log(`HTTP Client: Proxy CONNECT successful, establishing TLS tunnel to ${urlObj.hostname}...`);
                            }
                            // The remaining data after headers is the start of the TLS handshake
                            const remainingData = connectResponseBuffer.subarray(headerEnd + 4);
                            // Create TLS connection to target over the proxy tunnel
                            const targetTlsOptions = {
                                socket: proxyTlsSocket,
                                servername: urlObj.hostname,
                            };
                            // Apply SSL config for target connection
                            if (this.httpsAgent) {
                                const agentOptions = this.httpsAgent.options;
                                if (agentOptions) {
                                    targetTlsOptions.rejectUnauthorized = agentOptions.rejectUnauthorized !== false;
                                    if (agentOptions.ca) {
                                        targetTlsOptions.ca = agentOptions.ca;
                                    }
                                    if (agentOptions.cert) {
                                        targetTlsOptions.cert = agentOptions.cert;
                                    }
                                    if (agentOptions.key) {
                                        targetTlsOptions.key = agentOptions.key;
                                    }
                                }
                            }
                            else if (this.sslConfig) {
                                targetTlsOptions.rejectUnauthorized = this.sslConfig.rejectUnauthorized !== false;
                            }
                            else {
                                targetTlsOptions.rejectUnauthorized = true;
                            }
                            // After CONNECT succeeds, the tunnel is established over the TLS connection to the proxy.
                            // The proxy will forward all subsequent data to the target.
                            // We can now create a TLS connection to the target using the proxy TLS socket.
                            // The proxy will forward the TLS handshake bytes to the target.
                            // Remove any buffered data (the CONNECT response headers)
                            // The remaining data after headers should be empty for a successful CONNECT
                            if (remainingData.length > 0 && process.argv.includes('--debug')) {
                                console.log(`HTTP Client: Warning: ${remainingData.length} bytes of data after CONNECT response headers`);
                            }
                            // Now create TLS connection to target over the tunnel
                            // We use the proxy TLS socket directly - the proxy will forward the TLS handshake
                            const targetTlsSocket = tls.connect(targetTlsOptions);
                            if (process.argv.includes('--debug')) {
                                console.log(`HTTP Client: Creating TLS connection to target ${urlObj.hostname} over proxy tunnel...`);
                            }
                            // Preserve any buffered tunnel bytes that arrived together with CONNECT response.
                            // They must be re-injected for the nested TLS socket to consume.
                            if (remainingData.length > 0) {
                                proxyTlsSocket.unshift(remainingData);
                            }
                            // Use the same request/response handling logic as the HTTP proxy case
                            this.handleTunneledRequest(targetTlsSocket, urlObj, options, resolve, reject, timeoutId);
                        }
                    }
                };
                proxyTlsSocket.on('data', onProxyData);
                proxyTlsSocket.on('error', (error) => {
                    if (timeoutId)
                        clearTimeout(timeoutId);
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: Proxy TLS connection error:`, error.message);
                    }
                    reject(new Error(`Proxy TLS connection failed: ${error.message}`));
                });
                // Set timeout
                let timeoutId = setTimeout(() => {
                    proxyTlsSocket.destroy();
                    reject(new Error(`Proxy request timeout after ${this.requestTimeout}ms`));
                }, this.requestTimeout);
                return; // Exit early for HTTPS proxy
            }
            // For HTTP proxy, use standard CONNECT method
            const connectOptions = {
                hostname: proxy.host,
                port: proxy.port,
                method: 'CONNECT',
                path: connectPath,
                headers: {
                    'Host': connectPath,
                    ...(proxyAuth ? { 'Proxy-Authorization': `Basic ${proxyAuth}` } : {}),
                },
            };
            let timeoutId;
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: Initiating CONNECT request to proxy ${proxy.host}:${proxy.port} for ${connectPath}`);
            }
            const connectReq = proxyProtocol.request(connectOptions);
            connectReq.on('connect', (connectRes, socket, head) => {
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Proxy CONNECT response received: ${connectRes.statusCode} ${connectRes.statusMessage}`);
                    console.log(`HTTP Client: Response headers:`, connectRes.headers);
                }
                if (connectRes.statusCode !== 200) {
                    if (timeoutId)
                        clearTimeout(timeoutId);
                    const errorMsg = `Proxy CONNECT failed: ${connectRes.statusCode} ${connectRes.statusMessage}`;
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: ${errorMsg}`);
                    }
                    socket.destroy();
                    reject(new Error(errorMsg));
                    return;
                }
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Proxy CONNECT successful, establishing TLS tunnel...`);
                }
                // Tunnel established, now make the actual HTTPS request over the tunneled socket
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Socket obtained from CONNECT response, creating TLS connection...`);
                    if (head.length > 0) {
                        console.log(`HTTP Client: CONNECT head contains ${head.length} bytes, preserving for TLS tunnel`);
                    }
                }
                if (head.length > 0) {
                    socket.unshift(head);
                }
                // Create TLS connection over the tunneled socket
                // Use SSL config if available (for SSL termination scenarios)
                const tlsOptions = {
                    socket: socket,
                    servername: urlObj.hostname,
                };
                // Apply SSL config if available
                if (this.httpsAgent) {
                    const agentOptions = this.httpsAgent.options;
                    if (agentOptions) {
                        tlsOptions.rejectUnauthorized = agentOptions.rejectUnauthorized !== false;
                        if (agentOptions.ca) {
                            tlsOptions.ca = agentOptions.ca;
                        }
                        if (agentOptions.cert) {
                            tlsOptions.cert = agentOptions.cert;
                        }
                        if (agentOptions.key) {
                            tlsOptions.key = agentOptions.key;
                        }
                    }
                }
                else if (this.sslConfig) {
                    // Apply SSL config directly if available (even without agent)
                    tlsOptions.rejectUnauthorized = this.sslConfig.rejectUnauthorized !== false;
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: TLS tunnel - rejectUnauthorized=${tlsOptions.rejectUnauthorized} (from sslConfig)`);
                    }
                    // Note: CA, cert, key would need to be loaded from files if needed
                    // For now, we only apply rejectUnauthorized from sslConfig
                }
                else {
                    tlsOptions.rejectUnauthorized = true; // Default to true if no SSL config
                    if (process.argv.includes('--debug')) {
                        console.log('HTTP Client: TLS tunnel - rejectUnauthorized=true (default, no SSL config)');
                    }
                }
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Creating TLS tunnel to ${urlObj.hostname} with rejectUnauthorized=${tlsOptions.rejectUnauthorized}`);
                }
                const tlsSocket = tls.connect(tlsOptions);
                this.handleTunneledRequest(tlsSocket, urlObj, options, resolve, reject, timeoutId);
            });
            // Handle connection errors to the proxy
            connectReq.on('error', (error) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Proxy CONNECT request error:`, error.message);
                    console.log(`HTTP Client: Error stack:`, error.stack);
                }
                reject(new Error(`Proxy CONNECT failed: ${error.message}`));
            });
            // Handle socket connection (before CONNECT response)
            connectReq.on('socket', (socket) => {
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Socket assigned to CONNECT request`);
                }
                socket.on('connect', () => {
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: Socket connected to proxy`);
                    }
                });
                // For HTTPS proxy, wait for TLS handshake to complete
                if (proxy.protocol === 'https' && 'authorized' in socket) {
                    const tlsSocket = socket;
                    tlsSocket.on('secureConnect', () => {
                        if (process.argv.includes('--debug')) {
                            console.log(`HTTP Client: TLS handshake to proxy completed, authorized: ${tlsSocket.authorized}`);
                        }
                    });
                }
                socket.on('error', (error) => {
                    if (timeoutId)
                        clearTimeout(timeoutId);
                    if (process.argv.includes('--debug')) {
                        console.log(`HTTP Client: Socket error:`, error.message);
                    }
                    reject(new Error(`Socket error: ${error.message}`));
                });
            });
            // Also listen for response events to catch any early errors
            connectReq.on('response', (response) => {
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Received response event (this shouldn't happen for CONNECT): ${response.statusCode}`);
                }
            });
            // Set timeout for the entire operation (CONNECT + TLS + HTTP request/response)
            // Note: tlsSocket is defined inside the callback, so we can't access it here
            // The timeout will destroy the CONNECT request, which should cascade to the TLS socket
            timeoutId = setTimeout(() => {
                if (process.argv.includes('--debug')) {
                    console.log(`HTTP Client: Request timeout after ${this.requestTimeout}ms - destroying CONNECT request`);
                }
                connectReq.destroy();
                reject(new Error(`Proxy request timeout after ${this.requestTimeout}ms`));
            }, this.requestTimeout);
            if (process.argv.includes('--debug')) {
                console.log(`HTTP Client: Sending CONNECT request...`);
            }
            connectReq.end();
        });
    }
    /**
     * Fetch HTTP request via proxy (for non-HTTPS URLs)
     */
    async fetchHttpViaProxy(url, options = {}) {
        const urlObj = new url_1.URL(url);
        const proxy = this.proxyConfig;
        const proxyProtocol = proxy.protocol === 'https' ? https : http;
        return new Promise((resolve, reject) => {
            const proxyAuth = proxy.auth
                ? Buffer.from(`${proxy.auth.username}:${proxy.auth.password}`).toString('base64')
                : undefined;
            const requestOptions = {
                hostname: proxy.host,
                port: proxy.port,
                method: options.method || 'GET',
                path: url, // Full URL for HTTP proxy
                headers: {
                    ...options.headers,
                    'Host': urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : ''),
                    ...(proxyAuth ? { 'Proxy-Authorization': `Basic ${proxyAuth}` } : {}),
                },
                timeout: this.requestTimeout,
            };
            let timeoutId;
            const req = proxyProtocol.request(requestOptions, (res) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                const chunks = [];
                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    const body = Buffer.concat(chunks);
                    const response = new Response(body, {
                        status: res.statusCode || 200,
                        statusText: res.statusMessage || 'OK',
                        headers: res.headers,
                    });
                    resolve(response);
                });
            });
            req.on('error', (error) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                reject(error);
            });
            timeoutId = setTimeout(() => {
                req.destroy();
                reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
            }, this.requestTimeout);
            if (options.body) {
                if (typeof options.body === 'string') {
                    req.write(options.body);
                }
                else if (options.body instanceof ArrayBuffer) {
                    req.write(Buffer.from(options.body));
                }
                else if (options.body instanceof Uint8Array) {
                    req.write(Buffer.from(options.body));
                }
                else {
                    req.write(String(options.body));
                }
            }
            req.end();
        });
    }
    /**
     * Fetch using HTTPS agent (direct connection with SSL config)
     */
    async fetchWithHttpsAgent(url, options = {}) {
        const urlObj = new url_1.URL(url);
        return new Promise((resolve, reject) => {
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers,
                agent: this.httpsAgent,
                timeout: this.requestTimeout,
            };
            let timeoutId;
            const req = https.request(requestOptions, (res) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                const chunks = [];
                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    const body = Buffer.concat(chunks);
                    // Handle redirects if redirect: 'follow' is set
                    if (options.redirect === 'follow' && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
                        const location = res.headers.location;
                        if (location) {
                            const redirectUrl = new url_1.URL(location, url);
                            return this.fetch(redirectUrl.toString(), options)
                                .then(resolve)
                                .catch(reject);
                        }
                    }
                    const response = new Response(body, {
                        status: res.statusCode || 200,
                        statusText: res.statusMessage || 'OK',
                        headers: res.headers,
                    });
                    resolve(response);
                });
            });
            req.on('error', (error) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                reject(error);
            });
            timeoutId = setTimeout(() => {
                req.destroy();
                reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
            }, this.requestTimeout);
            if (options.body) {
                if (typeof options.body === 'string') {
                    req.write(options.body);
                }
                else if (options.body instanceof ArrayBuffer) {
                    req.write(Buffer.from(options.body));
                }
                else if (options.body instanceof Uint8Array) {
                    req.write(Buffer.from(options.body));
                }
                else {
                    req.write(String(options.body));
                }
            }
            req.end();
        });
    }
}
exports.HttpClient = HttpClient;
// Export singleton instance
exports.httpClient = new HttpClient();
