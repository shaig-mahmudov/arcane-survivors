/**
 * enemies.js — Enemy classes, wave spawner, and director.
 * Depends on: utils.js, entities.js
 */

'use strict';
(() => {

const { clamp, lerp, dist, distSq, randFloat, randInt, randChoice, rgba, hexToRgb } = window.GameUtils;
const Ents = window.GameEntities;

// ─── Enemy Types ─────────────────────────────────────────────────────────────

const ENEMY_DEFS = {
    basic: {
        radius: 12, hp: 15, speed: 65, damage: 10,
        color: '#22c55e', xp: 1, type: 'basic',
        frames: 4 // <-- ADD THIS: How many frames in the spritesheet
    },
    fast: {
        radius: 9, hp: 8, speed: 130, damage: 5,
        color: '#06b6d4', xp: 1, type: 'fast',
        frames: 4 // <-- ADD THIS
    },
    tank: {
        radius: 20, hp: 60, speed: 40, damage: 25,
        color: '#64748b', xp: 3, type: 'tank',
        frames: 1 // If this is a static image, leave it at 1
    },
    ghost: {
        radius: 14, hp: 30, speed: 80, damage: 15,
        color: '#f8fafc', xp: 2, type: 'ghost', alpha: 0.6,
        frames: 4
    },
    elite: {
        radius: 35, hp: 800, speed: 50, damage: 40,
        color: '#dc2626', xp: 50, type: 'elite', dropLoot: true,
        frames: 6 // Bosses might have longer animations
    }
};

// ─── Enemy Class ─────────────────────────────────────────────────────────────

class Enemy extends Ents.Entity {
    constructor(x, y, def, difficultyMult = 1.0) {
        super(x, y, def.radius);
        this.reset(x, y, def, difficultyMult);
    }

    reset(x, y, def, difficultyMult = 1.0) {
        this.x = x;
        this.y = y;
        this.radius = def.radius;
        this.vx = 0;
        this.vy = 0;
        this.dead = false;

        this.def = def;
        this.maxHp = Math.round(def.hp * difficultyMult);
        this.hp = this.maxHp;
        this.speed = def.speed * randFloat(0.9, 1.1); // slight speed variation
        this.damage = Math.round(def.damage * difficultyMult);
        this.color = def.color;
        this.xpValue = def.xp;

        // Visuals
        this.flashTimer = 0;
        this.walkTimer = randFloat(0, Math.PI * 2);
        this.facingAngle = 0;
        this.alpha = def.alpha || 1.0;

        // Knockback
        this.kbX = 0;
        this.kbY = 0;

        // Separation (boids-like) to prevent stacking
        this.sepX = 0;
        this.sepY = 0;
    }

    takeDamage(amount, isCrit, game) {
        if (this.dead) return;
        this.hp -= amount;
        this.flashTimer = 0.1;

        // Apply a small knockback
        if (this.def.type !== 'elite') { // Elites resist knockback
            const dirX = this.x - game.player.x;
            const dirY = this.y - game.player.y;
            const d = Math.max(1, Math.sqrt(dirX * dirX + dirY * dirY));
            const force = isCrit ? 150 : 80;
            this.kbX += (dirX / d) * force;
            this.kbY += (dirY / d) * force;
        }

        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            this.die(game);
        }
    }

    die(game) {
        game.player.kills++;
        game.audio.enemyDeath();

        // Spawn XP gem
        game.gems.push(new Ents.XPGem(this.x, this.y, this.xpValue));

        // Elites drop health or magnets
        if (this.def.dropLoot) {
            if (Math.random() < 0.6) {
                game.gems.push(new Ents.HealOrb(this.x + 20, this.y, 40));
            } else {
                game.gems.push(new Ents.MagnetPickup(this.x + 20, this.y));
            }
        } else if (Math.random() < 0.005) {
            // Rare chance for normal enemies to drop small heal
            game.gems.push(new Ents.HealOrb(this.x, this.y, 10));
        }

        // Death particles
        game.particles.emit({
            x: this.x, y: this.y, count: 6,
            color: this.color, color2: '#000',
            speed: 50, size: this.radius * 0.3, lifetime: 0.4
        });
    }

    update(dt, player) {
        if (this.flashTimer > 0) this.flashTimer -= dt;

        // Decay knockback
        this.kbX *= 0.85;
        this.kbY *= 0.85;

        // Base movement toward player
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);

        let vx = 0, vy = 0;
        if (d > 0) {
            vx = (dx / d) * this.speed;
            vy = (dy / d) * this.speed;
            this.facingAngle = Math.atan2(dy, dx);
        }

        // Add separation from spatial grid (calculated in main loop)
        vx += this.sepX * 50;
        vy += this.sepY * 50;

        // Reset separation for next frame
        this.sepX = 0;
        this.sepY = 0;

        // Final velocity application
        this.x += (vx + this.kbX) * dt;
        this.y += (vy + this.kbY) * dt;

        this.walkTimer += dt * 10 * (this.speed / 60);

        // Check collision with player
        if (d < this.radius + player.radius) {
            player.takeDamage(this.damage);
        }
    }

draw(ctx) {
        const { x, y, radius, alpha } = this;
        const isFlashing = this.flashTimer > 0;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Shadow under the enemy
        ctx.beginPath();
        ctx.ellipse(x, y + radius, radius * 0.8, radius * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        ctx.translate(x, y);

        // Flip image left/right depending on facing angle
        if (this.facingAngle > Math.PI / 2 || this.facingAngle < -Math.PI / 2) {
            ctx.scale(-1, 1);
        }

        const img = window.ASSETS ? window.ASSETS[this.def.type] : null;

if (img && img.complete && img.naturalWidth > 0) {
            
            // ─── ANIMATED SPRITESHEET RENDERING ──────────────────────────────
            
            // ⚠️ IMPORTANT: Matches the 'frames' property in ENEMY_DEFS
            const totalFrames = this.def.frames || 1;
            
            // Math.floor prevents sub-pixel texture bleeding
            const frameWidth = Math.floor(img.naturalWidth / totalFrames);
            const frameHeight = img.naturalHeight;
            
            const animationSpeed = 3; 
            const currentFrame = Math.floor(this.walkTimer * animationSpeed) % totalFrames;
            const sourceX = currentFrame * frameWidth;
            
            // ─── FIX: Aspect Ratio and Size Scaling ───
            const scaleMultiplier = 4.5; // Increase this to make enemies bigger
            const drawHeight = radius * scaleMultiplier;
            const drawWidth = drawHeight * (frameWidth / frameHeight); // Maintain aspect ratio
            
            const bob = Math.abs(Math.sin(this.walkTimer)) * (radius * 0.15); 
            
            if (isFlashing) {
                ctx.filter = 'brightness(200%) drop-shadow(0 0 10px white)';
            }
            
            // Anchor at feet and apply bobbing to the height
            ctx.drawImage(
                img, 
                sourceX, 0, frameWidth, frameHeight, 
                -drawWidth / 2, -drawHeight + (radius * 0.8) - bob, drawWidth, drawHeight
            );
            
            if (isFlashing) ctx.filter = 'none';

        } else {
            
            // ─── FALLBACK TO COLORED CIRCLES ─────────────────────────────────
            
            const bob = Math.abs(Math.sin(this.walkTimer)) * (radius * 0.15);
            ctx.translate(0, -bob);
            
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);

            if (isFlashing) {
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#fff';
            } else {
                const grd = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
                grd.addColorStop(0, '#fff');
                grd.addColorStop(0.2, this.color);
                grd.addColorStop(1, '#0f172a');
                ctx.fillStyle = grd;
            }
            ctx.fill();

            // Eyes
            ctx.fillStyle = isFlashing ? '#000' : '#fff';
            ctx.beginPath();
            ctx.arc(radius * 0.4, -radius * 0.3, radius * 0.15, 0, Math.PI * 2);
            ctx.arc(radius * 0.4,  radius * 0.3, radius * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = isFlashing ? '#fff' : '#ef4444';
            ctx.beginPath();
            ctx.arc(radius * 0.5, -radius * 0.3, radius * 0.05, 0, Math.PI * 2);
            ctx.arc(radius * 0.5,  radius * 0.3, radius * 0.05, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // HP Bar
        if (this.hp < this.maxHp) {
            const barW = radius * 2;
            const barH = 3;
            const hpPct = this.hp / this.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(x - barW / 2, y - radius - 12, barW, barH);
            ctx.fillStyle = this.def.type === 'elite' ? '#ef4444' : '#22c55e';
            ctx.fillRect(x - barW / 2, y - radius - 12, barW * hpPct, barH);
        }
    }
}

// ─── Director / Wave Spawner ─────────────────────────────────────────────────

/**
 * Manages spawning enemies over time, increasing difficulty,
 * and triggering boss waves.
 */
class Director {
    constructor(game) {
        this.game = game;
        this.timeElapsed = 0; // seconds
        this.spawnTimer = 0;

        // Difficulty scaling parameters
        this.baseDifficulty = 1.0;
        this.spawnRate = 1.2; // Seconds between spawns initially
        this.waveIntesity = 1.0;
        
        this.enemyPool = new window.GameUtils.ObjectPool(
            () => new Enemy(0, 0, ENEMY_DEFS.basic, 1),
            (e, x, y, def, diffMult) => e.reset(x, y, def, diffMult)
        );
    }

    update(dt) {
        this.timeElapsed += dt;
        this.spawnTimer -= dt;

        // Difficulty scales up slowly over time (every minute + ~0.3)
        const diffMult = 1.0 + (this.timeElapsed / 60) * 0.3;

        // Every 3 minutes is a major elite/boss wave
        const minute = Math.floor(this.timeElapsed / 60);
        const secInMin = this.timeElapsed % 60;

        // Determine spawn rate (faster over time, bursts on minutes)
        let currentSpawnRate = this.spawnRate / Math.sqrt(diffMult);
        let spawnAmount = 1 + Math.floor(this.timeElapsed / 120); // spawn more at once

        // Wave bursts
        if (secInMin > 10 && secInMin < 20) {
            currentSpawnRate *= 0.5; // swarm!
            spawnAmount *= 2;
        }

        if (this.spawnTimer <= 0) {
            this.spawnTimer = currentSpawnRate;
            this.spawnWave(spawnAmount, diffMult);
        }

        // Boss spawns exactly on the 3, 6, 9... minute marks
        if (minute > 0 && minute % 3 === 0 && secInMin < dt) {
            this.spawnElite(diffMult * 1.5);
            this.game.audio.bossSpawn();
            this.game.floatingText.spawn(this.game.player.x, this.game.player.y - 100, "ELITE WAVE!", false, false);
            this.game.floatingText.numbers[this.game.floatingText.numbers.length-1].scale = 3;
            this.game.floatingText.numbers[this.game.floatingText.numbers.length-1].color = '#ef4444';
        }
    }

    spawnWave(amount, diffMult) {
        // Only spawn up to a cap to prevent lag
        if (this.game.enemies.length > 400) return;

        const player = this.game.player;
        const types = this.getAvailableTypes();

        for (let i = 0; i < amount; i++) {
            const type = randChoice(types);
            const { x, y } = this.getOffscreenPos(player);
            this.game.enemies.push(this.enemyPool.acquire(x, y, ENEMY_DEFS[type], diffMult));
        }
    }

    spawnElite(diffMult) {
        const player = this.game.player;
        const { x, y } = this.getOffscreenPos(player);
        this.game.enemies.push(this.enemyPool.acquire(x, y, ENEMY_DEFS.elite, diffMult));
        
        // Spawn guards
        for(let i = 0; i < 5; i++) {
            this.game.enemies.push(this.enemyPool.acquire(x + randFloat(-50, 50), y + randFloat(-50, 50), ENEMY_DEFS.tank, diffMult));
        }
    }

    getAvailableTypes() {
        // Unlock new enemies over time
        const min = Math.floor(this.timeElapsed / 60);
        let types = ['basic'];
        if (min >= 1 || this.timeElapsed > 30) types.push('fast');
        if (min >= 2) types.push('tank');
        if (min >= 4) types.push('ghost');
        return types;
    }

    getOffscreenPos(player) {
        // Spawn in a circle just outside the screen bounds
        // Assuming ~1280x720 view max, radius of ~800 is safe
        const angle = randFloat(0, Math.PI * 2);
        const radius = 800; // pixels away from player
        return {
            x: player.x + Math.cos(angle) * radius,
            y: player.y + Math.sin(angle) * radius
        };
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

window.GameEnemies = {
    ENEMY_DEFS,
    Enemy,
    Director
};

})();

