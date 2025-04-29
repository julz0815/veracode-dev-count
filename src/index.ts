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

async function main() {
  try {
    const storageService = new FileStorageService();
    const evaluationService = new EvaluationService();
    const configService = new ConfigService();
    const systems: CISystemInfo[] = [];
    let addAnother = true;

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
          // Save the new config
          await configService.writeConfig(ciSystemName, config);
        } else {
          config = existingConfig;
        }

        // Ask about force reload if using existing config
        if (useExisting) {
          const forceReload = await configService.promptForceReload();
          config.forceReload = forceReload;
        }

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
    for (const { system, config, repos } of systems) {
      console.log(`\nProcessing ${system.constructor.name.replace('System', '')}...`);
      
      // Set the config for the evaluation service
      evaluationService.setConfig(config);
      
      if (process.argv.includes('--debug')) {
        console.log('--------------------------------');
        console.log('index.ts - Before readRepoList');
        console.log('Constructor name:', system.constructor.name);
        console.log('After replace:', system.constructor.name.replace('System', ''));
        console.log('--------------------------------');
      }
      
      // Handle force reload
      if (config.forceReload) {
        console.log('Force reload enabled - fetching fresh repository list...');
        const freshRepos = await system.getRepos();
        
        // Delete existing folder for this CI system
        const systemDir = path.join('contributors', system.constructor.name.toLowerCase().replace('system', ''));
        try {
          await fs.rm(systemDir, { recursive: true, force: true });
          console.log(`Cleared existing data in ${systemDir}`);
        } catch (error) {
          console.error(`Error clearing ${systemDir}:`, error);
        }
        
        // Write fresh repository list
        await storageService.writeRepoList(freshRepos, system.constructor.name.replace('System', ''));
      }
      
      // Read back the repository list with included repositories
      const includedRepos = await storageService.readRepoList(system.constructor.name.replace('System', ''));
      console.log(`Processing ${includedRepos.length} included repositories`);

      if (mode === 'fetch') {
        // Process each included repository
        for (const repo of includedRepos) {
          console.log(`\nProcessing ${repo.path}...`);
          try {
            // Check if force reload is disabled and file exists
            if (!config.forceReload) {
              const commitFile = path.join('contributors', system.constructor.name.toLowerCase().replace('system', ''), repo.path.replace(/\//g, '_'), 'commits.json');
              if (process.argv.includes('--debug')) {
                console.log('Force reload is disabled, checking if commit file exists');
                console.log('Repo file Path: ' + repo.path);
                console.log('Commit file Path: ' + commitFile);
              }
              
              if (await fs.access(commitFile).then(() => true).catch(() => false)) {
                console.log(`Skipping ${repo.path} - commit file already exists`);
                continue;
              }
            }

            // Get commits for the last 90 days
            const commits = await system.getCommits(repo);
            
            // Store the commits
            if (process.argv.includes('--debug')) {
              console.log(commits);
            }
            await storageService.storeCommits(system.constructor.name.replace('System', ''), repo, commits);
            console.log(`Stored commits for ${repo.path}`);
            
          } catch (error) {
            console.error(`Error processing ${repo.path}:`, error);
          }
        }
      }

      // Evaluate contributors for this CI system
      const evaluation = await evaluationService.evaluateContributors(includedRepos, system.constructor.name.replace('System', ''));
      console.log(`\nFound ${evaluation.systemContributors.contributors.length} unique contributors across all repositories`);
      
      // Write summary
      await storageService.writeCommittersPerRepo(includedRepos);
      console.log(`\nFinished processing ${system.constructor.name.replace('System', '')}`);
    }

    console.log('\nDone! Check the contributors directory for the generated files.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 