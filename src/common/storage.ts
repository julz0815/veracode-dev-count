import * as fs from 'fs/promises';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { CISystemConfig, Repository, StorageService } from './types';

export class FileStorageService implements StorageService {
  private config!: CISystemConfig;
  private contributorsDir: string;

  constructor() {
    this.contributorsDir = path.join(process.cwd(), 'contributors');
  }

  async setConfig(config: CISystemConfig): Promise<void> {
    this.config = config;
    await fs.mkdir(this.contributorsDir, { recursive: true });
  }

  async writeRepoList(repos: Repository[], ciSystem: string): Promise<void> {
    if (process.argv.includes('--debug')) {
      console.log('--------------------------------');
      console.log('storage.ts - writeRepoList');
      console.log('CI System:', ciSystem);
      console.log('Filename:', `repositories-${ciSystem.toLowerCase()}.xlsx`);
      console.log('--------------------------------');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Repositories');

    worksheet.columns = [
      { header: 'Organization', key: 'org', width: 20 },
      { header: 'Repository', key: 'name', width: 30 },
      { header: 'Path', key: 'path', width: 40 },
      { header: 'Last Updated', key: 'lastUpdated', width: 20 },
      { header: 'Include', key: 'include', width: 10 }
    ];

    repos.forEach(repo => {
      worksheet.addRow({
        org: repo.org,
        name: repo.name,
        path: repo.path,
        lastUpdated: new Date().toISOString().split('T')[0],
        include: 'Y'
      });
    });

    const filename = path.join(this.contributorsDir, `repositories-${ciSystem.toLowerCase()}.xlsx`);
    await workbook.xlsx.writeFile(filename);
    console.log(`Repository list written to ${filename}`);
  }

  async readRepoList(ciSystem: string): Promise<Repository[]> {
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
    } catch {
      if (process.argv.includes('--debug')) {
        console.log('--------------------------------');
        console.log('storage.ts readRepoList');
        console.log('File does not exist');
        console.log('--------------------------------');
      }
      return [];
    }

    const workbook = new ExcelJS.Workbook();
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

    const repos: Repository[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const include = row.getCell(5).value as string;
        if (include?.toString().toUpperCase() === 'Y') {
          repos.push({
            name: row.getCell(2).value as string,
            org: row.getCell(1).value as string,
            path: row.getCell(3).value as string,
            platform: ciSystem
          });
        }
      }
    });

    return repos;
  }

  async writeCommittersPerRepo(repos: Repository[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    
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

  async storeCommits(ciSystem: string, repo: Repository, commits: any[]): Promise<void> {
    if (!Array.isArray(commits)) {
      console.error(`Invalid commits data for ${repo.path}: expected array but got ${typeof commits}`);
      return;
    }

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
        } else {
          console.log('No commits found for this repository');
        }
        console.log('--------------------------------');
      }
    } catch (error) {
      console.error(`Error storing commits for ${repo.path}:`, error);
      // Clean up temporary file if it exists
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  async readCommits(ciSystem: string, repo: Repository): Promise<any[]> {
    const filePath = path.join(this.contributorsDir, ciSystem.toLowerCase(), repo.path.replace(/\//g, '_'), 'commits.json');
    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
} 