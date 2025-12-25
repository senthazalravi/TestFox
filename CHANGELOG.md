# Change Log

All notable changes to the "TestFox" extension will be documented in this file.

## [0.4.9] - 2024-12-25

### Fixed
- **Application Availability Checks** 🔍
  - Added automatic application availability detection before running tests
  - Prevents test failures when application is not running
  - Automatically checks common ports (3000, 8080, 4200, 5000, 8000, 4000, 5173)
  - Provides clear feedback when no application is detected

- **Enhanced User Experience** 🎯
  - Status bar now shows application status (port number or "Off")
  - Color-coded status bar (green=running, yellow=warning, red=error)
  - "Check Application Status" command for manual status verification
  - Automatic application startup prompts when needed

### Improved Features:
- **Smart Test Prevention**: Tests won't run if application is not available
- **Visual Status Indicators**: Status bar shows real-time application status
- **Better Error Messages**: Clear guidance when applications are not running
- **Automatic Port Detection**: Scans multiple common development ports
- **Startup Integration**: Checks application status during test generation

### Technical Improvements:
- **Proactive Error Prevention**: Checks application health before test execution
- **User-Friendly Feedback**: Provides actionable next steps when issues occur
- **Background Status Monitoring**: Continuous application availability checking

## [0.4.7] - 2024-12-25

### Fixed
- **Test Generation Errors** 🐛
  - Fixed "Cannot read properties of undefined (reading 'length')" error
  - Improved analysis result validation in TestGeneratorManager
  - Added fallback handling for missing or malformed analysis data

- **AI Model Availability** 🤖
  - Fixed AI errors when models are not available on OpenRouter
  - Added multiple fallback models for better reliability
  - Improved error handling to fall back to rule-based generation
  - Changed default fallback model to more reliable option

- **Extension Stability** 🛡️
  - Better error handling throughout test generation pipeline
  - Extension continues working even when individual components fail

- **Auto-Initialization** 🔄
  - Better error handling for dependency installation and project analysis
  - Extension continues to work even if auto-analysis fails
  - Clear error messages for troubleshooting

## [0.4.5] - 2024-12-25

### Fixed
- **Extension Loading Issue** 🐛
  - Fixed "Cannot find module 'express'" error preventing extension activation
  - Corrected esbuild configuration to properly bundle express and socket.io dependencies
  - Extension now loads and activates correctly after installation

## [0.4.4] - 2024-12-25

### Added
- **Automatic Port Detection** 🔍
  - TestFox now automatically detects running applications on any port (3000, 8080, 4200, 5000, 8000, etc.)
  - No more hardcoded localhost:3000 assumptions - works with Vue (8080), Angular (4200), Django (8000), etc.
  - Scans multiple common development ports to find your running application
  - Extracts actual port from application startup logs (localhost:8080, 127.0.0.1:3001, etc.)
  - If no application is running, TestFox starts it and detects the actual port it binds to

### Fixed
- **Port Detection Issues** 🐛
  - Fixed smoke tests failing when applications run on ports other than 3000
  - Applications now correctly detected regardless of configured vs actual running port
  - Improved application startup detection and URL resolution

## [0.4.3] - 2024-12-25

### Added
- **Generate Tests by Category** 🎯
  - Right-click any test category in the Test Explorer to generate tests specifically for that category
  - Individual category generation for all 18+ test categories (Smoke, Functional, API, Security, Performance, etc.)
  - Faster, more focused test generation - generate only what you need
  - Better performance and resource usage when you only need specific test types
  - Context menu integration with intuitive "Generate Tests" icon

- **UI Test Generator** 🖥️
  - Comprehensive UI testing framework with viewport/responsive tests
  - Interactive element testing (buttons, links, forms, dropdowns)
  - Visual layout and consistency verification
  - Accessibility testing for keyboard navigation and screen readers
  - Automated UI validation across desktop, tablet, and mobile viewports

