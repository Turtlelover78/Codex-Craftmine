package com.craftmine.onevone;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class OneVOnePlugin extends JavaPlugin {
    private MatchManager matchManager;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        this.matchManager = new MatchManager(this);
        getServer().getPluginManager().registerEvents(matchManager, this);

        PluginCommand duelCommand = getCommand("duel");
        if (duelCommand == null) {
            getLogger().severe("Command 'duel' is missing from plugin.yml.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        DuelCommand commandHandler = new DuelCommand(this, matchManager);
        duelCommand.setExecutor(commandHandler);
        duelCommand.setTabCompleter(commandHandler);
    }

    @Override
    public void onDisable() {
        if (matchManager != null) {
            matchManager.shutdown();
        }
    }

    Location getLobby() {
        return getConfig().getLocation("lobby");
    }

    Location getSpawnOne() {
        return getConfig().getLocation("arena.spawn1");
    }

    Location getSpawnTwo() {
        return getConfig().getLocation("arena.spawn2");
    }

    boolean isArenaConfigured() {
        return getLobby() != null && getSpawnOne() != null && getSpawnTwo() != null;
    }

    int getCountdownSeconds() {
        return Math.max(1, getConfig().getInt("countdown-seconds", 5));
    }

    Material getKitSword() {
        return readMaterial("kit.sword", Material.DIAMOND_SWORD);
    }

    Material getKitBow() {
        return readMaterial("kit.bow", Material.BOW);
    }

    int getKitArrows() {
        return Math.max(0, getConfig().getInt("kit.arrows", 16));
    }

    Material getKitFood() {
        return readMaterial("kit.food", Material.COOKED_BEEF);
    }

    int getKitFoodAmount() {
        return Math.max(0, getConfig().getInt("kit.food-amount", 16));
    }

    void savePoint(String path, Location location) {
        getConfig().set(path, location);
        saveConfig();
    }

    private Material readMaterial(String path, Material fallback) {
        String value = getConfig().getString(path);
        if (value == null || value.isBlank()) {
            return fallback;
        }

        Material parsed = Material.matchMaterial(value.trim().toUpperCase());
        return parsed == null ? fallback : parsed;
    }
}
