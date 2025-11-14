"use strict";
/**
 * Command-line argument parsing for headless/non-interactive mode
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.getHelpText = getHelpText;
/**
 * Parse command-line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
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
    return options;
}
/**
 * Get help text for command-line usage
 */
function getHelpText() {
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
  
  --debug                Enable debug logging

Environment Variables (for headless mode):
  GITHUB_TOKEN           GitHub personal access token
  GITLAB_TOKEN           GitLab personal access token
  AZURE_DEVOPS_TOKEN     Azure DevOps personal access token

Examples:
  # Interactive mode (default)
  npm start
  
  # Headless mode with existing configs
  npm start -- --headless
  
  # Headless mode, fetch only GitHub
  npm start -- --headless --mode fetch --ci-systems github
  
  # Headless mode, evaluate existing data
  npm start -- --headless --mode evaluate
  
  # Headless mode with force reload
  npm start -- --headless --force-reload
  
  # Headless mode with custom config file
  npm start -- --headless --config /path/to/custom-config.yml
`;
}
