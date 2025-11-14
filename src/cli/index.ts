import inquirer from 'inquirer';
import { CISystemConfig, GlobalNetworkConfig } from '../common/types';

export class CLI {
  static async getInitialMode(): Promise<{ mode: 'fetch' | 'evaluate' }> {
    return inquirer.prompt([
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

  static async getOptions(): Promise<{ ciSystemName: string; debug: boolean }> {
    const { ciSystemName } = await inquirer.prompt([
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

  static async getConfig(ciSystemName: string): Promise<CISystemConfig> {
    const questions = [
      {
        type: 'password',
        name: 'token',
        message: `Enter ${ciSystemName} token:`,
        validate: (input: string) => input.length > 0 || 'Token is required',
      }
    ];

    // Add organization name question for Azure DevOps
    if (ciSystemName === 'Azure-DevOps') {
      questions.push({
        type: 'input',
        name: 'orgs',
        message: 'Enter Azure DevOps organization name(s) (comma-separated for multiple):',
        validate: (input: string) => input.length > 0 || 'Organization name is required',
      } as any);
    }

    questions.push(
      {
        type: 'input',
        name: 'domain',
        message: `Enter ${ciSystemName} domain${this.getDomainHelpText(ciSystemName)}:`,
        default: this.getDefaultDomain(ciSystemName),
      } as any,
      {
        type: 'confirm',
        name: 'forceReload',
        message: 'Force reload of repositories?',
        default: false,
      } as any,
      {
        type: 'input',
        name: 'regexPattern',
        message: 'Enter regex pattern for email categorization (press Enter for default):',
        default: this.getDefaultRegex(ciSystemName),
      } as any,
      {
        type: 'input',
        name: 'regexFile',
        message: 'Enter path to regex file (optional, press Enter to skip):',
        default: '',
      } as any
    );

    const answers = await inquirer.prompt(questions);

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

  private static getDefaultDomain(ciSystem: string): string {
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

  private static getDomainHelpText(ciSystem: string): string {
    switch (ciSystem) {
      case 'Azure-DevOps':
        return ' (Press Enter for auto-detection, or specify custom domain like https://yourorg.visualstudio.com)';
      default:
        return '';
    }
  }

  private static getDefaultRegex(ciSystem: string): string {
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

  static async promptAddAnother(): Promise<{ addAnother: boolean }> {
    return inquirer.prompt([
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
  static async getGlobalNetworkConfig(): Promise<GlobalNetworkConfig> {
    const { configureNetwork } = await inquirer.prompt([
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

    const { configureSSL, configureProxy, configureRateLimit } = await inquirer.prompt([
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
      const sslAnswers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'rejectUnauthorized',
          message: 'Reject unauthorized SSL certificates? (Set to No to disable SSL verification)',
          default: true,
        } as any,
        {
          type: 'input',
          name: 'caFile',
          message: 'Path to CA certificate file (PEM format, optional, press Enter to skip):',
          default: '',
        } as any,
        {
          type: 'input',
          name: 'certFile',
          message: 'Path to client certificate file (PEM format, optional, press Enter to skip):',
          default: '',
        } as any,
        {
          type: 'input',
          name: 'keyFile',
          message: 'Path to client private key file (PEM format, optional, press Enter to skip):',
          default: '',
        } as any,
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
      const proxyAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'host',
          message: 'Proxy hostname:',
          validate: (input: string) => input.length > 0 || 'Proxy hostname is required',
        } as any,
        {
          type: 'input',
          name: 'port',
          message: 'Proxy port:',
          default: '8080',
          validate: (input: string) => {
            const num = parseInt(input);
            return (!isNaN(num) && num > 0 && num <= 65535) || 'Must be a number between 1 and 65535';
          },
        } as any,
        {
          type: 'list',
          name: 'protocol',
          message: 'Proxy protocol:',
          choices: ['http', 'https'],
          default: 'http',
        } as any,
        {
          type: 'confirm',
          name: 'hasAuth',
          message: 'Does the proxy require authentication?',
          default: false,
        } as any,
      ]);

      let auth;
      if (proxyAnswers.hasAuth) {
        const authAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Proxy username:',
            validate: (input: string) => input.length > 0 || 'Username is required',
          } as any,
          {
            type: 'password',
            name: 'password',
            message: 'Proxy password:',
            validate: (input: string) => input.length > 0 || 'Password is required',
          } as any,
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
      const rateLimitAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'requestsPerHour',
          message: 'Maximum requests per hour (default: 4000):',
          default: '4000',
          validate: (input: string) => {
            const num = parseInt(input);
            return (!isNaN(num) && num > 0 && num <= 5000) || 'Must be a number between 1 and 5000';
          }
        } as any,
        {
          type: 'input',
          name: 'requestsPerMinute',
          message: 'Maximum requests per minute (default: 60):',
          default: '60',
          validate: (input: string) => {
            const num = parseInt(input);
            return (!isNaN(num) && num > 0 && num <= 100) || 'Must be a number between 1 and 100';
          }
        } as any,
        {
          type: 'input',
          name: 'delayBetweenRequests',
          message: 'Delay between requests in milliseconds (default: 1000):',
          default: '1000',
          validate: (input: string) => {
            const num = parseInt(input);
            return (!isNaN(num) && num >= 0) || 'Must be a number >= 0';
          }
        } as any,
        {
          type: 'input',
          name: 'maxRetries',
          message: 'Maximum retries on rate limit error (default: 5):',
          default: '5',
          validate: (input: string) => {
            const num = parseInt(input);
            return (!isNaN(num) && num >= 0) || 'Must be a number >= 0';
          }
        } as any,
        {
          type: 'input',
          name: 'backoffMultiplier',
          message: 'Exponential backoff multiplier (default: 2):',
          default: '2',
          validate: (input: string) => {
            const num = parseFloat(input);
            return (!isNaN(num) && num > 0) || 'Must be a number > 0';
          }
        } as any,
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

  static async promptReviewRepos(ciSystemName: string): Promise<{ reviewRepos: boolean }> {
    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'reviewRepos',
        message: 'Would you like to review the repository list in Excel before proceeding?',
        default: false,
      },
    ]);
  }

  static async promptUseExistingConfig(): Promise<{ useExisting: boolean; forceReload: boolean }> {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: 'Use existing configuration?',
        default: true
      }
    ]);
    if (useExisting) {
      const { forceReload } = await inquirer.prompt([
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