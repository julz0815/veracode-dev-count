/**
 * Command-line argument parsing for headless/non-interactive mode
 */

export interface HeadlessOptions {
  enabled: boolean;
  mode?: 'fetch' | 'evaluate';
  ciSystems?: string[]; // e.g., ['github', 'gitlab', 'azure-devops']
  skipReview?: boolean;
  forceReload?: boolean;
  configFile?: string; // Custom path to config YAML file
  repositoriesFile?: string; // Custom path to repositories Excel file (for specific CI system, use --repositories-file-github, etc.)
  repositoriesFileGitHub?: string; // Custom path for GitHub repositories file
  repositoriesFileGitLab?: string; // Custom path for GitLab repositories file
  repositoriesFileAzureDevOps?: string; // Custom path for Azure DevOps repositories file
}

/**
 * Parse command-line arguments
 */
export function parseArgs(): HeadlessOptions {
  const args = process.argv.slice(2);
  
  const options: HeadlessOptions = {
    enabled: false,
  };

  // Check for headless/non-interactive flags
  if (args.includes('--headless') || args.includes('--non-interactive') || args.includes('-n')) {
    options.enabled = true;
  }

  // Parse mode
  const modeIndex = args.indexOf('--mode');
  if (modeIndex !== -1 && args[modeIndex + 1]) {
    const mode = args[modeIndex + 1].toLowerCase();
    if (mode === 'fetch' || mode === 'evaluate') {
      options.mode = mode;
    }
  }

  // Parse CI systems
  const ciSystemsIndex = args.indexOf('--ci-systems');
  if (ciSystemsIndex !== -1 && args[ciSystemsIndex + 1]) {
    options.ciSystems = args[ciSystemsIndex + 1]
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => ['github', 'gitlab', 'azure-devops'].includes(s));
  }

  // Parse skip-review flag
  if (args.includes('--skip-review')) {
    options.skipReview = true;
  }

  // Parse force-reload flag
  if (args.includes('--force-reload')) {
    options.forceReload = true;
  }

  // Parse config file path
  const configFileIndex = args.indexOf('--config');
  if (configFileIndex !== -1 && args[configFileIndex + 1]) {
    options.configFile = args[configFileIndex + 1];
  }

  // Also support --config-file as an alias
  const configFileAliasIndex = args.indexOf('--config-file');
  if (configFileAliasIndex !== -1 && args[configFileAliasIndex + 1]) {
    options.configFile = args[configFileAliasIndex + 1];
  }

  // Parse repositories file paths (headless mode only)
  const reposFileIndex = args.indexOf('--repositories-file');
  if (reposFileIndex !== -1 && args[reposFileIndex + 1]) {
    options.repositoriesFile = args[reposFileIndex + 1];
  }

  // Parse CI system specific repositories file paths
  const reposFileGitHubIndex = args.indexOf('--repositories-file-github');
  if (reposFileGitHubIndex !== -1 && args[reposFileGitHubIndex + 1]) {
    options.repositoriesFileGitHub = args[reposFileGitHubIndex + 1];
  }

  const reposFileGitLabIndex = args.indexOf('--repositories-file-gitlab');
  if (reposFileGitLabIndex !== -1 && args[reposFileGitLabIndex + 1]) {
    options.repositoriesFileGitLab = args[reposFileGitLabIndex + 1];
  }

  const reposFileAzureDevOpsIndex = args.indexOf('--repositories-file-azure-devops');
  if (reposFileAzureDevOpsIndex !== -1 && args[reposFileAzureDevOpsIndex + 1]) {
    options.repositoriesFileAzureDevOps = args[reposFileAzureDevOpsIndex + 1];
  }

  return options;
}

/**
 * Get help text for command-line usage
 */
export function getHelpText(): string {
  return `
Usage: node dist/index.js [options]

Options:
  --headless, --non-interactive, -n
                          Run in headless/non-interactive mode (uses existing configs)
  
  --mode <fetch|evaluate>  Operation mode (default: fetch)
                          - fetch: Fetch and process repositories
                          - evaluate: Evaluate existing data only
  
  --ci-systems <systems>  Comma-separated list of CI systems to process
                          Valid values: github, gitlab, azure-devops
                          Example: --ci-systems github,gitlab
  
  --skip-review          Skip repository review step (headless mode only)
  
  --force-reload         Force reload of repositories (headless mode only)
  
  --config <path>, --config-file <path>
                        Custom path to config YAML file (headless mode only)
                        Default: ~/.veracode/veracode-devcount.yml
  
  --repositories-file <path>
                        Custom path to repositories Excel file (headless mode only)
                        Applies to all CI systems. Overridden by system-specific flags.
  
  --repositories-file-github <path>
                        Custom path to GitHub repositories Excel file (headless mode only)
  
  --repositories-file-gitlab <path>
                        Custom path to GitLab repositories Excel file (headless mode only)
  
  --repositories-file-azure-devops <path>
                        Custom path to Azure DevOps repositories Excel file (headless mode only)
  
  --debug                Enable debug logging

Environment Variables (for headless mode):
  GITHUB_TOKEN           GitHub personal access token (for API access and git push)
  GITLAB_TOKEN           GitLab personal access token (for API access and git push)
  AZURE_DEVOPS_TOKEN     Azure DevOps personal access token (for API access and git push)
  
  Note: Tokens are used for both CI system API access and git push operations.
        At least one token must be set for git push to work in headless mode.

Examples:
  # Interactive mode (default)
  npm start
  
  # Headless mode with existing configs
  node dist/index.js --headless
  
  # Headless mode, fetch only GitHub
  node dist/index.js --headless --mode fetch --ci-systems github
  
  # Headless mode, evaluate existing data
  node dist/index.js --headless --mode evaluate
  
  # Headless mode with force reload
  node dist/index.js --headless --force-reload
  
  # Headless mode with custom config file
  node dist/index.js --headless --config /path/to/custom-config.yml
  
  # Headless mode with custom repositories file for all CI systems
  node dist/index.js --headless --repositories-file /path/to/repositories.xlsx
  
  # Headless mode with custom repositories file for specific CI system
  node dist/index.js --headless --repositories-file-github /path/to/repositories-github.xlsx
  node dist/index.js --headless --repositories-file-gitlab /path/to/repositories-gitlab.xlsx
  node dist/index.js --headless --repositories-file-azure-devops /path/to/repositories-azuredevops.xlsx
  
  # Headless mode with custom repositories file for all CI systems
  node dist/index.js --headless --repositories-file /path/to/repositories.xlsx
  
  # Headless mode with custom repositories file for specific CI system
  node dist/index.js --headless --repositories-file-github /path/to/repositories-github.xlsx
`;
}

