/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK COMMENTARY SUBSTRATE
 * Two Commentators - Play-by-Play & Color Analysis
 * ============================================================
 * 
 * Features Rex Thundervoice and Sandy Insights as the default
 * commentary duo, with theme-specific variants.
 */

'use strict';

const CommentarySubstrate = {
    version: '1.0.0',
    name: 'FastTrack Commentary System',
    
    // Current commentary mode
    mode: 'FULL', // FULL, HIGHLIGHTS_ONLY, MUTED
    speechEnabled: true,
    textEnabled: true,
    
    // Queue for commentary lines (to avoid overlap)
    commentaryQueue: [],
    isSpeaking: false,
    
    // ============================================================
    // COMMENTARY DUOS BY THEME
    // ============================================================
    commentaryDuos: {
        DEFAULT: {
            playByPlay: {
                name: 'Rex Thundervoice',
                title: 'Play-by-Play',
                style: 'energetic',
                voice: { pitch: 0.85, rate: 1.15, volume: 1.0 },
                color: '#FF6B35'
            },
            color: {
                name: 'Sandy Insights',
                title: 'Color Commentary',
                style: 'analytical',
                voice: { pitch: 1.15, rate: 0.95, volume: 0.9 },
                color: '#4ECDC4'
            }
        },
        SPACE_ACE: {
            playByPlay: {
                name: 'Commander Vox',
                title: 'Mission Control',
                style: 'military_calm',
                voice: { pitch: 0.75, rate: 1.0, volume: 1.0 },
                color: '#00FFFF'
            },
            color: {
                name: 'Dr. Nova Sterling',
                title: 'Xenostrategy Analyst',
                style: 'scientific',
                voice: { pitch: 1.2, rate: 0.9, volume: 0.9 },
                color: '#FF00FF'
            }
        },
        UNDERSEA: {
            playByPlay: {
                name: 'Captain Coral',
                title: 'Ship\'s Announcer',
                style: 'nautical',
                voice: { pitch: 0.9, rate: 1.05, volume: 1.0 },
                color: '#00CED1'
            },
            color: {
                name: 'Marina Wavecrest',
                title: 'Marine Strategist',
                style: 'relaxed',
                voice: { pitch: 1.25, rate: 0.9, volume: 0.9 },
                color: '#FF6B6B'
            }
        },
        ROMAN_COLISEUM: {
            playByPlay: {
                name: 'Maximus Vox',
                title: 'Herald of the Arena',
                style: 'dramatic',
                voice: { pitch: 0.7, rate: 0.95, volume: 1.0 },
                color: '#FFD700'
            },
            color: {
                name: 'Senator Aurelius',
                title: 'Political Analyst',
                style: 'pompous',
                voice: { pitch: 0.95, rate: 0.85, volume: 0.9 },
                color: '#8B4513'
            }
        },
        FIBONACCI: {
            playByPlay: {
                name: 'Professor Phi',
                title: 'Mathematical Narrator',
                style: 'academic',
                voice: { pitch: 0.85, rate: 0.95, volume: 1.0 },
                color: '#FFD700'
            },
            color: {
                name: 'Dr. Fibonacci',
                title: 'Golden Ratio Analyst',
                style: 'theoretical',
                voice: { pitch: 1.1, rate: 0.9, volume: 0.9 },
                color: '#DAA520'
            }
        }
    },
    
    // ============================================================
    // EXTENSIVE DIALOGUE LIBRARIES
    // ============================================================
    dialogueLibraries: {
        DEFAULT: {
            // Game flow
            gameStart: {
                playByPlay: [
                    "Welcome back to FastTrack Arena! I'm Rex Thundervoice alongside Sandy Insights!",
                    "Good evening and welcome to ANOTHER exciting match of FastTrack!",
                    "Ladies and gentlemen, the pegs are in position, the cards are shuffled - LET'S GO!",
                    "The arena is PACKED tonight! Welcome to FastTrack!",
                    "What a crowd we have tonight! This is going to be EPIC!"
                ],
                color: [
                    "The tension is palpable, Rex. Both sides look ready.",
                    "I've been analyzing the matchup and this could go either way.",
                    "Classic setup here. Let's see how the strategies unfold.",
                    "You can feel the electricity in the air tonight.",
                    "All eyes on the board. This is what we live for."
                ]
            },
            
            // Regular moves
            move: {
                playByPlay: [
                    "{player} makes the move!",
                    "And {player} advances {spaces} spaces!",
                    "{player} is on the board!",
                    "Movement from {player}!",
                    "{player} slides into position!"
                ],
                color: [
                    "Solid positioning there.",
                    "Setting up for something, I think.",
                    "Standard play, nothing flashy.",
                    "Keeps the options open.",
                    "Playing it safe for now."
                ]
            },
            
            // Captures - various intensities
            captureNormal: {
                playByPlay: [
                    "{hunter} TAKES OUT {victim}!",
                    "OH! {hunter} catches {victim}!",
                    "{hunter} makes the capture!",
                    "ELIMINATED! {victim} is heading back!",
                    "{hunter} with the takedown!"
                ],
                color: [
                    "That's going to change the momentum!",
                    "Ruthless execution right there.",
                    "Didn't see that coming!",
                    "The hunter becomes the hunter!",
                    "Textbook capture technique."
                ]
            },
            
            captureEpic: {
                playByPlay: [
                    "ARE YOU KIDDING ME?! {hunter} DESTROYS {victim}!",
                    "OHHHH THAT'S DEVASTATING! {hunter} with the MASSIVE takedown!",
                    "UNBELIEVABLE! {hunter} just DEMOLISHED {victim}!",
                    "WHAT A MOVE! {hunter} sends {victim} FLYING!",
                    "THE CROWD IS ON THEIR FEET! {hunter} with an INCREDIBLE capture!"
                ],
                color: [
                    "In my YEARS of calling games, Rex, that was SPECIAL!",
                    "The replays of that are going to be everywhere!",
                    "That's the kind of play you tell your grandchildren about!",
                    "Absolute MASTERY! Championship-level execution!",
                    "I need a moment. That was just... WOW."
                ]
            },
            
            captureMultiple: {
                playByPlay: [
                    "DOUBLE CAPTURE! {hunter} takes out TWO!",
                    "IT'S A MASSACRE! Multiple eliminations by {hunter}!",
                    "TWO FOR ONE! {hunter} is cleaning house!",
                    "CARNAGE ON THE BOARD! {hunter} with a multi-elimination!"
                ],
                color: [
                    "That's a HUGE swing in positioning!",
                    "The comeback potential just evaporated!",
                    "Calculated brilliance or lucky break? Either way, WOW!",
                    "Board control achieved in one move!"
                ]
            },
            
            // Near misses
            nearMiss: {
                playByPlay: [
                    "SO CLOSE! {player} just missed!",
                    "OH! {player} INCHES away from that capture!",
                    "{player} narrowly escapes!",
                    "THE CARD WASN'T THERE! What a near miss!",
                    "JUST shy of that capture!"
                ],
                color: [
                    "My heart just skipped a beat!",
                    "The margin of error in this game is RAZOR thin!",
                    "That could have changed everything!",
                    "Sometimes the cards just don't cooperate.",
                    "Living dangerously there!"
                ]
            },
            
            // Fast Track
            fastTrackEntry: {
                playByPlay: [
                    "{player} ENTERS THE FAST TRACK!",
                    "INTO THE INNER LANE! {player} is taking the risky route!",
                    "FAST TRACK ENGAGED! {player} is going for it!",
                    "HIGH RISK, HIGH REWARD! {player} in the fast lane!",
                    "THE SHORTCUT! {player} enters the fast track!"
                ],
                color: [
                    "Bold choice. The fast track is NOT for the faint of heart!",
                    "This could shave turns off the game... or backfire spectacularly!",
                    "The statistics on fast track success rates are fascinating...",
                    "Committing to the speed run strategy!",
                    "All-in on the fast track play!"
                ]
            },
            
            // Bullseye/Center
            bullseyeEntry: {
                playByPlay: [
                    "TO THE CENTER! {player} is going for the BULLSEYE!",
                    "CENTER ENTRY! {player} diving to the core!",
                    "THE ULTIMATE DESTINATION! {player} aims for the middle!",
                    "BULLSEYE BOUND! This could be it!",
                    "STRAIGHT TO THE HEART OF THE BOARD!"
                ],
                color: [
                    "This is the endgame strategy we've been waiting for!",
                    "If this works, it's a masterclass in positioning!",
                    "The center is the promised land. Can they reach it?",
                    "Maximum efficiency play right here!",
                    "Going for the jugular!"
                ]
            },
            
            // Safe zone
            safeZoneEntry: {
                playByPlay: [
                    "{player} reaches the SAFE ZONE!",
                    "HOME STRETCH! {player} is in their safe zone!",
                    "PROTECTED TERRITORY! {player} can't be touched now!",
                    "INTO THE HAVEN! {player} secured!",
                    "SAFE AT LAST! {player} enters protected space!"
                ],
                color: [
                    "That's a huge relief for {player}!",
                    "From here it's just about the cards.",
                    "One less thing to worry about!",
                    "The home stretch awaits!",
                    "Smart play to secure that position!"
                ]
            },
            
            // Peg finishing
            pegFinish: {
                playByPlay: [
                    "AND {player} GETS ONE HOME!",
                    "PEG FINISHED! {player} scores!",
                    "TO THE CENTER! That's another one in for {player}!",
                    "TOUCHDOWN! {player} completes the journey!",
                    "ONE DOWN! {player} is on the board!"
                ],
                color: [
                    "That's momentum you can build on!",
                    "The pressure shifts now!",
                    "Excellent finish! Clean execution!",
                    "One step closer to victory!",
                    "The race is heating up!"
                ]
            },
            
            // Game winning moment
            victory: {
                playByPlay: [
                    "AND THAT'S THE GAME! {winner} WINS!",
                    "IT'S OVER! {winner} IS YOUR CHAMPION!",
                    "VICTORY! {winner} HAS DONE IT!",
                    "THE FINAL PEG IS HOME! {winner} WINS IT ALL!",
                    "CHAMPION! {winner} TAKES THE CROWN!"
                ],
                color: [
                    "What a performance! {winner} earned that victory!",
                    "Masterful play from start to finish!",
                    "That's going to be one for the highlight reels!",
                    "A well-deserved win. Congratulations to {winner}!",
                    "And THAT is how you play FastTrack!"
                ]
            },
            
            // Tension building
            tension: {
                playByPlay: [
                    "The board is TIGHT right now...",
                    "You could cut the tension with a knife!",
                    "Every move counts from here on out...",
                    "This is CLUTCH time!",
                    "The next card could change EVERYTHING!"
                ],
                color: [
                    "I've seen championships decided on moments like this.",
                    "Hold onto your seats, folks...",
                    "The pressure is immense right now.",
                    "This is why we watch this game!",
                    "Deep breaths everyone. Here we go."
                ]
            },
            
            // Comeback
            comeback: {
                playByPlay: [
                    "IS THIS A COMEBACK?!",
                    "{player} is CLAWING their way back!",
                    "DON'T COUNT THEM OUT! {player} fights back!",
                    "THE MOMENTUM IS SHIFTING!",
                    "{player} REFUSES to give up!"
                ],
                color: [
                    "This is the resilience of a true competitor!",
                    "Never underestimate the power of determination!",
                    "The tide is turning!",
                    "From the jaws of defeat...",
                    "This game is FAR from over!"
                ]
            },
            
            // Card plays
            cardPlay: {
                playByPlay: [
                    "{player} plays a {card}!",
                    "{card} from {player}!",
                    "The {card} is played!",
                    "{player} reveals their hand - it's a {card}!",
                    "A {card}! Interesting choice!"
                ],
                color: [
                    "Let's see what they do with it.",
                    "Multiple options with that card.",
                    "Standard play, but effective.",
                    "The strategy reveals itself.",
                    "Setting up the next move."
                ]
            },
            
            // Special cards
            sorryCard: {
                playByPlay: [
                    "SORRY CARD! Someone's going down!",
                    "OH NO! It's a SORRY card!",
                    "THE DREADED SORRY CARD APPEARS!",
                    "SORRY!! This changes everything!",
                    "A SORRY card from {player}! Watch out!"
                ],
                color: [
                    "The most powerful card in the game!",
                    "Someone's about to have a bad day...",
                    "The Sorry card - friend to some, nightmare to others!",
                    "Strategic demolition incoming!",
                    "Maximum disruption potential!"
                ]
            }
        },
        
        // Space theme dialogue
        SPACE_ACE: {
            gameStart: {
                playByPlay: [
                    "Mission Control active. All pilots report to stations!",
                    "Initiating cosmic FastTrack protocols. All vessels cleared for launch!",
                    "Greetings, sentients! Welcome to the Intergalactic Arena!",
                    "Space coordinates locked. The stellar games begin!",
                    "Attention all pilots! Dimensional racing sequence initiated!"
                ],
                color: [
                    "Scanners show optimal conditions for competitive maneuvering.",
                    "The cosmic energy readings are off the charts today.",
                    "Fascinating lineup of competitors. Let's analyze their approaches.",
                    "Probability matrices indicate an unpredictable match.",
                    "Setting telescopes to maximum. This should be spectacular."
                ]
            },
            
            captureNormal: {
                playByPlay: [
                    "{hunter} locks on target! {victim} ELIMINATED from the sector!",
                    "Direct hit! {hunter} vaporizes {victim}'s position!",
                    "Tractor beam ENGAGED! {hunter} captures {victim}!",
                    "{hunter} with the photon strike on {victim}!",
                    "Target acquired and neutralized! {victim} returns to dock!"
                ],
                color: [
                    "Precision targeting at its finest.",
                    "The attack vector was mathematically optimal.",
                    "Shields were no match for that assault.",
                    "Calculating the probability of that hit... impressive.",
                    "A successful intercept across the void."
                ]
            },
            
            captureEpic: {
                playByPlay: [
                    "SUPERNOVA STRIKE! {hunter} OBLITERATES {victim}!",
                    "BY THE STARS! {hunter} unleashes COSMIC FURY on {victim}!",
                    "WARP SPEED TAKEDOWN! {hunter} transcends physics to capture {victim}!",
                    "QUANTUM DEVASTATION! {hunter} col lapses {victim}'s probability wave!",
                    "BLACK HOLE MANEUVER! {hunter} pulls {victim} into the VOID!"
                ],
                color: [
                    "The energy readings just spiked beyond measurable limits!",
                    "In all my cycles of observation, I've never seen such a move!",
                    "That defied at least three laws of thermodynamics!",
                    "The singularity itself would be impressed!",
                    "Recording this for the Galactic Archives!"
                ]
            },
            
            fastTrackEntry: {
                playByPlay: [
                    "{player} ENGAGES THE HYPERDRIVE!",
                    "WARP LANE ACTIVATED! {player} takes the fast route!",
                    "{player} enters the COSMIC SHORTCUT!",
                    "LIGHTSPEED PATH INITIATED! {player} goes for it!",
                    "THE STELLAR HIGHWAY! {player} risks the jump!"
                ],
                color: [
                    "Bold navigation. The warp lane is treacherous.",
                    "Calculations must be precise or it's collision city.",
                    "Going faster than light has its consequences...",
                    "The chrono-path diverges here. Risky choice.",
                    "Maximum thrust! Let's see if they can handle it."
                ]
            },
            
            victory: {
                playByPlay: [
                    "MISSION ACCOMPLISHED! {winner} CLAIMS THE COSMOS!",
                    "ALL PEGS TO BASE! {winner} ACHIEVES STELLAR VICTORY!",
                    "THE GALAXY BOWS TO {winner}! CHAMPION OF THE VOID!",
                    "{winner} HAS CONQUERED THE STARS!",
                    "UNIVERSAL TRIUMPH! {winner} REIGNS SUPREME!"
                ],
                color: [
                    "A statistically improbable achievement. Magnificent!",
                    "The cosmos align for {winner} today!",
                    "Recording this in the eternal star logs!",
                    "Across infinite dimensions, this victory resonates!",
                    "Truly a pilot among pilots. Congratulations!"
                ]
            }
        },
        
        // Undersea theme dialogue
        UNDERSEA: {
            gameStart: {
                playByPlay: [
                    "Ahoy, landlubbers and sea creatures alike! Welcome to the Ocean Arena!",
                    "The tides have turned and the games begin! Welcome aboard!",
                    "From the depths of the Mariana to your screens - it's FastTrack at SEA!",
                    "Anchors aweigh! The underwater championship starts NOW!",
                    "Grab your snorkels, folks! We're diving into FastTrack!"
                ],
                color: [
                    "The currents look favorable for exciting gameplay.",
                    "I'm reading strong trade winds for this match.",
                    "The sea is calm... but not for long, I suspect.",
                    "Every creature from the coral to the kelp is watching.",
                    "Let the oceanic games commence!"
                ]
            },
            
            captureNormal: {
                playByPlay: [
                    "{hunter} sends {victim} to DAVY JONES LOCKER!",
                    "SPLASH! {hunter} dunks {victim} back to the harbor!",
                    "Like a shark to chum! {hunter} catches {victim}!",
                    "{hunter} with the tidal wave on {victim}!",
                    "OVERBOARD! {victim} is swimming back thanks to {hunter}!"
                ],
                color: [
                    "That's what we call a kraken attack!",
                    "The ocean takes no prisoners today!",
                    "Smooth like a dolphin strike!",
                    "The reef just claimed another victim!",
                    "Back to the beach for {victim}!"
                ]
            },
            
            captureEpic: {
                playByPlay: [
                    "TIDAL WAVE CATASTROPHE! {hunter} DROWNS {victim}'s hopes!",
                    "LEVIATHAN STRIKE! {hunter} ENGULFS {victim} completely!",
                    "BY POSEIDON'S TRIDENT! {hunter} DESTROYS {victim}!",
                    "MAELSTROM MANEUVER! {hunter} spins {victim} into the ABYSS!",
                    "TSUNAMI OF DESTRUCTION! {hunter} washes {victim} AWAY!"
                ],
                color: [
                    "The ocean gods smile upon {hunter}!",
                    "In all my years on the seven seas... INCREDIBLE!",
                    "That's going in the Captain's Log for sure!",
                    "The fishes will be talking about this for years!",
                    "Neptune himself would applaud that move!"
                ]
            },
            
            victory: {
                playByPlay: [
                    "LAND HO! {winner} REACHES THE TREASURE!",
                    "{winner} CONQUERS THE SEVEN SEAS!",
                    "PIRATE'S GLORY! {winner} CLAIMS THE BOUNTY!",
                    "THE OCEAN CROWN BELONGS TO {winner}!",
                    "FROM THE DEPTHS TO VICTORY! {winner} TRIUMPHS!"
                ],
                color: [
                    "X marks the spot, and {winner} found it!",
                    "A voyage worthy of the legends!",
                    "Smooth sailing to victory!",
                    "The mermaids sing in celebration!",
                    "Truly a captain among captains!"
                ]
            }
        },
        
        // Roman Coliseum theme dialogue
        ROMAN_COLISEUM: {
            gameStart: {
                playByPlay: [
                    "CITIZENS OF ROME! The gladiatorial games BEGIN!",
                    "From the Senate to the streets - all Rome gathers! LET THE GAMES COMMENCE!",
                    "By order of the Emperor - the arena awakens!",
                    "Ave, competitors! May Mars guide your hands!",
                    "The Coliseum roars with anticipation! FIGHT WITH HONOR!"
                ],
                color: [
                    "The augurs predict a fierce battle today.",
                    "I've consulted the oracles. Victory favors the bold.",
                    "The Senate has placed significant wagers, I hear.",
                    "May the gods of strategy smile upon the worthy.",
                    "Rome demands entertainment. These gladiators shall deliver."
                ]
            },
            
            captureNormal: {
                playByPlay: [
                    "{hunter} VANQUISHES {victim}!",
                    "STRIKE! {hunter} sends {victim} to the dungeons!",
                    "BY JUPITER! {hunter} defeats {victim} in combat!",
                    "{hunter} claims VICTORY over {victim}!",
                    "THUMBS DOWN for {victim}! Captured by {hunter}!"
                ],
                color: [
                    "The crowd roars for {hunter}!",
                    "A tactical strike worthy of Caesar's generals!",
                    "Brutal efficiency. The legions would approve.",
                    "From soldier to captive in moments!",
                    "Mars blesses the victor this day!"
                ]
            },
            
            captureEpic: {
                playByPlay: [
                    "GLORY TO {hunter}! {victim} FALLS BEFORE THE MIGHT OF ROME!",
                    "HERCULES HIMSELF WOULD TREMBLE! {hunter} DESTROYS {victim}!",
                    "THE EMPEROR RISES! {hunter} delivers a LEGENDARY strike on {victim}!",
                    "FOR THE GLORY OF THE REPUBLIC! {hunter} ANNIHILATES {victim}!",
                    "A STRIKE FOR THE AGES! {hunter} sends {victim} to the UNDERWORLD!"
                ],
                color: [
                    "The poets will write of this for generations!",
                    "Even the gods pause to witness such glory!",
                    "I shall recommend a triumph parade for {hunter}!",
                    "The very foundations of the Coliseum shake!",
                    "History is written on this sand today!"
                ]
            },
            
            victory: {
                playByPlay: [
                    "AVE IMPERATOR! {winner} IS VICTORIOUS!",
                    "ROMA INVICTA! {winner} CONQUERS ALL!",
                    "THE LAUREL CROWN BELONGS TO {winner}!",
                    "GLORY ETERNAL! {winner} STANDS TRIUMPHANT!",
                    "THE GAMES ARE WON! {winner} - CHAMPION OF ROME!"
                ],
                color: [
                    "A triumph worthy of Caesar himself!",
                    "The Senate shall hear of this magnificence!",
                    "May {winner}'s name echo through eternity!",
                    "Truly a gladiator of legend!",
                    "Rome salutes its champion! AVE!"
                ]
            }
        },
        
        // Fibonacci theme dialogue - Mathematical commentary
        FIBONACCI: {
            gameStart: {
                playByPlay: [
                    "Welcome to the Golden Spiral Arena! I'm Professor Phi with Dr. Fibonacci!",
                    "The sequence begins: 1, 1, 2, 3, 5, 8... Let the mathematical games commence!",
                    "Phi equals 1.618033... and THIS equals excitement! Welcome!",
                    "From the mind of Leonardo of Pisa, we bring you... FASTTRACK!",
                    "The golden ratio governs all. Let us observe its majesty unfold!"
                ],
                color: [
                    "Indeed Professor. The probabilities are... infinite.",
                    "I'm calculating the optimal strategies as we speak.",
                    "Each move follows a natural progression. Fascinating.",
                    "The beauty of mathematics is about to be demonstrated.",
                    "Let us witness the elegance of numerical harmony."
                ]
            },
            
            move: {
                playByPlay: [
                    "{player} advances through the sequence!",
                    "A calculated move from {player}!",
                    "{player} follows the spiral!",
                    "The pattern continues with {player}!"
                ],
                color: [
                    "Statistically sound positioning.",
                    "A move that would make Fibonacci proud.",
                    "The golden ratio would approve.",
                    "Mathematically elegant!"
                ]
            },
            
            fasttrack: {
                playByPlay: [
                    "EXPONENTIAL GROWTH! {player} FAST TRACKS!",
                    "THE SEQUENCE ACCELERATES! {player}!",
                    "PHI-NOMENAL! {player} SPIRALS FORWARD!",
                    "FIBONACCI WOULD BE ASTOUNDED! {player} FAST TRACKS!",
                    "THE GOLDEN LEAP! {player} DEFIES LINEAR PROGRESSION!"
                ],
                color: [
                    "That's growth beyond polynomial - simply exponential!",
                    "The ratio of success to failure approaches infinity!",
                    "A quantum leap in the sequence!",
                    "Magnificent! The spiral tightens!",
                    "That move transcends ordinary mathematics!"
                ]
            },
            
            bullseye: {
                playByPlay: [
                    "BULLSEYE! {player} HITS THE CENTER OF THE SPIRAL!",
                    "THE ORIGIN POINT! {player} ACHIEVES PERFECT CONVERGENCE!",
                    "MATHEMATICAL PRECISION! {player} NAILS THE BULLSEYE!",
                    "THE GOLDEN CENTER! {player} FINDS THE FOCAL POINT!"
                ],
                color: [
                    "The probability of that was exactly 1/φ squared!",
                    "Perfect aim. Perfect mathematics. Perfect execution.",
                    "They've found the very heart of the nautilus!",
                    "That's where all spirals converge - magnificent!"
                ]
            },
            
            capture: {
                playByPlay: [
                    "{hunter} ELIMINATES {victim} FROM THE SEQUENCE!",
                    "SUBTRACTION! {hunter} SENDS {victim} BACK TO ZERO!",
                    "{hunter} FACTORS OUT {victim}!",
                    "THE EQUATION CHANGES! {victim} RETURNS TO ORIGIN!"
                ],
                color: [
                    "A reduction in the terms of play!",
                    "The sequence must sometimes... reset.",
                    "Division occurs. The remainder returns home.",
                    "Brutal mathematics, but elegant nonetheless!"
                ]
            },
            
            victory: {
                playByPlay: [
                    "{winner} COMPLETES THE SEQUENCE! VICTORY!",
                    "THE PERFECT SUM! {winner} ACHIEVES MATHEMATICAL GLORY!",
                    "QED! {winner} HAS PROVEN SUPERIORITY!",
                    "THE GOLDEN CHAMPION! {winner} SPIRALS TO VICTORY!",
                    "{winner} - MASTER OF THE FIBONACCI SEQUENCE!"
                ],
                color: [
                    "A proof as elegant as Euler's identity!",
                    "The theorem is complete. {winner} demonstrated excellence.",
                    "From 1, 1, 2, 3, 5, 8, 13, 21... to TRIUMPH!",
                    "φ would be proud. Simply beautiful mathematics.",
                    "The golden ratio smiles upon this champion!"
                ]
            }
        }
    },
    
    // ============================================================
    // METHODS
    // ============================================================
    
    /**
     * Initialize the commentary system
     */
    init(theme = 'DEFAULT') {
        this.currentTheme = theme;
        console.log('🎙️ [CommentarySubstrate] Initialized');
        console.log(`   Theme: ${theme}`);
        console.log(`   Duo: ${this.getDuo().playByPlay.name} & ${this.getDuo().color.name}`);
    },
    
    /**
     * Get current commentary duo
     */
    getDuo() {
        return this.commentaryDuos[this.currentTheme] || this.commentaryDuos.DEFAULT;
    },
    
    /**
     * Get dialogue library for current theme
     */
    getLibrary() {
        return this.dialogueLibraries[this.currentTheme] || this.dialogueLibraries.DEFAULT;
    },
    
    /**
     * Generate random line from array
     */
    _randomLine(lines) {
        if (!lines || lines.length === 0) return '';
        return lines[Math.floor(Math.random() * lines.length)];
    },
    
    /**
     * Fill in template variables
     */
    _fillTemplate(text, data) {
        let result = text;
        for (const [key, value] of Object.entries(data)) {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value);
        }
        return result;
    },
    
    /**
     * Generate commentary for an event
     */
    generateCommentary(eventType, eventData = {}) {
        const library = this.getLibrary();
        const duo = this.getDuo();
        
        // Get the event's dialogue set
        let dialogueSet = library[eventType];
        if (!dialogueSet) {
            dialogueSet = this.dialogueLibraries.DEFAULT[eventType];
        }
        
        if (!dialogueSet) {
            return {
                playByPlay: { speaker: duo.playByPlay.name, text: "The action continues!" },
                color: { speaker: duo.color.name, text: "Indeed it does." }
            };
        }
        
        const pbpLine = this._fillTemplate(this._randomLine(dialogueSet.playByPlay), eventData);
        const colorLine = this._fillTemplate(this._randomLine(dialogueSet.color), eventData);
        
        return {
            playByPlay: {
                speaker: duo.playByPlay.name,
                text: pbpLine,
                voice: duo.playByPlay.voice,
                displayColor: duo.playByPlay.color
            },
            color: {
                speaker: duo.color.name,
                text: colorLine,
                voice: duo.color.voice,
                displayColor: duo.color.color
            }
        };
    },
    
    /**
     * Queue and speak commentary
     */
    speak(eventType, eventData = {}) {
        const commentary = this.generateCommentary(eventType, eventData);
        
        // Text output
        if (this.textEnabled) {
            this._displayText(commentary);
        }
        
        // Speech output
        if (this.speechEnabled && 'speechSynthesis' in window) {
            this._queueSpeech(commentary);
        }
        
        return commentary;
    },
    
    /**
     * Display commentary text in console
     */
    _displayText(commentary) {
        const pbp = commentary.playByPlay;
        const clr = commentary.color;
        
        console.log(`\n🎤 ${pbp.speaker}: "${pbp.text}"`);
        console.log(`🎙️ ${clr.speaker}: "${clr.text}"\n`);
        
        // Emit event for UI to pick up
        this._emit('commentary', commentary);
    },
    
    /**
     * Queue speech synthesis
     */
    _queueSpeech(commentary) {
        this.commentaryQueue.push(commentary);
        this._processQueue();
    },
    
    _processQueue() {
        if (this.isSpeaking || this.commentaryQueue.length === 0) return;
        
        this.isSpeaking = true;
        const commentary = this.commentaryQueue.shift();
        
        const pbpUtterance = new SpeechSynthesisUtterance(commentary.playByPlay.text);
        pbpUtterance.pitch = commentary.playByPlay.voice.pitch;
        pbpUtterance.rate = commentary.playByPlay.voice.rate;
        pbpUtterance.volume = commentary.playByPlay.voice.volume * 0.8;
        
        pbpUtterance.onend = () => {
            setTimeout(() => {
                const colorUtterance = new SpeechSynthesisUtterance(commentary.color.text);
                colorUtterance.pitch = commentary.color.voice.pitch;
                colorUtterance.rate = commentary.color.voice.rate;
                colorUtterance.volume = commentary.color.voice.volume * 0.8;
                
                colorUtterance.onend = () => {
                    this.isSpeaking = false;
                    this._processQueue();
                };
                
                window.speechSynthesis.speak(colorUtterance);
            }, 250);
        };
        
        window.speechSynthesis.speak(pbpUtterance);
    },
    
    // Event system
    listeners: new Set(),
    on(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },
    _emit(type, data) {
        this.listeners.forEach(cb => {
            try { cb({ type, data }); } 
            catch (e) { console.error('Commentary listener error:', e); }
        });
    },
    
    /**
     * Quick shortcut methods
     */
    gameStart() { return this.speak('gameStart'); },
    move(player, spaces) { return this.speak('move', { player, spaces }); },
    capture(hunter, victim) { return this.speak('captureNormal', { hunter, victim }); },
    epicCapture(hunter, victim) { return this.speak('captureEpic', { hunter, victim }); },
    nearMiss(player) { return this.speak('nearMiss', { player }); },
    fastTrack(player) { return this.speak('fastTrackEntry', { player }); },
    bullseye(player) { return this.speak('bullseyeEntry', { player }); },
    safeZone(player) { return this.speak('safeZoneEntry', { player }); },
    pegFinish(player) { return this.speak('pegFinish', { player }); },
    victory(winner) { return this.speak('victory', { winner }); },
    tension() { return this.speak('tension'); },
    comeback(player) { return this.speak('comeback', { player }); },
    
    /**
     * Set theme
     */
    setTheme(theme) {
        if (this.commentaryDuos[theme]) {
            this.currentTheme = theme;
            const duo = this.getDuo();
            console.log(`🎙️ [Commentary] Now featuring: ${duo.playByPlay.name} & ${duo.color.name}`);
        }
    }
};

// Initialize
CommentarySubstrate.init();

// Export globally
if (typeof window !== 'undefined') {
    window.CommentarySubstrate = CommentarySubstrate;
}

console.log('🎙️ [CommentarySubstrate] Two-announcer system loaded!');
console.log('   Rex Thundervoice 🎤 + Sandy Insights 🎙️');
