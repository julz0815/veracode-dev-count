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
} 