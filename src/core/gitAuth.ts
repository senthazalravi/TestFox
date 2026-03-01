import * as vscode from 'vscode';

/**
 * GitHub authentication manager using VS Code authentication API
 */
export class GitAuth {
    private static readonly GITHUB_SCOPES = ['repo', 'read:user'];

    /**
     * Get GitHub authentication session
     */
    static async getSession(createIfNone: boolean = true): Promise<vscode.AuthenticationSession | null> {
        try {
            const session = await vscode.authentication.getSession(
                'github',
                this.GITHUB_SCOPES,
                { createIfNone, clearSessionPreference: false }
            );
            return session;
        } catch (error) {
            console.error('GitHub authentication failed:', error);
            return null;
        }
    }

    /**
     * Check if user is authenticated
     */
    static async isAuthenticated(): Promise<boolean> {
        const session = await this.getSession(false);
        return session !== null;
    }

    /**
     * Get GitHub username
     */
    static async getUsername(): Promise<string | null> {
        const session = await this.getSession(false);
        if (!session) return null;

        try {
            // Use GitHub API to get user info
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${session.accessToken}`,
                    'User-Agent': 'TestFox-VSCode'
                }
            });

            if (response.ok) {
                const user = await response.json();
                return user.login || null;
            }
        } catch (error) {
            console.error('Failed to get GitHub username:', error);
        }

        return null;
    }

    /**
     * Get access token
     */
    static async getAccessToken(): Promise<string | null> {
        const session = await this.getSession(false);
        return session?.accessToken || null;
    }

    /**
     * Sign out
     */
    static async signOut(): Promise<void> {
        try {
            const session = await this.getSession(false);
            if (session) {
                await vscode.authentication.getSession('github', this.GITHUB_SCOPES, {
                    createIfNone: false,
                    clearSessionPreference: true
                });
            }
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    }
}

