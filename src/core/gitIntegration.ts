import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GitAuth } from './gitAuth';
import { TestRunStorage, TestRunData } from './testRunStorage';

/**
 * Git integration for storing test results
 */
export class GitIntegration {
    private storage: TestRunStorage;
    private workspacePath: string;
    private isGitRepo: boolean = false;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.storage = new TestRunStorage(workspacePath);
        this.checkGitRepo();
    }

    /**
     * Check if workspace is a git repository
     */
    private async checkGitRepo(): Promise<void> {
        const gitDir = path.join(this.workspacePath, '.git');
        this.isGitRepo = fs.existsSync(gitDir);
    }

    /**
     * Get current commit hash
     */
    async getCurrentCommit(): Promise<string | null> {
        if (!this.isGitRepo) {
            return null;
        }

        try {
            // Use VS Code Git API if available
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                const repositories = git.repositories;
                
                if (repositories.length > 0) {
                    const repo = repositories[0];
                    const head = repo.state.HEAD;
                    return head?.commit || null;
                }
            }

            // Fallback: read .git/HEAD
            const headPath = path.join(this.workspacePath, '.git', 'HEAD');
            if (fs.existsSync(headPath)) {
                const headContent = fs.readFileSync(headPath, 'utf-8').trim();
                if (headContent.startsWith('ref: ')) {
                    const refPath = path.join(this.workspacePath, '.git', headContent.substring(5));
                    if (fs.existsSync(refPath)) {
                        return fs.readFileSync(refPath, 'utf-8').trim();
                    }
                } else {
                    return headContent;
                }
            }
        } catch (error) {
            console.error('Failed to get commit hash:', error);
        }

        return null;
    }

    /**
     * Store test run with Git integration
     */
    async storeTestRun(
        runData: Omit<TestRunData, 'id' | 'commit' | 'timestamp'>
    ): Promise<string> {
        // Get commit hash
        const commit = await this.getCurrentCommit();

        // Create full run data
        const fullRunData: TestRunData = {
            ...runData,
            id: this.generateRunId(),
            commit: commit || undefined,
            timestamp: new Date()
        };

        // Save to .testfox/
        const filepath = await this.storage.saveRun(fullRunData);

        // Check if Git storage is enabled
        const config = vscode.workspace.getConfiguration('testfox');
        const storeInGit = config.get<boolean>('storeResultsInGit', false);

        if (storeInGit && this.isGitRepo) {
            await this.commitToGit(filepath, fullRunData);
        }

        return filepath;
    }

    /**
     * Commit test results to Git
     */
    private async commitToGit(filepath: string, runData: TestRunData): Promise<void> {
        try {
            // Check if .testfox is in .gitignore
            await this.ensureGitignore();

            // Stage the file
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                const repositories = git.repositories;
                
                if (repositories.length > 0) {
                    const repo = repositories[0];
                    
                    // Add file to staging
                    const relativePath = path.relative(this.workspacePath, filepath);
                    await repo.add([relativePath]);

                    // Commit with message
                    const commitMessage = this.generateCommitMessage(runData);
                    await repo.commit(commitMessage, { all: false });

                    console.log(`Test run committed to Git: ${commitMessage}`);
                }
            }
        } catch (error) {
            console.error('Failed to commit to Git:', error);
            // Don't throw - Git commit failure shouldn't break test execution
        }
    }

    /**
     * Ensure .testfox is in .gitignore (but allow latest.json and runs/)
     */
    private async ensureGitignore(): Promise<void> {
        const gitignorePath = path.join(this.workspacePath, '.gitignore');
        const testfoxEntry = '.testfox/*\n!.testfox/runs/\n!.testfox/latest.json\n!.testfox/config.json';

        if (!fs.existsSync(gitignorePath)) {
            fs.writeFileSync(gitignorePath, `\n# TestFox\n${testfoxEntry}\n`, 'utf-8');
            return;
        }

        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (!content.includes('.testfox')) {
            fs.appendFileSync(gitignorePath, `\n# TestFox\n${testfoxEntry}\n`, 'utf-8');
        }
    }

    /**
     * Generate commit message
     */
    private generateCommitMessage(runData: TestRunData): string {
        const passRate = runData.summary.total > 0
            ? Math.round((runData.summary.passed / runData.summary.total) * 100)
            : 0;

        return `testfox: test run ${runData.id.substring(0, 8)}\n\n` +
               `Passed: ${runData.summary.passed}/${runData.summary.total} (${passRate}%)\n` +
               `Failed: ${runData.summary.failed}\n` +
               `Skipped: ${runData.summary.skipped}\n` +
               `Trigger: ${runData.trigger}`;
    }

    /**
     * Generate unique run ID
     */
    private generateRunId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `run-${timestamp}-${random}`;
    }

    /**
     * Get test run storage instance
     */
    getStorage(): TestRunStorage {
        return this.storage;
    }
}

