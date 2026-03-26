/**
 * Port Checker - Application Detection and Port Management
 * 
 * Checks for applications on default ports and starts them if needed
 * Handles graceful waiting for user input if applications are not ready
 */

import * as vscode from 'vscode';
import * as net from 'net';
import { AppRunner } from './appRunner';

export interface PortInfo {
    port: number;
    service: string;
    description: string;
    defaultUrl: string;
    isRunning: boolean;
    startupCommand?: string;
}

export interface ApplicationStatus {
    name: string;
    port: number;
    isRunning: boolean;
    url: string;
    readyForTesting: boolean;
}

export class PortChecker {
    private appRunner: AppRunner;
    private outputChannel: vscode.OutputChannel;
    private checkedPorts: Set<number> = new Set();
    private checkInterval?: NodeJS.Timeout;

    constructor(appRunner: AppRunner, outputChannel: vscode.OutputChannel) {
        this.appRunner = appRunner;
        this.outputChannel = outputChannel;
    }

    /**
     * Default application ports to check
     */
    private getDefaultPorts(): PortInfo[] {
        return [
            {
                port: 3000,
                service: 'React/Next.js',
                description: 'React development server',
                defaultUrl: 'http://localhost:3000',
                isRunning: false,
                startupCommand: 'npm start'
            },
            {
                port: 3001,
                service: 'Vue.js',
                description: 'Vue development server',
                defaultUrl: 'http://localhost:3001',
                isRunning: false,
                startupCommand: 'npm run serve'
            },
            {
                port: 4200,
                service: 'Angular',
                description: 'Angular development server',
                defaultUrl: 'http://localhost:4200',
                isRunning: false,
                startupCommand: 'ng serve'
            },
            {
                port: 8000,
                service: 'Django',
                description: 'Django development server',
                defaultUrl: 'http://localhost:8000',
                isRunning: false,
                startupCommand: 'python manage.py runserver'
            },
            {
                port: 5000,
                service: 'Flask',
                description: 'Flask development server',
                defaultUrl: 'http://localhost:5000',
                isRunning: false,
                startupCommand: 'flask run'
            },
            {
                port: 8080,
                service: 'Spring Boot',
                description: 'Spring Boot application',
                defaultUrl: 'http://localhost:8080',
                isRunning: false,
                startupCommand: 'mvn spring-boot:run'
            },
            {
                port: 9000,
                service: 'Express.js',
                description: 'Express.js server',
                defaultUrl: 'http://localhost:9000',
                isRunning: false,
                startupCommand: 'npm start'
            },
            {
                port: 5173,
                service: 'Vite',
                description: 'Vite development server',
                defaultUrl: 'http://localhost:5173',
                isRunning: false,
                startupCommand: 'npm run dev'
            }
        ];
    }

    /**
     * Check if a port is available
     */
    private async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.listen(port, () => {
                server.once('close', () => {
                    resolve(true);
                });
                server.close();
            });
            
