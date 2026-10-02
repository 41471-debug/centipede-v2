// ============================================================
//  CLASSIC ARCADE CENTIPEDE - Full Game Engine
//  Authentic 8-bit pixel art style with all classic enemies
// ============================================================

(() => {
    'use strict';

    // --- Canvas Setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const GAME_W = 480;
    const GAME_H = 640;
    canvas.width = GAME_W;
    canvas.height = GAME_H;

    // --- Grid Constants ---
    const TILE = 16; // pixel grid size
    const COLS = Math.floor(GAME_W / TILE);  // 30
    const ROWS = Math.floor(GAME_H / TILE);  // 40
    const HUD_ROWS = 2;       // top HUD rows
    const PLAYER_ZONE = 4;    // bottom rows for player movement
    const BORDER_W = 1;       // vine border tiles

    // --- Colors (Classic Palette) ---
    const C = {
        BLACK: '#000000',
        WHITE: '#ffffff',
        GREEN: '#00cc41',
        GREEN_DARK: '#009922',
        GREEN_LIGHT: '#44ff66',
        RED: '#dd2222',
        RED_DARK: '#991111',
        RED_BRIGHT: '#ff3333',
        YELLOW: '#ffcc00',
        YELLOW_BRIGHT: '#ffee44',
        ORANGE: '#ff8800',
        BROWN: '#886622',
        MAGENTA: '#cc44cc',
        CYAN: '#00cccc',
        GRAY: '#888888',
        DARK_GRAY: '#444444',
    };

    // --- Game State ---
    let state = 'START'; // START, PLAYING, PAUSED, GAME_OVER, LEVEL_CLEAR
    let score = 0;
    let highScore = parseInt(localStorage.getItem('centipede_high') || '0');
    let lives = 3;
    let level = 1;
    let frameCount = 0;
    let centipedeStuckTimer = 0;  // safeguard: frames since last centipede movement
    let lastCentipedeHash = '';   // track centipede positions to detect stuck state
    const STUCK_THRESHOLD = 600;  // ~10 seconds at 60fps

    // --- Input ---
    const keys = {};
    let touchStartX = 0, touchStartY = 0;
    let touchActive = false;

    // --- Entities ---
    let player = null;
    let bullets = [];
    let mushrooms = []; // 2D grid: mushrooms[row][col] = health (0-4, 0=none)
    let centipedes = [];
    let spider = null;
    let scorpion = null;
    let flea = null;
    let explosions = [];
    let scorePopups = [];

    // --- Sound (simple oscillator-based) ---
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    function playTone(freq, duration, type = 'square', volume = 0.08) {
        if (!audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(volume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) { /* ignore audio errors */ }
    }
    function sfxShoot() { playTone(880, 0.05, 'square', 0.06); }
    function sfxHit() { playTone(220, 0.1, 'sawtooth', 0.07); }
    function sfxDie() {
        playTone(300, 0.15, 'sawtooth', 0.1);
        setTimeout(() => playTone(150, 0.2, 'sawtooth', 0.1), 100);
    }
    function sfxExplosion() {
        playTone(100, 0.3, 'sawtooth', 0.12);
        setTimeout(() => playTone(60, 0.3, 'sawtooth', 0.08), 100);
    }
    function sfxScore() { playTone(660, 0.06, 'square', 0.05); }

    // ==========================================================
    //  PIXEL DRAWING HELPERS
    // ==========================================================

    function drawPixelRect(x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
    }

    // Draw a sprite from a pixel map (array of strings, each char = pixel)
    // palette maps chars to colors, '.' = transparent
    function drawSprite(x, y, map, palette, scale = 1) {
        const s = scale;
        for (let r = 0; r < map.length; r++) {
            for (let c = 0; c < map[r].length; c++) {
                const ch = map[r][c];
                if (ch !== '.' && palette[ch]) {
                    ctx.fillStyle = palette[ch];
                    ctx.fillRect(Math.floor(x + c * s), Math.floor(y + r * s), s, s);
                }
            }
        }
    }

    // Simple pixel text using the canvas font
    function drawText(text, x, y, color = C.WHITE, size = 10) {
        ctx.fillStyle = color;
        ctx.font = `${size}px "Press Start 2P", monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, x, y);
    }

    function drawTextCenter(text, x, y, color = C.WHITE, size = 10) {
        ctx.fillStyle = color;
        ctx.font = `${size}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(text, x, y);
    }

    // ==========================================================
    //  SPRITE DEFINITIONS
    // ==========================================================

    const SPRITES = {
        mushroom_full: [
            '....RRRR....',
            '..RRRRRRRR..',
            '.RRRRRRRRRR.',
            'RRRRRWRRRRRR',
            'RRRRRRRRRRRR',
            'RRRWRRRRRRRR',
            '.RRRRRRRRRR.',
            '....GGGG....',
            '....GGGG....',
            '....GGGG....',
        ],
        mushroom_3: [
            '....RRRR....',
            '..RRRRRRRR..',
            '.RRRRRRRRRR.',
            'RRRRRWRRRRRR',
            'RRRRRRRRRRRR',
            '.RRRRRRRRRR.',
            '....GGGG....',
            '....GGGG....',
        ],
        mushroom_2: [
            '..RRRRRRRR..',
            '.RRRRRRRRRR.',
            'RRRRRRRRRRRR',
            '.RRRRRRRRRR.',
            '....GGGG....',
            '....GGGG....',
        ],
        mushroom_1: [
            '.RRRRRRRRRR.',
            'RRRRRRRRRRRR',
            '....GGGG....',
            '....GGGG....',
        ],
        // Poisoned mushroom (touched by scorpion)
        mushroom_poison: [
            '....PPPP....',
            '..PPPPPPPP..',
            '.PPPPPPPPPP.',
            'PPPPPWPPPPPP',
            'PPPPPPPPPPPP',
            'PPPWPPPPPPPP',
            '.PPPPPPPPPP.',
            '....GGGG....',
            '....GGGG....',
            '....GGGG....',
        ],
        player: [
            '......WW......',
            '.....WWWW.....',
            '.....WWWW.....',
            '....WWWWWW....',
            '...RWWWWWWR...',
            '..RRWWWWWWRR..',
            '..RWWWWWWWWR..',
            '.RWWWWWWWWWWR.',
            '.RWWWWWWWWWWR.',
            'RRWWWWWWWWWWRR',
            'RWWWWWWWWWWWWR',
            '..RR......RR..',
        ],
        centipede_head: [
            '..YYYYY..',
            '.YYYYYYYY',
            'YYYRRYRYY',
            'YYYRRYRYY',
            'YYYYYYYYY',
            '.YYYGGYYY',
            '.YYYYYYY.',
            '..YYYYY..',
        ],
        centipede_body: [
            '..GGGGG..',
            '.GGGGGGG.',
            'GGGDGDGGG',
            'GGGGGGGGG',
            'GGGGGGGGG',
            'GGGDGDGGG',
            '.GGGGGGG.',
            '..GGGGG..',
        ],
        spider: [
            'L..YYYY..L',
            '.L.YRYRY.L',
            '.LYYYYYYL.',
            'L.YYYYYY.L',
            '.LYYYYYYL.',
            'L.YYYYYY.L',
            '.L.YYYY.L.',
            'L...YY...L',
        ],
        scorpion: [
            '..........RR',
            'R..RRRRRRRR.',
            'RR.RRRWRRR..',
            '.RRRRRRRRRR.',
            '..RRRRRRRR..',
            '.RR.RR.RR.R.',
            'R..R..R..R..R',
        ],
        flea: [
            '..GG..',
            '.GGGG.',
            'GGRGRG',
            'GGGGGG',
            '.GGGG.',
            '.G..G.',
            'G....G',
        ],
        ladybug: [
            '.RRR.',
            'RKRKR',
            'RKRKR',
            'RKRKR',
            '.RRR.',
        ],
        life_icon: [
            '.WW.',
            'RWWR',
            'RWWR',
            '.RR.',
        ],
    };

    const PALETTES = {
        mushroom: { 'R': C.RED, 'G': C.GREEN, 'W': C.WHITE },
        mushroom_poison: { 'P': C.MAGENTA, 'G': C.GREEN, 'W': C.WHITE },
        player: { 'W': C.WHITE, 'R': C.RED },
        centipede_head: { 'Y': C.YELLOW, 'R': C.RED, 'G': C.GREEN },
        centipede_body: { 'G': C.GREEN, 'D': C.GREEN_DARK },
        spider: { 'Y': C.YELLOW_BRIGHT, 'R': C.RED, 'L': C.BLACK },
        scorpion: { 'R': C.RED_BRIGHT, 'W': C.WHITE },
        flea: { 'G': C.GREEN_LIGHT, 'R': C.RED },
        ladybug: { 'R': C.RED, 'K': C.BLACK },
        life: { 'W': C.WHITE, 'R': C.RED },
    };

    // ==========================================================
    //  VINE BORDER DRAWING
    // ==========================================================

    function drawVineBorder() {
        // Left and right vine borders
        for (let row = HUD_ROWS; row < ROWS; row++) {
            const y = row * TILE;
            // Left vine
            drawVineTile(0, y, row);
            // Right vine
            drawVineTile(GAME_W - TILE, y, row + 5);
        }
        // Top border under HUD
        for (let col = 0; col < COLS; col++) {
            drawLeafTile(col * TILE, HUD_ROWS * TILE - 4, col);
        }
    }

    function drawVineTile(x, y, seed) {
        // Vine stem
        const cx = x + 7 + Math.sin(seed * 0.8) * 3;
        drawPixelRect(cx, y, 2, TILE, C.GREEN_DARK);

        // Leaves
        if (seed % 3 === 0) {
            drawPixelRect(cx - 4, y + 2, 4, 2, C.GREEN);
            drawPixelRect(cx - 5, y + 4, 3, 1, C.GREEN);
        }
        if (seed % 4 === 1) {
            drawPixelRect(cx + 2, y + 6, 4, 2, C.GREEN);
            drawPixelRect(cx + 3, y + 8, 3, 1, C.GREEN);
        }
        if (seed % 5 === 0) {
            drawPixelRect(cx - 3, y + 10, 3, 2, C.GREEN_LIGHT);
        }
    }

    function drawLeafTile(x, y, seed) {
        if (seed % 2 === 0) {
            drawPixelRect(x + 2, y, 4, 2, C.GREEN);
            drawPixelRect(x + 4, y + 2, 3, 2, C.GREEN_DARK);
        } else {
            drawPixelRect(x + 6, y + 1, 5, 2, C.GREEN);
            drawPixelRect(x + 8, y + 3, 3, 1, C.GREEN_DARK);
        }
    }

    // Ladybug in top-left vine area
    function drawLadybug() {
        const bx = 2;
        const by = HUD_ROWS * TILE + 8 + Math.sin(frameCount * 0.03) * 4;
        drawSprite(bx, by, SPRITES.ladybug, PALETTES.ladybug, 2);
    }

    // ==========================================================
    //  HUD
    // ==========================================================

    function drawHUD() {
        // Background bar
        drawPixelRect(0, 0, GAME_W, HUD_ROWS * TILE, C.BLACK);

        // Player 1 score (left)
        const p1Score = '00000000';
        drawText(p1Score, 8, 6, C.WHITE, 9);

        // Lives
        for (let i = 0; i < lives; i++) {
            drawSprite(8 + i * 18, 20, SPRITES.life_icon, PALETTES.life, 2);
        }

        // Current score (center)
        const scoreStr = String(score).padStart(8, '0');
        drawTextCenter(scoreStr, GAME_W / 2, 6, C.YELLOW, 9);

        // Level
        drawTextCenter(`LVL ${level}`, GAME_W / 2, 20, C.CYAN, 7);

        // High score / Player 2 (right)
        const hiStr = String(highScore).padStart(8, '0');
        drawText(hiStr, GAME_W - 140, 6, C.WHITE, 9);
        drawText('HI', GAME_W - 160, 6, C.RED, 7);
    }

    // ==========================================================
    //  MUSHROOM FIELD
    // ==========================================================

    function initMushrooms() {
        mushrooms = [];
        for (let r = 0; r < ROWS; r++) {
            mushrooms[r] = [];
            for (let c = 0; c < COLS; c++) {
                mushrooms[r][c] = { health: 0, poisoned: false };
            }
        }
        // Random mushrooms in the play field (rows HUD_ROWS+1 to ROWS-PLAYER_ZONE)
        // Phases 1-2: 60% reduction (base 0.048), Phase 3+: gradual +5% per level
        let density;
        if (level <= 2) {
            density = 0.048; // ~20-30 mushrooms total (60% less than original 0.12)
        } else {
            // From phase 3: start at 0.07 and increase 5% per level
            density = 0.07 * Math.pow(1.05, level - 3);
            density = Math.min(density, 0.20); // cap to avoid unplayable density
        }
        for (let r = HUD_ROWS + 1; r < ROWS - PLAYER_ZONE; r++) {
            for (let c = BORDER_W; c < COLS - BORDER_W; c++) {
                if (Math.random() < density) {
                    mushrooms[r][c] = { health: 4, poisoned: false };
                }
            }
        }
    }

    function drawMushrooms() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const m = mushrooms[r][c];
                if (m.health > 0) {
                    const x = c * TILE + 2;
                    const y = r * TILE;
                    let sprite, palette;
                    if (m.poisoned) {
                        sprite = SPRITES.mushroom_poison;
                        palette = PALETTES.mushroom_poison;
                    } else {
                        palette = PALETTES.mushroom;
                        if (m.health === 4) sprite = SPRITES.mushroom_full;
                        else if (m.health === 3) sprite = SPRITES.mushroom_3;
                        else if (m.health === 2) sprite = SPRITES.mushroom_2;
                        else sprite = SPRITES.mushroom_1;
                    }
                    drawSprite(x, y + (TILE - sprite.length), sprite, palette, 1);
                }
            }
        }
    }

    function getMushroom(row, col) {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
        return mushrooms[row][col];
    }

    // ==========================================================
    //  PLAYER
    // ==========================================================

    function initPlayer() {
        player = {
            x: GAME_W / 2 - 7,
            y: GAME_H - TILE * 2,
            w: 14,
            h: 12,
            speed: 3,
            shootCooldown: 0,
            invincible: 0,
        };
    }

    function updatePlayer() {
        if (!player) return;

        const minY = GAME_H - PLAYER_ZONE * TILE;
        const maxY = GAME_H - TILE;
        const minX = BORDER_W * TILE;
        const maxX = GAME_W - BORDER_W * TILE - player.w;

        if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
        if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
        if (keys['ArrowUp'] || keys['w']) player.y -= player.speed;
        if (keys['ArrowDown'] || keys['s']) player.y += player.speed;

        // Clamp
        player.x = Math.max(minX, Math.min(maxX, player.x));
        player.y = Math.max(minY, Math.min(maxY, player.y));

        // Check mushroom collisions for player movement
        const col = Math.floor((player.x + player.w / 2) / TILE);
        const row = Math.floor((player.y + player.h / 2) / TILE);
        const m = getMushroom(row, col);
        if (m && m.health > 0) {
            // Push player away from mushroom
            const mx = col * TILE;
            const my = row * TILE;
            if (player.x + player.w > mx && player.x < mx + TILE) {
                if (player.x < mx) player.x = mx - player.w;
                else player.x = mx + TILE;
            }
        }

        // Shoot
        if (keys[' '] || keys['Space']) {
            if (player.shootCooldown <= 0 && bullets.length < 2) {
                bullets.push({
                    x: player.x + player.w / 2 - 1,
                    y: player.y - 4,
                    w: 2,
                    h: 6,
                    speed: 8,
                });
                player.shootCooldown = 8;
                sfxShoot();
            }
        }
        if (player.shootCooldown > 0) player.shootCooldown--;
        if (player.invincible > 0) player.invincible--;
    }

    function drawPlayer() {
        if (!player) return;
        // Blink when invincible
        if (player.invincible > 0 && frameCount % 6 < 3) return;

        drawSprite(player.x, player.y, SPRITES.player, PALETTES.player, 1);
    }

    function playerDie() {
        if (player.invincible > 0) return;
        sfxDie();
        addExplosion(player.x, player.y);
        lives--;
        if (lives <= 0) {
            state = 'GAME_OVER';
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('centipede_high', String(highScore));
            }
            document.getElementById('final-score-value').textContent = score;
            document.getElementById('game-over-screen').classList.remove('hidden');
        } else {
            // Respawn
            player.x = GAME_W / 2 - 7;
            player.y = GAME_H - TILE * 2;
            player.invincible = 120;
            bullets = [];
            // Restore damaged mushrooms in player zone
            for (let r = ROWS - PLAYER_ZONE; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (mushrooms[r][c].health > 0) {
                        mushrooms[r][c].health = 4;
                    }
                }
            }
        }
    }

    // ==========================================================
    //  BULLETS
    // ==========================================================

    function updateBullets() {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.y -= b.speed;

            // Off screen
            if (b.y < HUD_ROWS * TILE) {
                bullets.splice(i, 1);
                continue;
            }

            // Mushroom collision
            const col = Math.floor((b.x + 1) / TILE);
            const row = Math.floor(b.y / TILE);
            const m = getMushroom(row, col);
            if (m && m.health > 0) {
                m.health--;
                if (m.health <= 0) {
                    m.poisoned = false;
                    addScore(1, col * TILE, row * TILE);
                }
                sfxHit();
                bullets.splice(i, 1);
                continue;
            }

            // Centipede collision
            let hitCentipede = false;
            for (let ci = centipedes.length - 1; ci >= 0; ci--) {
                const cent = centipedes[ci];
                for (let si = cent.segments.length - 1; si >= 0; si--) {
                    const seg = cent.segments[si];
                    if (rectCollide(b, seg)) {
                        // Kill segment
                        const pts = seg.isHead ? 100 : 10;
                        addScore(pts, seg.x, seg.y);
                        sfxExplosion();
                        addExplosion(seg.x, seg.y);

                        // Place mushroom
                        const mr = Math.floor(seg.y / TILE);
                        const mc = Math.floor(seg.x / TILE);
                        if (mr >= HUD_ROWS && mr < ROWS && mc >= BORDER_W && mc < COLS - BORDER_W) {
                            mushrooms[mr][mc] = { health: 4, poisoned: false };
                        }

                        // Split centipede
                        if (cent.segments.length === 1) {
                            centipedes.splice(ci, 1);
                        } else if (si === 0) {
                            cent.segments.splice(0, 1);
                            if (cent.segments.length > 0) cent.segments[0].isHead = true;
                        } else if (si === cent.segments.length - 1) {
                            cent.segments.splice(si, 1);
                        } else {
                            // Split into two
                            const newSegs = cent.segments.splice(si + 1);
                            cent.segments.splice(si, 1);
                            if (newSegs.length > 0) {
                                newSegs[0].isHead = true;
                                centipedes.push({ segments: newSegs, speed: cent.speed, dir: -cent.dir });
                            }
                            if (cent.segments.length === 0) {
                                centipedes.splice(ci, 1);
                            }
                        }

                        hitCentipede = true;
                        break;
                    }
                }
                if (hitCentipede) break;
            }
            if (hitCentipede) {
                bullets.splice(i, 1);
                continue;
            }

            // Spider collision
            if (spider && rectCollide(b, spider)) {
                const dist = Math.abs(spider.y - player.y);
                let pts = dist < 48 ? 900 : dist < 96 ? 600 : 300;
                addScore(pts, spider.x, spider.y);
                sfxExplosion();
                addExplosion(spider.x, spider.y);
                spider = null;
                bullets.splice(i, 1);
                continue;
            }

            // Scorpion collision
            if (scorpion && rectCollide(b, scorpion)) {
                addScore(1000, scorpion.x, scorpion.y);
                sfxExplosion();
                addExplosion(scorpion.x, scorpion.y);
                scorpion = null;
                bullets.splice(i, 1);
                continue;
            }

            // Flea collision
            if (flea && rectCollide(b, flea)) {
                flea.hits++;
                if (flea.hits >= 2) {
                    addScore(200, flea.x, flea.y);
                    sfxExplosion();
                    addExplosion(flea.x, flea.y);
                    flea = null;
                } else {
                    sfxHit();
                    flea.speed *= 2; // flea speeds up when hit once
                }
                bullets.splice(i, 1);
                continue;
            }
        }
    }

    function drawBullets() {
        for (const b of bullets) {
            // Laser beam
            drawPixelRect(b.x, b.y, b.w, b.h, C.RED_BRIGHT);
            // Glow
            ctx.globalAlpha = 0.3;
            drawPixelRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2, C.RED);
            ctx.globalAlpha = 1;
        }
    }

    // ==========================================================
    //  CENTIPEDE
    // ==========================================================

    function initCentipede() {
        centipedes = [];
        centipedeStuckTimer = 0;
        lastCentipedeHash = '';

        // Phases 1-2: 30% slower base speed; Phase 3+: +5% per level
        let speed;
        if (level <= 2) {
            speed = 0.84; // 0.84 = 1.2 * 0.7 (30% reduction)
        } else {
            // From phase 3: base 1.0, increase 5% per level
            speed = 1.0 * Math.pow(1.05, level - 3);
            speed = Math.min(speed, 3.0); // cap max speed
        }

        // Segments: base 10, +1 extra head every 2 phases from phase 3
        let numSegments = 10;
        if (level >= 3) {
            numSegments = 10 + Math.floor((level - 3) / 2) + 1;
            numSegments = Math.min(numSegments, 18); // cap
        }

        const segs = [];
        for (let i = 0; i < numSegments; i++) {
            segs.push({
                x: TILE * (COLS / 2 - i),
                y: HUD_ROWS * TILE + TILE,
                w: TILE - 2,
                h: TILE - 2,
                isHead: i === 0,
                dir: 1,   // 1 = right, -1 = left
                dropTarget: -1,
                dropping: false,
            });
        }
        centipedes.push({ segments: segs, speed, dir: 1 });

        // Second smaller centipede: only from phase 3+
        if (level >= 3) {
            const segs2 = [];
            const n2 = 5 + Math.min(level - 3, 5);
            for (let i = 0; i < n2; i++) {
                segs2.push({
                    x: TILE * (3 + i),
                    y: HUD_ROWS * TILE + TILE * 3,
                    w: TILE - 2,
                    h: TILE - 2,
                    isHead: i === 0,
                    dir: -1,
                    dropTarget: -1,
                    dropping: false,
                });
            }
            centipedes.push({ segments: segs2, speed: speed * 1.1, dir: -1 });
        }
    }

    function updateCentipedes() {
        for (const cent of centipedes) {
            const sp = cent.speed;
            for (let si = 0; si < cent.segments.length; si++) {
                const seg = cent.segments[si];

                // Move horizontally
                const nextX = seg.x + seg.dir * sp;
                const col = Math.floor(nextX / TILE);
                const row = Math.floor(seg.y / TILE);

                // Check for wall or mushroom ahead
                let blocked = false;

                if (nextX < BORDER_W * TILE || nextX + seg.w > (COLS - BORDER_W) * TILE) {
                    blocked = true;
                } else {
                    const checkCol = seg.dir > 0 ? Math.floor((nextX + seg.w) / TILE) : Math.floor(nextX / TILE);
                    const m = getMushroom(row, checkCol);
                    if (m && m.health > 0) {
                        // Check if poisoned mushroom -> send centipede straight down
                        if (m.poisoned) {
                            seg.dropping = true;
                            seg.dropTarget = GAME_H - TILE * 2;
                        }
                        blocked = true;
                    }
                }

                if (seg.dropping) {
                    // Move straight down
                    seg.y += sp;
                    if (seg.y >= seg.dropTarget) {
                        seg.y = seg.dropTarget;
                        seg.dropping = false;
                        seg.dir = Math.random() < 0.5 ? 1 : -1;
                    }
                } else if (blocked) {
                    // Move down one row and reverse
                    seg.y += TILE;
                    seg.dir *= -1;

                    // If centipede reaches bottom, wrap or stay
                    if (seg.y >= GAME_H - TILE) {
                        seg.y = GAME_H - TILE;
                        seg.dir *= -1;
                    }
                } else {
                    seg.x = nextX;
                }

                // Collision with player
                if (player && player.invincible <= 0 && rectCollide(seg, player)) {
                    playerDie();
                }
            }
        }
    }

    function drawCentipedes() {
        for (const cent of centipedes) {
            for (let si = cent.segments.length - 1; si >= 0; si--) {
                const seg = cent.segments[si];
                const sprite = seg.isHead ? SPRITES.centipede_head : SPRITES.centipede_body;
                const palette = seg.isHead ? PALETTES.centipede_head : PALETTES.centipede_body;

                // Legs animation
                const legOffset = Math.sin(frameCount * 0.3 + si) * 2;
                drawPixelRect(seg.x - 2, seg.y + 2 + legOffset, 2, 2, C.GREEN_DARK);
                drawPixelRect(seg.x + seg.w, seg.y + 2 - legOffset, 2, 2, C.GREEN_DARK);
                drawPixelRect(seg.x - 2, seg.y + seg.h - 4 - legOffset, 2, 2, C.GREEN_DARK);
                drawPixelRect(seg.x + seg.w, seg.y + seg.h - 4 + legOffset, 2, 2, C.GREEN_DARK);

                drawSprite(seg.x, seg.y + (TILE - sprite.length) / 2, sprite, palette, 1.5);
            }
        }
    }

    // ==========================================================
    //  SPIDER
    // ==========================================================

    function spawnSpider() {
        if (spider) return;
        // Phases 1-2: much rarer spawns (~1 every 30s); Phase 3+: normal rate
        let spawnChance;
        if (level <= 2) {
            spawnChance = 0.0006; // ~1 spawn per 1800 frames ≈ 30 seconds
        } else {
            spawnChance = 0.004 + level * 0.001;
        }
        if (Math.random() > spawnChance) return;

        const fromLeft = Math.random() < 0.5;
        spider = {
            x: fromLeft ? -TILE : GAME_W,
            y: GAME_H - TILE * (3 + Math.random() * 3),
            w: 14,
            h: 12,
            speedX: (fromLeft ? 1 : -1) * (1.5 + Math.random()),
            zigTimer: 0,
            zigDir: 1,
        };
    }

    function updateSpider() {
        if (!spider) return;

        spider.x += spider.speedX;
        spider.zigTimer++;

        if (spider.zigTimer > 15 + Math.random() * 20) {
            spider.zigDir *= -1;
            spider.zigTimer = 0;
        }
        spider.y += spider.zigDir * 1.5;

        // Clamp Y
        spider.y = Math.max(GAME_H - PLAYER_ZONE * TILE - TILE * 4, Math.min(GAME_H - TILE, spider.y));

        // Eat mushrooms
        const col = Math.floor((spider.x + spider.w / 2) / TILE);
        const row = Math.floor((spider.y + spider.h / 2) / TILE);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            if (mushrooms[row][col].health > 0) {
                mushrooms[row][col] = { health: 0, poisoned: false };
            }
        }

        // Off screen
        if (spider.x < -TILE * 3 || spider.x > GAME_W + TILE * 3) {
            spider = null;
            return;
        }

        // Collision with player
        if (player && player.invincible <= 0 && rectCollide(spider, player)) {
            playerDie();
            spider = null;
        }
    }

    function drawSpider() {
        if (!spider) return;
        const bob = Math.sin(frameCount * 0.2) * 2;
        drawSprite(spider.x, spider.y + bob, SPRITES.spider, PALETTES.spider, 1.6);

        // Shadow
        ctx.globalAlpha = 0.2;
        drawPixelRect(spider.x + 2, spider.y + 16, 12, 2, C.WHITE);
        ctx.globalAlpha = 1;
    }

    // ==========================================================
    //  SCORPION
    // ==========================================================

    function spawnScorpion() {
        if (scorpion) return;
        // Phases 1-2: much rarer spawns (~1 every 30s); Phase 3+: normal rate
        let spawnChance;
        if (level <= 2) {
            spawnChance = 0.0006; // ~1 spawn per 1800 frames ≈ 30 seconds
        } else {
            spawnChance = 0.002 + level * 0.0005;
        }
        if (Math.random() > spawnChance) return;

        const fromLeft = Math.random() < 0.5;
        const row = HUD_ROWS + 2 + Math.floor(Math.random() * (ROWS - HUD_ROWS - PLAYER_ZONE - 4));
        scorpion = {
            x: fromLeft ? -TILE * 2 : GAME_W + TILE,
            y: row * TILE,
            w: 16,
            h: 10,
            speed: (fromLeft ? 1 : -1) * (1.2 + level * 0.1),
            row: row,
        };
    }

    function updateScorpion() {
        if (!scorpion) return;
        scorpion.x += scorpion.speed;

        // Poison mushrooms it passes over
        const col = Math.floor((scorpion.x + scorpion.w / 2) / TILE);
        if (col >= 0 && col < COLS) {
            const m = mushrooms[scorpion.row][col];
            if (m.health > 0) {
                m.poisoned = true;
            }
        }

        // Off screen
        if (scorpion.x < -TILE * 4 || scorpion.x > GAME_W + TILE * 4) {
            scorpion = null;
        }
    }

    function drawScorpion() {
        if (!scorpion) return;
        const flipX = scorpion.speed < 0;
        // Simple flip by drawing mirrored
        if (flipX) {
            ctx.save();
            ctx.translate(scorpion.x + scorpion.w, scorpion.y);
            ctx.scale(-1, 1);
            drawSprite(0, 0, SPRITES.scorpion, PALETTES.scorpion, 1.4);
            ctx.restore();
        } else {
            drawSprite(scorpion.x, scorpion.y, SPRITES.scorpion, PALETTES.scorpion, 1.4);
        }
    }

    // ==========================================================
    //  FLEA
    // ==========================================================

    function spawnFlea() {
        if (flea) return;
        // Phases 1-2: NO flea at all
        if (level <= 2) return;
        // Only spawn if mushroom density in player zone is low
        let count = 0;
        for (let r = ROWS - PLAYER_ZONE - 4; r < ROWS; r++) {
            for (let c = BORDER_W; c < COLS - BORDER_W; c++) {
                if (mushrooms[r][c].health > 0) count++;
            }
        }
        if (count > 8) return;
        // Phase 3+: start with low frequency, increase gradually
        const fleaChance = 0.002 + (level - 3) * 0.0005;
        if (Math.random() > fleaChance) return;

        const col = BORDER_W + 2 + Math.floor(Math.random() * (COLS - BORDER_W * 2 - 4));
        flea = {
            x: col * TILE,
            y: HUD_ROWS * TILE,
            w: 8,
            h: 10,
            speed: 2 + level * 0.3,
            hits: 0,
        };
    }

    function updateFlea() {
        if (!flea) return;
        flea.y += flea.speed;

        // Drop mushrooms
        const row = Math.floor(flea.y / TILE);
        const col = Math.floor(flea.x / TILE);
        if (row >= HUD_ROWS && row < ROWS && col >= BORDER_W && col < COLS - BORDER_W) {
            if (Math.random() < 0.3 && mushrooms[row][col].health === 0) {
                mushrooms[row][col] = { health: 4, poisoned: false };
            }
        }

        // Off screen
        if (flea.y > GAME_H + TILE) {
            flea = null;
            return;
        }

        // Collision with player
        if (player && player.invincible <= 0 && rectCollide(flea, player)) {
            playerDie();
        }
    }

    function drawFlea() {
        if (!flea) return;
        const wiggle = Math.sin(frameCount * 0.5) * 1;
        drawSprite(flea.x + wiggle, flea.y, SPRITES.flea, PALETTES.flea, 1.6);

        // Trail of mushrooms visual
        if (frameCount % 8 < 4) {
            drawPixelRect(flea.x + 3, flea.y - 4, 2, 2, C.GREEN);
            drawPixelRect(flea.x + 5, flea.y - 8, 2, 2, C.RED);
        }
    }

    // ==========================================================
    //  EFFECTS
    // ==========================================================

    function addExplosion(x, y) {
        explosions.push({
            x, y, frame: 0, maxFrames: 20,
        });
    }

    function updateExplosions() {
        for (let i = explosions.length - 1; i >= 0; i--) {
            explosions[i].frame++;
            if (explosions[i].frame >= explosions[i].maxFrames) {
                explosions.splice(i, 1);
            }
        }
    }

    function drawExplosions() {
        for (const e of explosions) {
            const progress = e.frame / e.maxFrames;
            const radius = 4 + progress * 12;
            const alpha = 1 - progress;

            ctx.globalAlpha = alpha;
            // Multiple particle rings
            for (let p = 0; p < 8; p++) {
                const angle = (p / 8) * Math.PI * 2 + e.frame * 0.2;
                const px = e.x + 8 + Math.cos(angle) * radius;
                const py = e.y + 8 + Math.sin(angle) * radius;
                const color = p % 3 === 0 ? C.YELLOW : p % 3 === 1 ? C.RED : C.WHITE;
                drawPixelRect(px, py, 3 - progress * 2, 3 - progress * 2, color);
            }
            ctx.globalAlpha = 1;
        }
    }

    function addScore(points, x, y) {
        score += points;
        sfxScore();
        scorePopups.push({
            text: `+${points}`,
            x, y, frame: 0, maxFrames: 40,
        });
    }

    function updateScorePopups() {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].frame++;
            scorePopups[i].y -= 0.5;
            if (scorePopups[i].frame >= scorePopups[i].maxFrames) {
                scorePopups.splice(i, 1);
            }
        }
    }

    function drawScorePopups() {
        for (const sp of scorePopups) {
            const alpha = 1 - sp.frame / sp.maxFrames;
            ctx.globalAlpha = alpha;
            drawText(sp.text, sp.x, sp.y, C.YELLOW, 7);
            ctx.globalAlpha = 1;
        }
    }

    // ==========================================================
    //  COLLISION UTIL
    // ==========================================================

    function rectCollide(a, b) {
        return a.x < b.x + b.w &&
               a.x + a.w > b.x &&
               a.y < b.y + b.h &&
               a.y + a.h > b.y;
    }

    // ==========================================================
    //  LEVEL MANAGEMENT
    // ==========================================================

    function checkLevelComplete() {
        if (centipedes.length === 0) {
            advanceLevel();
            return;
        }

        // --- Stuck centipede safeguard ---
        // Build a hash of all centipede segment positions
        let hash = '';
        let totalSegs = 0;
        for (const cent of centipedes) {
            for (const seg of cent.segments) {
                hash += `${Math.floor(seg.x)},${Math.floor(seg.y)};`;
                totalSegs++;
            }
        }

        if (hash === lastCentipedeHash) {
            centipedeStuckTimer++;
        } else {
            centipedeStuckTimer = 0;
            lastCentipedeHash = hash;
        }

        // If stuck for ~10 seconds, auto-destroy remaining segments
        if (centipedeStuckTimer >= STUCK_THRESHOLD && totalSegs > 0) {
            // Destroy all stuck segments with explosions and score
            for (const cent of centipedes) {
                for (const seg of cent.segments) {
                    addScore(seg.isHead ? 100 : 10, seg.x, seg.y);
                    addExplosion(seg.x, seg.y);
                    // Place mushroom where the segment was
                    const mr = Math.floor(seg.y / TILE);
                    const mc = Math.floor(seg.x / TILE);
                    if (mr >= HUD_ROWS && mr < ROWS && mc >= BORDER_W && mc < COLS - BORDER_W) {
                        mushrooms[mr][mc] = { health: 4, poisoned: false };
                    }
                }
            }
            sfxExplosion();
            centipedes = [];
            centipedeStuckTimer = 0;
            lastCentipedeHash = '';
            // Level will advance on next frame when centipedes.length === 0
            return;
        }
    }

    function advanceLevel() {
        level++;
        // Extra life every 12000 points
        if (score > 0 && score % 12000 < 100) lives++;
        initMushrooms();
        initCentipede();
        spider = null;
        scorpion = null;
        flea = null;
        bullets = [];
    }

    // ==========================================================
    //  MAIN GAME LOOP
    // ==========================================================

    function startGame() {
        score = 0;
        lives = 3;
        level = 1;
        frameCount = 0;
        bullets = [];
        explosions = [];
        scorePopups = [];
        spider = null;
        scorpion = null;
        flea = null;
        initMushrooms();
        initPlayer();
        initCentipede();
        state = 'PLAYING';
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        initAudio();
    }

    function update() {
        if (state !== 'PLAYING') return;

        frameCount++;
        updatePlayer();
        updateBullets();
        updateCentipedes();
        spawnSpider();
        updateSpider();
        spawnScorpion();
        updateScorpion();
        spawnFlea();
        updateFlea();
        updateExplosions();
        updateScorePopups();
        checkLevelComplete();
    }

    function draw() {
        // Clear
        ctx.fillStyle = C.BLACK;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        if (state === 'START') return;
        if (state === 'GAME_OVER') {
            // Still draw the last frame behind the overlay
            drawVineBorder();
            drawLadybug();
            drawMushrooms();
            drawCentipedes();
            drawSpider();
            drawScorpion();
            drawFlea();
            drawPlayer();
            drawBullets();
            drawExplosions();
            drawScorePopups();
            drawHUD();
            return;
        }

        // Draw game
        drawVineBorder();
        drawLadybug();
        drawMushrooms();
        drawCentipedes();
        drawSpider();
        drawScorpion();
        drawFlea();
        drawBullets();
        drawPlayer();
        drawExplosions();
        drawScorePopups();
        drawHUD();

        // Pause overlay
        if (state === 'PAUSED') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, GAME_W, GAME_H);
            drawTextCenter('PAUSED', GAME_W / 2, GAME_H / 2 - 10, C.YELLOW, 20);
            drawTextCenter('PRESS P TO RESUME', GAME_W / 2, GAME_H / 2 + 20, C.WHITE, 8);
        }
    }

    function gameLoop() {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }

    // ==========================================================
    //  INPUT HANDLING
    // ==========================================================

    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;

        if (e.key === 'Enter') {
            if (state === 'START' || state === 'GAME_OVER') {
                startGame();
            }
        }
        if (e.key === 'p' || e.key === 'P') {
            if (state === 'PLAYING') state = 'PAUSED';
            else if (state === 'PAUSED') state = 'PLAYING';
        }

        // Prevent scrolling
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });

    // Click to start
    document.getElementById('start-screen').addEventListener('click', () => {
        if (state === 'START') startGame();
    });
    document.getElementById('game-over-screen').addEventListener('click', () => {
        if (state === 'GAME_OVER') startGame();
    });

    // Touch controls for mobile
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchActive = true;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        touchStartX = touch.clientX - rect.left;
        touchStartY = touch.clientY - rect.top;
        keys[' '] = true; // auto-fire on touch
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!touchActive || !player) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        const tx = (touch.clientX - rect.left) * scaleX;
        const ty = (touch.clientY - rect.top) * scaleY;

        player.x = tx - player.w / 2;
        player.y = ty - player.h / 2;
    });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchActive = false;
        keys[' '] = false;
    });

    // ==========================================================
    //  BOOT
    // ==========================================================

    gameLoop();

})();
