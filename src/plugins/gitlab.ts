import { CISystem, CISystemConfig, Repository } from '../common/types';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs/promises';

interface GitLabProject {
  name: string;
  path_with_namespace: string;
  archived: boolean;
  namespace: {
    full_path: string;
  };
}

interface GitLabCommit {
  author_email: string;
  author_name: string;
}

interface ExcelRepository {
  Organization: string;
  Repository: string;
  Path: string;
  Include: string;
}

export class GitLabSystem implements CISystem {
  private config!: CISystemConfig;
  private baseUrl: string = '';
  private requestDelay: number = 1000; // 1 second delay between requests
  private maxRetries: number = 3;
  private retryDelay: number = 5000; // 5 seconds delay between retries
  private includedRepos: Set<string> = new Set();

  constructor() {}

  async setConfig(config: CISystemConfig): Promise<void> {
    this.config = config;
    this.baseUrl = config.domain.replace(/\/api\/v4$/, '').replace(/\/$/, '');

    // Ensure contributors directory exists
    const contributorsDir = path.join(process.cwd(), 'contributors');
    await fs.mkdir(contributorsDir, { recursive: true });

    // Read Excel file and populate includedRepos
    try {
      const filePath = path.join(contributorsDir, 'repositories-gitlab.xlsx');
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
      throw new Error('Failed to read repositories-gitlab.xlsx file');
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchGitLab<T>(endpoint: string, retryCount: number = 0): Promise<T> {
    const cleanEndpoint = endpoint.replace(/^\/api\/v4/, '');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/v4${cleanEndpoint}`, {
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
          console.log(`Rate limit hit, waiting ${delayTime/1000} seconds before retry ${retryCount + 1}/${this.maxRetries}`);
          await this.delay(delayTime);
          return this.fetchGitLab<T>(endpoint, retryCount + 1);
        }
        
        throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.log(`Request failed, retrying in ${this.retryDelay/1000} seconds (${retryCount + 1}/${this.maxRetries})`);
        await this.delay(this.retryDelay);
        return this.fetchGitLab<T>(endpoint, retryCount + 1);
      }
      throw error;
    }
  }

  async getRepos(): Promise<Repository[]> {
    const repos: Repository[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const projects = await this.fetchGitLab<GitLabProject[]>(`/projects?membership=true&per_page=100&page=${page}`);
        
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
            console.log(`Waiting ${this.requestDelay/1000} seconds before next page of repositories...`);
          }
          await this.delay(this.requestDelay);
        }
      } catch (error) {
        console.error('Error fetching repositories:', error);
        hasMore = false;
      }
    }

    return repos;
  }

  async getContributors(repo: Repository): Promise<GitLabCommit[]> {
    // Check if repository should be included based on Excel file
    if (!this.includedRepos.has(repo.path)) {
      if (process.argv.includes('--debug')) {
        console.log(`Skipping repository ${repo.path} as it is not marked for inclusion in Excel file`);
      }
      return [];
    }

    const commits: GitLabCommit[] = [];
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
        const response = await this.fetchGitLab<GitLabCommit[]>(
          `/projects/${encodeURIComponent(repo.path)}/repository/commits?per_page=100&page=${page}&since=${sinceDate}`
        );

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
            console.log(`Waiting ${this.requestDelay/1000} seconds before next page of commits...`);
          }
          await this.delay(this.requestDelay);
        }
      } catch (error) {
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

  async getCommits(repo: Repository): Promise<GitLabCommit[]> {
    return this.getContributors(repo);
  }
} 