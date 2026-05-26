/**
 * main.js — Main game loop, canvas rendering, state management.
 * Glues all modules together.
 */

'use strict';
(() => {

const Utils = window.GameUtils;
const Ents = window.GameEntities;
const Weps = window.GameWeapons;
const Enems = window.GameEnemies;
const Upgs = window.GameUpgrades;
const Ults = window.GameUltimates;

// ─── Asset Loader ────────────────────────────────────────────────────────────
window.ASSETS = {
    bg: new Image(),

    // PLAYER ANIMATION SHEETS
    player: {
        idle: new Image(),
        run: new Image(),
        hurt: new Image(),
        attack: new Image()
    },
    
    basic: new Image(),
    fast: new Image(),
    tank: new Image(),
    ghost: new Image(),
    elite: new Image(),
};

// Set image sources (make sure you have an 'assets' folder with these images!)
window.ASSETS.bg.src = 'assets/bg.png';

window.ASSETS.player.idle.src   = 'assets/PLAYER_IDLE.png';
window.ASSETS.player.run.src    = 'assets/PLAYER_RUN.png';
window.ASSETS.player.hurt.src   = 'assets/PLAYER_HURT.png';
window.ASSETS.player.attack.src = 'assets/PLAYER_ATTACK_1.png';

window.ASSETS.basic.src = 'assets/goblin.png';
window.ASSETS.fast.src = 'assets/bat.png';
window.ASSETS.tank.src = 'assets/golem.png';
window.ASSETS.ghost.src = 'assets/ghost.png';
window.ASSETS.elite.src = 'assets/boss.png';

// ─── Game State & Engine ─────────────────────────────────────────────────────

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        
        this.input = new Utils.InputManager();
        this.audio = new Utils.AudioManager();
        this.particles = new Utils.ParticleSystem();
        this.floatingText = new Utils.FloatingTextManager();
        this.screenShake = new Utils.ScreenShake();
        this.fpsCounter = new Utils.FPSCounter();
        this.upgradeManager = new Upgs.UpgradeManager(this);
        this.ultimateManager = new Ults.UltimateManager(this);
        
        this.grid = new Utils.SpatialGrid(30);
        
        this.state = 'MENU'; 
        this.lastTime = 0;
        this.enemyScaling = { speed: 1, damage: 1, hp: 1 };
        this.bossFight = null;

        this.bgPattern = null;
        window.ASSETS.bg.onload = () => {
            this.bgPattern = this.ctx.createPattern(window.ASSETS.bg, 'repeat');
        };
        
        window.addEventListener('resize', () => this.resize());
        this.resize();
        this.bindUI();
        
        requestAnimationFrame((t) => this.loop(t));
    }
    
    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }
    
    bindUI() {
        document.getElementById('btn-start').addEventListener('click', () => {
            this.audio.resume();
            document.getElementById('start-screen').classList.remove('active');
            this.startGame();
        });
        
        document.getElementById('btn-restart').addEventListener('click', () => {
            document.getElementById('death-screen').classList.remove('active');
            this.startGame();
        });
    }

    startGame() {
        this.audio.stopBossMusic();
        this.audio.stopThemeMusic();
        this.player = new Ents.Player(0, 0, this);
        this.player.addWeapon(Weps.MagicWand);
        this.hudCache = {};
        
        this.enemies = [];
        this.projectiles = [];
        this.gems = [];
        this.enemyScaling = { speed: 1, damage: 1, hp: 1 };
        this.bossFight = null;
        
        this.director = new Enems.Director(this);
        this.particles.particles = [];
        this.floatingText.numbers = [];
        this.ultimateManager.effects = [];
        this.grid.clear();
        
        this.camera = { x: 0, y: 0 };
        this.state = 'PLAYING';
        this.lastTime = performance.now();
        this.audio.startThemeMusic();
        
        this.updateHUD();
        this.triggerUltimateMenu('CHOOSE STARTING ULTI', 'Pick your first ultimate. Press 1-4 to cast owned ultis.');
    }

    triggerLevelUpMenu() {
        this.state = 'UPGRADE';
        const screen = document.getElementById('upgrade-screen');
        const container = document.getElementById('cards-container');
        const title = screen.querySelector('h2');
        const subtitle = screen.querySelector('p');
        
        title.innerText = 'LEVEL UP!';
        subtitle.innerText = 'Choose your upgrade:';
        container.innerHTML = '';
        
        const options = this.upgradeManager.generateOptions(3);
        options.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
                <div class="card-icon">${opt.icon}</div>
                <div class="card-title">${opt.name}</div>
                <div class="card-desc">${opt.desc}</div>
            `;
            card.addEventListener('click', () => {
                opt.apply();
                this.audio.upgradeSelect();
                screen.classList.remove('active');
                if (this.player.level % 5 === 0 && this.triggerUltimateMenu('NEW ULTI UNLOCKED', 'Choose another ultimate for your arsenal.')) {
                    return;
                }
                this.resumePlay();
            });
            container.appendChild(card);
        });
        
        screen.classList.add('active');
    }

    triggerBossFight() {
        const bossLevel = Math.floor(this.player.level / 10);

        for (const enemy of this.enemies) {
            if (!enemy.dead) this.director.enemyPool.release(enemy);
        }
        this.enemies = [];
        this.projectiles = [];
        this.gems = [];
        this.particles.particles = [];
        this.ultimateManager.effects = [];
        this.floatingText.numbers = [];
        this.grid.clear();

        this.player.x = 0;
        this.player.y = 180;
        this.player._velX = 0;
        this.player._velY = 0;
        this.camera.x = 0;
        this.camera.y = 0;

        const boss = this.director.spawnArenaBoss(bossLevel);
        this.bossFight = {
            level: this.player.level,
            boss,
            arenaRadius: 520,
            time: 0
        };

        this.state = 'BOSS';
        this.lastTime = performance.now();
        this.audio.startBossMusic();
        this.audio.bossSpawn();
        this.floatingText.spawn(0, 40, `BOSS LEVEL ${this.player.level}`, false, false);
        this.floatingText.numbers[this.floatingText.numbers.length - 1].scale = 2.8;
        this.floatingText.numbers[this.floatingText.numbers.length - 1].color = '#f97316';
        this.updateHUD();
    }

    completeBossFight(boss) {
        if (!this.bossFight || this.bossFight.boss !== boss) return;

        this.bossFight = null;
        this.audio.stopBossMusic();
        this.audio.startThemeMusic();
        this.audio.levelUp();

        this.enemyScaling.speed *= 1.10;
        this.enemyScaling.damage *= 1.10;
        this.enemyScaling.hp *= 1.20;

        this.player.stats.maxHp += 20;
        this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + 60);
        this.player.stats.damage += 0.08;
        this.player.stats.attackSpeed *= 1.05;
        this.player.level += 1;
        this.player.xp = 0;
        this.player.xpToNext = this.player._calcXpThreshold(this.player.level);
        this.player.addUltimateCharge();

        this.enemies = this.enemies.filter(e => e !== boss);
        this.director.enemyPool.release(boss);
        this.floatingText.spawn(this.player.x, this.player.y - 80, 'BOSS DEFEATED', false, false);
        this.floatingText.numbers[this.floatingText.numbers.length - 1].scale = 2.4;
        this.floatingText.numbers[this.floatingText.numbers.length - 1].color = '#facc15';

        this.state = 'PLAYING';
        this.lastTime = performance.now();
        this.updateHUD();
    }

    triggerUltimateMenu(titleText, subtitleText) {
        const screen = document.getElementById('upgrade-screen');
        const container = document.getElementById('cards-container');
        const title = screen.querySelector('h2');
        const subtitle = screen.querySelector('p');
        const options = this.ultimateManager.generateOptions(3);

        if (options.length === 0) {
            this.resumePlay();
            return false;
        }

        this.state = 'UPGRADE';
        title.innerText = titleText;
        subtitle.innerText = subtitleText;
        container.innerHTML = '';

        options.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
                <div class="card-icon">${opt.icon}</div>
                <div class="card-title">${opt.name}</div>
                <div class="card-desc">${opt.desc}</div>
            `;
            card.addEventListener('click', () => {
                opt.apply();
                this.audio.upgradeSelect();
                screen.classList.remove('active');
                this.resumePlay();
            });
            container.appendChild(card);
        });

        screen.classList.add('active');
        return true;
    }

    resumePlay() {
        this.state = 'PLAYING';
        this.lastTime = performance.now();
        this.updateHUD();
    }

    triggerGameOver() {
        this.state = 'GAMEOVER';
        this.audio.stopBossMusic();
        this.audio.stopThemeMusic();
        const screen = document.getElementById('death-screen');
        const stats = document.getElementById('death-stats');
        
        const mins = Math.floor(this.director.timeElapsed / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.director.timeElapsed % 60).toString().padStart(2, '0');
        
        stats.innerHTML = `
            Survived: ${mins}:${secs}<br>
            Kills: ${this.player.kills}<br>
            Level: ${this.player.level}
        `;
        screen.classList.add('active');
    }

    loop(time) {
        requestAnimationFrame((t) => this.loop(t));
        
        let dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        
        if (dt > 0.1) dt = 0.1;
        
        if (this.state === 'PLAYING' || this.state === 'BOSS') {
            this.update(dt);
        }
        
        if (this.state !== 'MENU') {
            this.render();
        } else {
            this.ctx.fillStyle = '#0f172a';
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.drawGrid(this.ctx, 0, 0);
        }
    }

    update(dt) {
        this.fpsCounter.update(dt);
        
        this.player.update(dt, this.input);
        this.handleUltimateInput();
        if (this.state === 'BOSS') {
            this.updateBossFight(dt);
        }
        if (this.player.dead && this.state !== 'GAMEOVER') {
            this.triggerGameOver();
        }
        
        this.director.update(dt);
        
        this.grid.clear();
        for (const e of this.enemies) {
            if (!e.dead) this.grid.insert(e);
        }
        
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            
            const neighbors = this.grid.query(e.x, e.y, e.radius * 2);
            for (const n of neighbors) {
                if (n !== e) {
                    const dx = e.x - n.x;
                    const dy = e.y - n.y;
                    const distSq = dx*dx + dy*dy;
                    const minDist = e.radius + n.radius;
                    if (distSq > 0 && distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq);
                        const force = (minDist - dist) / minDist; 
                        e.sepX += (dx / dist) * force;
                        e.sepY += (dy / dist) * force;
                    }
                }
            }
            
            e.update(dt, this.player);
            
            if (e.dead) {
                const currentIndex = this.enemies.indexOf(e);
                if (currentIndex !== -1) {
                    this.director.enemyPool.release(e);
                    this.enemies.splice(currentIndex, 1);
                }
            }
        }
        
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            
            if (!p.dead) {
                const targets = this.grid.query(p.x, p.y, p.radius + 35); 
                for (const t of targets) {
                    if (p.tryHit(t, this) && p.dead) break; 
                }
            }
            
            if (p.dead) this.projectiles.splice(i, 1);
        }
        
        for (let i = this.gems.length - 1; i >= 0; i--) {
            const g = this.gems[i];
            g.update(dt, this.player);
            if (g.dead) this.gems.splice(i, 1);
        }
        
        this.particles.update(dt);
        this.ultimateManager.update(dt);
        this.floatingText.update(dt);
        this.screenShake.update(dt);
        
        this.camera.x += (this.player.x - this.camera.x) * 5 * dt;
        this.camera.y += (this.player.y - this.camera.y) * 5 * dt;
        
        this.updateHUD();
    }
    
    updateHUD() {
        if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
        if (!this.hudCache) this.hudCache = {};

        const xpPct = this.player.xpProgress * 100;
        const hpPct = this.player.hpFraction * 100;
        
        if (this.hudCache.xpPct !== xpPct) {
            document.getElementById('xp-fill').style.width = `${Math.min(100, xpPct)}%`;
            this.hudCache.xpPct = xpPct;
        }
        if (this.hudCache.hpPct !== hpPct) {
            document.getElementById('hp-fill').style.width = `${Math.max(0, hpPct)}%`;
            this.hudCache.hpPct = hpPct;
        }
        if (this.hudCache.level !== this.player.level) {
            document.getElementById('ui-level').innerText = this.player.level;
            this.hudCache.level = this.player.level;
        }
        if (this.hudCache.kills !== this.player.kills) {
            document.getElementById('ui-kills').innerText = this.player.kills;
            this.hudCache.kills = this.player.kills;
        }
        if (this.hudCache.fps !== this.fpsCounter.fps) {
            document.getElementById('ui-fps').innerText = this.fpsCounter.fps;
            this.hudCache.fps = this.fpsCounter.fps;
        }
        
        const mins = Math.floor(this.director.timeElapsed / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.director.timeElapsed % 60).toString().padStart(2, '0');
        const timeStr = `${mins}:${secs}`;
        if (this.hudCache.time !== timeStr) {
            document.getElementById('ui-time').innerText = timeStr;
            this.hudCache.time = timeStr;
        }

        this.updateInventoryHUD();
    }

    updateBossFight(dt) {
        if (!this.bossFight) return;

        this.bossFight.time += dt;
        const arenaRadius = this.bossFight.arenaRadius;
        const px = this.player.x;
        const py = this.player.y;
        const pd = Math.sqrt(px * px + py * py);

        if (pd > arenaRadius) {
            this.player.x = (px / pd) * arenaRadius;
            this.player.y = (py / pd) * arenaRadius;
            this.player._velX *= -0.25;
            this.player._velY *= -0.25;
        }
    }

    handleUltimateInput() {
        for (let i = 0; i < 4; i++) {
            if (this.input.consume(`Digit${i + 1}`)) {
                if (this.player.castUltimate(i)) {
                    this.audio.upgradeSelect();
                    this.updateHUD();
                }
                break;
            }
        }
    }

    updateInventoryHUD() {
        const passiveLevels = this.player.passives || {};
        const weaponsSignature = this.player.weapons
            .map(w => `${w.constructor.name}:${w.level}`)
            .join('|');
        const ultimatesSignature = (this.player.ultimates || [])
            .map(u => `${u.constructor.name}:${u.charges}`)
            .join('|');
        const passivesSignature = Object.keys(passiveLevels)
            .sort()
            .map(id => `${id}:${passiveLevels[id]}`)
            .join('|');
        const signature = `${weaponsSignature}::${passivesSignature}::${ultimatesSignature}`;

        if (this.hudCache.inventory === signature) return;
        this.hudCache.inventory = signature;

        this.renderInventoryItems(
            document.getElementById('ui-weapons'),
            this.player.weapons.map(w => ({
                icon: w.icon,
                label: w.name,
                level: w.level
            })),
            'No weapons'
        );

        const passiveMeta = new Map(Upgs.PASSIVE_UPGRADES.map(p => [p.id, p]));
        this.renderInventoryItems(
            document.getElementById('ui-upgrades'),
            Object.keys(passiveLevels)
                .filter(id => passiveLevels[id] > 0)
                .sort((a, b) => {
                    const nameA = passiveMeta.get(a)?.name || a;
                    const nameB = passiveMeta.get(b)?.name || b;
                    return nameA.localeCompare(nameB);
                })
                .map(id => {
                    const meta = passiveMeta.get(id);
                    return {
                        icon: meta?.icon || '+',
                        label: meta?.name || id,
                        level: passiveLevels[id]
                    };
                }),
            'No upgrades'
        );

        this.renderInventoryItems(
            document.getElementById('ui-ultimates'),
            (this.player.ultimates || []).map((u, index) => ({
                icon: u.icon,
                label: `${index + 1}: ${u.name}`,
                levelLabel: `x${u.charges}`,
                title: `Press ${index + 1}: ${u.name} (${u.charges} charge${u.charges === 1 ? '' : 's'})`
            })),
            'Choose one'
        );
    }

    renderInventoryItems(container, items, emptyText) {
        container.innerHTML = '';

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inventory-empty';
            empty.textContent = emptyText;
            container.appendChild(empty);
            return;
        }

        for (const item of items) {
            const el = document.createElement('div');
            el.className = 'inventory-item';
            el.title = item.title || `${item.label} Lv ${item.level}`;

            const icon = document.createElement('span');
            icon.className = 'inventory-icon';
            icon.textContent = item.icon;

            const level = document.createElement('span');
            level.className = 'inventory-level';
            level.textContent = item.levelLabel || `Lv${item.level}`;

            el.append(icon, level);
            container.appendChild(el);
        }
    }

    drawGrid(ctx, camX, camY) {
        const size = 60;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 2;
        
        const offsetX = -camX % size;
        const offsetY = -camY % size;
        
        ctx.beginPath();
        for (let x = offsetX; x < this.width; x += size) {
            ctx.moveTo(x, 0); ctx.lineTo(x, this.height);
        }
        for (let y = offsetY; y < this.height; y += size) {
            ctx.moveTo(0, y); ctx.lineTo(this.width, y);
        }
        ctx.stroke();
    }

    render() {
        const ctx = this.ctx;
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, this.width, this.height);
        
        ctx.save();
        const cx = this.width / 2 - this.camera.x + this.screenShake.x;
        const cy = this.height / 2 - this.camera.y + this.screenShake.y;
        ctx.translate(cx, cy);
        
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        if (this.bgPattern) {
            ctx.fillStyle = this.bgPattern;
            const matrix = new DOMMatrix().translate(
                (this.camera.x - this.screenShake.x) * -1, 
                (this.camera.y - this.screenShake.y) * -1
            );
            this.bgPattern.setTransform(matrix);
            ctx.fillRect(0, 0, this.width, this.height);
        } else {
            this.drawGrid(ctx, this.camera.x - this.screenShake.x, this.camera.y - this.screenShake.y);
        }
        ctx.restore();

        if (this.state === 'BOSS' && this.bossFight) {
            this.drawBossArena(ctx);
        }

        for (const g of this.gems) g.draw(ctx);
        
        this.enemies.sort((a,b) => a.y - b.y);
        for (const e of this.enemies) e.draw(ctx);
        
        this.player.draw(ctx);
        
        for (const p of this.projectiles) p.draw(ctx);
        
        this.ultimateManager.draw(ctx);
        this.particles.draw(ctx);
        this.floatingText.draw(ctx);
        
        ctx.restore();
    }

    drawBossArena(ctx) {
        const r = this.bossFight.arenaRadius;
        ctx.save();
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
        ctx.lineWidth = 6;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#f97316';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
        ctx.lineWidth = 2;
        ctx.setLineDash([18, 14]);
        ctx.beginPath();
        ctx.arc(0, 0, r - 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
}

window.onload = () => {
    window.gameInstance = new Game();
};

})();
