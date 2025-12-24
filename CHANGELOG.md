# Change Log

All notable changes to the "TestFox" extension will be documented in this file.

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
