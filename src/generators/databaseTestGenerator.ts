import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestCase, TestCategory } from '../types';
import { getOpenRouterClient } from '../ai/openRouterClient';

export interface DatabaseConnection {
    type: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite' | 'mssql' | 'redis' | 'unknown';
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    source: string;
    canTest: boolean;
}

export interface DatabaseSchema {
    tables: TableInfo[];
    relationships: Relationship[];
}

export interface TableInfo {
    name: string;
    columns: ColumnInfo[];
    primaryKey?: string;
    foreignKeys: string[];
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    unique: boolean;
    hasDefault: boolean;
}

export interface Relationship {
    from: string;
    to: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * Generates database tests from connection strings and schema analysis
 */
export class DatabaseTestGenerator {
    private workspacePath: string;
    private connections: DatabaseConnection[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.outputChannel = vscode.window.createOutputChannel('TestFox Database');
    }

    /**
     * Discover database connections from project files
     */
    async discoverConnections(): Promise<DatabaseConnection[]> {
        this.connections = [];
        this.log('🔍 Discovering database connections...');

        // Search in various locations
        await this.searchEnvFiles();
        await this.searchConfigFiles();
        await this.searchPrismaSchema();
        await this.searchDockerCompose();
        await this.searchORMConfigs();

        this.log(`Found ${this.connections.length} database connections`);
        return this.connections;
    }

