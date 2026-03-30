import { TestCase, TestCategory, TestPriority, AutomationLevel } from '../types';

/**
 * Backend Test Generator - Specialized tests for Node.js backend services
 * Implements comprehensive backend testing patterns including concurrency,
 * idempotency, webhooks, and compliance requirements.
 */
export class BackendTestGenerator {

    /**
     * Generate all backend test cases
     */
    generateAllBackendTests(): TestCase[] {
        const tests: TestCase[] = [];

        // Add all backend test cases
        tests.push(...this.generateIdempotencyTests());
        tests.push(...this.generateWebhookTests());
        tests.push(...this.generateConcurrencyTests());
        tests.push(...this.generateStateIntegrityTests());
        tests.push(...this.generateReliabilityTests());
        tests.push(...this.generateFailureRecoveryTests());
        tests.push(...this.generateApiContractTests());
        tests.push(...this.generateStabilityTests());
        tests.push(...this.generateComplianceTests());
        tests.push(...this.generateObservabilityTests());

        return tests;
    }

    /**
     * BE-ORD-001: Order Creation - Idempotency
     */
    private generateIdempotencyTests(): TestCase[] {
        return [{
            id: 'BE-ORD-001',
            name: 'Order Creation - Idempotency',
            description: 'Ensure order creation is idempotent and handles duplicate requests correctly',
            category: 'backend_idempotency',
            priority: 'critical',
            automationLevel: 'full',
            tags: ['order', 'idempotency', 'critical', 'node.js', 'async'],
            preconditions: [
                'Valid cart exists',
                'Payment authorization ID available',
                'Order service is running'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Send initial POST /orders request with valid payload and idempotency key',
                    action: 'api_call',
                    selector: 'POST /orders',
                    value: JSON.stringify({
                        cartId: 'cart_123',
                        paymentAuthId: 'auth_456',
                        idempotencyKey: 'order_key_789'
                    }),
                    expected: 'Order created successfully with 201 status'
                },
                {
                    id: '2',
                    description: 'Retry the same request with the same idempotency key',
                    action: 'api_call',
                    selector: 'POST /orders',
                    value: JSON.stringify({
                        cartId: 'cart_123',
                        paymentAuthId: 'auth_456',
                        idempotencyKey: 'order_key_789'
                    }),
                    expected: 'Same order returned with 200 status, no new order created'
                },
                {
                    id: '3',
                    description: 'Retry again after a delay to simulate network retry',
                    action: 'api_call',
                    selector: 'POST /orders',
                    value: JSON.stringify({
                        cartId: 'cart_123',
                        paymentAuthId: 'auth_456',
                        idempotencyKey: 'order_key_789'
                    }),
                    expected: 'Same order returned, no duplicates in database'
                },
                {
                    id: '4',
                    description: 'Query database to verify only one order exists',
                    action: 'db_query',
                    selector: 'SELECT COUNT(*) FROM orders WHERE idempotency_key = ?',
                    value: 'order_key_789',
                    expected: 'Count equals 1'
                }
            ],
            expectedResult: 'Only one order is created, all subsequent calls return the same order ID, no duplicate rows in DB, logs show deduplication. Node.js event-loop timing issues are handled correctly.',
            istqbTechnique: 'state_transition_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-PAY-002: PayPal Authorization Webhook - Out-of-Order Delivery
     */
    private generateWebhookTests(): TestCase[] {
        return [
            {
                id: 'BE-PAY-002',
                name: 'PayPal Authorization Webhook - Out-of-Order Delivery',
                description: 'Test webhook event ordering and state machine integrity',
                category: 'backend_webhooks',
                priority: 'high',
                automationLevel: 'full',
                tags: ['webhook', 'paypal', 'async', 'event-ordering', 'node.js'],
                preconditions: [
                    'PayPal webhook endpoint configured',
                    'Order exists in PENDING state',
                    'Webhook handler is running'
                ],
                steps: [
                    {
                        id: '1',
                        description: 'Send PAYMENT.CAPTURED webhook event',
                        action: 'webhook_call',
                        selector: 'POST /webhooks/paypal',
                        value: JSON.stringify({
                            event_type: 'PAYMENT.CAPTURED',
                            resource: {
                                id: 'PAY-123456',
                                state: 'completed',
                                transactions: [{ amount: { total: '99.99', currency: 'USD' } }]
                            },
                            order_id: 'order_789'
                        }),
                        expected: 'Webhook processed, order state updated to CAPTURED'
                    },
                    {
                        id: '2',
                        description: 'Send PAYMENT.AUTHORIZED webhook event after CAPTURED',
                        action: 'webhook_call',
                        selector: 'POST /webhooks/paypal',
                        value: JSON.stringify({
                            event_type: 'PAYMENT.AUTHORIZED',
                            resource: {
                                id: 'PAY-123456',
                                state: 'authorized',
                                transactions: [{ amount: { total: '99.99', currency: 'USD' } }]
                            },
                            order_id: 'order_789'
                        }),
                        expected: 'Webhook processed but order state remains CAPTURED'
                    },
                    {
                        id: '3',
                        description: 'Query order state from database',
                        action: 'db_query',
                        selector: 'SELECT status FROM orders WHERE id = ?',
                        value: 'order_789',
                        expected: 'Status is CAPTURED, not reverted to AUTHORIZED'
                    },
                    {
                        id: '4',
                        description: 'Check webhook processing logs',
                        action: 'log_check',
                        selector: 'webhook_processor',
                        value: 'Event ordering prevented backward transition',
                        expected: 'Logs show state machine prevented invalid transition'
                    }
                ],
                expectedResult: 'System accepts final state only, order is not reverted to "authorized", state machine prevents backward transition. Node.js event handlers maintain proper ordering.',
                istqbTechnique: 'state_transition_testing',
                status: 'pending',
                createdAt: new Date()
            },
            {
                id: 'BE-WH-010',
                name: 'Stripe Webhook Signature Verification',
                description: 'Test webhook signature validation and security',
                category: 'backend_webhooks',
                priority: 'critical',
                automationLevel: 'full',
                tags: ['webhook', 'stripe', 'security', 'signature', 'node.js'],
                preconditions: [
                    'Stripe webhook secret configured',
                    'Webhook endpoint is secured',
                    'Stripe account is active'
                ],
                steps: [
                    {
                        id: '1',
                        description: 'Send valid Stripe webhook with correct signature',
                        action: 'webhook_call',
                        selector: 'POST /webhooks/stripe',
                        value: JSON.stringify({
                            id: 'evt_valid_123',
                            type: 'payment_intent.succeeded',
                            data: { object: { id: 'pi_123', amount: 5000 } },
                            signature: 'valid_signature'
                        }),
                        expected: 'Webhook accepted with 200 status'
                    },
                    {
                        id: '2',
                        description: 'Send webhook with invalid signature',
                        action: 'webhook_call',
                        selector: 'POST /webhooks/stripe',
                        value: JSON.stringify({
                            id: 'evt_invalid_456',
                            type: 'payment_intent.succeeded',
                            data: { object: { id: 'pi_456', amount: 5000 } },
                            signature: 'invalid_signature'
                        }),
                        expected: 'Webhook rejected with 401 status'
                    },
                    {
                        id: '3',
                        description: 'Send webhook with missing signature',
                        action: 'webhook_call',
                        selector: 'POST /webhooks/stripe',
                        value: JSON.stringify({
                            id: 'evt_nosig_789',
                            type: 'payment_intent.succeeded',
                            data: { object: { id: 'pi_789', amount: 5000 } }
                        }),
                        expected: 'Webhook rejected with 401 status'
                    },
                    {
                        id: '4',
                        description: 'Verify security logs for rejected webhooks',
                        action: 'log_check',
                        selector: 'security_logs',
                        value: 'Invalid webhook signature',
                        expected: 'Security logs show signature verification failures'
                    }
                ],
                expectedResult: 'Only webhooks with valid signatures are processed, invalid signatures are rejected with 401, security logs track all attempts.',
                istqbTechnique: 'security_testing',
                status: 'pending',
                createdAt: new Date()
            },
            {
                id: 'BE-WH-011',
                name: 'Webhook Timeout and Retry Handling',
                description: 'Test webhook processing under timeout conditions',
                category: 'backend_webhooks',
                priority: 'high',
                automationLevel: 'full',
                tags: ['webhook', 'timeout', 'retry', 'resilience', 'node.js'],
                preconditions: [
                    'Webhook endpoint configured',
                    'Slow processing endpoint available',
                    'Webhook retry mechanism enabled'
                ],
                steps: [
                    {
                        id: '1',
                        description: 'Send webhook that will timeout during processing',
                        action: 'webhook_call',
                        selector: 'POST /webhooks/slow',
                        value: JSON.stringify({
                            id: 'evt_slow_001',
                            type: 'slow_processing_event',
                            processing_time: 35000
                        }),
                        expected: 'Request times out after 30 seconds'
                    },
                    {
                        id: '2',
                        description: 'Check webhook status in queue',
                        action: 'db_query',
                        selector: 'SELECT status FROM webhook_queue WHERE event_id = ?',
                        value: 'evt_slow_001',
                        expected: 'Status is failed or retry_pending'
                    },
                    {
                        id: '3',
                        description: 'Wait for retry mechanism to trigger',
                        action: 'wait',
                        selector: '60000ms',
                        expected: 'Retry attempts are made with exponential backoff'
                    },
                    {
                        id: '4',
                        description: 'Verify dead letter queue for failed webhooks',
                        action: 'db_query',
                        selector: 'SELECT COUNT(*) FROM webhook_dead_letter WHERE event_id = ?',
                        value: 'evt_slow_001',
                        expected: 'Event moved to dead letter queue after max retries'
                    }
                ],
                expectedResult: 'Webhooks that timeout are retried with exponential backoff, eventually moved to dead letter queue, system remains stable.',
                istqbTechnique: 'reliability_testing',
                status: 'pending',
                createdAt: new Date()
            }
        ];
    }

    /**
     * BE-INV-003: Inventory Reservation - Last Item Race
     */
    private generateConcurrencyTests(): TestCase[] {
        return [{
            id: 'BE-INV-003',
            name: 'Inventory Reservation - Last Item Race Condition',
            description: 'Test concurrent inventory reservation for the last item',
            category: 'backend_concurrency',
            priority: 'high',
            automationLevel: 'full',
            tags: ['inventory', 'concurrency', 'race-condition', 'node.js', 'atomic'],
            preconditions: [
                'SKU stock = 1',
                'Inventory service is running',
                'Concurrent request simulation available'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Verify initial inventory stock',
                    action: 'db_query',
                    selector: 'SELECT stock_quantity FROM inventory WHERE sku = ?',
                    value: 'SKU-123',
                    expected: 'Stock quantity equals 1'
                },
                {
                    id: '2',
                    description: 'Fire two parallel POST /reserve-stock requests simultaneously',
                    action: 'concurrent_api_calls',
                    selector: 'POST /reserve-stock',
                    value: JSON.stringify([
                        {
                            sku: 'SKU-123',
                            quantity: 1,
                            orderId: 'order_1',
                            sessionId: 'session_abc'
                        },
                        {
                            sku: 'SKU-123',
                            quantity: 1,
                            orderId: 'order_2',
                            sessionId: 'session_def'
                        }
                    ]),
                    expected: 'One request succeeds (200), one fails (409 Conflict)'
                },
                {
                    id: '3',
                    description: 'Verify final inventory stock',
                    action: 'db_query',
                    selector: 'SELECT stock_quantity FROM inventory WHERE sku = ?',
                    value: 'SKU-123',
                    expected: 'Stock quantity equals 0 (not negative)'
                },
                {
                    id: '4',
                    description: 'Check reservation records',
                    action: 'db_query',
                    selector: 'SELECT COUNT(*) FROM inventory_reservations WHERE sku = ? AND status = ?',
                    value: ['SKU-123', 'active'],
                    expected: 'Count equals 1 (only one successful reservation)'
                }
            ],
            expectedResult: 'One request succeeds, one request fails with 409 Conflict, stock never goes negative. Node.js handles concurrent DB updates atomically.',
            istqbTechnique: 'concurrency_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-ORD-004: Order Cancellation - Stock Release
     */
    private generateStateIntegrityTests(): TestCase[] {
        return [{
            id: 'BE-ORD-004',
            name: 'Order Cancellation - Stock Release',
            description: 'Ensure cancelled orders release reserved inventory',
            category: 'backend_state_integrity',
            priority: 'high',
            automationLevel: 'full',
            tags: ['order', 'cancellation', 'inventory', 'state-integrity', 'node.js'],
            preconditions: [
                'Order exists in AUTHORIZED state',
                'Inventory was reserved for the order',
                'Background workers are running'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Verify order is in AUTHORIZED state',
                    action: 'db_query',
                    selector: 'SELECT status FROM orders WHERE id = ?',
                    value: 'order_123',
                    expected: 'Status is AUTHORIZED'
                },
                {
                    id: '2',
                    description: 'Verify inventory is reserved',
                    action: 'db_query',
                    selector: 'SELECT status FROM inventory_reservations WHERE order_id = ?',
                    value: 'order_123',
                    expected: 'Status is RESERVED'
                },
                {
                    id: '3',
                    description: 'Cancel the order',
                    action: 'api_call',
                    selector: 'POST /orders/order_123/cancel',
                    value: JSON.stringify({
                        reason: 'customer_request',
                        refundRequired: true
                    }),
                    expected: 'Order cancelled successfully (200 status)'
                },
                {
                    id: '4',
                    description: 'Verify order state changed to CANCELLED',
                    action: 'db_query',
                    selector: 'SELECT status FROM orders WHERE id = ?',
                    value: 'order_123',
                    expected: 'Status is CANCELLED'
                },
                {
                    id: '5',
                    description: 'Verify inventory reservation is released',
                    action: 'db_query',
                    selector: 'SELECT status FROM inventory_reservations WHERE order_id = ?',
                    value: 'order_123',
                    expected: 'Status is RELEASED'
                },
                {
                    id: '6',
                    description: 'Wait for background cleanup and verify no re-reservation',
                    action: 'wait',
                    selector: '5000ms',
                    expected: 'Background jobs complete'
                },
                {
                    id: '7',
                    description: 'Verify inventory stock is restored',
                    action: 'db_query',
                    selector: 'SELECT stock_quantity FROM inventory WHERE sku = ?',
                    value: 'SKU-123',
                    expected: 'Stock quantity increased by cancelled order amount'
                }
            ],
            expectedResult: 'Order state = CANCELLED, inventory reservation released, stock restored, no delayed re-reservation from async background jobs.',
            istqbTechnique: 'state_transition_testing',
            status: 'pending',
            createdAt: new Date()
        },
        {
            id: 'BE-SI-011',
            name: 'Payment State Machine - Invalid Transitions',
            description: 'Test payment state machine prevents invalid transitions',
            category: 'backend_state_integrity',
            priority: 'critical',
            automationLevel: 'full',
            tags: ['payment', 'state-machine', 'invalid-transitions', 'node.js'],
            preconditions: [
                'Payment exists in CAPTURED state',
                'State machine rules are enforced',
                'Database constraints are active'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Verify payment is in CAPTURED state',
                    action: 'db_query',
                    selector: 'SELECT status FROM payments WHERE id = ?',
                    value: 'pay_456',
                    expected: 'Status is CAPTURED'
                },
                {
                    id: '2',
                    description: 'Attempt invalid transition CAPTURED -> AUTHORIZED',
                    action: 'api_call',
                    selector: 'POST /payments/pay_456/authorize',
                    value: JSON.stringify({ reason: 'test_invalid' }),
                    expected: 'Request rejected (400 status) - invalid state transition'
                },
                {
                    id: '3',
                    description: 'Attempt invalid transition CAPTURED -> PENDING',
                    action: 'db_call',
                    selector: 'UPDATE payments SET status = ? WHERE id = ?',
                    value: ['PENDING', 'pay_456'],
                    expected: 'Database constraint violation or transaction rollback'
                },
                {
                    id: '4',
                    description: 'Verify payment remains in CAPTURED state',
                    action: 'db_query',
                    selector: 'SELECT status FROM payments WHERE id = ?',
                    value: 'pay_456',
                    expected: 'Status is still CAPTURED, no change occurred'
                },
                {
                    id: '5',
                    description: 'Check state transition audit logs',
                    action: 'log_check',
                    selector: 'state_machine_audit',
                    value: 'pay_456',
                    expected: 'Audit log shows rejected transition attempts'
                }
            ],
            expectedResult: 'Payment state remains CAPTURED, invalid transitions blocked at API and DB level, audit trail preserved.',
            istqbTechnique: 'state_transition_testing',
            status: 'pending',
            createdAt: new Date()
        },
        {
            id: 'BE-SI-012',
            name: 'Cart Abandonment Inventory Cleanup',
            description: 'Test abandoned carts release inventory after timeout',
            category: 'backend_state_integrity',
            priority: 'medium',
            automationLevel: 'full',
            tags: ['cart', 'abandonment', 'inventory', 'timeout', 'node.js'],
            preconditions: [
                'Cart contains items with reserved inventory',
                'Cart has been inactive for 30+ minutes',
                'Background cleanup job is running'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Create cart and reserve inventory',
                    action: 'api_call',
                    selector: 'POST /carts',
                    value: JSON.stringify({
                        items: [{ sku: 'SKU-789', qty: 5 }]
                    }),
                    expected: 'Cart created, inventory reserved'
                },
                {
                    id: '2',
                    description: 'Verify inventory is reserved',
                    action: 'db_query',
                    selector: 'SELECT reserved_quantity FROM inventory WHERE sku = ?',
                    value: 'SKU-789',
                    expected: 'Reserved quantity equals 5'
                },
                {
                    id: '3',
                    description: 'Simulate 30 minutes of inactivity',
                    action: 'time_travel',
                    selector: '1800000ms',
                    expected: 'System time advanced by 30 minutes'
                },
                {
                    id: '4',
                    description: 'Trigger background cleanup job',
                    action: 'job_trigger',
                    selector: 'cart_cleanup_worker',
                    expected: 'Cleanup job executes'
                },
                {
                    id: '5',
                    description: 'Verify cart is marked as expired',
                    action: 'db_query',
                    selector: 'SELECT status FROM carts WHERE id = ?',
                    value: 'cart_new',
                    expected: 'Status is EXPIRED'
                },
                {
                    id: '6',
                    description: 'Verify inventory reservation released',
                    action: 'db_query',
                    selector: 'SELECT reserved_quantity FROM inventory WHERE sku = ?',
                    value: 'SKU-789',
                    expected: 'Reserved quantity equals 0'
                }
            ],
            expectedResult: 'Expired cart state properly managed, inventory reservations cleaned up, no orphaned reservations.',
            istqbTechnique: 'state_transition_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-WH-005: Duplicate Webhook Handling
     */
    private generateReliabilityTests(): TestCase[] {
        return [{
            id: 'BE-WH-005',
            name: 'Duplicate Webhook Handling',
            description: 'Test idempotent webhook processing and duplicate detection',
            category: 'backend_reliability',
            priority: 'medium',
            automationLevel: 'full',
            tags: ['webhook', 'duplicate', 'idempotency', 'reliability', 'node.js'],
            preconditions: [
                'Webhook endpoint configured',
                'Idempotency storage available',
                'Webhook handler processes events'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Send initial webhook payload',
                    action: 'webhook_call',
                    selector: 'POST /webhooks/stripe',
                    value: JSON.stringify({
                        id: 'evt_1234567890',
                        type: 'payment_intent.succeeded',
                        data: {
                            object: {
                                id: 'pi_1234567890',
                                amount: 999,
                                currency: 'usd'
                            }
                        },
                        created: Date.now() / 1000
                    }),
                    expected: 'Webhook processed successfully (200 status)'
                },
                {
                    id: '2',
                    description: 'Send identical webhook payload (duplicate 1)',
                    action: 'webhook_call',
                    selector: 'POST /webhooks/stripe',
                    value: JSON.stringify({
                        id: 'evt_1234567890',
                        type: 'payment_intent.succeeded',
                        data: {
                            object: {
                                id: 'pi_1234567890',
                                amount: 999,
                                currency: 'usd'
                            }
                        },
                        created: Date.now() / 1000
                    }),
                    expected: 'Webhook ignored (200 status, no processing)'
                },
                {
                    id: '3',
                    description: 'Send identical webhook payload (duplicate 2)',
                    action: 'webhook_call',
                    selector: 'POST /webhooks/stripe',
                    value: JSON.stringify({
                        id: 'evt_1234567890',
                        type: 'payment_intent.succeeded',
                        data: {
                            object: {
                                id: 'pi_1234567890',
                                amount: 999,
                                currency: 'usd'
                            }
                        },
                        created: Date.now() / 1000
                    }),
                    expected: 'Webhook ignored (200 status, no processing)'
                },
                {
                    id: '4',
                    description: 'Send identical webhook payload (duplicate 3)',
                    action: 'webhook_call',
                    selector: 'POST /webhooks/stripe',
                    value: JSON.stringify({
                        id: 'evt_1234567890',
                        type: 'payment_intent.succeeded',
                        data: {
                            object: {
                                id: 'pi_1234567890',
                                amount: 999,
                                currency: 'usd'
                            }
                        },
                        created: Date.now() / 1000
                    }),
                    expected: 'Webhook ignored (200 status, no processing)'
                },
                {
                    id: '5',
                    description: 'Verify event processed only once in database',
                    action: 'db_query',
                    selector: 'SELECT COUNT(*) FROM webhook_events WHERE event_id = ?',
                    value: 'evt_1234567890',
                    expected: 'Count equals 1'
                },
                {
                    id: '6',
                    description: 'Check idempotency logs',
                    action: 'log_check',
                    selector: 'webhook_processor',
                    value: 'Duplicate webhook detected',
                    expected: 'Logs show duplicate detection and skipping'
                }
            ],
            expectedResult: 'Webhook processed once, duplicates ignored, idempotency key stored and checked. Node.js stateless handlers properly deduplicate events.',
            istqbTechnique: 'reliability_testing',
            status: 'pending',
            createdAt: new Date()
        },
        {
            id: 'BE-REL-013',
            name: 'API Retry with Exponential Backoff',
            description: 'Test API retry mechanism with exponential backoff strategy',
            category: 'backend_reliability',
            priority: 'high',
            automationLevel: 'full',
            tags: ['api', 'retry', 'exponential-backoff', 'reliability', 'node.js'],
            preconditions: [
                'External API integration is configured',
                'Retry mechanism is enabled',
                'Circuit breaker is NOT triggered'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Force external API to return 503 errors',
                    action: 'mock_service',
                    selector: 'external_payment_api',
                    value: JSON.stringify({ status: 503, error: 'Service Unavailable' }),
                    expected: 'Mock service configured to fail'
                },
                {
                    id: '2',
                    description: 'Initiate API call that will trigger retry',
                    action: 'api_call',
                    selector: 'POST /payments/external',
                    value: JSON.stringify({ amount: 100, currency: 'USD' }),
                    expected: 'Request initiated, retry loop begins'
                },
                {
                    id: '3',
                    description: 'Measure retry intervals (should follow exponential backoff)',
                    action: 'measure_delays',
                    selector: 'retry_attempts',
                    value: '4',
                    expected: 'Delays are approximately 1s, 2s, 4s, 8s'
                },
                {
                    id: '4',
                    description: 'Verify total request count matches retry attempts',
                    action: 'metric_check',
                    selector: 'external_api_calls_total',
                    value: 'pay_ext_001',
                    expected: 'Total calls equals initial + 4 retries = 5'
                },
                {
                    id: '5',
                    description: 'Restore external API to success',
                    action: 'mock_service',
                    selector: 'external_payment_api',
                    value: JSON.stringify({ status: 200, transactionId: 'txn_success' }),
                    expected: 'Mock service configured to succeed'
                },
                {
                    id: '6',
                    description: 'Verify successful response after retries',
                    action: 'db_query',
                    selector: 'SELECT status FROM payments WHERE id = ?',
                    value: 'pay_ext_001',
                    expected: 'Status is COMPLETED'
                }
            ],
            expectedResult: 'Exponential backoff delays observed, final success after retries, circuit breaker not opened for transient failures.',
            istqbTechnique: 'reliability_testing',
            status: 'pending',
            createdAt: new Date()
        },
        {
            id: 'BE-REL-014',
            name: 'Database Connection Pool Exhaustion',
            description: 'Test system behavior when DB connection pool is exhausted',
            category: 'backend_reliability',
            priority: 'critical',
            automationLevel: 'full',
            tags: ['database', 'connection-pool', 'exhaustion', 'reliability', 'node.js'],
            preconditions: [
                'Connection pool size is limited (e.g., 5 connections)',
                'Multiple concurrent requests will be made',
                'Connection timeout is configured (e.g., 5 seconds)'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Check current connection pool status',
                    action: 'db_monitor',
                    selector: 'connection_pool',
                    value: 'active_connections',
                    expected: 'Less than max pool size connections active'
                },
                {
                    id: '2',
                    description: 'Spawn 20 concurrent DB-intensive requests',
                    action: 'concurrent_requests',
                    selector: 'POST /orders/bulk-create',
                    value: JSON.stringify({ count: 20, delay: 2000 }),
                    expected: 'All 20 requests initiated simultaneously'
                },
                {
                    id: '3',
                    description: 'Monitor connection pool during peak load',
                    action: 'db_monitor',
                    selector: 'connection_pool',
                    value: 'active_connections',
                    expected: 'Pool reaches max capacity, queue forms'
                },
                {
                    id: '4',
                    description: 'Verify queued requests wait for available connections',
                    action: 'metric_check',
                    selector: 'request_queue_time',
                    value: 'bulk_requests',
                    expected: 'Queue times are non-zero, less than timeout'
                },
                {
                    id: '5',
                    description: 'Verify no connection leaks after requests complete',
                    action: 'db_monitor',
                    selector: 'connection_pool',
                    value: 'active_connections',
                    expected: 'All connections returned to pool, count back to baseline'
                },
                {
                    id: '6',
                    description: 'Check for connection timeout errors',
                    action: 'log_check',
                    selector: 'error_logs',
                    value: 'Connection acquisition timeout',
                    expected: 'No timeout errors if pool size is adequate'
                }
            ],
            expectedResult: 'Connection pool managed properly under load, requests queued gracefully, all connections released after use, no leaks detected.',
            istqbTechnique: 'stress_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-PAY-006: Partial Failure - Payment Success, Order Failure
     */
    private generateFailureRecoveryTests(): TestCase[] {
        return [{
            id: 'BE-PAY-006',
            name: 'Partial Failure - Payment Success, Order Failure',
            description: 'Test system recovery when payment succeeds but order creation fails',
            category: 'backend_failure_recovery',
            priority: 'high',
            automationLevel: 'full',
            tags: ['payment', 'failure', 'recovery', 'saga', 'node.js'],
            preconditions: [
                'Payment service and Order service are separate',
                'Retry/compensation mechanisms in place',
                'Database failure simulation available'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Initiate payment and order creation flow',
                    action: 'api_call',
                    selector: 'POST /checkout',
                    value: JSON.stringify({
                        cartId: 'cart_456',
                        paymentMethod: 'card',
                        amount: 14999
                    }),
                    expected: 'Checkout process starts'
                },
                {
                    id: '2',
                    description: 'Simulate PayPal authorization success',
                    action: 'mock_service',
                    selector: 'paypal_api',
                    value: JSON.stringify({
                        status: 'success',
                        transactionId: 'txn_789',
                        amount: 14999
                    }),
                    expected: 'Payment authorization succeeds'
                },
                {
                    id: '3',
                    description: 'Force Order Service database failure during creation',
                    action: 'db_failure',
                    selector: 'order_service_db',
                    value: 'connection_timeout',
                    expected: 'Order service DB operation fails'
                },
                {
                    id: '4',
                    description: 'Verify payment was captured but order was not created',
                    action: 'db_query',
                    selector: 'SELECT COUNT(*) FROM payments WHERE transaction_id = ? AND status = ?',
                    value: ['txn_789', 'captured'],
                    expected: 'Payment exists and is captured'
                },
                {
                    id: '5',
                    description: 'Verify no order was created',
                    action: 'db_query',
                    selector: 'SELECT COUNT(*) FROM orders WHERE payment_transaction_id = ?',
                    value: 'txn_789',
                    expected: 'Count equals 0'
                },
                {
                    id: '6',
                    description: 'Trigger retry/compensation job',
                    action: 'job_trigger',
                    selector: 'failure_recovery_worker',
                    expected: 'Recovery job starts processing'
                },
                {
                    id: '7',
                    description: 'Wait for recovery completion',
                    action: 'wait',
                    selector: '10000ms',
                    expected: 'Recovery process completes'
                },
                {
                    id: '8',
                    description: 'Verify final state - either order created or payment voided',
                    action: 'db_query',
                    selector: 'SELECT o.id as order_id, p.status as payment_status FROM orders o RIGHT JOIN payments p ON o.payment_transaction_id = p.transaction_id WHERE p.transaction_id = ?',
                    value: 'txn_789',
                    expected: 'Either order exists OR payment status is VOIDED/REFUNDED'
                }
            ],
            expectedResult: 'Order eventually created OR authorization voided, no orphaned payment, system self-heals. Node.js promise rejections handled correctly.',
            istqbTechnique: 'failure_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-API-007: API Contract Validation
     */
    private generateApiContractTests(): TestCase[] {
        return [{
            id: 'BE-API-007',
            name: 'API Contract Validation',
            description: 'Test API schema validation and contract compliance',
            category: 'backend_api_contract',
            priority: 'medium',
            automationLevel: 'full',
            tags: ['api', 'contract', 'validation', 'schema', 'node.js'],
            preconditions: [
                'API schema validation enabled',
                'Contract testing framework in place',
                'Error responses are consistent'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Send request with extra unexpected fields',
                    action: 'api_call',
                    selector: 'POST /users',
                    value: JSON.stringify({
                        email: 'test@example.com',
                        password: 'password123',
                        unexpectedField: 'should_be_rejected',
                        anotherExtra: 12345
                    }),
                    expected: '400 Bad Request - schema validation error'
                },
                {
                    id: '2',
                    description: 'Send request missing required fields',
                    action: 'api_call',
                    selector: 'POST /users',
                    value: JSON.stringify({
                        // missing email and password
                        name: 'Test User'
                    }),
                    expected: '400 Bad Request - required field missing'
                },
                {
                    id: '3',
                    description: 'Send request with wrong data types',
                    action: 'api_call',
                    selector: 'POST /users',
                    value: JSON.stringify({
                        email: 12345, // should be string
                        password: true, // should be string
                        age: 'twenty-five' // should be number
                    }),
                    expected: '400 Bad Request - type validation error'
                },
                {
                    id: '4',
                    description: 'Verify error response format consistency',
                    action: 'api_call',
                    selector: 'POST /users',
                    value: JSON.stringify({}),
                    expected: 'Error response follows consistent schema with error codes and messages'
                },
                {
                    id: '5',
                    description: 'Test field size limits',
                    action: 'api_call',
                    selector: 'POST /users',
                    value: JSON.stringify({
                        email: 'a'.repeat(300) + '@example.com', // too long
                        password: 'a'.repeat(1000) // too long
                    }),
                    expected: '400 Bad Request - field size validation error'
                }
            ],
            expectedResult: 'Schema validation errors (400), no partial processing, error messages stable (contract-safe). Node.js API handlers properly validate input.',
            istqbTechnique: 'equivalence_partitioning',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-INF-008: Retry Storm Protection
     */
    private generateStabilityTests(): TestCase[] {
        return [{
            id: 'BE-INF-008',
            name: 'Retry Storm Protection',
            description: 'Test exponential backoff and protection against retry cascades',
            category: 'backend_stability',
            priority: 'high',
            automationLevel: 'full',
            tags: ['retry', 'stability', 'backoff', 'circuit-breaker', 'node.js'],
            preconditions: [
                'Retry mechanisms configured',
                'Exponential backoff enabled',
                'Circuit breaker or rate limiting in place'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Force downstream timeout for all requests',
                    action: 'service_failure',
                    selector: 'payment_service',
                    value: 'timeout_all_requests',
                    expected: 'Payment service returns 504 Timeout for all calls'
                },
                {
                    id: '2',
                    description: 'Send initial API request that triggers retry',
                    action: 'api_call',
                    selector: 'POST /orders',
                    value: JSON.stringify({
                        cartId: 'cart_timeout_test',
                        paymentMethod: 'card'
                    }),
                    expected: 'Request fails and retry mechanism activates'
                },
                {
                    id: '3',
                    description: 'Monitor retry attempts over time',
                    action: 'monitor_requests',
                    selector: 'payment_service_calls',
                    value: '60_seconds',
                    expected: 'Retry frequency follows exponential backoff pattern'
                },
                {
                    id: '4',
                    description: 'Verify database load stays within limits',
                    action: 'db_monitor',
                    selector: 'connection_pool_usage',
                    value: 'max_connections:10',
                    expected: 'DB connections stay within safe limits'
                },
                {
                    id: '5',
                    description: 'Check for cascading failures in dependent services',
                    action: 'service_monitor',
                    selector: 'all_services',
                    value: 'error_rate_threshold:5%',
                    expected: 'No service exceeds error rate threshold'
                },
                {
                    id: '6',
                    description: 'Verify system recovers when downstream comes back',
                    action: 'service_restore',
                    selector: 'payment_service',
                    expected: 'System resumes normal operation'
                }
            ],
            expectedResult: 'Exponential backoff implemented, no DB flood, no cascading failures. Node.js event loop not blocked by tight retry loops.',
            istqbTechnique: 'stress_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-CUST-009: GDPR - Customer Deletion Propagation
     */
    private generateComplianceTests(): TestCase[] {
        return [{
            id: 'BE-CUST-009',
            name: 'GDPR - Customer Deletion Propagation',
            description: 'Test complete customer data deletion across all systems',
            category: 'backend_compliance',
            priority: 'critical',
            automationLevel: 'full',
            tags: ['gdpr', 'compliance', 'data-deletion', 'privacy', 'node.js'],
            preconditions: [
                'Customer exists with full data set',
                'GDPR deletion endpoint available',
                'Background cleanup jobs configured',
                'Third-party integrations present'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Verify customer data exists before deletion',
                    action: 'db_query',
                    selector: 'SELECT COUNT(*) FROM customers WHERE id = ?',
                    value: 'customer_gdpr_test',
                    expected: 'Customer exists in database'
                },
                {
                    id: '2',
                    description: 'Trigger GDPR deletion',
                    action: 'api_call',
                    selector: 'DELETE /customers/customer_gdpr_test',
                    value: JSON.stringify({
                        reason: 'gdpr_request',
                        confirmed: true
                    }),
                    expected: 'Deletion request accepted (202 status)'
                },
                {
                    id: '3',
                    description: 'Check orders are anonymized (not deleted)',
                    action: 'db_query',
                    selector: 'SELECT customer_data FROM orders WHERE customer_id = ?',
                    value: 'customer_gdpr_test',
                    expected: 'Customer data anonymized or removed from orders'
                },
                {
                    id: '4',
                    description: 'Check logs are cleaned',
                    action: 'log_check',
                    selector: 'application_logs',
                    value: 'customer_gdpr_test',
                    expected: 'PII removed from logs, no customer identifiers remain'
                },
                {
                    id: '5',
                    description: 'Check analytics data is anonymized',
                    action: 'db_query',
                    selector: 'SELECT user_id FROM analytics_events WHERE user_id = ?',
                    value: 'customer_gdpr_test',
                    expected: 'No analytics events with customer ID'
                },
                {
                    id: '6',
                    description: 'Wait for async cleanup jobs',
                    action: 'wait',
                    selector: '30000ms',
                    expected: 'Background cleanup processes complete'
                },
                {
                    id: '7',
                    description: 'Verify third-party deletion triggered',
                    action: 'external_api_check',
                    selector: 'analytics_service',
                    value: 'user_deleted:customer_gdpr_test',
                    expected: 'Third-party services notified of deletion'
                },
                {
                    id: '8',
                    description: 'Final verification - customer completely removed',
                    action: 'db_query',
                    selector: 'SELECT * FROM customers WHERE id = ?',
                    value: 'customer_gdpr_test',
                    expected: 'No customer record exists'
                }
            ],
            expectedResult: 'PII removed or anonymized, no PII in logs, third-party deletion triggered. Node.js async cleanup jobs execute properly.',
            istqbTechnique: 'compliance_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }

    /**
     * BE-OBS-010: Observability Safety
     */
    private generateObservabilityTests(): TestCase[] {
        return [{
            id: 'BE-OBS-010',
            name: 'Observability Safety',
            description: 'Ensure logs and telemetry don\'t leak sensitive data',
            category: 'backend_observability',
            priority: 'medium',
            automationLevel: 'full',
            tags: ['observability', 'logging', 'privacy', 'security', 'node.js'],
            preconditions: [
                'Logging and monitoring enabled',
                'PII filtering configured',
                'Error scenarios can be triggered'
            ],
            steps: [
                {
                    id: '1',
                    description: 'Trigger runtime exception with sensitive data',
                    action: 'api_call',
                    selector: 'POST /test/error-trigger',
                    value: JSON.stringify({
                        creditCard: '4111111111111111',
                        ssn: '123-45-6789',
                        password: 'secret123',
                        apiKey: 'sk_live_abcd123456789'
                    }),
                    expected: 'Service throws runtime exception'
                },
                {
                    id: '2',
                    description: 'Check application logs for PII leakage',
                    action: 'log_check',
                    selector: 'application_logs',
                    value: '4111111111111111|123-45-6789|secret123|sk_live_abcd123456789',
                    expected: 'No sensitive data appears in logs'
                },
                {
                    id: '3',
                    description: 'Check error stack traces',
                    action: 'log_check',
                    selector: 'error_logs',
                    value: 'creditCard|ssn|password|apiKey',
                    expected: 'Stack traces don\'t contain sensitive parameter names or values'
                },
                {
                    id: '4',
                    description: 'Check telemetry/metrics payloads',
                    action: 'telemetry_check',
                    selector: 'metrics_exporter',
                    value: 'sensitive_data_patterns',
                    expected: 'Telemetry payloads are sanitized'
                },
                {
                    id: '5',
                    description: 'Verify error alerting works',
                    action: 'alert_check',
                    selector: 'error_monitoring',
                    value: 'runtime_exception_alert',
                    expected: 'Alert triggered without exposing sensitive data'
                },
                {
                    id: '6',
                    description: 'Test structured logging sanitization',
                    action: 'log_check',
                    selector: 'structured_logs',
                    value: 'json_payload_sanitization',
                    expected: 'JSON log entries have sensitive fields masked or removed'
                }
            ],
            expectedResult: 'Error logged, no PII in logs, alert triggered without sensitive data. Node.js stack traces don\'t leak customer data.',
            istqbTechnique: 'security_testing',
            status: 'pending',
            createdAt: new Date()
        }];
    }
}
