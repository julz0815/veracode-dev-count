export interface Repository {
  name: string;
  org: string;
  path: string;
  platform: string;
  url?: string;
  defaultBranch?: string;
}

export interface Contributor {
  email: string;
  name: string;
  count: number;
}

export interface GlobalNetworkConfig {
  ssl?: {
    rejectUnauthorized?: boolean;  // Default: true, set to false to disable SSL verification
    caFile?: string;                 // Path to CA certificate file (PEM format)
    certFile?: string;                // Path to client certificate file (PEM format)
    keyFile?: string;                // Path to client private key file (PEM format)
  };
  proxy?: {
    host: string;                    // Proxy hostname
    port: number;                    // Proxy port
    protocol?: 'http' | 'https';     // Proxy protocol (default: http)
    auth?: {
      username: string;
      password: string;
    };
  };
  rateLimit?: {
    requestsPerHour?: number;
    requestsPerMinute?: number;
    delayBetweenRequests?: number;
    maxRetries?: number;
    backoffMultiplier?: number;
  };
}

export interface CISystemConfig {
  token?: string;
  domain: string;
  orgs?: string;
  regexPattern?: string;
  regexFile?: string;
  forceReload?: boolean;
  skipForks?: boolean;
  skipPrivate?: boolean;
  ciSystem: string;
}

export interface CISystem {
  setConfig(config: CISystemConfig): Promise<void>;
  getRepos(): Promise<Repository[]>;
  getContributors(repo: Repository): Promise<any[]>;
  getCommits(repo: Repository): Promise<any[]>;
}

export interface StorageService {
  setConfig(config: CISystemConfig): Promise<void>;
  writeRepoList(repos: Repository[], ciSystem: string): Promise<void>;
  readRepoList(ciSystem: string): Promise<Repository[]>;
  writeCommittersPerRepo(repos: Repository[]): Promise<void>;
  storeCommits(ciSystem: string, repo: Repository, commits: any[]): Promise<void>;
  readCommits(ciSystem: string, repo: Repository): Promise<any[]>;
  writeRunCSV(ciSystem: string, repos: Repository[], dateSuffix: string, evaluationService?: any): Promise<string>;
  writeSummaryAverageCSV(summaryData: {
    date: string;
    gitlabContributors: number;
    githubContributors: number;
    azureDevOpsContributors: number;
    totalUniqueContributors: number;
  }): Promise<string>;
} 