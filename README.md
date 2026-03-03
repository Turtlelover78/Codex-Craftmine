# Craftmine OneVOne (Paper 1.21.11)

Simple 1v1 duels for modern Minecraft servers:
- Queue-based matchmaking
- Force-start by admin
- Countdown before combat
- Built-in kit loadout
- Auto winner detection on death/quit
- PvP isolation (no outside interference)

## Target Version

- Minecraft (latest stable at time of build): `1.21.11`
- Paper API: `1.21.11-R0.1-SNAPSHOT`
- Java: `21`

## Build

```bash
mvn -DskipTests package
```

Output jar:

`target/onevone-1.0.0.jar`

## Install

1. Put the jar in your Paper server `plugins/` folder.
2. Start/restart server.
3. In-game (op/admin), stand where you want each point and run:
   - `/duel setlobby`
   - `/duel setspawn1`
   - `/duel setspawn2`

## Player Commands

- `/duel join` - join matchmaking queue
- `/duel leave` - leave queue or forfeit an active duel
- `/duel status` - queue + arena status

Aliases:
- `/onevone ...`
- `/1v1 ...`

## Admin Commands

- `/duel setlobby`
- `/duel setspawn1`
- `/duel setspawn2`
- `/duel force <player1> <player2>`
- `/duel reload`

## Config

Edit `plugins/CraftmineOneVOne/config.yml`:
- `countdown-seconds`
- kit material and amounts (`kit.sword`, `kit.bow`, `kit.arrows`, `kit.food`, `kit.food-amount`)
