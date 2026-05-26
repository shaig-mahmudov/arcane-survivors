/**
 * upgrades.js — The leveling logic, available upgrades, and selection system.
 * Depends on: weapons.js
 */

'use strict';
(() => {

const { randChoice, shuffleArray } = window.GameUtils;
const Weps = window.GameWeapons;

// ─── Passive Stat Upgrades ───────────────────────────────────────────────────

const PASSIVE_UPGRADES = [
    {
        id: 'maxHp',
        name: 'Heart of Giant',
        icon: '❤️',
        desc: 'Max HP +20',
        maxLevel: 10,
        apply: (player) => {
            player.stats.maxHp += 20;
            player.hp += 20; // Heal the amount increased
        }
    },
    {
        id: 'speed',
        name: 'Swift Boots',
        icon: '👟',
        desc: 'Move Speed +10%',
        maxLevel: 5,
        apply: (player) => player.stats.speed *= 1.1
    },
    {
        id: 'damage',
        name: 'Brute Force',
        icon: '💪',
        desc: 'All Damage +10%',
        maxLevel: 10,
        apply: (player) => player.stats.damage += 0.1
    },
    {
        id: 'attackSpeed',
        name: 'Haste',
        icon: '⏳',
        desc: 'Attack Cooldowns -8%',
        maxLevel: 5,
        apply: (player) => player.stats.attackSpeed *= 1.08 // higher is faster tick rate
    },
    {
        id: 'area',
        name: 'Expansive Mind',
        icon: '🌌',
        desc: 'Weapon Area +15%',
        maxLevel: 5,
        apply: (player) => player.stats.areaBonus += 0.15
    },
    {
        id: 'crit',
        name: 'Lethal Strike',
        icon: '🎯',
        desc: 'Crit Chance +5%',
        maxLevel: 10,
        apply: (player) => player.stats.critChance += 0.05
    },
    {
        id: 'magnet',
        name: 'Attractor',
        icon: '🧲',
        desc: 'Pickup Radius +25%',
        maxLevel: 5,
        apply: (player) => player.stats.pickupRadius *= 1.25
    },
    {
        id: 'armor',
        name: 'Iron Skin',
        icon: '🛡️',
        desc: 'Damage Taken -1',
        maxLevel: 10,
        apply: (player) => player.stats.armor += 1
    },
    {
        id: 'heal',
        name: 'Flesh Mend',
        icon: '🍖',
        desc: 'Heal 50 HP immediately',
        maxLevel: 9999, // Can be picked infinitely
        apply: (player) => player.heal(50)
    },
    {
        id: 'deepFreeze',
        name: 'Deep Freeze',
        icon: '❄️',
        desc: 'Damage to Frozen/Chilled enemies +25% per level',
        maxLevel: 5,
        apply: (player) => { /* Damage multiplier logic is handled dynamically in Enemy.takeDamage */ }
    }
];

// ─── Upgrade Manager ─────────────────────────────────────────────────────────

class UpgradeManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * Generate 3 random upgrade options for the player to choose from.
     * Can include new weapons, weapon upgrades, and passive stats.
     */
    generateOptions(count = 3) {
        const player = this.game.player;
        let pool = [];

        // 1. Existing weapons that can be upgraded
        for (const w of player.weapons) {
            if (w.level < w.maxLevel) {
                pool.push({
                    type: 'weapon_upgrade',
                    weaponClass: w.constructor,
                    name: w.name,
                    icon: w.icon,
                    desc: `Upgrade to Lv ${w.level + 1}`,
                    apply: () => player.addWeapon(w.constructor)
                });
            }
        }

        // 2. New weapons (if under weapon limit, say 6)
        if (player.weapons.length < 6) {
            for (const WClass of Weps.WEAPON_CLASSES) {
                // If player doesn't have it
                if (!player.weapons.find(w => w instanceof WClass)) {
                    // Create dummy to get name/icon easily, or just hardcode map
                    const dummy = new WClass(null);
                    pool.push({
                        type: 'weapon_new',
                        weaponClass: WClass,
                        name: dummy.name,
                        icon: dummy.icon,
                        desc: Weps.WEAPON_DESCRIPTIONS[WClass.name] || 'A new weapon.',
                        apply: () => player.addWeapon(WClass)
                    });
                }
            }
        }

        // 3. Passive stats
        if (!player.passives) player.passives = {};

        for (const p of PASSIVE_UPGRADES) {
            const currentLevel = player.passives[p.id] || 0;
            if (currentLevel < p.maxLevel) {
                pool.push({
                    type: 'passive',
                    name: p.name,
                    icon: p.icon,
                    desc: p.desc,
                    apply: () => {
                        p.apply(player);
                        player.passives[p.id] = currentLevel + 1;
                    }
                });
            }
        }

        // Shuffle and pick top N
        shuffleArray(pool);
        
        // Always guarantee at least some options by falling back to small heal if pool is empty
        if (pool.length === 0) {
            pool.push({
                type: 'passive',
                name: 'Minor Heal',
                icon: '🩹',
                desc: 'Heal 20 HP',
                apply: () => player.heal(20)
            });
        }

        return pool.slice(0, Math.min(count, pool.length));
    }
}

window.GameUpgrades = {
    UpgradeManager
};

})();

