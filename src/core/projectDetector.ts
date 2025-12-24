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

        return projectInfo;
    }

    private async detectFromConfigFiles(workspacePath: string, info: ProjectInfo): Promise<void> {
        const configChecks: Array<{
            file: string;
            type: ProjectType;
            language: string;
            packageManager?: ProjectInfo['packageManager'];
        }> = [
            { file: 'package.json', type: 'nodejs', language: 'javascript', packageManager: 'npm' },
            { file: 'yarn.lock', type: 'nodejs', language: 'javascript', packageManager: 'yarn' },
            { file: 'pnpm-lock.yaml', type: 'nodejs', language: 'javascript', packageManager: 'pnpm' },
            { file: 'requirements.txt', type: 'python', language: 'python', packageManager: 'pip' },
            { file: 'pyproject.toml', type: 'python', language: 'python', packageManager: 'pip' },
            { file: 'setup.py', type: 'python', language: 'python', packageManager: 'pip' },
            { file: 'pom.xml', type: 'java', language: 'java', packageManager: 'maven' },
            { file: 'build.gradle', type: 'java', language: 'java', packageManager: 'gradle' },
            { file: 'build.gradle.kts', type: 'java', language: 'kotlin', packageManager: 'gradle' },
            { file: 'go.mod', type: 'go', language: 'go', packageManager: 'go' },
            { file: 'composer.json', type: 'php', language: 'php', packageManager: 'composer' },
            { file: 'Gemfile', type: 'ruby', language: 'ruby' },
            { file: '*.csproj', type: 'dotnet', language: 'csharp' },
            { file: '*.sln', type: 'dotnet', language: 'csharp' }
        ];

        for (const check of configChecks) {
            const filePath = path.join(workspacePath, check.file);
            if (check.file.includes('*')) {
                // Handle glob patterns
                const files = await this.findFiles(workspacePath, check.file);
                if (files.length > 0) {
                    info.type = check.type;
                    info.language = check.language;
                    if (check.packageManager) {
                        info.packageManager = check.packageManager;
                    }
                    info.configFiles.push(...files);
                }
            } else if (fs.existsSync(filePath)) {
                info.type = check.type;
                info.language = check.language;
                if (check.packageManager) {
                    info.packageManager = check.packageManager;
                }
                info.configFiles.push(filePath);
            }
        }

        // Check for TypeScript
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

                    // Detect dev command
                    if (scripts.dev) {
                        info.devCommand = `${info.packageManager} run dev`;
                    } else if (scripts.start) {
                        info.devCommand = `${info.packageManager} run start`;
                    } else if (scripts.serve) {
                        info.devCommand = `${info.packageManager} run serve`;
                    }

                    // Detect run command
                    if (scripts.start) {
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

    private async findFiles(dir: string, pattern: string): Promise<string[]> {
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

