"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLI = void 0;
const inquirer_1 = __importDefault(require("inquirer"));
class CLI {
    static async getInitialMode() {
        return inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'mode',
                message: 'What would you like to do?',
                choices: [
                    { name: 'Fetch and review repositories', value: 'fetch' },
                    { name: 'Evaluate existing data only', value: 'evaluate' }
                ]
            }
        ]);
    }
    static async getOptions() {
        const { ciSystemName } = await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'ciSystemName',
                message: 'Select CI system:',
                choices: ['GitHub', 'GitLab', 'Azure-DevOps'],
            },
        ]);
        const debug = process.argv.includes('--debug');
        return { ciSystemName, debug };
    }
    static async getConfig(ciSystemName) {
        const questions = [
            {
                type: 'password',
                name: 'token',
                message: `Enter ${ciSystemName} token:`,
                validate: (input) => input.length > 0 || 'Token is required',
            }
        ];
        // Add organization name question for Azure DevOps
        if (ciSystemName === 'Azure-DevOps') {
            questions.push({
                type: 'input',
                name: 'orgs',
                message: 'Enter Azure DevOps organization name(s) (comma-separated for multiple):',
                validate: (input) => input.length > 0 || 'Organization name is required',
            });
        }
        questions.push({
            type: 'input',
            name: 'domain',
            message: `Enter ${ciSystemName} domain${this.getDomainHelpText(ciSystemName)}:`,
            default: this.getDefaultDomain(ciSystemName),
        }, {
            type: 'confirm',
            name: 'forceReload',
            message: 'Force reload of repositories?',
            default: false,
        }, {
            type: 'input',
            name: 'regexPattern',
            message: 'Enter regex pattern for email categorization (press Enter for default):',
            default: this.getDefaultRegex(ciSystemName),
        }, {
            type: 'input',
            name: 'regexFile',
            message: 'Enter path to regex file (optional, press Enter to skip):',
            default: '',
        });
        const answers = await inquirer_1.default.prompt(questions);
        return {
            token: answers.token,
            domain: answers.domain,
            forceReload: answers.forceReload,
            regexPattern: answers.regexPattern || undefined,
            regexFile: answers.regexFile || undefined,
            orgs: answers.orgs || undefined,
            ciSystem: ciSystemName,
        };
    }
    static getDefaultDomain(ciSystem) {
        switch (ciSystem) {
            case 'GitHub':
                return 'https://api.github.com';
            case 'GitLab':
                return 'https://gitlab.com/api/v4';
            case 'Azure-DevOps':
                return 'https://dev.azure.com';
            default:
                return '';
        }
    }
    static getDomainHelpText(ciSystem) {
        switch (ciSystem) {
            case 'Azure-DevOps':
                return ' (Press Enter for auto-detection, or specify custom domain like https://yourorg.visualstudio.com)';
            default:
                return '';
        }
    }
    static getDefaultRegex(ciSystem) {
        switch (ciSystem) {
            case 'GitHub':
                return '/github\\.com$/i';
            case 'GitLab':
                return '/gitlab\\.com$/i';
            case 'Azure-DevOps':
                return '/microsoft\\.com$/i';
            default:
                return '';
        }
    }
    static async promptAddAnother() {
        return inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'addAnother',
                message: 'Would you like to add another CI system?',
                default: false,
            },
        ]);
    }
    /**
     * Get global network configuration (SSL and proxy settings)
     * This applies to all CI systems (GitHub, GitLab, Azure DevOps)
     */
    static async getGlobalNetworkConfig() {
        const { configureNetwork } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'configureNetwork',
                message: 'Configure global network settings (SSL certificates, proxy, and rate limiting)? Applies to all CI systems.',
                default: false,
            },
        ]);
        if (!configureNetwork) {
            return {};
        }
        const { configureSSL, configureProxy, configureRateLimit } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'configureSSL',
                message: 'Configure SSL certificate settings? (Required if you have SSL termination or self-signed certificates)',
                default: false,
            },
            {
                type: 'confirm',
                name: 'configureProxy',
                message: 'Configure proxy settings?',
                default: false,
            },
            {
                type: 'confirm',
                name: 'configureRateLimit',
                message: 'Configure API rate limiting? (Recommended for large repositories or when hitting API limits)',
                default: false,
            },
        ]);
        let ssl;
        if (configureSSL) {
            const sslAnswers = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'rejectUnauthorized',
                    message: 'Reject unauthorized SSL certificates? (Set to No to disable SSL verification)',
                    default: true,
                },
                {
                    type: 'input',
                    name: 'caFile',
                    message: 'Path to CA certificate file (PEM format, optional, press Enter to skip):',
                    default: '',
                },
                {
                    type: 'input',
                    name: 'certFile',
                    message: 'Path to client certificate file (PEM format, optional, press Enter to skip):',
                    default: '',
                },
                {
                    type: 'input',
                    name: 'keyFile',
                    message: 'Path to client private key file (PEM format, optional, press Enter to skip):',
                    default: '',
                },
            ]);
            ssl = {
                rejectUnauthorized: sslAnswers.rejectUnauthorized,
                caFile: sslAnswers.caFile || undefined,
                certFile: sslAnswers.certFile || undefined,
                keyFile: sslAnswers.keyFile || undefined,
            };
        }
        let proxy;
        if (configureProxy) {
            const proxyAnswers = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'host',
                    message: 'Proxy hostname:',
                    validate: (input) => input.length > 0 || 'Proxy hostname is required',
                },
                {
                    type: 'input',
                    name: 'port',
                    message: 'Proxy port:',
                    default: '8080',
                    validate: (input) => {
                        const num = parseInt(input);
                        return (!isNaN(num) && num > 0 && num <= 65535) || 'Must be a number between 1 and 65535';
                    },
                },
                {
                    type: 'list',
                    name: 'protocol',
                    message: 'Proxy protocol:',
                    choices: ['http', 'https'],
                    default: 'http',
                },
                {
                    type: 'confirm',
                    name: 'hasAuth',
                    message: 'Does the proxy require authentication?',
                    default: false,
                },
            ]);
            let auth;
            if (proxyAnswers.hasAuth) {
                const authAnswers = await inquirer_1.default.prompt([
                    {
                        type: 'input',
                        name: 'username',
                        message: 'Proxy username:',
                        validate: (input) => input.length > 0 || 'Username is required',
                    },
                    {
                        type: 'password',
                        name: 'password',
                        message: 'Proxy password:',
                        validate: (input) => input.length > 0 || 'Password is required',
                    },
                ]);
                auth = {
                    username: authAnswers.username,
                    password: authAnswers.password,
                };
            }
            proxy = {
                host: proxyAnswers.host,
                port: parseInt(proxyAnswers.port),
                protocol: proxyAnswers.protocol,
                auth,
            };
        }
        let rateLimit;
        if (configureRateLimit) {
            const rateLimitAnswers = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'requestsPerHour',
                    message: 'Maximum requests per hour (default: 4000):',
                    default: '4000',
                    validate: (input) => {
                        const num = parseInt(input);
                        return (!isNaN(num) && num > 0 && num <= 5000) || 'Must be a number between 1 and 5000';
                    }
                },
                {
                    type: 'input',
                    name: 'requestsPerMinute',
                    message: 'Maximum requests per minute (default: 60):',
                    default: '60',
                    validate: (input) => {
                        const num = parseInt(input);
                        return (!isNaN(num) && num > 0 && num <= 100) || 'Must be a number between 1 and 100';
                    }
                },
                {
                    type: 'input',
                    name: 'delayBetweenRequests',
                    message: 'Delay between requests in milliseconds (default: 1000):',
                    default: '1000',
                    validate: (input) => {
                        const num = parseInt(input);
                        return (!isNaN(num) && num >= 0) || 'Must be a number >= 0';
                    }
                },
                {
                    type: 'input',
                    name: 'maxRetries',
                    message: 'Maximum retries on rate limit error (default: 5):',
                    default: '5',
                    validate: (input) => {
                        const num = parseInt(input);
                        return (!isNaN(num) && num >= 0) || 'Must be a number >= 0';
                    }
                },
                {
                    type: 'input',
                    name: 'backoffMultiplier',
                    message: 'Exponential backoff multiplier (default: 2):',
                    default: '2',
                    validate: (input) => {
                        const num = parseFloat(input);
                        return (!isNaN(num) && num > 0) || 'Must be a number > 0';
                    }
                },
            ]);
            rateLimit = {
                requestsPerHour: parseInt(rateLimitAnswers.requestsPerHour),
                requestsPerMinute: parseInt(rateLimitAnswers.requestsPerMinute),
                delayBetweenRequests: parseInt(rateLimitAnswers.delayBetweenRequests),
                maxRetries: parseInt(rateLimitAnswers.maxRetries),
                backoffMultiplier: parseFloat(rateLimitAnswers.backoffMultiplier),
            };
        }
        return { ssl, proxy, rateLimit };
    }
    static async promptReviewRepos(ciSystemName) {
        return inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'reviewRepos',
                message: 'Would you like to review the repository list in Excel before proceeding?',
                default: false,
            },
        ]);
    }
    static async promptUseExistingConfig() {
        const { useExisting } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'useExisting',
                message: 'Use existing configuration?',
                default: true
            }
        ]);
        if (useExisting) {
            const { forceReload } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'forceReload',
                    message: 'Force reload repositories?',
                    default: false
                }
            ]);
            return { useExisting, forceReload };
        }
        return { useExisting, forceReload: false };
    }
}
exports.CLI = CLI;
