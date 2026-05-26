/**
 * entities.js — Player entity, XP gems, and base entity class.
 * Depends on: utils.js
 */

'use strict';
(() => {

const { clamp, lerp, dist, distSq, normalize, randFloat, randInt, randChoice,
        rgba, lerpColor, hexToRgb } = window.GameUtils;

// ─── Base Entity ─────────────────────────────────────────────────────────────

class Entity {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.vx = 0;
        this.vy = 0;
        this.dead = false;
    }

    get aabb() {
        return {
            left:   this.x - this.radius,
            right:  this.x + this.radius,
            top:    this.y - this.radius,
            bottom: this.y + this.radius,
        };
    }

    overlaps(other) {
        return distSq(this.x, this.y, other.x, other.y) <
               (this.radius + other.radius) ** 2;
    }
}

// ─── Player Stats Schema ──────────────────────────────────────────────────────

const BASE_PLAYER_STATS = {
    maxHp:         120,
    speed:         210,
    damage:        1.0,
    attackSpeed:   1.0,
    projectileSpd: 1.0,
    pickupRadius:  80,
    critChance:    0.05,
    critMult:      2.2,
    armor:         0,
    xpBonus:       1.0,
    areaBonus:     1.0,
    duration:      1.0,
};

// ─── Player ───────────────────────────────────────────────────────────────────

class Player extends Entity {
    constructor(x, y, game) {
        super(x, y, 16);
        this.game = game;

        this.stats = { ...BASE_PLAYER_STATS };
        this.hp    = this.stats.maxHp;

        this.xp        = 0;
        this.level     = 1;
        this.xpToNext  = this._calcXpThreshold(1);

        this.weapons = [];
        this.ultimates = [];

        this.iFrames    = 0;
        this.iFramesDur = 0.8;

        this.facingAngle    = 0;
        this.walkTimer      = 0;
        this.walkFrame      = 0;
        this.flashTimer     = 0;
        this.bodyColor      = '#a78bfa';
        this.trailTimer     = 0;
        this.isMoving       = false;
        
        this.globalAnimTime = 0;
        this.attackTimer    = 0;

        this.kills = 0;
        this._velX = 0;
        this._velY = 0;

        this.magnetAll = false;
        this.magnetTimer = 0;
    }

    _calcXpThreshold(level) {
        return Math.floor(10 * Math.pow(1.25, level - 1));
    }

    takeDamage(amount) {
        if (this.iFrames > 0) return false;

        const reduced = Math.max(1, amount - this.stats.armor);
        this.hp -= reduced;
        this.iFrames = this.iFramesDur;
        this.flashTimer = 0.12;

        this.game.particles.emit({
            x: this.x, y: this.y,
            count: 8, color: '#ff3333', color2: '#ff8888',
            speed: 90, size: 3, lifetime: 0.35, glow: true
        });
        this.game.screenShake.trigger(5, 0.18);
        this.game.audio.playerHurt();
        this.game.floatingText.spawn(this.x, this.y - this.radius, reduced, false, false);

        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            this.game.audio.playerDeath();
            this.game.screenShake.trigger(15, 0.5);
        }
        return true;
    }

    heal(amount) {
        const actual = Math.min(amount, this.stats.maxHp - this.hp);
        if (actual > 0) {
            this.hp += actual;
            this.game.floatingText.spawn(this.x, this.y - this.radius, actual, false, true);
        }
    }

    addXP(amount) {
        this.xp += Math.floor(amount * this.stats.xpBonus);
        this.game.audio.pickupXP();

        while (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this._levelUp();
            if (this.game.state !== 'PLAYING') break;
        }
    }

    _levelUp() {
        this.level++;
        this.xpToNext = this._calcXpThreshold(this.level);
        this.addUltimateCharge();

        this.game.particles.emit({
            x: this.x, y: this.y, count: 24,
            color: '#facc15', color2: '#a78bfa',
            speed: 160, size: 5, lifetime: 0.7, glow: true
        });
        this.game.audio.levelUp();
        if (this.level % 10 === 0) {
            this.game.triggerBossFight();
            return;
        }
        this.game.triggerLevelUpMenu();
    }

    update(dt, input) {
        if (this.dead) return;  

        this.globalAnimTime += dt;
        if (this.attackTimer > 0) this.attackTimer -= dt;
        
        if (this.iFrames > 0) this.iFrames -= dt;
        if (this.flashTimer > 0) this.flashTimer -= dt;

        if (this.magnetAll) {
            this.magnetTimer -= dt;
            if (this.magnetTimer <= 0) this.magnetAll = false;
        }

        let mx = 0, my = 0;
        if (input.isDown('KeyW') || input.isDown('ArrowUp'))    my -= 1;
        if (input.isDown('KeyS') || input.isDown('ArrowDown'))  my += 1;
        if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  mx -= 1;
        if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;

        if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }

        const spd = this.stats.speed;
        const targetVX = mx * spd;
        const targetVY = my * spd;

        const accel = 18;
        this._velX = lerp(this._velX, targetVX, Math.min(1, accel * dt));
        this._velY = lerp(this._velY, targetVY, Math.min(1, accel * dt));

        this.x += this._velX * dt;
        this.y += this._velY * dt;

        this.isMoving = Math.abs(this._velX) > 5 || Math.abs(this._velY) > 5;

        if (this.isMoving) {
            this.facingAngle = Math.atan2(this._velY, this._velX);
            this.walkTimer += dt * 8;
            this.trailTimer += dt;
            if (this.trailTimer >= 0.06) {
                this.trailTimer = 0;
                this.game.particles.emit({
                    x: this.x, y: this.y,
                    count: 1, color: '#7c3aed', color2: '#1e1b4b',
                    speed: 20, speedVariance: 10,
                    size: 4, sizeVariance: 1,
                    lifetime: 0.3, glow: false, fadeOut: true
                });
            }
        }

        for (const w of this.weapons) w.update(dt, this);
    }

