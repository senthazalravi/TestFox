import * as vscode from 'vscode';

/**
 * Premium subscription tiers
 */
export enum SubscriptionTier {
    FREE = 'free',
    PRO = 'pro',
    ENTERPRISE = 'enterprise'
}

/**
 * Premium features
 */
export enum PremiumFeature {
    UNLIMITED_AI_GENERATION = 'unlimited_ai_generation',
    ADVANCED_ANALYTICS = 'advanced_analytics',
    CUSTOM_TEST_TEMPLATES = 'custom_test_templates',
    TEAM_COLLABORATION = 'team_collaboration',
    CI_CD_INTEGRATION = 'ci_cd_integration',
    COMPLIANCE_REPORTING = 'compliance_reporting',
    PRIORITY_SUPPORT = 'priority_support',
    WHITE_LABEL = 'white_label'
}

/**
 * Usage metrics
 */
export interface UsageMetrics {
    aiRequests: number;
    testCasesGenerated: number;
    projectsAnalyzed: number;
    reportsGenerated: number;
    storageUsed: number; // MB
    lastReset: Date;
}

/**
 * Subscription info
 */
export interface SubscriptionInfo {
    tier: SubscriptionTier;
    isActive: boolean;
    expiresAt?: Date;
    features: PremiumFeature[];
    limits: {
        aiRequestsPerMonth: number;
        testCasesPerMonth: number;
        projectsPerMonth: number;
        storageLimit: number; // MB
    };
}

/**
 * Premium Service for TestFox
 * Manages subscriptions, usage tracking, and premium features
 */
export class PremiumService {
    private static instance: PremiumService;
    private subscriptionInfo: SubscriptionInfo;
    private usageMetrics: UsageMetrics;

    private constructor() {
        this.subscriptionInfo = this.getDefaultSubscription();
        this.usageMetrics = this.loadUsageMetrics();
        this.initializePremiumFeatures();
    }

    static getInstance(): PremiumService {
        if (!PremiumService.instance) {
            PremiumService.instance = new PremiumService();
        }
        return PremiumService.instance;
    }

    /**
     * Get default free tier subscription
     */
    private getDefaultSubscription(): SubscriptionInfo {
        return {
            tier: SubscriptionTier.FREE,
            isActive: true,
            features: [], // No premium features
            limits: {
                aiRequestsPerMonth: 50,
                testCasesPerMonth: 100,
                projectsPerMonth: 3,
                storageLimit: 100 // 100MB
            }
        };
    }

    /**
     * Initialize premium features based on subscription
     */
    private initializePremiumFeatures(): void {
        // Load subscription from settings or remote service
        this.loadSubscriptionFromSettings();

        // Set up usage tracking
        this.setupUsageTracking();

        // Initialize premium-only features
        this.initializeAdvancedFeatures();
    }

