/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARFIGHTER — PROGRESSION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Persistent career tracking: ranks, kill tallies, weapon/ship unlocks,
 * XP, credits, and between-wave upgrades.
 *
 * All state persists in localStorage so progress survives page reload.
 * Designed to reward longevity and give players reasons to come back.
 *
 * Rank Ladder:  Ensign → Lieutenant → Captain → Major → Colonel → Commander
 * Kill Tally:   Per-type alien silhouette icons (like fighter pilot nose art)
 * Unlock Tree:  Weapons, ship variants, and passive upgrades gated by rank/XP
 * Credits:      Earned per kill/wave — spent in between-wave shop
 */

const SFProgression = (function () {
    'use strict';

    const STORAGE_KEY = 'sf_pilot_career';

    // ═══════════════════════════════════════════════════════════════════════
    // RANK LADDER
    // ═══════════════════════════════════════════════════════════════════════
    const RANKS = [
        { id: 'ensign', name: 'Ensign', abbr: 'ENS', xp: 0, icon: '◇', pips: 1 },
        { id: 'ltjg', name: 'Lt. Junior', abbr: 'LTJG', xp: 500, icon: '◆', pips: 1 },
        { id: 'lieutenant', name: 'Lieutenant', abbr: 'LT', xp: 1500, icon: '◆', pips: 2 },
        { id: 'ltcmdr', name: 'Lt. Commander', abbr: 'LCDR', xp: 4000, icon: '★', pips: 2 },
        { id: 'captain', name: 'Captain', abbr: 'CAPT', xp: 8000, icon: '★', pips: 3 },
        { id: 'major', name: 'Major', abbr: 'MAJ', xp: 15000, icon: '★★', pips: 4 },
        { id: 'colonel', name: 'Colonel', abbr: 'COL', xp: 30000, icon: '★★', pips: 5 },
        { id: 'commander', name: 'Commander', abbr: 'CDR', xp: 60000, icon: '★★★', pips: 6 },
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // XP AWARDS (per action)
    // ═══════════════════════════════════════════════════════════════════════
    const XP_AWARDS = {
        kill_enemy: 20, kill_interceptor: 50, kill_bomber: 60,
        kill_predator: 100, kill_dreadnought: 500,
        kill_alien_baseship: 300, kill_egg: 5, kill_youngling: 10,
        wave_complete: 100, wave_no_damage: 200,
        wingman_saved: 50, baseship_defended: 150,
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CREDIT AWARDS (currency for upgrade shop)
    // ═══════════════════════════════════════════════════════════════════════
    const CREDIT_AWARDS = {
        kill_enemy: 10, kill_interceptor: 25, kill_bomber: 30,
        kill_predator: 75, kill_dreadnought: 300,
        kill_alien_baseship: 200, wave_complete: 50,
    };

    // ═══════════════════════════════════════════════════════════════════════
    // KILL TALLY — alien silhouette icons per enemy type
    // ═══════════════════════════════════════════════════════════════════════
    const TALLY_ICONS = {
        enemy: '👾', interceptor: '🛸',
        bomber: '💣', predator: '🐛',
        dreadnought: '☠️', 'alien-baseship': '🔴',
        egg: '🥚', youngling: '🪱',
    };

    // ═══════════════════════════════════════════════════════════════════════
    // UNLOCK TREE — gated by rank
    // ═══════════════════════════════════════════════════════════════════════
    const UNLOCKS = [
        // Weapons
        { id: 'laser', type: 'weapon', name: 'Laser Cannon', rank: 'ensign', desc: 'Standard twin laser — reliable, efficient.' },
        { id: 'machinegun', type: 'weapon', name: 'Gatling Gun', rank: 'ensign', desc: 'Rapid-fire kinetic rounds. Low damage, high volume.' },
        { id: 'torpedo', type: 'weapon', name: 'Homing Torpedo', rank: 'ensign', desc: 'Lock-on guided warhead. Limited ammo.' },
        { id: 'pulse', type: 'weapon', name: 'EMP Pulse', rank: 'lieutenant', desc: 'Electromagnetic burst. Disables enemies in radius.' },
        { id: 'plasma', type: 'weapon', name: 'Plasma Cannon', rank: 'ltcmdr', desc: 'Superheated plasma bolts. Slow, devastating.' },
        { id: 'beam', type: 'weapon', name: 'Mining Beam', rank: 'captain', desc: 'Continuous damage beam. Hold to fire.' },
        { id: 'cluster', type: 'weapon', name: 'Cluster Missiles', rank: 'major', desc: 'Salvo of 6 micro-missiles. Area denial.' },
        { id: 'nova', type: 'weapon', name: 'Nova Bomb', rank: 'colonel', desc: 'Massive AoE. One per sortie. Clears the field.' },

        // Ship variants
        { id: 'ship_fighter', type: 'ship', name: 'SF-01 Viper', rank: 'ensign', desc: 'Standard interceptor. Balanced speed and armor.' },
        { id: 'ship_heavy', type: 'ship', name: 'SF-02 Warhog', rank: 'captain', desc: 'Heavy fighter. +50% hull, −20% speed, +2 torpedoes.' },
        { id: 'ship_stealth', type: 'ship', name: 'SF-03 Phantom', rank: 'major', desc: 'Stealth fighter. Reduced radar signature, +30% speed.' },
        { id: 'ship_command', type: 'ship', name: 'SF-04 Sovereign', rank: 'commander', desc: 'Command ship. Issue squad orders, enhanced radar, all weapons.' },

        // Passive upgrades (purchased with credits between waves)
        { id: 'hull_plating', type: 'upgrade', name: 'Hull Plating I', rank: 'ensign', desc: '+20 max hull.', cost: 100, effect: { 'player.hull': 20 } },
        { id: 'hull_plating2', type: 'upgrade', name: 'Hull Plating II', rank: 'lieutenant', desc: '+30 max hull.', cost: 250, effect: { 'player.hull': 30 } },
        { id: 'shield_cap', type: 'upgrade', name: 'Shield Capacitor', rank: 'ensign', desc: '+25 max shields.', cost: 120, effect: { 'player.shields': 25 } },
        { id: 'fuel_cell', type: 'upgrade', name: 'Fuel Cell', rank: 'ensign', desc: '+20 fuel capacity.', cost: 80, effect: { 'player.fuel': 20 } },
        { id: 'torp_rack', type: 'upgrade', name: 'Torpedo Rack', rank: 'ltjg', desc: '+4 torpedo capacity.', cost: 200, effect: { 'player.torpedoes': 4 } },
        { id: 'afterburner2', type: 'upgrade', name: 'Afterburner Mk.II', rank: 'lieutenant', desc: '+100 afterburner speed.', cost: 300, effect: { 'player.afterburnerSpeed': 100 } },
        { id: 'laser_dmg', type: 'upgrade', name: 'Laser Amplifier', rank: 'ltcmdr', desc: '+5 laser damage.', cost: 350, effect: { 'weapon.laser.damage': 5 } },
        { id: 'torp_dmg', type: 'upgrade', name: 'Warhead Upgrade', rank: 'captain', desc: '+30 torpedo damage.', cost: 400, effect: { 'weapon.torpedo.damage': 30 } },
        { id: 'regen', type: 'upgrade', name: 'Shield Regen', rank: 'major', desc: 'Shields slowly regenerate in combat.', cost: 600, effect: { _special: 'shield_regen' } },
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // DEFAULT CAREER PROFILE
    // ═══════════════════════════════════════════════════════════════════════
    function _defaultCareer() {
        return {
            xp: 0,
            credits: 0,
            totalKills: 0,
            totalDeaths: 0,
            totalWaves: 0,
            totalFlightTime: 0,   // seconds
            bestWave: 0,
            bestScore: 0,
            gamesPlayed: 0,
            killTally: {},        // { enemy: 42, predator: 3, ... }
            purchasedUpgrades: [], // array of unlock ids
            selectedShip: 'ship_fighter',
            achievements: [],
            createdAt: Date.now(),
        };
    }


    // ═══════════════════════════════════════════════════════════════════════
    // PERSISTENCE — localStorage read/write
    // ═══════════════════════════════════════════════════════════════════════
    let _career = null;

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            _career = raw ? Object.assign(_defaultCareer(), JSON.parse(raw)) : _defaultCareer();
        } catch {
            _career = _defaultCareer();
        }
        return _career;
    }

    function save() {
        if (!_career) return;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_career)); } catch { /* quota */ }
    }

    function career() {
        if (!_career) load();
        return _career;
    }

    function reset() {
        _career = _defaultCareer();
        save();
        return _career;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RANK COMPUTATION
    // ═══════════════════════════════════════════════════════════════════════
    function getRank(xp) {
        if (xp === undefined) xp = career().xp;
        let rank = RANKS[0];
        for (const r of RANKS) {
            if (xp >= r.xp) rank = r;
            else break;
        }
        return rank;
    }

    function getNextRank(xp) {
        if (xp === undefined) xp = career().xp;
        for (const r of RANKS) {
            if (r.xp > xp) return r;
        }
        return null; // max rank
    }

    function getRankProgress() {
        const c = career();
        const current = getRank(c.xp);
        const next = getNextRank(c.xp);
        if (!next) return 1.0; // max rank
        const base = current.xp;
        const target = next.xp - base;
        return Math.min(1, (c.xp - base) / target);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // XP & CREDIT AWARDS
    // ═══════════════════════════════════════════════════════════════════════
    function awardKill(enemyType) {
        const c = career();
        const xpKey = 'kill_' + enemyType.replace('-', '_');
        const xp = XP_AWARDS[xpKey] || 10;
        const cr = CREDIT_AWARDS[xpKey] || 5;
        const oldRank = getRank(c.xp);

        c.xp += xp;
        c.credits += cr;
        c.totalKills++;
        c.killTally[enemyType] = (c.killTally[enemyType] || 0) + 1;

        const newRank = getRank(c.xp);
        save();

        const ranked = newRank.id !== oldRank.id;
        return { xp, credits: cr, ranked, newRank: ranked ? newRank : null };
    }

    function awardEvent(eventKey) {
        const c = career();
        const xp = XP_AWARDS[eventKey] || 0;
        const cr = CREDIT_AWARDS[eventKey] || 0;
        const oldRank = getRank(c.xp);
        c.xp += xp;
        c.credits += cr;
        const newRank = getRank(c.xp);
        save();
        return { xp, credits: cr, ranked: newRank.id !== oldRank.id, newRank: newRank.id !== oldRank.id ? newRank : null };
    }

    function endMission(stats) {
        const c = career();
        c.gamesPlayed++;
        c.totalDeaths += (stats.deaths || 0);
        c.totalWaves += (stats.waveReached || 0);
        c.totalFlightTime += (stats.flightTime || 0);
        if (stats.waveReached > c.bestWave) c.bestWave = stats.waveReached;
        if (stats.score > c.bestScore) c.bestScore = stats.score;
        save();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UNLOCK SYSTEM
    // ═══════════════════════════════════════════════════════════════════════
    function getAvailableUnlocks() {
        const c = career();
        const rank = getRank(c.xp);
        const rankIdx = RANKS.findIndex(r => r.id === rank.id);
        return UNLOCKS.filter(u => {
            const reqIdx = RANKS.findIndex(r => r.id === u.rank);
            return reqIdx <= rankIdx;
        });
    }

    function getLockedUnlocks() {
        const c = career();
        const rank = getRank(c.xp);
        const rankIdx = RANKS.findIndex(r => r.id === rank.id);
        return UNLOCKS.filter(u => {
            const reqIdx = RANKS.findIndex(r => r.id === u.rank);
            return reqIdx > rankIdx;
        });
    }

    function getPurchasableUpgrades() {
        const c = career();
        return getAvailableUnlocks().filter(u =>
            u.type === 'upgrade' && u.cost && !c.purchasedUpgrades.includes(u.id)
        );
    }

    function purchaseUpgrade(unlockId) {
        const c = career();
        const u = UNLOCKS.find(x => x.id === unlockId);
        if (!u || !u.cost) return { success: false, reason: 'Invalid upgrade' };
        if (c.purchasedUpgrades.includes(u.id)) return { success: false, reason: 'Already purchased' };
        if (c.credits < u.cost) return { success: false, reason: 'Not enough credits (' + c.credits + '/' + u.cost + ')' };

        const rank = getRank(c.xp);
        const rankIdx = RANKS.findIndex(r => r.id === rank.id);
        const reqIdx = RANKS.findIndex(r => r.id === u.rank);
        if (reqIdx > rankIdx) return { success: false, reason: 'Rank too low (need ' + RANKS[reqIdx].name + ')' };

        c.credits -= u.cost;
        c.purchasedUpgrades.push(u.id);
        save();
        return { success: true, upgrade: u };
    }

    function selectShip(shipId) {
        const c = career();
        const ship = UNLOCKS.find(u => u.id === shipId && u.type === 'ship');
        if (!ship) return false;
        const rank = getRank(c.xp);
        const rankIdx = RANKS.findIndex(r => r.id === rank.id);
        const reqIdx = RANKS.findIndex(r => r.id === ship.rank);
        if (reqIdx > rankIdx) return false;
        c.selectedShip = shipId;
        save();
        return true;
    }


    // ═══════════════════════════════════════════════════════════════════════
    // APPLY UPGRADES — modify manifold dimensions at mission start
    // ═══════════════════════════════════════════════════════════════════════
    function applyUpgradesToPlayer(player, dimSetter) {
        const c = career();
        for (const uid of c.purchasedUpgrades) {
            const u = UNLOCKS.find(x => x.id === uid);
            if (!u || !u.effect) continue;
            for (const [key, val] of Object.entries(u.effect)) {
                if (key === '_special') {
                    // Special effects handled by core.js
                    player['_upgrade_' + val] = true;
                } else if (dimSetter) {
                    dimSetter(key, val); // additive boost
                }
            }
        }

        // Ship variant stat modifiers
        const ship = UNLOCKS.find(u => u.id === c.selectedShip && u.type === 'ship');
        if (ship) {
            player._shipId = ship.id;
            player._shipName = ship.name;
            if (ship.id === 'ship_heavy') {
                player.hull = Math.round(player.hull * 1.5);
                player.maxSpeed = Math.round(player.maxSpeed * 0.8);
                player.torpedoes = (player.torpedoes || 0) + 2;
            } else if (ship.id === 'ship_stealth') {
                player.maxSpeed = Math.round(player.maxSpeed * 1.3);
                player._stealthFactor = 0.5; // used by enemy targeting
            } else if (ship.id === 'ship_command') {
                player._canCommand = true; // enables squad orders UI
                player.hull = Math.round(player.hull * 1.2);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACHIEVEMENTS — milestone badges that unlock on first occurrence
    // ═══════════════════════════════════════════════════════════════════════
    const ACHIEVEMENTS = [
        { id: 'first_blood', name: 'First Blood', desc: 'Score your first kill.', check: c => c.totalKills >= 1 },
        { id: 'ace', name: 'Ace', desc: 'Kill 5 enemies in one sortie.', check: null }, // checked by core.js per-mission
        { id: 'centurion', name: 'Centurion', desc: '100 career kills.', check: c => c.totalKills >= 100 },
        { id: 'predator_hunter', name: 'Predator Hunter', desc: 'Kill 10 Predator Drones.', check: c => (c.killTally.predator || 0) >= 10 },
        { id: 'dread_slayer', name: 'Dreadnought Slayer', desc: 'Destroy a Dreadnought.', check: c => (c.killTally.dreadnought || 0) >= 1 },
        { id: 'survivor', name: 'Survivor', desc: 'Reach Wave 10.', check: c => c.bestWave >= 10 },
        { id: 'veteran', name: 'Veteran', desc: 'Play 25 sorties.', check: c => c.gamesPlayed >= 25 },
        { id: 'commander', name: 'Fleet Commander', desc: 'Reach Commander rank.', check: c => getRank(c.xp).id === 'commander' },
        { id: 'wingman_savior', name: 'Wingman Savior', desc: 'Complete 3 waves with all wingmen alive.', check: null },
    ];

    function checkAchievements() {
        const c = career();
        const newlyEarned = [];
        for (const a of ACHIEVEMENTS) {
            if (c.achievements.includes(a.id)) continue;
            if (a.check && a.check(c)) {
                c.achievements.push(a.id);
                newlyEarned.push(a);
            }
        }
        if (newlyEarned.length) save();
        return newlyEarned;
    }

    function awardAchievement(id) {
        const c = career();
        if (c.achievements.includes(id)) return null;
        const a = ACHIEVEMENTS.find(x => x.id === id);
        if (!a) return null;
        c.achievements.push(id);
        save();
        return a;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // KILL TALLY RENDERER — generates HTML for alien silhouette icons
    // ═══════════════════════════════════════════════════════════════════════
    function renderKillTallyHTML() {
        const c = career();
        const tally = c.killTally;
        const typeOrder = ['enemy', 'interceptor', 'bomber', 'predator', 'dreadnought', 'alien-baseship', 'egg', 'youngling'];
        let html = '';
        for (const type of typeOrder) {
            const count = tally[type] || 0;
            if (count === 0) continue;
            const icon = TALLY_ICONS[type] || '?';
            // Show individual icons up to 5, then "×N" for more
            if (count <= 5) {
                html += '<span title="' + type + ' ×' + count + '" style="margin-right:2px;">';
                for (let i = 0; i < count; i++) html += icon;
                html += '</span>';
            } else {
                html += '<span title="' + type + ' ×' + count + '" style="margin-right:4px;">' + icon + '×' + count + '</span>';
            }
        }
        return html || '<span style="color:#556;">No kills yet</span>';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════
    return {
        load, save, career, reset,
        RANKS, UNLOCKS, ACHIEVEMENTS, TALLY_ICONS,
        getRank, getNextRank, getRankProgress,
        awardKill, awardEvent, endMission,
        getAvailableUnlocks, getLockedUnlocks,
        getPurchasableUpgrades, purchaseUpgrade, selectShip,
        applyUpgradesToPlayer,
        checkAchievements, awardAchievement,
        renderKillTallyHTML,
    };
})();

window.SFProgression = SFProgression;
