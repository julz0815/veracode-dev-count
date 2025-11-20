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
exports.GitLabSystem = void 0;
const http_client_1 = require("../common/http-client");
const ExcelJS = __importStar(require("exceljs"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class GitLabSystem {
    constructor() {
        this.baseUrl = '';
        this.requestDelay = 1000; // 1 second delay between requests
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds delay between retries
        this.includedRepos = new Set();
    }
    async setConfig(config) {
        this.config = config;
        this.baseUrl = config.domain.replace(/\/api\/v4$/, '').replace(/\/$/, '');
        // Ensure contributors directory exists
        const contributorsDir = path.join(process.cwd(), 'contributors');
        await fs.mkdir(contributorsDir, { recursive: true });
        // Read Excel file and populate includedRepos
        const filePath = path.join(contributorsDir, 'repositories-gitlab.xlsx');
        try {
            // Check if file exists
            try {
                await fs.access(filePath);
            }
            catch {
                // File doesn't exist, create an empty one
                if (process.argv.includes('--debug')) {
                    console.log('--------------------------------');
                    console.log('Creating empty repositories-gitlab.xlsx file');
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
                console.log(Array.from(this.includedRepos));
                console.log('--------------------------------');
            }
        }
        catch (error) {
            console.error('Error reading Excel file:', error);
            throw new Error('Failed to read repositories-gitlab.xlsx file');
        }
    }
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async fetchGitLab(endpoint, retryCount = 0) {
        const cleanEndpoint = endpoint.replace(/^\/api\/v4/, '');
        try {
            // Use centralized HTTP client (handles SSL and proxy globally)
            const response = await http_client_1.httpClient.fetch(`${this.baseUrl}/api/v4${cleanEndpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.config.token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid GitLab token. Please verify your token is correct and has the necessary permissions.');
                }
                // Check for rate limit headers
                const retryAfter = response.headers.get('Retry-After');
                if (retryAfter && retryCount < this.maxRetries) {
                    const delayTime = parseInt(retryAfter) * 1000 || this.retryDelay;
                    console.log(`Rate limit hit, waiting ${delayTime / 1000} seconds before retry ${retryCount + 1}/${this.maxRetries}`);
                    await this.delay(delayTime);
                    return this.fetchGitLab(endpoint, retryCount + 1);
                }
                throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
            }
            return response.json();
        }
        catch (error) {
            if (retryCount < this.maxRetries) {
                console.log(`Request failed, retrying in ${this.retryDelay / 1000} seconds (${retryCount + 1}/${this.maxRetries})`);
                await this.delay(this.retryDelay);
                return this.fetchGitLab(endpoint, retryCount + 1);
            }
            throw error;
        }
    }
    async getRepos() {
        const repos = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            try {
                const projects = await this.fetchGitLab(`/projects?membership=true&per_page=100&page=${page}`);
                if (projects.length === 0) {
                    hasMore = false;
                    continue;
                }
                for (const project of projects) {
                    if (!project.archived) {
                        const [org, name] = project.path_with_namespace.split('/');
                        repos.push({
                            name,
                            org,
                            path: project.path_with_namespace,
                            platform: 'GitLab',
                        });
                    }
                }
                page++;
                hasMore = projects.length === 100;
                // Add delay between pagination requests
                if (hasMore) {
                    if (process.argv.includes('--debug')) {
                        console.log(`Waiting ${this.requestDelay / 1000} seconds before next page of repositories...`);
                    }
                    await this.delay(this.requestDelay);
                }
            }
            catch (error) {
                console.error('Error fetching repositories:', error);
                hasMore = false;
            }
        }
        return repos;
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
        let page = 1;
        let hasMore = true;
        // Calculate date 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const sinceDate = ninetyDaysAgo.toISOString();
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Fetching contributors for repository: ${repo.path}`);
            console.log('--------------------------------');
        }
        while (hasMore) {
            try {
                const response = await this.fetchGitLab(`/projects/${encodeURIComponent(repo.path)}/repository/commits?per_page=100&page=${page}&since=${sinceDate}`);
                if (process.argv.includes('--debug')) {
                    console.log(`Found ${response.length} commits for ${repo.path}`);
                }
                if (response.length === 0) {
                    hasMore = false;
                    continue;
                }
                commits.push(...response);
                page++;
                hasMore = response.length === 100;
                // Add delay between pagination requests
                if (hasMore) {
                    if (process.argv.includes('--debug')) {
                        console.log(`Waiting ${this.requestDelay / 1000} seconds before next page of commits...`);
                    }
                    await this.delay(this.requestDelay);
                }
            }
            catch (error) {
                console.error(`Error fetching commits for ${repo.path}:`, error);
                hasMore = false;
            }
        }
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Total commits processed: ${commits.length}`);
            console.log('--------------------------------');
        }
        return commits;
    }
    async getCommits(repo) {
        return this.getContributors(repo);
    }
}
exports.GitLabSystem = GitLabSystem;
