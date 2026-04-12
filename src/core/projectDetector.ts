import * as fs from 'fs';
import * as path from 'path';
import { ProjectInfo, ProjectType, Framework } from '../types';

/**
 * Detects project type, framework, and configuration
 */
export class ProjectDetector {
    
    async detect(workspacePath: string): Promise<ProjectInfo> {
        const projectInfo: ProjectInfo = {
            type: 'unknown',
            language: 'unknown',
            rootPath: workspacePath,
            configFiles: []
        };

        // Detect based on configuration files
        await this.detectFromConfigFiles(workspacePath, projectInfo);

        // Detect framework
        await this.detectFramework(workspacePath, projectInfo);

        // Detect run commands
        await this.detectCommands(workspacePath, projectInfo);

        // Detect port
        await this.detectPort(workspacePath, projectInfo);

        // Detect platform characteristics
        this.detectPlatformTraits(workspacePath, projectInfo);

        return projectInfo;
    }

    /**
     * Detect whether this is a web app (frontend/fullstack) vs backend-only/CLI,
     * and determine if it can be auto-started for testing.
     */
    private detectPlatformTraits(workspacePath: string, info: ProjectInfo): void {
        const frontendFrameworks: string[] = ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'gatsby'];
        const fullstackFrameworks: string[] = ['nextjs', 'nuxt'];
        const backendWebFrameworks: string[] = ['express', 'fastify', 'koa', 'nestjs', 'hapi', 'django', 'flask', 'fastapi', 'springboot', 'spring', 'rails', 'sinatra', 'laravel', 'symfony', 'gin', 'echo', 'fiber', 'aspnet'];

        const fw = info.framework || '';

        // Check if this is a VS Code extension, CLI tool, or library (NOT a web app)
        let isVSCodeExtension = false;
        let isBuildToolProject = false;
        try {
            const pkgPath = path.join(workspacePath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

                // VS Code extension detection
                if (pkg.engines?.vscode || allDeps['@types/vscode'] || allDeps['@vscode/vsce']) {
                    isVSCodeExtension = true;
                    console.log('ProjectDetector: Detected VS Code extension - will not auto-start');
                }

                // CLI / library detection (no web server)
                if (pkg.bin && !pkg.scripts?.start?.includes('serve') && !pkg.scripts?.start?.includes('server')) {
                    isBuildToolProject = true;
                }

                // Check if dev command is a build/watch command, not a server
                const devScript = pkg.scripts?.dev || '';
                const watchScript = pkg.scripts?.watch || '';
                const isBuildWatch = /esbuild|webpack.*watch|tsc.*watch|rollup.*watch|gulp.*watch|nodemon.*build/i.test(devScript)
                    || /esbuild|webpack|tsc|rollup/i.test(watchScript);
                if (isBuildWatch && !devScript.includes('serve') && !devScript.includes('server') && !devScript.includes('next') && !devScript.includes('vite')) {
                    isBuildToolProject = true;
                    console.log('ProjectDetector: Dev command is a build/watch tool, not a web server');
                }

                // Bundler detection
                if (allDeps['vite'] && !isVSCodeExtension) {
                    (info as any).bundler = 'vite';
                }
                if ((allDeps['webpack'] || allDeps['react-scripts']) && !isVSCodeExtension) {
                    (info as any).bundler = 'webpack';
                }
            }
        } catch { /* ignore */ }

        // Only mark as web app if it's truly a web application, not a VS Code extension or build tool
        if (isVSCodeExtension || isBuildToolProject) {
            (info as any).isWebApp = false;
            (info as any).hasFrontend = false;
            (info as any).hasBackend = false;
            (info as any).canAutoStart = false;
            (info as any).isVSCodeExtension = isVSCodeExtension;
        } else {
            (info as any).isWebApp = frontendFrameworks.includes(fw)
                || fullstackFrameworks.includes(fw)
                || backendWebFrameworks.includes(fw);

            (info as any).hasFrontend = frontendFrameworks.includes(fw) || fullstackFrameworks.includes(fw);
            (info as any).hasBackend = backendWebFrameworks.includes(fw) || fullstackFrameworks.includes(fw);

            // Vite-based projects are web apps
            if ((info as any).bundler === 'vite') {
                if (!(info as any).isWebApp) { (info as any).isWebApp = true; }
                if (!(info as any).hasFrontend) { (info as any).hasFrontend = true; }
            }

            // Can only auto-start if we have a dev/run command that starts a server
            (info as any).canAutoStart = !!(info.devCommand || info.runCommand);
        }

        (info as any).platform = process.platform;

