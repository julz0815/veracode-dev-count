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
exports.GitHubSystem = void 0;
const rest_1 = require("@octokit/rest");
const rate_limiter_1 = require("../common/rate-limiter");
const XLSX = __importStar(require("xlsx"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class GitHubSystem {
    constructor() {
        this.includedRepos = new Set();
    }
    async setConfig(config) {
        this.config = config;
        // Initialize rate limiter with config
        this.rateLimiter = new rate_limiter_1.RateLimiter(config.rateLimit);
        this.client = new rest_1.Octokit({
            auth: config.token,
            baseUrl: config.domain,
            userAgent: 'github-contributor-counter',
            request: {
                timeout: 30000, // Increase timeout to 30 seconds
                retries: 0, // We'll handle retries with our rate limiter
                retryAfter: 0
            }
        });
        // Ensure contributors directory exists
        const contributorsDir = path.join(process.cwd(), 'contributors');
        await fs.mkdir(contributorsDir, { recursive: true });
        // Read Excel file and populate includedRepos
        const filePath = path.join(contributorsDir, 'repositories-github.xlsx');
        try {
            // Check if file exists
            try {
                await fs.access(filePath);
            }
            catch {
                // File doesn't exist, create an empty one
                if (process.argv.includes('--debug')) {
                    console.log('--------------------------------');
                    console.log('Creating empty repositories-github.xlsx file');
                    console.log('--------------------------------');
                }
                const workbook = XLSX.utils.book_new();
                const worksheet = XLSX.utils.aoa_to_sheet([
                    ['Organization', 'Repository', 'Path', 'Include'],
                    ['', '', '', '']
                ]);
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Repositories');
                XLSX.writeFile(workbook, filePath);
            }
            // Now read the file (either existing or newly created)
            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(worksheet);
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log('Excel data structure:');
                console.log(data[0]); // Log first row to see the structure
                console.log('--------------------------------');
            }
            for (const repo of data) {
                if (process.argv.includes('--debug')) {
                    console.log(`Processing repo: ${repo.Organization}/${repo.Repository}, Include value: ${repo.Include}`);
                }
                if (repo.Include?.toUpperCase() === 'Y') {
                    this.includedRepos.add(repo.Path);
                }
            }
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log('Included repositories from Excel:');
                console.log(this.includedRepos);
                console.log('--------------------------------');
            }
        }
        catch (error) {
            console.error('Error reading Excel file:', error);
            throw new Error('Failed to read repositories-GitHub.xlsx file');
        }
    }
    async getRepos() {
        const repos = [];
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log('Fetching repositories from GitHub');
            console.log('--------------------------------');
        }
        try {
            const response = await this.rateLimiter.executeWithRateLimit(async () => {
                const result = await this.client.paginate(this.client.rest.repos.listForAuthenticatedUser, {
                    per_page: 100,
                    sort: 'updated',
                    direction: 'desc',
                    affiliation: 'owner,collaborator,organization_member'
                });
                // Update rate limiter with response headers if available
                // Note: Octokit doesn't expose headers directly in paginate, but we can check the last response
                return result;
            });
            for (const repo of response) {
                if (process.argv.includes('--debug')) {
                    console.log(`Processing repository: ${repo.full_name}`);
                }
                // Skip archived repositories
                if (repo.archived) {
                    if (process.argv.includes('--debug')) {
                        console.log(`Skipping archived repository: ${repo.full_name}`);
                    }
                    continue;
                }
                // Skip forks if configured
                if (this.config.skipForks && repo.fork) {
                    if (process.argv.includes('--debug')) {
                        console.log(`Skipping forked repository: ${repo.full_name}`);
                    }
                    continue;
                }
                // Skip private repositories if configured
                if (this.config.skipPrivate && repo.private) {
                    if (process.argv.includes('--debug')) {
                        console.log(`Skipping private repository: ${repo.full_name}`);
                    }
                    continue;
                }
                repos.push({
                    name: repo.name,
                    org: repo.owner.login,
                    path: `${repo.owner.login}/${repo.name}`,
                    platform: 'GitHub'
                });
            }
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log(`Total repositories to process: ${repos.length}`);
                console.log('--------------------------------');
            }
            return repos;
        }
        catch (error) {
            console.error('Error fetching repositories:', error);
            throw error;
        }
    }
    async getContributors(repo) {
        // Check if repository should be included based on Excel file
        if (!this.includedRepos.has(repo.path)) {
            if (process.argv.includes('--debug')) {
                console.log(`Skipping repository ${repo.path} as it is not marked for inclusion in Excel file`);
            }
            return [];
        }
        const commits = [];
        const [owner, repoName] = repo.path.split('/');
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Fetching contributors for repository: ${repo.path}`);
            console.log('--------------------------------');
        }
        try {
            const response = await this.rateLimiter.executeWithRateLimit(async () => {
                const result = await this.client.paginate(this.client.rest.repos.listCommits, {
                    owner,
                    repo: repoName,
                    per_page: 100,
                    since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // Last 90 days
                });
                return result;
            });
            if (process.argv.includes('--debug')) {
                console.log(`Found ${response.length} commits`);
            }
            for (const commit of response) {
                if (process.argv.includes('--debug')) {
                    console.log(`Processing commit: ${commit.sha}`);
                }
                commits.push({
                    commit: {
                        author: {
                            email: commit.commit.author?.email || '',
                            name: commit.commit.author?.name || ''
                        }
                    }
                });
            }
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log(`Total commits processed: ${commits.length}`);
                console.log('--------------------------------');
            }
            return commits;
        }
        catch (error) {
            console.error(`Error fetching commits for ${repo.path}:`, error);
            throw error;
        }
    }
    async getCommits(repo) {
        if (process.argv.includes('--debug')) {
            /*
            console.log('--------------------------------');
            console.log(`Included Repos`);
            console.log(this.includedRepos);
            console.log('--------------------------------');
            */
        }
        // Check if repository should be included based on Excel file
        if (!this.includedRepos.has(repo.path)) {
            if (process.argv.includes('--debug')) {
                console.log(`Skipping repository ${repo.path} as it is not marked for inclusion in Excel file`);
            }
            return [];
        }
        const commits = [];
        const [owner, repoName] = repo.path.split('/');
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Fetching commits for repository: ${repo.path}`);
            console.log('--------------------------------');
        }
        try {
            // Show rate limit status
            const status = this.rateLimiter.getStatus();
            if (process.argv.includes('--debug')) {
                console.log(`Rate limit status: ${status.requestsInLastHour} requests in last hour, can make request: ${status.canMakeRequest}`);
            }
            const response = await this.rateLimiter.executeWithRateLimit(async () => {
                console.log(`Fetching commits for ${repo.path}...`);
                const result = await this.client.paginate(this.client.rest.repos.listCommits, {
                    owner,
                    repo: repoName,
                    per_page: 100,
                    since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // Last 90 days
                });
                return result;
            });
            if (process.argv.includes('--debug')) {
                console.log(`Found ${response.length} commits`);
            }
            for (const commit of response) {
                if (process.argv.includes('--debug')) {
                    console.log(`Processing commit: ${commit.sha}`);
                }
                commits.push({
                    sha: commit.sha,
                    message: commit.commit.message,
                    date: commit.commit.author?.date || '',
                    author: {
                        name: commit.commit.author?.name || '',
                        email: commit.commit.author?.email || ''
                    }
                });
            }
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log(`Total commits processed: ${commits.length}`);
                console.log('--------------------------------');
            }
            return commits;
        }
        catch (error) {
            console.error(`Error fetching commits for ${repo.path}:`, error);
            throw error;
        }
    }
}
exports.GitHubSystem = GitHubSystem;