### Fixed
- **Bug Fixes** 🐛
  - Fixed TypeError when accessing undefined properties during test generation
  - Added defensive programming to prevent crashes from malformed analysis results
  - Improved error handling in all test generators

## [0.4.1] - 2024-12-24

### Added
- **Welcome Screen & Walkthrough** 🎉
  - Interactive welcome experience for new users
  - Step-by-step setup guide with visual walkthrough
  - Feature overview with detailed explanations
  - Getting started guide with best practices
  - Terms of service and privacy policy acceptance
  - Beautiful design with TestFox branding and logo

- **Enhanced User Onboarding**
  - Guided walkthrough for first-time users
  - Clear explanation of TestFox capabilities
  - Easy setup instructions for AI and browser configuration
  - Feature highlights with practical examples
  - Pro tips for optimal testing results

---

## [0.4.0] - 2024-12-24

### Added
- **External Browser Dashboard** 🌐
  - Web server serving TestFox dashboard at `http://localhost:8080`
  - Real-time WebSocket communication between browser and VS Code extension
  - Full control panel in browser to execute TestFox commands remotely
  - Live activity log showing real-time test execution updates
  - Same charts and data as VS Code dashboard but accessible externally

- **Browser Control Panel** 🎮
  - Execute all TestFox commands directly from browser:
    - Analyze Project
    - Generate Tests
    - Run All Tests
    - Run Full Cycle Testing
    - Stop Application
    - Export Report
    - Clear Data
  - Real-time command execution feedback
  - Live log updates during test execution

- **Real-Time Dashboard Updates** 🔄
  - Live synchronization between VS Code extension and browser dashboard
  - Automatic data refresh when tests complete
  - Real-time defect tracking updates
  - Live test execution progress

- **Enhanced User Experience** ✨
  - "View Dashboard in Browser" command and button
  - Automatic port selection (starts from 8080, finds available port)
  - Connection status indicators in browser dashboard
  - Seamless switching between VS Code and browser interfaces

### Commands
- `TestFox: View Dashboard in Browser` - Opens external dashboard in default browser

---

## [0.3.8] - 2024-12-24

### Added
- **Defect ID Auto-Generation** 🆔
  - Meaningful defect IDs based on category (e.g., UI-0001, API-0002, SEC-0003)
  - Prefixes: SMK (Smoke), SAN (Sanity), REG (Regression), FUN (Functional),
    API, UI, E2E, INT, DB, SEC, PRF (Performance), LOD (Load), STR (Stress),
    ACC (Accessibility), NEG (Negative), BND (Boundary), MNK (Monkey),
    EXP (Exploratory), USA (Usability), UAT (Acceptance), CMP (Compatibility),
    CON (Console), NET (Network), ACC (Account Management)
  - 4-digit sequential numbering per category

- **Automatic Test Account Creation & Management** 👤
  - Creates test accounts on-the-fly for different testing types
  - Generates accounts for: admin, user, guest, moderator, tester roles
  - Specialized accounts for: functional, UI, security, performance, accessibility testing
  - Automatic account cleanup after testing completion
  - Tracks account creation/deletion attempts and success rates
  - Displays created accounts in test results and dashboard

- **Comprehensive Account Management Testing** 🔐
  - Account Creation Tests: admin/user registration, form validation, duplicate prevention
  - Account Deletion Tests: self-deletion, admin deletion, confirmation requirements
  - Account Update Tests: profile updates, password changes
  - Account Security Tests: session management, inactive account handling
  - 12 new test cases covering complete account lifecycle

- **Test Run History Tracking** 📊
  - Every test run is numbered and tracked
  - Complete history of all runs with pass/fail counts
  - Duration and category breakdown per run
  - New defects and fixed defects per run

- **Defect Dashboard** 🐛
  - Interactive webview with 4 tabs: Overview, Defects, Test Runs, Trends
  - All defects listed in table with status, severity, first found, fixed info
  - Test run history table with all statistics
  - Open/Fixed/Reopened status tracking

