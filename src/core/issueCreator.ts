import * as vscode from 'vscode';
import { getOpenRouterClient } from '../ai/openRouterClient';
import { TestCase, TestResult } from '../types';
import { GitIntegration } from './gitIntegration';

export interface IssueContent {
    platform: 'github' | 'jira';
    title: string;
    description: string;
    labels: string[];
    severity: 'high' | 'medium' | 'low' | null;
    confidence: 'high' | 'medium' | 'low';
    is_potential_duplicate: boolean;
    duplicate_reason: string | null;
    references: {
        test_name: string;
        test_category: string;
        run_id: string;
        commit: string | null;
    };
}

export interface IssueCreationInput {
    platform: 'github' | 'jira';
    test: TestCase;
    result: TestResult;
    runId: string;
    logs?: string;
    stackTrace?: string;
    commit?: {
        hash: string;
        files_changed?: string[];
        message?: string;
    };
    historicalFailures?: Array<{
        test_name: string;
        run_id: string;
        timestamp: Date;
    }>;
}

/**
 * Issue Creator - Transforms failed test data into bug tracker issues
 */
export class IssueCreator {
    private openRouter = getOpenRouterClient();
    private gitIntegration: GitIntegration | null = null;

    constructor(gitIntegration?: GitIntegration) {
        if (gitIntegration) {
            this.gitIntegration = gitIntegration;
        }
    }

    /**
     * Generate issue content from failed test
     */
    async generateIssueContent(input: IssueCreationInput): Promise<IssueContent> {
        if (!this.openRouter.isEnabled()) {
            throw new Error('AI is not configured. Please configure TestFox AI settings to create issues.');
        }

        // Get commit info if available
        let commit: { hash: string; files_changed?: string[]; message?: string } | undefined;
        if (this.gitIntegration) {
            const commitHash = await this.gitIntegration.getCurrentCommit();
            if (commitHash) {
                commit = {
                    hash: commitHash,
                    files_changed: input.commit?.files_changed,
                    message: input.commit?.message
                };
            }
        } else if (input.commit) {
            commit = input.commit;
        }

        const systemPrompt = `SYSTEM:
You are TestFox Issue Agent, a strict and deterministic issue-enrichment component embedded inside a VS Code testing extension.

Your responsibility:
- Transform failed test data into high-quality bug tracker inputs
- Prepare issue titles, descriptions, labels, severity
- Support GitHub Issues and Jira Bugs
- Never create issues automatically; only prepare structured content

Hard rules:
- Do NOT hallucinate root causes, fixes, or missing data
- Do NOT guess developer intent
- Do NOT invent stack traces, logs, or file names
- If information is missing, set the value to null
- Never output explanations, markdown decorations, or conversational text
- Never use emojis
- Never output prose unless explicitly requested

Input context you may receive:
- Test metadata (name, category, type)
- Failure logs and stack traces
- Test execution summary
- Historical test results (optional)
- Git commit metadata (hash, files changed, message)
- Target issue platform ("github" or "jira")

Your task:
1. Generate a concise, factual issue title
2. Generate a clear issue description based strictly on provided data
3. Suggest appropriate labels/tags
4. Assign severity based only on observable failure impact
5. Indicate confidence level for the issue content

Severity rules:
- "high" → test blocks core functionality or many tests fail
- "medium" → isolated functional failure
- "low" → non-functional, flaky, or edge-case failure
- If severity cannot be determined, return null

Deduplication support:
- If historical failures are provided, indicate whether this failure appears repetitive
- Do NOT claim duplication unless evidence exists

Output rules:
- Output JSON only
- All keys must exist
- Use null instead of omitting fields
- Arrays must be empty if no values exist
- Do not include any text outside JSON

Default output schema:
{
  "platform": "github | jira",
  "title": "",
  "description": "",
  "labels": [],
  "severity": "",
  "confidence": "high | medium | low",
  "is_potential_duplicate": false,
  "duplicate_reason": null,
  "references": {
    "test_name": "",
    "test_category": "",
    "run_id": "",
    "commit": ""
  }
}

Precision is more important than completeness.
You are a component in an automated system.`;

        const userPrompt = `Prepare issue content for a failed test.

INPUT:
{
  "platform": "${input.platform}",
  "test_name": "${input.test.name}",
  "test_category": "${input.test.category}",
  "run_id": "${input.runId}",
  "logs": ${JSON.stringify(input.logs || 'No logs available')},
  "stack_trace": ${JSON.stringify(input.stackTrace || input.result.error || 'No stack trace available')},
  "commit": ${commit ? JSON.stringify(commit) : 'null'},
  "historical_failures": ${input.historicalFailures ? JSON.stringify(input.historicalFailures) : '[]'}
}`;

        try {
            const response = await this.openRouter.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ], { maxTokens: 2000, temperature: 0.3 });

            // Parse JSON response
            let jsonStr = response.trim();
            
            // Remove markdown code blocks if present
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const issueContent = JSON.parse(jsonStr) as IssueContent;
            
