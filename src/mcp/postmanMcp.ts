import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createAIService, AIProvider } from '../ai/aiService';

/**
 * Simple Postman collection builder that uses AI to craft request bodies/examples
 */
export class PostmanMCP {
    private workspaceRoot: string;
    private ai: any;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        // Use Ollama as the preferred local model
        this.ai = createAIService({ provider: AIProvider.OLLAMA, baseUrl: 'http://localhost:11434', model: 'llama2' });
    }

    async generateCollection(analysisResult: any): Promise<{ collectionPath: string; collection: any }> {
        const collection: any = {
            info: {
                name: `${path.basename(this.workspaceRoot || '.')}-TestFox-Collection`,
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: [] as any[]
        };

        const endpoints = Array.isArray(analysisResult?.endpoints) ? analysisResult.endpoints : [];

        for (const ep of endpoints) {
            try {
                const item = await this.buildRequestItem(ep);
                collection.item.push(item);
            } catch (e) {
                console.warn('PostmanMCP: Failed to build item for endpoint', ep, e);
            }
        }

        const folder = path.join(this.workspaceRoot, '.testfox');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const collectionPath = path.join(folder, 'postman_collection.json');
        fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf8');

        return { collectionPath, collection };
    }

    private async buildRequestItem(endpoint: any): Promise<any> {
        const method = (endpoint.method || 'GET').toUpperCase();
        const url = endpoint.path || '/';

        // Ask AI for an example payload/params for this endpoint
        const prompt = `Provide a concise example ${method} request for the API endpoint path ${url}. Include JSON body if applicable and example query parameters. Respond with a JSON object: { "query": { ... }, "body": { ... } } and nothing else.`;

        let example: any = {};
        try {
            const aiResp = await this.ai.generate({ type: 'payloads', context: { endpoint }, prompt });
            if (aiResp.success && aiResp.data) {
                const text = typeof aiResp.data === 'string' ? aiResp.data : JSON.stringify(aiResp.data);
                // Try to extract JSON
                const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                const raw = m ? m[1] : text;
                example = JSON.parse(raw);
            }
        } catch (e) {
            example = {};
        }

        const request: any = {
            name: `${method} ${url}`,
            request: {
                method,
                header: [ { key: 'Content-Type', value: 'application/json' } ],
                url: {
                    raw: `{{baseUrl}}${url}`,
                    host: ['{{baseUrl}}'],
                    path: url.split('/').filter(Boolean)
                }
            },
            response: []
        };

        if (method === 'GET' && example.query) {
            request.request.url.query = Object.keys(example.query).map(k => ({ key: k, value: String(example.query[k]) }));
        }

        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && example.body) {
            request.request.body = {
                mode: 'raw',
                raw: JSON.stringify(example.body, null, 2),
                options: { raw: { language: 'json' } }
            };
        }

        // Basic tests
        request.event = [
            {
                listen: 'test',
                script: {
                    exec: [
                        "pm.test('Status is 2xx', function () { pm.expect(pm.response.code).to.be.within(200, 299); });",
                        "pm.test('Response is JSON', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'); });"
                    ],
                    type: 'text/javascript'
                }
            }
        ];

        return request;
    }

    async generateReport(collection: any, results: any[]): Promise<string> {
        const folder = path.join(this.workspaceRoot, '.testfox');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const reportPath = path.join(folder, 'postman_report.json');
        const report = { generatedAt: new Date().toISOString(), collectionInfo: collection.info, results };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
        return reportPath;
    }
}

export default PostmanMCP;