    /**
     * Search .env files for database URLs
     */
    private async searchEnvFiles(): Promise<void> {
        const envFiles = ['.env', '.env.local', '.env.development', '.env.test', '.env.example'];
        
        for (const envFile of envFiles) {
            const filePath = path.join(this.workspacePath, envFile);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');

                for (const line of lines) {
                    if (line.startsWith('#') || !line.includes('=')) continue;
                    
                    const [key, ...valueParts] = line.split('=');
                    const value = valueParts.join('=').replace(/["']/g, '').trim();
                    const keyUpper = key.toUpperCase();

                    if (keyUpper.includes('DATABASE_URL') || keyUpper.includes('DB_URL') || 
                        keyUpper.includes('MONGO') || keyUpper.includes('POSTGRES') ||
                        keyUpper.includes('MYSQL') || keyUpper.includes('REDIS')) {
                        
                        const conn = this.parseConnectionString(value, envFile);
                        if (conn) this.connections.push(conn);
                    }
                }
            }
        }
    }

    /**
     * Search config files for database configuration
     */
    private async searchConfigFiles(): Promise<void> {
        const configPaths = [
            'config/database.js',
            'config/database.ts',
            'config/database.json',
            'src/config/database.ts',
            'app/config/database.ts',
            'knexfile.js',
            'knexfile.ts',
            'ormconfig.js',
            'ormconfig.json',
            'typeorm.config.ts'
        ];

        for (const configPath of configPaths) {
            const filePath = path.join(this.workspacePath, configPath);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                
                // Look for connection patterns
                const patterns = [
                    /host:\s*['"`]([^'"`]+)['"`]/gi,
                    /port:\s*(\d+)/gi,
                    /database:\s*['"`]([^'"`]+)['"`]/gi,
                    /client:\s*['"`](pg|mysql|sqlite3|mssql)['"`]/gi
                ];

                let dbType: DatabaseConnection['type'] = 'unknown';
                let host = '';
                let port = 0;
                let database = '';

                for (const pattern of patterns) {
                    const match = pattern.exec(content);
                    if (match) {
                        if (pattern.source.includes('client')) {
                            const clientMap: Record<string, DatabaseConnection['type']> = {
                                'pg': 'postgresql',
                                'mysql': 'mysql',
                                'sqlite3': 'sqlite',
                                'mssql': 'mssql'
                            };
                            dbType = clientMap[match[1]] || 'unknown';
                        } else if (pattern.source.includes('host')) {
                            host = match[1];
                        } else if (pattern.source.includes('port')) {
                            port = parseInt(match[1]);
                        } else if (pattern.source.includes('database')) {
                            database = match[1];
                        }
                    }
                }

                if (dbType !== 'unknown' || host || database) {
                    this.connections.push({
                        type: dbType,
                        host,
                        port,
                        database,
                        source: configPath,
                        canTest: true
                    });
                }
            }
        }
    }

    /**
     * Search Prisma schema for database info
     */
    private async searchPrismaSchema(): Promise<void> {
        const prismaPath = path.join(this.workspacePath, 'prisma', 'schema.prisma');
        if (fs.existsSync(prismaPath)) {
            const content = fs.readFileSync(prismaPath, 'utf-8');
            
            // Extract provider
            const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);
            if (providerMatch) {
                const providerMap: Record<string, DatabaseConnection['type']> = {
                    'postgresql': 'postgresql',
                    'mysql': 'mysql',
                    'sqlite': 'sqlite',
                    'mongodb': 'mongodb',
                    'sqlserver': 'mssql'
                };
                
                this.connections.push({
                    type: providerMap[providerMatch[1]] || 'unknown',
                    source: 'prisma/schema.prisma',
                    canTest: true
                });
            }
        }
    }

    /**
     * Search Docker Compose for database services
     */
    private async searchDockerCompose(): Promise<void> {
        const composePaths = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
        
        for (const composePath of composePaths) {
            const filePath = path.join(this.workspacePath, composePath);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                
                // Simple pattern matching for common database images
                if (content.includes('postgres:') || content.includes('postgresql')) {
                    this.connections.push({ type: 'postgresql', source: composePath, canTest: true });
                }
                if (content.includes('mysql:') || content.includes('mariadb:')) {
                    this.connections.push({ type: 'mysql', source: composePath, canTest: true });
                }
                if (content.includes('mongo:') || content.includes('mongodb')) {
                    this.connections.push({ type: 'mongodb', source: composePath, canTest: true });
                }
                if (content.includes('redis:')) {
                    this.connections.push({ type: 'redis', source: composePath, canTest: true });
                }
            }
        }
    }

    /**
     * Search for ORM-specific config files
     */
    private async searchORMConfigs(): Promise<void> {
        // Sequelize
        const sequelizeConfig = path.join(this.workspacePath, '.sequelizerc');
        if (fs.existsSync(sequelizeConfig)) {
            this.connections.push({ type: 'unknown', source: '.sequelizerc', canTest: true });
        }

        // Drizzle
        const drizzleConfig = path.join(this.workspacePath, 'drizzle.config.ts');
        if (fs.existsSync(drizzleConfig)) {
            this.connections.push({ type: 'unknown', source: 'drizzle.config.ts', canTest: true });
        }
    }

    /**
     * Parse a database connection string
     */
    private parseConnectionString(connectionString: string, source: string): DatabaseConnection | null {
        try {
            const url = new URL(connectionString);
            const protocol = url.protocol.replace(':', '');
            
            const typeMap: Record<string, DatabaseConnection['type']> = {
                'postgresql': 'postgresql',
                'postgres': 'postgresql',
                'mysql': 'mysql',
                'mongodb': 'mongodb',
                'mongodb+srv': 'mongodb',
                'redis': 'redis',
                'rediss': 'redis',
                'mssql': 'mssql',
                'sqlite': 'sqlite'
            };

            return {
                type: typeMap[protocol] || 'unknown',
                connectionString: connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // Mask credentials
                host: url.hostname,
                port: url.port ? parseInt(url.port) : undefined,
                database: url.pathname.replace('/', ''),
                source,
                canTest: true
            };
        } catch {
            return null;
        }
    }

    /**
     * Generate database tests using AI
     */
    async generateDatabaseTests(): Promise<TestCase[]> {
        const tests: TestCase[] = [];
        const connections = await this.discoverConnections();

        if (connections.length === 0) {
            this.log('No database connections found');
            return tests;
        }

        // Generate tests for each database type found
        const dbTypes = [...new Set(connections.map(c => c.type))];

        for (const dbType of dbTypes) {
            if (dbType === 'unknown') continue;

            // Connection tests
            tests.push(this.createTest(
                `db-connect-${dbType}`,
                `Database Connection - ${dbType}`,
                'database',
                `Verify successful connection to ${dbType} database`,
                'automated',
                ['connectivity', 'database']
            ));

            // CRUD tests
            tests.push(this.createTest(
                `db-crud-create-${dbType}`,
                `Database CRUD - Create Record`,
                'database',
                `Test creating new records in ${dbType} database`,
                'automated',
                ['crud', 'database', 'create']
            ));

            tests.push(this.createTest(
                `db-crud-read-${dbType}`,
                `Database CRUD - Read Records`,
                'database',
                `Test reading records from ${dbType} database`,
                'automated',
                ['crud', 'database', 'read']
            ));

            tests.push(this.createTest(
                `db-crud-update-${dbType}`,
                `Database CRUD - Update Record`,
                'database',
                `Test updating records in ${dbType} database`,
                'automated',
                ['crud', 'database', 'update']
            ));

            tests.push(this.createTest(
                `db-crud-delete-${dbType}`,
                `Database CRUD - Delete Record`,
                'database',
                `Test deleting records from ${dbType} database`,
                'automated',
                ['crud', 'database', 'delete']
            ));

            // Transaction tests
            tests.push(this.createTest(
                `db-transaction-${dbType}`,
                `Database Transaction - Commit/Rollback`,
                'database',
                `Test transaction commit and rollback in ${dbType}`,
                'automated',
                ['transaction', 'database']
            ));

            // Performance tests
            tests.push(this.createTest(
                `db-perf-query-${dbType}`,
                `Database Performance - Query Speed`,
                'database',
                `Measure query execution time in ${dbType}`,
                'automated',
                ['performance', 'database']
            ));

            // Security tests
            tests.push(this.createTest(
                `db-security-injection-${dbType}`,
                `Database Security - SQL Injection Prevention`,
                'database',
                `Test SQL injection prevention for ${dbType}`,
                'automated',
                ['security', 'database', 'injection']
            ));

            tests.push(this.createTest(
                `db-security-auth-${dbType}`,
                `Database Security - Authentication`,
                'database',
                `Verify database authentication is properly configured`,
                'semi-automated',
                ['security', 'database', 'auth']
            ));

            // Data integrity tests
            tests.push(this.createTest(
                `db-integrity-constraints-${dbType}`,
                `Database Integrity - Constraint Validation`,
                'database',
                `Test database constraints (unique, foreign key, not null)`,
                'automated',
                ['integrity', 'database']
            ));

            tests.push(this.createTest(
                `db-integrity-cascade-${dbType}`,
                `Database Integrity - Cascade Operations`,
                'database',
                `Test cascade delete and update operations`,
                'automated',
                ['integrity', 'database', 'cascade']
            ));
        }

        // Try to generate AI-enhanced tests
        await this.enhanceTestsWithAI(tests, connections);

        this.log(`Generated ${tests.length} database tests`);
        return tests;
    }

    /**
     * Enhance tests with AI-generated scenarios
     */
    private async enhanceTestsWithAI(tests: TestCase[], connections: DatabaseConnection[]): Promise<void> {
        const openRouter = getOpenRouterClient();
        
        if (!openRouter.isConfigured()) {
            this.log('AI not configured - using basic database tests');
            return;
        }

        try {
            const dbInfo = connections.map(c => `${c.type} (source: ${c.source})`).join(', ');
            
            const prompt = `Generate 5 additional database test scenarios for an application using: ${dbInfo}

Focus on:
1. Edge cases and boundary conditions
2. Data validation scenarios
3. Concurrent access testing
4. Backup and recovery scenarios
5. Migration testing

Return JSON array with format:
[{"name": "Test Name", "description": "What to test", "category": "database", "priority": "high|medium|low"}]`;

            const response = await openRouter.chat([{ role: 'user', content: prompt }]);
            
            // Parse AI response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const aiTests = JSON.parse(jsonMatch[0]);
                for (const aiTest of aiTests) {
                    tests.push(this.createTest(
                        `db-ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        aiTest.name,
                        'database',
                        aiTest.description,
                        'semi-automated',
                        ['database', 'ai-generated']
                    ));
                }
            }
        } catch (error) {
            this.log('AI enhancement failed - using basic tests');
        }
    }

    private createTest(
        id: string,
        name: string,
        category: TestCategory,
        description: string,
        automationLevel: 'automated' | 'semi-automated' | 'manual',
        tags: string[]
    ): TestCase {
        return {
            id,
            name,
            category,
            description,
            automationLevel,
            priority: 'medium',
            status: 'pending',
            tags,
            steps: [],
            expectedResult: `Test passes without errors`,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