- **Automatic Defect Status Updates** ✅
  - Failed tests automatically create defects with unique IDs
  - When a previously failed test passes, defect is auto-marked as "Fixed"
  - Reopened defects when fixed tests fail again
  - Full defect history with run numbers

- **Improvement Charts** 📈
  - Pass Rate Trend (last 10 runs)
  - Open Defects Trend
  - Fixed Defects per Run
  - Defects by Severity (pie chart)
  - Defects by Category (bar chart)

- **Run Summary Messages**
  - Shows run number, pass rate, new defects, fixed defects
  - Prompts to view Defect Dashboard when new defects found

### Commands
- `TestFox: Open Defect Dashboard` - View all defects, runs, and trends

---

## [0.3.7] - 2024-12-24

### Added
- **Browser Console Log Testing** 🖥️
  - Real-time console monitoring during browser tests
  - Captures errors, warnings, info, and debug logs
  - Detects JavaScript errors
  - Detects unhandled promise rejections
  - Detects framework-specific warnings (React, Vue, Angular)
  - Detects deprecation warnings
  - Detects security warnings (CORS, CSP, mixed content)
  - 8 dedicated console log test cases

- **Browser Network Log Testing** 🌐
  - Real-time network request monitoring
  - Captures all HTTP requests and responses
  - Detects failed API calls (4xx, 5xx)
  - Detects slow requests (>3s)
  - Detects CORS errors
  - Detects large response payloads (>1MB)
  - Detects insecure (HTTP) requests
  - Measures response times and data transferred
  - 12 dedicated network log test cases

- **New Test Category Group: Browser Monitoring**
  - Console Log Tests
  - Network Log Tests
  - Visual reports with detailed breakdowns

- **Full Cycle Testing Integration**
  - Console log tests run automatically in Step 9
  - Network log tests run automatically in Step 10
  - Results included in final summary
  - Pass/fail status for both test types

### Changed
- SmartBrowserRunner now integrates BrowserMonitor
- Full cycle summary includes console/network results

---

## [0.3.6] - 2024-12-24

### Added
- **New Free AI Models** 🤖
  - Google Gemini 2.0 Flash (FREE) ⭐ - Default model
  - DeepSeek R1 (FREE) - Advanced reasoning
  - Qwen3 Coder (FREE) 💻 - Code-specialized
  - NVIDIA Nemotron 3 Nano (FREE)
  - Mistral Devstral (FREE) 💻 - Developer model
  - Zhipu GLM 4.5 Air (FREE)

- **Database Test Generator** 🗄️
  - Auto-discovers database connections from:
    - `.env` files (DATABASE_URL, MONGO_URI, etc.)
    - Prisma schema
    - Docker Compose files
    - Knex, TypeORM, Sequelize, Drizzle configs
  - Generates comprehensive database tests:
    - CRUD operations (Create, Read, Update, Delete)
    - Transaction testing (commit/rollback)
    - SQL injection prevention
    - Connection pooling
    - Data integrity constraints
    - Cascade operations

- **AI-Powered E2E Test Generator** 🧪
  - Analyzes entire application with AI to understand:
    - User journeys and flows
    - Form interactions and validation
    - Navigation patterns
    - Authentication flows
  - Generates intelligent test scenarios:
    - User journey tests (registration, onboarding)
    - Form validation tests (boundary, security)
    - Navigation tests (deep linking, back button)
    - Auth tests (login, logout, session)
    - Error handling tests (404, network)
    - Responsive tests (mobile, tablet, desktop)

### Changed
- Default AI model changed to free Gemini 2.0 Flash
- Free models are now shown first in settings
- Settings panel shows model type badges (Free ⭐, Code 💻)

---

## [0.3.5] - 2024-12-24

### Added
- **Cross-Browser Testing** 🌐
  - New `TestFox: Run Cross-Browser Tests` command
  - Tests on Chromium, Firefox, and WebKit (Safari)
  - Automatic installation of ALL browsers (not just Chromium)
  - Browser status indicator showing installed browsers

