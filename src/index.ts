import { CISystem, StorageService, CISystemConfig, Repository } from './common/types';
import { FileStorageService } from './common/storage';
import { GitHubSystem } from './plugins/github';
import { GitLabSystem } from './plugins/gitlab';
import { AzureDevOpsSystem } from './plugins/azure-devops';
import { CLI } from './cli';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EvaluationService } from './common/evaluation';
import { ConfigService } from './common/config';
import { httpClient } from './common/http-client';
import { parseArgs, getHelpText, HeadlessOptions } from './common/args';
import inquirer from 'inquirer';
import open from 'open';

interface DebugInfo {
  ciSystem: string;
  config: {
    domain: string;
    forceReload: boolean;
    regexPattern?: string;
    regexFile?: string;
  };
  repositories: {
    name: string;
    org: string;
    path: string;
    platform: string;
  }[];
}

interface CISystemInfo {
  system: CISystem;
  config: CISystemConfig;
  repos: Repository[];
}

/**
 * Run in headless mode - uses existing configurations, no interactive prompts
 */
async function runHeadlessMode(options: HeadlessOptions) {
  const storageService = new FileStorageService();
  const evaluationService = new EvaluationService();
  
  // Use custom config path if provided
  const configService = new ConfigService(options.configFile);
  if (options.configFile) {
    console.log(`Using custom config file: ${options.configFile}\n`);
  }
  
  const systems: CISystemInfo[] = [];

  console.log('Running in headless mode...\n');

  // Use existing global network config or empty
  let globalNetworkConfig = await configService.readGlobalNetworkConfig() || {};
  if (globalNetworkConfig.ssl || globalNetworkConfig.proxy || globalNetworkConfig.rateLimit) {
    console.log('Using existing global network configuration');
  }

  // Initialize HTTP client
  await httpClient.initialize(globalNetworkConfig);

  const mode = options.mode || 'fetch';
  const ciSystemsToProcess = options.ciSystems || ['github', 'gitlab', 'azure-devops'];

  if (mode === 'fetch') {
    // Process each specified CI system
    for (const ciSystemNameLower of ciSystemsToProcess) {
      // Convert to proper case
      let ciSystemName: string;
      switch (ciSystemNameLower) {
        case 'github':
          ciSystemName = 'GitHub';
          break;
        case 'gitlab':
          ciSystemName = 'GitLab';
          break;
        case 'azure-devops':
          ciSystemName = 'Azure-DevOps';
          break;
        default:
          console.log(`Skipping unknown CI system: ${ciSystemNameLower}`);
          continue;
      }

      console.log(`\nProcessing ${ciSystemName}...`);

      // Read existing config
      const { config: existingConfig } = await configService.readConfig(ciSystemName);
      
      if (!existingConfig) {
        console.error(`No configuration found for ${ciSystemName}. Please run in interactive mode first to set up configuration.`);
        continue;
      }

      // Override token from environment variable if available
      const envToken = getTokenFromEnv(ciSystemName);
      if (envToken) {
        existingConfig.token = envToken;
        console.log(`Using token from environment variable for ${ciSystemName}`);
      }

      // Apply force reload if specified
      if (options.forceReload !== undefined) {
        existingConfig.forceReload = options.forceReload;
      }

      // Initialize CI system
      let ciSystem: CISystem;
      switch (ciSystemName) {
        case 'GitHub':
          ciSystem = new GitHubSystem();
          break;
        case 'GitLab':
          ciSystem = new GitLabSystem();
          break;
        case 'Azure-DevOps':
          ciSystem = new AzureDevOpsSystem();
          break;
        default:
          continue;
      }

      await ciSystem.setConfig(existingConfig);
      await storageService.setConfig(existingConfig);

      // Get repositories
      console.log(`Fetching repositories for ${ciSystemName}...`);
      const repos = await ciSystem.getRepos();
      console.log(`Found ${repos.length} repositories`);

      // Write repository list (preserves existing Include values)
      await storageService.writeRepoList(repos, ciSystemName.replace('-', ''));

      // Skip review in headless mode unless explicitly requested
      if (!options.skipReview) {
        console.log(`Repository list written. Review file if needed: contributors/repositories-${ciSystemNameLower}.xlsx`);
      }

      systems.push({ system: ciSystem, config: existingConfig, repos });
    }
  } else {
    // Evaluation mode: Load existing data
    for (const ciSystemNameLower of ciSystemsToProcess) {
      let ciSystemName: string;
      switch (ciSystemNameLower) {
        case 'github':
          ciSystemName = 'GitHub';
          break;
        case 'gitlab':
          ciSystemName = 'GitLab';
          break;
        case 'azure-devops':
          ciSystemName = 'Azure-DevOps';
          break;
        default:
          continue;
      }

      try {
        const repos = await storageService.readRepoList(ciSystemName.replace('-', ''));
        if (repos.length > 0) {
          let ciSystem: CISystem;
          switch (ciSystemName) {
            case 'GitHub':
              ciSystem = new GitHubSystem();
              break;
            case 'GitLab':
              ciSystem = new GitLabSystem();
              break;
            case 'Azure-DevOps':
              ciSystem = new AzureDevOpsSystem();
              break;
            default:
              continue;
          }
          const { config } = await configService.readConfig(ciSystemName);
          systems.push({ system: ciSystem, config: config || {} as CISystemConfig, repos });
        }
      } catch (error) {
        console.log(`No existing data found for ${ciSystemName}`);
      }
    }
  }

  // Process all collected systems
  return processSystems(systems, storageService, evaluationService, mode === 'fetch');
}

