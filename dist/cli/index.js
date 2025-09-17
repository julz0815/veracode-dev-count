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
        }, {
            type: 'confirm',
            name: 'skipForks',
            message: 'Skip forked repositories?',
            default: true,
        }, {
            type: 'confirm',
            name: 'skipPrivate',
            message: 'Skip private repositories?',
            default: false,
        });
        // Add rate limiting questions for GitHub
        if (ciSystemName === 'GitHub') {
            questions.push({
                type: 'confirm',
                name: 'configureRateLimit',
                message: 'Configure GitHub API rate limiting? (Recommended for large repositories)',
                default: true,
            });
        }
        const answers = await inquirer_1.default.prompt(questions);
        let rateLimit;
        if (ciSystemName === 'GitHub' && answers.configureRateLimit) {
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
                }
            ]);
            rateLimit = {
                requestsPerHour: parseInt(rateLimitAnswers.requestsPerHour),
                delayBetweenRequests: parseInt(rateLimitAnswers.delayBetweenRequests),
                maxRetries: parseInt(rateLimitAnswers.maxRetries),
                backoffMultiplier: 2
            };
        }
        return {
            token: answers.token,
            domain: answers.domain,
            forceReload: answers.forceReload,
            regexPattern: answers.regexPattern || undefined,
            regexFile: answers.regexFile || undefined,
            orgs: answers.orgs || undefined,
            ciSystem: ciSystemName,
            skipForks: answers.skipForks,
            skipPrivate: answers.skipPrivate,
            rateLimit
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
