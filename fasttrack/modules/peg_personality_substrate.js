/**
 * Peg Personality Substrate
 * 
 * Pegs are autonomous NPCs with emotions and personalities.
 * They react to game events with expressive animations and sounds.
 */

const PegPersonalitySubstrate = (function() {
    'use strict';
    
    // Personality types
    const PERSONALITIES = {
        brave:    { jumpHeight: 1.5, celebrateDuration: 1.2, sadDuration: 1.5, color: 0xff6b6b },
        shy:      { jumpHeight: 0.8, celebrateDuration: 0.6, sadDuration: 2.0, color: 0x6bcfff },
        eager:    { jumpHeight: 2.0, celebrateDuration: 1.5, sadDuration: 1.0, color: 0xffd93d },
        cool:     { jumpHeight: 1.0, celebrateDuration: 0.8, sadDuration: 1.2, color: 0x6bff6b },
        dramatic: { jumpHeight: 2.5, celebrateDuration: 2.0, sadDuration: 2.5, color: 0xff6bff }
    };
    
    // Emotion states
    const EMOTIONS = {
        idle: 'idle',
        excited: 'excited',
        celebrating: 'celebrating',
        nervous: 'nervous',
        sad: 'sad',
        defeated: 'defeated',
        victorious: 'victorious'
    };
    
    // Peg personality registry
    const personalities = new Map();
    
    /**
     * Assign personality to peg
     */
    function assignPersonality(pegId) {
        const types = Object.keys(PERSONALITIES);
        const type = types[Math.floor(Math.random() * types.length)];
        const personality = {
            type,
            ...PERSONALITIES[type],
            emotion: EMOTIONS.idle,
            idleTimer: 0,
            idleAnimation: null
        };
        personalities.set(pegId, personality);
        return personality;
    }
    
    /**
     * Get peg personality
     */
    function getPersonality(pegId) {
        if (!personalities.has(pegId)) {
            return assignPersonality(pegId);
        }
        return personalities.get(pegId);
    }
    
    /**
     * Set peg emotion
     */
    function setEmotion(pegId, emotion) {
        const p = getPersonality(pegId);
        p.emotion = emotion;
        return p;
    }
    
    /**
     * Animate peg jump between holes (hop hop hop)
     */
    function animateJump(mesh, fromPos, toPos, steps, onComplete) {
        const personality = mesh.userData.personality || getPersonality(mesh.userData.pegId);
        const jumpHeight = personality.jumpHeight || 1.5;
        
        // Calculate intermediate positions (one jump per hole)
        const dx = (toPos.x - fromPos.x) / steps;
        const dz = (toPos.z - fromPos.z) / steps;
        
        let currentStep = 0;
        const hopDuration = 200; // ms per hop
        
        function doHop() {
            if (currentStep >= steps) {
                mesh.position.set(toPos.x, 0.5, toPos.z);
                mesh.scale.set(1, 1, 1);
                onComplete?.();
                return;
            }
            
            const startX = fromPos.x + dx * currentStep;
            const startZ = fromPos.z + dz * currentStep;
            const endX = fromPos.x + dx * (currentStep + 1);
            const endZ = fromPos.z + dz * (currentStep + 1);
            
            const startTime = performance.now();
            
            function animateHop() {
                const elapsed = performance.now() - startTime;
                const t = Math.min(elapsed / hopDuration, 1);
                
                // Ease out bounce
                const ease = 1 - Math.pow(1 - t, 2);
                
                // Position
                const x = startX + (endX - startX) * ease;
                const z = startZ + (endZ - startZ) * ease;
                
                // Arc height
                const arcT = t * 2 - 1; // -1 to 1
                const y = 0.5 + jumpHeight * (1 - arcT * arcT);
                
                // Squash and stretch
                const squash = 1 + 0.3 * Math.sin(t * Math.PI);
                mesh.scale.set(1 / squash, squash, 1 / squash);
                
                mesh.position.set(x, y, z);
                
                if (t < 1) {
                    requestAnimationFrame(animateHop);
                } else {
                    currentStep++;
                    // Small bounce on land
                    setTimeout(doHop, 50);
                }
            }
            
            animateHop();
        }
        
        doHop();
    }
    
    /**
     * Celebrate animation (jump and spin)
     */
    function animateCelebrate(mesh, intensity = 1) {
        const personality = mesh.userData.personality || getPersonality(mesh.userData.pegId);
        const duration = personality.celebrateDuration * 1000;
        const startTime = performance.now();
        const startY = mesh.position.y;
        const jumps = Math.ceil(intensity * 3);
        
        function animate() {
            const elapsed = performance.now() - startTime;
            const t = elapsed / duration;
            
            if (t >= 1) {
                mesh.position.y = 0.5;
                mesh.rotation.y = 0;
                mesh.scale.set(1, 1, 1);
                return;
            }
            
            // Multiple jumps
            const jumpPhase = (t * jumps) % 1;
            const jumpHeight = 1.5 * intensity * (1 - t);
            mesh.position.y = startY + Math.sin(jumpPhase * Math.PI) * jumpHeight;
            
            // Spin
            mesh.rotation.y = t * Math.PI * 4 * intensity;
            
            // Pulse scale
            const pulse = 1 + 0.2 * Math.sin(t * Math.PI * 6);
            mesh.scale.set(pulse, pulse, pulse);
            
            requestAnimationFrame(animate);
        }
        
        animate();
        playSound('celebrate');
    }
    
    /**
     * Defeated animation (sad arc back to home)
     */
    function animateDefeated(mesh, fromPos, toPos, onComplete) {
        const personality = mesh.userData.personality || getPersonality(mesh.userData.pegId);
        const duration = personality.sadDuration * 1000;
        const startTime = performance.now();

        // High dramatic arc
        const arcHeight = 8 + Math.random() * 4;

        // Start wobbling sadly
        mesh.userData.wobbling = true;

        playSound('defeated');

        function animate() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Ease in out
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // Position - high arc
            const x = fromPos.x + (toPos.x - fromPos.x) * ease;
            const z = fromPos.z + (toPos.z - fromPos.z) * ease;
            const arcT = t * 2 - 1;
            const y = 0.5 + arcHeight * (1 - arcT * arcT);

            mesh.position.set(x, y, z);

            // Sad tilt
            mesh.rotation.x = Math.sin(elapsed * 0.01) * 0.3;
            mesh.rotation.z = Math.cos(elapsed * 0.012) * 0.2;

            // Shrink slightly (feeling small)
            const shrink = 1 - 0.2 * Math.sin(t * Math.PI);
            mesh.scale.set(shrink, shrink * 0.9, shrink);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                mesh.position.set(toPos.x, 0.5, toPos.z);
                mesh.rotation.set(0, 0, 0);
                mesh.scale.set(1, 1, 1);
                mesh.userData.wobbling = false;

                // Sad bounce on landing
                animateSadLanding(mesh);
                onComplete?.();
            }
        }

        animate();
    }

    /**
     * Sad landing (deflated bounce)
     */
    function animateSadLanding(mesh) {
        const startTime = performance.now();
        const duration = 500;

        function animate() {
            const t = (performance.now() - startTime) / duration;
            if (t >= 1) {
                mesh.scale.set(1, 1, 1);
                return;
            }

            // Deflated squash
            const squash = 1 - 0.3 * Math.sin(t * Math.PI) * (1 - t);
            mesh.scale.set(1.1 - squash * 0.1, squash, 1.1 - squash * 0.1);

            requestAnimationFrame(animate);
        }
        animate();
    }

    /**
     * Idle animation (subtle bobbing)
     */
    function startIdleAnimation(mesh) {
        const personality = mesh.userData.personality || getPersonality(mesh.userData.pegId);
        const offset = Math.random() * Math.PI * 2;

        function animate() {
            if (!mesh.userData.idleEnabled) return;

            const time = performance.now() * 0.001;

            // Subtle bob
            mesh.position.y = 0.5 + Math.sin(time * 2 + offset) * 0.03;

            // Slight rotation
            mesh.rotation.y = Math.sin(time * 0.5 + offset) * 0.1;

            // Looking around occasionally
            if (Math.random() < 0.001) {
                const lookDir = (Math.random() - 0.5) * 0.3;
                mesh.rotation.z = lookDir;
                setTimeout(() => { mesh.rotation.z = 0; }, 500);
            }

            requestAnimationFrame(animate);
        }

        mesh.userData.idleEnabled = true;
        animate();
    }

    /**
     * Stop idle animation
     */
    function stopIdleAnimation(mesh) {
        mesh.userData.idleEnabled = false;
    }

    /**
     * Excited wiggle (about to move)
     */
    function animateExcited(mesh) {
        const startTime = performance.now();
        const duration = 300;

        function animate() {
            const t = (performance.now() - startTime) / duration;
            if (t >= 1) {
                mesh.rotation.z = 0;
                return;
            }

            // Quick wiggle
            mesh.rotation.z = Math.sin(t * Math.PI * 8) * 0.2 * (1 - t);
            mesh.scale.y = 1 + Math.sin(t * Math.PI * 4) * 0.1;

            requestAnimationFrame(animate);
        }
        animate();
    }

    /**
     * Sound effects
     */
    function playSound(type) {
        // Web Audio API for sounds
        if (!window.AudioContext && !window.webkitAudioContext) return;

        const ctx = window.pegAudioCtx || (window.pegAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        switch(type) {
            case 'celebrate':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
                osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
                osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialDecayTo(0.01, ctx.currentTime + 0.4);
                osc.start(); osc.stop(ctx.currentTime + 0.4);
                break;

            case 'defeated':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(392, ctx.currentTime); // G4
                osc.frequency.setValueAtTime(330, ctx.currentTime + 0.2); // E4
                osc.frequency.setValueAtTime(262, ctx.currentTime + 0.4); // C4
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.6);
                osc.start(); osc.stop(ctx.currentTime + 0.6);
                break;

            case 'hop':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440 + Math.random() * 100, ctx.currentTime);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialDecayTo(0.01, ctx.currentTime + 0.1);
                osc.start(); osc.stop(ctx.currentTime + 0.1);
                break;
        }
    }

    // Public API
    return {
        PERSONALITIES,
        EMOTIONS,
        assignPersonality,
        getPersonality,
        setEmotion,
        animateJump,
        animateCelebrate,
        animateDefeated,
        animateSadLanding,
        startIdleAnimation,
        stopIdleAnimation,
        animateExcited,
        playSound
    };
})();

if (typeof module !== 'undefined') module.exports = PegPersonalitySubstrate;

