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
        return [{
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
        }];
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
