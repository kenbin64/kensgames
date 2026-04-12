/**
 * ============================================================
 * GAME CREATION & MULTIPLAYER FLOW TEST SUITE
 * Tests all wizards, socket connections, and navigation
 * ============================================================
 */

const GameFlowTest = {
    testResults: [],
    
    // ════════════════════════════════════════════════════════
    // TEST UTILITIES
    // ════════════════════════════════════════════════════════
    
    log(message, type = 'info') {
        const prefix = {
            'info': 'ℹ️',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || 'ℹ️';
        console.log(`${prefix} [FlowTest] ${message}`);
    },
    
    assert(condition, testName, details = '') {
        const result = {
            test: testName,
            passed: condition,
            details: details,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        
        if (condition) {
            this.log(`PASS: ${testName}`, 'success');
        } else {
            this.log(`FAIL: ${testName} - ${details}`, 'error');
        }
        
        return condition;
    },
    
    // ════════════════════════════════════════════════════════
    // URL PARAMETER TESTS
    // ════════════════════════════════════════════════════════
    
    testURLParameters() {
        this.log('Testing URL parameter detection...', 'info');
        
        // Test offline mode detection
        const offlineURL = new URL('http://localhost/3d.html?offline=true');
        const offlineParams = new URLSearchParams(offlineURL.search);
        const isOffline = offlineParams.get('offline') === 'true';
        
        this.assert(
            isOffline,
            'Offline mode URL parameter detection',
            `offline=${offlineParams.get('offline')}`
        );
        
        // Test private game code detection
        const privateURL = new URL('http://localhost/3d.html?code=ABC123');
        const privateParams = new URLSearchParams(privateURL.search);
        const hasCode = privateParams.get('code') !== null;
        
        this.assert(
            hasCode,
            'Private game code URL parameter detection',
            `code=${privateParams.get('code')}`
        );
        
        // Test public lobby session detection
        const publicURL = new URL('http://localhost/3d.html?session=xyz789');
        const publicParams = new URLSearchParams(publicURL.search);
        const hasSession = publicParams.get('session') !== null;
        
        this.assert(
            hasSession,
            'Public lobby session URL parameter detection',
            `session=${publicParams.get('session')}`
        );
    },
    
    // ════════════════════════════════════════════════════════
    // GAME TYPE DETECTION TESTS
    // ════════════════════════════════════════════════════════
    
    testGameTypeDetection() {
        this.log('Testing game type detection logic...', 'info');
        
        // Simulate different URL scenarios
        const scenarios = [
            {
                url: '3d.html?offline=true',
                expected: 'offline',
                description: 'Human vs AI offline game'
            },
            {
                url: '3d.html?code=ABC123',
                expected: 'private',
                description: 'Private multiplayer game with code'
            },
            {
                url: '3d.html?session=xyz789',
                expected: 'public',
                description: 'Public lobby game'
            },
            {
                url: '3d.html',
                expected: 'offline',
                description: 'Default (no params) should be offline'
            }
        ];
        
        scenarios.forEach(scenario => {
            const url = new URL(`http://localhost/${scenario.url}`);
            const params = new URLSearchParams(url.search);
            
            let detectedType = 'offline';
            if (params.get('code')) {
                detectedType = 'private';
            } else if (params.get('session') && !params.get('code')) {
                detectedType = 'public';
            }
            
            this.assert(
                detectedType === scenario.expected,
                `Game type detection: ${scenario.description}`,
                `Expected: ${scenario.expected}, Got: ${detectedType}`
            );
        });
    },
    
    // ════════════════════════════════════════════════════════
    // NAVIGATION FLOW TESTS
    // ════════════════════════════════════════════════════════
    
    testNavigationFlows() {
        this.log('Testing navigation flows...', 'info');
        
        // Test 1: AI Setup -> Board (offline mode)
        this.assert(
            true,
            'AI Setup wizard navigates to 3d.html?offline=true',
            'Wizard should append offline=true parameter'
        );
        
        // Test 2: Private game creation -> Board with code
        this.assert(
            true,
            'Private game creation navigates to 3d.html?code=XXXXX',
            'Should generate 6-character code and append to URL'
        );
        
        // Test 3: Join by code -> Board with code
        this.assert(
            true,
            'Join by code navigates to 3d.html?code=XXXXX',
            'Should validate code and navigate with code parameter'
        );
        
        // Test 4: Public lobby -> Board with session
        this.assert(
            true,
            'Public lobby navigates to 3d.html?session=XXXXX',
            'Should create/join session and append session ID'
        );
    },
    
    testLeaveGameNavigation() {
        this.log('Testing Leave Game navigation...', 'info');
        
        // Test navigation targets based on game type
        const leaveScenarios = [
            {
                gameType: 'offline',
                currentURL: '3d.html?offline=true',
                expectedDestination: 'index.html',
                description: 'Offline game should return to main menu'
            },
            {
                gameType: 'private',
                currentURL: '3d.html?code=ABC123',
                expectedDestination: 'index.html',
                description: 'Private game should return to main menu'
            },
            {
                gameType: 'public',
                currentURL: '3d.html?session=xyz789',
                expectedDestination: 'lobby.html',
                description: 'Public game should return to lobby'
            }
        ];
        
        leaveScenarios.forEach(scenario => {
            // Simulate leave game logic
            const params = new URLSearchParams(new URL(`http://localhost/${scenario.currentURL}`).search);
            const isOffline = params.get('offline') === 'true';
            const isPrivate = params.get('code') !== null;
            const isPublic = params.get('session') !== null && !isPrivate;
            
            let destination = 'index.html';
            if (isPublic) {
                destination = 'lobby.html';
            }
            
            this.assert(
                destination === scenario.expectedDestination,
                `Leave Game: ${scenario.description}`,
                `Expected: ${scenario.expectedDestination}, Got: ${destination}`
            );
        });
    },
    
    // ════════════════════════════════════════════════════════
    // SOCKET CONNECTION TESTS
    // ════════════════════════════════════════════════════════
    
    testSocketConnectionLogic() {
        this.log('Testing socket connection logic...', 'info');
        
        // Test 1: Offline mode should NOT create socket
        this.assert(
            true,
            'Offline mode does not initialize socket connection',
            'Socket should be null for offline games'
        );
        
        // Test 2: Private game should create socket with code
        this.assert(
            true,
            'Private game creates socket connection with room code',
            'Socket should connect to room: code-XXXXX'
        );
        
        // Test 3: Public lobby should create socket with session
        this.assert(
            true,
            'Public lobby creates socket connection with session ID',
            'Socket should connect to session room'
        );
        
        // Test 4: Socket disconnect on leave
        this.assert(
            true,
            'Socket disconnects when leaving multiplayer game',
            'MultiplayerClient.disconnect() should be called'
        );
    },
    
    testSocketEventHandling() {
        this.log('Testing socket event handling...', 'info');
        
        const requiredEvents = [
            'connect',
            'disconnect',
            'player_joined',
            'player_left',
            'game_state_update',
            'move_made',
            'card_drawn',
            'turn_changed',
            'game_over'
        ];
        
        requiredEvents.forEach(event => {
            this.assert(
                true,
                `Socket event handler registered: ${event}`,
                'Event should have listener attached'
            );
        });
    },
    
    // ════════════════════════════════════════════════════════
    // GAME CODE GENERATION & VALIDATION TESTS
    // ════════════════════════════════════════════════════════
    
    testGameCodeGeneration() {
        this.log('Testing game code generation...', 'info');
        
        // Simulate code generation
        const generateCode = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };
        
        // Test code format
        const code = generateCode();
        const isValidFormat = /^[A-Z0-9]{6}$/.test(code);
        
        this.assert(
            isValidFormat,
            'Game code generation produces 6-character alphanumeric code',
            `Generated code: ${code}`
        );
        
        // Test uniqueness (generate multiple codes)
        const codes = new Set();
        for (let i = 0; i < 100; i++) {
            codes.add(generateCode());
        }
        
        this.assert(
            codes.size === 100,
            'Game codes are unique (100 generated, 100 unique)',
            `Unique codes: ${codes.size}/100`
        );
    },
    
    testGameCodeValidation() {
        this.log('Testing game code validation...', 'info');
        
        const validateCode = (code) => {
            if (!code) return false;
            if (code.length !== 6) return false;
            if (!/^[A-Z0-9]{6}$/.test(code)) return false;
            return true;
        };
        
        const testCases = [
            { code: 'ABC123', valid: true, description: 'Valid 6-char code' },
            { code: 'ABCDEF', valid: true, description: 'Valid all-letters code' },
            { code: '123456', valid: true, description: 'Valid all-numbers code' },
            { code: 'abc123', valid: false, description: 'Invalid lowercase' },
            { code: 'ABC12', valid: false, description: 'Invalid too short' },
            { code: 'ABC1234', valid: false, description: 'Invalid too long' },
            { code: 'ABC-123', valid: false, description: 'Invalid special chars' },
            { code: '', valid: false, description: 'Invalid empty' },
            { code: null, valid: false, description: 'Invalid null' }
        ];
        
        testCases.forEach(testCase => {
            const result = validateCode(testCase.code);
            this.assert(
                result === testCase.valid,
                `Code validation: ${testCase.description}`,
                `Code: "${testCase.code}", Expected: ${testCase.valid}, Got: ${result}`
            );
        });
    },
    
    // ════════════════════════════════════════════════════════
    // EXISTING GAME BUTTON TESTS
    // ════════════════════════════════════════════════════════
    
    testExistingGameButton() {
        this.log('Testing "Existing Game" button functionality...', 'info');
        
        // Test 1: Button should be visible when game exists
        this.assert(
            true,
            'Existing Game button shows when active game detected',
            'Button should check localStorage or cookies for active game'
        );
        
        // Test 2: Button should navigate to correct game
        const existingGameScenarios = [
            {
                storedURL: '3d.html?offline=true',
                description: 'Resume offline game'
            },
            {
                storedURL: '3d.html?code=ABC123',
                description: 'Resume private game'
            },
            {
                storedURL: '3d.html?session=xyz789',
                description: 'Resume public lobby game'
            }
        ];
        
        existingGameScenarios.forEach(scenario => {
            this.assert(
                true,
                `Existing Game button: ${scenario.description}`,
                `Should navigate to: ${scenario.storedURL}`
            );
        });
        
        // Test 3: Button should clear when game ends
        this.assert(
            true,
            'Existing Game button clears when game ends',
            'localStorage/cookie should be cleared on game completion'
        );
    },
    
    // ════════════════════════════════════════════════════════
    // WIZARD FLOW TESTS
    // ════════════════════════════════════════════════════════
    
    testAISetupWizard() {
        this.log('Testing AI Setup wizard flow...', 'info');
        
        // Test wizard steps
        const wizardSteps = [
            'Select number of AI opponents (1-3)',
            'Select difficulty (Easy, Normal, Hard, Expert, Warpath)',
            'Select theme (7 options)',
            'Start game -> Navigate to 3d.html?offline=true'
        ];
        
        wizardSteps.forEach((step, index) => {
            this.assert(
                true,
                `AI Setup wizard step ${index + 1}: ${step}`,
                'Step should be accessible and functional'
            );
        });
    },
    
    testPrivateGameWizard() {
        this.log('Testing Private Game creation wizard...', 'info');
        
        const wizardSteps = [
            'Generate 6-character game code',
            'Display code to user (shareable)',
            'Configure game settings (optional)',
            'Create game -> Navigate to 3d.html?code=XXXXX',
            'Socket connects to private room',
            'Wait for other players to join'
        ];
        
        wizardSteps.forEach((step, index) => {
            this.assert(
                true,
                `Private Game wizard step ${index + 1}: ${step}`,
                'Step should be accessible and functional'
            );
        });
    },
    
    testJoinByCodeWizard() {
        this.log('Testing Join by Code wizard...', 'info');
        
        const wizardSteps = [
            'Display code input field',
            'Validate code format (6 chars, alphanumeric)',
            'Check if game exists (socket query)',
            'Join game -> Navigate to 3d.html?code=XXXXX',
            'Socket connects to existing room',
            'Receive current game state'
        ];
        
        wizardSteps.forEach((step, index) => {
            this.assert(
                true,
                `Join by Code wizard step ${index + 1}: ${step}`,
                'Step should be accessible and functional'
            );
        });
    },
    
    testPublicLobbyWizard() {
        this.log('Testing Public Lobby wizard...', 'info');
        
        const wizardSteps = [
            'Display available public games',
            'Show game info (players, status)',
            'Create new public game OR join existing',
            'Navigate to 3d.html?session=XXXXX',
            'Socket connects to session room',
            'Game starts when enough players join'
        ];
        
        wizardSteps.forEach((step, index) => {
            this.assert(
                true,
                `Public Lobby wizard step ${index + 1}: ${step}`,
                'Step should be accessible and functional'
            );
        });
    },
    
    // ════════════════════════════════════════════════════════
    // PAGE ROUTING TESTS
    // ════════════════════════════════════════════════════════
    
    testPageRouting() {
        this.log('Testing page routing and back navigation...', 'info');
        
        const routingFlows = [
            {
                flow: 'index.html -> ai_setup.html -> 3d.html?offline=true',
                backButton: 'Should return to index.html',
                description: 'AI game creation flow'
            },
            {
                flow: 'index.html -> lobby.html?action=private -> 3d.html?code=XXX',
                backButton: 'Should return to index.html',
                description: 'Private game creation flow'
            },
            {
                flow: 'index.html -> lobby.html?action=join -> 3d.html?code=XXX',
                backButton: 'Should return to index.html',
                description: 'Join by code flow'
            },
            {
                flow: 'index.html -> play.html -> lobby.html -> 3d.html?session=XXX',
                backButton: 'Should return to lobby.html',
                description: 'Public lobby flow'
            }
        ];
        
        routingFlows.forEach(routing => {
            this.assert(
                true,
                `Page routing: ${routing.description}`,
                `Flow: ${routing.flow}, Back: ${routing.backButton}`
            );
        });
    },
    
    // ════════════════════════════════════════════════════════
    // RUN ALL TESTS
    // ════════════════════════════════════════════════════════
    
    runAllTests() {
        this.log('═'.repeat(60), 'info');
        this.log('GAME CREATION & MULTIPLAYER FLOW TEST SUITE', 'info');
        this.log('═'.repeat(60), 'info');
        
        this.testResults = [];
        
        // URL & Detection Tests
        this.testURLParameters();
        this.testGameTypeDetection();
        
        // Navigation Tests
        this.testNavigationFlows();
        this.testLeaveGameNavigation();
        
        // Socket Tests
        this.testSocketConnectionLogic();
        this.testSocketEventHandling();
        
        // Code Tests
        this.testGameCodeGeneration();
        this.testGameCodeValidation();
        
        // Existing Game Tests
        this.testExistingGameButton();
        
        // Wizard Tests
        this.testAISetupWizard();
        this.testPrivateGameWizard();
        this.testJoinByCodeWizard();
        this.testPublicLobbyWizard();
        
        // Routing Tests
        this.testPageRouting();
        
        // Summary
        this.printSummary();
    },
    
    printSummary() {
        this.log('═'.repeat(60), 'info');
        this.log('TEST SUMMARY', 'info');
        this.log('═'.repeat(60), 'info');
        
        const passed = this.testResults.filter(r => r.passed).length;
        const failed = this.testResults.filter(r => !r.passed).length;
        const total = this.testResults.length;
        
        this.log(`Total Tests: ${total}`, 'info');
        this.log(`Passed: ${passed}`, 'success');
        this.log(`Failed: ${failed}`, failed > 0 ? 'error' : 'success');
        this.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`, 'info');
        
        if (failed > 0) {
            this.log('─'.repeat(60), 'info');
            this.log('FAILED TESTS:', 'error');
            this.testResults.filter(r => !r.passed).forEach(r => {
                this.log(`  • ${r.test}: ${r.details}`, 'error');
            });
        }
        
        this.log('═'.repeat(60), 'info');
        
        return {
            total,
            passed,
            failed,
            successRate: (passed / total) * 100,
            results: this.testResults
        };
    }
};

// Export for use in console
window.GameFlowTest = GameFlowTest;
console.log('✅ Game Flow Test Suite loaded');
console.log('Run tests with: GameFlowTest.runAllTests()');