            // Validate and set defaults
            return {
                platform: issueContent.platform || input.platform,
                title: issueContent.title || `Test Failed: ${input.test.name}`,
                description: issueContent.description || `Test ${input.test.name} failed during execution.`,
                labels: Array.isArray(issueContent.labels) ? issueContent.labels : [],
                severity: issueContent.severity || this.inferSeverity(input.test),
                confidence: issueContent.confidence || 'medium',
                is_potential_duplicate: issueContent.is_potential_duplicate || false,
                duplicate_reason: issueContent.duplicate_reason || null,
                references: {
                    test_name: issueContent.references?.test_name || input.test.name,
                    test_category: issueContent.references?.test_category || input.test.category,
                    run_id: issueContent.references?.run_id || input.runId,
                    commit: issueContent.references?.commit || commit?.hash || null
                }
            };
        } catch (error) {
            console.error('Failed to generate issue content:', error);
            throw new Error(`Failed to generate issue content: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Infer severity from test priority if AI doesn't provide it
     */
    private inferSeverity(test: TestCase): 'high' | 'medium' | 'low' {
        switch (test.priority) {
            case 'critical':
            case 'high':
                return 'high';
            case 'medium':
                return 'medium';
            case 'low':
                return 'low';
            default:
                return 'medium';
        }
    }

    /**
     * Create GitHub issue
     */
    async createGitHubIssue(issueContent: IssueContent): Promise<string | null> {
        try {
            const session = await vscode.authentication.getSession(
                'github',
                ['repo'],
                { createIfNone: true }
            );

            if (!session) {
                throw new Error('GitHub authentication required');
            }

            // Get repository info
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder found');
            }

            // Try to get repo from git
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            let repoOwner: string | null = null;
            let repoName: string | null = null;

            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                const repositories = git.repositories;
                
                if (repositories.length > 0) {
                    const repo = repositories[0];
                    const remote = repo.state.remotes.find(r => r.name === 'origin');
                    if (remote && remote.fetchUrl) {
                        const match = remote.fetchUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
                        if (match) {
                            repoOwner = match[1];
                            repoName = match[2].replace('.git', '');
                        }
                    }
                }
            }

            if (!repoOwner || !repoName) {
                // Prompt user for repo info
                repoOwner = await vscode.window.showInputBox({
                    prompt: 'GitHub repository owner (username or organization)',
                    placeHolder: 'username',
                    validateInput: (value) => value ? null : 'Repository owner is required'
                }) || null;

                if (!repoOwner) return null;

                repoName = await vscode.window.showInputBox({
                    prompt: 'GitHub repository name',
                    placeHolder: 'repo-name',
                    validateInput: (value) => value ? null : 'Repository name is required'
                }) || null;

                if (!repoName) return null;
            }

            // Create issue via GitHub API
            const issueBody = this.formatGitHubIssueBody(issueContent);
            const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${session.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'TestFox-VSCode'
                },
                body: JSON.stringify({
                    title: issueContent.title,
                    body: issueBody,
                    labels: issueContent.labels
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`GitHub API error: ${response.status} ${error}`);
            }

            const issue = await response.json();
            return issue.html_url;
        } catch (error) {
            console.error('Failed to create GitHub issue:', error);
            throw error;
        }
    }

    /**
     * Format issue body for GitHub
     */
    private formatGitHubIssueBody(issueContent: IssueContent): string {
        let body = `${issueContent.description}\n\n`;
        body += `## Test Information\n\n`;
        body += `- **Test Name**: ${issueContent.references.test_name}\n`;
        body += `- **Category**: ${issueContent.references.test_category}\n`;
        body += `- **Run ID**: ${issueContent.references.run_id}\n`;
        
        if (issueContent.references.commit) {
            body += `- **Commit**: ${issueContent.references.commit}\n`;
        }
        
        if (issueContent.severity) {
            body += `- **Severity**: ${issueContent.severity}\n`;
        }
        
        if (issueContent.is_potential_duplicate && issueContent.duplicate_reason) {
            body += `\n⚠️ **Potential Duplicate**: ${issueContent.duplicate_reason}\n`;
        }
        
        body += `\n---\n*Created by TestFox Extension*`;
        
        return body;
    }

    /**
     * Create Jira issue (placeholder - requires Jira API integration)
     */
    async createJiraIssue(issueContent: IssueContent): Promise<string | null> {
        // Jira integration would require:
        // 1. Jira API credentials
        // 2. Project key
        // 3. Issue type configuration
        
        const jiraUrl = await vscode.window.showInputBox({
            prompt: 'Jira instance URL (e.g., https://yourcompany.atlassian.net)',
            placeHolder: 'https://yourcompany.atlassian.net'
        });

        if (!jiraUrl) return null;

        vscode.window.showInformationMessage(
            'Jira integration requires API token configuration. ' +
            'Please configure Jira credentials in TestFox settings.',
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'testfox.jira');
            }
        });

        // Return formatted issue content for manual creation
        const issueText = this.formatJiraIssueBody(issueContent);
        await vscode.env.clipboard.writeText(issueText);
        vscode.window.showInformationMessage('Jira issue content copied to clipboard. Paste it into Jira.');

        return null;
    }

    /**
     * Format issue body for Jira
     */
    private formatJiraIssueBody(issueContent: IssueContent): string {
        let body = `${issueContent.description}\n\n`;
        body += `*Test Information:*\n`;
        body += `* Test Name: ${issueContent.references.test_name}\n`;
        body += `* Category: ${issueContent.references.test_category}\n`;
        body += `* Run ID: ${issueContent.references.run_id}\n`;
        
        if (issueContent.references.commit) {
            body += `* Commit: ${issueContent.references.commit}\n`;
        }
        
        if (issueContent.severity) {
            body += `* Severity: ${issueContent.severity}\n`;
        }
        
        if (issueContent.labels.length > 0) {
            body += `* Labels: ${issueContent.labels.join(', ')}\n`;
        }
        
        return body;
    }
}

