
```markdown
# 🧙‍♂️ Arcane Survivors

**Arcane Survivors** is an action-roguelite survival game built entirely from scratch using **Vanilla JavaScript** and the **HTML5 Canvas API**. Inspired by games like *Vampire Survivors*, you play as a mage fending off endless hordes of monsters. Survive as long as you can, collect XP, and build an unstoppable arsenal of magic!

## ✨ Features

- **No Game Engine Used:** 100% custom-built game loop, physics, and rendering logic.
- **Optimized Performance:** Utilizes a custom *Spatial Hash Grid* for efficient collision detection, allowing hundreds of enemies on screen without lagging.
- **Procedural Audio:** All sound effects (explosions, lightning, leveling up) are synthesized in real-time using the Web Audio API—no `.mp3` or `.wav` files required!
- **Dynamic Weapons:** 5 unique auto-firing weapons including homing magic, orbiting shields, chain lightning, and area-of-effect bombs.
- **Wave Director System:** The game dynamically increases difficulty, spawning swarms and Elite Bosses at specific time intervals.
- **Visual Polish:** Includes screen shake, floating damage numbers, particle bursts, and animated sprite sheets.

## 🎮 How to Play

- **Movement:** Use `W` `A` `S` `D` or the **Arrow Keys** to move.
- **Combat:** Attacks are completely automatic. Your mage will automatically aim at the nearest enemies or in the direction you are facing.
- **Leveling Up:** Defeated enemies drop XP gems. Collect them to level up and choose new weapons or passive stat boosts.
- **Survive:** Elites drop powerful health orbs and magnets. Survive the boss waves and stay alive as long as possible!

## ⚔️ Weapons & Magic

| Icon | Weapon | Description |
| :---: | :--- | :--- |
| 🔮 | **Magic Wand** | Fires homing magic bolts at the nearest enemies from the tip of your staff. |
| ⭕ | **Arcane Orbs** | Spinning shields that constantly orbit you, damaging anything they touch. |
| 💥 | **Arcane Bomb** | Triggers massive area-of-effect explosions near enemy clusters. |
| 🗡️ | **Knife Barrage** | Rapid-fires piercing knives toward enemies. |
| ⚡ | **Chain Lightning** | Calls down lightning strikes that jump between multiple foes. |

## 🛠️ Project Structure

The codebase is highly modular and organized using modern ES6 patterns:

- `index.html` — The main entry point, containing the Canvas and HUD overlays.
- `style.css` — Styling for the UI, health bars, and upgrade cards.
- `main.js` — The core game loop, asset loading, camera logic, and state management.
- `utils.js` — Shared helpers, custom Spatial Grid, procedural Audio Manager, and Particle System.
- `entities.js` — Player logic, movement, animations, and pickup items (XP, Health, Magnets).
- `enemies.js` — Enemy classes, pathfinding, and the Wave Director.
- `weapons.js` — Projectile physics, weapon cooldowns, and attack patterns.
- `upgrades.js` — The randomized upgrade pool and passive stat system.

## 🚀 How to Run Locally

Because the game uses the HTML5 Canvas to read image data (for spritesheets), modern browsers require it to be run through a local web server to prevent CORS (Cross-Origin) security errors. 

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/arcane-survivors.git
   cd arcane-survivors
   ```

2. **Start a local server:**
   - If you use **VS Code**, install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension and click "Go Live".
   - If you have **Python** installed, run:
     ```bash
     python -m http.server 8000
     ```
     Then open `http://localhost:8000` in your browser.
   - If you have **Node.js** installed, use `npx serve`:
     ```bash
     npx serve .
     ```

## 📝 Assets & Credits
- **Programming:** Shaig
- **Art/Sprites:** LuisMelo
```

---

### How to push this to GitHub

Once you have created and saved the `README.md` file, you can add it to your GitHub repository by running these three simple commands in your terminal:

```bash
git add README.md
git commit -m "docs: add comprehensive README with features, controls, and setup instructions"
git push
```
