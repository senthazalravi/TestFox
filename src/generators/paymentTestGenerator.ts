import { v4 as uuidv4 } from 'uuid';
import {
    TestCase,
    TestCategory,
    AutomationLevel,
    TestPriority,
    IstqbTechnique,
    AnalysisResult,
    RouteInfo,
    FormInfo,
    EndpointInfo
} from '../types';

/**
 * Payment flow information detected from code
 */
export interface PaymentFlowInfo {
    type: 'stripe' | 'paypal' | 'braintree' | 'square' | 'adyen' | 'checkout' | 'cart' | 'subscription' | 'generic';
    provider?: string;
    endpoint?: string;
    method?: string;
    file: string;
    line: number;
    hasWebhook?: boolean;
    hasIdempotency?: boolean;
}

/**
 * Payment Test Generator - Comprehensive tests for payment flows
 * Covers card validation, fraud detection, webhooks, idempotency, and compliance
 */
export class PaymentTestGenerator {

    /**
     * Generate all payment test cases based on detected payment flows
     */
    generatePaymentTests(analysisResult: AnalysisResult, paymentFlows: PaymentFlowInfo[] = []): TestCase[] {
        const tests: TestCase[] = [];

        if (paymentFlows.length === 0) {
            // Generate generic payment tests if no specific flows detected
            tests.push(...this.generateGenericPaymentTests());
        } else {
            // Generate tests for each detected payment flow
            for (const flow of paymentFlows) {
                tests.push(...this.generateTestsForFlow(flow, analysisResult));
            }
        }

        // Always include core payment tests
        tests.push(...this.generateCardValidationTests());
        tests.push(...this.generateFraudDetectionTests());
        tests.push(...this.generateWebhookTests(paymentFlows));
        tests.push(...this.generateIdempotencyTests(paymentFlows));
        tests.push(...this.generateComplianceTests());

        return tests;
    }

    /**
     * Detect payment-related code patterns in the codebase
     */
    detectPaymentFlows(content: string, file: string): PaymentFlowInfo[] {
        const flows: PaymentFlowInfo[] = [];
        const lines = content.split('\n');

        // Stripe patterns
        const stripePatterns = [
            /stripe/i,
            /createPaymentIntent/i,
            /confirmCardPayment/i,
            /Stripe\s*\(/i,
            /loadStripe/i,
            /Elements.*stripe/i,
            /CardElement/i,
            /PaymentElement/i,
            /stripe\.charges/i,
            /stripe\.paymentIntents/i
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const pattern of stripePatterns) {
                if (pattern.test(lines[i])) {
                    flows.push({
                        type: 'stripe',
                        provider: 'Stripe',
                        file,
                        line: i + 1,
                        hasWebhook: /webhook/i.test(content),
                        hasIdempotency: /idempotency/i.test(content)
                    });
                    break;
                }
            }
        }

        // PayPal patterns
        const paypalPatterns = [
            /paypal/i,
            /createOrder.*paypal/i,
            /paypal\.Buttons/i,
            /paypal-checkout/i,
            /@paypal\/checkout-server-sdk/i
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const pattern of paypalPatterns) {
                if (pattern.test(lines[i])) {
                    flows.push({
                        type: 'paypal',
                        provider: 'PayPal',
                        file,
                        line: i + 1
                    });
                    break;
                }
            }
        }

