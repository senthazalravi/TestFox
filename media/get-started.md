# Getting Started

A quick walkthrough of the core workflow: generate tests, run them, and review results.

---

## The TestFox sidebar

Open the TestFox icon in the Activity Bar. The sidebar has three sections:

1. **Actions** -- Quick actions (Analyze, Generate, Run) and MCP tool access.
2. **Test Explorer** -- Browse generated test cases organized by category.
3. **Test Runs** -- History of past executions with status and links to reports.

---

## Workflow

### 1. Generate tests

In the Actions panel, click **Generate Tests** (or run `TestFox: Generate Tests` from the command palette). TestFox analyzes your project and produces tests across 30+ categories.

If you have not analyzed the project yet, TestFox will run analysis first automatically.

### 2. Run tests

Click **Run** on any test or group in the Test Explorer, or use the **Run All** action in the Actions panel. Tests execute in the background -- you can keep working while they run.

### 3. View the report

When a run completes, it appears in the **Test Runs** section. Click on a run to open its full report, which includes:

- Summary with pass/fail counts.
- Individual test results with details.
- Screenshots and logs for failures.
- Defect entries with categorized IDs.

---

## Common actions

| Action | Where to find it |
|--------|-----------------|
| Analyze project | Actions panel or command palette |
| Generate tests | Actions panel or command palette |
| Run all tests | Actions panel or Test Explorer |
| Run a single category | Right-click a category in Test Explorer |
| View a past report | Click a run in Test Runs |
| Configure AI | Command palette: `TestFox: Configure AI` |
| Access MCP tools | Actions panel (MCP tools section) |

---

## Tips

- **Start without AI** to see what rule-based generation produces, then enable AI to compare.
- **Use the Test Explorer** to run individual categories when you are focused on a specific area (e.g., security or performance).
- **Check Test Runs history** to track improvements across runs over time.
- **Swagger users**: drop your spec file in the project root and regenerate tests -- TestFox picks it up automatically.

---

## Need help?

- Documentation: [testfox.dev/docs](https://testfox.dev/docs)
- Issues: [GitHub Issues](https://github.com/nicetestfox/testfox/issues)
- Support: [support@testfox.dev](mailto:support@testfox.dev)
