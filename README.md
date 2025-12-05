# User Count

A tool for analyzing and counting contributors across multiple CI systems (GitHub, GitLab, and Azure DevOps).

## Overview

User Count is designed to help organizations track and analyze contributors across their code repositories. It provides detailed insights into who is contributing to your codebase, with the ability to filter contributors based on email patterns.

## Main Features

- Support for multiple CI systems (GitHub, GitLab, Azure DevOps)
- **Global API Rate Limiting**: Built-in rate limiting for all CI systems to prevent API throttling
- **Global Network Configuration**: SSL certificate support and HTTP proxy configuration for all CI systems
- Configurable email filtering using regex patterns
- Detailed contributor analysis per repository
- Summary reports in Excel format
- Separate tracking of included and excluded contributors
- Persistent configuration storage in YAML format

## Configuration

The tool uses a YAML configuration file located at `~/.veracode/veracode-devcount.yml`. The configuration includes:

### CI System Configuration

```yaml
dev-count:
  - ci-system: "github"  # or "gitlab" or "azure-devops"
    ci-token: "your-token"
    domain: "https://api.github.com"  # or appropriate domain for other systems
    regex: "/gmail\\.com$/i"  # optional regex pattern for email filtering
    regex-file: "/path/to/regex/file"  # optional file containing regex patterns
    org: "organization-name"  # required for Azure DevOps
```

### Global Network Configuration

Global network settings apply to all CI systems (GitHub, GitLab, and Azure DevOps). These are configured separately and include SSL certificates, proxy settings, and rate limiting:

```yaml
global-network:
  # SSL Certificate Configuration (optional)
  ssl:
    reject-unauthorized: false  # Set to false to disable SSL verification (for self-signed certs)
    ca-file: "/path/to/ca-certificate.pem"  # Path to CA certificate file (PEM format)
    cert-file: "/path/to/client-certificate.pem"  # Path to client certificate file (PEM format)
    key-file: "/path/to/client-key.pem"  # Path to client private key file (PEM format)
  
  # Proxy Configuration (optional)
  proxy:
    host: "proxy.company.com"
    port: 8080
    protocol: "http"  # or "https" for HTTPS proxy
    auth:
      username: "proxy-user"
      password: "proxy-pass"
  
  # Rate Limiting Configuration (optional, applies to all CI systems)
  rate-limit:
    requests-per-hour: 4000
    requests-per-minute: 60
    delay-between-requests: 1000  # milliseconds
    max-retries: 5
    backoff-multiplier: 2
```

**Note**: SSL, proxy, and rate limiting are independent - you can configure them separately or together. For example:
- **Proxy only**: Route requests through proxy without SSL config
- **SSL only**: Handle SSL certificates without proxy
- **Both**: Proxy with SSL termination (transparent proxy)
- **Neither**: Use default network settings

### Azure DevOps Domain Support

Azure DevOps supports two domain formats:

1. **Default Domain**: `https://dev.azure.com` (recommended)
2. **Visual Studio Domain**: `https://{organization}.visualstudio.com`

The tool automatically detects which domain works for your organization. You can also specify a custom domain in the configuration if needed.

### Global API Rate Limiting

The tool includes comprehensive rate limiting for all CI systems (GitHub, GitLab, and Azure DevOps) to prevent hitting API limits and ensure reliable operation. Rate limiting is configured globally and applies to all HTTP requests made by the tool.

#### API Limits by System

**GitHub (2024)**:
- **Personal Access Tokens**: 5,000 requests per hour
- **Unauthenticated requests**: 60 requests per hour
- **Secondary limits**: No more than 100 concurrent requests, 900 points per minute

**GitLab**:
- **Authenticated requests**: Varies by tier (Free: 2,000/hour, Premium: 3,000/hour)
- **Unauthenticated requests**: 20 requests per minute

**Azure DevOps**:
- **Authenticated requests**: 15,000 requests per hour per organization
- **Rate limit headers**: Uses `Retry-After` header for dynamic rate limiting

#### Rate Limiting Features
- **Automatic throttling**: Configurable delays between requests
- **Exponential backoff**: Smart retry logic with increasing delays
- **Rate limit detection**: Automatically handles 403/429 errors and `Retry-After` headers
- **Per-minute and per-hour limits**: Tracks both minute and hour-based rate limits
- **Debug monitoring**: Detailed logging with `--debug` flag

#### Configuration Options
When configuring global rate limiting, you can set:
- **Maximum requests per hour** (1-5000, default: 4000)
- **Maximum requests per minute** (1-100, default: 60)
- **Delay between requests** (milliseconds, default: 1000)
- **Maximum retries** (default: 5)
- **Backoff multiplier** (default: 2)

#### Example Configurations

