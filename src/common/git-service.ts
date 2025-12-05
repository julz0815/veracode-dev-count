import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Execute git command with environment variables
 */
async function execGitWithEnv(command: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  const mergedEnv = { ...process.env, ...env };
  return execAsync(command, { env: mergedEnv });
}

interface GitConfig {
  token?: string;
  remoteUrl?: string;
  branch?: string;
}

export class GitService {
  private token?: string;
  private remoteUrl?: string;
  private branch: string = 'main';

  /**
   * Initialize git service with token and remote URL
   */
  async initialize(config: GitConfig): Promise<void> {
    this.token = config.token;
    this.branch = config.branch || 'main';
    
    if (!config.remoteUrl) {
      // Try to get remote URL from git config
      try {
        const { stdout } = await execAsync('git config --get remote.origin.url');
        this.remoteUrl = stdout.trim();
      } catch (error) {
        throw new Error('Could not determine git remote URL. Please provide it in config.');
      }
    } else {
      this.remoteUrl = config.remoteUrl;
    }

    // Inject token into remote URL if provided
    if (this.token && this.remoteUrl) {
      const originalUrl = this.remoteUrl;
      const isGitLabCI = !!(process.env.CI && process.env.GITLAB_CI);
      const isGitLab = this.remoteUrl.includes('gitlab');
      // For GitLab, check if we're using CI_JOB_TOKEN or GITLAB_TOKEN (PAT)
      const isUsingCIJobToken = isGitLabCI && process.env.CI_JOB_TOKEN === this.token;
      this.remoteUrl = this.injectTokenIntoUrl(this.remoteUrl, this.token, isGitLabCI, isUsingCIJobToken);
      if (process.argv.includes('--debug')) {
        const maskedUrl = this.remoteUrl.replace(/\/\/[^@]+@/, '//[MASKED]@');
        console.log(`Injected token into URL: ${originalUrl} -> ${maskedUrl}`);
      }
    }
  }

  /**
   * Inject token into git URL for authentication
   */
  private injectTokenIntoUrl(url: string, token: string, isGitLabCI: boolean = false, isUsingCIJobToken: boolean = false): string {
    // Handle Azure DevOps URLs specially
    if (url.includes('dev.azure.com') || url.includes('visualstudio.com')) {
      // Azure DevOps URL format: https://dev.azure.com/{org}/{project}/_git/{repo}
      // Or: https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
      // For Azure DevOps, we need to use the token as the username
      // Format: https://{token}@dev.azure.com/{org}/{project}/_git/{repo}
      if (url.startsWith('https://')) {
        // Remove any existing username (everything before @dev.azure.com or @visualstudio.com)
        let cleanUrl = url;
        
        // Handle URLs with existing username like: https://user@dev.azure.com/...
        if (url.includes('@dev.azure.com')) {
          const match = url.match(/https:\/\/[^@]+@(dev\.azure\.com\/.+)/);
          if (match) {
            cleanUrl = `https://${match[1]}`;
          }
        } else if (url.includes('@visualstudio.com')) {
          const match = url.match(/https:\/\/[^@]+@([^\/]+\/visualstudio\.com\/.+)/);
          if (match) {
            cleanUrl = `https://${match[1]}`;
          }
        }
        
        // Now inject token: https://token@dev.azure.com/...
        return cleanUrl.replace('https://', `https://${token}@`);
      }
      return url;
    }
    
    // Handle different URL formats for GitHub/GitLab
    if (url.startsWith('https://')) {
      // Remove any existing username first (including oauth2: or gitlab-ci-token: prefixes)
      // GitLab URLs might have formats like: https://oauth2:token@gitlab.com/...
      // or: https://gitlab-ci-token:token@gitlab.com/...
      let cleanUrl = url;
      
      // Remove existing username if present (everything before @)
      if (url.includes('@') && !url.includes('@dev.azure.com') && !url.includes('@visualstudio.com')) {
        const urlMatch = url.match(/https:\/\/[^@]+@(.+)/);
        if (urlMatch) {
          cleanUrl = `https://${urlMatch[1]}`;
        }
      }
      
      // Inject token as username
      // For GitLab CI/CD with CI_JOB_TOKEN, use gitlab-ci-token as username
      // Format: https://gitlab-ci-token:token@gitlab.com/...
      // For regular GitLab PAT (GITLAB_TOKEN), use oauth2 as username
      // Format: https://oauth2:token@gitlab.com/...
      if (url.includes('gitlab')) {
        if (isUsingCIJobToken) {
          // CI_JOB_TOKEN format: gitlab-ci-token:token
          return cleanUrl.replace('https://', `https://gitlab-ci-token:${token}@`);
        } else {
          // Regular GitLab PAT format: oauth2:token
          return cleanUrl.replace('https://', `https://oauth2:${token}@`);
        }
      }
      // For other platforms (GitHub, etc.), use token directly as username
      return cleanUrl.replace('https://', `https://${token}@`);
    } else if (url.startsWith('http://')) {
      // Remove any existing username first
      let cleanUrl = url;
      if (url.includes('@')) {
        const urlMatch = url.match(/http:\/\/[^@]+@(.+)/);
        if (urlMatch) {
          cleanUrl = `http://${urlMatch[1]}`;
        }
      }
      return cleanUrl.replace('http://', `http://${token}@`);
    } else if (url.includes('@')) {
      // git@github.com:user/repo.git -> https://token@github.com/user/repo.git
      // Convert SSH to HTTPS
      const match = url.match(/git@([^:]+):(.+)/);
      if (match) {
        return `https://${token}@${match[1]}/${match[2]}`;
      }
    }
    return url;
  }

