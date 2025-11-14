import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { CISystemConfig, GlobalNetworkConfig } from './types';
import inquirer from 'inquirer';

interface DevCountConfig {
  'ci-system': string;
  domain?: string;
  'ci-token': string;
  regex?: string;
  'regex-file'?: string;
  org?: string;
}

interface GlobalNetworkConfigYAML {
  ssl?: {
    'reject-unauthorized'?: boolean;
    'ca-file'?: string;
    'cert-file'?: string;
    'key-file'?: string;
  };
  proxy?: {
    host?: string;
    port?: number;
    protocol?: 'http' | 'https';
    auth?: {
      username?: string;
      password?: string;
    };
  };
  'rate-limit'?: {
    'requests-per-hour'?: number;
    'requests-per-minute'?: number;
    'delay-between-requests'?: number;
    'max-retries'?: number;
    'backoff-multiplier'?: number;
  };
}

interface ConfigFile {
  'global-network'?: GlobalNetworkConfigYAML;
  'dev-count': DevCountConfig[];
}

export class ConfigService {
  private configPath: string;

  constructor(customConfigPath?: string) {
    if (customConfigPath) {
      this.configPath = customConfigPath;
    } else {
      const homeDir = os.homedir();
      this.configPath = path.join(homeDir, '.veracode', 'veracode-devcount.yml');
    }
  }

  private displayConfig(config: DevCountConfig): void {
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
    console.log('----------------------------\n');
  }

  async readConfig(ciSystem: string): Promise<{ config: CISystemConfig | null; useExisting: boolean }> {
    try {
      const fileContent = await fs.readFile(this.configPath, 'utf-8');
      const config = yaml.load(fileContent) as ConfigFile;
      
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
      const { useExisting } = await inquirer.prompt([
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
          },
          useExisting: true
        };
      }

      return { config: null, useExisting: false };
    } catch (error) {
      // If file doesn't exist or can't be read, return null
      return { config: null, useExisting: false };
    }
  }

  async promptForceReload(): Promise<boolean> {
    const { forceReload } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'forceReload',
        message: 'Force reload repositories?',
        default: false
      }
    ]);
    return forceReload;
  }

  async writeConfig(ciSystem: string, config: CISystemConfig): Promise<void> {
    try {
      // Create .veracode directory if it doesn't exist
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      if (process.argv.includes('--debug')) {
        console.log(`Config directory: ${configDir}`);
        console.log(`Config file: ${this.configPath}`);
      }

      let existingConfig: any = {};
      try {
        const fileContent = await fs.readFile(this.configPath, 'utf-8');
        existingConfig = yaml.load(fileContent) || {};
        if (process.argv.includes('--debug')) {
          console.log('Existing config:', existingConfig);
        }
      } catch (error) {
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
      existingConfig['dev-count'] = existingConfig['dev-count'].filter(
        (c: any) => c['ci-system'] !== ciSystem.toLowerCase()
      );

      // Add new config
      const newConfig: DevCountConfig = {
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
    } catch (error) {
      console.error('Error writing config file:', error);
    }
  }

  /**
   * Read global network configuration (SSL and proxy settings)
   */
  async readGlobalNetworkConfig(): Promise<GlobalNetworkConfig | null> {
    try {
      const fileContent = await fs.readFile(this.configPath, 'utf-8');
      const config = yaml.load(fileContent) as ConfigFile;
      
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
    } catch (error) {
      // If file doesn't exist or can't be read, return null
      return null;
    }
  }

  /**
   * Write global network configuration (SSL and proxy settings)
   */
  async writeGlobalNetworkConfig(networkConfig: GlobalNetworkConfig): Promise<void> {
    try {
      // Create .veracode directory if it doesn't exist
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      let existingConfig: any = {};
      try {
        const fileContent = await fs.readFile(this.configPath, 'utf-8');
        existingConfig = yaml.load(fileContent) || {};
      } catch (error) {
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
      } else {
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
      } else {
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
      } else {
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
    } catch (error) {
      console.error('Error writing global network config:', error);
    }
  }
} 