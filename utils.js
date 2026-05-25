/**
 * utils.js — Shared utility functions, math helpers, and the particle/audio system.
 * Imported by every other module via <script> tag ordering.
 */

'use strict';
(() => {

// ─── Math Helpers ────────────────────────────────────────────────────────────

/** Clamp a value between min and max. */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/** Linear interpolation between a and b by t. */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Euclidean distance between two points. */
function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance (avoids sqrt, useful for comparisons). */
function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

/** Normalize a 2D vector; returns {x, y} unit vector. */
function normalize(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
}

/** Random float between min and max. */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/** Random integer between min (inclusive) and max (inclusive). */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array. */
function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Shuffle an array in-place (Fisher-Yates). */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Convert degrees to radians. */
function degToRad(deg) {
    return deg * (Math.PI / 180);
}

/** Wrap an angle to [-π, π]. */
function wrapAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

/** Return an angle toward (tx, ty) from (fx, fy). */
function angleTo(fx, fy, tx, ty) {
    return Math.atan2(ty - fy, tx - fx);
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

/** Parse hex color string to {r,g,b}. */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

/** Build rgba() string. */
function rgba(r, g, b, a) {
    return `rgba(${r},${g},${b},${a})`;
}

/** Linearly interpolate between two hex colors, returning rgba string. */
function lerpColor(hex1, hex2, t, alpha = 1) {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    return rgba(
        Math.round(lerp(c1.r, c2.r, t)),
        Math.round(lerp(c1.g, c2.g, t)),
        Math.round(lerp(c1.b, c2.b, t)),
        alpha
    );
}

// ─── Object Pool ─────────────────────────────────────────────────────────────

/**
 * Generic object pool.  Pass a factory function and optional reset function.
 * Dramatically reduces GC pressure for frequently created/destroyed objects.
 */
class ObjectPool {
    constructor(factory, reset = null) {
        this.factory = factory;
        this.reset = reset;
        this.pool = [];
    }

    /** Acquire an object from the pool (or create a new one). */
    acquire(...args) {
        const obj = this.pool.length > 0 ? this.pool.pop() : this.factory();
        if (this.reset) this.reset(obj, ...args);
        return obj;
    }

    /** Return an object to the pool. */
    release(obj) {
        this.pool.push(obj);
    }
}

// ─── Spatial Hash Grid ───────────────────────────────────────────────────────

/**
 * Broad-phase spatial partitioning using a hash grid.
 * Speeds up neighbour queries from O(n²) to approximately O(1) on average.
 */
class SpatialGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _key(cx, cy) {
        return `${cx}|${cy}`;
    }

    _cellOf(x, y) {
        return {
            cx: Math.floor(x / this.cellSize),
            cy: Math.floor(y / this.cellSize)
        };
    }

    /** Clear all cells (call every frame before re-inserting). */
    clear() {
        this.cells.clear();
    }

    /** Insert an entity with position (x, y) and a radius. */
    insert(entity) {
        const r = entity.radius || 0;
        const minCx = Math.floor((entity.x - r) / this.cellSize);
        const maxCx = Math.floor((entity.x + r) / this.cellSize);
        const minCy = Math.floor((entity.y - r) / this.cellSize);
        const maxCy = Math.floor((entity.y + r) / this.cellSize);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const key = this._key(cx, cy);
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(entity);
            }
        }
    }

    /** Query all entities whose cells overlap a circle at (x, y) with radius r. */
    query(x, y, r) {
        const minCx = Math.floor((x - r) / this.cellSize);
        const maxCx = Math.floor((x + r) / this.cellSize);
        const minCy = Math.floor((y - r) / this.cellSize);
        const maxCy = Math.floor((y + r) / this.cellSize);

        const found = new Set();
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const key = this._key(cx, cy);
                const cell = this.cells.get(key);
                if (cell) {
                    for (const e of cell) found.add(e);
                }
            }
        }
        return Array.from(found);
    }
}

// ─── Particle System ─────────────────────────────────────────────────────────

/**
 * Lightweight particle system.
 * All particles live in a single flat array; dead particles are recycled
 * to avoid GC pressure.
 */
class ParticleSystem {
    constructor() {
        /** @type {Particle[]} */
        this.particles = [];
        this.pool = [];
    }

    /** Spawn a particle burst. */
    emit({
        x, y,
        count = 6,
        color = '#fff',
        color2 = null,
        speed = 120,
        speedVariance = 60,
        size = 4,
        sizeVariance = 2,
        lifetime = 0.5,
        lifetimeVariance = 0.2,
        gravity = 0,
        fadeOut = true,
        shrink = true,
        angle = null,         // if set, all particles shoot in this direction
        spread = Math.PI * 2, // arc spread around angle
        glow = false,
    }) {
        for (let i = 0; i < count; i++) {
            const p = this.pool.length > 0 ? this.pool.pop() : {};
            const dir = angle !== null
                ? angle + randFloat(-spread / 2, spread / 2)
                : randFloat(0, Math.PI * 2);
            const spd = speed + randFloat(-speedVariance, speedVariance);
            const lt  = lifetime + randFloat(-lifetimeVariance, lifetimeVariance);
            const sz  = Math.max(0.5, size + randFloat(-sizeVariance, sizeVariance));

            p.x = x; p.y = y;
            p.vx = Math.cos(dir) * spd;
            p.vy = Math.sin(dir) * spd;
            p.size = sz;
            p.startSize = sz;
            p.color = color;
            p.color2 = color2;
            p.life = lt;
            p.maxLife = lt;
            p.gravity = gravity;
            p.fadeOut = fadeOut;
            p.shrink = shrink;
            p.glow = glow;
            p.dead = false;

            this.particles.push(p);
        }
    }