draw(ctx) {
        if (this.dead) return;

        const { x, y, radius } = this;
        const isFlashing = this.flashTimer > 0;

        ctx.save();

        // 1. Draw the shadow under the feet
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 0.6, radius * 0.8, radius * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();

        // ❌ THE GLOW HAS BEEN DELETED FROM HERE

        // I-frame flickering
        if (this.iFrames > 0 && Math.floor(this.iFrames * 12) % 2 === 0) {
            ctx.restore(); return;
        }

        // Determine current state
        let currentState = 'idle';
        if (this.flashTimer > 0) {
            currentState = 'hurt';
        } else if (this.attackTimer > 0) {
            currentState = 'attack';
        } else if (this.isMoving) {
            currentState = 'run';
        }

        const sprites = window.ASSETS ? window.ASSETS.player : null;
        const img = sprites ? sprites[currentState] : null;

        if (img && img.complete && img.naturalWidth > 0) {
            
            ctx.save(); 
            ctx.translate(x, y);

            if (this.facingAngle > Math.PI / 2 || this.facingAngle < -Math.PI / 2) {
                ctx.scale(-1, 1);
            }

            const frameCounts = { idle: 6, run: 8, hurt: 4, attack: 8 };
            
            // Define separate speeds. Attack needs to be fast (20) to fit 8 frames into 0.4 seconds
            const animSpeeds = { idle: 8, run: 12, hurt: 10, attack: 20 }; 
            
            const totalFrames = frameCounts[currentState] || 1;
            const frameWidth = Math.floor(img.naturalWidth / totalFrames);
            const frameHeight = img.naturalHeight;
            const speed = animSpeeds[currentState] || 8;
            
            let currentFrame = 0;
            
            if (currentState === 'attack') {
                // Ensures the spellcast animation starts exactly at frame 0 every time you shoot
                const elapsed = Math.max(0, 0.4 - this.attackTimer);
                currentFrame = Math.floor(elapsed * speed) % totalFrames;
            } else {
                currentFrame = Math.floor(this.globalAnimTime * speed) % totalFrames;
            }

            const sourceX = currentFrame * frameWidth;
            
            const scaleMultiplier = 7.0; 
            const drawHeight = radius * scaleMultiplier;
            const drawWidth = drawHeight * (frameWidth / frameHeight);
            
            let drawX = -drawWidth / 2;
            let drawY = -drawHeight + (radius * 1.5); 

            // Offsets the mage so the magic doesn't shift the body's center
            if (currentState === 'attack') {
                drawX = -drawWidth * 0.28; 
            }
            
            if (currentState === 'hurt') {
                ctx.filter = 'brightness(200%) drop-shadow(0 0 10px white)';
            }
            
            ctx.drawImage(
                img,
                sourceX, 0, frameWidth, frameHeight, 
                drawX, drawY, drawWidth, drawHeight 
            );
            
            ctx.restore();

        } else {
            // Fallback circles (if images fail to load)
            ctx.shadowBlur = isFlashing ? 20 : 12;
            ctx.shadowColor = isFlashing ? '#ffffff' : '#a78bfa';
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isFlashing ? '#ffffff' : '#7c3aed'; ctx.fill();
            
            const ex = x + Math.cos(this.facingAngle) * (radius * 0.45);
            const ey = y + Math.sin(this.facingAngle) * (radius * 0.45);
            ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
        }

        ctx.restore();

        // Draw weapon overlays (like the spinning orbs)
        for (const w of this.weapons) w.draw(ctx);
    }

    get xpProgress() { return this.xp / this.xpToNext; }
    get hpFraction() { return this.hp / this.stats.maxHp; }
    rollCrit() { return Math.random() < this.stats.critChance; }
    
    calcDamage(base, allowCrit = true) {
        const isCrit = allowCrit && this.rollCrit();
        const dmg = Math.round(base * this.stats.damage * (isCrit ? this.stats.critMult : 1));
        return { dmg, isCrit };
    }

    addWeapon(WeaponClass) {
        const existing = this.weapons.find(w => w instanceof WeaponClass);
        if (existing) existing.levelUp();
        else this.weapons.push(new WeaponClass(this.game));
    }

    addUltimate(UltimateClass) {
        if (this.ultimates.find(u => u instanceof UltimateClass)) return;
        this.ultimates.push(new UltimateClass(this.game));
    }

    addUltimateCharge() {
        for (const ultimate of this.ultimates) {
            ultimate.addCharge(1);
        }
    }

    castUltimate(index) {
        const ultimate = this.ultimates[index];
        if (!ultimate) return false;
        return ultimate.cast(this);
    }
}

