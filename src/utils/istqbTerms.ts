/**
 * ISTQB Testing Terminology and Standards
 * Based on ISTQB Glossary and CTFL Syllabus
 */

export const ISTQBGlossary = {
    // Test Levels
    testLevels: {
        unit: {
            name: 'Unit Testing',
            description: 'Testing of individual software components',
            alsoCalled: ['Component Testing', 'Module Testing']
        },
        integration: {
            name: 'Integration Testing',
            description: 'Testing performed to expose defects in interfaces and interactions',
            types: ['Component Integration', 'System Integration']
        },
        system: {
            name: 'System Testing',
            description: 'Testing of a complete integrated system',
            focus: ['Functional requirements', 'Non-functional requirements']
        },
        acceptance: {
            name: 'Acceptance Testing',
            description: 'Formal testing to determine system acceptability',
            types: ['User Acceptance', 'Operational Acceptance', 'Contract Acceptance', 'Regulatory Acceptance']
        }
    },

    // Test Types
    testTypes: {
        functional: {
            name: 'Functional Testing',
            description: 'Testing based on analysis of functional specifications',
            techniques: ['Equivalence Partitioning', 'Boundary Value Analysis', 'Decision Tables']
        },
        nonFunctional: {
            name: 'Non-Functional Testing',
            description: 'Testing attributes other than functional requirements',
            includes: ['Performance', 'Usability', 'Security', 'Reliability']
        },
        structural: {
            name: 'Structural Testing',
            description: 'Testing based on system structure/implementation',
            alsoCalled: ['White-box Testing', 'Glass-box Testing']
        },
        changeRelated: {
            name: 'Change-Related Testing',
            description: 'Testing after changes to the system',
            includes: ['Confirmation Testing', 'Regression Testing']
        }
    },

    // Test Design Techniques
    techniques: {
        equivalencePartitioning: {
            name: 'Equivalence Partitioning',
            abbreviation: 'EP',
            description: 'Dividing input domain into classes expected to exhibit similar behavior',
            application: 'Reduce number of test cases while maintaining coverage'
        },
        boundaryValueAnalysis: {
            name: 'Boundary Value Analysis',
            abbreviation: 'BVA',
            description: 'Testing at boundaries between equivalence partitions',
            application: 'Defects often occur at boundaries'
        },
        decisionTable: {
            name: 'Decision Table Testing',
            description: 'Testing combinations of conditions and resulting actions',
            application: 'Complex business rules with multiple conditions'
        },
        stateTransition: {
            name: 'State Transition Testing',
            description: 'Testing state changes based on events/inputs',
            application: 'Systems with distinct states and transitions'
        },
        useCase: {
            name: 'Use Case Testing',
            description: 'Testing based on use case scenarios',
            application: 'Business process flows and user interactions'
        }
    },

    // Testing Approaches
    approaches: {
        smoke: {
            name: 'Smoke Testing',
            description: 'Subset of tests covering critical functionality',
            purpose: 'Verify build stability before further testing',
            alsoCalled: ['Build Verification Test', 'Confidence Testing']
        },
        regression: {
            name: 'Regression Testing',
            description: 'Testing to verify changes have not broken existing functionality',
            trigger: 'Code changes, bug fixes, new features'
        },
        sanity: {
            name: 'Sanity Testing',
            description: 'Focused testing after minor changes',
            scope: 'Limited to affected areas'
        },
        exploratory: {
            name: 'Exploratory Testing',
            description: 'Simultaneous test design and execution',
            approach: 'Learning, test design, and execution in parallel'
        },
        adhoc: {
            name: 'Ad-hoc Testing',
            description: 'Informal testing without formal test cases',
            purpose: 'Find defects through intuition and experience'
        }
    },

    // Quality Characteristics (ISO 25010)
    qualityCharacteristics: {
        functionalSuitability: {
            name: 'Functional Suitability',
            subcharacteristics: ['Completeness', 'Correctness', 'Appropriateness']
        },
        performanceEfficiency: {
            name: 'Performance Efficiency',
            subcharacteristics: ['Time Behavior', 'Resource Utilization', 'Capacity']
        },
        compatibility: {
            name: 'Compatibility',
            subcharacteristics: ['Co-existence', 'Interoperability']
        },
        usability: {
            name: 'Usability',
            subcharacteristics: ['Learnability', 'Operability', 'User Error Protection', 'Accessibility']
        },
        reliability: {
            name: 'Reliability',
            subcharacteristics: ['Maturity', 'Availability', 'Fault Tolerance', 'Recoverability']
        },
        security: {
            name: 'Security',
            subcharacteristics: ['Confidentiality', 'Integrity', 'Non-repudiation', 'Accountability', 'Authenticity']
        },
        maintainability: {
            name: 'Maintainability',
            subcharacteristics: ['Modularity', 'Reusability', 'Analyzability', 'Modifiability', 'Testability']
        },
        portability: {
            name: 'Portability',
            subcharacteristics: ['Adaptability', 'Installability', 'Replaceability']
        }
    },

    // Test Statuses
    testStatuses: {
        pass: {
            name: 'Pass',
            description: 'Test executed and met expected results'
        },
        fail: {
            name: 'Fail',
            description: 'Test executed but did not meet expected results'
        },
        blocked: {
            name: 'Blocked',
            description: 'Test cannot be executed due to precondition failure'
        },
        notRun: {
            name: 'Not Run',
            description: 'Test has not been executed'
        },
        skipped: {
            name: 'Skipped',
            description: 'Test intentionally not executed'
        },
        inProgress: {
            name: 'In Progress',
            description: 'Test is currently being executed'
        }
    },

    // Defect Severity Levels
    severityLevels: {
        critical: {
            level: 1,
            name: 'Critical',
            description: 'System crash, data loss, security breach'
        },
        major: {
            level: 2,
            name: 'Major',
            description: 'Major feature not working, no workaround'
        },
        moderate: {
            level: 3,
            name: 'Moderate',
            description: 'Feature not working but workaround exists'
        },
        minor: {
            level: 4,
            name: 'Minor',
            description: 'Cosmetic issues, minor inconveniences'
        },
        trivial: {
            level: 5,
            name: 'Trivial',
            description: 'Spelling errors, formatting issues'
        }
    },

    // Test Case Components
    testCaseComponents: [
        'Test Case ID',
        'Test Case Name',
        'Objective',
        'Preconditions',
        'Test Steps',
        'Test Data',
        'Expected Results',
        'Actual Results',
        'Status',
        'Priority',
        'Comments'
    ],

    // Test Report Components
    reportComponents: [
        'Executive Summary',
        'Test Scope',
        'Test Approach',
        'Test Environment',
        'Test Results Summary',
        'Defect Summary',
        'Test Coverage',
        'Risk Assessment',
        'Recommendations',
        'Appendices'
    ]
};

