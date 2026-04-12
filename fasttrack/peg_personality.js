/**
 * 🎭 PEG PERSONALITY SYSTEM
 * Defines personality types for pegs with unique reactions and dialogue.
 * Each peg has a personality that affects how they react to game events.
 */

const PEG_PERSONALITIES = {
    // ============================================================
    // PERSONALITY TYPES
    // ============================================================
    
    AGGRESSIVE: {
        name: 'Aggressive',
        emoji: '😈',
        description: 'Loves to cut opponents, takes glee in victory',
        reactions: {
            onCutOpponent: ['Ha! Take that! 💪', 'Gotcha! 😈', 'Out of my way!', 'Sweet revenge! 🔥'],
            onGotCut: ['This isn\'t over! 😤', 'You\'ll pay for that!', 'Grr... 😡', 'I\'ll be back!'],
            onEnterFastTrack: ['SPEED! ⚡', 'Catch me if you can!', 'Zooom! 🏎️'],
            onEnterBullseye: ['Bullseye! 🎯', 'Center of attention!', 'Perfect shot!'],
            onEnterSafeZone: ['Safe at last! 😌', 'Can\'t touch this!', 'Home stretch! 🏆'],
            onWin: ['VICTORY! 🏆', 'I AM THE CHAMPION!', 'Bow down! 👑'],
            onNoLegalMove: ['Ugh, stuck! 😤', 'Come ON!', 'This is ridiculous!']
        },
        animations: {
            victoryDance: 'aggressive_victory',
            cutCelebration: 'aggressive_stomp',
            defeatedReaction: 'angry_shake'
        }
    },
    
    APOLOGETIC: {
        name: 'Apologetic', 
        emoji: '🥺',
        description: 'Feels bad about cutting, gracious in defeat',
        reactions: {
            onCutOpponent: ['Sorry! Had to do it... 🙏', 'Nothing personal! 💕', 'Forgive me! 😅'],
            onGotCut: ['Fair play... 😌', 'Well played! 👏', 'It happens... 🤷'],
            onEnterFastTrack: ['Yay, fast track! ✨', 'Wheee! 🎢', 'Here I go!'],
            onEnterBullseye: ['Made it! 🎯', 'Wow, center!', 'Lucky me! 🍀'],
            onEnterSafeZone: ['Phew, safe! 😮‍💨', 'Almost there!', 'Thank goodness!'],
            onWin: ['We did it! 🎉', 'Great game everyone!', 'Thank you! 💖'],
            onNoLegalMove: ['Oh no... 😟', 'Stuck... 😔', 'That\'s okay...']
        },
        animations: {
            victoryDance: 'humble_bow',
            cutCelebration: 'apologetic_wave',
            defeatedReaction: 'sad_wave'
        }
    },
    
    SMUG: {
        name: 'Smug',
        emoji: '😏', 
        description: 'Confident and condescending, snickers at opponents',
        reactions: {
            onCutOpponent: ['Too easy! 😏', '*snicker* 🤭', 'Amateur move...', 'Predictable!'],
            onGotCut: ['Lucky shot! 🙄', 'Won\'t happen again!', 'Hmph! 😤'],
            onEnterFastTrack: ['Obviously! 💅', 'As expected!', 'Too easy!'],
            onEnterBullseye: ['Naturally! 🎯', 'Perfect aim!', 'Of course!'],
            onEnterSafeZone: ['Like clockwork! ⏰', 'Told you so!', 'Easy!'],
            onWin: ['Was there any doubt? 💅', 'As I predicted!', 'Flawless! 👑'],
            onNoLegalMove: ['A minor setback! 🙄', 'Patience...', 'Strategy!']
        },
        animations: {
            victoryDance: 'smug_pose',
            cutCelebration: 'dismissive_wave',
            defeatedReaction: 'eye_roll'
        }
    },
    
    TIMID: {
        name: 'Timid',
        emoji: '😰',
        description: 'Nervous and hesitant, easily startled',
        reactions: {
            onCutOpponent: ['Eep! Sorry! 😱', 'I didn\'t mean to!', 'Oh no...'],
            onGotCut: ['*whimper* 😢', 'I knew it...', 'Oh dear...'],
            onEnterFastTrack: ['S-so fast! 😨', 'Whoa!', 'Scary!'],
            onEnterBullseye: ['I made it?! 😲', 'Really?!', 'Wow!'],
            onEnterSafeZone: ['Finally safe! 😮‍💨', 'Phew!', 'So relieved!'],
            onWin: ['Wait... I won?! 🥹', 'Really?!', 'Thank you! 💕'],
            onNoLegalMove: ['Of course... 😔', 'I expected this...', 'It\'s fine...']
        },
        animations: {
            victoryDance: 'shy_celebration',
            cutCelebration: 'nervous_jump',
            defeatedReaction: 'sad_droop'
        }
    },
    
    CHEERFUL: {
        name: 'Cheerful',
        emoji: '😄',
        description: 'Always positive, enjoys the game win or lose',
        reactions: {
            onCutOpponent: ['Oops! Tag! 🏃', 'Got you! 😄', 'Fun!'],
            onGotCut: ['Good one! 👍', 'Nice move!', 'Ha! Got me!'],
            onEnterFastTrack: ['Wheeeee! 🎢', 'So fun!', 'Woohoo!'],
            onEnterBullseye: ['Bullseye! 🎯', 'Yippee!', 'So cool!'],
            onEnterSafeZone: ['Yay! Safe! 🎉', 'Almost there!', 'Exciting!'],
            onWin: ['GG everyone! 🎉', 'That was fun!', 'Great game! 💖'],
            onNoLegalMove: ['Next time! 😊', 'No worries!', 'Part of the game!']
        },
        animations: {
            victoryDance: 'happy_bounce',
            cutCelebration: 'playful_spin',
            defeatedReaction: 'cheerful_wave'
        }
    },
    
    DRAMATIC: {
        name: 'Dramatic',
        emoji: '🎭',
        description: 'Over-the-top reactions, treats everything like theater',
        reactions: {
            onCutOpponent: ['BEGONE! ⚔️', 'The stage is MINE!', 'Exit, stage left!'],
            onGotCut: ['BETRAYAL! 💔', 'Et tu?!', 'The TRAGEDY!'],
            onEnterFastTrack: ['DESTINY CALLS! ⚡', 'MY MOMENT!', 'TO GLORY!'],
            onEnterBullseye: ['THE SPOTLIGHT! 🎯', 'Center stage!', 'MAGNIFICENT!'],
            onEnterSafeZone: ['SANCTUARY! 🏰', 'AT LAST!', 'THE FINALE APPROACHES!'],
            onWin: ['STANDING OVATION! 👏', 'BRAVO! BRAVO! 🎭', 'THE CROWN IS MINE!'],
            onNoLegalMove: ['THE SUSPENSE! 😱', 'A plot twist!', 'PATIENCE!']
        },
        animations: {
            victoryDance: 'dramatic_bow',
            cutCelebration: 'theatrical_pose',
            defeatedReaction: 'dramatic_faint'
        }
    }
};