// ─── Pickups ─────────────────────────────────────────────────────────────────

const GEM_COLORS = ['#22c55e', '#facc15', '#f97316', '#ec4899', '#a78bfa'];

class XPGem extends Entity {
    constructor(x, y, value) {
        super(x, y, 7);
        this.value = value;
        this.bobOffset = Math.random() * Math.PI * 2;
        this.attractSpeed = 0;
        this.attracting = false;
        this.color = GEM_COLORS[Math.min(4, Math.floor(Math.log2(value)))];
        this.life = 30; 
        this.collected = false;
    }

    update(dt, player) {
        this.life -= dt;
        if (this.life <= 0) { this.dead = true; return; }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const d  = Math.sqrt(dx * dx + dy * dy);

        const magnetRadius = player.magnetAll ? 3000 : player.stats.pickupRadius;
        if (d < magnetRadius) this.attracting = true;

        if (this.attracting) {
            this.attractSpeed = Math.min(this.attractSpeed + 600 * dt, 500);
            if (d > 0) {
                this.x += (dx / d) * this.attractSpeed * dt;
                this.y += (dy / d) * this.attractSpeed * dt;
            }
        }

        if (d < player.radius + this.radius + 2) {
            this.collected = true;
            this.dead = true;
            player.addXP(this.value);
        }
    }

    draw(ctx) {
        const bob = Math.sin(Date.now() * 0.003 + this.bobOffset) * 2;
        const { x } = this;
        const y = this.y + bob;

        const alpha = this.life < 3 ? Math.sin(Date.now() * 0.01) * 0.5 + 0.5 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.moveTo(x,        y - 7);
        ctx.lineTo(x + 5,    y);
        ctx.lineTo(x,        y + 7);
        ctx.lineTo(x - 5,    y);
        ctx.closePath();

        const grd = ctx.createLinearGradient(x - 5, y - 7, x + 5, y + 7);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.4, this.color);
        grd.addColorStop(1, '#000000');
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.restore();
    }
}

class HealOrb extends Entity {
    constructor(x, y, healAmount) {
        super(x, y, 9);
        this.healAmount = healAmount;
        this.life = 20;
        this.bobOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        this.life -= dt;
        if (this.life <= 0) { this.dead = true; return; }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const d  = Math.sqrt(dx * dx + dy * dy);

        if (d < player.radius + this.radius + 2) {
            this.dead = true;
            player.heal(this.healAmount);
        }
    }

    draw(ctx) {
        const bob = Math.sin(Date.now() * 0.004 + this.bobOffset) * 2.5;
        const { x } = this;
        const y = this.y + bob;
        const alpha = this.life < 3 ? Math.sin(Date.now() * 0.012) * 0.5 + 0.5 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#4ade80';

        const grd = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 9);
        grd.addColorStop(0, '#bbf7d0');
        grd.addColorStop(0.5, '#4ade80');
        grd.addColorStop(1, '#166534');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
        ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
        ctx.stroke();

        ctx.restore();
    }
}

class MagnetPickup extends Entity {
    constructor(x, y) {
        super(x, y, 9);
        this.life = 15;
        this.bobOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        this.life -= dt;
        if (this.life <= 0) { this.dead = true; return; }

        const d = dist(this.x, this.y, player.x, player.y);
        if (d < player.radius + this.radius + 2) {
            this.dead = true;
            player.magnetAll = true;
            player.magnetTimer = 3;
        }
    }

    draw(ctx) {
        const bob = Math.sin(Date.now() * 0.004 + this.bobOffset) * 2.5;
        const { x } = this;
        const y = this.y + bob;

        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#38bdf8';

        const grd = ctx.createRadialGradient(x, y, 1, x, y, 9);
        grd.addColorStop(0, '#e0f2fe');
        grd.addColorStop(0.5, '#38bdf8');
        grd.addColorStop(1, '#0369a1');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('M', x, y);

        ctx.restore();
    }
}

window.GameEntities = { Entity, Player, BASE_PLAYER_STATS, XPGem, HealOrb, MagnetPickup };

})();
