/**
 * MCP Control Panel JavaScript
 * Interactive functionality for TestFox MCP automation
 */

(function() {
    const vscode = acquireVsCodeApi();
    
    // State management
    let isGenerating = false;
    let currentGeneration = null;
    
    // DOM elements
    const elements = {
        status: null,
        cards: null,
        buttons: null
    };
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        elements.status = document.getElementById('ai-status');
        elements.cards = document.querySelectorAll('.mcp-card');
        elements.buttons = document.querySelectorAll('.mcp-button, .quick-button');
        
        console.log('🦊 TestFox MCP Control initialized');
    });
    
    // Main functions
    window.generateMCP = function(type) {
        if (isGenerating) {
            vscode.postMessage({
                command: 'showWarning',
                message: 'Already generating tests. Please wait for completion.'
            });
            return;
        }
        
        isGenerating = true;
        currentGeneration = type;
        
        // Update UI
        updateUIForGeneration(type);
        
        // Send command to extension
        vscode.postMessage({
            command: 'generateMCP',
            type: type
        });
        
        console.log(`🚀 Starting ${type} test generation`);
    };
    
    window.generateAll = function() {
        if (isGenerating) {
            vscode.postMessage({
                command: 'showWarning',
                message: 'Already generating tests. Please wait for completion.'
            });
            return;
        }
        
        isGenerating = true;
        currentGeneration = 'all';
        
        updateUIForGeneration('all');
        
        vscode.postMessage({
            command: 'generateAll'
        });
        
        console.log('🚀 Starting all test types generation');
    };
    
    window.quickGenerate = function() {
        if (isGenerating) {
            vscode.postMessage({
                command: 'showWarning',
                message: 'Already generating tests. Please wait for completion.'
            });
            return;
        }
        
        // Show quick pick menu
        vscode.postMessage({
            command: 'quickGenerate'
        });
        
        console.log('⚡ Opening quick generate menu');
    };
    
    window.openSettings = function() {
        vscode.postMessage({
            command: 'openSettings'
        });
        
        console.log('⚙️ Opening settings');
    };
    
    // UI update functions
    function updateUIForGeneration(type) {
        // Update status message
        if (elements.status) {
            if (type === 'all') {
                elements.status.textContent = '🔄 Generating all test types (Playwright, Postman, DevTools)...';
            } else {
                elements.status.textContent = `🔄 Generating ${type.toUpperCase()} tests...`;
            }
        }
        
        // Disable all cards and buttons
        if (elements.cards) {
            elements.cards.forEach(card => {
                card.style.opacity = '0.5';
                card.style.pointerEvents = 'none';
                card.classList.add('mcp-loading');
            });
        }
        
        if (elements.buttons) {
            elements.buttons.forEach(button => {
                button.disabled = true;
                button.style.opacity = '0.6';
            });
        }
    }
    
    function resetUIAfterGeneration() {
        isGenerating = false;
        currentGeneration = null;
        
        // Reset status
        if (elements.status) {
            elements.status.textContent = '✅ Ready to generate tests. Click any MCP server above to begin.';
        }
        
        // Re-enable all cards and buttons
        if (elements.cards) {
            elements.cards.forEach(card => {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
                card.classList.remove('mcp-loading');
            });
        }
        
        if (elements.buttons) {
            elements.buttons.forEach(button => {
                button.disabled = false;
                button.style.opacity = '1';
            });
        }
        
        console.log('✅ UI reset after generation');
    }
    
    // Message handling from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateStatus':
                updateStatus(message.text, message.type);
                break;
                
            case 'generationComplete':
                handleGenerationComplete(message);
                break;
                
            case 'generationError':
                handleGenerationError(message);
                break;
                
            case 'generationProgress':
                updateProgress(message.progress, message.message);
                break;
        }
    });
    
    function updateStatus(text, type = null) {
        if (elements.status) {
            elements.status.textContent = text;
            
            // Add visual indicator based on type
            elements.status.className = '';
            if (type) {
                elements.status.classList.add(`status-${type}`);
            }
        }
    }
    
    function updateProgress(progress, message) {
        if (elements.status) {
            elements.status.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 200px; height: 6px; background: var(--vscode-progressBar-background); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${progress}%; height: 100%; background: var(--vscode-progressBar-foreground); transition: width 0.3s ease;"></div>
                    </div>
                    <span>${message}</span>
                </div>
            `;
        }
    }
    
    function handleGenerationComplete(data) {
        resetUIAfterGeneration();
        
        // Show success message
        if (elements.status) {
            elements.status.innerHTML = `
                <div style="color: var(--vscode-testing-iconPassed); font-weight: bold; margin-bottom: 10px;">
                    ✅ ${data.type ? data.type.toUpperCase() : 'Tests'} generated successfully!
                </div>
                <div>
                    ${data.files ? data.files.map(file => `• ${file}`).join('<br>') : ''}
                </div>
            `;
        }
        
        // Show notification option
        vscode.postMessage({
            command: 'showSuccess',
            message: `${data.type ? data.type.toUpperCase() : 'Tests'} generated successfully!`,
            files: data.files || []
        });
        
        console.log('✅ Generation complete:', data);
    }
    
    function handleGenerationError(data) {
        resetUIAfterGeneration();
        
        // Show error message
        if (elements.status) {
            elements.status.innerHTML = `
                <div style="color: var(--vscode-testing-iconFailed); font-weight: bold; margin-bottom: 10px;">
                    ❌ Generation failed
                </div>
                <div style="color: var(--vscode-errorForeground);">
                    ${data.error || 'Unknown error occurred'}
                </div>
            `;
        }
        
        console.error('❌ Generation error:', data);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + 1: Playwright
        if ((event.ctrlKey || event.metaKey) && event.key === '1') {
            event.preventDefault();
            generateMCP('playwright');
        }
        
        // Ctrl/Cmd + 2: Postman
        if ((event.ctrlKey || event.metaKey) && event.key === '2') {
            event.preventDefault();
            generateMCP('postman');
        }
        
        // Ctrl/Cmd + 3: DevTools
        if ((event.ctrlKey || event.metaKey) && event.key === '3') {
            event.preventDefault();
            generateMCP('devtools');
        }
        
        // Ctrl/Cmd + A: Generate All
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            generateAll();
        }
        
        // Ctrl/Cmd + Q: Quick Generate
        if ((event.ctrlKey || event.metaKey) && event.key === 'q') {
            event.preventDefault();
            quickGenerate();
        }
    });
    
    // Add keyboard shortcuts hint
    function addKeyboardShortcuts() {
        const shortcuts = [
            { key: 'Ctrl+1', action: 'Generate Playwright Tests' },
            { key: 'Ctrl+2', action: 'Generate Postman Tests' },
            { key: 'Ctrl+3', action: 'Generate DevTools Tests' },
            { key: 'Ctrl+A', action: 'Generate All Tests' },
            { key: 'Ctrl+Q', action: 'Quick Generate Menu' }
        ];
        
        const shortcutsHtml = shortcuts.map(shortcut => 
            `<div style="display: flex; justify-content: space-between; margin: 5px 0; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 4px;">
                <span style="color: var(--vscode-foreground); font-weight: 600;">${shortcut.key}</span>
                <span style="color: var(--vscode-descriptionForeground);">${shortcut.action}</span>
            </div>`
        ).join('');
        
        // Add shortcuts section to status
        if (elements.status && !isGenerating) {
            const shortcutsSection = document.createElement('div');
            shortcutsSection.innerHTML = `
                <h4 style="margin: 20px 0 10px 0; color: var(--vscode-foreground);">⌨️ Keyboard Shortcuts</h4>
                ${shortcutsHtml}
            `;
            
            elements.status.appendChild(shortcutsSection);
        }
    }
    
    // Initialize keyboard shortcuts
    setTimeout(addKeyboardShortcuts, 1000);
    
})();
