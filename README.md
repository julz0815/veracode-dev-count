# User Count

A tool for analyzing and counting contributors across multiple CI systems (GitHub, GitLab, and Azure DevOps).

## Overview

User Count is designed to help organizations track and analyze contributors across their code repositories. It provides detailed insights into who is contributing to your codebase, with the ability to filter contributors based on email patterns.

## Main Features

- Support for multiple CI systems (GitHub, GitLab, Azure DevOps)
- Configurable email filtering using regex patterns
- Detailed contributor analysis per repository
- Summary reports in Excel format
- Separate tracking of included and excluded contributors

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
```

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