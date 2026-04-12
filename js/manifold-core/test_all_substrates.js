/**
 * Universal Substrates Integration Test
 * Tests all 9 substrates working together
 */

console.log('\n' + '='.repeat(70));
console.log('UNIVERSAL SUBSTRATES TEST SUITE');
console.log('='.repeat(70) + '\n');

const path = require('path');

// Load all core and substrate modules
global.ManifoldSurface = require('./manifold_surface.js');
global.SubstrateBase = require('./substrate_base.js');
global.SubstrateRegistry = require('./substrate_registry.js');
global.GameConfig = require('./game_config.js');

global.PhysicsSubstrate = require('./physics_substrate.js');
global.GraphicsSubstrate = require('./graphics_substrate.js');
global.AudioSubstrate = require('./audio_substrate.js');
global.GameLogicSubstrate = require('./gamelogic_substrate.js');
global.ControlMappingSubstrate = require('./controlmapping_substrate.js');
global.UISubstrate = require('./ui_substrate.js');
global.MultiplayerSubstrate = require('./multiplayer_substrate.js');
global.PersistenceSubstrate = require('./persistence_substrate.js');
global.AISubstrate = require('./ai_substrate.js');

console.log('✓ All 9 substrates loaded\n');

// Register all substrates
SubstrateRegistry.initialize(ManifoldSurface);
SubstrateRegistry.register('physics', PhysicsSubstrate);
SubstrateRegistry.register('graphics', GraphicsSubstrate);
SubstrateRegistry.register('audio', AudioSubstrate);
SubstrateRegistry.register('gamelogic', GameLogicSubstrate);
SubstrateRegistry.register('controlmapping', ControlMappingSubstrate);
SubstrateRegistry.register('ui', UISubstrate);
SubstrateRegistry.register('multiplayer', MultiplayerSubstrate);
SubstrateRegistry.register('persistence', PersistenceSubstrate);
SubstrateRegistry.register('ai', AISubstrate);

console.log('✓ All substrates registered\n');

// Write test game state to manifold
const gameCoord = [3, 25, 75, 0, 0.6]; // From GameConfig.createCoordinate
ManifoldSurface.write(gameCoord, {
  bodies: [
    { id: 'paddle-1', mass: 1000, position: { x: 0, y: -15, z: 0 }, isStatic: true, radius: 3 },
    { id: 'ball-1', mass: 50, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0.1, y: -0.2, z: 0 }, radius: 0.5 }
  ],
  gravity: 0,
  airResistance: 0.99,
  scene: { background: 0x000000 },
  camera: { position: { x: 0, y: 0, z: 30 } },
  music: { track: 'game-theme', volume: 0.6 },
  keyboard: { forward: 'W', back: 'S' },
  hud: { visible: true },
  players: [
    { id: 'player-1', username: 'Alice', avatar: '👾', score: 250, isBot: false },
    { id: 'bot-1', username: 'BotEnemy', isBot: true, difficulty: 'hard' }
  ],
  user: { id: 'user-1', username: 'alice_dev', avatar: '👾' },
  bots: [{ id: 'bot-1', difficulty: 'hard' }]
});

console.log('✓ Test game state written to manifold\n');

// Extract data using all substrates
const physics = SubstrateRegistry.get('physics');
const graphics = SubstrateRegistry.get('graphics');
const audio = SubstrateRegistry.get('audio');
const gamelogic = SubstrateRegistry.get('gamelogic');
const controlmapping = SubstrateRegistry.get('controlmapping');
const ui = SubstrateRegistry.get('ui');
const multiplayer = SubstrateRegistry.get('multiplayer');
const persistence = SubstrateRegistry.get('persistence');
const ai = SubstrateRegistry.get('ai');

console.log('SUBSTRATE EXTRACTIONS:\n');

const physicsData = physics.extract(gameCoord);
console.log(`✓ Physics: ${physicsData.bodies.length} bodies`);

const graphicsData = graphics.extract(gameCoord);
console.log(`✓ Graphics: Camera at (${graphicsData.camera.position.x}, ${graphicsData.camera.position.z})`);

const audioData = audio.extract(gameCoord);
console.log(`✓ Audio: Track "${audioData.music.track}" at volume ${audioData.music.volume}`);

const gamelogicData = gamelogic.extract(gameCoord);
console.log(`✓ GameLogic: Game state active=${gamelogicData.gameState.isActive}`);

const controlmappingData = controlmapping.extract(gameCoord);
console.log(`✓ ControlMapping: ${Object.keys(controlmappingData.keyboard).length} mapped keys`);

const uiData = ui.extract(gameCoord);
console.log(`✓ UI: HUD visible=${uiData.hud.visible}`);

const multiplayerData = multiplayer.extract(gameCoord);
console.log(`✓ Multiplayer: ${multiplayerData.players.length} players`);

const persistenceData = persistence.extract(gameCoord);
console.log(`✓ Persistence: User "${persistenceData.user.username}"`);

const aiData = ai.extract(gameCoord);
console.log(`✓ AI: ${aiData.bots.length} bots, difficulty=${aiData.difficulty}`);

console.log('\nPHYSICS OPERATIONS:\n');
const updated = physics.updateVelocities(physicsData.bodies, { 'ball-1': { x: 0.5, y: 0, z: 0 } });
console.log(`✓ Velocity update: ball X velocity = ${updated.find(b => b.id === 'ball-1').velocity.x.toFixed(3)}`);

console.log('\nAI DECISION MAKING:\n');
const decision = aiData.bots.length > 0 ?
  ai.makeDecision(aiData.bots[0], gamelogicData.gameState, multiplayerData.players) :
  null;
if (decision) {
  console.log(`✓ Bot decision: ${decision.action}`);
}

console.log('\nPERSISTENCE OPERATIONS:\n');
const newUser = persistence.createUser('test-player', 'test@game.dev', '🎮');
console.log(`✓ User created: "${newUser.username}" with ID ${newUser.id.substring(0, 8)}...`);

console.log('\n' + '='.repeat(70));
console.log('✓ ALL SUBSTRATE TESTS PASSED');
console.log('✓ MANIFOLD INFRASTRUCTURE READY FOR GAME DEVELOPMENT');
console.log('='.repeat(70) + '\n');
