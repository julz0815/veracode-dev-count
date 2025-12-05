"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("./common/storage");
const github_1 = require("./plugins/github");
const gitlab_1 = require("./plugins/gitlab");
const azure_devops_1 = require("./plugins/azure-devops");
const cli_1 = require("./cli");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const evaluation_1 = require("./common/evaluation");
const config_1 = require("./common/config");
const http_client_1 = require("./common/http-client");
const args_1 = require("./common/args");
const git_service_1 = require("./common/git-service");
const inquirer_1 = __importDefault(require("inquirer"));
/**
 * Run in headless mode - uses existing configurations, no interactive prompts
 */
async function runHeadlessMode(options) {
    const storageService = new storage_1.FileStorageService();
    const evaluationService = new evaluation_1.EvaluationService();
    // Ensure both services use the same contributorsDir
    evaluationService.setContributorsDir(storageService.getContributorsDir());
    // Use custom config path if provided
    const configService = new config_1.ConfigService(options.configFile);
    if (options.configFile) {
        console.log(`Using custom config file: ${options.configFile}\n`);
    }
    const systems = [];
    console.log('Running in headless mode...\n');
    // Set custom repositories file paths if provided (headless mode only)
    if (options.repositoriesFile) {
        // Apply to all CI systems
        storageService.setCustomRepositoriesFile('github', options.repositoriesFile);
        storageService.setCustomRepositoriesFile('gitlab', options.repositoriesFile);
        storageService.setCustomRepositoriesFile('azuredevops', options.repositoriesFile);
        evaluationService.setCustomRepositoriesFile('github', options.repositoriesFile);
        evaluationService.setCustomRepositoriesFile('gitlab', options.repositoriesFile);
        evaluationService.setCustomRepositoriesFile('azuredevops', options.repositoriesFile);
        console.log(`Using custom repositories file for all CI systems: ${options.repositoriesFile}\n`);
    }
    // Set CI system specific repositories file paths
    if (options.repositoriesFileGitHub) {
        storageService.setCustomRepositoriesFile('github', options.repositoriesFileGitHub);
        evaluationService.setCustomRepositoriesFile('github', options.repositoriesFileGitHub);
        console.log(`Using custom GitHub repositories file: ${options.repositoriesFileGitHub}`);
    }
    if (options.repositoriesFileGitLab) {
        storageService.setCustomRepositoriesFile('gitlab', options.repositoriesFileGitLab);
        evaluationService.setCustomRepositoriesFile('gitlab', options.repositoriesFileGitLab);
        console.log(`Using custom GitLab repositories file: ${options.repositoriesFileGitLab}`);
    }
    if (options.repositoriesFileAzureDevOps) {
        storageService.setCustomRepositoriesFile('azuredevops', options.repositoriesFileAzureDevOps);
        evaluationService.setCustomRepositoriesFile('azuredevops', options.repositoriesFileAzureDevOps);
        console.log(`Using custom Azure DevOps repositories file: ${options.repositoriesFileAzureDevOps}`);
    }
    // Use existing global network config or empty
    let globalNetworkConfig = await configService.readGlobalNetworkConfig() || {};
    if (globalNetworkConfig.ssl || globalNetworkConfig.proxy || globalNetworkConfig.rateLimit) {
        console.log('Using existing global network configuration');
    }
    // Initialize HTTP client
    await http_client_1.httpClient.initialize(globalNetworkConfig);
    const mode = options.mode || 'fetch';
    const ciSystemsToProcess = options.ciSystems || ['github', 'gitlab', 'azure-devops'];
    if (mode === 'fetch') {
        // Process each specified CI system
        for (const ciSystemNameLower of ciSystemsToProcess) {
            // Convert to proper case
            let ciSystemName;
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
                if (process.argv.includes('--debug')) {
                    console.error(`Config service path: ${configService.configPath || 'unknown'}`);
                }
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
            let ciSystem;
            switch (ciSystemName) {
                case 'GitHub':
                    ciSystem = new github_1.GitHubSystem();
                    // Set custom repositories file if provided (headless mode)
                    if (options.repositoriesFileGitHub) {
                        ciSystem.setCustomRepositoriesFile(options.repositoriesFileGitHub);
                    }
                    else if (options.repositoriesFile) {
                        ciSystem.setCustomRepositoriesFile(options.repositoriesFile);
                    }
                    break;
                case 'GitLab':
                    ciSystem = new gitlab_1.GitLabSystem();
                    // Set custom repositories file if provided (headless mode)
                    if (options.repositoriesFileGitLab) {
                        ciSystem.setCustomRepositoriesFile(options.repositoriesFileGitLab);
                    }
                    else if (options.repositoriesFile) {
                        ciSystem.setCustomRepositoriesFile(options.repositoriesFile);
                    }
                    break;
                case 'Azure-DevOps':
                    ciSystem = new azure_devops_1.AzureDevOpsSystem();
                    // Set custom repositories file if provided (headless mode)
                    if (options.repositoriesFileAzureDevOps) {
                        ciSystem.setCustomRepositoriesFile(options.repositoriesFileAzureDevOps);
                    }
                    else if (options.repositoriesFile) {
                        ciSystem.setCustomRepositoriesFile(options.repositoriesFile);
                    }
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
            // Reload config to refresh includedRepos from the Excel file that was just written
            await ciSystem.setConfig(existingConfig);
            await storageService.setConfig(existingConfig);
            // Skip review in headless mode unless explicitly requested
            if (!options.skipReview) {
                console.log(`Repository list written. Review file if needed: contributors/repositories-${ciSystemNameLower}.xlsx`);
            }
            systems.push({ system: ciSystem, config: existingConfig, repos });
        }
    }
    else {
        // Evaluation mode: Load existing data
        for (const ciSystemNameLower of ciSystemsToProcess) {
            let ciSystemName;
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
                // Use the same custom repositories file path if set
                const ciSystemForFile = ciSystemName.replace('-', '').toLowerCase();
                const repos = await storageService.readRepoList(ciSystemForFile);
                if (repos.length > 0) {
                    let ciSystem;
                    switch (ciSystemName) {
                        case 'GitHub':
                            ciSystem = new github_1.GitHubSystem();
                            break;
                        case 'GitLab':
                            ciSystem = new gitlab_1.GitLabSystem();
                            break;
                        case 'Azure-DevOps':
                            ciSystem = new azure_devops_1.AzureDevOpsSystem();
                            break;
                        default:
                            continue;
                    }
                    const { config } = await configService.readConfig(ciSystemName);
                    systems.push({ system: ciSystem, config: config || {}, repos });
                }
            }
            catch (error) {
                console.log(`No existing data found for ${ciSystemName}`);
            }
        }
    }
    // Process all collected systems
    await processSystems(systems, storageService, evaluationService, mode === 'fetch');
    // In headless mode, generate CSVs and push to repository
    // Only run post-processing if we have systems to process
    if (mode === 'fetch' && systems.length > 0) {
        try {
            await handleHeadlessModePostProcessing(systems, storageService, evaluationService);
        }
        catch (error) {
            console.error('Error in headless mode post-processing:', error);
            // Don't fail the entire run if post-processing fails
            console.log('Continuing despite post-processing error...');
        }
    }
}
/**
 * Handle post-processing for headless mode: generate CSVs and push to git
 */