**Conservative (Recommended for large repositories)**:
```yaml
global-network:
  rate-limit:
    requests-per-hour: 3000
    requests-per-minute: 50
    delay-between-requests: 1500
    max-retries: 5
    backoff-multiplier: 2
```

**Aggressive (Use with caution)**:
```yaml
global-network:
  rate-limit:
    requests-per-hour: 4500
    requests-per-minute: 75
    delay-between-requests: 800
    max-retries: 3
    backoff-multiplier: 1.5
```

**Very Conservative (For rate limit issues)**:
```yaml
global-network:
  rate-limit:
    requests-per-hour: 2000
    requests-per-minute: 30
    delay-between-requests: 2000
    max-retries: 10
    backoff-multiplier: 2.5
```

#### Debug Mode
Run with `--debug` flag to monitor rate limiting:
```bash
node dist/index.js --debug
```

This shows:
- Current rate limit status
- Number of requests made in the last hour
- Delays being applied
- Retry attempts and backoff delays

## Main Process Flow

1. **Initialization**
   - The tool starts by reading the configuration for each CI system
   - Users can choose to use existing configurations or create new ones
   - Each CI system's configuration includes:
     - Authentication token
     - Domain/API endpoint
     - Organization (for Azure DevOps)
     - Regex patterns for email filtering

2. **Repository Processing**
   - For each CI system:
     - Fetches list of repositories
     - Creates an Excel file for repository selection
     - Users can mark repositories to include/exclude
     - Only marked repositories are processed further

3. **Contributor Analysis**
   - For each selected repository:
     - Fetches commit history
     - Extracts contributor information (name, email)
     - Applies regex filtering to categorize contributors:
       - Included contributors: Emails that don't match regex patterns
       - Removed contributors: Emails that match regex patterns
     - Tracks commit counts per contributor

4. **Report Generation**
   - Creates a comprehensive Excel report with:
     - Summary sheet showing total contributors per system
     - Detailed sheets for each CI system
     - Separate sheets for removed contributors
     - Repository-wise breakdown of contributors

## Output Files

1. **Repository Selection Files**
   - `repositories-{system}.xlsx`
   - Contains list of repositories with selection option
   - Users mark repositories with 'Y' to include them
   - Includes columns: Organization, Repository, Path, Last Updated, Include

2. **Contributor Reports**
   - `scm_summary.xlsx` (interactive mode) or `scm_summary_{YYYYMMDD}.xlsx` (headless mode)
   - Contains:
     - Summary of total contributors across all systems
     - Detailed breakdown per CI system
     - Separate sheets for removed contributors
     - Repository-wise contributor lists
   - In headless mode, dated files are pushed to `dev-count-runs/` folder

3. **Run CSV Files** (Headless Mode Only)
   - `run_{cisystem}_{YYYYMMDD}.csv`
   - One file per CI system processed
   - Contains detailed contributor information per repository
   - Columns: Repository Path, Organization, Repository Name, Platform, Contributor Name, Contributor Email, Date
   - Pushed to `dev-count-runs/` folder in repository

4. **Summary Average CSV** (Headless Mode Only)
   - `scm_summary_average.csv`
   - Tracks historical runs with contributor counts
   - Contains: Date, GitLab Contributors, GitHub Contributors, Azure DevOps Contributors, Total Unique Contributors
   - Includes average row showing averages across all runs
   - Overwritten each run (maintains historical data)
   - Pushed to `dev-count-runs/` folder in repository

5. **Commit Storage**
   - Commits are stored in JSON format under:
     - `contributors/{system}/{repo-path}/commits.json`

## Email Filtering

The tool supports two ways to define email filtering patterns:

1. **Direct Regex Pattern**
   - Defined in the configuration file using the `regex` field
   - Example: `/gmail\\.com$/i` to exclude Gmail addresses

2. **Regex File**
   - Multiple patterns can be defined in a separate file
   - Each line contains one regex pattern
   - Specified in the configuration using the `regex-file` field

## Troubleshooting

### SSL Certificate Configuration

If you're using SSL termination or self-signed certificates, you can configure SSL settings:

**Disable SSL verification** (for self-signed certificates):
```yaml
global-network:
  ssl:
    reject-unauthorized: false
```

**Use custom CA certificate**:
```yaml
global-network:
  ssl:
    reject-unauthorized: true
    ca-file: "/path/to/ca-certificate.pem"
```

**Use client certificates** (for mutual TLS):
```yaml
global-network:
  ssl:
    reject-unauthorized: true
    ca-file: "/path/to/ca-certificate.pem"
    cert-file: "/path/to/client-certificate.pem"
    key-file: "/path/to/client-key.pem"
```

### Proxy Configuration

If you need to route requests through a proxy:

