/**
 * =========================================
 * 🎬 PROMO MEDIA SUBSTRATE
 * Screenshots, Videos, Animated Previews
 * =========================================
 *
 * Generates promotional content for games:
 * - Animated canvas previews
 * - Screenshot carousels
 * - Video player with fallbacks
 * - Animated GIFs
 */

const PromoMediaSubstrate = (() => {
    // =========================================
    // GAME PROMOTIONAL DATA
    // =========================================
    const gamePromos = {
        'fasttrack-v2': {
            title: 'FastTrack v2.1.0',
            emoji: '🏎️',
            tagline: 'Race. Dominate. Win.',
            description: 'The classic board game reimagined in 3D. Strategize your moves, cut your opponents, and race to victory.',
            colors: {
                primary: '#00b4ff',
                accent: '#ffd700',
                player1: '#ff6b9d',
                player2: '#22d3ee'
            },
            stats: {
                players: '2-6 Players',
                duration: '45 minutes',
                difficulty: 'Medium'
            },
            features: [
                'Real-time multiplayer',
                '3D hexagonal board',
                'AI opponents',
                'Global leaderboards',
                'Cross-platform play'
            ],
            videoUrl: '/fasttrack/promo-video.mp4',
            screenshotUrls: [
                '/fasttrack/screenshot-1.png',
                '/fasttrack/screenshot-2.png',
                '/fasttrack/screenshot-3.png'
            ]
        },
        'brickbreaker-solo': {
            title: 'BrickBreaker3D Solo',
            emoji: '🧱',
            tagline: 'Bounce. Break. Survive.',
            description: 'Smash bricks with precision. Every level brings new challenges. Can you survive them all?',
            colors: {
                primary: '#ff6b9d',
                accent: '#ffd700',
                paddle: '#00b4ff',
                ball: '#22d3ee'
            },
            stats: {
                players: '1 Player',
                duration: '20 minutes',
                difficulty: 'Easy-Hard'
            },
            features: [
                'Arcade classic reimagined',
                'Progressive difficulty',
                '5 starting balls',
                'Power-ups and combos',
                'Endless mode'
            ],
            videoUrl: '/brickbreaker3d/promo-solo.mp4',
            screenshotUrls: [
                '/brickbreaker3d/screenshot-solo-1.png',
                '/brickbreaker3d/screenshot-solo-2.png',
                '/brickbreaker3d/screenshot-solo-3.png'
            ]
        },
        'brickbreaker-multi': {
            title: 'BrickBreaker3D Multiplayer',
            emoji: '🎯',
            tagline: 'Compete. Dominate. Conquer.',
            description: 'Battle up to 3 other players. Every paddle matters. Every ball counts. Who will reign supreme?',
            colors: {
                primary: '#22d3ee',
                accent: '#ffd700',
                arena: '#6366f1',
                competitive: '#ff6b9d'
            },
            stats: {
                players: '2-4 Players',
                duration: '25 minutes',
                difficulty: 'Hard'
            },
            features: [
                'Competitive multiplayer',
                'Dynamic arena scaling',
                'Shared ball physics',
                'Real-time scoring',
                'Tournament mode'
            ],
            videoUrl: '/brickbreaker3d/promo-multi.mp4',
            screenshotUrls: [
                '/brickbreaker3d/screenshot-multi-1.png',
                '/brickbreaker3d/screenshot-multi-2.png',
                '/brickbreaker3d/screenshot-multi-3.png'
            ]
        }
    };

    // =========================================
    // ANIMATED CANVAS PREVIEW
    // =========================================
    const createAnimatedPreview = (gameId, canvasId) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const promo = gamePromos[gameId];
        if (!promo) return;

        // Set canvas size
        canvas.width = 800;
        canvas.height = 450;

        // Animation state
        let animationFrame = 0;

        function drawFrame() {
            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#0a0a14');
            gradient.addColorStop(1, '#1a1a2e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Game-specific animation
            if (gameId === 'fasttrack-v2') {
                drawFastTrackPreview(ctx, canvas.width, canvas.height, animationFrame);
            } else if (gameId === 'brickbreaker-solo') {
                drawBrickBreakerSoloPreview(ctx, canvas.width, canvas.height, animationFrame);
            } else if (gameId === 'brickbreaker-multi') {
                drawBrickBreakerMultiPreview(ctx, canvas.width, canvas.height, animationFrame);
            }

            // Title overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, canvas.height - 80, canvas.width, 80);

            ctx.fillStyle = promo.colors.primary;
            ctx.font = 'bold 32px Orbitron';
            ctx.textAlign = 'left';
            ctx.fillText(promo.emoji + ' ' + promo.title, 20, canvas.height - 35);

            ctx.fillStyle = promo.colors.accent;
            ctx.font = '18px Rajdhani';
            ctx.fillText(promo.tagline, 20, canvas.height - 10);

            animationFrame = (animationFrame + 1) % 120;
        }

        const animate = () => {
            drawFrame();
            requestAnimationFrame(animate);
        };

        animate();
    };

    // =========================================
    // GAME-SPECIFIC PREVIEWS
    // =========================================

    const drawFastTrackPreview = (ctx, w, h, frame) => {
        // Animated hexagon board
        const centerX = w / 2;
        const centerY = h / 2;
        const radius = 80;

        // Draw rotating hexagons
        for (let i = 0; i < 3; i++) {
            const rotation = (frame * 2 + i * 120) % 360;
            const scale = 1 + Math.sin(frame * 0.1 + i) * 0.2;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.scale(scale, scale);

            const color = [
                '#ff6b9d',
                '#22d3ee',
                '#ffd700'
            ][i];

            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.7 - i * 0.15;

            // Draw hexagon
            ctx.beginPath();
            for (let j = 0; j < 6; j++) {
                const angle = (j * 60 * Math.PI) / 180;
                const x = Math.cos(angle) * (radius - i * 30);
                const y = Math.sin(angle) * (radius - i * 30);
                if (j === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();

            ctx.restore();
        }

        // Animated players orbiting
        const players = [
            { color: '#ff6b9d', offset: 0 },
            { color: '#22d3ee', offset: 90 },
            { color: '#ffd700', offset: 180 },
            { color: '#6366f1', offset: 270 }
        ];

        players.forEach(player => {
            const angle = ((frame + player.offset) * 3) * (Math.PI / 180);
            const x = centerX + Math.cos(angle) * 150;
            const y = centerY + Math.sin(angle) * 150;

            // Draw player token
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.fill();

            // Glow effect
            ctx.strokeStyle = player.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
    };

    const drawBrickBreakerSoloPreview = (ctx, w, h, frame) => {
        const paddleX = w / 2 + Math.sin(frame * 0.05) * 100;
        const paddleY = h - 60;

        // Draw bricks
        const brickColors = ['#ff6b9d', '#22d3ee', '#ffd700', '#6366f1', '#00b4ff'];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 6; col++) {
                const x = col * (w / 6) + 20;
                const y = row * 40 + 40 + Math.sin(frame * 0.02 + row) * 10;

                ctx.fillStyle = brickColors[(row + col) % brickColors.length];
                ctx.globalAlpha = 0.8;
                ctx.fillRect(x, y, w / 6 - 10, 30);

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.5;
                ctx.strokeRect(x, y, w / 6 - 10, 30);
            }
        }

        ctx.globalAlpha = 1;

        // Draw paddle
        ctx.fillStyle = '#00b4ff';
        ctx.fillRect(paddleX - 50, paddleY, 100, 12);

        // Draw ball
        const ballX = w / 2 + Math.sin(frame * 0.08) * 200;
        const ballY = h / 2 + Math.cos(frame * 0.06) * 150;

        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
        ctx.fill();

        // Ball glow
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(ballX, ballY, 16, 0, Math.PI * 2);
        ctx.stroke();
    };

    const drawBrickBreakerMultiPreview = (ctx, w, h, frame) => {
        // Four paddles, one per corner
        const paddles = [
            { x: w / 4 - 50, y: h - 30, color: '#ff6b9d', orbitOffset: 0 },
            { x: w - w / 4 - 50, y: h - 30, color: '#22d3ee', orbitOffset: 90 },
            { x: w / 4 - 50, y: 20, color: '#ffd700', orbitOffset: 180 },
            { x: w - w / 4 - 50, y: 20, color: '#6366f1', orbitOffset: 270 }
        ];

        // Draw arena border
        ctx.strokeStyle = '#00b4ff';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.7;
        ctx.strokeRect(20, 20, w - 40, h - 40);

        // Draw paddles
        paddles.forEach(paddle => {
            const wobble = Math.sin(frame * 0.05 + paddle.orbitOffset) * 20;
            ctx.fillStyle = paddle.color;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(paddle.x + wobble, paddle.y, 100, 12);

            // Glow
            ctx.strokeStyle = paddle.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.4;
            ctx.strokeRect(paddle.x + wobble, paddle.y, 100, 12);
        });

        // Draw multiple balls orbiting
        for (let i = 0; i < 3; i++) {
            const angle = ((frame + i * 120) * 2) * (Math.PI / 180);
            const x = w / 2 + Math.cos(angle) * 120;
            const y = h / 2 + Math.sin(angle) * 100;

            ctx.fillStyle = '#ffd700';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();

            // Trail
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    };

    // =========================================
    // VIDEO PLAYER HTML
    // =========================================
    const createVideoPlayer = (gameId) => {
        const promo = gamePromos[gameId];
        if (!promo) return '';

        return `
            <div style="
                position: relative;
                width: 100%;
                padding-bottom: 56.25%;
                background: #000;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 10px 40px rgba(0, 180, 255, 0.3);
            ">
                <video style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 16px;
                " controls poster="/assets/poster-${gameId}.jpg">
                    <source src="${promo.videoUrl}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>

                <!-- Fallback if video not available -->
                <canvas id="preview-${gameId}" style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: none;
                "></canvas>
            </div>
        `;
    };

    // =========================================
    // SCREENSHOT CAROUSEL
    // =========================================
    const createScreenshotCarousel = (gameId) => {
        const promo = gamePromos[gameId];
        if (!promo || !promo.screenshotUrls) return '';

        const carouselId = `carousel-${gameId}`;

        return `
            <div id="${carouselId}" style="
                position: relative;
                width: 100%;
                background: #1a1a2e;
                border-radius: 16px;
                overflow: hidden;
            ">
                <!-- Screenshots -->
                <div style="position: relative; width: 100%; padding-bottom: 56.25%;">
                    ${promo.screenshotUrls
                .map(
                    (url, i) => {
                        const isFirst = i === 0;
                        const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
                        return `
                        <img
                            src="${isFirst ? url : placeholder}"
                            data-src="${isFirst ? '' : url}"
                            alt="Screenshot ${i + 1}"
                            loading="${isFirst ? 'eager' : 'lazy'}"
                            decoding="async"
                            fetchpriority="${isFirst ? 'high' : 'low'}"
                            style="
                                position: absolute;
                                top: 0;
                                left: 0;
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                                opacity: ${isFirst ? 1 : 0};
                                transition: opacity 0.5s;
                            "
                            class="carousel-image"
                            data-index="${i}">
                    `;
                    }
                )
                .join('')}
                </div>

                <!-- Navigation -->
                <div style="
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    gap: 12px;
                    z-index: 10;
                ">
                    ${promo.screenshotUrls
                .map(
                    (_, i) => `
                        <button onclick="document.querySelector('#${carouselId}').setAttribute('data-slide', '${i}')" style="
                            width: 10px;
                            height: 10px;
                            border-radius: 50%;
                            background: ${i === 0 ? '#00b4ff' : 'rgba(0, 180, 255, 0.5)'};
                            border: none;
                            cursor: pointer;
                            transition: background 0.3s;
                        "></button>
                    `
                )
                .join('')}
                </div>

                <script>
                    (function() {
                        const carousel = document.getElementById('${carouselId}');

                        const ensureLoaded = (index) => {
                            const img = carousel.querySelector(`.carousel - image[data - index="${index}"]`);
                            if (!img) return;
                            const ds = img.getAttribute('data-src');
                            if (ds && img.getAttribute('src') && img.getAttribute('src').startsWith('data:image')) {
                                img.setAttribute('src', ds);
                                img.setAttribute('data-src', '');
                            }
                        };

                        const applySlide = () => {
                            const slide = parseInt(carousel.getAttribute('data-slide') || '0', 10) || 0;
                            ensureLoaded(slide);
                            carousel.querySelectorAll('.carousel-image').forEach((img, i) => {
                                img.style.opacity = i === slide ? 1 : 0;
                            });
                        };

                        carousel.addEventListener('click', function(e) {
                            if (e.offsetX < carousel.offsetWidth / 2) {
                                // Previous
                                const current = carousel.getAttribute('data-slide') || 0;
                                const prev = (parseInt(current) - 1 + ${promo.screenshotUrls.length}) % ${promo.screenshotUrls.length};
                                carousel.setAttribute('data-slide', prev);
                            } else {
                                // Next
                                const current = carousel.getAttribute('data-slide') || 0;
                                const next = (parseInt(current) + 1) % ${promo.screenshotUrls.length};
                                carousel.setAttribute('data-slide', next);
                            }
                        });

                        // Observe slide changes reliably (no non-standard events).
                        const mo = new MutationObserver(applySlide);
                        mo.observe(carousel, { attributes: true, attributeFilter: ['data-slide'] });

                        // Initialize
                        applySlide();
                    })();
                </script>
            </div>
        `;
    };

    // =========================================
    // GAME INFO CARD
    // =========================================
    const createGameInfoCard = (gameId) => {
        const promo = gamePromos[gameId];
        if (!promo) return '';

        return `
            <div style="
                background: var(--bg-card);
                border: 2px solid var(--primary);
                border-radius: 16px;
                padding: 30px;
                max-width: 400px;
            ">
                <h3 style="
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    margin-bottom: 15px;
                    color: var(--primary);
                ">${promo.emoji} ${promo.title}</h3>

                <p style="
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--accent);
                    margin-bottom: 20px;
                ">${promo.tagline}</p>

                <p style="
                    color: var(--text-muted);
                    line-height: 1.8;
                    margin-bottom: 20px;
                ">${promo.description}</p>

                <div style="
                    background: rgba(0, 180, 255, 0.1);
                    border-radius: 12px;
                    padding: 15px;
                    margin-bottom: 20px;
                    font-size: 14px;
                ">
                    <div style="margin-bottom: 8px;"><strong style="color: var(--primary);">👥</strong> ${promo.stats.players}</div>
                    <div style="margin-bottom: 8px;"><strong style="color: var(--primary);">⏱️</strong> ${promo.stats.duration}</div>
                    <div><strong style="color: var(--primary);">📊</strong> ${promo.stats.difficulty}</div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h4 style="color: var(--primary); margin-bottom: 10px;">Features:</h4>
                    ${promo.features
                .map(
                    feature => `
                        <div style="
                            font-size: 14px;
                            color: var(--text-muted);
                            margin-bottom: 8px;
                            padding-left: 20px;
                            position: relative;
                        ">
                            <span style="
                                position: absolute;
                                left: 0;
                                color: var(--accent);
                            ">✓</span>
                            ${feature}
                        </div>
                    `
                )
                .join('')}
                </div>

                <button onclick="launchGame('${gameId}', '${promo.title}')" style="
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    color: #000;
                    border: none;
                    border-radius: 8px;
                    font-family: 'Rajdhani', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s;
                " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    ▶️ Play Now
                </button>
            </div>
        `;
    };

    // =========================================
    // PUBLIC API
    // =========================================
    return {
        getGamePromos: () => gamePromos,
        createAnimatedPreview: createAnimatedPreview,
        createVideoPlayer: createVideoPlayer,
        createScreenshotCarousel: createScreenshotCarousel,
        createGameInfoCard: createGameInfoCard,
        getPromo: (gameId) => gamePromos[gameId]
    };
})();

// Export to global scope
window.PromoMediaSubstrate = PromoMediaSubstrate;