    /** Update all particles. */
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.life -= dt;

            if (p.life <= 0) {
                p.dead = true;
                this.pool.push(p);
                this.particles.splice(i, 1);
            }
        }
    }

    /** Draw all particles (world space — camera must be applied by caller). */
    draw(ctx) {
        for (const p of this.particles) {
            const t = 1 - p.life / p.maxLife; // 0→1 as particle ages
            const alpha = p.fadeOut ? clamp(1 - t, 0, 1) : 1;
            const sz = p.shrink ? p.startSize * (1 - t * 0.8) : p.startSize;

            ctx.save();
            if (p.glow) {
                ctx.shadowBlur = sz * 3;
                ctx.shadowColor = p.color;
            }

            if (p.color2) {
                ctx.fillStyle = lerpColor(p.color, p.color2, t, alpha);
            } else {
                const rgb = hexToRgb(p.color);
                ctx.fillStyle = rgba(rgb.r, rgb.g, rgb.b, alpha);
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.1, sz), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

// ─── Floating Damage Numbers ──────────────────────────────────────────────────

class DamageNumber {
    constructor(x, y, text, color, isCrit = false) {
        this.x = x;
        this.y = y;
        this.vy = -120;   // float upward
        this.text = text;
        this.color = color;
        this.isCrit = isCrit;
        this.life = isCrit ? 1.0 : 0.7;
        this.maxLife = this.life;
        this.scale = isCrit ? 1.6 : 1.0;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.vy *= 0.94;
        this.life -= dt;
    }

    draw(ctx) {
        const t = 1 - this.life / this.maxLife;
        const alpha = clamp(1 - t * t, 0, 1);
        const scale = this.scale * (this.isCrit ? 1 + Math.sin(t * Math.PI) * 0.3 : 1);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(14 * scale)}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this.isCrit) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
        }

        ctx.fillStyle = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }

    get dead() {
        return this.life <= 0;
    }
}

/** Manages the pool of floating damage numbers. */
class FloatingTextManager {
    constructor() {
        this.numbers = [];
    }

    spawn(x, y, amount, isCrit = false, isHeal = false) {
        const color = isCrit ? '#ffdd00' : (isHeal ? '#44ff88' : '#ff4444');
        const prefix = isHeal ? '+' : '';
        const text = isCrit ? `${prefix}${amount}!` : `${prefix}${amount}`;
        // Add a small random offset so numbers don't stack
        this.numbers.push(new DamageNumber(
            x + randFloat(-12, 12),
            y - 20,
            text,
            color,
            isCrit
        ));
    }

    update(dt) {
        for (let i = this.numbers.length - 1; i >= 0; i--) {
            this.numbers[i].update(dt);
            if (this.numbers[i].dead) this.numbers.splice(i, 1);
        }
    }

    draw(ctx) {
        for (const n of this.numbers) n.draw(ctx);
    }
}

// ─── Screen Shake ─────────────────────────────────────────────────────────────

class ScreenShake {
    constructor() {
        this.intensity = 0;
        this.duration = 0;
        this.x = 0;
        this.y = 0;
    }

    trigger(intensity, duration) {
        if (intensity > this.intensity) {
            this.intensity = intensity;
            this.duration = duration;
        }
    }

    update(dt) {
        if (this.duration > 0) {
            this.duration -= dt;
            const mag = this.intensity * (this.duration / Math.max(0.001, this.duration + dt));
            this.x = randFloat(-mag, mag);
            this.y = randFloat(-mag, mag);
        } else {
            this.x = 0;
            this.y = 0;
            this.intensity = 0;
        }
    }
}

// ─── Audio Manager ────────────────────────────────────────────────────────────

/**
 * Procedural audio manager using the Web Audio API.
 * Generates all sound effects programmatically — no asset files needed.
 */
