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
        
        this.grid = new Utils.SpatialGrid(30);
        
        this.state = 'MENU'; 
        this.lastTime = 0;

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
        this.player = new Ents.Player(0, 0, this);
        this.player.addWeapon(Weps.MagicWand);
        
        this.enemies = [];
        this.projectiles = [];
        this.gems = [];
        
        this.director = new Enems.Director(this);
        this.particles.particles = [];
        this.floatingText.numbers = [];
        this.grid.clear();
        
        this.camera = { x: 0, y: 0 };
        this.state = 'PLAYING';
        this.lastTime = performance.now();
        
        this.updateHUD();
    }

    triggerLevelUpMenu() {
        this.state = 'UPGRADE';
        const screen = document.getElementById('upgrade-screen');
        const container = document.getElementById('cards-container');
        
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
                this.state = 'PLAYING';
                this.lastTime = performance.now(); 
                this.updateHUD();
            });
            container.appendChild(card);
        });
        
        screen.classList.add('active');
    }

    triggerGameOver() {
        this.state = 'GAMEOVER';
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
        
        if (this.state === 'PLAYING') {
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
                this.director.enemyPool.release(e);
                this.enemies.splice(i, 1);
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
        this.floatingText.update(dt);
        this.screenShake.update(dt);
        
        this.camera.x += (this.player.x - this.camera.x) * 5 * dt;
        this.camera.y += (this.player.y - this.camera.y) * 5 * dt;
        
        this.updateHUD();
    }
    
    updateHUD() {
        if (this.state !== 'PLAYING') return;
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

        for (const g of this.gems) g.draw(ctx);
        
        this.enemies.sort((a,b) => a.y - b.y);
        for (const e of this.enemies) e.draw(ctx);
        
        this.player.draw(ctx);
        
        for (const p of this.projectiles) p.draw(ctx);
        
        this.particles.draw(ctx);
        this.floatingText.draw(ctx);
        
        ctx.restore();
    }
}

window.onload = () => {
    window.gameInstance = new Game();
};

})();