        // Braintree patterns
        const braintreePatterns = [
            /braintree/i,
            /dropin.*create/i,
            /braintree\.client/i,
            /hostedFields/i
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const pattern of braintreePatterns) {
                if (pattern.test(lines[i])) {
                    flows.push({
                        type: 'braintree',
                        provider: 'Braintree',
                        file,
                        line: i + 1
                    });
                    break;
                }
            }
        }

        // Checkout/Cart patterns
        const checkoutPatterns = [
            /\/checkout/i,
            /\/cart/i,
            /checkout.*form/i,
            /payment.*form/i,
            /billing.*address/i,
            /shipping.*address/i,
            /order.*summary/i,
            /place.*order/i
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const pattern of checkoutPatterns) {
                if (pattern.test(lines[i])) {
                    // Check if it's a route definition
                    const routeMatch = lines[i].match(/['"`](\/[^'"`]*checkout[^'"`]*)['"`]/i) ||
                                      lines[i].match(/['"`](\/[^'"`]*cart[^'"`]*)['"`]/i) ||
                                      lines[i].match(/['"`](\/[^'"`]*payment[^'"`]*)['"`]/i);
                    if (routeMatch) {
                        flows.push({
                            type: 'checkout',
                            endpoint: routeMatch[1],
                            file,
                            line: i + 1
                        });
                    }
                    break;
                }
            }
        }

        // Subscription patterns
        const subscriptionPatterns = [
            /subscription/i,
            /recurring.*payment/i,
            /billing.*cycle/i,
            /subscribe/i,
            /membership/i,
            /plan.*id/i
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const pattern of subscriptionPatterns) {
                if (pattern.test(lines[i])) {
                    flows.push({
                        type: 'subscription',
                        file,
                        line: i + 1
                    });
                    break;
                }
            }
        }

        // Remove duplicates based on file and line
        return flows.filter((flow, index, self) =>
            index === self.findIndex(f => f.file === flow.file && f.line === flow.line)
        );
    }

    /**
     * Generate tests for a specific payment flow
     */
    private generateTestsForFlow(flow: PaymentFlowInfo, analysisResult: AnalysisResult): TestCase[] {
        const tests: TestCase[] = [];

        switch (flow.type) {
            case 'stripe':
                tests.push(...this.generateStripeTests(flow));
                break;
            case 'paypal':
                tests.push(...this.generatePayPalTests(flow));
                break;
            case 'braintree':
                tests.push(...this.generateBraintreeTests(flow));
                break;
            case 'checkout':
                tests.push(...this.generateCheckoutTests(flow, analysisResult));
                break;
            case 'subscription':
                tests.push(...this.generateSubscriptionTests(flow));
                break;
        }

        return tests;
    }

    /**
     * Generate Stripe-specific tests
     */
    private generateStripeTests(flow: PaymentFlowInfo): TestCase[] {
        return [
            {
                id: `PAY-STRIPE-${uuidv4().slice(0, 8)}`,
                name: 'Stripe: Successful Card Payment',
                description: 'Test successful payment with valid Stripe test card',
                category: 'payment',
                subcategory: 'stripe',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['stripe', 'payment', 'card', 'critical'],
                steps: [
                    { order: 1, action: 'Navigate to checkout page', expected: 'Checkout form displayed' },
                    { order: 2, action: 'Fill in valid test card: 4242 4242 4242 4242', expected: 'Card accepted' },
                    { order: 3, action: 'Enter expiry: 12/30, CVC: 123', expected: 'Details accepted' },
                    { order: 4, action: 'Click Pay button', expected: 'Payment processing' },
                    { order: 5, action: 'Wait for Stripe confirmation', expected: 'Payment successful message' }
                ],
                expectedResult: 'Payment completes successfully, Stripe PaymentIntent status is succeeded',
                targetElement: { type: 'route', path: flow.endpoint || '/checkout' },
                createdAt: new Date()
            },
            {
                id: `PAY-STRIPE-${uuidv4().slice(0, 8)}`,
                name: 'Stripe: Declined Card Payment',
                description: 'Test declined payment with Stripe test decline card',
                category: 'payment',
                subcategory: 'stripe',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['stripe', 'payment', 'decline', 'error-handling'],
                steps: [
                    { order: 1, action: 'Navigate to checkout', expected: 'Form displayed' },
                    { order: 2, action: 'Enter decline test card: 4000 0000 0000 0002', expected: 'Card entered' },
                    { order: 3, action: 'Attempt payment', expected: 'Payment declined' }
                ],
                expectedResult: 'Payment declined with clear error message, no duplicate charges',
                targetElement: { type: 'route', path: flow.endpoint || '/checkout' },
                createdAt: new Date()
            },
            {
                id: `PAY-STRIPE-${uuidv4().slice(0, 8)}`,
                name: 'Stripe: 3D Secure Authentication',
                description: 'Test 3D Secure card authentication flow',
                category: 'payment',
                subcategory: 'stripe',
                automationLevel: 'full',
                priority: 'high',
                tags: ['stripe', '3ds', 'authentication', 'sca'],
                steps: [
                    { order: 1, action: 'Enter 3DS test card: 4000 0025 0000 3155', expected: 'Card entered' },
                    { order: 2, action: 'Submit payment', expected: '3DS popup appears' },
                    { order: 3, action: 'Complete 3DS authentication', expected: 'Authentication successful' },
                    { order: 4, action: 'Verify payment completion', expected: 'Payment succeeds' }
                ],
                expectedResult: '3D Secure flow completes successfully, PaymentIntent requires_action handled',
                targetElement: { type: 'route', path: flow.endpoint || '/checkout' },
                createdAt: new Date()
            },
            {
                id: `PAY-STRIPE-${uuidv4().slice(0, 8)}`,
                name: 'Stripe: Idempotency Key Handling',
                description: 'Test idempotency prevents duplicate charges',
                category: 'payment',
                subcategory: 'stripe',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['stripe', 'idempotency', 'duplicate-prevention'],
                steps: [
                    { order: 1, action: 'Create payment intent with idempotency key', expected: 'Intent created' },
                    { order: 2, action: 'Retry same request with same key', expected: 'Same intent returned' },
                    { order: 3, action: 'Verify only one charge exists', expected: 'No duplicates in Stripe dashboard' }
                ],
                expectedResult: 'Idempotency key prevents duplicate PaymentIntents and charges',
                targetElement: { type: 'route', path: flow.endpoint || '/checkout' },
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate PayPal-specific tests
     */
    private generatePayPalTests(flow: PaymentFlowInfo): TestCase[] {
        return [
            {
                id: `PAY-PAYPAL-${uuidv4().slice(0, 8)}`,
                name: 'PayPal: Successful Payment Flow',
                description: 'Test complete PayPal checkout flow',
                category: 'payment',
                subcategory: 'paypal',
                automationLevel: 'partial',
                priority: 'critical',
                tags: ['paypal', 'checkout', 'critical'],
                steps: [
                    { order: 1, action: 'Click PayPal checkout button', expected: 'PayPal SDK loads' },
                    { order: 2, action: 'Sandbox login credentials', expected: 'Logged in to PayPal sandbox' },
                    { order: 3, action: 'Approve payment in PayPal', expected: 'Redirect back to site' },
                    { order: 4, action: 'Verify order completion', expected: 'Order confirmed, webhook received' }
                ],
                expectedResult: 'PayPal payment completes, webhook PAYLOAD.VERIFIED received',
                targetElement: { type: 'route', path: flow.endpoint || '/checkout' },
                createdAt: new Date()
            },
            {
                id: `PAY-PAYPAL-${uuidv4().slice(0, 8)}`,
                name: 'PayPal: Webhook Verification',
                description: 'Test PayPal webhook signature verification',
                category: 'payment',
                subcategory: 'paypal',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['paypal', 'webhook', 'security', 'signature'],
                steps: [
                    { order: 1, action: 'Send test webhook to endpoint', expected: 'Webhook received' },
                    { order: 2, action: 'Verify webhook signature', expected: 'Signature valid' },
                    { order: 3, action: 'Send invalid signature webhook', expected: 'Rejected with 400' }
                ],
                expectedResult: 'Only webhooks with valid signatures are processed',
                targetElement: { type: 'route', path: '/webhooks/paypal' },
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate Braintree-specific tests
     */
    private generateBraintreeTests(flow: PaymentFlowInfo): TestCase[] {
        return [
            {
                id: `PAY-BRAINTREE-${uuidv4().slice(0, 8)}`,
                name: 'Braintree: Hosted Fields Integration',
                description: 'Test Braintree hosted fields for PCI compliance',
                category: 'payment',
                subcategory: 'braintree',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['braintree', 'hosted-fields', 'pci-compliance'],
                steps: [
                    { order: 1, action: 'Load checkout page', expected: 'Hosted fields render' },
                    { order: 2, action: 'Enter test card in hosted fields', expected: 'Tokenization requested' },
                    { order: 3, action: 'Verify nonce received', expected: 'Payment method nonce created' },
                    { order: 4, action: 'Complete payment with nonce', expected: 'Transaction successful' }
                ],
                expectedResult: 'Card tokenized via hosted fields, no raw card data touches server',
                targetElement: { type: 'route', path: flow.endpoint || '/checkout' },
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate checkout flow tests
     */
    private generateCheckoutTests(flow: PaymentFlowInfo, analysisResult: AnalysisResult): TestCase[] {
        const tests: TestCase[] = [];

        // Find checkout forms
        const checkoutForms = analysisResult.forms.filter(f =>
            /checkout|payment|billing/i.test(f.name) ||
            /checkout|payment|billing/i.test(f.action || '')
        );

        for (const form of checkoutForms) {
            tests.push({
                id: `PAY-CHECKOUT-${uuidv4().slice(0, 8)}`,
                name: `Checkout: ${form.name} Complete Flow`,
                description: `Test complete checkout flow for ${form.name}`,
                category: 'payment',
                subcategory: 'checkout',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['checkout', 'e2e', 'critical'],
                steps: [
                    { order: 1, action: 'Add item to cart', expected: 'Item in cart' },
                    { order: 2, action: 'Navigate to checkout', expected: 'Checkout form displayed' },
                    { order: 3, action: 'Fill billing address', expected: 'Address accepted' },
                    { order: 4, action: 'Fill payment details', expected: 'Payment valid' },
                    { order: 5, action: 'Review order summary', expected: 'Summary correct' },
                    { order: 6, action: 'Place order', expected: 'Order confirmed' }
                ],
                expectedResult: 'Complete checkout flow succeeds from cart to confirmation',
                targetElement: { type: 'form', selector: form.name },
                createdAt: new Date()
            });

            tests.push({
                id: `PAY-CHECKOUT-${uuidv4().slice(0, 8)}`,
                name: `Checkout: ${form.name} Validation Errors`,
                description: 'Test validation of required checkout fields',
                category: 'payment',
                subcategory: 'checkout',
                automationLevel: 'full',
                priority: 'high',
                tags: ['checkout', 'validation', 'error-handling'],
                steps: [
                    { order: 1, action: 'Submit empty checkout form', expected: 'Validation errors shown' },
                    { order: 2, action: 'Enter invalid card number', expected: 'Card validation error' },
                    { order: 3, action: 'Enter expired card', expected: 'Expiry validation error' },
                    { order: 4, action: 'Enter invalid ZIP code', expected: 'Address validation error' }
                ],
                expectedResult: 'All validation errors displayed clearly before submission',
                targetElement: { type: 'form', selector: form.name },
                createdAt: new Date()
            });
        }

        return tests;
    }

    /**
     * Generate subscription-specific tests
     */
    private generateSubscriptionTests(flow: PaymentFlowInfo): TestCase[] {
        return [
            {
                id: `PAY-SUB-${uuidv4().slice(0, 8)}`,
                name: 'Subscription: Create and Cancel',
                description: 'Test subscription lifecycle from creation to cancellation',
                category: 'payment',
                subcategory: 'subscription',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['subscription', 'lifecycle', 'critical'],
                steps: [
                    { order: 1, action: 'Select subscription plan', expected: 'Plan selected' },
                    { order: 2, action: 'Enter payment details', expected: 'Payment method added' },
                    { order: 3, action: 'Start subscription', expected: 'Subscription active' },
                    { order: 4, action: 'Verify webhook received', expected: 'subscription.created webhook processed' },
                    { order: 5, action: 'Cancel subscription', expected: 'Cancelled, access until period end' }
                ],
                expectedResult: 'Subscription created, billed, and cancelled correctly',
                targetElement: { type: 'route', path: flow.endpoint || '/subscription' },
                createdAt: new Date()
            },
            {
                id: `PAY-SUB-${uuidv4().slice(0, 8)}`,
                name: 'Subscription: Payment Failure Handling',
                description: 'Test failed subscription payment and retry logic',
                category: 'payment',
                subcategory: 'subscription',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['subscription', 'dunning', 'retry', 'failure'],
                steps: [
                    { order: 1, action: 'Create subscription with valid card', expected: 'Subscription active' },
                    { order: 2, action: 'Update to decline card for next billing', expected: 'Payment method updated' },
                    { order: 3, action: 'Trigger billing attempt', expected: 'Payment fails' },
                    { order: 4, action: 'Verify retry schedule', expected: 'Retries configured correctly' },
                    { order: 5, action: 'Verify customer notification', expected: 'Email sent to customer' }
                ],
                expectedResult: 'Failed payments trigger retry logic and customer notifications',
                targetElement: { type: 'route', path: flow.endpoint || '/subscription' },
                createdAt: new Date()
            },
            {
                id: `PAY-SUB-${uuidv4().slice(0, 8)}`,
                name: 'Subscription: Upgrade/Downgrade Proration',
                description: 'Test plan changes with proration calculations',
                category: 'payment',
                subcategory: 'subscription',
                automationLevel: 'full',
                priority: 'high',
                tags: ['subscription', 'proration', 'upgrade', 'downgrade'],
                steps: [
                    { order: 1, action: 'Subscribe to basic plan ($10/month)', expected: 'Basic plan active' },
                    { order: 2, action: 'Upgrade to pro plan ($30/month) mid-cycle', expected: 'Prorated charge calculated' },
                    { order: 3, action: 'Verify immediate proration charge', expected: '$10 difference charged' },
                    { order: 4, action: 'Downgrade back to basic', expected: 'Credit applied for unused time' }
                ],
                expectedResult: 'Proration calculations are accurate for upgrades and downgrades',
                targetElement: { type: 'route', path: flow.endpoint || '/subscription' },
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate card validation tests
     */
    private generateCardValidationTests(): TestCase[] {
        return [
            {
                id: `PAY-CARD-${uuidv4().slice(0, 8)}`,
                name: 'Card: Valid Card Numbers',
                description: 'Test acceptance of valid card numbers using Luhn algorithm',
                category: 'payment',
                subcategory: 'card-validation',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['card', 'validation', 'luhn', 'critical'],
                steps: [
                    { order: 1, action: 'Enter Visa: 4532015112830366', expected: 'Accepted' },
                    { order: 2, action: 'Enter Mastercard: 5425233430109903', expected: 'Accepted' },
                    { order: 3, action: 'Enter Amex: 374245455400126', expected: 'Accepted' },
                    { order: 4, action: 'Enter Discover: 6011514433546201', expected: 'Accepted' }
                ],
                expectedResult: 'All valid card numbers accepted based on Luhn check',
                createdAt: new Date()
            },
            {
                id: `PAY-CARD-${uuidv4().slice(0, 8)}`,
                name: 'Card: Invalid Card Numbers',
                description: 'Test rejection of invalid card numbers',
                category: 'payment',
                subcategory: 'card-validation',
                automationLevel: 'full',
                priority: 'high',
                tags: ['card', 'validation', 'negative'],
                steps: [
                    { order: 1, action: 'Enter invalid number: 1234567890123456', expected: 'Rejected' },
                    { order: 2, action: 'Enter card with wrong check digit', expected: 'Luhn check fails' },
                    { order: 3, action: 'Enter too short number: 4242', expected: 'Length validation error' },
                    { order: 4, action: 'Enter too long number: 42424242424242424242', expected: 'Length validation error' }
                ],
                expectedResult: 'All invalid card formats rejected with clear error messages',
                createdAt: new Date()
            },
            {
                id: `PAY-CARD-${uuidv4().slice(0, 8)}`,
                name: 'Card: Expiry Date Validation',
                description: 'Test card expiry date validation',
                category: 'payment',
                subcategory: 'card-validation',
                automationLevel: 'full',
                priority: 'high',
                tags: ['card', 'expiry', 'validation'],
                steps: [
                    { order: 1, action: 'Enter future expiry: 12/30', expected: 'Accepted' },
                    { order: 2, action: 'Enter current month expiry', expected: 'Accepted' },
                    { order: 3, action: 'Enter past expiry: 01/20', expected: 'Rejected' },
                    { order: 4, action: 'Enter invalid format: 99/99', expected: 'Format error' }
                ],
                expectedResult: 'Expired cards rejected, future dates accepted',
                createdAt: new Date()
            },
            {
                id: `PAY-CARD-${uuidv4().slice(0, 8)}`,
                name: 'Card: CVC/CVV Validation',
                description: 'Test CVC code validation for different card types',
                category: 'payment',
                subcategory: 'card-validation',
                automationLevel: 'full',
                priority: 'high',
                tags: ['card', 'cvc', 'cvv', 'validation'],
                steps: [
                    { order: 1, action: 'Enter Visa CVC: 123', expected: '3-digit accepted' },
                    { order: 2, action: 'Enter Amex CVC: 1234', expected: '4-digit accepted' },
                    { order: 3, action: 'Enter invalid CVC: 12', expected: 'Too short rejected' },
                    { order: 4, action: 'Enter invalid CVC: 12345', expected: 'Too long rejected' }
                ],
                expectedResult: 'CVC validated based on card type requirements',
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate fraud detection tests
     */
    private generateFraudDetectionTests(): TestCase[] {
        return [
            {
                id: `PAY-FRAUD-${uuidv4().slice(0, 8)}`,
                name: 'Fraud: Velocity Check - Rapid Transactions',
                description: 'Test detection of suspicious rapid-fire transactions',
                category: 'payment',
                subcategory: 'fraud',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['fraud', 'velocity', 'rate-limiting', 'critical'],
                steps: [
                    { order: 1, action: 'Complete first valid payment', expected: 'Payment succeeds' },
                    { order: 2, action: 'Immediately attempt second payment', expected: 'May trigger velocity check' },
                    { order: 3, action: 'Attempt 5 payments in 10 seconds', expected: 'Rate limit or block triggered' },
                    { order: 4, action: 'Verify fraud alert generated', expected: 'Alert logged' }
                ],
                expectedResult: 'Rapid transaction patterns trigger fraud detection mechanisms',
                createdAt: new Date()
            },
            {
                id: `PAY-FRAUD-${uuidv4().slice(0, 8)}`,
                name: 'Fraud: Address Verification Service (AVS)',
                description: 'Test AVS checks for billing address mismatch',
                category: 'payment',
                subcategory: 'fraud',
                automationLevel: 'full',
                priority: 'high',
                tags: ['fraud', 'avs', 'address-verification'],
                steps: [
                    { order: 1, action: 'Enter card with matching billing address', expected: 'AVS match' },
                    { order: 2, action: 'Enter mismatched ZIP code', expected: 'AVS mismatch flagged' },
                    { order: 3, action: 'Verify risk score adjustment', expected: 'Risk score increased' },
                    { order: 4, action: 'Check if transaction blocked or reviewed', expected: 'Action based on risk threshold' }
                ],
                expectedResult: 'AVS mismatches increase risk scores appropriately',
                createdAt: new Date()
            },
            {
                id: `PAY-FRAUD-${uuidv4().slice(0, 8)}`,
                name: 'Fraud: International Card Detection',
                description: 'Test detection of cards from high-risk countries',
                category: 'payment',
                subcategory: 'fraud',
                automationLevel: 'full',
                priority: 'medium',
                tags: ['fraud', 'geolocation', 'international'],
                steps: [
                    { order: 1, action: 'Use card issued in high-risk country', expected: 'Geolocation check performed' },
                    { order: 2, action: 'Verify IP vs card country match', expected: 'Mismatch detected' },
                    { order: 3, action: 'Check additional authentication required', expected: '3DS or verification triggered' }
                ],
                expectedResult: 'Geographic risk factors trigger additional verification',
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate webhook tests
     */
    private generateWebhookTests(paymentFlows: PaymentFlowInfo[]): TestCase[] {
        const tests: TestCase[] = [];

        // Check if webhooks are implemented
        const hasWebhooks = paymentFlows.some(f => f.hasWebhook);

        if (hasWebhooks) {
            tests.push({
                id: `PAY-WEBHOOK-${uuidv4().slice(0, 8)}`,
                name: 'Webhook: Payment Success Event',
                description: 'Test handling of payment success webhook',
                category: 'payment',
                subcategory: 'webhook',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['webhook', 'payment.success', 'critical'],
                steps: [
                    { order: 1, action: 'Send payment.success webhook', expected: 'Webhook received' },
                    { order: 2, action: 'Verify signature authentication', expected: 'Signature valid' },
                    { order: 3, action: 'Check order status updated', expected: 'Order marked paid' },
                    { order: 4, action: 'Verify email confirmation sent', expected: 'Customer notified' }
                ],
                expectedResult: 'Payment success webhook processed, order updated, customer notified',
                targetElement: { type: 'route', path: '/webhooks/payment' },
                createdAt: new Date()
            });

            tests.push({
                id: `PAY-WEBHOOK-${uuidv4().slice(0, 8)}`,
                name: 'Webhook: Payment Failure Event',
                description: 'Test handling of payment failure webhook',
                category: 'payment',
                subcategory: 'webhook',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['webhook', 'payment.failed', 'error-handling'],
                steps: [
                    { order: 1, action: 'Send payment.failed webhook', expected: 'Webhook received' },
                    { order: 2, action: 'Verify failure reason logged', expected: 'Error recorded' },
                    { order: 3, action: 'Check retry behavior', expected: 'Retry scheduled if applicable' },
                    { order: 4, action: 'Verify admin notification', expected: 'Alert sent' }
                ],
                expectedResult: 'Payment failures handled gracefully with proper logging and alerts',
                targetElement: { type: 'route', path: '/webhooks/payment' },
                createdAt: new Date()
            });

            tests.push({
                id: `PAY-WEBHOOK-${uuidv4().slice(0, 8)}`,
                name: 'Webhook: Duplicate Event Handling',
                description: 'Test idempotency of webhook processing',
                category: 'payment',
                subcategory: 'webhook',
                automationLevel: 'full',
                priority: 'high',
                tags: ['webhook', 'idempotency', 'duplicate-prevention'],
                steps: [
                    { order: 1, action: 'Send webhook with event ID', expected: 'Processed successfully' },
                    { order: 2, action: 'Send same webhook again', expected: 'Recognized as duplicate' },
                    { order: 3, action: 'Verify no duplicate side effects', expected: 'Single order update only' }
                ],
                expectedResult: 'Duplicate webhooks with same event ID are ignored',
                targetElement: { type: 'route', path: '/webhooks/payment' },
                createdAt: new Date()
            });

            tests.push({
                id: `PAY-WEBHOOK-${uuidv4().slice(0, 8)}`,
                name: 'Webhook: Replay Attack Protection',
                description: 'Test protection against webhook replay attacks',
                category: 'payment',
                subcategory: 'webhook',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['webhook', 'security', 'replay-attack', 'timestamp'],
                steps: [
                    { order: 1, action: 'Send webhook with old timestamp', expected: 'Rejected as stale' },
                    { order: 2, action: 'Send webhook with future timestamp', expected: 'Rejected' },
                    { order: 3, action: 'Send webhook without timestamp', expected: 'Handled with caution' }
                ],
                expectedResult: 'Old or suspicious webhooks rejected to prevent replays',
                targetElement: { type: 'route', path: '/webhooks/payment' },
                createdAt: new Date()
            });
        }

        return tests;
    }

    /**
     * Generate idempotency tests
     */
    private generateIdempotencyTests(paymentFlows: PaymentFlowInfo[]): TestCase[] {
        const tests: TestCase[] = [];

        const hasIdempotency = paymentFlows.some(f => f.hasIdempotency);

        tests.push({
            id: `PAY-IDEMP-${uuidv4().slice(0, 8)}`,
            name: 'Idempotency: Duplicate Payment Prevention',
            description: 'Test idempotency key prevents duplicate charges',
            category: 'payment',
            subcategory: 'idempotency',
            automationLevel: 'full',
            priority: 'critical',
            tags: ['idempotency', 'duplicate-prevention', 'critical'],
            steps: [
                { order: 1, action: 'Submit payment with idempotency key ABC123', expected: 'Payment processed' },
                { order: 2, action: 'Retry same payment with key ABC123', expected: 'Same response returned' },
                { order: 3, action: 'Verify single charge in dashboard', expected: 'Only one transaction' },
                { order: 4, action: 'Submit with different key XYZ789', expected: 'New payment processed' }
            ],
            expectedResult: 'Same idempotency key returns cached result, different keys process new payments',
            createdAt: new Date()
        });

        tests.push({
            id: `PAY-IDEMP-${uuidv4().slice(0, 8)}`,
            name: 'Idempotency: Key Expiration',
            description: 'Test idempotency key expiration behavior',
            category: 'payment',
            subcategory: 'idempotency',
            automationLevel: 'full',
            priority: 'medium',
            tags: ['idempotency', 'expiration', 'ttl'],
            steps: [
                { order: 1, action: 'Submit payment with idempotency key', expected: 'Payment processed' },
                { order: 2, action: 'Wait for key expiration (e.g., 24 hours)', expected: 'Key expired' },
                { order: 3, action: 'Retry with same expired key', expected: 'New payment processed' }
            ],
            expectedResult: 'Expired idempotency keys allow new transactions',
            createdAt: new Date()
        });

        return tests;
    }

    /**
     * Generate compliance tests (PCI, GDPR, etc.)
     */
    private generateComplianceTests(): TestCase[] {
        return [
            {
                id: `PAY-COMP-${uuidv4().slice(0, 8)}`,
                name: 'Compliance: PCI - No Raw Card Data in Logs',
                description: 'Verify card numbers are not logged',
                category: 'payment',
                subcategory: 'compliance',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['pci', 'compliance', 'logging', 'security', 'critical'],
                steps: [
                    { order: 1, action: 'Complete payment with test card', expected: 'Payment successful' },
                    { order: 2, action: 'Check application logs', expected: 'No full card numbers in logs' },
                    { order: 3, action: 'Check error logs', expected: 'Card data masked in errors' },
                    { order: 4, action: 'Verify only last 4 digits logged', expected: '****4242 format' }
                ],
                expectedResult: 'PCI compliance: Full card numbers never appear in logs',
                createdAt: new Date()
            },
            {
                id: `PAY-COMP-${uuidv4().slice(0, 8)}`,
                name: 'Compliance: PCI - HTTPS Only',
                description: 'Verify all payment endpoints use HTTPS',
                category: 'payment',
                subcategory: 'compliance',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['pci', 'compliance', 'https', 'tls'],
                steps: [
                    { order: 1, action: 'Check payment form action URL', expected: 'HTTPS protocol' },
                    { order: 2, action: 'Check webhook endpoints', expected: 'HTTPS URLs' },
                    { order: 3, action: 'Verify no mixed content', expected: 'All resources HTTPS' },
                    { order: 4, action: 'Check TLS version', expected: 'TLS 1.2 or higher' }
                ],
                expectedResult: 'All payment communications over secure HTTPS',
                createdAt: new Date()
            },
            {
                id: `PAY-COMP-${uuidv4().slice(0, 8)}`,
                name: 'Compliance: GDPR - Payment Data Retention',
                description: 'Test payment data retention and deletion policies',
                category: 'payment',
                subcategory: 'compliance',
                automationLevel: 'full',
                priority: 'high',
                tags: ['gdpr', 'compliance', 'data-retention', 'privacy'],
                steps: [
                    { order: 1, action: 'Complete payment', expected: 'Payment recorded' },
                    { order: 2, action: 'Check retention policy applied', expected: 'Expiry date set' },
                    { order: 3, action: 'Request data deletion', expected: 'Data anonymized' },
                    { order: 4, action: 'Verify raw card data removed', expected: 'Only tokens retained' }
                ],
                expectedResult: 'Payment data retained only as required by law and policies',
                createdAt: new Date()
            },
            {
                id: `PAY-COMP-${uuidv4().slice(0, 8)}`,
                name: 'Compliance: 3D Secure SCA',
                description: 'Test Strong Customer Authentication compliance',
                category: 'payment',
                subcategory: 'compliance',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['3ds', 'sca', 'compliance', 'psd2', 'eu'],
                steps: [
                    { order: 1, action: 'Process EU card transaction > €30', expected: 'SCA triggered' },
                    { order: 2, action: 'Complete authentication challenge', expected: '3DS successful' },
                    { order: 3, action: 'Verify exemption rules', expected: 'Merchant-initiated exempt' },
                    { order: 4, action: 'Check frictionless flow', expected: 'Issuer approves without challenge' }
                ],
                expectedResult: 'SCA applied per PSD2 requirements with proper exemptions',
                createdAt: new Date()
            }
        ];
    }

    /**
     * Generate generic payment tests when no specific provider detected
     */
    private generateGenericPaymentTests(): TestCase[] {
        return [
            {
                id: `PAY-GEN-${uuidv4().slice(0, 8)}`,
                name: 'Payment: Basic Transaction Flow',
                description: 'Test standard payment transaction from start to finish',
                category: 'payment',
                subcategory: 'general',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['payment', 'e2e', 'critical'],
                steps: [
                    { order: 1, action: 'Navigate to payment page', expected: 'Payment form displayed' },
                    { order: 2, action: 'Enter valid payment details', expected: 'Details accepted' },
                    { order: 3, action: 'Submit payment', expected: 'Processing indicator shown' },
                    { order: 4, action: 'Wait for confirmation', expected: 'Success message displayed' }
                ],
                expectedResult: 'Payment completes successfully with confirmation',
                createdAt: new Date()
            },
            {
                id: `PAY-GEN-${uuidv4().slice(0, 8)}`,
                name: 'Payment: Error Handling',
                description: 'Test payment error scenarios',
                category: 'payment',
                subcategory: 'general',
                automationLevel: 'full',
                priority: 'high',
                tags: ['payment', 'error-handling'],
                steps: [
                    { order: 1, action: 'Submit with insufficient funds', expected: 'Decline message shown' },
                    { order: 2, action: 'Submit with invalid card', expected: 'Validation error' },
                    { order: 3, action: 'Simulate network timeout', expected: 'Retry option offered' },
                    { order: 4, action: 'Verify no double charges', expected: 'Idempotency maintained' }
                ],
                expectedResult: 'All error cases handled gracefully without duplicate charges',
                createdAt: new Date()
            }
        ];
    }
}

export default PaymentTestGenerator;
