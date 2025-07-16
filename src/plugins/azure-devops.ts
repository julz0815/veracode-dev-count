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
  private domainType: 'dev.azure.com' | 'visualstudio.com' = 'dev.azure.com';

  constructor() {}

  /**
   * Get information about the current domain configuration
   */
  getDomainInfo(): { baseUrl: string; domainType: string } {
    return {
      baseUrl: this.baseUrl,
      domainType: this.domainType
    };
  }

  /**
   * Test domain connectivity for debugging purposes
   */
  async testDomainConnectivity(org: string): Promise<{
    devAzureWorks: boolean;
    visualStudioWorks: boolean;
    selectedDomain: string;
  }> {
    const devAzureUrl = 'https://dev.azure.com';
    const visualStudioUrl = `https://${org}.visualstudio.com`;

    const devAzureWorks = await this.testDomain(devAzureUrl, org);
    const visualStudioWorks = await this.testDomain(visualStudioUrl, org);

    let selectedDomain = '';
    if (devAzureWorks && !visualStudioWorks) {
      selectedDomain = devAzureUrl;
    } else if (visualStudioWorks && !devAzureWorks) {
      selectedDomain = visualStudioUrl;
    } else if (devAzureWorks && visualStudioWorks) {
      selectedDomain = devAzureUrl; // Prefer dev.azure.com
    }

    return {
      devAzureWorks,
      visualStudioWorks,
      selectedDomain
    };
  }

  async setConfig(config: CISystemConfig): Promise<void> {
    this.config = config;
    
    // Ensure protocol is present in domain if user specified a custom domain
    if (this.config.domain && !/^https?:\/\//i.test(this.config.domain)) {
      this.config.domain = 'https://' + this.config.domain;
    }

    // Determine the domain type and set the base URL
    await this.determineDomainType();
    
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

  private async determineDomainType(): Promise<void> {
    const orgs = this.config.orgs?.split(',').map(org => org.trim()).filter(org => org.length > 0) || [];
    
    if (orgs.length === 0) {
      throw new Error('No Azure DevOps organizations specified in configuration');
    }

    const firstOrg = orgs[0];
    
    // Validate organization name format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(firstOrg)) {
      throw new Error(
        `Invalid organization name: "${firstOrg}". Organization names must:\n` +
        `- Start and end with alphanumeric characters\n` +
        `- Contain only letters, numbers, and hyphens\n` +
        `- Be between 3-64 characters long`
      );
    }
    
    // Check if the domain is already specified in the config
    if (this.config.domain && this.config.domain !== 'https://dev.azure.com') {
      // User has specified a custom domain, use it as-is (protocol already ensured)
      this.baseUrl = this.config.domain.replace(/\/$/, '');
      // Set domainType based on the domain string
      if (this.baseUrl.includes('visualstudio.com')) {
        this.domainType = 'visualstudio.com';
      } else {
        this.domainType = 'dev.azure.com';
      }
      if (process.argv.includes('--debug')) {
        console.log(`Using custom domain: ${this.baseUrl} (${this.domainType})`);
      }
      return;
    }

    // Try to determine the best domain to use
    const devAzureUrl = `https://dev.azure.com`;
    const visualStudioUrl = `https://${firstOrg}.visualstudio.com`;

    if (process.argv.includes('--debug')) {
      console.log('--------------------------------');
      console.log('Testing Azure DevOps domain connectivity...');
      console.log(`Testing dev.azure.com with org: ${firstOrg}`);
      console.log(`Testing visualstudio.com with org: ${firstOrg}`);
      console.log('--------------------------------');
    }

    // Test both domains to see which one works
    const devAzureWorks = await this.testDomain(devAzureUrl, firstOrg);
    const visualStudioWorks = await this.testDomain(visualStudioUrl, firstOrg);

    if (process.argv.includes('--debug')) {
      console.log(`Domain test results:`);
      console.log(`  dev.azure.com: ${devAzureWorks ? '✓' : '✗'}`);
      console.log(`  visualstudio.com: ${visualStudioWorks ? '✓' : '✗'}`);
    }

    if (devAzureWorks && !visualStudioWorks) {
      this.domainType = 'dev.azure.com';
      this.baseUrl = devAzureUrl;
      console.log('Using dev.azure.com domain (default)');
    } else if (visualStudioWorks && !devAzureWorks) {
      this.domainType = 'visualstudio.com';
      this.baseUrl = visualStudioUrl;
      console.log('Using visualstudio.com domain');
    } else if (devAzureWorks && visualStudioWorks) {
      // Both work, prefer dev.azure.com as it's the newer standard
      this.domainType = 'dev.azure.com';
      this.baseUrl = devAzureUrl;
      console.log('Both domains work, using dev.azure.com (preferred)');
    } else {
      // Neither works, provide helpful error message
      throw new Error(
        `Unable to connect to Azure DevOps. Please verify:\n` +
        `1. Your organization name is correct: ${firstOrg}\n` +
        `2. Your token has the necessary permissions\n` +
        `3. Your organization is accessible via:\n` +
        `   - https://dev.azure.com/${firstOrg}\n` +
        `   - https://${firstOrg}.visualstudio.com\n` +
        `4. If using a custom domain, specify it in the domain field`
      );
    }

    if (process.argv.includes('--debug')) {
      console.log(`Selected domain: ${this.baseUrl}`);
      console.log(`Domain type: ${this.domainType}`);
    }
  }

  private async testDomain(baseUrl: string, org: string): Promise<boolean> {
    try {
      const auth = Buffer.from(`:${this.config.token}`).toString('base64');
      const response = await fetch(`${baseUrl}/${org}/_apis/projects?api-version=7.0&$top=1`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (process.argv.includes('--debug')) {
        console.log(`Domain test for ${baseUrl}/${org}: ${response.status} ${response.statusText}`);
      }
      
      return response.ok;
    } catch (error) {
      if (process.argv.includes('--debug')) {
        console.log(`Domain test failed for ${baseUrl}/${org}:`, error);
      }
      return false;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchAzureDevOps<T>(endpoint: string, retryCount: number = 0): Promise<T> {
    // Use non-empty username for legacy compatibility
    //const auth = Buffer.from(`user:${this.config.token}`).toString('base64');
    const auth = Buffer.from(`:${this.config.token}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'curl/7.68.0', // Add this for legacy compatibility
    };
    
    if (process.argv.includes('--debug')) {
      console.log('--------------------------------');
      console.log('azure-devops.ts fetchAzureDevOps');
      console.log(`baseurl: ${this.baseUrl}`);
      console.log('Endpoint: ' + endpoint);
      console.log('--- Request Headers ---');
      console.log(headers);
      console.log('-----------------------');
      console.log('--------------------------------');
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
        redirect: 'follow',
      });
      if (process.argv.includes('--debug')) {
        console.log('--- Response Headers ---');
        response.headers.forEach((value, key) => {
          console.log(`${key}: ${value}`);
        });
        console.log('------------------------');
      }
      const text = await response.text();

      if (process.argv.includes('--debug')) {
        console.log('--- Raw response body ---');
        console.log(text);
        console.log('-------------------------');
      }

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

      try {
        return JSON.parse(text);
      } catch (e) {
        if (process.argv.includes('--debug')) {
          console.error('Failed to parse JSON. Raw response was above.');
        }
        throw e;
      }
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
    
    for (const org of orgs) {
      if (process.argv.includes('--debug')) {
        console.log(`Fetching repositories for organization: ${org}`);
        console.log(`Using domain: ${this.baseUrl} (${this.domainType})`);
      }

      if (this.domainType === 'visualstudio.com') {
        // 1. Fetch all projects
        const projectsResponse = await this.fetchAzureDevOps<{ value: { name: string }[] }>(
          `/_apis/projects?api-version=7.0`
        );
        const projects = projectsResponse.value;
        if (process.argv.includes('--debug')) {
          console.log(`Found ${projects.length} projects for org ${org}`);
        }
        // 2. For each project, fetch repos
        for (const project of projects) {
          let skip = 0;
          const top = 100;
          let hasMore = true;
          while (hasMore) {
            const response = await this.fetchAzureDevOps<{
              value: AzureDevOpsProject[];
              count: number;
            }>(`/${encodeURIComponent(project.name)}/_apis/git/repositories?api-version=7.0&$skip=${skip}&$top=${top}`);
            if (response.value.length === 0) {
              hasMore = false;
              continue;
            }
            for (const repo of response.value) {
              const projectName = repo.project.name;
              const repoName = repo.name;
              repos.push({
                name: repoName,
                org: org,
                path: `${projectName}/${repoName}`,
                platform: 'Azure DevOps',
              });
            }
            skip += top;
            hasMore = response.value.length === top;
            if (hasMore) {
              await this.delay(this.requestDelay);
            }
          }
        }
      } else {
        // dev.azure.com logic (existing)
        let skip = 0;
        const top = 100;
        let hasMore = true;
        const orgPath = `/${org}`;
        while (hasMore) {
          try {
            const response = await this.fetchAzureDevOps<{
              value: AzureDevOpsProject[];
              count: number;
            }>(`${orgPath}/_apis/git/repositories?api-version=7.0&$skip=${skip}&$top=${top}`);
            if (response.value.length === 0) {
              hasMore = false;
              continue;
            }
            for (const repo of response.value) {
              const projectName = repo.project.name;
              const repoName = repo.name;
              repos.push({
                name: repoName,
                org: org,
                path: `${projectName}/${repoName}`,
                platform: 'Azure DevOps',
              });
            }
            skip += top;
            hasMore = response.value.length === top;
            if (hasMore) {
              await this.delay(this.requestDelay);
            }
          } catch (error) {
            console.error(`Error fetching repositories for org ${org}:`, error);
            hasMore = false;
          }
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

    // Use original path for splitting project/repo names
    const [projectName, repoName] = repo.path.split('/');
    const encodedProjectName = encodeURIComponent(projectName);
    const encodedRepoName = encodeURIComponent(repoName);

    if (process.argv.includes('--debug')) {
      console.log('--------------------------------');
      console.log(`Fetching commits for repository: ${repo.path}`);
      console.log(`Project: ${projectName}, Repository: ${repoName}`);
      console.log('--------------------------------');
    }

    try {
      // First, get the repository ID using the project name in the path
      // For visualstudio.com, do not include org in the path
      const orgPath = this.domainType === 'dev.azure.com' ? `/${repo.org}` : '';
      const repoResponse = await this.fetchAzureDevOps<{ value: AzureDevOpsRepo[] }>(
        `${orgPath}/${encodedProjectName}/_apis/git/repositories?api-version=7.0`
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

      // Calculate date 90 days ago
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const fromDate = ninetyDaysAgo.toISOString().split('T')[0];

      // Now use the repository ID to fetch commits
      do {
        const commitsOrgPath = this.domainType === 'dev.azure.com' ? `/${repo.org}` : '';
        const response = await this.fetchAzureDevOps<{ value: AzureDevOpsCommit[]; continuationToken?: string }>(
          `${commitsOrgPath}/_apis/git/repositories/${repoId}/commits?api-version=7.0&searchCriteria.fromDate=${fromDate}` +
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