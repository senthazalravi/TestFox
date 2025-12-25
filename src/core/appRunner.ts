import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as net from 'net';
import { ProjectInfo } from '../types';

/**
 * Manages running the application under test
 */
export class AppRunner {
    private process: cp.ChildProcess | null = null;
    private outputChannel: vscode.OutputChannel;
    private isRunning = false;
    private baseUrl = '';

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TestFox App Runner');
    }

    /**
     * Detect if application is already running on common development ports
     */
    private async detectRunningApplication(projectInfo: ProjectInfo): Promise<string | null> {
        // Common development ports to check
        const portsToCheck = [
            projectInfo.port || 3000, // Configured port first
            3000, 3001, 3002, // React/Next.js
            8080, 8081, 8082, // Vue/Java/Spring
            4200, 4201,       // Angular
            5000, 5001,       // Flask/Django/ASPNET
            8000, 8001,       // Various frameworks
            4000, 4001,       // Gatsby
            5173, 5174        // Vite
        ];

        // Remove duplicates and prioritize configured port
        const uniquePorts = [...new Set(portsToCheck)];

        for (const port of uniquePorts) {
            try {
                const isOpen = await this.checkPort(port);
                if (isOpen) {
                    const url = `http://localhost:${port}`;
                    // Verify it's actually responding
                    if (await this.verifyUrl(url)) {
                        return url;
                    }
                }
            } catch (error) {
                // Port check failed, continue
                continue;
            }
        }

        return null;
    }

    /**
     * Check if a port is open
     */
    private checkPort(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(1000);

            socket.connect(port, 'localhost', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    /**
     * Verify that a URL is responding
     */
    private async verifyUrl(url: string): Promise<boolean> {
        try {
            const axios = require('axios').default;
            const response = await axios.get(url, {
                timeout: 2000,
                validateStatus: () => true // Accept any status code
            });
            return response.status < 500; // Consider it running if not server error
        } catch (error) {
            return false;
        }
    }

    async start(projectInfo: ProjectInfo): Promise<string> {
        if (this.isRunning) {
            return this.baseUrl;
        }

        // First, check if application is already running on any port
        const detectedUrl = await this.detectRunningApplication(projectInfo);
        if (detectedUrl) {
            this.isRunning = true;
            this.baseUrl = detectedUrl;
            this.outputChannel.appendLine(`✓ Found running application at ${this.baseUrl}`);
            return this.baseUrl;
        }

        const workspacePath = projectInfo.rootPath;
        const command = projectInfo.devCommand || projectInfo.runCommand;

        if (!command) {
            throw new Error('No run command found for this project');
        }

        return new Promise((resolve, reject) => {
            this.outputChannel.appendLine(`Starting application: ${command}`);
            this.outputChannel.show(true);

            // Determine shell based on platform
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const shellFlag = isWindows ? '/c' : '-c';

            // Install dependencies first if needed
            this.ensureDependencies(projectInfo).then(() => {
                this.process = cp.spawn(shell, [shellFlag, command], {
                    cwd: workspacePath,
                    env: {
                        ...process.env,
                        NODE_ENV: 'development',
                        PORT: String(projectInfo.port || 3000)
                    },
                    detached: !isWindows
                });

                this.isRunning = true;
                this.baseUrl = `http://localhost:${projectInfo.port || 3000}`;

                let startupDetected = false;
                const startupTimeout = setTimeout(async () => {
                    if (!startupDetected) {
                        // Try to detect the actual running port
                        const detectedUrl = await this.detectRunningApplication(projectInfo);
                        if (detectedUrl && detectedUrl !== this.baseUrl) {
                            this.baseUrl = detectedUrl;
                            this.outputChannel.appendLine(`✓ Detected application running at ${this.baseUrl}`);
                        } else {
                            this.outputChannel.appendLine(`Application assumed running at ${this.baseUrl}`);
                        }
                        resolve(this.baseUrl);
                    }
                }, 15000);

                this.process.stdout?.on('data', (data: Buffer) => {
                    const output = data.toString();
                    this.outputChannel.append(output);

                    // Try to extract actual port from output
                    const portMatch = output.match(/localhost:(\d+)/) || output.match(/127\.0\.0\.1:(\d+)/) || output.match(/0\.0\.0\.0:(\d+)/);
                    if (portMatch && !startupDetected) {
                        const detectedPort = parseInt(portMatch[1], 10);
                        const detectedUrl = `http://localhost:${detectedPort}`;
                        if (detectedUrl !== this.baseUrl) {
                            this.baseUrl = detectedUrl;
                            this.outputChannel.appendLine(`✓ Detected port ${detectedPort} from application output`);
                        }
                    }

                    // Detect when app is ready
                    if (!startupDetected && this.isStartupMessage(output, projectInfo)) {
                        startupDetected = true;
                        clearTimeout(startupTimeout);
                        this.outputChannel.appendLine(`\n✓ Application started at ${this.baseUrl}`);
                        resolve(this.baseUrl);
                    }
                });

                this.process.stderr?.on('data', (data: Buffer) => {
                    const output = data.toString();
                    this.outputChannel.append(output);

                    // Some frameworks output to stderr
                    if (!startupDetected && this.isStartupMessage(output, projectInfo)) {
                        startupDetected = true;
                        clearTimeout(startupTimeout);
                        resolve(this.baseUrl);
                    }
                });

                this.process.on('error', (err) => {
                    this.isRunning = false;
                    clearTimeout(startupTimeout);
                    this.outputChannel.appendLine(`Error: ${err.message}`);
                    reject(err);
                });

                this.process.on('close', (code) => {
                    this.isRunning = false;
                    clearTimeout(startupTimeout);
                    this.outputChannel.appendLine(`Application exited with code ${code}`);
                    if (!startupDetected) {
                        reject(new Error(`Application exited with code ${code}`));
                    }
                });
            }).catch(reject);
        });
    }

    private async ensureDependencies(projectInfo: ProjectInfo): Promise<void> {
        const workspacePath = projectInfo.rootPath;
        
        // Check if node_modules exists for Node.js projects
        if (projectInfo.type === 'nodejs') {
            const nodeModulesPath = path.join(workspacePath, 'node_modules');
            const fs = await import('fs');
            
            if (!fs.existsSync(nodeModulesPath)) {
                this.outputChannel.appendLine('Installing dependencies...');
                
                const installCommand = projectInfo.packageManager === 'yarn' ? 'yarn install' :
                                       projectInfo.packageManager === 'pnpm' ? 'pnpm install' :
                                       'npm install';
                
                await this.runCommand(installCommand, workspacePath);
            }
        }
    }

    private runCommand(command: string, cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const shellFlag = isWindows ? '/c' : '-c';

            const proc = cp.spawn(shell, [shellFlag, command], { cwd });
            
            proc.stdout?.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            proc.stderr?.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with code ${code}`));
                }
            });

            proc.on('error', reject);
        });
    }

    private isStartupMessage(output: string, projectInfo: ProjectInfo): boolean {
        const startupPatterns = [
            // General
            /listening on|server running|started at|ready on|available at/i,
            /http:\/\/localhost:\d+/i,
            /Local:\s*http/i,
            
            // Next.js
            /ready.*started server/i,
            /▲ Next\.js/i,
            
            // Vite/Vue
            /VITE.*ready/i,
            /Local:.*http/i,
            
            // React (CRA)
            /Compiled successfully/i,
            /You can now view/i,
            
            // Express
            /Express.*listening/i,
            
            // Django
            /Starting development server/i,
            
            // Flask
            /Running on http/i,
            
            // Spring Boot
            /Started.*Application/i,
            /Tomcat started on port/i,
            
            // .NET
            /Now listening on/i,
            
            // Go
            /Listening and serving/i
        ];

        return startupPatterns.some(pattern => pattern.test(output));
    }

    async stop(): Promise<void> {
        if (!this.process || !this.isRunning) {
            return;
        }

        return new Promise((resolve) => {
            this.outputChannel.appendLine('Stopping application...');

            const isWindows = process.platform === 'win32';
            
            if (isWindows) {
                // On Windows, use taskkill
                cp.exec(`taskkill /pid ${this.process!.pid} /T /F`, () => {
                    this.isRunning = false;
                    this.process = null;
                    this.outputChannel.appendLine('Application stopped');
                    resolve();
                });
            } else {
                // On Unix, kill the process group
                try {
                    process.kill(-this.process!.pid!, 'SIGTERM');
                } catch (e) {
                    // Process might already be dead
                }

                setTimeout(() => {
                    try {
                        if (this.process && this.process.pid) {
                            process.kill(-this.process.pid, 'SIGKILL');
                        }
                    } catch (e) {
                        // Ignore
                    }
                    this.isRunning = false;
                    this.process = null;
                    this.outputChannel.appendLine('Application stopped');
                    resolve();
                }, 2000);
            }
        });
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    isAppRunning(): boolean {
        return this.isRunning;
    }

    async waitForReady(timeout = 30000): Promise<boolean> {
        if (!this.baseUrl) {
            return false;
        }

        const axios = await import('axios');
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                await axios.default.get(this.baseUrl, { timeout: 2000 });
                return true;
            } catch (error) {
                // Wait and retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return false;
    }

    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}

