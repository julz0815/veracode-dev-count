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
        commits.forEach(commit => {
            let name;
            let email;
            switch (ciSystem.toLowerCase()) {
                case 'github':
                    // Handle both nested and flat commit structures
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
            const key = `${name}:${email}`;
            if (!contributorMap.has(key)) {
                contributorMap.set(key, { name, email, commits: 0 });
            }
            contributorMap.get(key).commits++;
        });
        return Array.from(contributorMap.values());
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
        // Handle Azure DevOps special case for system name
        let ciSystem = tabName.split(' ')[0].toLowerCase();
        if (ciSystem === 'azure') {
            ciSystem = 'azuredevops';
        }
        const worksheet = workbook.addWorksheet(tabName);
        // Set up the columns
        worksheet.columns = [
            { header: 'Repository', key: 'repo', width: 50 },
            { header: 'Committer', key: 'committer', width: 40 },
            { header: 'Email', key: 'email', width: 40 }
        ];
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Writing detailed tab for system: ${ciSystem}`);
            console.log(`Looking for repositories file: repositories-${ciSystem}.xlsx`);
            console.log('--------------------------------');
        }
        // Read all repositories for this CI system
        try {
            const reposFile = path.join(this.contributorsDir, `repositories-${ciSystem}.xlsx`);
            const reposWorkbook = new exceljs_1.default.Workbook();
            await reposWorkbook.xlsx.readFile(reposFile);
            const reposSheet = reposWorkbook.getWorksheet('Repositories');
            if (!reposSheet) {
                console.log(`No repository data found for ${ciSystem}`);
                return;
            }
            // Process each repository
            for (let rowNumber = 2; rowNumber <= reposSheet.rowCount; rowNumber++) {
                const row = reposSheet.getRow(rowNumber);
                const include = row.getCell(5).value?.toString().toUpperCase();
                if (include === 'Y') {
                    const repoPath = row.getCell(3).value?.toString() || '';
                    try {
                        // Read commits file
                        const commitsFile = path.join(this.contributorsDir, ciSystem, repoPath.replace(/\//g, '_'), 'commits.json');
                        if (process.argv.includes('--debug')) {
                            console.log(`Reading commits from: ${commitsFile}`);
                        }
                        const commitsData = await fs.readFile(commitsFile, 'utf-8');
                        const commits = JSON.parse(commitsData);
                        if (process.argv.includes('--debug') && ciSystem === 'azuredevops') {
                            console.log('--------------------------------');
                            console.log(`Processing commits for ${repoPath}`);
                            console.log('Number of commits found:', commits.length);
                            console.log('First commit structure:', commits[0]);
                            console.log('--------------------------------');
                        }
                        // Extract unique committers with their emails
                        const committers = new Map();
                        commits.forEach((commit) => {
                            let committerName = '';
                            let committerEmail = '';
                            if (process.argv.includes('--debug') && ciSystem === 'azuredevops') {
                                console.log('Processing commit:', commit);
                            }
                            switch (ciSystem) {
                                case 'github':
                                    committerName = commit.commit?.author?.name || commit.author?.name || '';
                                    committerEmail = commit.commit?.author?.email || commit.author?.email || '';
                                    break;
                                case 'gitlab':
                                    committerName = commit.author_name || '';
                                    committerEmail = commit.author_email || '';
                                    break;
                                case 'azuredevops':
                                    committerName = commit.author?.name || '';
                                    committerEmail = commit.author?.email || '';
                                    if (process.argv.includes('--debug')) {
                                        console.log('Azure DevOps commit author:', commit.author);
                                        console.log(`Extracted name: ${committerName}, email: ${committerEmail}`);
                                    }
                                    break;
                            }
                            if (committerName) {
                                committers.set(committerName, { name: committerName, email: committerEmail });
                                if (process.argv.includes('--debug')) {
                                    console.log(`Added committer: ${committerName} with email: ${committerEmail}`);
                                }
                            }
                        });
                        // Add repository and its committers
                        let isFirstCommitter = true;
                        for (const committer of committers.values()) {
                            worksheet.addRow({
                                repo: isFirstCommitter ? repoPath : '',
                                committer: committer.name,
                                email: committer.email
                            });
                            if (process.argv.includes('--debug')) {
                                console.log(`Added row to worksheet: ${isFirstCommitter ? repoPath : ''} | ${committer.name} | ${committer.email}`);
                            }
                            isFirstCommitter = false;
                        }
                    }
                    catch (error) {
                        console.error(`Error processing commits for ${repoPath}:`, error);
                    }
                }
            }
        }
        catch (error) {
            console.error(`Error reading repository data for ${ciSystem}:`, error);
        }
    }
    async evaluateContributors(repos, ciSystem) {
        const repoContributors = [];
        const systemContributorMap = new Map();
        const allContributorMap = new Map();
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Evaluating contributors for system: ${ciSystem}`);
            console.log(`Number of repositories to process: ${repos.length}`);
            console.log('--------------------------------');
        }
        for (const repo of repos) {
            const commits = await this.readCommits(ciSystem, repo);
            if (process.argv.includes('--debug')) {
                console.log(`Found ${commits.length} commits for repository ${repo.path}`);
            }
            const contributors = this.extractContributors(commits, ciSystem);
            if (process.argv.includes('--debug')) {
                console.log(`Extracted ${contributors.length} contributors from repository ${repo.path}`);
            }
            repoContributors.push({
                repo: repo.path,
                contributors
            });
            // Aggregate for system-wide contributors
            contributors.forEach(contributor => {
                const key = `${contributor.name}:${contributor.email}`;
                if (!systemContributorMap.has(key)) {
                    systemContributorMap.set(key, { ...contributor });
                    if (process.argv.includes('--debug')) {
                        console.log(`Added new contributor to system map: ${contributor.name} (${contributor.email})`);
                    }
                }
                else {
                    systemContributorMap.get(key).commits += contributor.commits;
                    if (process.argv.includes('--debug')) {
                        console.log(`Updated commits for existing contributor: ${contributor.name}`);
                    }
                }
                // Also track in the all contributors map
                if (!allContributorMap.has(key)) {
                    allContributorMap.set(key, { ...contributor });
                }
                else {
                    allContributorMap.get(key).commits += contributor.commits;
                }
            });
        }
        // Update summary based on CI system
        const normalizedSystem = ciSystem.toLowerCase();
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log(`Updating summary for system: ${normalizedSystem}`);
            console.log(`Number of contributors found: ${systemContributorMap.size}`);
            console.log(`Number of repositories processed: ${repos.length}`);
            console.log('--------------------------------');
        }
        switch (normalizedSystem) {
            case 'gitlab':
                this.summary.gitlabContributors = systemContributorMap.size;
                this.summary.selectedRepos.gitlab = repos.length;
                this.summary.totalRepos.gitlab = repos.length;
                break;
            case 'github':
                this.summary.githubContributors = systemContributorMap.size;
                this.summary.selectedRepos.github = repos.length;
                this.summary.totalRepos.github = repos.length;
                break;
            case 'azuredevops':
                this.summary.azureDevOpsContributors = systemContributorMap.size;
                this.summary.selectedRepos.azureDevOps = repos.length;
                this.summary.totalRepos.azureDevOps = repos.length;
                if (process.argv.includes('--debug')) {
                    console.log('Updated Azure DevOps summary:', {
                        contributors: this.summary.azureDevOpsContributors,
                        repos: this.summary.selectedRepos.azureDevOps,
                        totalRepos: this.summary.totalRepos.azureDevOps
                    });
                }
                break;
        }
        // Calculate total unique contributors across all systems
        this.summary.totalUniqueContributors =
            this.summary.gitlabContributors +
                this.summary.githubContributors +
                this.summary.azureDevOpsContributors;
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log('Updated total unique contributors:', {
                gitlab: this.summary.gitlabContributors,
                github: this.summary.githubContributors,
                azureDevOps: this.summary.azureDevOpsContributors,
                total: this.summary.totalUniqueContributors
            });
            console.log('Updated total repositories:', {
                gitlab: this.summary.totalRepos.gitlab,
                github: this.summary.totalRepos.github,
                azureDevOps: this.summary.totalRepos.azureDevOps
            });
            console.log('--------------------------------');
        }
        // Write the summary after each system is processed
        await this.writeSummary();
        return {
            repoContributors,
            systemContributors: {
                system: ciSystem,
                contributors: Array.from(systemContributorMap.values())
            }
        };
    }
}
exports.EvaluationService = EvaluationService;
