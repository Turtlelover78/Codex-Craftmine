# Craftmine (Browser)

Single-player Minecraft-style voxel sandbox in the browser.

Important:
- Open `index.html` to run the game.
- This project is inspired by Minecraft but built from scratch.
- It does **not** include official Minecraft code or assets.

## Features

- First-person voxel world generation
- Mine blocks (left click) to collect them
- Place blocks (right click) from hotbar inventory
- Hotbar selection with `1..6` or mouse wheel
- Survival HUD with health, deaths, coordinates
- Fall damage + respawn
- Dynamic day/night lighting cycle

## Run

### Fastest
1. Open `index.html` in your browser.
2. Click `Start Game`.

### Recommended (avoids file-permission issues on some browsers)
1. In this folder run:
   - `python -m http.server 8080`
2. Open:
   - `http://localhost:8080`

## Controls

- `W A S D`: move
- `Shift`: sprint
- `Space`: jump
- `Mouse`: look
- `Left Click`: mine block
- `Right Click`: place selected block
- `1..6` or mouse wheel: select hotbar block
- `Esc`: unlock mouse / pause control
