import { TestCase } from '../types';
import * as crypto from 'crypto';

/**
 * Creates a unique fingerprint for a test to detect duplicates
 * Based on test source (file, route, endpoint, form, etc.)
 */
export class TestFingerprint {
    /**
     * Generate a fingerprint for a test case
     * This should be deterministic - same test = same fingerprint
     */
    static generate(test: TestCase): string {
        // Create a unique identifier based on test characteristics
        const components: string[] = [];

        // Base components
        components.push(`category:${test.category}`);
        components.push(`name:${this.normalizeName(test.name)}`);
        
        // Target element (route, endpoint, form, etc.)
        if (test.targetElement) {
            if (test.targetElement.type === 'route' || test.targetElement.type === 'endpoint') {
                components.push(`target:${test.targetElement.type}:${test.targetElement.method || 'GET'}:${test.targetElement.path || ''}`);
            } else if (test.targetElement.type === 'form') {
                components.push(`target:form:${test.targetElement.path || ''}`);
            } else if (test.targetElement.type === 'component') {
                components.push(`target:component:${test.targetElement.selector || ''}`);
            } else {
                components.push(`target:${test.targetElement.type}:${test.targetElement.selector || test.targetElement.path || ''}`);
            }
        }

        // Subcategory for more specific matching
        if (test.subcategory) {
            components.push(`subcategory:${test.subcategory}`);
        }

        // Security type for security tests
        if (test.securityType) {
            components.push(`security:${test.securityType}`);
        }

        // ISTQB technique
        if (test.istqbTechnique) {
            components.push(`technique:${test.istqbTechnique}`);
        }

        // Create hash from components
        const fingerprintString = components.join('|');
        return crypto.createHash('sha256').update(fingerprintString).digest('hex').substring(0, 16);
    }

    /**
     * Normalize test name for comparison
     */
    private static normalizeName(name: string): string {
        // Remove common prefixes/suffixes that might vary
        return name
            .toLowerCase()
            .replace(/^(smoke|functional|api|security|performance|load|edge|negative|boundary|monkey|exploratory|regression|sanity):\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Check if two tests are duplicates
     */
    static areDuplicates(test1: TestCase, test2: TestCase): boolean {
        return this.generate(test1) === this.generate(test2);
    }

    /**
     * Generate fingerprint for a route/endpoint
     */
    static forRoute(method: string, path: string, category: string): string {
        return crypto.createHash('sha256')
            .update(`route:${method}:${path}:${category}`)
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Generate fingerprint for a form
     */
    static forForm(formName: string, action: string, category: string): string {
        return crypto.createHash('sha256')
            .update(`form:${formName}:${action}:${category}`)
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Generate fingerprint for an endpoint
     */
    static forEndpoint(method: string, path: string, category: string): string {
        return crypto.createHash('sha256')
            .update(`endpoint:${method}:${path}:${category}`)
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Generate fingerprint for a component
     */
    static forComponent(componentName: string, category: string): string {
        return crypto.createHash('sha256')
            .update(`component:${componentName}:${category}`)
            .digest('hex')
            .substring(0, 16);
    }
}


