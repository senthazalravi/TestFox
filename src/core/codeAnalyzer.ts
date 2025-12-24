import * as fs from 'fs';
import * as path from 'path';
import {
    ProjectInfo,
    AnalysisResult,
    RouteInfo,
    FormInfo,
    EndpointInfo,
    AuthFlowInfo,
    DatabaseQueryInfo,
    ExternalApiInfo,
    ComponentInfo,
    HttpMethod,
    FormFieldInfo
} from '../types';

/**
 * Analyzes code to identify routes, forms, endpoints, auth flows, etc.
 */
export class CodeAnalyzer {
    private ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'out', '__pycache__', 'venv', '.venv'];

    async analyze(workspacePath: string, projectInfo: ProjectInfo): Promise<AnalysisResult> {
        const result: AnalysisResult = {
            routes: [],
            forms: [],
            endpoints: [],
            authFlows: [],
            databaseQueries: [],
            externalApis: [],
            components: []
        };

        // Get all relevant source files
        const files = await this.getSourceFiles(workspacePath, projectInfo);

        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                const relativePath = path.relative(workspacePath, file);

                // Analyze based on project type
                this.analyzeRoutes(content, relativePath, projectInfo, result);
                this.analyzeForms(content, relativePath, projectInfo, result);
                this.analyzeEndpoints(content, relativePath, projectInfo, result);
                this.analyzeAuthFlows(content, relativePath, result);
                this.analyzeDatabaseQueries(content, relativePath, result);
                this.analyzeExternalApis(content, relativePath, result);
                this.analyzeComponents(content, relativePath, projectInfo, result);
            } catch (error) {
                // Skip files that can't be read
            }
        }

        return result;
    }

    private async getSourceFiles(dir: string, projectInfo: ProjectInfo): Promise<string[]> {
        const files: string[] = [];
        const extensions = this.getExtensions(projectInfo);

        const walkDir = (currentDir: string) => {
            try {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    
                    if (entry.isDirectory()) {
                        if (!this.ignoreDirs.includes(entry.name)) {
                            walkDir(fullPath);
                        }
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name);
                        if (extensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                // Skip directories that can't be read
            }
        };

        walkDir(dir);
        return files;
    }

    private getExtensions(projectInfo: ProjectInfo): string[] {
        const baseExtensions: Record<string, string[]> = {
            'javascript': ['.js', '.jsx', '.mjs'],
            'typescript': ['.ts', '.tsx'],
            'python': ['.py'],
            'java': ['.java'],
            'kotlin': ['.kt', '.kts'],
            'go': ['.go'],
            'php': ['.php'],
            'ruby': ['.rb'],
            'csharp': ['.cs']
        };

        return baseExtensions[projectInfo.language] || ['.js', '.ts', '.jsx', '.tsx'];
    }

    private analyzeRoutes(content: string, file: string, projectInfo: ProjectInfo, result: AnalysisResult): void {
        const lines = content.split('\n');

        // Express/Fastify/Koa routes
        const routePatterns = [
            // Express: app.get('/path', handler)
            /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
            // NestJS: @Get('/path')
            /@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*['"`]?([^'"`\)]*)/gi,
            // FastAPI: @app.get('/path')
            /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
            // Flask: @app.route('/path')
            /@(?:app|blueprint)\.route\s*\(\s*['"`]([^'"`]+)['"`](?:.*methods\s*=\s*\[([^\]]+)\])?/gi,
            // Spring: @GetMapping('/path')
            /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*)?['"`]?([^'"`\)]*)/gi,
            // Go Gin: r.GET('/path', handler)
            /(?:r|router|g|engine)\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*['"`]([^'"`]+)['"`]/gi
        ];

        for (const pattern of routePatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const method = (match[1] || 'GET').toUpperCase() as HttpMethod;
                const routePath = match[2] || match[1];
                const lineNumber = this.getLineNumber(content, match.index);

                // Check for authentication middleware
                const lineContent = lines[lineNumber - 1] || '';
                const hasAuth = /auth|jwt|bearer|session|protect|guard/i.test(lineContent) ||
                               this.hasAuthMiddleware(content, match.index);

                result.routes.push({
                    path: routePath,
                    method,
                    file,
                    line: lineNumber,
                    authentication: hasAuth,
                    params: this.extractRouteParams(routePath),
                    queryParams: this.extractQueryParams(content, match.index)
                });
            }
        }

        // React Router / Vue Router / Next.js pages
        if (['react', 'vue', 'nextjs', 'nuxt', 'angular'].includes(projectInfo.framework || '')) {
            this.analyzeClientRoutes(content, file, projectInfo, result);
        }
    }

    private analyzeClientRoutes(content: string, file: string, projectInfo: ProjectInfo, result: AnalysisResult): void {
        // React Router
        const reactRoutePattern = /<Route\s+[^>]*path\s*=\s*['"`]([^'"`]+)['"`]/gi;
        let match;
        while ((match = reactRoutePattern.exec(content)) !== null) {
            result.routes.push({
                path: match[1],
                method: 'GET',
                file,
                line: this.getLineNumber(content, match.index)
            });
        }

        // Next.js pages (based on file path)
        if (file.includes('pages/') || file.includes('app/')) {
            const pagePath = file
                .replace(/.*pages\//, '/')
                .replace(/.*app\//, '/')
                .replace(/\.(tsx?|jsx?)$/, '')
                .replace(/\/index$/, '/')
                .replace(/\[([^\]]+)\]/g, ':$1');

            if (!result.routes.some(r => r.path === pagePath && r.file === file)) {
                result.routes.push({
                    path: pagePath,
                    method: 'GET',
                    file,
                    line: 1
                });
            }
        }
    }

    private analyzeForms(content: string, file: string, projectInfo: ProjectInfo, result: AnalysisResult): void {
        // HTML forms
        const formPattern = /<form[^>]*>/gi;
        let match;
        while ((match = formPattern.exec(content)) !== null) {
            const formTag = match[0];
            const lineNumber = this.getLineNumber(content, match.index);
            
            // Extract form attributes
            const actionMatch = formTag.match(/action\s*=\s*['"`]([^'"`]+)['"`]/i);
            const methodMatch = formTag.match(/method\s*=\s*['"`]([^'"`]+)['"`]/i);
            const nameMatch = formTag.match(/(?:name|id)\s*=\s*['"`]([^'"`]+)['"`]/i);

            // Find form fields
            const formEndIndex = content.indexOf('</form>', match.index);
            const formContent = content.substring(match.index, formEndIndex > 0 ? formEndIndex : undefined);
            const fields = this.extractFormFields(formContent);

            result.forms.push({
                name: nameMatch ? nameMatch[1] : `form_${lineNumber}`,
                file,
                line: lineNumber,
                action: actionMatch ? actionMatch[1] : undefined,
                method: (methodMatch ? methodMatch[1].toUpperCase() : 'GET') as HttpMethod,
                fields
            });
        }

        // React form components
        const reactFormPattern = /(?:onSubmit|handleSubmit)\s*=\s*\{/gi;
        while ((match = reactFormPattern.exec(content)) !== null) {
            const lineNumber = this.getLineNumber(content, match.index);
            
            // Look for input fields nearby
            const contextStart = Math.max(0, match.index - 500);
            const contextEnd = Math.min(content.length, match.index + 2000);
            const context = content.substring(contextStart, contextEnd);
            const fields = this.extractFormFields(context);

            if (fields.length > 0) {
                result.forms.push({
                    name: `react_form_${lineNumber}`,
                    file,
                    line: lineNumber,
                    fields
                });
            }
        }
    }

    private extractFormFields(formContent: string): FormFieldInfo[] {
        const fields: FormFieldInfo[] = [];
        
        // Input fields
        const inputPattern = /<input[^>]+>/gi;
        let match;
        while ((match = inputPattern.exec(formContent)) !== null) {
            const inputTag = match[0];
            const nameMatch = inputTag.match(/name\s*=\s*['"`]([^'"`]+)['"`]/i);
            const typeMatch = inputTag.match(/type\s*=\s*['"`]([^'"`]+)['"`]/i);
            const requiredMatch = inputTag.match(/required/i);
            const minLengthMatch = inputTag.match(/minlength\s*=\s*['"`]?(\d+)/i);
            const maxLengthMatch = inputTag.match(/maxlength\s*=\s*['"`]?(\d+)/i);
            const minMatch = inputTag.match(/\bmin\s*=\s*['"`]?(\d+)/i);
            const maxMatch = inputTag.match(/\bmax\s*=\s*['"`]?(\d+)/i);
            const patternMatch = inputTag.match(/pattern\s*=\s*['"`]([^'"`]+)['"`]/i);

            if (nameMatch) {
                fields.push({
                    name: nameMatch[1],
                    type: typeMatch ? typeMatch[1] : 'text',
                    required: !!requiredMatch,
                    minLength: minLengthMatch ? parseInt(minLengthMatch[1], 10) : undefined,
                    maxLength: maxLengthMatch ? parseInt(maxLengthMatch[1], 10) : undefined,
                    min: minMatch ? parseInt(minMatch[1], 10) : undefined,
                    max: maxMatch ? parseInt(maxMatch[1], 10) : undefined,
                    pattern: patternMatch ? patternMatch[1] : undefined
                });
            }
        }

        // Textarea fields
        const textareaPattern = /<textarea[^>]*name\s*=\s*['"`]([^'"`]+)['"`][^>]*>/gi;
        while ((match = textareaPattern.exec(formContent)) !== null) {
            fields.push({
                name: match[1],
                type: 'textarea',
                required: /required/i.test(match[0])
            });
        }

        // Select fields
        const selectPattern = /<select[^>]*name\s*=\s*['"`]([^'"`]+)['"`][^>]*>/gi;
        while ((match = selectPattern.exec(formContent)) !== null) {
            fields.push({
                name: match[1],
                type: 'select',
                required: /required/i.test(match[0])
            });
        }

        return fields;
    }

    private analyzeEndpoints(content: string, file: string, projectInfo: ProjectInfo, result: AnalysisResult): void {
        // API endpoint definitions (similar to routes but specifically for API)
        const apiPatterns = [
            // Express API
            /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`](\/api[^'"`]+)['"`]/gi,
            // Fetch/Axios API calls
            /(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*['"`]([^'"`]+)['"`]/gi,
            // OpenAPI/Swagger annotations
            /@(?:Api|ApiOperation|ApiResponse)/gi
        ];

        for (const pattern of apiPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const method = (match[1] || 'GET').toUpperCase() as HttpMethod;
                const path = match[2] || match[1];
                const lineNumber = this.getLineNumber(content, match.index);

                // Check if already added as route
                if (!result.endpoints.some(e => e.path === path && e.file === file)) {
                    result.endpoints.push({
                        path,
                        method,
                        file,
                        line: lineNumber,
                        authentication: this.hasAuthMiddleware(content, match.index)
                    });
                }
            }
        }
    }

    private analyzeAuthFlows(content: string, file: string, result: AnalysisResult): void {
        const authPatterns = [
            { pattern: /login|signin|sign[-_]?in/gi, type: 'login' as const },
            { pattern: /register|signup|sign[-_]?up/gi, type: 'register' as const },
            { pattern: /logout|signout|sign[-_]?out/gi, type: 'logout' as const },
            { pattern: /(?:forgot|reset)[-_]?password/gi, type: 'password-reset' as const },
            { pattern: /oauth|google[-_]?auth|facebook[-_]?auth|github[-_]?auth/gi, type: 'oauth' as const },
            { pattern: /mfa|2fa|two[-_]?factor|otp|totp/gi, type: 'mfa' as const }
        ];

        for (const { pattern, type } of authPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this.getLineNumber(content, match.index);
                
                // Look for associated route/endpoint
                const contextStart = Math.max(0, match.index - 200);
                const contextEnd = Math.min(content.length, match.index + 200);
                const context = content.substring(contextStart, contextEnd);
                
                const routeMatch = context.match(/['"`](\/[^'"`]+)['"`]/);
                const methodMatch = context.match(/\b(get|post|put|patch|delete)\b/i);

                result.authFlows.push({
                    type,
                    file,
                    line: lineNumber,
                    endpoint: routeMatch ? routeMatch[1] : undefined,
                    method: methodMatch ? methodMatch[1].toUpperCase() as HttpMethod : undefined
                });
            }
        }
    }

    private analyzeDatabaseQueries(content: string, file: string, result: AnalysisResult): void {
        // Raw SQL queries
        const rawSqlPattern = /(?:execute|query|raw)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
        let match;
        while ((match = rawSqlPattern.exec(content)) !== null) {
            const query = match[1].toLowerCase();
            const isParameterized = /\$\d|\?|:\w+|@\w+/.test(match[1]);
            
            let type: DatabaseQueryInfo['type'] = 'raw';
            if (query.startsWith('select')) type = 'select';
            else if (query.startsWith('insert')) type = 'insert';
            else if (query.startsWith('update')) type = 'update';
            else if (query.startsWith('delete')) type = 'delete';

            result.databaseQueries.push({
                type,
                file,
                line: this.getLineNumber(content, match.index),
                query: match[1],
                parameterized: isParameterized
            });
        }

        // ORM queries (Prisma, TypeORM, Sequelize, etc.)
        const ormPatterns = [
            /\.(?:findOne|findMany|findFirst|findUnique|create|update|delete|upsert)\s*\(/gi,
            /\.(?:find|findOne|save|remove|delete|insert|update)\s*\(/gi,
            /(?:Model|models)\.\w+\.(?:find|create|update|destroy)/gi
        ];

        for (const pattern of ormPatterns) {
            while ((match = pattern.exec(content)) !== null) {
                result.databaseQueries.push({
                    type: 'select', // ORM queries are generally safer
                    file,
                    line: this.getLineNumber(content, match.index),
                    parameterized: true // ORMs typically use parameterized queries
                });
            }
        }
    }

    private analyzeExternalApis(content: string, file: string, result: AnalysisResult): void {
        // External API calls
        const apiCallPatterns = [
            /fetch\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/gi,
            /axios\.(?:get|post|put|patch|delete)\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/gi,
            /request\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/gi,
            /http\.(?:get|post|put|patch|delete)\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/gi
        ];

        for (const pattern of apiCallPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                // Extract method from pattern match
                const methodMatch = match[0].match(/\.(get|post|put|patch|delete)/i);
                const method = methodMatch ? methodMatch[1].toUpperCase() as HttpMethod : 'GET';

                result.externalApis.push({
                    url: match[1],
                    method,
                    file,
                    line: this.getLineNumber(content, match.index)
                });
            }
        }
    }

    private analyzeComponents(content: string, file: string, projectInfo: ProjectInfo, result: AnalysisResult): void {
        if (!['react', 'vue', 'angular', 'svelte'].includes(projectInfo.framework || '')) {
            return;
        }

        // React components
        const reactComponentPattern = /(?:function|const|class)\s+(\w+).*(?:React\.Component|=>.*<|extends\s+Component)/gi;
        let match;
        while ((match = reactComponentPattern.exec(content)) !== null) {
            const componentName = match[1];
            const lineNumber = this.getLineNumber(content, match.index);

            // Determine component type based on file path and content
            let type: ComponentInfo['type'] = 'component';
            if (file.includes('pages/') || file.includes('/page')) type = 'page';
            else if (file.includes('layout')) type = 'layout';
            else if (/modal|dialog/i.test(componentName)) type = 'modal';
            else if (/form/i.test(componentName)) type = 'form';

            result.components.push({
                name: componentName,
                file,
                line: lineNumber,
                type,
                props: this.extractProps(content, match.index),
                events: this.extractEvents(content, match.index)
            });
        }

        // Vue components (SFC)
        if (file.endsWith('.vue')) {
            const nameMatch = content.match(/name:\s*['"`](\w+)['"`]/);
            const componentName = nameMatch ? nameMatch[1] : path.basename(file, '.vue');
            
            let type: ComponentInfo['type'] = 'component';
            if (file.includes('pages/') || file.includes('views/')) type = 'page';
            else if (file.includes('layout')) type = 'layout';

            result.components.push({
                name: componentName,
                file,
                line: 1,
                type,
                props: this.extractVueProps(content),
                events: this.extractVueEvents(content)
            });
        }
    }

    private extractProps(content: string, startIndex: number): string[] {
        const props: string[] = [];
        const contextEnd = Math.min(content.length, startIndex + 1000);
        const context = content.substring(startIndex, contextEnd);
        
        // TypeScript/JSDoc props
        const propsPattern = /(?:props|Props).*?{([^}]+)}/s;
        const match = context.match(propsPattern);
        if (match) {
            const propsContent = match[1];
            const propNames = propsContent.match(/(\w+)\s*[?:]?\s*:/g);
            if (propNames) {
                props.push(...propNames.map(p => p.replace(/[?:]/g, '').trim()));
            }
        }

        return props;
    }

    private extractEvents(content: string, startIndex: number): string[] {
        const events: string[] = [];
        const contextEnd = Math.min(content.length, startIndex + 2000);
        const context = content.substring(startIndex, contextEnd);
        
        // onClick, onChange, onSubmit, etc.
        const eventPattern = /on([A-Z]\w+)\s*[=:]/g;
        let match;
        while ((match = eventPattern.exec(context)) !== null) {
            events.push(match[1].toLowerCase());
        }

        return [...new Set(events)];
    }

    private extractVueProps(content: string): string[] {
        const props: string[] = [];
        const propsPattern = /props:\s*(?:\[([^\]]+)\]|{([^}]+)})/s;
        const match = content.match(propsPattern);
        
        if (match) {
            const propsContent = match[1] || match[2];
            const propNames = propsContent.match(/['"`]?(\w+)['"`]?\s*[,:\]]/g);
            if (propNames) {
                props.push(...propNames.map(p => p.replace(/['"`,:[\]]/g, '').trim()));
            }
        }

        return props;
    }

    private extractVueEvents(content: string): string[] {
        const events: string[] = [];
        const emitPattern = /\$emit\s*\(\s*['"`](\w+)['"`]/g;
        let match;
        while ((match = emitPattern.exec(content)) !== null) {
            events.push(match[1]);
        }
        return events;
    }

    private getLineNumber(content: string, index: number): number {
        return content.substring(0, index).split('\n').length;
    }

    private extractRouteParams(path: string): string[] {
        const params: string[] = [];
        const paramPattern = /:(\w+)|{(\w+)}/g;
        let match;
        while ((match = paramPattern.exec(path)) !== null) {
            params.push(match[1] || match[2]);
        }
        return params;
    }

    private extractQueryParams(content: string, startIndex: number): string[] {
        const params: string[] = [];
        const contextEnd = Math.min(content.length, startIndex + 500);
        const context = content.substring(startIndex, contextEnd);
        
        // req.query.param or query.get('param')
        const queryPattern = /(?:query|searchParams)\.(?:get\s*\(\s*['"`](\w+)['"`]\)|(\w+))/g;
        let match;
        while ((match = queryPattern.exec(context)) !== null) {
            const param = match[1] || match[2];
            if (param && !['get', 'has', 'set'].includes(param)) {
                params.push(param);
            }
        }

        return params;
    }

    private hasAuthMiddleware(content: string, index: number): boolean {
        // Look for auth-related middleware in the surrounding context
        const contextStart = Math.max(0, index - 300);
        const contextEnd = Math.min(content.length, index + 100);
        const context = content.substring(contextStart, contextEnd);
        
        return /auth|jwt|bearer|session|protect|guard|authenticate|isLoggedIn|requireAuth/i.test(context);
    }
}

