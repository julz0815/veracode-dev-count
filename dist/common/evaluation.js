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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvaluationService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
class EvaluationService {
    constructor() {
        this.config = null;
        this.regexPatterns = new Map();
        this.contributorsDir = path.join(process.cwd(), 'contributors');
        const now = new Date();
        this.summary = {
            dateOfReport: now.toLocaleDateString(),
            timeOfReport: now.toLocaleTimeString(),
            gitlabContributors: 0,
            githubContributors: 0,
            azureDevOpsContributors: 0,
            totalUniqueContributors: 0,
            selectedRepos: {
                gitlab: 0,
                github: 0,
                azureDevOps: 0
            },
            totalRepos: {
                gitlab: 0,
                github: 0,
                azureDevOps: 0
            }
        };
    }
    setConfig(config) {
        this.config = config;
        const ciSystem = config.ciSystem.toLowerCase();
        this.regexPatterns.set(ciSystem, []);
        // Add regex from pattern if provided
        if (config.regexPattern) {
            try {
                // Remove leading/trailing slashes and flags, then add case-insensitive flag
                const pattern = config.regexPattern.replace(/^\/|\/[a-z]*$/g, '');
                const regex = new RegExp(pattern, 'i');
                this.regexPatterns.get(ciSystem).push(regex);
            }
            catch (error) {
                console.error('Invalid regex pattern:', error);
            }
        }
        // Add regexes from file if provided
        if (config.regexFile) {
            this.loadRegexFromFile(config.regexFile, ciSystem);
        }
    }
    async loadRegexFromFile(filePath, ciSystem) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const patterns = content.split('\n').filter(line => line.trim());
            patterns.forEach(pattern => {
                try {
                    // Remove leading/trailing slashes and flags, then add case-insensitive flag
                    const cleanPattern = pattern.replace(/^\/|\/[a-z]*$/g, '');
                    const regex = new RegExp(cleanPattern, 'i');
                    this.regexPatterns.get(ciSystem).push(regex);
                }
                catch (error) {
                    console.error(`Invalid regex pattern in file: ${pattern}`, error);
                }
            });
        }
        catch (error) {
            console.error('Error reading regex file:', error);
        }
    }
    isExcludedEmail(email, ciSystem) {
        if (!email)
            return false;
        const patterns = this.regexPatterns.get(ciSystem.toLowerCase());
        if (!patterns)
            return false;
        return patterns.some(regex => regex.test(email));
    }
    async readCommits(ciSystem, repo) {
        const filePath = path.join(this.contributorsDir, ciSystem.toLowerCase(), repo.path.replace(/\//g, '_'), 'commits.json');
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error(`Error reading commits for ${repo.path}:`, error);
            return [];
        }
    }
    extractContributors(commits, ciSystem) {
        const contributorMap = new Map();
        const removedContributorMap = new Map();
        commits.forEach(commit => {
            let name;
            let email;
            switch (ciSystem.toLowerCase()) {
                case 'github':
                    if (commit.commit && commit.commit.author) {
                        name = commit.commit.author.name;
                        email = commit.commit.author.email;
                    }
                    else if (commit.author) {
                        name = commit.author.name;
                        email = commit.author.email;
                    }
                    else {
                        console.warn(`Invalid commit structure for GitHub: ${JSON.stringify(commit)}`);
                        return;
                    }
                    break;
                case 'gitlab':
                    name = commit.author_name;
                    email = commit.author_email;
                    break;
                case 'azuredevops':
                    name = commit.author.name;
                    email = commit.author.email;
                    break;
                default:
                    return;
            }
            if (!name || !email) {
                // If name exists but email is missing, put in removedContributorMap
                if (name && !email) {
                    const key = `${name}:`;
                    const contributor = { name, email: '', commits: 0 };
                    if (!removedContributorMap.has(key)) {
                        removedContributorMap.set(key, contributor);
                    }
                    removedContributorMap.get(key).commits++;
                }
                // Otherwise, skip
                return;
            }
            // Normalize email to lowercase
            const normalizedEmail = email.toLowerCase();
            const key = `${name}:${normalizedEmail}`;
            const contributor = { name, email: normalizedEmail, commits: 0 };
            if (this.isExcludedEmail(normalizedEmail, ciSystem)) {
                if (!removedContributorMap.has(key)) {
                    removedContributorMap.set(key, contributor);
                }
                removedContributorMap.get(key).commits++;
            }
            else {
                if (!contributorMap.has(key)) {
                    contributorMap.set(key, contributor);
                }
                contributorMap.get(key).commits++;
            }
        });
        return {
            contributors: Array.from(contributorMap.values()),
            removedContributors: Array.from(removedContributorMap.values())
        };
    }
    async writeSummary() {
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('SCM Report Summary');
        // Set up the headers and data
        worksheet.columns = [
            { header: 'SCM Report Summary', key: 'metric', width: 40 },
            { header: '', key: 'value', width: 20 },
            { header: 'Selected Repositories', key: 'selected', width: 20 },
            { header: 'Total Repositories', key: 'total', width: 20 }
        ];
        // Add date and time
        worksheet.addRow({ metric: 'Date of report', value: this.summary.dateOfReport });
        worksheet.addRow({ metric: 'Time of report', value: this.summary.timeOfReport });
        // Add contributor counts
        worksheet.addRow({
            metric: 'Total unique contributors across GitLab',
            value: this.summary.gitlabContributors,
            selected: this.summary.selectedRepos.gitlab,
            total: this.summary.totalRepos.gitlab
        });
        worksheet.addRow({
            metric: 'Total unique contributors across GitHub',
            value: this.summary.githubContributors,
            selected: this.summary.selectedRepos.github,
            total: this.summary.totalRepos.github
        });
        worksheet.addRow({
            metric: 'Total unique contributors across Azure DevOps',
            value: this.summary.azureDevOpsContributors,
            selected: this.summary.selectedRepos.azureDevOps,
            total: this.summary.totalRepos.azureDevOps
        });
        worksheet.addRow({ metric: 'Total unique across All SCM Platforms', value: this.summary.totalUniqueContributors });
        // Add detailed tabs for each CI system if they have data
        if (this.summary.gitlabContributors > 0) {
            await this.writeDetailedTab(workbook, 'GitLab Details');
        }
        if (this.summary.githubContributors > 0) {
            await this.writeDetailedTab(workbook, 'GitHub Details');
        }
        if (this.summary.azureDevOpsContributors > 0) {
            await this.writeDetailedTab(workbook, 'Azure DevOps Details');
        }
        // Save the workbook
        const summaryPath = path.join(this.contributorsDir, 'scm_summary.xlsx');
        await workbook.xlsx.writeFile(summaryPath);
        console.log(`Summary written to ${summaryPath}`);
    }
    async writeDetailedTab(workbook, tabName) {
        let ciSystem = tabName.split(' ')[0].toLowerCase();
        if (ciSystem === 'azure') {
            ciSystem = 'azuredevops';
        }
        const worksheet = workbook.addWorksheet(tabName);
        const removedWorksheet = workbook.addWorksheet(`${tabName} - Removed`);
        // Set up the columns for both worksheets
        const columns = [
            { header: 'Repository', key: 'repo', width: 50 },
            { header: 'Committer', key: 'committer', width: 40 },
            { header: 'Email', key: 'email', width: 40 }
        ];
        worksheet.columns = columns;
        removedWorksheet.columns = columns;
        // Read all repositories for this CI system
        try {
            const repos = await this.readRepoList(ciSystem);
            for (const repo of repos) {
                const commits = await this.readCommits(ciSystem, repo);
                const { contributors, removedContributors } = this.extractContributors(commits, ciSystem);
                // Add contributors to main worksheet
                contributors.forEach(contributor => {
                    worksheet.addRow({
                        repo: repo.path,
                        committer: contributor.name,
                        email: contributor.email
                    });
                });
                // Add removed contributors to removed worksheet
                removedContributors.forEach(contributor => {
                    removedWorksheet.addRow({
                        repo: repo.path,
                        committer: contributor.name,
                        email: contributor.email
                    });
                });
            }
        }
        catch (error) {
            console.error(`Error writing detailed tab for ${ciSystem}:`, error);
        }
    }
    async evaluateContributors(repos, ciSystem) {
        const repoContributors = [];
        const systemContributors = {
            system: ciSystem,
            contributors: [],
            removedContributors: []
        };
        for (const repo of repos) {
            const commits = await this.readCommits(ciSystem, repo);
            const { contributors, removedContributors } = this.extractContributors(commits, ciSystem);
            repoContributors.push({
                repo: repo.path,
                contributors,
                removedContributors
            });
            // Add to system-wide contributors
            contributors.forEach(contributor => {
                const key = `${contributor.name}:${contributor.email}`;
                if (!systemContributors.contributors.some(c => `${c.name}:${c.email}` === key)) {
                    systemContributors.contributors.push(contributor);
                }
            });
            // Add to system-wide removed contributors
            removedContributors.forEach(contributor => {
                const key = `${contributor.name}:${contributor.email}`;
                if (!systemContributors.removedContributors.some(c => `${c.name}:${c.email}` === key)) {
                    systemContributors.removedContributors.push(contributor);
                }
            });
        }
        // Update summary counts
        const normalizedSystem = ciSystem.toLowerCase();
        switch (normalizedSystem) {
            case 'gitlab':
                this.summary.gitlabContributors = systemContributors.contributors.length;
                this.summary.selectedRepos.gitlab = repos.length;
                this.summary.totalRepos.gitlab = repos.length;
                break;
            case 'github':
                this.summary.githubContributors = systemContributors.contributors.length;
                this.summary.selectedRepos.github = repos.length;
                this.summary.totalRepos.github = repos.length;
                break;
            case 'azuredevops':
                this.summary.azureDevOpsContributors = systemContributors.contributors.length;
                this.summary.selectedRepos.azureDevOps = repos.length;
                this.summary.totalRepos.azureDevOps = repos.length;
                break;
        }
        // Calculate total unique contributors across all systems
        this.summary.totalUniqueContributors =
            this.summary.gitlabContributors +
                this.summary.githubContributors +
                this.summary.azureDevOpsContributors;
        // Write the summary after each system is processed
        await this.writeSummary();
        return { repoContributors, systemContributors };
    }
    async readRepoList(ciSystem) {
        const filePath = path.join(this.contributorsDir, `repositories-${ciSystem.toLowerCase()}.xlsx`);
        try {
            await fs.access(filePath);
        }
        catch {
            return [];
        }
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Repositories');
        if (!worksheet) {
            return [];
        }
        const repos = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Skip header row
                const include = row.getCell(5).value;
                if (include?.toString().toUpperCase() === 'Y') {
                    repos.push({
                        name: row.getCell(2).value,
                        org: row.getCell(1).value,
                        path: row.getCell(3).value,
                        platform: ciSystem
                    });
                }
            }
        });
        return repos;
    }
}
exports.EvaluationService = EvaluationService;
