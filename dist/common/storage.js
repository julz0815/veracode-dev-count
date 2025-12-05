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
exports.FileStorageService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
class FileStorageService {
    constructor() {
        this.customRepositoriesFiles = new Map(); // CI system -> file path
        this.contributorsDir = path.join(process.cwd(), 'contributors');
    }
    /**
     * Set custom repositories file path for a CI system (headless mode only)
     */
    setCustomRepositoriesFile(ciSystem, filePath) {
        this.customRepositoriesFiles.set(ciSystem.toLowerCase(), filePath);
    }
    /**
     * Get the repositories file path for a CI system (returns custom path if set, otherwise default)
     */
    getRepositoriesFilePath(ciSystem) {
        const ciSystemLower = ciSystem.toLowerCase();
        if (this.customRepositoriesFiles.has(ciSystemLower)) {
            return this.customRepositoriesFiles.get(ciSystemLower);
        }
        return path.join(this.contributorsDir, `repositories-${ciSystemLower}.xlsx`);
    }
    getContributorsDir() {
        return this.contributorsDir;
    }
    async setConfig(config) {
        this.config = config;
        await fs.mkdir(this.contributorsDir, { recursive: true });
    }
    async writeRepoList(repos, ciSystem) {
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log('storage.ts - writeRepoList');
            console.log('CI System:', ciSystem);
            console.log('Filename:', `repositories-${ciSystem.toLowerCase()}.xlsx`);
            console.log('--------------------------------');
        }
        // Check if custom repositories file path is set (headless mode)
        const ciSystemLower = ciSystem.toLowerCase();
        let filename;
        if (this.customRepositoriesFiles.has(ciSystemLower)) {
            filename = this.customRepositoriesFiles.get(ciSystemLower);
            // Ensure directory exists
            const dir = path.dirname(filename);
            await fs.mkdir(dir, { recursive: true });
        }
        else {
            filename = path.join(this.contributorsDir, `repositories-${ciSystemLower}.xlsx`);
        }
        // Read existing file if it exists to preserve Include values
        const existingRepos = new Map();
        try {
            await fs.access(filename);
            const existingWorkbook = new exceljs_1.default.Workbook();
            await existingWorkbook.xlsx.readFile(filename);
            const existingWorksheet = existingWorkbook.getWorksheet('Repositories');
            if (existingWorksheet) {
                existingWorksheet.eachRow((row, rowNumber) => {
                    if (rowNumber > 1) { // Skip header row
                        const repoPath = row.getCell(3).value; // Path is in column 3
                        const include = row.getCell(5).value; // Include is in column 5
                        const lastUpdated = row.getCell(4).value; // Last Updated is in column 4
                        if (repoPath) {
                            existingRepos.set(repoPath, {
                                include: include?.toString() || 'Y',
                                lastUpdated: lastUpdated?.toString() || new Date().toISOString().split('T')[0]
                            });
                        }
                    }
                });
                if (process.argv.includes('--debug')) {
                    console.log(`Found ${existingRepos.size} existing repositories in file`);
                }
            }
        }
        catch (error) {
            // File doesn't exist yet, that's okay - we'll create a new one
            if (process.argv.includes('--debug')) {
                console.log('No existing file found, creating new one');
            }
        }
        // Create new workbook
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('Repositories');
        worksheet.columns = [
            { header: 'Organization', key: 'org', width: 20 },
            { header: 'Repository', key: 'name', width: 30 },
            { header: 'Path', key: 'path', width: 40 },
            { header: 'Last Updated', key: 'lastUpdated', width: 20 },
            { header: 'Include', key: 'include', width: 10 }
        ];
        const today = new Date().toISOString().split('T')[0];
        const newReposCount = { count: 0 };
        const updatedReposCount = { count: 0 };
        // Write repositories, preserving existing Include values
        repos.forEach(repo => {
            const existing = existingRepos.get(repo.path);
            const include = existing ? existing.include : 'Y';
            const lastUpdated = existing ? existing.lastUpdated : today;
            // Update Last Updated if this is an existing repo that was found again
            const finalLastUpdated = existing ? today : lastUpdated;
            if (existing) {
                updatedReposCount.count++;
            }
            else {
                newReposCount.count++;
            }
            worksheet.addRow({
                org: repo.org,
                name: repo.name,
                path: repo.path,
                lastUpdated: finalLastUpdated,
                include: include
            });
        });
        // Write the file
        await workbook.xlsx.writeFile(filename);
        if (newReposCount.count > 0 || updatedReposCount.count > 0) {
            console.log(`Repository list written to ${filename}`);
            if (newReposCount.count > 0) {
                console.log(`  Added ${newReposCount.count} new repository(ies)`);
            }
            if (updatedReposCount.count > 0) {
                console.log(`  Updated ${updatedReposCount.count} existing repository(ies) - preserved Include values`);
            }
        }
        else {
            console.log(`Repository list written to ${filename} (no changes)`);
        }
    }
    async readRepoList(ciSystem) {
        // Check if custom repositories file path is set (headless mode)
        const ciSystemLower = ciSystem.toLowerCase();
        let filePath;
        if (this.customRepositoriesFiles.has(ciSystemLower)) {
            filePath = this.customRepositoriesFiles.get(ciSystemLower);
        }
        else {
            filePath = path.join(this.contributorsDir, `repositories-${ciSystemLower}.xlsx`);
        }
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log('storage.ts - readRepoList');
            console.log('CI System:', ciSystem);
            console.log('File Path:', filePath);
            console.log('--------------------------------');
        }
        try {
            await fs.access(filePath);
        }
        catch {
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log('storage.ts readRepoList');
                console.log('File does not exist');
                console.log('--------------------------------');
            }
            return [];
        }
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Repositories');
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log('storage.ts readRepoList');
            console.log('Worksheet: ');
            console.log(worksheet);
            console.log('--------------------------------');
        }
        if (!worksheet) {
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log('storage.ts readRepoList');
                console.log('Worksheet empty');
                console.log('--------------------------------');
            }
            return [];
        }
        const repos = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Skip header row
                const include = row.getCell(5).value;
                if (include?.toString().toUpperCase() === 'Y') {
                    const repoPath = row.getCell(3).value?.trim();
                    if (repoPath) {
                        repos.push({
                            name: row.getCell(2).value?.trim() || '',
                            org: row.getCell(1).value?.trim() || '',
                            path: repoPath,
                            platform: ciSystem
                        });
                    }
                }
            }
        });
        return repos;
    }
    async writeCommittersPerRepo(repos) {
        const workbook = new exceljs_1.default.Workbook();
        // Create summary sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 20 },
            { header: 'Value', key: 'value', width: 40 }
        ];
        summarySheet.addRow({ metric: 'Report Generated At', value: new Date().toISOString() });
        summarySheet.addRow({ metric: 'Total Repositories', value: repos.length });
        // Create detailed sheet
        const detailedSheet = workbook.addWorksheet('Details');
        detailedSheet.columns = [
            { header: 'Repository', key: 'repository', width: 40 },
            { header: 'Platform', key: 'platform', width: 15 },
            { header: 'Organization', key: 'org', width: 20 }
        ];
        repos.forEach(repo => {
            detailedSheet.addRow({
                repository: repo.path,
                platform: repo.platform,
                org: repo.org
            });
        });
        await workbook.xlsx.writeFile(path.join(this.contributorsDir, 'contributor_summary.xlsx'));
    }
    normalizeSystemName(ciSystem) {
        // Normalize system names consistently: "AzureDevOps" or "Azure-DevOps" -> "azuredevops"
        const normalized = ciSystem.toLowerCase().replace(/-/g, '');
        return normalized;
    }
    async storeCommits(ciSystem, repo, commits) {
        if (!Array.isArray(commits)) {
            console.error(`Invalid commits data for ${repo.path}: expected array but got ${typeof commits}`);
            return;
        }
        // Always create the file, even if commits is empty
        const normalizedSystem = this.normalizeSystemName(ciSystem);
        const normalizedRepoPath = repo.path.replace(/\//g, '_');
        const systemDir = path.join(this.contributorsDir, normalizedSystem);
        await fs.mkdir(systemDir, { recursive: true });
        const repoDir = path.join(systemDir, normalizedRepoPath);
        await fs.mkdir(repoDir, { recursive: true });
        const filePath = path.join(repoDir, 'commits.json');
        if (process.argv.includes('--debug')) {
            console.log(`  Storing commits to: ${normalizedSystem}/${normalizedRepoPath}/commits.json`);
            console.log(`    CI System: "${ciSystem}" -> normalized: "${normalizedSystem}"`);
            console.log(`    Repo path: "${repo.path}" -> normalized: "${normalizedRepoPath}"`);
            console.log(`  Full path: ${filePath}`);
        }
        // Create a temporary file first
        const tempFilePath = `${filePath}.tmp`;
        try {
            // Write to temporary file first
            await fs.writeFile(tempFilePath, JSON.stringify(commits, null, 2));
            // Verify the temporary file was written correctly
            const tempContent = await fs.readFile(tempFilePath, 'utf-8');
            const parsedTemp = JSON.parse(tempContent);
            if (!Array.isArray(parsedTemp)) {
                throw new Error('Verification of temporary file failed');
            }
            // If verification passes, rename the temporary file to the actual file
            await fs.rename(tempFilePath, filePath);
            if (process.argv.includes('--debug')) {
                console.log('--------------------------------');
                console.log(`Commits stored for ${repo.path} in ${filePath}`);
                console.log(`Total commits stored: ${commits.length}`);
                if (commits.length > 0) {
                    console.log('First commit:', commits[0]);
                    console.log('Last commit:', commits[commits.length - 1]);
                }
                else {
                    console.log('No commits found for this repository');
                }
                console.log('--------------------------------');
            }
        }
        catch (error) {
            console.error(`Error storing commits for ${repo.path}:`, error);
            // Clean up temporary file if it exists
            try {
                await fs.unlink(tempFilePath);
            }
            catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }
    async readCommits(ciSystem, repo) {
        const normalizedSystem = this.normalizeSystemName(ciSystem);
        const filePath = path.join(this.contributorsDir, normalizedSystem, repo.path.replace(/\//g, '_'), 'commits.json');
        try {
            await fs.access(filePath);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return [];
        }
    }
    /**
     * Generate CSV file with repos and contributors for a specific run date
     * Uses the same evaluation logic as the Excel detailed tabs
     */
    async writeRunCSV(ciSystem, repos, dateSuffix, evaluationService) {
        const csvLines = [];
        // Header
        csvLines.push('Repository Path,Organization,Repository Name,Platform,Contributor Name,Contributor Email,Date');
        const dateFormatted = dateSuffix.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); // Convert YYYYMMDD to YYYY-MM-DD
        // Read commits for each repo and extract contributors using the same logic as Excel tabs
        for (const repo of repos) {
            try {
                const commits = await this.readCommits(ciSystem, repo);
                // Use evaluation service to extract contributors (same logic as detailed tabs)
                let contributors = [];
                if (evaluationService && typeof evaluationService.extractContributors === 'function') {
                    const result = evaluationService.extractContributors(commits, ciSystem);
                    // Combine both included and removed contributors for CSV (same as Excel shows both)
                    contributors = [...result.contributors, ...result.removedContributors];
                }
                else {
                    // Fallback: extract directly from commits if evaluation service not available
                    const contributorsMap = new Map();
                    for (const commit of commits) {
                        let name = '';
                        let email = '';
                        switch (ciSystem.toLowerCase()) {
                            case 'github':
                                if (commit.commit?.author) {
                                    name = commit.commit.author.name || '';
                                    email = commit.commit.author.email || '';
                                }
                                break;
                            case 'gitlab':
                                name = commit.author_name || '';
                                email = commit.author_email || '';
                                break;
                            case 'azuredevops':
                                if (commit.author) {
                                    name = commit.author.name || '';
                                    email = commit.author.email || '';
                                }
                                break;
                        }
                        if (name && email) {
                            const key = `${name}:${email.toLowerCase()}`;
                            if (!contributorsMap.has(key)) {
                                contributorsMap.set(key, { name, email });
                            }
                        }
                    }
                    contributors = Array.from(contributorsMap.values());
                }
                // Write contributors for this repo
                for (const contributor of contributors) {
                    csvLines.push(`"${repo.path}","${repo.org}","${repo.name}","${repo.platform}","${contributor.name}","${contributor.email}","${dateFormatted}"`);
                }
            }
            catch (error) {
                console.error(`Error processing repo ${repo.path} for CSV:`, error);
            }
        }
        const filename = `run_${ciSystem.toLowerCase()}_${dateSuffix}.csv`;
        const filePath = path.join(this.contributorsDir, filename);
        await fs.writeFile(filePath, csvLines.join('\n'), 'utf-8');
        console.log(`CSV written to ${filePath} with ${csvLines.length - 1} contributor entries`);
        return filePath;
    }
    /**
     * Generate or update scm_summary_average.csv with unique users per run and average
     */
    async writeSummaryAverageCSV(summaryData) {
        const filePath = path.join(this.contributorsDir, 'scm_summary_average.csv');
        // Read existing data if file exists
        let existingData = [];
        try {
            await fs.access(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length >= 5) {
                    existingData.push({
                        date: parts[0].replace(/"/g, ''),
                        gitlab: parseInt(parts[1]) || 0,
                        github: parseInt(parts[2]) || 0,
                        azureDevOps: parseInt(parts[3]) || 0,
                        total: parseInt(parts[4]) || 0
                    });
                }
            }
        }
        catch {
            // File doesn't exist, start fresh
        }
        // Add new data
        existingData.push({
            date: summaryData.date,
            gitlab: summaryData.gitlabContributors,
            github: summaryData.githubContributors,
            azureDevOps: summaryData.azureDevOpsContributors,
            total: summaryData.totalUniqueContributors
        });
        // Calculate averages
        const count = existingData.length;
        const avgGitlab = Math.round(existingData.reduce((sum, d) => sum + d.gitlab, 0) / count);
        const avgGithub = Math.round(existingData.reduce((sum, d) => sum + d.github, 0) / count);
        const avgAzureDevOps = Math.round(existingData.reduce((sum, d) => sum + d.azureDevOps, 0) / count);
        const avgTotal = Math.round(existingData.reduce((sum, d) => sum + d.total, 0) / count);
        // Write CSV
        const csvLines = [];
        csvLines.push('Date,GitLab Contributors,GitHub Contributors,Azure DevOps Contributors,Total Unique Contributors');
        for (const data of existingData) {
            csvLines.push(`"${data.date}",${data.gitlab},${data.github},${data.azureDevOps},${data.total}`);
        }
        // Add average row
        csvLines.push(`"Average (${count} runs)",${avgGitlab},${avgGithub},${avgAzureDevOps},${avgTotal}`);
        await fs.writeFile(filePath, csvLines.join('\n'), 'utf-8');
        console.log(`Summary average CSV written to ${filePath}`);
        return filePath;
    }
}
exports.FileStorageService = FileStorageService;