    /**
     * Load subscription from VS Code settings or remote service
     */
    private async loadSubscriptionFromSettings(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('testfox');

            // Check for stored subscription (this would come from a real payment service)
            const storedTier = config.get<string>('premium.tier');
            const storedKey = config.get<string>('premium.licenseKey');

            if (storedTier && storedKey) {
                // Validate license key with remote service
                const isValid = await this.validateLicenseKey(storedKey, storedTier as SubscriptionTier);
                if (isValid) {
                    this.subscriptionInfo = this.getSubscriptionForTier(storedTier as SubscriptionTier);
                }
            }
        } catch (error) {
            console.error('❌ Premium Service: Failed to load subscription:', error);
        }
    }

    /**
     * Get subscription details for a tier
     */
    private getSubscriptionForTier(tier: SubscriptionTier): SubscriptionInfo {
        switch (tier) {
            case SubscriptionTier.PRO:
                return {
                    tier: SubscriptionTier.PRO,
                    isActive: true,
                    features: [
                        PremiumFeature.UNLIMITED_AI_GENERATION,
                        PremiumFeature.ADVANCED_ANALYTICS,
                        PremiumFeature.CUSTOM_TEST_TEMPLATES
                    ],
                    limits: {
                        aiRequestsPerMonth: 5000,
                        testCasesPerMonth: 5000,
                        projectsPerMonth: 50,
                        storageLimit: 5000 // 5GB
                    }
                };

            case SubscriptionTier.ENTERPRISE:
                return {
                    tier: SubscriptionTier.ENTERPRISE,
                    isActive: true,
                    features: [
                        PremiumFeature.UNLIMITED_AI_GENERATION,
                        PremiumFeature.ADVANCED_ANALYTICS,
                        PremiumFeature.CUSTOM_TEST_TEMPLATES,
                        PremiumFeature.TEAM_COLLABORATION,
                        PremiumFeature.CI_CD_INTEGRATION,
                        PremiumFeature.COMPLIANCE_REPORTING,
                        PremiumFeature.PRIORITY_SUPPORT,
                        PremiumFeature.WHITE_LABEL
                    ],
                    limits: {
                        aiRequestsPerMonth: -1, // Unlimited
                        testCasesPerMonth: -1, // Unlimited
                        projectsPerMonth: -1, // Unlimited
                        storageLimit: 50000 // 50GB
                    }
                };

            default:
                return this.getDefaultSubscription();
        }
    }

    /**
     * Validate license key with remote service
     */
    private async validateLicenseKey(key: string, tier: SubscriptionTier): Promise<boolean> {
        try {
            // This would call your license validation API
            // For now, we'll do basic validation
            const response = await fetch('https://api.testfox.ai/validate-license', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, tier })
            });

            if (response.ok) {
                const data = await response.json();
                return data.valid;
            }

            return false;
        } catch (error) {
            console.error('❌ Premium Service: License validation failed:', error);
            return false;
        }
    }

    /**
     * Check if a feature is available
     */
    isFeatureAvailable(feature: PremiumFeature): boolean {
        return this.subscriptionInfo.features.includes(feature);
    }

    /**
     * Check if usage is within limits
     */
    checkUsageLimit(metric: keyof UsageMetrics, increment: number = 1): boolean {
        const currentValue = this.usageMetrics[metric] as number;
        const limit = this.subscriptionInfo.limits[this.getLimitKey(metric)];

        if (limit === -1) return true; // Unlimited
        return (currentValue + increment) <= limit;
    }

    /**
     * Record usage
     */
    recordUsage(metric: keyof UsageMetrics, value: number = 1): void {
        if (typeof this.usageMetrics[metric] === 'number') {
            (this.usageMetrics[metric] as number) += value;
        }
        this.saveUsageMetrics();
    }

    /**
     * Get remaining usage for a metric
     */
    getRemainingUsage(metric: keyof UsageMetrics): number {
        const limit = this.subscriptionInfo.limits[this.getLimitKey(metric)];
        if (limit === -1) return -1; // Unlimited

        const current = this.usageMetrics[metric] as number;
        return Math.max(0, limit - current);
    }

    /**
     * Show upgrade prompt for premium features
     */
    showUpgradePrompt(feature: PremiumFeature): void {
        const featureNames = {
            [PremiumFeature.UNLIMITED_AI_GENERATION]: 'Unlimited AI Generation',
            [PremiumFeature.ADVANCED_ANALYTICS]: 'Advanced Analytics',
            [PremiumFeature.CUSTOM_TEST_TEMPLATES]: 'Custom Test Templates',
            [PremiumFeature.TEAM_COLLABORATION]: 'Team Collaboration',
            [PremiumFeature.CI_CD_INTEGRATION]: 'CI/CD Integration',
            [PremiumFeature.COMPLIANCE_REPORTING]: 'Compliance Reporting',
            [PremiumFeature.PRIORITY_SUPPORT]: 'Priority Support',
            [PremiumFeature.WHITE_LABEL]: 'White Label'
        };

        vscode.window.showInformationMessage(
            `🚀 ${featureNames[feature]} is a Pro feature. Upgrade to unlock advanced testing capabilities!`,
            'View Plans',
            'Learn More'
        ).then(selection => {
            if (selection === 'View Plans') {
                vscode.env.openExternal(vscode.Uri.parse('https://testfox.ai/pricing'));
            } else if (selection === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://testfox.ai/features'));
            }
        });
    }

    /**
     * Initialize advanced premium features
     */
    private initializeAdvancedFeatures(): void {
        if (this.isFeatureAvailable(PremiumFeature.TEAM_COLLABORATION)) {
            this.initializeTeamCollaboration();
        }

        if (this.isFeatureAvailable(PremiumFeature.CI_CD_INTEGRATION)) {
            this.initializeCICDIntegration();
        }

        if (this.isFeatureAvailable(PremiumFeature.COMPLIANCE_REPORTING)) {
            this.initializeComplianceReporting();
        }
    }

    /**
     * Initialize team collaboration features
     */
    private initializeTeamCollaboration(): void {
        console.log('🚀 Premium Service: Initializing team collaboration features');
        // Initialize shared workspaces, team permissions, etc.
    }

    /**
     * Initialize CI/CD integration
     */
    private initializeCICDIntegration(): void {
        console.log('🚀 Premium Service: Initializing CI/CD integration');
        // Initialize webhooks, API endpoints, etc.
    }

    /**
     * Initialize compliance reporting
     */
    private initializeComplianceReporting(): void {
        console.log('🚀 Premium Service: Initializing compliance reporting');
        // Initialize SOC2, ISO27001, etc. reporting
    }

    /**
     * Set up usage tracking
     */
    private setupUsageTracking(): void {
        // Reset usage monthly
        const now = new Date();
        const lastReset = new Date(this.usageMetrics.lastReset);

        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            this.resetUsageMetrics();
        }
    }

    /**
     * Load usage metrics from storage
     */
    private loadUsageMetrics(): UsageMetrics {
        const context = (global as any).vscode?.extensionContext;
        if (context) {
            const stored = context.globalState.get<UsageMetrics>('testfox.usage');
            if (stored) {
                return stored;
            }
        }

        return {
            aiRequests: 0,
            testCasesGenerated: 0,
            projectsAnalyzed: 0,
            reportsGenerated: 0,
            storageUsed: 0,
            lastReset: new Date()
        };
    }

    /**
     * Save usage metrics to storage
     */
    private saveUsageMetrics(): void {
        const context = (global as any).vscode?.extensionContext;
        if (context) {
            context.globalState.update('testfox.usage', this.usageMetrics);
        }
    }

    /**
     * Reset usage metrics monthly
     */
    private resetUsageMetrics(): void {
        this.usageMetrics = {
            aiRequests: 0,
            testCasesGenerated: 0,
            projectsAnalyzed: 0,
            reportsGenerated: 0,
            storageUsed: 0,
            lastReset: new Date()
        };
        this.saveUsageMetrics();
    }

    /**
     * Get limit key for metric
     */
    private getLimitKey(metric: keyof UsageMetrics): keyof SubscriptionInfo['limits'] {
        const mapping = {
            aiRequests: 'aiRequestsPerMonth',
            testCasesGenerated: 'testCasesPerMonth',
            projectsAnalyzed: 'projectsPerMonth',
            storageUsed: 'storageLimit'
        } as const;

        return mapping[metric] || 'aiRequestsPerMonth';
    }

    /**
     * Get current subscription info
     */
    getSubscriptionInfo(): SubscriptionInfo {
        return { ...this.subscriptionInfo };
    }

    /**
     * Get usage metrics
     */
    getUsageMetrics(): UsageMetrics {
        return { ...this.usageMetrics };
    }

    /**
     * Upgrade subscription (would integrate with payment processor)
     */
    async upgradeSubscription(tier: SubscriptionTier): Promise<boolean> {
        try {
            // This would integrate with Stripe, Paddle, etc.
            // For now, just update locally for demo
            this.subscriptionInfo = this.getSubscriptionForTier(tier);

            // Save to settings
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('premium.tier', tier, vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage(`🎉 Successfully upgraded to ${tier.toUpperCase()} plan!`);

            return true;
        } catch (error) {
            console.error('❌ Premium Service: Upgrade failed:', error);
            return false;
        }
    }
}

/**
 * Hook to check premium feature access
 */
export function requirePremium(feature: PremiumFeature): boolean {
    const premium = PremiumService.getInstance();
    if (!premium.isFeatureAvailable(feature)) {
        premium.showUpgradePrompt(feature);
        return false;
    }
    return true;
}

/**
 * Hook to check and record usage
 */
export function checkAndRecordUsage(metric: keyof UsageMetrics, value: number = 1): boolean {
    const premium = PremiumService.getInstance();
    if (!premium.checkUsageLimit(metric, value)) {
        vscode.window.showWarningMessage(
            `You've reached your ${metric} limit for this month. Upgrade to Pro for unlimited usage!`,
            'Upgrade Now'
        ).then(selection => {
            if (selection === 'Upgrade Now') {
                vscode.env.openExternal(vscode.Uri.parse('https://testfox.ai/pricing'));
            }
        });
        return false;
    }

    premium.recordUsage(metric, value);
    return true;
}
