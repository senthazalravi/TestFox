import * as assert from 'assert';
import * as vscode from 'vscode';

suite('TestFox Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('testfox.testfox'));
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        assert.ok(commands.includes('testfox.analyze'));
        assert.ok(commands.includes('testfox.generateTests'));
        assert.ok(commands.includes('testfox.runAll'));
        assert.ok(commands.includes('testfox.runCategory'));
        assert.ok(commands.includes('testfox.openDashboard'));
        assert.ok(commands.includes('testfox.exportReport'));
        assert.ok(commands.includes('testfox.markManual'));
    });

    test('Extension should activate', async function() {
        this.timeout(10000);
        
        const ext = vscode.extensions.getExtension('testfox.testfox');
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive);
        }
    });
});

