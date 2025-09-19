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
    constructor() {
        const homeDir = os.homedir();
        this.configPath = path.join(homeDir, '.veracode', 'veracode-devcount.yml');
    }
    displayConfig(config) {
        console.log('\nExisting configuration found:');
        console.log('----------------------------');
        console.log(`CI System: ${config['ci-system']}`);
        console.log(`Domain: ${config.domain || 'Not set'}`);
        console.log(`Token: ${config['ci-token'].substring(0, 5)}${'*'.repeat(config['ci-token'].length - 5)}`);
        if (config.regex) {
            console.log(`Regex Pattern: ${config.regex}`);
        }
        if (config['regex-file']) {
            console.log(`Regex File: ${config['regex-file']}`);
        }
        if (config.org) {
            console.log(`Organization: ${config.org}`);
        }
        if (config['rate-limit']) {
            console.log(`Rate Limit: ${config['rate-limit']['requests-per-hour'] || 'default'} req/hour, ${config['rate-limit']['delay-between-requests'] || 'default'}ms delay`);
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
                return { config: null, useExisting: false };
            }
            // Display the existing configuration
            this.displayConfig(systemConfig);
            // Ask if the configuration is correct
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
                        token: systemConfig['ci-token'],
                        domain: systemConfig.domain || '',
                        orgs: systemConfig.org || undefined,
                        regexPattern: systemConfig.regex,
                        regexFile: systemConfig['regex-file'],
                        ciSystem: ciSystem,
                        rateLimit: systemConfig['rate-limit'] ? {
                            requestsPerHour: systemConfig['rate-limit']['requests-per-hour'],
                            delayBetweenRequests: systemConfig['rate-limit']['delay-between-requests'],
                            maxRetries: systemConfig['rate-limit']['max-retries'],
                            backoffMultiplier: systemConfig['rate-limit']['backoff-multiplier']
                        } : undefined
                    },
                    useExisting: true
                };
            }
            return { config: null, useExisting: false };
        }
        catch (error) {
            // If file doesn't exist or can't be read, return null
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
            if (config.rateLimit) {
                newConfig['rate-limit'] = {
                    'requests-per-hour': config.rateLimit.requestsPerHour,
                    'delay-between-requests': config.rateLimit.delayBetweenRequests,
                    'max-retries': config.rateLimit.maxRetries,
                    'backoff-multiplier': config.rateLimit.backoffMultiplier
                };
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
}
exports.ConfigService = ConfigService;
