package com.craftmine.onevone;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;

public final class MatchManager implements Listener {
    private final OneVOnePlugin plugin;
    private final Queue<UUID> queue = new ArrayDeque<>();
    private final Map<UUID, Match> activeByPlayer = new HashMap<>();
    private final Set<UUID> lobbyRespawn = new HashSet<>();

    public MatchManager(OneVOnePlugin plugin) {
        this.plugin = plugin;
    }

    public int getQueueSize() {
        return queue.size();
    }

    public int getActiveMatchCount() {
        return new HashSet<>(activeByPlayer.values()).size();
    }

    public void joinQueue(Player player) {
        UUID playerId = player.getUniqueId();
        if (!plugin.isArenaConfigured()) {
            player.sendMessage(ChatColor.RED + "Arena is not ready. Admin must set lobby/spawn1/spawn2 first.");
            return;
        }
        if (activeByPlayer.containsKey(playerId)) {
            player.sendMessage(ChatColor.RED + "You are already in a duel.");
            return;
        }
        if (queue.contains(playerId)) {
            player.sendMessage(ChatColor.YELLOW + "You are already in the queue.");
            return;
        }

        queue.offer(playerId);
        player.sendMessage(ChatColor.GREEN + "Joined duel queue.");
        player.sendMessage(ChatColor.GRAY + "Waiting players: " + ChatColor.YELLOW + queue.size());
        tryStartQueuedMatch();
    }

    public void leaveQueueOrForfeit(Player player) {
        UUID playerId = player.getUniqueId();
        if (queue.remove(playerId)) {
            player.sendMessage(ChatColor.YELLOW + "You left the duel queue.");
            return;
        }

        Match match = activeByPlayer.get(playerId);
        if (match != null) {
            UUID winnerId = match.getOpponent(playerId);
            finishMatch(match, winnerId, playerId, "forfeit");
            return;
        }

        player.sendMessage(ChatColor.RED + "You are not in queue or in an active match.");
    }

    public boolean startMatch(Player playerOne, Player playerTwo, boolean forced, org.bukkit.command.CommandSender sender) {
        if (!plugin.isArenaConfigured()) {
            sender.sendMessage(ChatColor.RED + "Arena is not ready. Set lobby, spawn1, and spawn2 first.");
            return false;
        }

        if (playerOne.getUniqueId().equals(playerTwo.getUniqueId())) {
            sender.sendMessage(ChatColor.RED + "You need two different players.");
            return false;
        }

        if (!playerOne.isOnline() || !playerTwo.isOnline()) {
            sender.sendMessage(ChatColor.RED + "Both players must be online.");
            return false;
        }

        if (activeByPlayer.containsKey(playerOne.getUniqueId()) || activeByPlayer.containsKey(playerTwo.getUniqueId())) {
            sender.sendMessage(ChatColor.RED + "At least one player is already in an active duel.");
            return false;
        }

        queue.remove(playerOne.getUniqueId());
        queue.remove(playerTwo.getUniqueId());

        startMatchInternal(playerOne, playerTwo, forced);
        return true;
    }