async function handleHeadlessModePostProcessing(systems, storageService, evaluationService) {
    const dateSuffix = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD format
    const filesToPush = [];
    console.log('\n=== Headless Mode Post-Processing ===');
    // Generate dated scm_summary.xlsx
    // Check if summary file exists first (it should have been created during processSystems)
    let summaryPath;
    try {
        summaryPath = await evaluationService.writeSummaryWithDate(dateSuffix);
    }
    catch (error) {
        console.error('Error generating summary file:', error);
        // Try to use the default summary file if dated one fails
        const defaultSummaryPath = path.join(process.cwd(), 'contributors', 'scm_summary.xlsx');
        try {
            await fs.access(defaultSummaryPath);
            summaryPath = defaultSummaryPath;
            console.log(`Using default summary file: ${defaultSummaryPath}`);
        }
        catch {
            throw new Error('Could not find or create summary file');
        }
    }
    filesToPush.push({
        sourcePath: summaryPath,
        destPath: path.join('dev-count-runs', `scm_summary_${dateSuffix}.xlsx`)
    });
    // Generate CSV files and add repositories Excel files for each CI system
    for (const { system, repos } of systems) {
        const ciSystemName = system.constructor.name.replace('System', '').toLowerCase();
        const includedRepos = await storageService.readRepoList(ciSystemName);
        // Add repositories Excel file to files to push
        // Respect the original folder location (don't move custom files to dev-count-runs)
        const reposFilePath = storageService.getRepositoriesFilePath(ciSystemName);
        try {
            await fs.access(reposFilePath);
            // Determine destination path: if it's a custom path, push it back to the same relative location
            // Otherwise, push it to the same location (contributors/) or dev-count-runs/ for default files
            const contributorsDir = storageService.getContributorsDir();
            const defaultReposPath = path.join(contributorsDir, `repositories-${ciSystemName}.xlsx`);
            const isCustomPath = path.resolve(reposFilePath) !== path.resolve(defaultReposPath);
            let destPath;
            if (isCustomPath) {
                // Custom path: push back to the same relative location from repo root
                destPath = path.relative(process.cwd(), reposFilePath);
                // Ensure it's a relative path (not absolute)
                if (path.isAbsolute(destPath) || destPath.startsWith('..')) {
                    // If it's outside the repo, just use the filename
                    destPath = path.basename(reposFilePath);
                }
            }
            else {
                // Default path: push back to the same location (contributors/)
                destPath = path.relative(process.cwd(), reposFilePath);
            }
            filesToPush.push({
                sourcePath: reposFilePath,
                destPath: destPath
            });
            console.log(`Added repositories file to push: ${reposFilePath} -> ${destPath}`);
        }
        catch (error) {
            console.log(`Repositories file not found at ${reposFilePath}, skipping...`);
        }
        if (includedRepos.length > 0) {
            // Pass evaluation service to use the same contributor extraction logic as Excel tabs
            const csvPath = await storageService.writeRunCSV(ciSystemName, includedRepos, dateSuffix, evaluationService);
            filesToPush.push({
                sourcePath: csvPath,
                destPath: path.join('dev-count-runs', path.basename(csvPath))
            });
        }
    }
    // Generate summary average CSV
    const summary = evaluationService.getSummary();
    const dateFormatted = dateSuffix.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); // Convert YYYYMMDD to YYYY-MM-DD
    const avgCsvPath = await storageService.writeSummaryAverageCSV({
        date: dateFormatted,
        gitlabContributors: summary.gitlabContributors,
        githubContributors: summary.githubContributors,
        azureDevOpsContributors: summary.azureDevOpsContributors,
        totalUniqueContributors: summary.totalUniqueContributors
    });
    filesToPush.push({
        sourcePath: avgCsvPath,
        destPath: path.join('dev-count-runs', 'scm_summary_average.csv')
    });
    // Push files to repository
    await pushFilesToRepository(filesToPush, `Dev count run ${dateSuffix}`);
    console.log('=== Headless Mode Post-Processing Complete ===\n');
}
/**
 * Push files to git repository using PAT authentication
 */
