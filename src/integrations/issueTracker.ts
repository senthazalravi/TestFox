import * as vscode from 'vscode';
import * as https from 'https';

export interface IssuePayload {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
}

export interface IssueResult {
    success: boolean;
    url?: string;
    error?: string;
}

export type IssueProvider = 'github' | 'gitlab' | 'bitbucket' | 'none';

export class IssueTracker {
    constructor(
        private provider: IssueProvider,
        private token: string,
        private owner: string,
        private repo: string,
        private baseUrl?: string // For GitLab/Bitbucket Enterprise or custom domains
    ) {}

    async verifyConnection(): Promise<{ success: boolean; username?: string; error?: string }> {
        try {
            switch (this.provider) {
                case 'github':
                    const ghUser = await this.makeRequest('https://api.github.com/user', 'GET', null, {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'TestFox-Extension'
                    });
                    return { success: true, username: ghUser.login };
                
                case 'gitlab':
                    const glUser = await this.makeRequest(`${this.baseUrl || 'https://gitlab.com'}/api/v4/user`, 'GET', null, {
                        'PRIVATE-TOKEN': this.token
                    });
                    return { success: true, username: glUser.username };

                case 'bitbucket':
                    const bbUser = await this.makeRequest('https://api.bitbucket.org/2.0/user', 'GET', null, this.getBitbucketHeaders());
                    return { success: true, username: bbUser.username || bbUser.display_name };

                default:
                    return { success: false, error: 'Unknown provider' };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async createIssue(payload: IssuePayload): Promise<IssueResult> {
        try {
            // Deduplication: Check for existing issue
            const existingIssue = await this.findSimilarIssue(payload.title);
            if (existingIssue) {
                return { success: true, url: existingIssue, error: 'Issue already exists' };
            }

            switch (this.provider) {
                case 'github':
                    return await this.createGitHubIssue(payload);
                case 'gitlab':
                    return await this.createGitLabIssue(payload);
                case 'bitbucket':
                    return await this.createBitbucketIssue(payload);
                default:
                    return { success: false, error: 'Unknown provider' };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Failed to create issue'
            };
        }
    }

    private async findSimilarIssue(title: string): Promise<string | null> {
        try {
            switch (this.provider) {
                case 'github':
                    const ghQuery = encodeURIComponent(`repo:${this.owner}/${this.repo} is:issue is:open in:title ${title}`);
                    const ghRes = await this.makeRequest(`https://api.github.com/search/issues?q=${ghQuery}`, 'GET', null, {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'TestFox-Extension'
                    });
                    return ghRes.items && ghRes.items.length > 0 ? ghRes.items[0].html_url : null;

                case 'gitlab':
                    const projectPath = encodeURIComponent(`${this.owner}/${this.repo}`);
                    const glRes = await this.makeRequest(`${this.baseUrl || 'https://gitlab.com'}/api/v4/projects/${projectPath}/issues?search=${encodeURIComponent(title)}&state=opened`, 'GET', null, {
                         'PRIVATE-TOKEN': this.token
                    });
                    return glRes && glRes.length > 0 ? glRes[0].web_url : null;
                
                case 'bitbucket':
                    const bbQuery = encodeURIComponent(`title~"${title}" AND state="OPEN"`);
                    const bbRes = await this.makeRequest(`https://api.bitbucket.org/2.0/repositories/${this.owner}/${this.repo}/issues?q=${bbQuery}`, 'GET', null, this.getBitbucketHeaders());
                    return bbRes.values && bbRes.values.length > 0 ? bbRes.values[0].links.html.href : null;

                default:
                    return null;
            }
        } catch {
            return null; // Fail safe: if search fails, assume no duplicate (or log it)
        }
    }

    private getBitbucketHeaders(): any {
        const headers: any = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (this.token.startsWith('Basic ')) {
            headers['Authorization'] = this.token;
        } else {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }


    private async createGitHubIssue(payload: IssuePayload): Promise<IssueResult> {
        const url = `https://api.github.com/repos/${this.owner}/${this.repo}/issues`;
        const body = {
            title: payload.title,
            body: payload.body,
            labels: payload.labels || ['bug', 'testfox'],
            assignees: payload.assignees
        };

        const response = await this.makeRequest(url, 'POST', body, {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'TestFox-Extension'
        });

        if (response.html_url) {
            return { success: true, url: response.html_url };
        } else {
            throw new Error(response.message || 'GitHub API error');
        }
    }

    private async createGitLabIssue(payload: IssuePayload): Promise<IssueResult> {
        // GitLab uses Project ID or URL-encoded path
        const projectPath = encodeURIComponent(`${this.owner}/${this.repo}`);
        const url = `${this.baseUrl || 'https://gitlab.com'}/api/v4/projects/${projectPath}/issues`;
        
        const body = {
            title: payload.title,
            description: payload.body, // GitLab uses 'description'
            labels: (payload.labels || ['bug', 'testfox']).join(','),
            assignee_ids: [] // Implementation would need user lookup for IDs
        };

        const response = await this.makeRequest(url, 'POST', body, {
            'PRIVATE-TOKEN': this.token,
            'Content-Type': 'application/json'
        });

        if (response.web_url) {
            return { success: true, url: response.web_url };
        } else {
            throw new Error(response.message || 'GitLab API error');
        }
    }

    private async createBitbucketIssue(payload: IssuePayload): Promise<IssueResult> {
        const url = `https://api.bitbucket.org/2.0/repositories/${this.owner}/${this.repo}/issues`;
        
        const body = {
            title: payload.title,
            content: {
                raw: payload.body,
                markup: 'markdown'
            },
            kind: 'bug',
            priority: 'major'
        };

        const headers = this.getBitbucketHeaders();
        const response = await this.makeRequest(url, 'POST', body, headers);

        if (response.links && response.links.html) {
            return { success: true, url: response.links.html.href };
        } else {
           // Bitbucket error handling
           if (response.type === 'error') {
               throw new Error(response.error.message);
           }
            throw new Error('Bitbucket API error');
        }
    }

    private async makeRequest(url: string, method: string, body: any, headers: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const req = https.request(url, {
                method,
                headers
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode && res.statusCode >= 400) {
                             // Pass parsed error body if available
                             reject(new Error(parsed.message || parsed.error || `Request failed with status ${res.statusCode}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse response: ' + data));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }
}