    public void shutdown() {
        List<Match> matches = new ArrayList<>(new HashSet<>(activeByPlayer.values()));
        for (Match match : matches) {
            endWithoutWinner(match);
        }
        queue.clear();
        lobbyRespawn.clear();
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlayerDamagePlayer(EntityDamageByEntityEvent event) {
        if (!(event.getEntity() instanceof Player target)) {
            return;
        }

        Player attacker = resolveAttacker(event.getDamager());
        if (attacker == null) {
            return;
        }

        Match targetMatch = activeByPlayer.get(target.getUniqueId());
        Match attackerMatch = activeByPlayer.get(attacker.getUniqueId());
        if (targetMatch == null && attackerMatch == null) {
            return;
        }

        if (targetMatch == null || attackerMatch == null) {
            event.setCancelled(true);
            return;
        }

        if (targetMatch != attackerMatch) {
            event.setCancelled(true);
            return;
        }

        if (!attackerMatch.isCombatLive()) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player dead = event.getEntity();
        Match match = activeByPlayer.get(dead.getUniqueId());
        if (match == null) {
            return;
        }

        event.getDrops().clear();
        event.setKeepInventory(true);
        event.setKeepLevel(true);

        UUID winnerId = match.getOpponent(dead.getUniqueId());
        finishMatch(match, winnerId, dead.getUniqueId(), "eliminated");
        lobbyRespawn.add(dead.getUniqueId());
    }

    @EventHandler
    public void onPlayerRespawn(PlayerRespawnEvent event) {
        UUID playerId = event.getPlayer().getUniqueId();
        if (!lobbyRespawn.remove(playerId)) {
            return;
        }

        Location lobby = plugin.getLobby();
        if (lobby != null) {
            event.setRespawnLocation(lobby);
        }

        clearPostMatchState(event.getPlayer());
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID playerId = player.getUniqueId();

        queue.remove(playerId);
        lobbyRespawn.remove(playerId);

        Match match = activeByPlayer.get(playerId);
        if (match == null) {
            return;
        }

        UUID winnerId = match.getOpponent(playerId);
        finishMatch(match, winnerId, playerId, "left the server");
    }

    private void tryStartQueuedMatch() {
        while (queue.size() >= 2) {
            UUID firstId = queue.poll();
            UUID secondId = queue.poll();
            if (firstId == null || secondId == null) {
                return;
            }

            Player first = Bukkit.getPlayer(firstId);
            Player second = Bukkit.getPlayer(secondId);

            if (first == null || !first.isOnline()) {
                if (second != null && second.isOnline()) {
                    queue.offer(second.getUniqueId());
                    second.sendMessage(ChatColor.GRAY + "Opponent disconnected. You stay in queue.");
                }
                continue;
            }

            if (second == null || !second.isOnline()) {
                queue.offer(first.getUniqueId());
                first.sendMessage(ChatColor.GRAY + "Opponent disconnected. You stay in queue.");
                continue;
            }

            startMatchInternal(first, second, false);
            return;
        }
    }

    private void startMatchInternal(Player playerOne, Player playerTwo, boolean forced) {
        Match match = new Match(playerOne.getUniqueId(), playerTwo.getUniqueId());
        activeByPlayer.put(playerOne.getUniqueId(), match);
        activeByPlayer.put(playerTwo.getUniqueId(), match);

        prepareForMatch(playerOne, plugin.getSpawnOne());
        prepareForMatch(playerTwo, plugin.getSpawnTwo());

        String startMessage = ChatColor.GOLD + "Duel: " + ChatColor.YELLOW + playerOne.getName()
                + ChatColor.GRAY + " vs " + ChatColor.YELLOW + playerTwo.getName();
        playerOne.sendMessage(startMessage);
        playerTwo.sendMessage(startMessage);

        if (forced) {
            playerOne.sendMessage(ChatColor.GRAY + "This match was force-started by an admin.");
            playerTwo.sendMessage(ChatColor.GRAY + "This match was force-started by an admin.");
        }

        int countdown = plugin.getCountdownSeconds();
        BukkitTask task = new BukkitRunnable() {
            private int remaining = countdown;

            @Override
            public void run() {
                if (match.isEnded()) {
                    cancel();
                    return;
                }

                Player one = Bukkit.getPlayer(match.getPlayerOne());
                Player two = Bukkit.getPlayer(match.getPlayerTwo());
                if (one == null || !one.isOnline()) {
                    finishMatch(match, two != null ? two.getUniqueId() : null, match.getPlayerOne(), "left the server");
                    cancel();
                    return;
                }
                if (two == null || !two.isOnline()) {
                    finishMatch(match, one.getUniqueId(), match.getPlayerTwo(), "left the server");
                    cancel();
                    return;
                }

                if (remaining <= 0) {
                    match.setCombatLive(true);
                    one.sendTitle(ChatColor.RED + "FIGHT!", ChatColor.GRAY + "Good luck.", 0, 25, 5);
                    two.sendTitle(ChatColor.RED + "FIGHT!", ChatColor.GRAY + "Good luck.", 0, 25, 5);
                    one.sendMessage(ChatColor.GREEN + "Combat is live.");
                    two.sendMessage(ChatColor.GREEN + "Combat is live.");
                    cancel();
                    return;
                }

                String subtitle = ChatColor.GRAY + "Starting in " + ChatColor.YELLOW + remaining;
                one.sendTitle(ChatColor.GOLD + "Get Ready", subtitle, 0, 20, 0);
                two.sendTitle(ChatColor.GOLD + "Get Ready", subtitle, 0, 20, 0);
                remaining--;
            }
        }.runTaskTimer(plugin, 0L, 20L);

        match.setCountdownTask(task);
    }

    private void prepareForMatch(Player player, Location spawn) {
        player.setGameMode(GameMode.SURVIVAL);
        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        player.getActivePotionEffects().forEach(effect -> player.removePotionEffect(effect.getType()));
        player.setHealth(player.getMaxHealth());
        player.setFoodLevel(20);
        player.setSaturation(20.0f);
        player.setFireTicks(0);

        if (spawn != null) {
            player.teleport(spawn);
        }

        giveKit(player);
    }

    private void giveKit(Player player) {
        Material sword = plugin.getKitSword();
        if (sword != Material.AIR) {
            player.getInventory().addItem(new ItemStack(sword));
        }

        Material bow = plugin.getKitBow();
        if (bow != Material.AIR) {
            player.getInventory().addItem(new ItemStack(bow));
        }

        int arrows = plugin.getKitArrows();
        if (arrows > 0) {
            player.getInventory().addItem(new ItemStack(Material.ARROW, arrows));
        }

        Material food = plugin.getKitFood();
        int foodAmount = plugin.getKitFoodAmount();
        if (food != Material.AIR && foodAmount > 0) {
            player.getInventory().addItem(new ItemStack(food, foodAmount));
        }
    }

    private void finishMatch(Match match, UUID winnerId, UUID loserId, String loserReason) {
        if (match.isEnded()) {
            return;
        }

        match.setEnded(true);
        BukkitTask task = match.getCountdownTask();
        if (task != null) {
            task.cancel();
        }

        activeByPlayer.remove(match.getPlayerOne());
        activeByPlayer.remove(match.getPlayerTwo());
        queue.remove(match.getPlayerOne());
        queue.remove(match.getPlayerTwo());

        Player winner = winnerId == null ? null : Bukkit.getPlayer(winnerId);
        Player loser = loserId == null ? null : Bukkit.getPlayer(loserId);

        if (winner != null) {
            winner.sendMessage(ChatColor.GREEN + "You won the duel.");
            clearPostMatchState(winner);
            teleportLobbySoon(winner);
        }

        if (loser != null) {
            loser.sendMessage(ChatColor.RED + "You lost the duel (" + loserReason + ").");
            if (!loser.isDead()) {
                clearPostMatchState(loser);
                teleportLobbySoon(loser);
            }
        }

        if (winner != null && loser != null) {
            Bukkit.broadcastMessage(ChatColor.GOLD + "[1v1] " + ChatColor.YELLOW + winner.getName()
                    + ChatColor.GRAY + " defeated " + ChatColor.YELLOW + loser.getName() + ChatColor.GRAY + ".");
        }

        tryStartQueuedMatch();
    }

    private void endWithoutWinner(Match match) {
        if (match.isEnded()) {
            return;
        }

        match.setEnded(true);
        BukkitTask task = match.getCountdownTask();
        if (task != null) {
            task.cancel();
        }

        activeByPlayer.remove(match.getPlayerOne());
        activeByPlayer.remove(match.getPlayerTwo());
        queue.remove(match.getPlayerOne());
        queue.remove(match.getPlayerTwo());
    }

    private Player resolveAttacker(Entity source) {
        if (source instanceof Player player) {
            return player;
        }
        if (source instanceof Projectile projectile && projectile.getShooter() instanceof Player shooter) {
            return shooter;
        }
        return null;
    }

    private void clearPostMatchState(Player player) {
        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        player.setFireTicks(0);
        player.setHealth(player.getMaxHealth());
        player.setFoodLevel(20);
        player.setSaturation(20.0f);
    }

    private void teleportLobbySoon(Player player) {
        Location lobby = plugin.getLobby();
        if (lobby == null) {
            return;
        }

        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (player.isOnline() && !player.isDead()) {
                player.teleport(lobby);
            }
        }, 20L);
    }
}
