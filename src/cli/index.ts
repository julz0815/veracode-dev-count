import inquirer from 'inquirer';
import { CISystemConfig } from '../common/types';

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
        message: `Enter ${ciSystemName} domain (press Enter for default):`,
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
      ciSystem: ciSystemName
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