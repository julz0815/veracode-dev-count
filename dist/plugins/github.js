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
const http_client_1 = require("../common/http-client");
const ExcelJS = __importStar(require("exceljs"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class GitHubSystem {
    constructor() {
        this.includedRepos = new Set();
    }
    async setConfig(config) {
        this.config = config;
        // Configure Octokit to use our global httpClient (which handles SSL, proxy, and rate limiting)
        this.client = new rest_1.Octokit({
            auth: config.token,
            baseUrl: config.domain,
            userAgent: 'github-contributor-counter',
            request: {
                timeout: 30000, // Increase timeout to 30 seconds
                retries: 0, // Rate limiting is handled globally by httpClient
                retryAfter: 0,
                // Use our global httpClient.fetch which handles SSL, proxy, and rate limiting
                fetch: http_client_1.httpClient.fetch.bind(http_client_1.httpClient)
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
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Repositories');
                worksheet.columns = [
                    { header: 'Organization', key: 'org' },
                    { header: 'Repository', key: 'name' },
                    { header: 'Path', key: 'path' },
                    { header: 'Last Updated', key: 'lastUpdated' },
                    { header: 'Include', key: 'include' }
                ];
                await workbook.xlsx.writeFile(filePath);
            }
            // Now read the file (either existing or newly created)
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            const worksheet = workbook.getWorksheet('Repositories');
            const data = [];
            if (worksheet) {
                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber > 1) { // Skip header row
                        const includeCell = row.getCell(5).value ?? row.getCell(4).value;
                        data.push({
                            Organization: row.getCell(1).value || '',
                            Repository: row.getCell(2).value || '',
                            Path: row.getCell(3).value || '',
                            Include: includeCell ? includeCell.toString() : 'Y'
                        });
                    }
                });
            }
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
                if (repo.Include?.trim().toUpperCase() === 'Y') {
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
            // Rate limiting is handled globally by httpClient.fetch
            const response = await this.client.paginate(this.client.rest.repos.listForAuthenticatedUser, {
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
                affiliation: 'owner,collaborator,organization_member'
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
            // Rate limiting is handled globally by httpClient.fetch
            const response = await this.client.paginate(this.client.rest.repos.listCommits, {
                owner,
                repo: repoName,
                per_page: 100,
                since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // Last 90 days
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
            // Rate limiting is handled globally by httpClient.fetch
            console.log(`Fetching commits for ${repo.path}...`);
            const response = await this.client.paginate(this.client.rest.repos.listCommits, {
                owner,
                repo: repoName,
                per_page: 100,
                since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // Last 90 days
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