class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.enabled = true;
        this.volume = 0.4;
        this._init();
    }

    _init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            console.warn('Web Audio API not available:', e);
            this.enabled = false;
        }
    }

    /** Resume the audio context (must be triggered by user gesture). */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setVolume(v) {
        this.volume = clamp(v, 0, 1);
        if (this.masterGain) this.masterGain.gain.value = this.volume;
    }

    /**
     * Generic tone/noise generator helper.
     * @param {Object} opts
     */
    _play({ type = 'square', freq = 440, freq2 = null, duration = 0.1,
             gain = 0.3, attack = 0.005, decay = 0.05, noise = false,
             filterFreq = null, pitchDown = 0 }) {
        if (!this.enabled || !this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(gain, now + attack);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            gainNode.connect(this.masterGain);

            let source;
            if (noise) {
                const bufferSize = this.ctx.sampleRate * duration;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                source = this.ctx.createBufferSource();
                source.buffer = buffer;
            } else {
                source = this.ctx.createOscillator();
                source.type = type;
                source.frequency.setValueAtTime(freq, now);
                if (freq2 !== null) source.frequency.linearRampToValueAtTime(freq2, now + duration);
                if (pitchDown) source.frequency.exponentialRampToValueAtTime(freq * pitchDown, now + duration);
            }

            if (filterFreq) {
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = filterFreq;
                source.connect(filter);
                filter.connect(gainNode);
            } else {
                source.connect(gainNode);
            }

            source.start(now);
            source.stop(now + duration + 0.01);
        } catch (e) { /* ignore audio errors */ }
    }

    // ── Named sound effects ──────────────────────────────────────────────────

    playerHurt()   { this._play({ type:'sawtooth', freq:220, freq2:110, duration:0.2, gain:0.4 }); }
    playerDeath()  { this._play({ type:'sawtooth', freq:180, pitchDown:0.1, duration:0.8, gain:0.5 }); }
    enemyDeath()   { this._play({ noise:true, duration:0.08, gain:0.15, filterFreq:800 }); }
    levelUp()      { this._play({ type:'sine', freq:523, freq2:1046, duration:0.4, gain:0.4 }); }
    pickupXP()     { this._play({ type:'sine', freq:660, freq2:880, duration:0.07, gain:0.12 }); }
    projectileFire(){ this._play({ type:'square', freq:440, freq2:220, duration:0.06, gain:0.08 }); }
    explosion()    {
        this._play({ noise:true, duration:0.3, gain:0.5, filterFreq:600 });
        this._play({ type:'sine', freq:80, pitchDown:0.2, duration:0.5, gain:0.3 });
    }
    lightning()    { this._play({ noise:true, duration:0.15, gain:0.4, filterFreq:3000 }); }
    bossSpawn()    {
        this._play({ type:'sawtooth', freq:55, freq2:40, duration:1.2, gain:0.5 });
        this._play({ noise:true, duration:0.5, gain:0.3, filterFreq:200 });
    }
    upgradeSelect(){ this._play({ type:'sine', freq:800, freq2:1200, duration:0.15, gain:0.2 }); }
}

// ─── Input Manager ────────────────────────────────────────────────────────────

/**
 * Tracks keyboard state (keys held) and mouse state.
 */
class InputManager {
    constructor() {
        this.keys = new Set();
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseButtons = new Set();

        const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
        window.addEventListener('keydown', e => {
            this.keys.add(e.code);
            if (gameKeys.has(e.code)) e.preventDefault(); // prevent page scroll on arrow keys / space
        });
        window.addEventListener('keyup',   e => this.keys.delete(e.code));
        window.addEventListener('mousemove', e => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        window.addEventListener('mousedown', e => this.mouseButtons.add(e.button));
        window.addEventListener('mouseup',   e => this.mouseButtons.delete(e.button));
    }

    isDown(code) { return this.keys.has(code); }
    isMouseDown(btn = 0) { return this.mouseButtons.has(btn); }
}

// ─── FPS Counter ─────────────────────────────────────────────────────────────

class FPSCounter {
    constructor() {
        this.fps = 0;
        this._frames = 0;
        this._elapsed = 0;
    }

    update(dt) {
        this._frames++;
        this._elapsed += dt;
        if (this._elapsed >= 0.5) {
            this.fps = Math.round(this._frames / this._elapsed);
            this._frames = 0;
            this._elapsed = 0;
        }
    }
}

// ─── Timer Utility ────────────────────────────────────────────────────────────

/** Simple countdown timer. Returns true when the tick fires. */
class Timer {
    constructor(interval) {
        this.interval = interval;
        this._t = 0;
    }

    tick(dt) {
        this._t += dt;
        if (this._t >= this.interval) {
            this._t -= this.interval;
            return true;
        }
        return false;
    }

    reset() { this._t = 0; }
    setInterval(v) { this.interval = v; this._t = Math.min(this._t, v); }
    get progress() { return this._t / this.interval; }
}

// ─── Exports (global namespace — no module bundler) ───────────────────────────
// All utilities are attached to window so other scripts can access them.
window.GameUtils = {
    clamp, lerp, dist, distSq, normalize,
    randFloat, randInt, randChoice, shuffleArray,
    degToRad, wrapAngle, angleTo,
    hexToRgb, rgba, lerpColor,
    ObjectPool, SpatialGrid,
    ParticleSystem, FloatingTextManager,
    ScreenShake, AudioManager, InputManager,
    FPSCounter, Timer,
};

})();

