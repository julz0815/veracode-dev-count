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
exports.ConfigService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const yaml = __importStar(require("js-yaml"));
const inquirer_1 = __importDefault(require("inquirer"));
class ConfigService {
    constructor(customConfigPath) {
        if (customConfigPath) {
            this.configPath = customConfigPath;
        }
        else {
            const homeDir = os.homedir();
            this.configPath = path.join(homeDir, '.veracode', 'veracode-devcount.yml');
        }
    }
    displayConfig(config) {
        console.log('\nExisting configuration found:');
        console.log('----------------------------');
        console.log(`CI System: ${config['ci-system']}`);
        console.log(`Domain: ${config.domain || 'Not set'}`);
        if (config['ci-token']) {
            const tokenLength = config['ci-token'].length;
            const maskedToken = tokenLength > 5
                ? `${config['ci-token'].substring(0, 5)}${'*'.repeat(tokenLength - 5)}`
                : '***';
            console.log(`Token: ${maskedToken}`);
        }
        else {
            console.log(`Token: Not set`);
        }
        if (config.regex) {
            console.log(`Regex Pattern: ${config.regex}`);
        }
        if (config['regex-file']) {
            console.log(`Regex File: ${config['regex-file']}`);
        }
        if (config.org) {
            console.log(`Organization: ${config.org}`);
        }
        console.log('----------------------------\n');
    }
    async readConfig(ciSystem) {
        try {
            const fileContent = await fs.readFile(this.configPath, 'utf-8');
            const config = yaml.load(fileContent);
            if (!config['dev-count']) {
                return { config: null, useExisting: false };
            }
            const systemConfig = config['dev-count'].find(c => c['ci-system'] === ciSystem.toLowerCase());
            if (!systemConfig) {
                if (process.argv.includes('--debug')) {
                    console.error(`No config found for CI system: ${ciSystem.toLowerCase()}`);
                    console.error(`Available CI systems in config:`, config['dev-count'].map((c) => c['ci-system']));
                }
                return { config: null, useExisting: false };
            }
            // Check if we're in headless mode
            // Also check for CI environment variables (GitHub Actions, GitLab CI, etc.)
            const isHeadless = process.argv.includes('--headless') ||
                process.argv.includes('--non-interactive') ||
                process.argv.includes('-n') ||
                !!process.env.CI || // Generic CI environment
                !!process.env.GITHUB_ACTIONS || // GitHub Actions
                !!process.env.GITLAB_CI || // GitLab CI
                !!process.env.TF_BUILD; // Azure DevOps
            if (process.argv.includes('--debug')) {
                console.log(`Headless mode detected: ${isHeadless}`);
                console.log(`Process argv:`, process.argv);
                console.log(`CI environment:`, {
                    CI: process.env.CI,
                    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
                    GITLAB_CI: process.env.GITLAB_CI,
                    TF_BUILD: process.env.TF_BUILD
                });
            }
            // Display the existing configuration
            this.displayConfig(systemConfig);
            // In headless mode, skip the interactive prompt and return the config directly
            if (isHeadless) {
                if (process.argv.includes('--debug')) {
                    console.log('Returning config for headless mode');
                }
                const config = {
                    token: systemConfig['ci-token'] || '',
                    domain: systemConfig.domain || '',
                    orgs: systemConfig.org || undefined,
                    regexPattern: systemConfig.regex,
                    regexFile: systemConfig['regex-file'],
                    ciSystem: ciSystem,
                };
                return {
                    config: config,
                    useExisting: true
                };
            }
            // Ask if the configuration is correct (interactive mode only)
            // If we reach here and it's not headless, we're in interactive mode
            try {
                const { useExisting } = await inquirer_1.default.prompt([
                    {
                        type: 'confirm',
                        name: 'useExisting',
                        message: 'Is this configuration correct?',
                        default: true
                    }
                ]);
                if (useExisting) {
                    return {
                        config: {
                            token: systemConfig['ci-token'] || '',
                            domain: systemConfig.domain || '',
                            orgs: systemConfig.org || undefined,
                            regexPattern: systemConfig.regex,
                            regexFile: systemConfig['regex-file'],
                            ciSystem: ciSystem,
                        },
                        useExisting: true
                    };
                }
                return { config: null, useExisting: false };
            }
            catch (error) {
                // If inquirer fails (e.g., in non-interactive environment), treat as headless
                console.log('Interactive prompt failed, treating as headless mode');
                return {
                    config: {
                        token: systemConfig['ci-token'] || '',
                        domain: systemConfig.domain || '',
                        orgs: systemConfig.org || undefined,
                        regexPattern: systemConfig.regex,
                        regexFile: systemConfig['regex-file'],
                        ciSystem: ciSystem,
                    },
                    useExisting: true
                };
            }
        }
        catch (error) {
            // If file doesn't exist or can't be read, return null
            console.error('Error reading config file:', error);
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
            return { config: null, useExisting: false };
        }
    }
    async promptForceReload() {
        const { forceReload } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'forceReload',
                message: 'Force reload repositories?',
                default: false
            }
        ]);
        return forceReload;
    }
    async writeConfig(ciSystem, config) {
        try {
            // Create .veracode directory if it doesn't exist
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });
            if (process.argv.includes('--debug')) {
                console.log(`Config directory: ${configDir}`);
                console.log(`Config file: ${this.configPath}`);
            }
            let existingConfig = {};
            try {
                const fileContent = await fs.readFile(this.configPath, 'utf-8');
                existingConfig = yaml.load(fileContent) || {};
                if (process.argv.includes('--debug')) {
                    console.log('Existing config:', existingConfig);
                }
            }
            catch (error) {
                // If file doesn't exist or can't be read, we'll create a new one
                if (process.argv.includes('--debug')) {
                    console.log('No existing config file found, creating new one');
                }
            }
            // Initialize dev-count array if it doesn't exist
            if (!existingConfig['dev-count']) {
                existingConfig['dev-count'] = [];
            }
            // Remove existing config for this CI system if it exists
            existingConfig['dev-count'] = existingConfig['dev-count'].filter((c) => c['ci-system'] !== ciSystem.toLowerCase());
            // Add new config
            const newConfig = {
                'ci-system': ciSystem.toLowerCase(),
                'ci-token': config.token || '',
                domain: config.domain || '',
                regex: config.regexPattern,
                'regex-file': config.regexFile
            };
            if (ciSystem.toLowerCase() === 'azure-devops' && config.orgs) {
                newConfig.org = config.orgs;
            }
            if (process.argv.includes('--debug')) {
                console.log('New config to be added:', newConfig);
            }
            existingConfig['dev-count'].push(newConfig);
            // Write updated config while preserving other content
            const yamlContent = yaml.dump(existingConfig, {
                noRefs: true,
                noCompatMode: true,
                styles: {
                    '!!null': 'empty',
                    '!!str': 'plain'
                },
                lineWidth: -1,
                quotingType: '"',
                forceQuotes: true
            });
            if (process.argv.includes('--debug')) {
                console.log('Final YAML content:', yamlContent);
            }
            await fs.writeFile(this.configPath, yamlContent);
        }
        catch (error) {
            console.error('Error writing config file:', error);
        }
    }
    /**
     * Read global network configuration (SSL and proxy settings)
     */
    async readGlobalNetworkConfig() {
        try {
            const fileContent = await fs.readFile(this.configPath, 'utf-8');
            const config = yaml.load(fileContent);
            if (!config['global-network']) {
                return null;
            }
            const globalConfig = config['global-network'];
            return {
                ssl: globalConfig.ssl ? {
                    rejectUnauthorized: globalConfig.ssl['reject-unauthorized'],
                    caFile: globalConfig.ssl['ca-file'],
                    certFile: globalConfig.ssl['cert-file'],
                    keyFile: globalConfig.ssl['key-file']
                } : undefined,
                proxy: globalConfig.proxy ? {
                    host: globalConfig.proxy.host || '',
                    port: globalConfig.proxy.port || 0,
                    protocol: globalConfig.proxy.protocol,
                    auth: globalConfig.proxy.auth ? {
                        username: globalConfig.proxy.auth.username || '',
                        password: globalConfig.proxy.auth.password || ''
                    } : undefined
                } : undefined,
                rateLimit: globalConfig['rate-limit'] ? {
                    requestsPerHour: globalConfig['rate-limit']['requests-per-hour'],
                    requestsPerMinute: globalConfig['rate-limit']['requests-per-minute'],
                    delayBetweenRequests: globalConfig['rate-limit']['delay-between-requests'],
                    maxRetries: globalConfig['rate-limit']['max-retries'],
                    backoffMultiplier: globalConfig['rate-limit']['backoff-multiplier']
                } : undefined
            };
        }
        catch (error) {
            // If file doesn't exist or can't be read, return null
            return null;
        }
    }
    /**
     * Write global network configuration (SSL and proxy settings)
     */
    async writeGlobalNetworkConfig(networkConfig) {
        try {
            // Create .veracode directory if it doesn't exist
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });
            let existingConfig = {};
            try {
                const fileContent = await fs.readFile(this.configPath, 'utf-8');
                existingConfig = yaml.load(fileContent) || {};
            }
            catch (error) {
                // If file doesn't exist, we'll create a new one
            }
            // Initialize global-network if it doesn't exist
            if (!existingConfig['global-network']) {
                existingConfig['global-network'] = {};
            }
            // Update global network config
            if (networkConfig.ssl) {
                existingConfig['global-network'].ssl = {
                    'reject-unauthorized': networkConfig.ssl.rejectUnauthorized,
                    'ca-file': networkConfig.ssl.caFile,
                    'cert-file': networkConfig.ssl.certFile,
                    'key-file': networkConfig.ssl.keyFile
                };
            }
            else {
                delete existingConfig['global-network'].ssl;
            }
            if (networkConfig.proxy) {
                existingConfig['global-network'].proxy = {
                    host: networkConfig.proxy.host,
                    port: networkConfig.proxy.port,
                    protocol: networkConfig.proxy.protocol,
                    auth: networkConfig.proxy.auth ? {
                        username: networkConfig.proxy.auth.username,
                        password: networkConfig.proxy.auth.password
                    } : undefined
                };
            }
            else {
                delete existingConfig['global-network'].proxy;
            }
            if (networkConfig.rateLimit) {
                existingConfig['global-network']['rate-limit'] = {
                    'requests-per-hour': networkConfig.rateLimit.requestsPerHour,
                    'requests-per-minute': networkConfig.rateLimit.requestsPerMinute,
                    'delay-between-requests': networkConfig.rateLimit.delayBetweenRequests,
                    'max-retries': networkConfig.rateLimit.maxRetries,
                    'backoff-multiplier': networkConfig.rateLimit.backoffMultiplier
                };
            }
            else {
                delete existingConfig['global-network']['rate-limit'];
            }
            // Write updated config
            const yamlContent = yaml.dump(existingConfig, {
                noRefs: true,
                noCompatMode: true,
                styles: {
                    '!!null': 'empty',
                    '!!str': 'plain'
                },
                lineWidth: -1,
                quotingType: '"',
                forceQuotes: true
            });
            await fs.writeFile(this.configPath, yamlContent);
        }
        catch (error) {
            console.error('Error writing global network config:', error);
        }
    }
}
exports.ConfigService = ConfigService;
