/**
 * weapons.js — All weapon classes and projectile logic.
 * Weapon classes: MagicWand, OrbitWeapon, Explosion, KnifeThrow, Lightning.
 * Each weapon extends the base Weapon class.
 * Depends on: utils.js, entities.js
 */

'use strict';
(() => {

const { clamp, lerp, dist, distSq, normalize, randFloat, randInt, randChoice,
        rgba, angleTo } = window.GameUtils;

// ─── Projectile ───────────────────────────────────────────────────────────────

/**
 * A moving projectile. Handles collision against enemies each frame.
 */
class Projectile extends window.GameEntities.Entity {
    constructor({ x, y, vx, vy, radius = 7, damage, isCrit = false,
                  color = '#a78bfa', glowColor = '#7c3aed',
                  piercing = 0, lifetime = 2,
                  onHit = null, trail = true }) {
        super(x, y, radius);
        this.vx = vx;
        this.vy = vy;
        this.damage  = damage;
        this.isCrit  = isCrit;
        this.color   = color;
        this.glowColor = glowColor;
        this.colorRgbStr = hexRgb(color); // cache for trail
        this.piercing  = piercing;   // how many more enemies it can hit (0 = no pierce)
        this.lifetime  = lifetime;
        this.onHit     = onHit;      // optional callback(enemy)
        this.trail     = trail;
        this.hitSet    = new Set();  // enemies already hit by this projectile
        this._trailPoints = [];
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.lifetime -= dt;
        if (this.lifetime <= 0) this.dead = true;

        // Record trail
        if (this.trail) {
            this._trailPoints.push({ x: this.x, y: this.y });
            if (this._trailPoints.length > 8) this._trailPoints.shift();
        }
    }

    draw(ctx) {
        const { x, y, radius, color, glowColor } = this;

        // Trail
        if (this.trail && this._trailPoints.length > 1) {
            ctx.save();
            for (let i = 1; i < this._trailPoints.length; i++) {
                const t  = i / this._trailPoints.length;
                const p0 = this._trailPoints[i - 1];
                const p1 = this._trailPoints[i];
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.strokeStyle = `rgba(${this.colorRgbStr},${t * 0.6})`;
                ctx.lineWidth = radius * t * 1.4;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.save();
        ctx.shadowBlur  = 14;
        ctx.shadowColor = glowColor;

        const grd = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, radius);
        grd.addColorStop(0, '#fff');
        grd.addColorStop(0.3, color);
        grd.addColorStop(1,   glowColor);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** Try to hit enemy; returns true if contact was made. */
    tryHit(enemy, game) {
        if (this.dead || this.hitSet.has(enemy)) return false;
        if (!this.overlaps(enemy)) return false;

        this.hitSet.add(enemy);
        enemy.takeDamage(this.damage, this.isCrit, game);

        if (this.onHit) this.onHit(enemy, game);

        if (this.piercing <= 0) {
            this.dead = true;
        } else {
            this.piercing--;
        }
        return true;
    }
}

// Helper: convert hex to "r,g,b" string for rgba()
function hexRgb(hex) {
    const { r, g, b } = window.GameUtils.hexToRgb(hex);
    return `${r},${g},${b}`;
}

// ─── Base Weapon ──────────────────────────────────────────────────────────────

class Weapon {
    /**
     * @param {Object} game   Game instance reference
     * @param {string} name   Display name
     * @param {string} icon   Emoji icon for upgrade cards
     */
    constructor(game, name, icon) {
        this.game    = game;
        this.name    = name;
        this.icon    = icon;
        this.level   = 1;
        this.maxLevel = 8;
        this._timer  = 0;     // cooldown accumulator
    }

    /** Cooldown in seconds at current level (override per weapon). */
    get cooldown() { return 2; }

    update(dt, player) {
        this._timer += dt * player.stats.attackSpeed;
        while (this._timer >= this.cooldown) {
            this._timer -= this.cooldown;
            player.attackTimer = 0.4; 
            this.fire(player);
        }
    }

    /** Override to draw orbiting visuals etc. */
    draw(ctx) {}

    /** Called when player picks this weapon as an upgrade. */
    levelUp() {
        if (this.level < this.maxLevel) this.level++;
    }

    /** Returns a short description for the upgrade card. */
    getLevelDesc() { return `Lv ${this.level}`; }

    /** Emit a projectile into the game. */
    _spawnProjectile(opts) {
        this.game.projectiles.push(new Projectile(opts));
    }

    /** Find the nearest enemy to a world-space point, within maxDist. */
    _nearestEnemy(wx, wy, maxDist = Infinity) {
        let best = null, bestD = maxDist * maxDist;
        const candidates = (maxDist < 1500) ? this.game.grid.query(wx, wy, maxDist) : this.game.enemies;
        for (const e of candidates) {
            if (e.dead) continue;
            const d = distSq(wx, wy, e.x, e.y);
            if (d < bestD) { bestD = d; best = e; }
        }
        return best;
    }

    /** Return all enemies within radius. */
    _enemiesInRadius(wx, wy, radius) {
        const r2 = radius * radius;
        return this.game.grid.query(wx, wy, radius).filter(e => !e.dead && distSq(wx, wy, e.x, e.y) <= r2);
    }
}

// ─── 1. Magic Wand ────────────────────────────────────────────────────────────

/**
 * Fires magic projectiles toward the nearest enemy.
 * Higher levels fire more projectiles and faster.
 */
class MagicWand extends Weapon {
    constructor(game) {
        super(game, 'Magic Wand', '🔮');
        this.maxLevel = 8;
    }

    get cooldown() {
        // Faster at higher levels
        return Math.max(0.25, 1.2 - (this.level - 1) * 0.1);
    }

    get _baseDamage() { return 18 + (this.level - 1) * 6; }
    get _projectileCount() { return 1 + Math.floor((this.level - 1) / 2); }
    get _piercing() { return Math.floor((this.level - 1) / 3); }

fire(player) {
        const target = this._nearestEnemy(player.x, player.y, 700);
        const speed  = 320 * player.stats.projectileSpd;

        // Compute base angle — if no target, aim the way the player is facing
        const baseAngle = target
            ? angleTo(player.x, player.y, target.x, target.y)
            : player.facingAngle;

        // 1. FORCE THE WIZARD TO FACE THE ENEMY HE IS ATTACKING
        player.facingAngle = baseAngle;

        const count = this._projectileCount;
        const spreadAngle = count > 1 ? (count - 1) * 0.18 : 0;

        // 2. EXACT HAND/STAFF POSITION
        // player.y is the feet. Subtracting 55 moves the spawn point up to the chest/hands.
        // We also add Math.cos and Math.sin to push the spawn point forward to the tip of the staff!
        const staffTipX = player.x + Math.cos(baseAngle) * 35;
        const staffTipY = player.y - 55 + Math.sin(baseAngle) * 35;

        for (let i = 0; i < count; i++) {
            const angle = baseAngle + (i - (count - 1) / 2) * (spreadAngle / Math.max(1, count - 1));
            const { dmg, isCrit } = player.calcDamage(this._baseDamage);

            this._spawnProjectile({
                x: staffTipX, // <--- Spawns at the X of the staff tip
                y: staffTipY, // <--- Spawns at the Y of the staff tip
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 7 + (this.level > 4 ? 2 : 0),
                damage: dmg,
                isCrit,
                color: '#c084fc',
                glowColor: '#7c3aed',
                piercing: this._piercing,
                lifetime: 1.6,
                onHit: (enemy, g) => {
                    g.particles.emit({
                        x: enemy.x, y: enemy.y,
                        count: 5, color: '#c084fc', color2: '#7c3aed',
                        speed: 70, size: 3, lifetime: 0.3, glow: true
                    });
                    g.floatingText.spawn(enemy.x, enemy.y, dmg, isCrit);
                }
            });
        }
        this.game.audio.projectileFire();
    }

    getLevelDesc() {
        return `Lv${this.level} — ${this._projectileCount} bolts, ${this._baseDamage} dmg`;
    }
}

// ─── 2. Orbit Weapon ─────────────────────────────────────────────────────────

/**
 * Spinning orbs that orbit the player and damage anything they touch.
 * No cooldown mechanic — the orbs are always present and rotate.
 */
class OrbitWeapon extends Weapon {
    constructor(game) {
        super(game, 'Arcane Orbs', '⭕');
        this.angle  = 0;
        this.hitCooldowns = new Map(); // enemy → remaining iframes
        this.maxLevel = 8;
    }

    get _orbCount()  { return 2 + Math.floor((this.level - 1) / 2); }
    get _orbRadius() { return 65 + (this.level - 1) * 5; }
    get _speed()     { return 2.2 + (this.level - 1) * 0.15; }   // rad/s
    get _baseDamage(){ return 8 + (this.level - 1) * 5; }
    get _orbSize()   { return 9 + Math.floor((this.level - 1) / 3); }

    // Override: weapon always fires (orbs persist), no cooldown needed
    update(dt, player) {
        if (player.dead) return;
        this.angle += this._speed * dt;

        // Update hit-cooldown timers
        for (const [enemy, t] of this.hitCooldowns) {
            const remaining = t - dt;
            if (remaining <= 0) this.hitCooldowns.delete(enemy);
            else this.hitCooldowns.set(enemy, remaining);
        }

        // Collision check each orb vs each enemy
        const count  = this._orbCount;
        const r      = this._orbRadius * player.stats.areaBonus;
        const orbR   = this._orbSize;

        for (let i = 0; i < count; i++) {
            const a  = this.angle + (i / count) * Math.PI * 2;
            const ox = player.x + Math.cos(a) * r;
            const oy = player.y + Math.sin(a) * r;

            const targets = this.game.grid.query(ox, oy, orbR + 35);
            for (const enemy of targets) {
                if (enemy.dead) continue;
                if (this.hitCooldowns.has(enemy)) continue;
                if (distSq(ox, oy, enemy.x, enemy.y) > (orbR + enemy.radius) ** 2) continue;

                const { dmg, isCrit } = player.calcDamage(this._baseDamage);
                enemy.takeDamage(dmg, isCrit, this.game);
                this.game.floatingText.spawn(enemy.x, enemy.y, dmg, isCrit);
                this.game.particles.emit({
                    x: enemy.x, y: enemy.y,
                    count: 4, color: '#f59e0b', color2: '#ef4444',
                    speed: 60, size: 3, lifetime: 0.25, glow: true
                });
                this.hitCooldowns.set(enemy, 0.5);
            }
        }
    }

    draw(ctx) {
        const player = this.game.player;
        if (player.dead) return;

        const count = this._orbCount;
        const r     = this._orbRadius * player.stats.areaBonus;
        const orbR  = this._orbSize;

        // Draw orbit ring
        ctx.save();
        ctx.strokeStyle = 'rgba(251,191,36,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < count; i++) {
            const a  = this.angle + (i / count) * Math.PI * 2;
            const ox = player.x + Math.cos(a) * r;
            const oy = player.y + Math.sin(a) * r;

            ctx.shadowBlur  = 16;
            ctx.shadowColor = '#f59e0b';

            const grd = ctx.createRadialGradient(ox - 2, oy - 2, 0, ox, oy, orbR);
            grd.addColorStop(0, '#fef3c7');
            grd.addColorStop(0.4, '#f59e0b');
            grd.addColorStop(1, '#b45309');
            ctx.fillStyle = grd;

            ctx.beginPath();
            ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    getLevelDesc() {
        return `Lv${this.level} — ${this._orbCount} orbs, ${this._baseDamage} dmg`;
    }
}

// ─── 3. Area Explosion ────────────────────────────────────────────────────────

/**
 * Periodically detonates an explosion around the player (or near enemies).
 */
class AreaExplosion extends Weapon {
    constructor(game) {
        super(game, 'Arcane Bomb', '💥');
        this.maxLevel = 8;
        this._blasts = []; // active blast visuals
    }

    get cooldown()    { return Math.max(1.5, 4.0 - (this.level - 1) * 0.3); }
    get _radius()     { return (80 + (this.level - 1) * 20) ; }
    get _baseDamage() { return 35 + (this.level - 1) * 20; }
    get _blastCount() { return 1 + Math.floor((this.level - 1) / 3); }

    fire(player) {
        const blastCount = this._blastCount;
        const rad = this._radius * player.stats.areaBonus;

        for (let b = 0; b < blastCount; b++) {
            // Pick a spot near enemies or random offset
            let bx = player.x + randFloat(-120, 120);
            let by = player.y + randFloat(-120, 120);

            // Snap to nearest enemy cluster
            const near = this._enemiesInRadius(player.x, player.y, 250);
            if (near.length > 0) {
                const target = randChoice(near);
                bx = target.x + randFloat(-30, 30);
                by = target.y + randFloat(-30, 30);
            }

            // Damage all enemies in radius
            const hit = this._enemiesInRadius(bx, by, rad);
            for (const enemy of hit) {
                const { dmg, isCrit } = player.calcDamage(this._baseDamage);
                enemy.takeDamage(dmg, isCrit, this.game);
                this.game.floatingText.spawn(enemy.x, enemy.y, dmg, isCrit);
            }

            // Particles
            this.game.particles.emit({
                x: bx, y: by,
                count: 30 + this.level * 4,
                color: '#f97316', color2: '#fef08a',
                speed: 160, speedVariance: 80,
                size: 6, sizeVariance: 3,
                lifetime: 0.6, gravity: 60, glow: true
            });
            this.game.particles.emit({
                x: bx, y: by,
                count: 12,
                color: '#7f1d1d', color2: '#f97316',
                speed: 80, size: 9, sizeVariance: 4,
                lifetime: 0.4, glow: false
            });

            this.game.screenShake.trigger(7, 0.22);
            this.game.audio.explosion();

            // Store blast ring visual
            this._blasts.push({ x: bx, y: by, rad, life: 0.35, maxLife: 0.35 });
        }
    }

    update(dt, player) {
        super.update(dt, player);
        // Age blast visuals
        for (let i = this._blasts.length - 1; i >= 0; i--) {
            this._blasts[i].life -= dt;
            if (this._blasts[i].life <= 0) this._blasts.splice(i, 1);
        }
    }

    draw(ctx) {
        for (const blast of this._blasts) {
            const t = 1 - blast.life / blast.maxLife;
            const alpha = (1 - t) * 0.7;
            const r = blast.rad * (0.5 + t * 0.6);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 4 * (1 - t);
            ctx.shadowBlur  = 20;
            ctx.shadowColor = '#fef08a';
            ctx.beginPath();
            ctx.arc(blast.x, blast.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    getLevelDesc() {
        return `Lv${this.level} — ${this._blastCount} blasts, ${this._baseDamage} dmg, r=${Math.round(this._radius)}`;
    }
}

// ─── 4. Rapid Knife Throw ─────────────────────────────────────────────────────

/**
 * Throws knives rapidly in the direction the player moved last,
 * and also toward the nearest enemy.
 */
class KnifeThrow extends Weapon {
    constructor(game) {
        super(game, 'Knife Barrage', '🗡️');
        this.maxLevel = 8;
    }

    get cooldown()    { return Math.max(0.08, 0.55 - (this.level - 1) * 0.055); }
    get _baseDamage() { return 14 + (this.level - 1) * 7; }
    get _piercing()   { return Math.floor((this.level - 1) / 2); }
    get _knifeCount() { return 1 + Math.floor((this.level - 1) / 3); }

    fire(player) {
        const target = this._nearestEnemy(player.x, player.y);
        const baseAngle = target
            ? angleTo(player.x, player.y, target.x, target.y)
            : player.facingAngle;

        const speed = 420 * player.stats.projectileSpd;
        const count = this._knifeCount;

        for (let i = 0; i < count; i++) {
            const angle = baseAngle + (i - (count - 1) / 2) * 0.14;
            const { dmg, isCrit } = player.calcDamage(this._baseDamage);

            this._spawnProjectile({
                x: player.x, y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 5,
                damage: dmg,
                isCrit,
                color: '#94a3b8',
                glowColor: '#cbd5e1',
                piercing: this._piercing,
                lifetime: 1.1,
                trail: false,
                onHit: (enemy, g) => {
                    g.particles.emit({
                        x: enemy.x, y: enemy.y,
                        count: 3, color: '#ef4444', color2: '#94a3b8',
                        speed: 50, size: 2, lifetime: 0.2
                    });
                    g.floatingText.spawn(enemy.x, enemy.y, dmg, isCrit);
                }
            });
        }
        // Lower volume knife sound (rapid fire)
        if (Math.random() < 0.4) this.game.audio.projectileFire();
    }

    getLevelDesc() {
        return `Lv${this.level} — ${this._knifeCount} knives, ${this._baseDamage} dmg, pierce ${this._piercing}`;
    }
}

// ─── 5. Lightning Strike ─────────────────────────────────────────────────────

/**
 * Calls down lightning bolts on random enemies. Chains to nearby enemies.
 */
class LightningStrike extends Weapon {
    constructor(game) {
        super(game, 'Chain Lightning', '⚡');
        this.maxLevel = 8;
        this._bolts = []; // visual bolt segments
    }

    get cooldown()     { return Math.max(0.6, 2.5 - (this.level - 1) * 0.25); }
    get _baseDamage()  { return 40 + (this.level - 1) * 18; }
    get _chainCount()  { return 2 + Math.floor((this.level - 1) / 2); }
    get _chainRadius() { return 130 + (this.level - 1) * 15; }

    fire(player) {
        const enemies = this.game.enemies.filter(e => !e.dead);
        if (enemies.length === 0) return;

        // Pick a random initial target
        const first = randChoice(enemies);
        const chainCount = this._chainCount;
        const chainR = this._chainRadius * player.stats.areaBonus;

        const struckSet = new Set();
        const struck = [];
        let current = first;
        const segments = [];

        for (let c = 0; c < chainCount; c++) {
            if (!current || struckSet.has(current)) break;

            struckSet.add(current);
            struck.push(current);
            const { dmg, isCrit } = player.calcDamage(
                this._baseDamage * Math.pow(0.75, c) // damage falls off per chain
            );
            current.takeDamage(dmg, isCrit, this.game);
            this.game.floatingText.spawn(current.x, current.y, dmg, isCrit);

            // Particles at strike point
            this.game.particles.emit({
                x: current.x, y: current.y,
                count: 10, color: '#fde047', color2: '#38bdf8',
                speed: 100, size: 4, lifetime: 0.35, glow: true
            });

            // Find bolt start (player for first, previous enemy for rest)
            const fromX = c === 0 ? player.x : struck[c - 1].x;
            const fromY = c === 0 ? player.y : struck[c - 1].y;

            segments.push(this._buildBolt(fromX, fromY, current.x, current.y));

            // Find next closest un-struck enemy using grid
            let next = null, bestD = chainR * chainR;
            const candidates = this.game.grid.query(current.x, current.y, chainR);
            for (const e of candidates) {
                if (struckSet.has(e) || e.dead) continue;
                const d = distSq(current.x, current.y, e.x, e.y);
                if (d < bestD) { bestD = d; next = e; }
            }
            current = next;
        }

        this._bolts.push({ segments, life: 0.18, maxLife: 0.18 });
        this.game.screenShake.trigger(4, 0.12);
        this.game.audio.lightning();
    }

    /** Generate a jagged lightning bolt path from (x1,y1) to (x2,y2). */
    _buildBolt(x1, y1, x2, y2) {
        const pts = [{ x: x1, y: y1 }];
        const segments = 8;
        for (let i = 1; i < segments; i++) {
            const t  = i / segments;
            const mx = lerp(x1, x2, t) + randFloat(-20, 20);
            const my = lerp(y1, y2, t) + randFloat(-20, 20);
            pts.push({ x: mx, y: my });
        }
        pts.push({ x: x2, y: y2 });
        return pts;
    }

    update(dt, player) {
            // 1. This handles the cooldown and the attack animation automatically
            super.update(dt, player);

            // 2. This makes the lightning bolts fade away and disappear!
            for (let i = this._bolts.length - 1; i >= 0; i--) {
                this._bolts[i].life -= dt;
                if (this._bolts[i].life <= 0) {
                    this._bolts.splice(i, 1);
                }
            }
        }

    draw(ctx) {
        for (const bolt of this._bolts) {
            const t = 1 - bolt.life / bolt.maxLife;
            const alpha = clamp(1 - t * 2, 0, 1);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowBlur  = 18;
            ctx.shadowColor = '#fde047';

            for (const seg of bolt.segments) {
                if (seg.length < 2) continue;
                ctx.beginPath();
                ctx.moveTo(seg[0].x, seg[0].y);
                for (let i = 1; i < seg.length; i++) {
                    ctx.lineTo(seg[i].x, seg[i].y);
                }
                ctx.strokeStyle = '#fde047';
                ctx.lineWidth = 2.5 * (1 - t);
                ctx.stroke();

                // Core white line
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    getLevelDesc() {
        return `Lv${this.level} — chains ${this._chainCount}×, ${this._baseDamage} dmg`;
    }
}

// ─── Weapon Registry ─────────────────────────────────────────────────────────

/** All available weapon classes, used by the upgrade system. */
const WEAPON_CLASSES = [MagicWand, OrbitWeapon, AreaExplosion, KnifeThrow, LightningStrike];

const WEAPON_DESCRIPTIONS = {
    MagicWand:      'Fires homing magic bolts at nearest enemies.',
    OrbitWeapon:    'Spinning orbs orbit you, damaging all they touch.',
    AreaExplosion:  'Triggers explosions near enemy clusters.',
    KnifeThrow:     'Rapid-fires piercing knives toward enemies.',
    LightningStrike:'Calls chain lightning that jumps between foes.',
};

// ─── Exports ─────────────────────────────────────────────────────────────────

window.GameWeapons = {
    Projectile,
    Weapon,
    MagicWand,
    OrbitWeapon,
    AreaExplosion,
    KnifeThrow,
    LightningStrike,
    WEAPON_CLASSES,
    WEAPON_DESCRIPTIONS,
};

})();

