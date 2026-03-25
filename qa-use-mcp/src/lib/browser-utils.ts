/**
 * Browser utility functions shared across CLI commands and REPL
 */

export interface ElementRef {
    selector: string;
    ref: string;
}

export interface BrowserAction {
    type: 'click' | 'type' | 'select' | 'hover' | 'scroll' | 'screenshot' | 'navigate' | 'goto' | 'fill' | 'check' | 'uncheck' | 'upload' | 'drag' | 'drop' | 'keypress' | 'swipe' | 'pinch' | 'zoom';
    selector?: string;
    text?: string;
    options?: any;
}

/**
 * Normalize element reference - strips quotes and @ symbols
 */
export function normalizeRef(ref: string): string {
    return ref
        .replace(/^["']?(.+?)["']?$/, '$1') // Strip surrounding quotes
        .replace(/^@/, ''); // Remove leading @
}

/**
 * Parse element reference from selector or text
 */
export function parseRef(input: string): ElementRef {
    // Check if it's a selector pattern
    const selectorMatch = input.match(/^([a-zA-Z0-9_-]+)=(.+)$/);
    if (selectorMatch) {
        return {
            selector: selectorMatch[1],
            ref: selectorMatch[2]
        };
    }
    
    // Check if it's a quoted ref
    const quotedMatch = input.match(/^["']?(.+?)["']?$/);
    if (quotedMatch) {
        return {
            selector: '',
            ref: normalizeRef(quotedMatch[1])
        };
    }
    
    // Default to text input
    return {
        selector: '',
        ref: input
    };
}

/**
 * Generate a unique element reference if needed
 */
export function generateElementRef(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `__custom__data-testid=rf__node-${timestamp}-${random}`;
}

/**
 * Validate element reference format
 */
export function isValidRef(ref: string): boolean {
    // Basic validation for common patterns
    const validPatterns = [
        /^[a-zA-Z][a-zA-Z0-9_-]*$/, // Simple identifiers
        /^__custom__data-testid=rf__node-/, // Custom test IDs
        /^#[a-zA-Z0-9_-]+$/, // CSS IDs
        /^\.[a-zA-Z][a-zA-Z0-9_-]*$/, // Class names
    ];
    
    return validPatterns.some(pattern => pattern.test(ref));
}

/**
 * Format action for logging
 */
export function formatAction(action: BrowserAction): string {
    const optionsStr = action.options ? ` (${JSON.stringify(action.options)})` : '';
    const selectorStr = action.selector ? ` on ${action.selector}` : '';
    
    return `${action.type}${selectorStr}${optionsStr} -> ${action.text || ''}`;
}

/**
 * Parse viewport size from string
 */
export function parseViewport(sizeStr: string): { width: number; height: number } {
    const match = sizeStr.match(/^(\d+)x(\d+)$/);
    if (!match) {
        return { width: 1920, height: 1080 }; // Default
    }
    
    return {
        width: parseInt(match[1]),
        height: parseInt(match[2])
    };
}

/**
 * Common browser wait strategies
 */
export const waitStrategies = {
    waitForElement: 'Wait for element to be visible',
    waitForNavigation: 'Wait for page navigation to complete',
    waitForNetworkIdle: 'Wait for network to be idle',
    waitForFunction: 'Wait for custom JavaScript function to return true'
} as const;
