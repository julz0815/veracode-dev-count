import { CISystem, CISystemConfig, Repository } from '../common/types';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs/promises';

interface AzureDevOpsProject {
  name: string;
  id: string;
  project: {
    name: string;
  };
}

interface AzureDevOpsRepo {
  name: string;
  id: string;
}

interface AzureDevOpsCommit {
  author: {
    email: string;
    name: string;
  };
}

interface ExcelRepository {
  Organization: string;
  Repository: string;
  Path: string;
  Include: string;
}

interface AzureDevOpsResponse<T> {
  value: T[];
  count: number;
}

export class AzureDevOpsSystem implements CISystem {
  private config!: CISystemConfig;
  private baseUrl: string = '';
  private requestDelay: number = 1000; // 1 second delay between requests
  private maxRetries: number = 3;
  private retryDelay: number = 5000; // 5 seconds delay between retries
  private includedRepos: Set<string> = new Set();

  constructor() {}

  async setConfig(config: CISystemConfig): Promise<void> {
    this.config = config;
    this.baseUrl = config.domain.replace(/\/$/, '');

    // Ensure contributors directory exists
    const contributorsDir = path.join(process.cwd(), 'contributors');
    await fs.mkdir(contributorsDir, { recursive: true });

    // Read Excel file and populate includedRepos
    const filePath = path.join(contributorsDir, 'repositories-azuredevops.xlsx');
    
    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist, create an empty one
        if (process.argv.includes('--debug')) {
          console.log('--------------------------------');
          console.log('Creating empty repositories-azuredevops.xlsx file');
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
      const data = XLSX.utils.sheet_to_json<ExcelRepository>(worksheet);

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
        console.log(Array.from(this.includedRepos));
        console.log('--------------------------------');
      }
    } catch (error) {
      console.error('Error reading Excel file:', error);
      throw new Error('Failed to read repositories-azure-devops.xlsx file');
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchAzureDevOps<T>(endpoint: string, retryCount: number = 0): Promise<T> {
    const auth = Buffer.from(`:${this.config.token}`).toString('base64');
    
    if (process.argv.includes('--debug')) {
      console.log('--------------------------------');
      console.log('azure-devops.ts fetchAzureDevOps');
      console.log(`baseurl: ${this.baseUrl}`);
      console.log('Endpoint: ' + endpoint);
      console.log('--------------------------------');
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid Azure DevOps token. Please verify your token is correct and has the necessary permissions.');
        }
        
        // Check for rate limit headers
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter && retryCount < this.maxRetries) {
          const delayTime = parseInt(retryAfter) * 1000 || this.retryDelay;
          console.log(`Rate limit hit, waiting ${delayTime/1000} seconds before retry ${retryCount + 1}/${this.maxRetries}`);
          await this.delay(delayTime);
          return this.fetchAzureDevOps<T>(endpoint, retryCount + 1);
        }
        
        throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.log(`Request failed, retrying in ${this.retryDelay/1000} seconds (${retryCount + 1}/${this.maxRetries})`);
        await this.delay(this.retryDelay);
        return this.fetchAzureDevOps<T>(endpoint, retryCount + 1);
      }
      throw error;
    }
  }

  async getRepos(): Promise<Repository[]> {
    const repos: Repository[] = [];
    
    // Get organizations from config, split by comma if multiple
    const orgs = this.config.orgs?.split(',').map(org => org.trim()) || [];
    
    // Process each organization
    for (const org of orgs) {
      let skip = 0;
      const top = 100;
      let hasMore = true;

      if (process.argv.includes('--debug')) {
        console.log(`Fetching repositories for organization: ${org}`);
      }

      while (hasMore) {
        try {
          const response = await this.fetchAzureDevOps<{
            value: AzureDevOpsProject[];
            count: number;
          }>(`/${org}/_apis/git/repositories?api-version=7.0&$skip=${skip}&$top=${top}`);

          if (response.value.length === 0) {
            hasMore = false;
            continue;
          }

          for (const repo of response.value) {
            const projectName = repo.project.name;
            const repoName = repo.name;
            if (process.argv.includes('--debug')) {
              console.log(`Processing repository: ${projectName}/${repoName}`);
            }
            repos.push({
              name: repoName,
              org: org,
              path: `${projectName}/${repoName}`,
              platform: 'Azure DevOps',
            });
          }

          skip += top;
          hasMore = response.value.length === top;

          // Add delay between pagination requests
          if (hasMore) {
            if (process.argv.includes('--debug')) {
              console.log(`Waiting ${this.requestDelay/1000} seconds before next page of repositories...`);
            }
            await this.delay(this.requestDelay);
          }
        } catch (error) {
          console.error(`Error fetching repositories for org ${org}:`, error);
          hasMore = false;
        }
      }
    }

    return repos;
  }

  async getContributors(repo: Repository): Promise<AzureDevOpsCommit[]> {
    // Check if repository should be included based on Excel file
    if (!this.includedRepos.has(repo.path)) {
      if (process.argv.includes('--debug')) {
        console.log(`Skipping repository ${repo.path} as it is not marked for inclusion in Excel file`);
      }
      return [];
    }

    const commits: AzureDevOpsCommit[] = [];
    let continuationToken: string | undefined;

    // Split the path to get project and repository name
    const [projectName, repoName] = repo.path.split('/');

    if (process.argv.includes('--debug')) {
      console.log('--------------------------------');
      console.log(`Fetching commits for repository: ${repo.path}`);
      console.log(`Project: ${projectName}, Repository: ${repoName}`);
      console.log('--------------------------------');
    }

    try {
      // First, get the repository ID using the project name in the path
      const repoResponse = await this.fetchAzureDevOps<{ value: AzureDevOpsRepo[] }>(
        `/${repo.org}/${projectName}/_apis/git/repositories?api-version=7.0`
      );

      if (!repoResponse.value || repoResponse.value.length === 0) {
        console.error(`No repositories found in project ${projectName}`);
        return [];
      }

      if (process.argv.includes('--debug')) {
        console.log('--------------------------------');
        console.log('Available repositories in project:');
        repoResponse.value.forEach(r => console.log(`- ${r.name}`));
        console.log('--------------------------------');
      }

      // Find the exact repository match
      const matchingRepo = repoResponse.value.find(r => r.name === repoName);
      if (!matchingRepo) {
        console.error(`Repository ${repoName} not found in project ${projectName}`);
        return [];
      }

      const repoId = matchingRepo.id;

      if (process.argv.includes('--debug')) {
        console.log(`Found repository ID: ${repoId} for ${repo.path}`);
      }

      // Now use the repository ID to fetch commits
      do {
        const response = await this.fetchAzureDevOps<{ value: AzureDevOpsCommit[]; continuationToken?: string }>(
          `/${repo.org}/_apis/git/repositories/${repoId}/commits?api-version=7.0` +
          (continuationToken ? `&continuationToken=${continuationToken}` : '')
        );

        if (process.argv.includes('--debug')) {
          console.log(`Fetched ${response.value.length} commits in this batch`);
          if (response.value.length > 0) {
            console.log('First commit in batch:', response.value[0]);
          }
        }

        // Ensure we're not adding duplicate commits
        const newCommits = response.value.filter(newCommit => 
          !commits.some(existingCommit => 
            existingCommit.author.email === newCommit.author.email && 
            existingCommit.author.name === newCommit.author.name
          )
        );

        commits.push(...newCommits);
        continuationToken = response.continuationToken;

        // Add delay between pagination requests
        if (continuationToken) {
          if (process.argv.includes('--debug')) {
            console.log(`Waiting ${this.requestDelay/1000} seconds before next page of commits...`);
            console.log(`Total commits collected so far: ${commits.length}`);
          }
          await this.delay(this.requestDelay);
        }
      } while (continuationToken);

      if (process.argv.includes('--debug')) {
        console.log('--------------------------------');
        console.log(`Total commits collected: ${commits.length}`);
        console.log('First commit:', commits[0]);
        console.log('Last commit:', commits[commits.length - 1]);
        console.log('--------------------------------');
      }

      return commits;
    } catch (error) {
      console.error(`Error fetching commits for ${repo.path}:`, error);
      throw error;
    }
  }

  async getCommits(repo: Repository): Promise<AzureDevOpsCommit[]> {
    return this.getContributors(repo);
  }
} 