// Personality type list for easy iteration
const PERSONALITY_TYPES = Object.keys(PEG_PERSONALITIES);

// Assign random personality to a peg
function assignPegPersonality(peg, playerPersonalityBias = null) {
    // If player has a personality bias, weight toward similar types
    if (playerPersonalityBias && PEG_PERSONALITIES[playerPersonalityBias]) {
        // 50% chance to match player personality, 50% random
        if (Math.random() < 0.5) {
            peg.personality = playerPersonalityBias;
            return;
        }
    }
    // Random personality
    const randomType = PERSONALITY_TYPES[Math.floor(Math.random() * PERSONALITY_TYPES.length)];
    peg.personality = randomType;
}

// Get reaction text for a peg based on event
function getPegReaction(peg, eventType) {
    const personality = PEG_PERSONALITIES[peg.personality] || PEG_PERSONALITIES.CHEERFUL;
    const reactions = personality.reactions[eventType];
    if (!reactions || reactions.length === 0) return null;
    return reactions[Math.floor(Math.random() * reactions.length)];
}

// Export for use in 3d.html
window.PEG_PERSONALITIES = PEG_PERSONALITIES;
window.PERSONALITY_TYPES = PERSONALITY_TYPES;
window.assignPegPersonality = assignPegPersonality;
window.getPegReaction = getPegReaction;

console.log('🎭 Peg Personality System loaded:', PERSONALITY_TYPES.length, 'personality types');

