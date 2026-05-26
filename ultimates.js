/**
 * ultimates.js - Manual ultimate abilities and selection metadata.
 * Depends on: utils.js, weapons.js, enemies.js
 */

'use strict';
(() => {

const { angleTo, distSq, randFloat, clamp } = window.GameUtils;

class FrostArrowProjectile extends window.GameWeapons.Projectile {
    constructor(opts) {
        super(opts);
        this.angle = opts.angle;
    }

    draw(ctx) {
        const x = this.x;
        const y = this.y + this.drawYOffset;
        const len = 48;
        const half = 7;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#7dd3fc';

        const grd = ctx.createLinearGradient(-len * 0.45, 0, len * 0.55, 0);
        grd.addColorStop(0, '#38bdf8');
        grd.addColorStop(0.5, '#f0f9ff');
        grd.addColorStop(1, '#0ea5e9');
        ctx.fillStyle = grd;

        ctx.beginPath();
        ctx.moveTo(len * 0.56, 0);
        ctx.lineTo(len * 0.18, -half * 1.5);
        ctx.lineTo(len * 0.2, -half * 0.55);
        ctx.lineTo(-len * 0.45, -half * 0.55);
        ctx.lineTo(-len * 0.58, 0);
        ctx.lineTo(-len * 0.45, half * 0.55);
        ctx.lineTo(len * 0.2, half * 0.55);
        ctx.lineTo(len * 0.18, half * 1.5);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}

class BlackHoleEffect {
    constructor(game, x, y, radius, damage) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.damage = damage;
        this.life = 1.8;
        this.maxLife = 1.8;
        this.tick = 0;
        this.spin = randFloat(0, Math.PI * 2);
    }

    update(dt) {
        this.life -= dt;
        this.tick -= dt;
        this.spin += dt * 4.5;

        for (const enemy of this.game.grid.query(this.x, this.y, this.radius)) {
            if (enemy.dead) continue;
            const dx = this.x - enemy.x;
            const dy = this.y - enemy.y;
            const dSq = dx * dx + dy * dy;
            if (dSq > this.radius * this.radius) continue;

            const d = Math.max(1, Math.sqrt(dSq));
            const pull = 720 * (1 - d / this.radius);
            enemy.kbX += (dx / d) * pull * dt;
            enemy.kbY += (dy / d) * pull * dt;
        }

        if (this.tick <= 0) {
            this.tick = 0.35;
            for (const enemy of this.game.grid.query(this.x, this.y, this.radius)) {
                if (enemy.dead) continue;
                if (distSq(this.x, this.y, enemy.x, enemy.y) > this.radius * this.radius) continue;
                enemy.takeDamage(this.damage, false, this.game);
                this.game.floatingText.spawn(enemy.x, enemy.y - 30, this.damage, false);
            }
        }
    }

    draw(ctx) {
        const t = 1 - this.life / this.maxLife;
        const alpha = clamp(Math.sin(t * Math.PI) * 1.2, 0, 1);
        const outer = this.radius * (0.45 + 0.55 * Math.min(1, t * 1.4));
        const core = outer * 0.22;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y - 18);
        ctx.rotate(this.spin);

        const halo = ctx.createRadialGradient(0, 0, core, 0, 0, outer);
        halo.addColorStop(0, 'rgba(0,0,0,1)');
        halo.addColorStop(0.2, 'rgba(0,0,0,1)');
        halo.addColorStop(0.32, 'rgba(168,85,247,0.95)');
        halo.addColorStop(0.48, 'rgba(251,191,36,0.75)');
        halo.addColorStop(0.68, 'rgba(59,130,246,0.28)');
        halo.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.ellipse(0, 0, outer, outer * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.rotate(-this.spin * 1.8);
        ctx.strokeStyle = 'rgba(233,213,255,0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 12]);
        ctx.beginPath();
        ctx.ellipse(0, 0, outer * 0.72, outer * 0.24, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#000';
        ctx.shadowBlur = 32;
        ctx.shadowColor = '#000';
        ctx.beginPath();
        ctx.arc(0, 0, core, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    get dead() {
        return this.life <= 0;
    }
}

class ThunderStrikeEffect {
    constructor(points) {
        this.points = points;
        this.life = 0.35;
        this.maxLife = 0.35;
    }

    update(dt) {
        this.life -= dt;
    }

    draw(ctx) {
        const alpha = clamp(this.life / this.maxLife, 0, 1);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';

        for (const bolt of this.points) {
            ctx.shadowBlur = 22;
            ctx.shadowColor = '#fde047';
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(bolt[0].x, bolt[0].y);
            for (let i = 1; i < bolt.length; i++) ctx.lineTo(bolt[i].x, bolt[i].y);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.restore();
    }

    get dead() {
        return this.life <= 0;
    }
}

class FireBallEffect {
    constructor(game, x, y, radius, damage, burnDps) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.damage = damage;
        this.burnDps = burnDps;
        this.life = 0.9;
        this.maxLife = 0.9;
        this.impactDone = false;
    }

    update(dt) {
        this.life -= dt;

        if (!this.impactDone && this.life <= 0.48) {
            this.impactDone = true;
            this.applyImpact();
        }
    }

    applyImpact() {
        for (const enemy of this.game.grid.query(this.x, this.y, this.radius)) {
            if (enemy.dead) continue;
            if (distSq(this.x, this.y, enemy.x, enemy.y) > this.radius * this.radius) continue;

            enemy.takeDamage(this.damage, false, this.game);
            enemy.applyBurn(this.burnDps, 4.5);
            this.game.floatingText.spawn(enemy.x, enemy.y - 30, this.damage, false);
        }

        this.game.particles.emit({
            x: this.x, y: this.y - 20,
            count: 90, color: '#fed7aa', color2: '#dc2626',
            speed: 210, size: 6, lifetime: 0.7, glow: true
        });
        this.game.screenShake.trigger(12, 0.35);
        this.game.audio.explosion();
    }

    draw(ctx) {
        const t = 1 - this.life / this.maxLife;
        const meteorT = clamp(t / 0.48, 0, 1);
        const mx = this.x - 220 + 220 * meteorT;
        const my = this.y - 420 + 400 * meteorT;

        ctx.save();
        if (!this.impactDone) {
            ctx.strokeStyle = 'rgba(251,146,60,0.75)';
            ctx.lineWidth = 16;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 24;
            ctx.shadowColor = '#f97316';
            ctx.beginPath();
            ctx.moveTo(mx - 80, my - 80);
            ctx.lineTo(mx, my);
            ctx.stroke();

            const grd = ctx.createRadialGradient(mx - 4, my - 4, 2, mx, my, 24);
            grd.addColorStop(0, '#fff7ed');
            grd.addColorStop(0.35, '#fb923c');
            grd.addColorStop(1, '#991b1b');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(mx, my, 24, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const blastT = clamp((0.48 - this.life) / 0.48, 0, 1);
            ctx.globalAlpha = 1 - blastT;
            ctx.strokeStyle = '#fb923c';
            ctx.lineWidth = 7 * (1 - blastT);
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ef4444';
            ctx.beginPath();
            ctx.arc(this.x, this.y - 20, this.radius * blastT, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    get dead() {
        return this.life <= 0;
    }
}

class Ultimate {
    constructor(game, name, icon, desc) {
        this.game = game;
        this.name = name;
        this.icon = icon;
        this.desc = desc;
        this.charges = 1;
    }

    canCast() {
        return this.charges > 0 && this.game.enemies.some(e => !e.dead);
    }

    cast(player) {
        if (!this.canCast()) return false;
        this.charges--;
        this.activate(player);
        return true;
    }

    addCharge(amount = 1) {
        this.charges += amount;
    }

    activate(player) {}
}

class BlackHole extends Ultimate {
    constructor(game) {
        super(game, 'Black Hole', '◉', 'Pulls enemies inward and crushes them.');
    }

    activate(player) {
        const target = this.game.enemies
            .filter(e => !e.dead)
            .sort((a, b) => distSq(player.x, player.y, a.x, a.y) - distSq(player.x, player.y, b.x, b.y))[0] || { x: player.x, y: player.y };
        const radius = 260;
        const damage = Math.round(35 * player.stats.damage);

        this.game.ultimateManager.addEffect(new BlackHoleEffect(this.game, target.x, target.y, radius, damage));
        this.game.screenShake.trigger(8, 0.25);
        this.game.audio.explosion();
    }
}

class FrostArrow extends Ultimate {
    constructor(game) {
        super(game, 'Frost Arrow', '➤', 'Pierces forward, freezing enemies in its path.');
    }

    activate(player) {
        const target = this._nearestEnemy(player);
        const angle = target
            ? angleTo(player.x, player.y, target.x, target.y)
            : player.facingAngle;
        const damage = Math.round(120 * player.stats.damage);
        const speed = 640 * player.stats.projectileSpd;

        this.game.projectiles.push(new FrostArrowProjectile({
            x: player.x + Math.cos(angle) * 28,
            y: player.y + Math.sin(angle) * 28,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            radius: 12,
            damage,
            isCrit: false,
            color: '#bae6fd',
            glowColor: '#38bdf8',
            piercing: 12,
            lifetime: 1.4,
            drawYOffset: -40,
            onHit: (enemy, g) => {
                enemy.frozenTimer = Math.max(enemy.frozenTimer, 2.2);
                enemy.chilledTimer = Math.max(enemy.chilledTimer, 4.0);
                g.floatingText.spawn(enemy.x, enemy.y - 30, damage, false);
                g.particles.emit({
                    x: enemy.x, y: enemy.y - 20,
                    count: 8, color: '#e0f2fe', color2: '#0284c7',
                    speed: 75, size: 3, lifetime: 0.35, glow: true
                });
            }
        }));

        this.game.audio.lightning();
    }

    _nearestEnemy(player) {
        let best = null;
        let bestD = Infinity;
        for (const enemy of this.game.enemies) {
            if (enemy.dead) continue;
            const d = distSq(player.x, player.y, enemy.x, enemy.y);
            if (d < bestD) {
                bestD = d;
                best = enemy;
            }
        }
        return best;
    }
}

class ThunderStrike extends Ultimate {
    constructor(game) {
        super(game, 'Thunder Strike', '⚡', 'Calls heavy lightning onto several enemies.');
    }

    activate(player) {
        const targets = this.game.enemies
            .filter(e => !e.dead)
            .sort((a, b) => distSq(player.x, player.y, a.x, a.y) - distSq(player.x, player.y, b.x, b.y))
            .slice(0, 9);
        const damage = Math.round(140 * player.stats.damage);
        const bolts = [];

        for (const enemy of targets) {
            enemy.takeDamage(damage, true, this.game);
            this.game.floatingText.spawn(enemy.x, enemy.y - 30, damage, true);
            bolts.push(this._buildBolt(enemy.x + randFloat(-35, 35), enemy.y - 460, enemy.x, enemy.y - 18));
            this.game.particles.emit({
                x: enemy.x, y: enemy.y - 25,
                count: 16, color: '#fef08a', color2: '#38bdf8',
                speed: 120, size: 4, lifetime: 0.35, glow: true
            });
        }

        this.game.ultimateManager.addEffect(new ThunderStrikeEffect(bolts));
        this.game.screenShake.trigger(9, 0.25);
        this.game.audio.lightning();
    }

    _buildBolt(x1, y1, x2, y2) {
        const pts = [{ x: x1, y: y1 }];
        const segments = 9;
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            pts.push({
                x: x1 + (x2 - x1) * t + randFloat(-24, 24),
                y: y1 + (y2 - y1) * t + randFloat(-18, 18)
            });
        }
        pts.push({ x: x2, y: y2 });
        return pts;
    }
}

class FireBall extends Ultimate {
    constructor(game) {
        super(game, 'Fire Ball', '🔥', 'Drops a massive fireball that burns a wide area.');
    }

    activate(player) {
        const target = this.game.enemies.find(e => !e.dead) || { x: player.x, y: player.y };
        const radius = 210 * player.stats.areaBonus;
        const damage = Math.round(115 * player.stats.damage);
        const burnDps = 32 * player.stats.damage;

        this.game.ultimateManager.addEffect(new FireBallEffect(this.game, target.x, target.y, radius, damage, burnDps));
        this.game.audio.projectileFire();
    }
}

class UltimateManager {
    constructor(game) {
        this.game = game;
        this.effects = [];
    }

    addEffect(effect) {
        this.effects.push(effect);
    }

    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.effects[i].update(dt);
            if (this.effects[i].dead) this.effects.splice(i, 1);
        }
    }

    draw(ctx) {
        for (const effect of this.effects) effect.draw(ctx);
    }

    create(UClass) {
        return new UClass(this.game);
    }

    generateOptions(count = 3) {
        const owned = new Set((this.game.player.ultimates || []).map(u => u.constructor));
        const pool = ULTIMATE_CLASSES.filter(UClass => !owned.has(UClass));
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length)).map(UClass => {
            const dummy = new UClass(this.game);
            return {
                type: 'ultimate',
                ultimateClass: UClass,
                name: dummy.name,
                icon: dummy.icon,
                desc: dummy.desc,
                apply: () => this.game.player.addUltimate(UClass)
            };
        });
    }
}

const ULTIMATE_CLASSES = [BlackHole, FrostArrow, ThunderStrike, FireBall];

window.GameUltimates = {
    Ultimate,
    BlackHole,
    FrostArrow,
    ThunderStrike,
    FireBall,
    UltimateManager,
    ULTIMATE_CLASSES
};

})();