**Basic proxy** (no authentication):
```yaml
global-network:
  proxy:
    host: "proxy.company.com"
    port: 8080
    protocol: "http"
```

**Proxy with authentication**:
```yaml
global-network:
  proxy:
    host: "proxy.company.com"
    port: 8080
    protocol: "http"
    auth:
      username: "proxy-user"
      password: "proxy-pass"
```

**HTTPS proxy** (proxy itself uses HTTPS):
```yaml
global-network:
  proxy:
    host: "proxy.company.com"
    port: 8080
    protocol: "https"  # Proxy uses HTTPS
  ssl:
    reject-unauthorized: false  # Or provide CA cert for proxy connection
```

**Proxy with SSL termination** (transparent proxy that terminates SSL):
```yaml
global-network:
  proxy:
    host: "proxy.company.com"
    port: 8080
    protocol: "http"  # Proxy uses HTTP, but handles SSL termination
  ssl:
    reject-unauthorized: false  # Or provide CA cert
```

### Rate Limiting Issues

**Still hitting rate limits?**
- Reduce `requests-per-hour` to 3000 or lower
- Reduce `requests-per-minute` to 50 or lower
- Increase `delay-between-requests` to 1500ms or higher
- Check your token permissions and scopes

**Processing too slow?**
- Increase `requests-per-hour` (but stay under 5000)
- Increase `requests-per-minute` (but stay under 100)
- Reduce `delay-between-requests` (but keep it reasonable, e.g., 800ms)

**Frequent retries?**
- Increase `max-retries` setting
- Increase `backoff-multiplier`
- Check network stability

### Common Error Messages

- `Rate limit reached. Waiting X seconds...` - Normal behavior, wait for reset
- `Rate limit error. Retrying in Xms` - Automatic retry with backoff
- `Error fetching commits for repo: Rate limit exceeded` - Check configuration

## Running the Tool

### Interactive Mode (Default)

The tool runs in interactive mode by default, prompting you for configuration and options:

```bash
npm start
```

Or directly:
```bash
node dist/index.js
```

### Headless/Non-Interactive Mode (For Pipelines)

For automated runs in CI/CD pipelines, you can use headless mode which uses existing configurations and skips all interactive prompts. Headless mode also automatically generates CSV files and pushes results back to the repository.

```bash
node dist/index.js --headless
```

#### Headless Mode Options

- `--headless`, `--non-interactive`, or `-n`: Enable headless mode
- `--mode <fetch|evaluate>`: Operation mode (default: fetch)
- `--ci-systems <systems>`: Comma-separated list of CI systems (e.g., `github,gitlab,azure-devops`)
- `--skip-review`: Skip repository review step
- `--force-reload`: Force reload of repositories
- `--config <path>` or `--config-file <path>`: Custom path to config YAML file (headless mode only)
- `--repositories-file <path>`: Custom path to repositories Excel file for all CI systems (headless mode only)
- `--repositories-file-github <path>`: Custom path to GitHub repositories Excel file (headless mode only)
- `--repositories-file-gitlab <path>`: Custom path to GitLab repositories Excel file (headless mode only)
- `--repositories-file-azure-devops <path>`: Custom path to Azure DevOps repositories Excel file (headless mode only)
- `--help` or `-h`: Show help text

#### Examples

```bash
# Headless mode with all CI systems (uses existing configs)
node dist/index.js --headless

# Headless mode, fetch only GitHub
node dist/index.js --headless --mode fetch --ci-systems github

# Headless mode, evaluate existing data
node dist/index.js --headless --mode evaluate

# Headless mode with force reload
node dist/index.js --headless --force-reload

# Headless mode with custom config file location
node dist/index.js --headless --config /path/to/custom-config.yml

# Headless mode with custom repositories file (loads and updates from specified location)
node dist/index.js --headless --repositories-file-github /path/to/repositories-github.xlsx

# Headless mode with custom repositories file for all CI systems
node dist/index.js --headless --repositories-file /path/to/repositories.xlsx

# Show help
node dist/index.js --help
```

#### Environment Variables for Headless Mode

You can override tokens using environment variables (useful for pipelines):

```bash
# For GitHub, use GITHUB_PAT for full permissions (recommended in CI)
# GITHUB_TOKEN may have limited permissions in CI environments
export GITHUB_PAT="your-github-personal-access-token"
# Or fallback to GITHUB_TOKEN
export GITHUB_TOKEN="your-github-token"

export GITLAB_TOKEN="your-gitlab-token"
export AZURE_DEVOPS_TOKEN="your-azure-devops-token"

node dist/index.js --headless
```

