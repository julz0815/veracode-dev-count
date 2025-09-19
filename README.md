# User Count

A tool for analyzing and counting contributors across multiple CI systems (GitHub, GitLab, and Azure DevOps).

## Overview

User Count is designed to help organizations track and analyze contributors across their code repositories. It provides detailed insights into who is contributing to your codebase, with the ability to filter contributors based on email patterns.

## Main Features

- Support for multiple CI systems (GitHub, GitLab, Azure DevOps)
- **GitHub API Rate Limiting**: Built-in rate limiting to prevent API throttling
- Configurable email filtering using regex patterns
- Detailed contributor analysis per repository
- Summary reports in Excel format
- Separate tracking of included and excluded contributors
- Persistent configuration storage in YAML format

## Configuration

The tool uses a YAML configuration file located at `~/.veracode/veracode-devcount.yml`. The configuration includes:

```yaml
dev-count:
  - ci-system: "github"  # or "gitlab" or "azure-devops"
    ci-token: "your-token"
    domain: "https://api.github.com"  # or appropriate domain for other systems
    regex: "/gmail\\.com$/i"  # optional regex pattern for email filtering
    regex-file: "/path/to/regex/file"  # optional file containing regex patterns
    org: "organization-name"  # required for Azure DevOps
    rate-limit:  # optional, GitHub only
      requests-per-hour: 4000
      delay-between-requests: 1000
      max-retries: 5
      backoff-multiplier: 2
```

### Azure DevOps Domain Support

Azure DevOps supports two domain formats:

1. **Default Domain**: `https://dev.azure.com` (recommended)
2. **Visual Studio Domain**: `https://{organization}.visualstudio.com`

The tool automatically detects which domain works for your organization. You can also specify a custom domain in the configuration if needed.

### GitHub API Rate Limiting

The tool includes comprehensive rate limiting for GitHub API requests to prevent hitting API limits and ensure reliable operation.

#### GitHub API Limits (2024)
- **Personal Access Tokens**: 5,000 requests per hour
- **Unauthenticated requests**: 60 requests per hour
- **Secondary limits**: No more than 100 concurrent requests, 900 points per minute

#### Rate Limiting Features
- **Automatic throttling**: Configurable delays between requests
- **Exponential backoff**: Smart retry logic with increasing delays
- **Rate limit detection**: Automatically handles 403/429 errors
- **Dynamic adjustment**: Adjusts behavior based on remaining quota
- **Debug monitoring**: Detailed logging with `--debug` flag

#### Configuration Options
When configuring GitHub, you can set:
- **Maximum requests per hour** (1-5000, default: 4000)
- **Delay between requests** (milliseconds, default: 1000)
- **Maximum retries** (default: 5)
- **Backoff multiplier** (default: 2)

#### Example Configurations

**Conservative (Recommended for large repositories)**:
```yaml
rate-limit:
  requests-per-hour: 3000
  delay-between-requests: 1500
  max-retries: 5
  backoff-multiplier: 2
```

**Aggressive (Use with caution)**:
```yaml
rate-limit:
  requests-per-hour: 4500
  delay-between-requests: 800
  max-retries: 3
  backoff-multiplier: 1.5
```

**Very Conservative (For rate limit issues)**:
```yaml
rate-limit:
  requests-per-hour: 2000
  delay-between-requests: 2000
  max-retries: 10
  backoff-multiplier: 2.5
```

#### Debug Mode
Run with `--debug` flag to monitor rate limiting:
```bash
npm start -- --debug
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

2. **Contributor Reports**
   - `scm_summary.xlsx`
   - Contains:
     - Summary of total contributors across all systems
     - Detailed breakdown per CI system
     - Separate sheets for removed contributors
     - Repository-wise contributor lists

3. **Commit Storage**
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

### GitHub Rate Limiting Issues

**Still hitting rate limits?**
- Reduce `requests-per-hour` to 3000 or lower
- Increase `delay-between-requests` to 1500ms or higher
- Check your token permissions and scopes

**Processing too slow?**
- Increase `requests-per-hour` (but stay under 5000)
- Reduce `delay-between-requests` (but keep it reasonable, e.g., 800ms)
- Consider using a GitHub App for higher limits

**Frequent retries?**
- Increase `max-retries` setting
- Increase `backoff-multiplier`
- Check network stability

### Common Error Messages

- `Rate limit reached. Waiting X seconds...` - Normal behavior, wait for reset
- `Rate limit error. Retrying in Xms` - Automatic retry with backoff
- `Error fetching commits for repo: Rate limit exceeded` - Check configuration

## Compilation

If you want to compile the code yourself, use:
```bash
ncc src/index.ts
```

## Notes

- The tool maintains separate regex patterns for each CI system
- Contributors are tracked uniquely across repositories
- The summary report is updated after processing each CI system
- All output files are created in the current working directory
- Rate limiting settings are automatically saved and reused across sessions 