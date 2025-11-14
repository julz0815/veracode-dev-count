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
        this.contributorsDir = path.join(process.cwd(), 'contributors');
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
        const filename = path.join(this.contributorsDir, `repositories-${ciSystem.toLowerCase()}.xlsx`);
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
        const filePath = path.join(this.contributorsDir, `repositories-${ciSystem.toLowerCase()}.xlsx`);
        if (process.argv.includes('--debug')) {
            console.log('--------------------------------');
            console.log('storage.ts - readRepoList');
            console.log('CI System:', ciSystem);
            console.log('Filename:', `repositories-${ciSystem.toLowerCase()}.xlsx`);
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
    async storeCommits(ciSystem, repo, commits) {
        if (!Array.isArray(commits)) {
            console.error(`Invalid commits data for ${repo.path}: expected array but got ${typeof commits}`);
            return;
        }
        // Always create the file, even if commits is empty
        const systemDir = path.join(this.contributorsDir, ciSystem.toLowerCase());
        await fs.mkdir(systemDir, { recursive: true });
        const repoDir = path.join(systemDir, repo.path.replace(/\//g, '_'));
        await fs.mkdir(repoDir, { recursive: true });
        const filePath = path.join(repoDir, 'commits.json');
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
        const filePath = path.join(this.contributorsDir, ciSystem.toLowerCase(), repo.path.replace(/\//g, '_'), 'commits.json');
        try {
            await fs.access(filePath);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return [];
        }
    }
}
exports.FileStorageService = FileStorageService;
