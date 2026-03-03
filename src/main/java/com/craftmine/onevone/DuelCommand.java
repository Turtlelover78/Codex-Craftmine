package com.craftmine.onevone;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

public final class DuelCommand implements CommandExecutor, TabCompleter {
    private static final String ADMIN_PERMISSION = "onevone.admin";

    private final OneVOnePlugin plugin;
    private final MatchManager matchManager;

    public DuelCommand(OneVOnePlugin plugin, MatchManager matchManager) {
        this.plugin = plugin;
        this.matchManager = matchManager;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0 || args[0].equalsIgnoreCase("help")) {
            sendHelp(sender, label);
            return true;
        }

        String sub = args[0].toLowerCase();
        switch (sub) {
            case "join" -> {
                Player player = requirePlayer(sender);
                if (player != null) {
                    matchManager.joinQueue(player);
                }
                return true;
            }
            case "leave" -> {
                Player player = requirePlayer(sender);
                if (player != null) {
                    matchManager.leaveQueueOrForfeit(player);
                }
                return true;
            }
            case "status" -> {
                sendStatus(sender);
                return true;
            }
            case "setlobby" -> {
                Player player = requirePlayer(sender);
                if (player == null || !requireAdmin(sender)) {
                    return true;
                }
                plugin.savePoint("lobby", player.getLocation());
                sender.sendMessage(ChatColor.GREEN + "Lobby spawn saved.");
                return true;
            }
            case "setspawn1" -> {
                Player player = requirePlayer(sender);
                if (player == null || !requireAdmin(sender)) {
                    return true;
                }
                plugin.savePoint("arena.spawn1", player.getLocation());
                sender.sendMessage(ChatColor.GREEN + "Arena spawn 1 saved.");
                return true;
            }
            case "setspawn2" -> {
                Player player = requirePlayer(sender);
                if (player == null || !requireAdmin(sender)) {
                    return true;
                }
                plugin.savePoint("arena.spawn2", player.getLocation());
                sender.sendMessage(ChatColor.GREEN + "Arena spawn 2 saved.");
                return true;
            }
            case "reload" -> {
                if (!requireAdmin(sender)) {
                    return true;
                }
                plugin.reloadConfig();
                sender.sendMessage(ChatColor.GREEN + "CraftmineOneVOne config reloaded.");
                return true;
            }
            case "force" -> {
                if (!requireAdmin(sender)) {
                    return true;
                }
                if (args.length < 3) {
                    sender.sendMessage(ChatColor.RED + "Usage: /" + label + " force <player1> <player2>");
                    return true;
                }

                Player playerOne = Bukkit.getPlayerExact(args[1]);
                Player playerTwo = Bukkit.getPlayerExact(args[2]);
                if (playerOne == null || playerTwo == null) {
                    sender.sendMessage(ChatColor.RED + "Both players must be online.");
                    return true;
                }

                matchManager.startMatch(playerOne, playerTwo, true, sender);
                return true;
            }
            default -> {
                sender.sendMessage(ChatColor.RED + "Unknown subcommand. Use /" + label + " help");
                return true;
            }
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> out = new ArrayList<>();

        if (args.length == 1) {
            out.add("join");
            out.add("leave");
            out.add("status");
            if (sender.hasPermission(ADMIN_PERMISSION)) {
                out.add("setlobby");
                out.add("setspawn1");
                out.add("setspawn2");
                out.add("force");
                out.add("reload");
            }
            return out.stream().filter(s -> s.startsWith(args[0].toLowerCase())).toList();
        }

        if (args.length == 2 && args[0].equalsIgnoreCase("force")) {
            return Bukkit.getOnlinePlayers().stream()
                    .map(Player::getName)
                    .filter(name -> name.toLowerCase().startsWith(args[1].toLowerCase()))
                    .toList();
        }

        if (args.length == 3 && args[0].equalsIgnoreCase("force")) {
            return Bukkit.getOnlinePlayers().stream()
                    .map(Player::getName)
                    .filter(name -> name.toLowerCase().startsWith(args[2].toLowerCase()))
                    .toList();
        }

        return out;
    }

    private Player requirePlayer(CommandSender sender) {
        if (sender instanceof Player player) {
            return player;
        }
        sender.sendMessage(ChatColor.RED + "This command can only be run by a player.");
        return null;
    }

    private boolean requireAdmin(CommandSender sender) {
        if (sender.hasPermission(ADMIN_PERMISSION)) {
            return true;
        }
        sender.sendMessage(ChatColor.RED + "You need permission: " + ADMIN_PERMISSION);
        return false;
    }

    private void sendHelp(CommandSender sender, String label) {
        sender.sendMessage(ChatColor.GOLD + "Craftmine 1v1 Commands");
        sender.sendMessage(ChatColor.YELLOW + "/" + label + " join" + ChatColor.GRAY + " - Enter the duel queue.");
        sender.sendMessage(ChatColor.YELLOW + "/" + label + " leave" + ChatColor.GRAY + " - Leave queue or forfeit a match.");
        sender.sendMessage(ChatColor.YELLOW + "/" + label + " status" + ChatColor.GRAY + " - Show queue and setup status.");
        if (sender.hasPermission(ADMIN_PERMISSION)) {
            sender.sendMessage(ChatColor.YELLOW + "/" + label + " setlobby" + ChatColor.GRAY + " - Save lobby location.");
            sender.sendMessage(ChatColor.YELLOW + "/" + label + " setspawn1" + ChatColor.GRAY + " - Save arena spawn 1.");
            sender.sendMessage(ChatColor.YELLOW + "/" + label + " setspawn2" + ChatColor.GRAY + " - Save arena spawn 2.");
            sender.sendMessage(ChatColor.YELLOW + "/" + label + " force <p1> <p2>" + ChatColor.GRAY + " - Force start a duel.");
            sender.sendMessage(ChatColor.YELLOW + "/" + label + " reload" + ChatColor.GRAY + " - Reload plugin config.");
        }
    }

    private void sendStatus(CommandSender sender) {
        sender.sendMessage(ChatColor.GOLD + "Craftmine 1v1 Status");
        sender.sendMessage(ChatColor.GRAY + "Queue size: " + ChatColor.YELLOW + matchManager.getQueueSize());
        sender.sendMessage(ChatColor.GRAY + "Active matches: " + ChatColor.YELLOW + matchManager.getActiveMatchCount());
        sender.sendMessage(ChatColor.GRAY + "Lobby set: " + yesNo(plugin.getLobby() != null));
        sender.sendMessage(ChatColor.GRAY + "Spawn 1 set: " + yesNo(plugin.getSpawnOne() != null));
        sender.sendMessage(ChatColor.GRAY + "Spawn 2 set: " + yesNo(plugin.getSpawnTwo() != null));
    }

    private String yesNo(boolean yes) {
        return yes ? ChatColor.GREEN + "yes" : ChatColor.RED + "no";
    }
}
