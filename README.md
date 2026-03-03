# Craftmine Duel (Browser)

This project is now a playable Minecraft-style 1v1 browser game.

Important:
- `pom.xml` is not an app screen. It is an XML build config from the old Java setup.
- Open `index.html` to run the game.

## What You Get

- First-person voxel world
- Mine blocks (left click)
- Place blocks (right click)
- 1v1 combat (you vs AI enemy)
- Health, deaths, kills, enemy respawn
- Hotbar block switching (keys `1-5`)

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
- `Space`: jump
- `Mouse`: look
- `Left Click`: mine block / attack enemy
- `Right Click`: place selected block
- `1..5`: select hotbar block
- `Esc`: unlock mouse / pause control

## Note On "Exact Copy"

This is a Minecraft-inspired implementation built from scratch. It does not include official Minecraft code or assets.