/**
 * Get token from environment variable
 */
function getTokenFromEnv(ciSystemName: string): string | undefined {
  switch (ciSystemName) {
    case 'GitHub':
      return process.env.GITHUB_TOKEN;
    case 'GitLab':
      return process.env.GITLAB_TOKEN;
    case 'Azure-DevOps':
      return process.env.AZURE_DEVOPS_TOKEN;
    default:
      return undefined;
  }
}

/**
 * Process all collected systems (shared between interactive and headless modes)
 */
async function processSystems(
  systems: CISystemInfo[],
  storageService: StorageService,
  evaluationService: EvaluationService,
  fetchCommits: boolean
) {
  for (const { system, config, repos } of systems) {
    console.log(`\nProcessing ${system.constructor.name.replace('System', '')}...`);
    
    evaluationService.setConfig(config);
    
    // Handle force reload
    if (config.forceReload) {
      console.log('Force reload enabled - fetching fresh repository list...');
      const freshRepos = await system.getRepos();
      
      const systemDir = path.join('contributors', system.constructor.name.toLowerCase().replace('system', ''));
      try {
        await fs.rm(systemDir, { recursive: true, force: true });
        console.log(`Cleared existing data in ${systemDir}`);
      } catch (error) {
        console.error(`Error clearing ${systemDir}:`, error);
      }
      
      await storageService.writeRepoList(freshRepos, system.constructor.name.replace('System', ''));
    }
    
    const includedRepos = await storageService.readRepoList(system.constructor.name.replace('System', ''));
    console.log(`Processing ${includedRepos.length} included repositories`);

    if (fetchCommits) {
      for (const repo of includedRepos) {
        console.log(`\nProcessing ${repo.path}...`);
        try {
          if (!config.forceReload) {
            const commitFile = path.join('contributors', system.constructor.name.toLowerCase().replace('system', ''), repo.path.replace(/\//g, '_'), 'commits.json');
            if (await fs.access(commitFile).then(() => true).catch(() => false)) {
              console.log(`Skipping ${repo.path} - commit file already exists`);
              continue;
            }
          }

          const commits = await system.getCommits(repo);
          await storageService.storeCommits(system.constructor.name.replace('System', ''), repo, commits);
          console.log(`Stored commits for ${repo.path}`);
        } catch (error) {
          console.error(`Error processing ${repo.path}:`, error);
        }
      }
    }

    const evaluation = await evaluationService.evaluateContributors(includedRepos, system.constructor.name.replace('System', ''));
    console.log(`\nFound ${evaluation.systemContributors.contributors.length} unique contributors across all repositories`);
    
    await storageService.writeCommittersPerRepo(includedRepos);
    console.log(`\nFinished processing ${system.constructor.name.replace('System', '')}`);
  }
}

async function main() {
  try {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log(getHelpText());
      process.exit(0);
    }

    // Parse command-line arguments
    const headlessOptions = parseArgs();

    // If headless mode, run headless handler
    if (headlessOptions.enabled) {
      await runHeadlessMode(headlessOptions);
      console.log('\nDone! Check the contributors directory for the generated files.');
      return;
    }

    // Interactive mode (existing code)
    const storageService = new FileStorageService();
    const evaluationService = new EvaluationService();
    const configService = new ConfigService();
    const systems: CISystemInfo[] = [];
    let addAnother = true;

    // Handle global network configuration (SSL and proxy) - applies to all CI systems
    let globalNetworkConfig = await configService.readGlobalNetworkConfig();
    
    if (globalNetworkConfig) {
      // Show existing global network config
      console.log('\nExisting global network configuration found:');
      console.log('----------------------------------------');
      if (globalNetworkConfig.ssl) {
        console.log(`SSL: rejectUnauthorized=${globalNetworkConfig.ssl.rejectUnauthorized !== false}, CA=${globalNetworkConfig.ssl.caFile || 'none'}`);
      } else {
        console.log('SSL: Not configured');
      }
      if (globalNetworkConfig.proxy) {
        console.log(`Proxy: ${globalNetworkConfig.proxy.host}:${globalNetworkConfig.proxy.port} (${globalNetworkConfig.proxy.protocol || 'http'})`);
      } else {
        console.log('Proxy: Not configured');
      }
      if (globalNetworkConfig.rateLimit) {
        console.log(`Rate Limit: ${globalNetworkConfig.rateLimit.requestsPerHour || 'default'}/hour, ${globalNetworkConfig.rateLimit.requestsPerMinute || 'default'}/min, ${globalNetworkConfig.rateLimit.delayBetweenRequests || 'default'}ms delay`);
      } else {
        console.log('Rate Limit: Not configured');
      }
      console.log('----------------------------------------\n');
      
      const { useExistingNetwork } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useExistingNetwork',
          message: 'Use existing global network configuration?',
          default: true,
        },
      ]);
      
      if (!useExistingNetwork) {
        globalNetworkConfig = await CLI.getGlobalNetworkConfig();
        if (globalNetworkConfig.ssl || globalNetworkConfig.proxy || globalNetworkConfig.rateLimit) {
          await configService.writeGlobalNetworkConfig(globalNetworkConfig);
          console.log('Global network configuration saved.\n');
        }
      }
    } else {
      // No existing config, ask if user wants to configure
      globalNetworkConfig = await CLI.getGlobalNetworkConfig();
      if (globalNetworkConfig.ssl || globalNetworkConfig.proxy || globalNetworkConfig.rateLimit) {
        await configService.writeGlobalNetworkConfig(globalNetworkConfig);
        console.log('Global network configuration saved.\n');
      }
    }

    // Initialize HTTP client with global network configuration
    await httpClient.initialize(globalNetworkConfig);
    if (process.argv.includes('--debug')) {
      console.log('HTTP client initialized with global network configuration');
    }

    // Get initial mode
    const { mode } = await CLI.getInitialMode();

    if (mode === 'fetch') {
      // First phase: Collect all CI systems and their repositories
      while (addAnother) {
        // Get CI system selection
        const { ciSystemName, debug } = await CLI.getOptions();

        // Initialize CI system
        let ciSystem: CISystem;
        switch (ciSystemName) {
          case 'GitHub':
            console.log('Processing GitHub');
            ciSystem = new GitHubSystem();
            break;
          case 'GitLab':
            console.log('Processing GitLab');
            ciSystem = new GitLabSystem();
            break;
          case 'Azure-DevOps':
            console.log('Processing Azure-DevOps');
            ciSystem = new AzureDevOpsSystem();
            break;
          default:
            throw new Error(`Unsupported CI system: ${ciSystemName}`);
        }

        // Try to read existing config
        const { config: existingConfig, useExisting } = await configService.readConfig(ciSystemName);
        
        // If no config exists or user wants to override, get new config
        let config: CISystemConfig;
        if (!existingConfig || !useExisting) {
          config = await CLI.getConfig(ciSystemName);
          console.log('\nSaving configuration...');
          // Save the new config
          await configService.writeConfig(ciSystemName, config);
          console.log('Configuration saved.\n');
        } else {
          config = existingConfig;
        }

        // Ask about force reload if using existing config
        if (useExisting) {
          const forceReload = await configService.promptForceReload();
          config.forceReload = forceReload;
        }

        console.log('Initializing Azure DevOps connection...');
        await ciSystem.setConfig(config);
        await storageService.setConfig(config);
        
        // Get repositories
        console.log(`\nFetching repositories for ${ciSystemName}...`);
        const repos = await ciSystem.getRepos();
        if (process.argv.includes('--debug')) {
          console.log('--------------------------------');
          console.log('index.ts main');
          console.log('Repos: ');
          console.log(repos);
          console.log('--------------------------------');
        }
        console.log(`Found ${repos.length} repositories`);

        // Write repository list to Excel
        if (process.argv.includes('--debug')) {
          console.log('--------------------------------');
          console.log('index.ts - Before writeRepoList');
          console.log('Constructor name:', ciSystem.constructor.name);
          console.log('After replace:', ciSystem.constructor.name.replace('System', ''));
          console.log('--------------------------------');
        }
        await storageService.writeRepoList(repos, ciSystem.constructor.name.replace('System', ''));

        // Ask if user wants to review repositories
        const { reviewRepos } = await CLI.promptReviewRepos(ciSystemName);
        if (reviewRepos) {
          const excelPath = path.join(process.cwd(), 'contributors', `repositories-${ciSystemName.toLowerCase()}.xlsx`);
          console.log(`\nPlease review the repository list in: ${excelPath}`);
          console.log('The tool is waiting. Press Enter when you are done reviewing the file...');
          
          // Ensure stdin is in the right mode
          process.stdin.setRawMode(false);
          process.stdin.resume();
          
          // Wait for user input
          await new Promise<void>((resolve) => {
            process.stdin.once('data', () => {
              process.stdin.pause();
              resolve();
            });
          });
        }

        // Store system info
        systems.push({ system: ciSystem, config, repos });

        // Ask if user wants to add another CI system
        const { addAnother: addMore } = await CLI.promptAddAnother();
        addAnother = addMore;
      }
    } else {
      // Evaluation only mode: Just load existing data
      for (const ciSystemName of ['GitHub', 'GitLab', 'Azure-DevOps']) {
        try {
          const repos = await storageService.readRepoList(ciSystemName.replace('-', ''));
          if (repos.length > 0) {
            let ciSystem: CISystem;
            switch (ciSystemName) {
              case 'GitHub':
                console.log('Processing GitHub');
                console.log('##################');
                ciSystem = new GitHubSystem();
                break;
              case 'GitLab':
                console.log('Processing GitLab');
                console.log('##################');
                ciSystem = new GitLabSystem();
                break;
              case 'Azure-DevOps':
                ciSystem = new AzureDevOpsSystem();
                break;
              default:
                continue;
            }
            systems.push({ system: ciSystem, config: {} as CISystemConfig, repos });
          }
        } catch (error) {
          console.log(`No existing data found for ${ciSystemName}`);
        }
      }
    }

    // Second phase: Process all collected systems
    await processSystems(systems, storageService, evaluationService, mode === 'fetch');

    console.log('\nDone! Check the contributors directory for the generated files.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 