async function pushFilesToRepository(files, commitMessage) {
    const gitService = new git_service_1.GitService();
    // Try to get token from environment variables (check all CI systems)
    // For GitHub, prefer GITHUB_PAT (custom PAT) over GITHUB_TOKEN (may have limited permissions)
    const tokens = {
        github: process.env.GITHUB_PAT || process.env.GITHUB_TOKEN,
        gitlab: process.env.GITLAB_TOKEN,
        azureDevOps: process.env.AZURE_DEVOPS_TOKEN
    };
    // Use the first available token
    const token = tokens.github || tokens.gitlab || tokens.azureDevOps;
    if (!token) {
        console.log('No token found in environment variables. Skipping git push.');
        console.log('Set GITHUB_PAT (or GITHUB_TOKEN), GITLAB_TOKEN, or AZURE_DEVOPS_TOKEN to enable git push.');
        return;
    }
    try {
        // Check if we're in an Azure DevOps or GitLab repository
        const isAzureDevOps = await detectAzureDevOpsRepository();
        const isGitLab = await detectGitLabRepository();
        // For Azure DevOps, try to use System.AccessToken if available (in ADO pipelines)
        let tokenToUse = token;
        if (isAzureDevOps && process.env.SYSTEM_ACCESSTOKEN) {
            tokenToUse = process.env.SYSTEM_ACCESSTOKEN;
            console.log('Using Azure DevOps System.AccessToken for git push');
        }
        else if (isGitLab) {
            // For GitLab, prefer GITLAB_TOKEN (PAT with write_repository scope) for write operations
            // CI_JOB_TOKEN typically only has read permissions and may not be able to push
            if (tokens.gitlab) {
                tokenToUse = tokens.gitlab;
                console.log('Using GITLAB_TOKEN (PAT) for git push');
            }
            else if (process.env.CI_JOB_TOKEN && process.env.CI_PROJECT_URL) {
                // Fallback to CI_JOB_TOKEN if GITLAB_TOKEN is not available
                // Note: CI_JOB_TOKEN may not have write permissions - project settings may need to be configured
                tokenToUse = process.env.CI_JOB_TOKEN;
                console.log('Using GitLab CI_JOB_TOKEN for git push (may require project permissions to be enabled)');
            }
        }
        await gitService.initialize({ token: tokenToUse });
        await gitService.pushFilesToRepository(files, commitMessage);
    }
    catch (error) {
        console.error('Error pushing files to repository:', error);
        console.log('Continuing without git push...');
    }
}
/**
 * Detect if we're in an Azure DevOps repository (headless mode only)
 */