  /**
   * Check if we're in a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    // Try multiple methods to get the branch name, in order of reliability
    const methods = [
      // Method 1: git branch --show-current (most reliable)
      async () => {
        try {
          const { stdout } = await execAsync('git branch --show-current');
          const branch = stdout.trim();
          if (branch && branch !== 'HEAD') {
            return branch;
          }
        } catch {}
        return null;
      },
      // Method 2: git symbolic-ref (works if not in detached HEAD)
      async () => {
        try {
          const { stdout } = await execAsync('git symbolic-ref --short HEAD');
          const branch = stdout.trim();
          if (branch && branch !== 'HEAD') {
            return branch;
          }
        } catch {}
        return null;
      },
      // Method 3: Check CI environment variables (for pipelines)
      async () => {
        // Azure DevOps
        if (process.env.BUILD_SOURCEBRANCH) {
          const branch = process.env.BUILD_SOURCEBRANCH.replace('refs/heads/', '');
          if (branch && branch !== 'HEAD') {
            return branch;
          }
        }
        // GitHub Actions
        if (process.env.GITHUB_REF) {
          const branch = process.env.GITHUB_REF.replace('refs/heads/', '');
          if (branch && branch !== 'HEAD') {
            return branch;
          }
        }
        // GitLab CI
        if (process.env.CI_COMMIT_REF_NAME) {
          const branch = process.env.CI_COMMIT_REF_NAME;
          if (branch && branch !== 'HEAD') {
            return branch;
          }
        }
        return null;
      },
      // Method 4: git rev-parse --abbrev-ref (fallback)
      async () => {
        try {
          const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
          const branch = stdout.trim();
          if (branch && branch !== 'HEAD') {
            return branch;
          }
        } catch {}
        return null;
      }
    ];

    // Try each method in order
    for (const method of methods) {
      const branch = await method();
      if (branch) {
        return branch;
      }
    }

    // If all methods fail, default to 'main'
    return 'main';
  }

  /**
   * Stage files for commit
   */
  async addFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await execAsync(`git add "${filePath}"`);
      } catch (error) {
        console.error(`Error staging file ${filePath}:`, error);
        throw error;
      }
    }
  }

  /**
   * Commit changes
   */
  async commit(message: string): Promise<void> {
    try {
      // Configure git user if not set (required for commit)
      try {
        await execAsync('git config user.name');
      } catch {
        await execAsync('git config user.name "Veracode Dev Count"');
      }
      
      try {
        await execAsync('git config user.email');
      } catch {
        await execAsync('git config user.email "dev-count@veracode.com"');
      }

      await execAsync(`git commit -m "${message}"`);
    } catch (error) {
      // If nothing to commit, that's okay
      if (error instanceof Error && error.message.includes('nothing to commit')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Check if a branch exists locally
   */
  private async branchExistsLocally(branchName: string): Promise<boolean> {
    try {
      await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Push changes to remote
   */
  async push(): Promise<void> {
    if (!this.remoteUrl) {
      throw new Error('Remote URL not configured');
    }

    try {
      // Check if we're in GitLab CI/CD
      const isGitLabCI = process.env.CI && process.env.GITLAB_CI;
      
      // For GitLab CI/CD, configure git to not prompt for credentials
      if (isGitLabCI) {
        // Disable credential helper to prevent password prompts
        try {
          await execAsync('git config --global credential.helper ""');
        } catch {
          // Ignore errors if credential helper is already set
        }
      }
      
      // Set remote URL with token
      // For GitLab, ensure the URL format is correct
      if (isGitLabCI && process.argv.includes('--debug')) {
        console.log(`Setting remote URL for GitLab: ${this.remoteUrl.replace(/\/\/[^@]+@/, '//[MASKED]@')}`);
      }
      await execAsync(`git remote set-url origin "${this.remoteUrl}"`);
      
      // Get current branch
      const currentBranch = await this.getCurrentBranch();
      
      // Check if the branch exists locally
      const branchExists = await this.branchExistsLocally(currentBranch);
      
      // For GitLab CI/CD, always use HEAD since we might be in detached HEAD state
      if (isGitLabCI) {
        // In GitLab CI/CD, use HEAD directly since we might be in detached HEAD
        // Push HEAD to the target branch on remote
        // Use GIT_TERMINAL_PROMPT=0 to prevent password prompts
        // Also disable credential helper prompts
        await execGitWithEnv(`git push origin HEAD:refs/heads/${currentBranch}`, {
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          GIT_SSH_COMMAND: 'ssh -o BatchMode=yes'
        });
      } else if (!branchExists) {
        // Branch doesn't exist locally (detached HEAD or other issue)
        // Push HEAD to the target branch on remote
        await execAsync(`git push origin HEAD:refs/heads/${currentBranch}`);
      } else {
        // Branch exists locally, use fully qualified refspec
        // Format: refs/heads/branch-name:refs/heads/branch-name
        const refspec = `refs/heads/${currentBranch}:refs/heads/${currentBranch}`;
        try {
          await execAsync(`git push origin ${refspec}`);
        } catch (error) {
          // If that fails, try with HEAD (works in detached HEAD scenarios)
          await execAsync(`git push origin HEAD:refs/heads/${currentBranch}`);
        }
      }
    } catch (error) {
      console.error('Error pushing to remote:', error);
      throw error;
    }
  }

  /**
   * Push files to repository in headless mode
   */
  async pushFilesToRepository(
    files: Array<{ sourcePath: string; destPath: string }>,
    commitMessage: string
  ): Promise<void> {
    if (!await this.isGitRepository()) {
      console.log('Not in a git repository, skipping git push');
      return;
    }

    // Ensure destination directory exists
    for (const file of files) {
      const destDir = path.dirname(file.destPath);
      await fs.mkdir(destDir, { recursive: true });
      
      // Copy file to destination
      await fs.copyFile(file.sourcePath, file.destPath);
    }

    // Stage files
    const destPaths = files.map(f => f.destPath);
    await this.addFiles(destPaths);

    // Commit
    await this.commit(commitMessage);

    // Push
    await this.push();

    console.log(`Successfully pushed ${files.length} file(s) to repository`);
  }
}