        console.log(`ProjectDetector: Platform traits - isWebApp=${(info as any).isWebApp}, hasFrontend=${(info as any).hasFrontend}, hasBackend=${(info as any).hasBackend}, canAutoStart=${(info as any).canAutoStart}, isVSCodeExt=${isVSCodeExtension}, bundler=${(info as any).bundler || 'none'}`);
    }

    private async detectFromConfigFiles(workspacePath: string, info: ProjectInfo): Promise<void> {
        // Priority-based detection: Higher priority (lower number) wins
        // Config files with priority - first match with lowest priority number wins
        const configChecks: Array<{
            file: string;
            type: ProjectType;
            language: string;
            packageManager?: ProjectInfo['packageManager'];
            priority: number;  // Lower = higher priority
        }> = [
            // HIGH PRIORITY: Primary project config files
            { file: 'package.json', type: 'nodejs', language: 'javascript', packageManager: 'npm', priority: 1 },
            { file: 'yarn.lock', type: 'nodejs', language: 'javascript', packageManager: 'yarn', priority: 1 },
            { file: 'pnpm-lock.yaml', type: 'nodejs', language: 'javascript', packageManager: 'pnpm', priority: 1 },
            { file: 'pyproject.toml', type: 'python', language: 'python', packageManager: 'pip', priority: 1 },
            { file: 'requirements.txt', type: 'python', language: 'python', packageManager: 'pip', priority: 2 },
            { file: 'setup.py', type: 'python', language: 'python', packageManager: 'pip', priority: 2 },
            { file: 'pom.xml', type: 'java', language: 'java', packageManager: 'maven', priority: 1 },
            { file: 'build.gradle', type: 'java', language: 'java', packageManager: 'gradle', priority: 1 },
            { file: 'build.gradle.kts', type: 'java', language: 'kotlin', packageManager: 'gradle', priority: 1 },
            { file: 'go.mod', type: 'go', language: 'go', packageManager: 'go', priority: 1 },
            { file: 'composer.json', type: 'php', language: 'php', packageManager: 'composer', priority: 1 },
            { file: 'Gemfile', type: 'ruby', language: 'ruby', priority: 1 },
            { file: 'Cargo.toml', type: 'rust', language: 'rust', packageManager: 'cargo' as any, priority: 1 },
            
            // MEDIUM PRIORITY: Build system files  
            { file: 'CMakeLists.txt', type: 'cpp', language: 'cpp', packageManager: 'cmake' as any, priority: 3 },
            { file: 'meson.build', type: 'cpp', language: 'cpp', packageManager: 'meson' as any, priority: 3 },
            
            // LOW PRIORITY: Makefile (common in many projects, not always C)
            { file: 'Makefile', type: 'c', language: 'c', packageManager: 'make' as any, priority: 5 },
            
            // LOWEST PRIORITY: File extension matching (fallback only)
            { file: '*.csproj', type: 'dotnet', language: 'csharp', priority: 4 },
            { file: '*.sln', type: 'dotnet', language: 'csharp', priority: 4 },
            { file: '*.c', type: 'c', language: 'c', priority: 10 },
            { file: '*.cpp', type: 'cpp', language: 'cpp', priority: 10 },
            { file: '*.rs', type: 'rust', language: 'rust', priority: 10 }
        ];

        let bestMatch: { type: ProjectType; language: string; packageManager?: any; priority: number } | null = null;

        for (const check of configChecks) {
            const filePath = path.join(workspacePath, check.file);
            let found = false;
            
            if (check.file.includes('*')) {
                // Handle glob patterns - only in root directory, not subdirs
                const files = await this.findFiles(workspacePath, check.file, false);
                if (files.length > 0) {
                    found = true;
                    info.configFiles.push(...files);
                }
            } else if (fs.existsSync(filePath)) {
                found = true;
                info.configFiles.push(filePath);
            }
            
            // Update best match if this has higher priority (lower number)
            if (found && (!bestMatch || check.priority < bestMatch.priority)) {
                bestMatch = {
                    type: check.type,
                    language: check.language,
                    packageManager: check.packageManager,
                    priority: check.priority
                };
            }
        }

        // Apply best match
        if (bestMatch) {
            info.type = bestMatch.type;
            info.language = bestMatch.language;
            if (bestMatch.packageManager) {
                info.packageManager = bestMatch.packageManager;
            }
            console.log(`ProjectDetector: Detected ${info.type} project (priority: ${bestMatch.priority})`);
        }

        // Check for TypeScript (upgrades language, not type)
        const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
            info.language = 'typescript';
            info.configFiles.push(tsconfigPath);
        }
    }

    private async detectFramework(workspacePath: string, info: ProjectInfo): Promise<void> {
        if (info.type === 'nodejs') {
            const packageJsonPath = path.join(workspacePath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    const deps = {
                        ...packageJson.dependencies || {},
                        ...packageJson.devDependencies || {}
                    };

                    // Frontend frameworks
                    if (deps['next']) {
                        info.framework = 'nextjs';
                    } else if (deps['nuxt'] || deps['nuxt3']) {
                        info.framework = 'nuxt';
                    } else if (deps['gatsby']) {
                        info.framework = 'gatsby';
                    } else if (deps['react']) {
                        info.framework = 'react';
                    } else if (deps['vue']) {
                        info.framework = 'vue';
                    } else if (deps['@angular/core']) {
                        info.framework = 'angular';
                    } else if (deps['svelte']) {
                        info.framework = 'svelte';
                    }

                    // Backend frameworks
                    if (deps['@nestjs/core']) {
                        info.framework = 'nestjs';
                    } else if (deps['express']) {
                        info.framework = info.framework || 'express';
                    } else if (deps['fastify']) {
                        info.framework = info.framework || 'fastify';
                    } else if (deps['koa']) {
                        info.framework = info.framework || 'koa';
                    } else if (deps['@hapi/hapi']) {
                        info.framework = info.framework || 'hapi';
                    }
                } catch (error) {
                    // Ignore parse errors
                }
            }
        } else if (info.type === 'python') {
            // Check for Python frameworks
            const requirementsPath = path.join(workspacePath, 'requirements.txt');
            const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
            
            let content = '';
            if (fs.existsSync(requirementsPath)) {
                content = fs.readFileSync(requirementsPath, 'utf-8').toLowerCase();
            } else if (fs.existsSync(pyprojectPath)) {
                content = fs.readFileSync(pyprojectPath, 'utf-8').toLowerCase();
            }

            if (content.includes('django')) {
                info.framework = 'django';
            } else if (content.includes('flask')) {
                info.framework = 'flask';
            } else if (content.includes('fastapi')) {
                info.framework = 'fastapi';
            }
        } else if (info.type === 'java') {
            const pomPath = path.join(workspacePath, 'pom.xml');
            const gradlePath = path.join(workspacePath, 'build.gradle');
            
            let content = '';
            if (fs.existsSync(pomPath)) {
                content = fs.readFileSync(pomPath, 'utf-8').toLowerCase();
            } else if (fs.existsSync(gradlePath)) {
                content = fs.readFileSync(gradlePath, 'utf-8').toLowerCase();
            }

            if (content.includes('spring-boot')) {
                info.framework = 'springboot';
            } else if (content.includes('spring')) {
                info.framework = 'spring';
            }
        } else if (info.type === 'go') {
            // Check for Go frameworks
            const goModPath = path.join(workspacePath, 'go.mod');
            if (fs.existsSync(goModPath)) {
                const content = fs.readFileSync(goModPath, 'utf-8').toLowerCase();
                if (content.includes('gin-gonic')) {
                    info.framework = 'gin';
                } else if (content.includes('echo')) {
                    info.framework = 'echo';
                } else if (content.includes('fiber')) {
                    info.framework = 'fiber';
                }
            }
        } else if (info.type === 'php') {
            const composerPath = path.join(workspacePath, 'composer.json');
            if (fs.existsSync(composerPath)) {
                try {
                    const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
                    const deps = composer.require || {};
                    
                    if (deps['laravel/framework']) {
                        info.framework = 'laravel';
                    } else if (deps['symfony/framework-bundle']) {
                        info.framework = 'symfony';
                    }
                } catch (error) {
                    // Ignore parse errors
                }
            }
        } else if (info.type === 'ruby') {
            const gemfilePath = path.join(workspacePath, 'Gemfile');
            if (fs.existsSync(gemfilePath)) {
                const content = fs.readFileSync(gemfilePath, 'utf-8').toLowerCase();
                if (content.includes('rails')) {
                    info.framework = 'rails';
                } else if (content.includes('sinatra')) {
                    info.framework = 'sinatra';
                }
            }
        } else if (info.type === 'dotnet') {
            info.framework = 'aspnet';
        }
    }

    private async detectCommands(workspacePath: string, info: ProjectInfo): Promise<void> {
        if (info.type === 'nodejs') {
            const packageJsonPath = path.join(workspacePath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    const scripts = packageJson.scripts || {};

                    // Check if this is a VS Code extension (should not auto-start)
                    const isVSCodeExt = !!packageJson.engines?.vscode;

                    // Helper: check if a script runs a web server (not just a build tool)
                    const isServerScript = (script: string): boolean => {
                        if (!script) return false;
                        // Build/watch tools are NOT servers
                        const buildPatterns = /^(node\s+)?esbuild|webpack\b|tsc\b|rollup\b|gulp\b|babel\b/i;
                        if (buildPatterns.test(script) && !script.includes('serve') && !script.includes('dev-server')) {
                            return false;
                        }
                        // npm run watch / npm run compile are NOT servers
                        if (/npm run (watch|compile|build)/i.test(script)) return false;
                        return true;
                    };

                    // Detect dev command - only if it actually starts a server
                    if (scripts.dev && isServerScript(scripts.dev) && !isVSCodeExt) {
                        info.devCommand = `${info.packageManager} run dev`;
                    } else if (scripts.start && isServerScript(scripts.start) && !isVSCodeExt) {
                        info.devCommand = `${info.packageManager} run start`;
                    } else if (scripts.serve && !isVSCodeExt) {
                        info.devCommand = `${info.packageManager} run serve`;
                    }

                    // Detect run command
                    if (scripts.start && isServerScript(scripts.start) && !isVSCodeExt) {
                        info.runCommand = `${info.packageManager} run start`;
                    }

                    // Detect build command
                    if (scripts.build) {
                        info.buildCommand = `${info.packageManager} run build`;
                    }

                    // Detect test command
                    if (scripts.test) {
                        info.testCommand = `${info.packageManager} run test`;
                    }

                    // Find entry point
                    info.entryPoint = packageJson.main || 'index.js';
                } catch (error) {
                    // Ignore parse errors
                }
            }
        } else if (info.type === 'python') {
            if (info.framework === 'django') {
                info.devCommand = 'python manage.py runserver';
                info.runCommand = 'python manage.py runserver';
            } else if (info.framework === 'flask') {
                info.devCommand = 'flask run';
                info.runCommand = 'flask run';
            } else if (info.framework === 'fastapi') {
                info.devCommand = 'uvicorn main:app --reload';
                info.runCommand = 'uvicorn main:app';
            }
        } else if (info.type === 'java') {
            if (info.packageManager === 'maven') {
                info.devCommand = 'mvn spring-boot:run';
                info.buildCommand = 'mvn package';
            } else if (info.packageManager === 'gradle') {
                info.devCommand = './gradlew bootRun';
                info.buildCommand = './gradlew build';
            }
        } else if (info.type === 'go') {
            info.devCommand = 'go run .';
            info.buildCommand = 'go build';
        } else if (info.type === 'dotnet') {
            info.devCommand = 'dotnet run';
            info.buildCommand = 'dotnet build';
            info.testCommand = 'dotnet test';
        } else if (info.type === 'rust') {
            info.devCommand = 'cargo run';
            info.buildCommand = 'cargo build';
            info.testCommand = 'cargo test';
        } else if (info.type === 'c' || info.type === 'cpp') {
            // Check for CMake
            const cmakePath = path.join(workspacePath, 'CMakeLists.txt');
            if (fs.existsSync(cmakePath)) {
                info.buildCommand = 'cmake --build build';
                info.testCommand = 'ctest --test-dir build';
            } else {
                info.buildCommand = 'make';
                info.testCommand = 'make test';
            }
        }
    }

    private async detectPort(workspacePath: string, info: ProjectInfo): Promise<void> {
        // Default ports based on framework
        const defaultPorts: Record<string, number> = {
            'react': 3000,
            'vue': 8080,
            'angular': 4200,
            'nextjs': 3000,
            'nuxt': 3000,
            'gatsby': 8000,
            'express': 3000,
            'fastify': 3000,
            'koa': 3000,
            'nestjs': 3000,
            'django': 8000,
            'flask': 5000,
            'fastapi': 8000,
            'spring': 8080,
            'springboot': 8080,
            'rails': 3000,
            'laravel': 8000,
            'gin': 8080,
            'aspnet': 5000
        };

        if (info.framework && defaultPorts[info.framework]) {
            info.port = defaultPorts[info.framework];
        } else {
            info.port = 3000; // Default fallback
        }

        // Try to detect from config files
        if (info.type === 'nodejs') {
            const packageJsonPath = path.join(workspacePath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const content = fs.readFileSync(packageJsonPath, 'utf-8');
                    // Look for PORT in scripts
                    const portMatch = content.match(/PORT[=:]\s*(\d+)/);
                    if (portMatch) {
                        info.port = parseInt(portMatch[1], 10);
                    }
                } catch (error) {
                    // Ignore
                }
            }

            // Check .env file
            const envPath = path.join(workspacePath, '.env');
            if (fs.existsSync(envPath)) {
                try {
                    const content = fs.readFileSync(envPath, 'utf-8');
                    const portMatch = content.match(/PORT\s*=\s*(\d+)/);
                    if (portMatch) {
                        info.port = parseInt(portMatch[1], 10);
                    }
                } catch (error) {
                    // Ignore
                }
            }
        }
    }

    private async findFiles(dir: string, pattern: string, _recursive: boolean = false): Promise<string[]> {
        const files: string[] = [];
        const regex = new RegExp(pattern.replace('*', '.*'));
        
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                if (regex.test(entry)) {
                    files.push(path.join(dir, entry));
                }
            }
        } catch (error) {
            // Ignore errors
        }
        
        return files;
    }
}

