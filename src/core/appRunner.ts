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
        console.log(`AppRunner: Detecting running app, configured port: ${projectInfo.port}`);

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
        console.log(`AppRunner: Checking ports: ${uniquePorts.join(', ')}`);

        for (const port of uniquePorts) {
            try {
                console.log(`AppRunner: Checking port ${port}...`);
                const isOpen = await this.checkPort(port);
                console.log(`AppRunner: Port ${port} is ${isOpen ? 'open' : 'closed'}`);
                if (isOpen) {
                    const url = `http://localhost:${port}`;
                    console.log(`AppRunner: Verifying URL ${url}...`);
                    // Verify it's actually responding
                    if (await this.verifyUrl(url)) {
                        console.log(`AppRunner: Found responding app at ${url}`);
                        return url;
                    } else {
                        console.log(`AppRunner: Port ${port} is open but not responding to HTTP`);
                    }
                }
            } catch (error) {
                console.log(`AppRunner: Error checking port ${port}:`, error);
                continue;
            }
        }

        console.log('AppRunner: No running application found');
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
            console.log(`AppRunner: Making HTTP request to ${url}`);
            const axios = require('axios').default;
            const response = await axios.get(url, {
                timeout: 2000,
                validateStatus: () => true // Accept any status code
            });
            console.log(`AppRunner: HTTP response from ${url}: ${response.status}`);
            return response.status < 500; // Consider it running if not server error
        } catch (error: any) {
            console.log(`AppRunner: HTTP request to ${url} failed:`, error.message);
            return false;
        }
    }

    async start(projectInfo: ProjectInfo): Promise<string> {
        console.log('AppRunner: Starting application...');
        if (this.isRunning) {
            console.log(`AppRunner: Already running at ${this.baseUrl}`);
            return this.baseUrl;
        }

        const workspacePath = projectInfo.rootPath;
        const command = projectInfo.devCommand || projectInfo.runCommand;
        const configuredPort = projectInfo.port || 3000;

        if (!command) {
            throw new Error('No run command found for this project. Please configure testfox.app.runCommand or testfox.app.devCommand');
        }

        return new Promise((resolve, reject) => {
            this.outputChannel.appendLine(`Starting application: ${command}`);
            this.outputChannel.appendLine(`Configured port: ${configuredPort}`);
            this.outputChannel.show(true);

            // Determine shell based on platform
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const shellFlag = isWindows ? '/c' : '-c';

            // Install dependencies first if needed
            this.ensureDependencies(projectInfo).then(async () => {
                // Set the PORT environment variable explicitly
                const env = {
                    ...process.env,
                    NODE_ENV: 'development',
                    PORT: String(configuredPort)
                };
                
                this.outputChannel.appendLine(`Spawning process with PORT=${configuredPort}...`);
                
                this.process = cp.spawn(shell, [shellFlag, command], {
                    cwd: workspacePath,
                    env: env,
                    detached: !isWindows
                });

                this.isRunning = true;
                
                // Start with the configured port as default
                this.baseUrl = `http://localhost:${configuredPort}`;
                
                let startupDetected = false;
                let detectedPortFromOutput: number | null = null;
                
                // Increase startup timeout to 30 seconds for slower apps
                const startupTimeout = setTimeout(async () => {
                    if (!startupDetected) {
                        this.outputChannel.appendLine(`⚠️ Startup timeout reached. Checking if app is running on port ${configuredPort}...`);
                        
                        // Check if the configured port is now responding
                        const checkUrl = `http://localhost:${configuredPort}`;
                        if (await this.verifyUrl(checkUrl)) {
                            this.baseUrl = checkUrl;
                            startupDetected = true;
                            this.outputChannel.appendLine(`✓ Application confirmed running at ${this.baseUrl}`);
                            resolve(this.baseUrl);
                        } else {
                            // Try to find on any port as fallback
                            const detectedUrl = await this.detectRunningApplication(projectInfo);
                            if (detectedUrl) {
                                this.baseUrl = detectedUrl;
                                startupDetected = true;
                                this.outputChannel.appendLine(`✓ Found application running at ${this.baseUrl} (fallback detection)`);
                                resolve(this.baseUrl);
                            } else {
                                reject(new Error(`Application failed to start on port ${configuredPort} within timeout`));
                            }
                        }
                    }
                }, 30000);

                this.process.stdout?.on('data', (data: Buffer) => {
                    const output = data.toString();
                    this.outputChannel.append(output);

                    // Enhanced port detection from terminal output
                    // Look for patterns like "Local: http://localhost:3000" or "listening on port 3000"
                    const portPatterns = [
                        { regex: /Local:\s+http:\/\/localhost:(\d+)/i, name: 'Vite/Local pattern' },  // Vite format: "Local: http://localhost:5173/"
                        { regex: /➜\s+Local:\s+http:\/\/localhost:(\d+)/i, name: 'Vite arrow pattern' },  // Vite with arrow
                        { regex: /localhost:(\d+)/i, name: 'localhost pattern' },
                        { regex: /127\.0\.0\.1:(\d+)/i, name: '127.0.0.1 pattern' },
                        { regex: /0\.0\.0\.0:(\d+)/i, name: '0.0.0.0 pattern' },
                        { regex: /:\/(\d+)/, name: 'colon-slash pattern' },  // Port after colon
                        { regex: /port\s+(\d+)/i, name: 'port N pattern' },  // "port 3000"
                        { regex: /on\s+(\d+)/i, name: 'on N pattern' },  // "on 3000"
                        { regex: /\*\s+(\d+)/i, name: 'star N pattern' },  // "* 3000" format
                        { regex: /Ready\s+on\s+http:\/\/localhost:(\d+)/i, name: 'Next.js pattern' },  // Next.js "Ready on http://localhost:3000"
                        { regex: /server\s+ready\s+at\s+http:\/\/localhost:(\d+)/i, name: 'server ready pattern' },
                        { regex: /running\s+on\s+.*:(\d+)/i, name: 'running on pattern' }
                    ];
                    
                    for (const pattern of portPatterns) {
                        const portMatch = output.match(pattern.regex);
                        if (portMatch && !startupDetected) {
                            const detectedPort = parseInt(portMatch[1], 10);
                            if (detectedPort > 0 && detectedPort < 65536) {
                                detectedPortFromOutput = detectedPort;
                                const detectedUrl = `http://localhost:${detectedPort}`;
                                if (detectedUrl !== this.baseUrl) {
                                    this.baseUrl = detectedUrl;
                                    this.outputChannel.appendLine(`✓ Detected port ${detectedPort} from terminal output (${pattern.name})`);
                                }
                                
                                // If this matches our configured port, resolve immediately
                                if (detectedPort === configuredPort) {
                                    startupDetected = true;
                                    clearTimeout(startupTimeout);
                                    this.outputChannel.appendLine(`\n✓ Application started successfully at ${this.baseUrl}`);
                                    resolve(this.baseUrl);
                                }
                                break;
                            }
                        }
                    }

                    // Detect when app is ready via startup messages
                    if (!startupDetected && this.isStartupMessage(output, projectInfo)) {
                        // Verify the URL is actually responding before resolving
                        this.verifyUrl(this.baseUrl).then(isResponding => {
                            if (isResponding && !startupDetected) {
                                startupDetected = true;
                                clearTimeout(startupTimeout);
                                this.outputChannel.appendLine(`\n✓ Application started at ${this.baseUrl} (verified responding)`);
                                resolve(this.baseUrl);
                            }
                        });
                    }
                });

                this.process.stderr?.on('data', (data: Buffer) => {
                    const output = data.toString();
                    this.outputChannel.append(output);

                    // Check stderr for port info too (some frameworks output there)
                    const portPatterns = [
                        { regex: /Local:\s+http:\/\/localhost:(\d+)/i, name: 'Vite/Local (stderr)' },
                        { regex: /➜\s+Local:\s+http:\/\/localhost:(\d+)/i, name: 'Vite arrow (stderr)' },
                        { regex: /localhost:(\d+)/i, name: 'localhost (stderr)' },
                        { regex: /port\s+(\d+)/i, name: 'port N (stderr)' },
                        { regex: /Ready\s+on\s+http:\/\/localhost:(\d+)/i, name: 'Next.js (stderr)' },
                        { regex: /running\s+on\s+.*:(\d+)/i, name: 'running on (stderr)' }
                    ];
                    
                    for (const pattern of portPatterns) {
                        const portMatch = output.match(pattern.regex);
                        if (portMatch && !startupDetected) {
                            const detectedPort = parseInt(portMatch[1], 10);
                            if (detectedPort > 0 && detectedPort < 65536) {
                                detectedPortFromOutput = detectedPort;
                                const detectedUrl = `http://localhost:${detectedPort}`;
                                if (detectedUrl !== this.baseUrl) {
                                    this.baseUrl = detectedUrl;
                                    this.outputChannel.appendLine(`✓ Detected port ${detectedPort} from stderr (${pattern.name})`);
                                }
                                
                                // If this matches our configured port, resolve immediately
                                if (detectedPort === configuredPort) {
                                    startupDetected = true;
                                    clearTimeout(startupTimeout);
                                    this.outputChannel.appendLine(`\n✓ Application started successfully at ${this.baseUrl}`);
                                    resolve(this.baseUrl);
                                }
                                break;
                            }
                        }
                    }

                    // Some frameworks output to stderr
                    if (!startupDetected && this.isStartupMessage(output, projectInfo)) {
                        this.verifyUrl(this.baseUrl).then(isResponding => {
                            if (isResponding && !startupDetected) {
                                startupDetected = true;
                                clearTimeout(startupTimeout);
                                this.outputChannel.appendLine(`\n✓ Application started at ${this.baseUrl} (stderr detection, verified)`);
                                resolve(this.baseUrl);
                            }
                        });
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

    showOutputChannel(): void {
        this.outputChannel.show();
    }

    async waitForReady(timeout = 30000): Promise<string | null> {
        if (!this.baseUrl) {
            return null;
        }

        const axios = require('axios').default;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                await axios.get(this.baseUrl, { 
                    timeout: 2000,
                    validateStatus: () => true
                });
                this.outputChannel.appendLine(`✓ Application at ${this.baseUrl} is ready.`);
                return this.baseUrl;
            } catch (error: any) {
                // Handle aborted requests gracefully
                if (error.code === 'ECONNABORTED' || error.message?.includes('aborted') || error.message?.includes('cancelled')) {
                    this.outputChannel.appendLine(`⚠️ Health check request was cancelled, but app may still be starting...`);
                }
                // Wait and retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return null;
    }

    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}

