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

        // Status Effects
        this.chilledTimer = 0;
        this.frozenTimer = 0;
        this.burningTimer = 0;
        this.burnDps = 0;
        this.burnTickTimer = 0;
        this.madnessTimer = 0;
        this.madnessDamageMult = 1;
        this.madnessAttackTimer = 0;
    }

    applyBurn(dps, duration) {
        this.burningTimer = Math.max(this.burningTimer, duration);
        this.burnDps = Math.max(this.burnDps, dps);
        if (this.burnTickTimer <= 0) this.burnTickTimer = 0.5;
    }

    applyMadness(duration, damageMult = 1) {
        if (this.def.type === 'elite') duration *= 0.55;
        this.madnessTimer = Math.max(this.madnessTimer, duration);
        this.madnessDamageMult = Math.max(this.madnessDamageMult, damageMult);
    }

    findMadnessTarget(game, radius = 280) {
        let best = null;
        let bestD = radius * radius;
        const candidates = game.grid.query(this.x, this.y, radius);

        for (const enemy of candidates) {
            if (enemy === this || enemy.dead) continue;
            const d = distSq(this.x, this.y, enemy.x, enemy.y);
            if (d < bestD) {
                bestD = d;
                best = enemy;
            }
        }

        return best;
    }

    takeDamage(amount, isCrit, game) {
        if (this.dead) return;

        // Deep Freeze passive damage amplification (25% extra damage per level to frozen/chilled enemies)
        let actualAmount = amount;
        if ((this.chilledTimer > 0 || this.frozenTimer > 0) && game.player.passives && game.player.passives['deepFreeze']) {
            actualAmount = Math.round(amount * (1.0 + game.player.passives['deepFreeze'] * 0.25));
        }

        this.hp -= actualAmount;
        this.flashTimer = 0.1;

        // Apply a small knockback (frozen enemies resist knockback slightly)
        if (this.def.type !== 'elite') { // Elites resist knockback
            const dirX = this.x - game.player.x;
            const dirY = this.y - game.player.y;
            const d = Math.max(1, Math.sqrt(dirX * dirX + dirY * dirY));
            const force = isCrit ? 150 : 80;
            const kbMult = this.frozenTimer > 0 ? 0.3 : 1.0;
            this.kbX += (dirX / d) * force * kbMult;
            this.kbY += (dirY / d) * force * kbMult;
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

        // Ice Shatter explosion!
        if (this.chilledTimer > 0 || this.frozenTimer > 0) {
            // Ice burst particles
            game.particles.emit({
                x: this.x, y: this.y - 20, count: 12,
                color: '#67e8f9', color2: '#3b82f6',
                speed: 100, size: 4, lifetime: 0.5, glow: true
            });
            game.audio.lightning(); // Use lightning sound for shatter crackle!

            // Spawn flying ice shards
            const shardSpeed = 260;
            const shardDamage = Math.round(10 * (game.player.stats.damage || 1.0));
            
            // Check if player has active FrostNova weapon level to increase shard count
            const frostNovaWep = game.player.weapons.find(w => w.name === 'Frost Nova');
            const count = frostNovaWep ? (frostNovaWep.level >= 7 ? 6 : 4) : 4;
            
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                game.projectiles.push(new window.GameWeapons.Projectile({
                    x: this.x,
                    y: this.y,
                    vx: Math.cos(angle) * shardSpeed,
                    vy: Math.sin(angle) * shardSpeed,
                    radius: 5,
                    damage: shardDamage,
                    isCrit: false,
                    color: '#67e8f9',
                    glowColor: '#3b82f6',
                    piercing: 1, // pierces 1 enemy
                    lifetime: 1.0,
                    drawYOffset: -20,
                    onHit: (enemy, g) => {
                        // Apply brief chill to anything hit by shatter shards!
                        enemy.chilledTimer = Math.max(enemy.chilledTimer, 2.0);
                        g.particles.emit({
                            x: enemy.x, y: enemy.y - 20,
                            count: 3, color: '#67e8f9', color2: '#3b82f6',
                            speed: 40, size: 2, lifetime: 0.25
                        });
                    }
                }));
            }
        }

        // Wildfire passive: burning enemies burst and spread flames on death.
        const wildfireLevel = game.player.passives?.wildfire || 0;
        if (this.burningTimer > 0 && wildfireLevel > 0) {
            const radius = 70 + wildfireLevel * 15;
            const burnDps = 6 + wildfireLevel * 4;
            const burstDamage = Math.round((10 + wildfireLevel * 6) * game.player.stats.damage);

            game.particles.emit({
                x: this.x, y: this.y - 20,
                count: 18 + wildfireLevel * 4,
                color: '#fed7aa', color2: '#dc2626',
                speed: 110, size: 4, lifetime: 0.35, glow: true
            });

            for (const enemy of game.grid.query(this.x, this.y, radius)) {
                if (enemy.dead || enemy === this) continue;
                if (distSq(this.x, this.y, enemy.x, enemy.y) > radius * radius) continue;

                enemy.applyBurn(burnDps, 2.0 + wildfireLevel * 0.35);
                enemy.takeDamage(burstDamage, false, game);
                game.floatingText.spawn(enemy.x, enemy.y - 30, burstDamage, false);
            }
        }

        // Death particles
        game.particles.emit({
            x: this.x, y: this.y - 20, count: 6,
            color: this.color, color2: '#000',
            speed: 50, size: this.radius * 0.3, lifetime: 0.4
        });
    }

    update(dt, player) {
        if (this.dead) return;

        if (this.flashTimer > 0) this.flashTimer -= dt;

        // Decay status effects
        if (this.chilledTimer > 0) this.chilledTimer -= dt;
        if (this.frozenTimer > 0) this.frozenTimer -= dt;
        if (this.madnessTimer > 0) this.madnessTimer -= dt;
        if (this.madnessAttackTimer > 0) this.madnessAttackTimer -= dt;
        if (this.burningTimer > 0) {
            this.burningTimer -= dt;
            this.burnTickTimer -= dt;

            if (this.burnTickTimer <= 0) {
                this.burnTickTimer += 0.5;
                const game = player.game;
                const dmg = Math.max(1, Math.round(this.burnDps * 0.5));

                this.hp -= dmg;
                this.flashTimer = Math.max(this.flashTimer, 0.05);
                game.floatingText.spawn(this.x, this.y - 30, dmg, false);
                game.particles.emit({
                    x: this.x, y: this.y - 20,
                    count: 3, color: '#fb923c', color2: '#ef4444',
                    speed: 35, size: 2.5, lifetime: 0.25, glow: true,
                    gravity: -40
                });

                if (this.hp <= 0) {
                    this.hp = 0;
                    this.dead = true;
                    this.die(game);
                    return;
                }
            }
        } else {
            this.burnDps = 0;
        }

        // Decay knockback
        this.kbX *= 0.85;
        this.kbY *= 0.85;

        const game = player.game;
        const isMaddened = this.madnessTimer > 0;
        const madnessTarget = isMaddened ? this.findMadnessTarget(game) : null;
        const target = madnessTarget || player;

        // Base movement toward target
        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);

        let vx = 0, vy = 0;
        if (d > 0) {
            // Apply speed modifications based on status effects
            let currentSpeed = this.speed;
            if (this.frozenTimer > 0) {
                currentSpeed = 0; // Frozen solid
            } else if (this.chilledTimer > 0) {
                currentSpeed *= 0.6; // 40% slow
            }
            if (isMaddened) {
                currentSpeed *= madnessTarget ? 1.1 : 0.4;
            }

            vx = (dx / d) * currentSpeed;
            vy = (dy / d) * currentSpeed;
            
            // Only update facing angle and walk cycle if not frozen
            if (this.frozenTimer <= 0) {
                this.facingAngle = Math.atan2(dy, dx);
                this.walkTimer += dt * 10 * (currentSpeed / 60);
            }
        }

        // Add separation from spatial grid (calculated in main loop) - only if not frozen
        if (this.frozenTimer <= 0) {
            vx += this.sepX * 50;
            vy += this.sepY * 50;
        }

        // Reset separation for next frame
        this.sepX = 0;
        this.sepY = 0;

        // Final velocity application (frozen enemies resist knockback movement slightly)
        const kbMult = this.frozenTimer > 0 ? 0.3 : 1.0;
        this.x += (vx + this.kbX * kbMult) * dt;
        this.y += (vy + this.kbY * kbMult) * dt;

        if (madnessTarget && d < this.radius + madnessTarget.radius + 3 && this.madnessAttackTimer <= 0) {
            const game = player.game;
            const dmg = Math.max(1, Math.round(this.damage * 0.75 * this.madnessDamageMult));
            this.madnessAttackTimer = 0.8;
            madnessTarget.takeDamage(dmg, false, game);
            game.floatingText.spawn(madnessTarget.x, madnessTarget.y - 30, dmg, false);
            game.particles.emit({
                x: madnessTarget.x, y: madnessTarget.y - 20,
                count: 5, color: '#c084fc', color2: '#4c1d95',
                speed: 55, size: 3, lifetime: 0.25, glow: true
            });
        }

        // Check collision with player
        if (!isMaddened && d < this.radius + player.radius) {
            player.takeDamage(this.damage);
        }
    }

    draw(ctx) {
        const { x, y, radius, alpha } = this;
        const isFlashing = this.flashTimer > 0;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Shadow under the enemy (centered exactly under the visual feet)
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 1.55, radius * 0.8, radius * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        ctx.translate(x, y);

        // Flip image left/right depending on facing angle
        if (this.facingAngle > Math.PI / 2 || this.facingAngle < -Math.PI / 2) {
            ctx.scale(-1, 1);
        }

        const img = window.ASSETS ? window.ASSETS[this.def.type] : null;
        let hasImage = img && img.complete && img.naturalWidth > 0;
        let drawHeight = radius * 4.5; // default height fallback

        if (hasImage) {
            
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
            drawHeight = radius * scaleMultiplier;
            const drawWidth = drawHeight * (frameWidth / frameHeight); // Maintain aspect ratio
            
            const bob = Math.abs(Math.sin(this.walkTimer)) * (radius * 0.15); 
            
            if (isFlashing) {
                ctx.filter = 'brightness(200%) drop-shadow(0 0 10px white)';
            } else if (this.madnessTimer > 0) {
                ctx.filter = 'hue-rotate(250deg) saturate(2) brightness(1.2) drop-shadow(0 0 8px #c084fc)';
            } else if (this.burningTimer > 0) {
                ctx.filter = 'sepia(1) saturate(2.2) brightness(1.15) drop-shadow(0 0 8px #fb923c)';
            } else if (this.frozenTimer > 0) {
                ctx.filter = 'hue-rotate(180deg) saturate(1.8) brightness(1.2) drop-shadow(0 0 8px #67e8f9)';
            } else if (this.chilledTimer > 0) {
                ctx.filter = 'hue-rotate(180deg) saturate(1.3) brightness(1.1)';
            }
            
            // Anchor at feet (with 1.55 * radius offset) and apply bobbing to the height
            // This aligns the actual collision center (y) perfectly with the visual center/body of the enemy!
            ctx.drawImage(
                img, 
                sourceX, 0, frameWidth, frameHeight, 
                -drawWidth / 2, -drawHeight + (radius * 1.55) - bob, drawWidth, drawHeight
            );
            
            if (isFlashing || this.madnessTimer > 0 || this.burningTimer > 0 || this.frozenTimer > 0 || this.chilledTimer > 0) ctx.filter = 'none';

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
            } else if (this.madnessTimer > 0) {
                const grd = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
                grd.addColorStop(0, '#f5d0fe');
                grd.addColorStop(0.35, '#c084fc');
                grd.addColorStop(1, '#312e81');
                ctx.fillStyle = grd;
                ctx.shadowBlur = 14;
                ctx.shadowColor = '#c084fc';
            } else if (this.burningTimer > 0) {
                const grd = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
                grd.addColorStop(0, '#fff7ed');
                grd.addColorStop(0.35, '#fb923c');
                grd.addColorStop(1, '#7f1d1d');
                ctx.fillStyle = grd;
                ctx.shadowBlur = 14;
                ctx.shadowColor = '#f97316';
            } else if (this.frozenTimer > 0) {
                ctx.fillStyle = '#e0f2fe';
                ctx.shadowBlur = 14;
                ctx.shadowColor = '#06b6d4';
            } else if (this.chilledTimer > 0) {
                const grd = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
                grd.addColorStop(0, '#e0f2fe');
                grd.addColorStop(0.3, '#38bdf8');
                grd.addColorStop(1, '#0f172a');
                ctx.fillStyle = grd;
            } else {
                const grd = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
                grd.addColorStop(0, '#fff');
                grd.addColorStop(0.2, this.color);
                grd.addColorStop(1, '#0f172a');
                ctx.fillStyle = grd;
            }
            ctx.fill();

            // Eyes
            ctx.fillStyle = (isFlashing || this.frozenTimer > 0) ? '#000' : '#fff';
            ctx.beginPath();
            ctx.arc(radius * 0.4, -radius * 0.3, radius * 0.15, 0, Math.PI * 2);
            ctx.arc(radius * 0.4,  radius * 0.3, radius * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = (isFlashing || this.frozenTimer > 0) ? '#fff' : '#ef4444';
            ctx.beginPath();
            ctx.arc(radius * 0.5, -radius * 0.3, radius * 0.05, 0, Math.PI * 2);
            ctx.arc(radius * 0.5,  radius * 0.3, radius * 0.05, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // HP Bar (dynamically positioned above visual head)
        if (this.hp < this.maxHp) {
            const barW = radius * 2;
            const barH = 3;
            const hpPct = this.hp / this.maxHp;
            const hpBarY = hasImage 
                ? y - drawHeight + (radius * 1.55) - 12
                : y - radius - 12;

            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(x - barW / 2, hpBarY, barW, barH);
            ctx.fillStyle = this.def.type === 'elite' ? '#ef4444' : '#22c55e';
            ctx.fillRect(x - barW / 2, hpBarY, barW * hpPct, barH);
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