- **Device Emulation Testing** 📱
  - iPhone 14 Pro, iPhone 14, iPhone SE
  - Samsung Galaxy S21, Pixel 7
  - iPad Pro, iPad Mini, Galaxy Tab S8
  - Desktop Chrome, Firefox, Safari, Edge

- **Manual Test Handling** 👤
  - Real device testing marked as manual-only with instructions
  - Screen reader testing (VoiceOver, TalkBack, NVDA, JAWS)
  - Clear manual instructions in compatibility report
  - Visual indicators for automated vs manual tests

- **Compatibility Matrix Report**
  - Browser coverage overview
  - Device testing matrix
  - Pass/Fail status per browser/device combination
  - Exportable HTML report

- **New Commands**
  - `TestFox: Run Cross-Browser Tests` - Run tests on all browsers
  - `TestFox: Install All Browsers` - Install Chromium, Firefox, WebKit

### Changed
- Browser installation now offers "Install All Browsers" option
- Missing browser detection with prompt to install

---

## [0.3.4] - 2024-12-24

### Added
- **Settings Panel UI** ⚙️
  - New "TestFox: Open Settings" command
  - Settings button (gear icon) in the sidebar
  - Beautiful dark-themed settings webview
  - Visual AI model selector with free/paid badges
  - API key input with "Test Connection" button
  - All testing options configurable in one place
  - Save and Reset to Defaults buttons

### Changed
- Easier AI configuration through the Settings Panel
- Visual feedback when testing AI connection

---

## [0.3.3] - 2024-12-24

### Added
- **Click ALL Interactive Elements**
  - Clicks every button, link, label, and interactive element on each page
  - Navigates through all discovered pages systematically
  - Takes screenshots of each page state
  - Handles modals and dialogs automatically

- **Automatic Account Registration**
  - If login fails, automatically tries to create a new account
  - Fills registration forms with generated test data
  - Handles various registration form formats
  - Accepts terms & conditions checkboxes automatically

- **Comprehensive Input Interaction**
  - Interacts with ALL form inputs on each page
  - Selects dropdown options
  - Toggles checkboxes and radio buttons
  - Fills text fields with contextual test data
  - Moves range sliders

### Changed
- Removed button click limits - now tests ALL safe buttons
- More thorough page exploration
- Better error handling for navigation

---

## [0.3.2] - 2024-12-24

### Added
- **Full Cycle Testing** 🚀
  - New `TestFox: Run Full Cycle Testing` command
  - Automatic credential discovery from code, env files, and seed data
  - Auto-login with discovered credentials
  - Explores all pages and routes automatically
  - Tests forms with intelligent test data generation
  - Clicks buttons and interactive elements
  - Performs CRUD operations on data tables
  - Takes screenshots at key moments
  - Comprehensive summary report

### Fixed
- Fixed `runCategory` command error (`toLowerCase is not a function`)
- Category selection now properly handles tree item objects

### Changed
- Updated category picker with all 18 test categories
- Improved error handling for browser automation

---

## [0.3.1] - 2024-12-24

### Changed
- Updated fox icon with new colorful design for marketplace
- Improved sidebar icon visibility

---

## [0.3.0] - 2024-12-24

### Added
- **Industry-Aligned Test Categories (18 Types)**
  - Quick Validation: Smoke, Sanity, Regression
  - Functional: API, UI/E2E, Integration, Database
  - Non-Functional: Security, Performance, Load, Stress, Accessibility
  - Edge Cases: Negative, Boundary, Monkey/Fuzz
  - Manual/Exploratory: Exploratory, Usability, Acceptance, Compatibility
- **Interactive Web Report Viewer**
  - Beautiful dark-themed dashboard in VS Code webview
  - Tabbed interface: Summary, Categories, Security, Failed Tests
  - AI-generated executive summaries and risk assessment
  - Export to HTML for sharing
  - Print-friendly view
- **Enhanced AI Configuration**
  - Multiple provider support (OpenRouter, OpenAI, Anthropic)
  - Easy API key setup via command palette
  - Model selection with free options