**Important Token Notes**:
- **GitHub Actions**: The automatically provided `GITHUB_TOKEN` has limited permissions and may not be able to list repositories. Use a `GITHUB_PAT` secret with a Personal Access Token that has `repo` scope for full access.
- **GitLab CI/CD**: `CI_JOB_TOKEN` typically only has read permissions. For git push operations, you must use `GITLAB_TOKEN` (Personal Access Token with `write_repository` scope).
- **Azure DevOps Pipelines**: `SYSTEM_ACCESSTOKEN` is automatically used if available. Otherwise, use `AZURE_DEVOPS_TOKEN` (Personal Access Token with `Code (Read & Write)` scope).

**Note**: Headless mode requires existing configuration. Run the tool in interactive mode first to set up your configuration, then you can use headless mode for automated runs.

#### Headless Mode Output Files

When running in headless mode with `--mode fetch`, the tool automatically generates additional files and pushes them to the repository:

1. **Dated Summary Files**
   - `scm_summary_{YYYYMMDD}.xlsx` - Summary report with date suffix
   - Stored in `dev-count-runs/` folder in the repository

2. **Run CSV Files**
   - `run_{cisystem}_{YYYYMMDD}.csv` - One file per CI system processed
   - Contains: Repository Path, Organization, Repository Name, Platform, Contributor Name, Contributor Email, Date
   - Stored in `dev-count-runs/` folder in the repository

3. **Summary Average CSV**
   - `scm_summary_average.csv` - Tracks all runs with averages
   - Contains one row per run with contributor counts per platform
   - Includes an average row showing averages across all runs
   - Overwritten each run (contains historical data)
   - Stored in `dev-count-runs/` folder in the repository

#### Git Push in Headless Mode

Headless mode automatically pushes generated files to the repository's `dev-count-runs/` folder. The tool:

- Uses standard git commands with PAT (Personal Access Token) authentication
- Supports GitHub, GitLab, and Azure DevOps repositories
- Automatically detects the git remote URL and platform
- Uses tokens from environment variables (GITHUB_PAT/GITHUB_TOKEN, GITLAB_TOKEN, or AZURE_DEVOPS_TOKEN)
- Creates commits with descriptive messages (e.g., "Dev count run 20241120")
- Gracefully handles cases where git is not available or push fails

**Git Push Requirements**:
- Must be run in a git repository
- At least one token must be set in environment variables
- Token must have write permissions to the repository

**Platform-Specific Token Requirements**:

- **GitHub**: 
  - Prefers `GITHUB_PAT` (Personal Access Token with `repo` scope)
  - Falls back to `GITHUB_TOKEN` (may have limited permissions in CI)
  
- **GitLab**: 
  - Requires `GITLAB_TOKEN` (Personal Access Token with `write_repository` scope)
  - `CI_JOB_TOKEN` typically only has read permissions and cannot push
  - Token format: `oauth2:${token}` in the URL
  
- **Azure DevOps**: 
  - Uses `SYSTEM_ACCESSTOKEN` automatically if available (in Azure Pipelines)
  - Falls back to `AZURE_DEVOPS_TOKEN` (Personal Access Token with `Code (Read & Write)` scope)

**Example Git Push Setup**:
```bash
# GitHub - use GITHUB_PAT for full permissions
export GITHUB_PAT="ghp_your_token_here"

# GitLab - use GITLAB_TOKEN with write_repository scope
export GITLAB_TOKEN="glpat_your_token_here"

# Azure DevOps - use AZURE_DEVOPS_TOKEN or SYSTEM_ACCESSTOKEN
export AZURE_DEVOPS_TOKEN="your_ado_token_here"

# Run headless mode - files will be pushed automatically
node dist/index.js --headless
```

**Note**: The repositories Excel file (`repositories-{system}.xlsx`) is also pushed back to the repository, preserving its original location (custom paths are respected, default files go to `contributors/`).

If git push fails (e.g., no token, not in git repo, or network issues), the tool will log an error but continue execution. The files will still be generated locally in the `contributors/` directory.

### Compiling from Source

If you want to compile the code yourself:

1. **Install dependencies**:
```bash
npm install
```

2. **Compile TypeScript**:
```bash
npm run build
```

This compiles the TypeScript source files to JavaScript in the `dist` folder.

3. **Run the compiled version**:
```bash
npm start
```

**Note**: Always run the compiled version from the `dist` folder. The source files in `src` are TypeScript and cannot be executed directly with Node.js.

## Notes

- The tool maintains separate regex patterns for each CI system
- Contributors are tracked uniquely across repositories
- The summary report is updated after processing each CI system
- All output files are created in the current working directory
- Global network settings (SSL, proxy, rate limiting) are automatically saved and reused across sessions
- Rate limiting applies globally to all CI systems (GitHub, GitLab, and Azure DevOps)
- SSL and proxy configurations are independent - you can use them separately or together
- The tool uses a centralized HTTP client that handles SSL, proxy, and rate limiting for all requests 