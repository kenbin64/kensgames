// HR-35: AI participants are transparent. Every AI peer published in the
// session roster carries a public badge: { role, persona, provider, model }.
// No covert AI players. Persistent personas have a public profile id.
'use strict';

function describeAiPeer(input) {
  const role = (input && input.role) || 'player';
  const persona = (input && input.persona) || {};
  const provider = (input && input.provider) || {};
  return {
    is_ai: true,
    badge: input && input.badge ? input.badge : 'AI',
    role,
    persona: {
      id: persona.id || ('ephemeral:' + Math.random().toString(36).slice(2, 10)),
      name: persona.name || 'House Bot',
      style: persona.style || null,
      profileUrl: persona.profileUrl || null,
    },
    provider: {
      id: provider.id || 'heuristic',
      model: provider.model || null,
      transport: provider.transport || null,
    },
  };
}

function annotatePlayer(player, peerInfo) {
  if (!player) return player;
  return Object.assign({}, player, {
    is_ai: true,
    ai_badge: peerInfo.badge,
    ai_role: peerInfo.role,
    ai_persona: peerInfo.persona,
    ai_provider: peerInfo.provider,
  });
}

function rosterDescriptors(players) {
  if (!Array.isArray(players)) return [];
  return players
    .filter(p => p && p.is_ai)
    .map(p => ({
      user_id: p.user_id,
      username: p.username,
      role: p.ai_role || 'player',
      persona: p.ai_persona || null,
      provider: p.ai_provider || null,
      badge: p.ai_badge || 'AI',
    }));
}

module.exports = { describeAiPeer, annotatePlayer, rosterDescriptors };