- **Grouped Test Explorer**
  - Tests organized by category groups
  - Visual indicators for pass/fail status
  - Expandable hierarchy
- **New Command: Generate Web Report**
  - `TestFox: Generate Web Report` for interactive viewing

### Changed
- **Bundled Dependencies with esbuild**
  - Fixed "Cannot find module 'axios'" error
  - Faster extension loading
  - Smaller package size
- **Improved Sidebar Icon**
  - Proper monochrome SVG for VS Code theming
- **Enhanced Playwright Installation**
  - Better browser cache detection
  - Cross-platform support (Windows, macOS, Linux)
  - User-friendly installation prompts
- **Updated README**
  - Comprehensive SDLC integration diagram
  - Detailed test category descriptions
  - Author credit: @senthazalravi

### Fixed
- Extension activation error due to missing dependencies
- Sidebar icon not visible in some themes

---

## [0.2.0] - 2024-12-24

### Added
- **AI-Powered Test Generation** using OpenRouter (Grok/XAI)
  - Intelligent test case generation based on code analysis
  - AI-enhanced security test payloads
  - AI-generated report summaries and recommendations
- **Automatic Dependency Management**
  - Auto-detect and prompt to install Playwright
  - One-click installation with progress indicator
- **Auto-Detection on Activation**
  - Automatically analyze project when workspace opens
  - Show detected framework in welcome message
- **Status Bar Integration**
  - TestFox status indicator
  - AI model indicator (shows current model: Grok, etc.)
  - Real-time status updates (Ready, Running, Analyzing)
- **New Configuration Options**
  - `testfox.ai.enabled` - Enable/disable AI features
  - `testfox.ai.apiKey` - OpenRouter API key
  - `testfox.ai.model` - Choose AI model (Grok, Claude, GPT-4, Llama)
  - `testfox.autoAnalyze` - Auto-analyze on workspace open
  - `testfox.autoInstallDependencies` - Auto-install prompts
- **Free AI Model Support**
  - Works with free OpenRouter models as fallback
  - No LLM costs required for basic functionality

### Changed
- Improved sidebar icon (fox logo)
- Better error messages with actionable buttons
- Enhanced test explorer with real-time updates

---

## [0.1.0] - 2024-12-24

### Added
- Initial release of TestFox 🦊
- **Project Detection**: Auto-detect project type (Node.js, Python, Java, Go, .NET, PHP, Ruby)
- **Framework Support**: React, Vue, Angular, Next.js, Express, Django, Flask, Spring, and more
- **Test Categories**:
  - Smoke Tests - Critical path verification
  - Functional Tests - Form validation, authentication, navigation
  - API Tests - Endpoint testing with success/error handling
  - Security Tests - OWASP Top 10, SQL Injection, XSS, CSRF
  - Performance Tests - Response times and metrics
  - Load Tests - Concurrent user simulation
  - Edge Case Tests - Boundary values, special characters
  - Monkey Tests - Random input testing
  - Feature Tests - Manual business logic validation
- **ISTQB Techniques**: Boundary Value Analysis, Equivalence Partitioning, Decision Tables
- **Dashboard UI**: Real-time test execution with beautiful visualizations
- **Manual Test Support**: Track and record manual test results
- **Report Generation**: Comprehensive HTML/JSON reports with:
  - Executive summary
  - Category breakdown
  - Security findings
  - Performance metrics
  - Recommendations
- **Test Explorer**: Tree view with category organization
- **App Runner**: Automatic application startup using package.json scripts

### Security Features
  - SQL Injection detection
  - Cross-Site Scripting (XSS) testing
  - CSRF protection verification
  - Security headers validation
  - Sensitive data exposure checks
  - Authentication bypass testing

---

## [Unreleased]

### Planned
- AI-assisted test generation
- Test coverage integration
- CI/CD pipeline integration
- Custom test templates
- Test scheduling
- Team collaboration features
