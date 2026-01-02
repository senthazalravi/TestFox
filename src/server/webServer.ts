import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

/**
 * Web Server for External Dashboard Access
 * Provides web interface and real-time communication with VS Code extension
 */
export class WebServer {
    private app: express.Application;
    private server: HTTPServer;
    private io: SocketIOServer;
    private port: number = 8080;
    private isRunning: boolean = false;
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    // Callback functions for external control
    private onCommandCallback?: (command: string, data?: any) => Promise<any>;
    private onDataRequestCallback?: (type: string) => Promise<any>;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('TestFox Web Server');

        this.app = express();
        this.server = createServer(this.app);
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.setupRoutes();
        this.setupSocketIO();
    }

    /**
     * Start the web server
     */
    async start(): Promise<boolean> {
        if (this.isRunning) {
            return true;
        }

        try {
            // Find available port
            this.port = await this.findAvailablePort(8080);

            return new Promise((resolve) => {
                this.server.listen(this.port, 'localhost', () => {
                    this.isRunning = true;
                    this.log(`Web server started on http://localhost:${this.port}`);
                    vscode.window.showInformationMessage(
                        `TestFox Dashboard available at: http://localhost:${this.port}`,
                        'Open in Browser'
                    ).then(selection => {
                        if (selection === 'Open in Browser') {
                            vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${this.port}`));
                        }
                    });
                    resolve(true);
                });

                this.server.on('error', (error) => {
                    this.log(`Server error: ${error.message}`);
                    resolve(false);
                });
            });
        } catch (error) {
            this.log(`Failed to start web server: ${error}`);
            return false;
        }
    }

    /**
     * Stop the web server
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        return new Promise((resolve) => {
            this.io.close();
            this.server.close(() => {
                this.isRunning = false;
                this.log('Web server stopped');
                resolve();
            });
        });
    }

    /**
     * Set callback for handling commands from browser
     */
    setCommandCallback(callback: (command: string, data?: any) => Promise<any>): void {
        this.onCommandCallback = callback;
    }

    /**
     * Set callback for handling data requests from browser
     */
    setDataRequestCallback(callback: (type: string) => Promise<any>): void {
        this.onDataRequestCallback = callback;
    }

    /**
     * Send real-time update to all connected browsers
     */
    sendUpdate(type: string, data: any): void {
        this.io.emit('update', { type, data, timestamp: new Date() });
    }

    /**
     * Notify browsers that data has changed and should be refreshed
     */
    notifyDataChange(): void {
        this.sendUpdate('data-changed', { refresh: true });
    }

    /**
     * Get server status
     */
    isServerRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Get actual port
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Get server URL
     */
    getServerUrl(): string | null {
        return this.isRunning ? `http://localhost:${this.port}` : null;
    }

    private setupRoutes(): void {
        // Serve static files
        this.app.use(express.json());
        this.app.use(express.static(path.join(this.context.extensionPath, 'web-dashboard')));

        // API routes
        this.app.get('/api/status', (req, res) => {
            res.json({
                running: this.isRunning,
                port: this.port,
                timestamp: new Date()
            });
        });

        this.app.post('/api/command', async (req, res) => {
            try {
                const { command, data } = req.body;
                if (this.onCommandCallback) {
                    const result = await this.onCommandCallback(command, data);
                    res.json({ success: true, result });
                } else {
                    res.json({ success: false, error: 'No command callback registered' });
                }
            } catch (error: any) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/data/:type', async (req, res) => {
            try {
                const { type } = req.params;
                if (this.onDataRequestCallback) {
                    const data = await this.onDataRequestCallback(type);
                    res.json({ success: true, data });
                } else {
                    res.json({ success: false, error: 'No data callback registered' });
                }
            } catch (error: any) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Main dashboard route
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(this.context.extensionPath, 'web-dashboard', 'index.html'));
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date() });
        });
    }

    private setupSocketIO(): void {
        this.io.on('connection', (socket) => {
            this.log(`Browser connected: ${socket.id}`);

            // Send initial data
            socket.emit('welcome', {
                message: 'Connected to TestFox Web Dashboard',
                timestamp: new Date()
            });

            // Handle browser commands
            socket.on('command', async (data) => {
                try {
                    const { command, payload } = data;
                    if (this.onCommandCallback) {
                        const result = await this.onCommandCallback(command, payload);
                        socket.emit('command-response', {
                            command,
                            success: true,
                            result,
                            timestamp: new Date()
                        });
                    } else {
                        socket.emit('command-response', {
                            command,
                            success: false,
                            error: 'No command callback registered',
                            timestamp: new Date()
                        });
                    }
                } catch (error: any) {
                    socket.emit('command-response', {
                        command: data.command,
                        success: false,
                        error: error.message,
                        timestamp: new Date()
                    });
                }
            });

            // Handle data requests
            socket.on('request-data', async (data) => {
                try {
                    const { type } = data;
                    if (this.onDataRequestCallback) {
                        const result = await this.onDataRequestCallback(type);
                        socket.emit('data-response', {
                            type,
                            success: true,
                            data: result,
                            timestamp: new Date()
                        });
                    } else {
                        socket.emit('data-response', {
                            type,
                            success: false,
                            error: 'No data callback registered',
                            timestamp: new Date()
                        });
                    }
                } catch (error: any) {
                    socket.emit('data-response', {
                        type: data.type,
                        success: false,
                        error: error.message,
                        timestamp: new Date()
                    });
                }
            });

            socket.on('disconnect', () => {
                this.log(`Browser disconnected: ${socket.id}`);
            });
        });
    }

    private async findAvailablePort(startPort: number): Promise<number> {
        const net = require('net');

        for (let port = startPort; port < startPort + 100; port++) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
        }

        throw new Error(`No available ports found starting from ${startPort}`);
    }

    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = require('net').createServer();

            server.listen(port, 'localhost', () => {
                server.close(() => resolve(true));
            });

            server.on('error', () => resolve(false));
        });
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}