/**
 * Test priority definitions
 */
export const TestPriorities = {
    critical: {
        level: 1,
        description: 'Must be tested in every test cycle',
        examples: ['Core functionality', 'Security features', 'Payment processing']
    },
    high: {
        level: 2,
        description: 'Should be tested in most test cycles',
        examples: ['Primary user flows', 'Key business rules']
    },
    medium: {
        level: 3,
        description: 'Tested when time permits',
        examples: ['Secondary features', 'Edge cases']
    },
    low: {
        level: 4,
        description: 'Tested occasionally or for specific releases',
        examples: ['Cosmetic features', 'Rare scenarios']
    }
};

/**
 * Risk-based testing priorities
 */
export const RiskBasedTesting = {
    riskFactors: [
        'Business criticality',
        'Usage frequency',
        'Complexity',
        'Historical defect density',
        'Change frequency',
        'Dependencies',
        'Technical risk'
    ],
    prioritization: [
        { risk: 'High', probability: 'High', priority: 'Critical' },
        { risk: 'High', probability: 'Medium', priority: 'High' },
        { risk: 'High', probability: 'Low', priority: 'Medium' },
        { risk: 'Medium', probability: 'High', priority: 'High' },
        { risk: 'Medium', probability: 'Medium', priority: 'Medium' },
        { risk: 'Medium', probability: 'Low', priority: 'Low' },
        { risk: 'Low', probability: 'High', priority: 'Medium' },
        { risk: 'Low', probability: 'Medium', priority: 'Low' },
        { risk: 'Low', probability: 'Low', priority: 'Low' }
    ]
};