async function detectAzureDevOpsRepository() {
    try {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        const { stdout } = await execAsync('git config --get remote.origin.url');
        const remoteUrl = stdout.trim();
        return remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com');
    }
    catch {
        return false;
    }
}
/**
 * Detect if we're in a GitLab repository (headless mode only)
 */
async function detectGitLabRepository() {
    try {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        const { stdout } = await execAsync('git config --get remote.origin.url');
        const remoteUrl = stdout.trim();
        return remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab');
    }
    catch {
        // Also check CI environment variable
        return !!process.env.CI && !!process.env.GITLAB_CI;
    }
}
/**
 * Get token from environment variable
 * For GitHub, checks GITHUB_PAT first (custom PAT), then GITHUB_TOKEN (may be limited in CI)
 */
function getTokenFromEnv(ciSystemName) {
    switch (ciSystemName) {
        case 'GitHub':
            // Check for custom PAT first (for CI environments where GITHUB_TOKEN has limited permissions)
            return process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
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
async function processSystems(systems, storageService, evaluationService, fetchCommits) {
    for (const { system, config, repos } of systems) {
        console.log(`\nProcessing ${system.constructor.name.replace('System', '')}...`);
        evaluationService.setConfig(config);
        // Handle force reload
        if (config.forceReload) {
            console.log('Force reload enabled - fetching fresh repository list...');
            const freshRepos = await system.getRepos();
            const contributorsDir = storageService.getContributorsDir();
            const systemDir = path.join(contributorsDir, system.constructor.name.toLowerCase().replace('system', ''));
            try {
                await fs.rm(systemDir, { recursive: true, force: true });
                console.log(`Cleared existing data in ${systemDir}`);
            }
            catch (error) {
                console.error(`Error clearing ${systemDir}:`, error);
            }
            await storageService.writeRepoList(freshRepos, system.constructor.name.replace('System', ''));
        }
        // Reload config to refresh includedRepos from the Excel file (which may have been just written)
        await system.setConfig(config);
        await storageService.setConfig(config);
        const includedRepos = await storageService.readRepoList(system.constructor.name.replace('System', ''));
        console.log(`Processing ${includedRepos.length} included repositories`);
        if (fetchCommits) {
            for (const repo of includedRepos) {
                console.log(`\nProcessing ${repo.path}...`);
                try {
                    if (!config.forceReload) {
                        const contributorsDir = storageService.getContributorsDir();
                        const commitFile = path.join(contributorsDir, system.constructor.name.toLowerCase().replace('system', ''), repo.path.replace(/\//g, '_'), 'commits.json');
                        if (await fs.access(commitFile).then(() => true).catch(() => false)) {
                            console.log(`Skipping ${repo.path} - commit file already exists`);
                            continue;
                        }
                    }
                    const commits = await system.getCommits(repo);
                    if (process.argv.includes('--debug')) {
                        console.log(`  Fetched ${commits.length} commits for ${repo.path}`);
                    }
                    await storageService.storeCommits(system.constructor.name.replace('System', ''), repo, commits);
                    console.log(`Stored commits for ${repo.path}`);
                }
                catch (error) {
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
            console.log((0, args_1.getHelpText)());
            process.exit(0);
        }
        // Parse command-line arguments
        const headlessOptions = (0, args_1.parseArgs)();
        // If headless mode, run headless handler
        if (headlessOptions.enabled) {
            await runHeadlessMode(headlessOptions);
            console.log('\nDone! Check the contributors directory for the generated files.');
            return;
        }
        // Interactive mode (existing code)
        const storageService = new storage_1.FileStorageService();
        const evaluationService = new evaluation_1.EvaluationService();
        // Ensure both services use the same contributorsDir
        evaluationService.setContributorsDir(storageService.getContributorsDir());
        const configService = new config_1.ConfigService();
        const systems = [];
        let addAnother = true;
        // Handle global network configuration (SSL and proxy) - applies to all CI systems
        let globalNetworkConfig = await configService.readGlobalNetworkConfig();
        if (globalNetworkConfig) {
            // Show existing global network config
            console.log('\nExisting global network configuration found:');
            console.log('----------------------------------------');
            if (globalNetworkConfig.ssl) {
                console.log(`SSL: rejectUnauthorized=${globalNetworkConfig.ssl.rejectUnauthorized !== false}, CA=${globalNetworkConfig.ssl.caFile || 'none'}`);
            }
            else {
                console.log('SSL: Not configured');
            }
            if (globalNetworkConfig.proxy) {
                console.log(`Proxy: ${globalNetworkConfig.proxy.host}:${globalNetworkConfig.proxy.port} (${globalNetworkConfig.proxy.protocol || 'http'})`);
            }
            else {
                console.log('Proxy: Not configured');
            }
            if (globalNetworkConfig.rateLimit) {
                console.log(`Rate Limit: ${globalNetworkConfig.rateLimit.requestsPerHour || 'default'}/hour, ${globalNetworkConfig.rateLimit.requestsPerMinute || 'default'}/min, ${globalNetworkConfig.rateLimit.delayBetweenRequests || 'default'}ms delay`);
            }
            else {
                console.log('Rate Limit: Not configured');
            }
            console.log('----------------------------------------\n');
            const { useExistingNetwork } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'useExistingNetwork',
                    message: 'Use existing global network configuration?',
                    default: true,
                },
            ]);
            if (!useExistingNetwork) {
                globalNetworkConfig = await cli_1.CLI.getGlobalNetworkConfig();
                if (globalNetworkConfig.ssl || globalNetworkConfig.proxy || globalNetworkConfig.rateLimit) {
                    await configService.writeGlobalNetworkConfig(globalNetworkConfig);
                    console.log('Global network configuration saved.\n');
                }
            }
        }
        else {
            // No existing config, ask if user wants to configure
            globalNetworkConfig = await cli_1.CLI.getGlobalNetworkConfig();
            if (globalNetworkConfig.ssl || globalNetworkConfig.proxy || globalNetworkConfig.rateLimit) {
                await configService.writeGlobalNetworkConfig(globalNetworkConfig);
                console.log('Global network configuration saved.\n');
            }
        }
        // Initialize HTTP client with global network configuration
        await http_client_1.httpClient.initialize(globalNetworkConfig);
        if (process.argv.includes('--debug')) {
            console.log('HTTP client initialized with global network configuration');
        }
        // Get initial mode
        const { mode } = await cli_1.CLI.getInitialMode();
        if (mode === 'fetch') {
            // First phase: Collect all CI systems and their repositories
            while (addAnother) {
                // Get CI system selection
                const { ciSystemName, debug } = await cli_1.CLI.getOptions();
                // Initialize CI system
                let ciSystem;
                switch (ciSystemName) {
                    case 'GitHub':
                        console.log('Processing GitHub');
                        ciSystem = new github_1.GitHubSystem();
                        break;
                    case 'GitLab':
                        console.log('Processing GitLab');
                        ciSystem = new gitlab_1.GitLabSystem();
                        break;
                    case 'Azure-DevOps':
                        console.log('Processing Azure-DevOps');
                        ciSystem = new azure_devops_1.AzureDevOpsSystem();
                        break;
                    default:
                        throw new Error(`Unsupported CI system: ${ciSystemName}`);
                }
                // Try to read existing config
                const { config: existingConfig, useExisting } = await configService.readConfig(ciSystemName);
                // If no config exists or user wants to override, get new config
                let config;
                if (!existingConfig || !useExisting) {
                    config = await cli_1.CLI.getConfig(ciSystemName);
                    console.log('\nSaving configuration...');
                    // Save the new config
                    await configService.writeConfig(ciSystemName, config);
                    console.log('Configuration saved.\n');
                }
                else {
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
                // Reload config to refresh includedRepos from the Excel file that was just written
                await ciSystem.setConfig(config);
                await storageService.setConfig(config);
                // Ask if user wants to review repositories
                const { reviewRepos } = await cli_1.CLI.promptReviewRepos(ciSystemName);
                if (reviewRepos) {
                    const contributorsDir = storageService.getContributorsDir();
                    const excelPath = path.join(contributorsDir, `repositories-${ciSystemName.toLowerCase()}.xlsx`);
                    console.log(`\nPlease review the repository list in: ${excelPath}`);
                    console.log('The tool is waiting. Press Enter when you are done reviewing the file...');
                    // Ensure stdin is in the right mode
                    process.stdin.setRawMode(false);
                    process.stdin.resume();
                    // Wait for user input
                    await new Promise((resolve) => {
                        process.stdin.once('data', () => {
                            process.stdin.pause();
                            resolve();
                        });
                    });
                    // Reload config again after user review in case they changed Include values
                    await ciSystem.setConfig(config);
                    await storageService.setConfig(config);
                }
                // Store system info
                systems.push({ system: ciSystem, config, repos });
                // Ask if user wants to add another CI system
                const { addAnother: addMore } = await cli_1.CLI.promptAddAnother();
                addAnother = addMore;
            }
        }
        else {
            // Evaluation only mode: Just load existing data
            for (const ciSystemName of ['GitHub', 'GitLab', 'Azure-DevOps']) {
                try {
                    const repos = await storageService.readRepoList(ciSystemName.replace('-', ''));
                    if (repos.length > 0) {
                        let ciSystem;
                        switch (ciSystemName) {
                            case 'GitHub':
                                console.log('Processing GitHub');
                                console.log('##################');
                                ciSystem = new github_1.GitHubSystem();
                                break;
                            case 'GitLab':
                                console.log('Processing GitLab');
                                console.log('##################');
                                ciSystem = new gitlab_1.GitLabSystem();
                                break;
                            case 'Azure-DevOps':
                                ciSystem = new azure_devops_1.AzureDevOpsSystem();
                                break;
                            default:
                                continue;
                        }
                        systems.push({ system: ciSystem, config: {}, repos });
                    }
                }
                catch (error) {
                    console.log(`No existing data found for ${ciSystemName}`);
                }
            }
        }
        // Second phase: Process all collected systems
        await processSystems(systems, storageService, evaluationService, mode === 'fetch');
        console.log('\nDone! Check the contributors directory for the generated files.');
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}
main();