            server.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Check if a service is running on a port
     */
    private async isServiceRunning(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            
            socket.setTimeout(1000);
            
            socket.connect(port, 'localhost', () => {
                socket.destroy();
                resolve(true);
            });
            
            socket.on('error', () => {
                resolve(false);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    /**
     * Check all default ports for running applications
     */
    async checkApplicationPorts(): Promise<ApplicationStatus[]> {
        const ports = this.getDefaultPorts();
        const statuses: ApplicationStatus[] = [];

        try {
            this.outputChannel?.appendLine('🔍 Checking application ports...');
        } catch (e) {
            console.log('PortChecker: outputChannel not available');
        }

        for (const portInfo of ports) {
            try {
                const isRunning = await this.isServiceRunning(portInfo.port);
                
                const status: ApplicationStatus = {
                    name: portInfo.service,
                    port: portInfo.port,
                    isRunning,
                    url: portInfo.defaultUrl,
                    readyForTesting: isRunning
                };

                statuses.push(status);

                if (isRunning) {
                    this.outputChannel?.appendLine(`✅ ${portInfo.service} running on port ${portInfo.port}`);
                } else {
                    this.outputChannel?.appendLine(`❌ ${portInfo.service} not running on port ${portInfo.port}`);
                }

                this.checkedPorts.add(portInfo.port);
            } catch (err) {
                console.error(`PortChecker: Error checking port ${portInfo.port}:`, err);
            }
        }

        return statuses;
    }

    /**
     * Start an application if it's not running
     */
    async startApplication(portInfo: PortInfo): Promise<boolean> {
        if (await this.isServiceRunning(portInfo.port)) {
            this.outputChannel?.appendLine(`✅ ${portInfo.service} is already running on port ${portInfo.port}`);
            return true;
        }

        this.outputChannel?.appendLine(`🚀 Starting ${portInfo.service}...`);

        try {
            // Try to start the application using AppRunner
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const rootPath = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';
            
            const projectInfo = {
                type: 'unknown' as any,
                framework: 'unknown' as any,
                language: 'javascript',
                rootPath: rootPath,
                packageManager: 'npm' as any,
                runCommand: portInfo.startupCommand || 'npm start',
                port: portInfo.port,
                configFiles: []
            };
            await this.appRunner.start(projectInfo);
            
            // Wait a bit for the application to start
            await this.waitForPort(portInfo.port, 30000); // 30 seconds timeout
            
            const isRunning = await this.isServiceRunning(portInfo.port);
            
            if (isRunning) {
                this.outputChannel?.appendLine(`✅ ${portInfo.service} started successfully on port ${portInfo.port}`);
                vscode.window.showInformationMessage(
                    `${portInfo.service} started successfully!`,
                    'Open Application'
                ).then(selection => {
                    if (selection === 'Open Application') {
                        vscode.env.openExternal(vscode.Uri.parse(portInfo.defaultUrl));
                    }
                });
                return true;
            } else {
                this.outputChannel?.appendLine(`❌ Failed to start ${portInfo.service} on port ${portInfo.port}`);
                return false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel?.appendLine(`❌ Error starting ${portInfo.service}: ${errorMessage}`);
            vscode.window.showErrorMessage(
                `Failed to start ${portInfo.service}: ${errorMessage}`,
                'View Diagnostics'
            ).then(selection => {
                if (selection === 'View Diagnostics') {
                    this.outputChannel.show(true);
                }
            });
            return false;
        }
    }

    /**
     * Wait for a port to become available
     */
    private async waitForPort(port: number, timeout: number): Promise<void> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (await this.isServiceRunning(port)) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error(`Port ${port} did not become available within ${timeout}ms`);
    }

    /**
     * Prompt user to start applications that are not running
     */
    async promptToStartApplications(): Promise<void> {
        const statuses = await this.checkApplicationPorts();
        const notRunning = statuses.filter(status => !status.isRunning);

        if (notRunning.length === 0) {
            this.outputChannel?.appendLine('✅ All detected applications are running');
            return;
        }

        const options = notRunning.map(status => ({
            label: `Start ${status.name} (port ${status.port})`,
            description: `Start ${status.name} development server`,
            status: status
        }));

        options.push({
            label: 'Skip for now',
            description: 'Continue without starting applications',
            status: null as any
        });

        const choice = await vscode.window.showQuickPick(options, {
            placeHolder: 'Some applications are not running. What would you like to do?',
            title: 'TestFox - Application Status'
        });

        if (choice && choice.status) {
            const portInfo = this.getDefaultPorts().find(p => p.port === choice.status!.port);
            if (portInfo) {
                await this.startApplication(portInfo);
            }
        } else if (choice && choice.status === null) {
            this.outputChannel?.appendLine('ℹ️ User chose to skip application startup');
            vscode.window.showInformationMessage(
                'You can start applications later using the TestFox commands.',
                'View Commands'
            ).then(selection => {
                if (selection === 'View Commands') {
                    vscode.commands.executeCommand('workbench.action.showCommands');
                }
            });
        }
    }

    /**
     * Check if any applications are ready for testing
     */
    async getApplicationsReadyForTesting(): Promise<ApplicationStatus[]> {
        const statuses = await this.checkApplicationPorts();
        return statuses.filter(status => status.isRunning);
    }

    /**
     * Get the best application URL for testing
     */
    async getBestApplicationUrl(): Promise<string | null> {
        const runningApps = await this.getApplicationsReadyForTesting();
        
        if (runningApps.length === 0) {
            return null;
        }

        // Prioritize common development servers
        const priorityOrder = [3000, 5173, 4200, 8000, 5000, 8080, 9000, 3001];
        
        for (const port of priorityOrder) {
            const app = runningApps.find(a => a.port === port);
            if (app) {
                return app.url;
            }
        }

        // Return the first running application if no priority match
        return runningApps[0].url;
    }

    /**
     * Start periodic port checking
     */
    startPeriodicChecks(): void {
        // Check every 2 minutes
        this.checkInterval = setInterval(async () => {
            try {
                await this.checkApplicationPorts();
            } catch (err) {
                console.error('PortChecker: Periodic check failed:', err);
            }
        }, 2 * 60 * 1000);
    }

    /**
     * Stop periodic checks
     */
    stopPeriodicChecks(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopPeriodicChecks();
    }
}
