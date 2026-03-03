package com.craftmine.onevone;

import org.bukkit.scheduler.BukkitTask;

import java.util.UUID;

final class Match {
    private final UUID playerOne;
    private final UUID playerTwo;
    private boolean combatLive;
    private boolean ended;
    private BukkitTask countdownTask;

    Match(UUID playerOne, UUID playerTwo) {
        this.playerOne = playerOne;
        this.playerTwo = playerTwo;
    }

    UUID getPlayerOne() {
        return playerOne;
    }

    UUID getPlayerTwo() {
        return playerTwo;
    }

    boolean contains(UUID playerId) {
        return playerOne.equals(playerId) || playerTwo.equals(playerId);
    }

    UUID getOpponent(UUID playerId) {
        if (playerOne.equals(playerId)) {
            return playerTwo;
        }
        if (playerTwo.equals(playerId)) {
            return playerOne;
        }
        return null;
    }

    boolean isCombatLive() {
        return combatLive;
    }

    void setCombatLive(boolean combatLive) {
        this.combatLive = combatLive;
    }

    boolean isEnded() {
        return ended;
    }

    void setEnded(boolean ended) {
        this.ended = ended;
    }

    BukkitTask getCountdownTask() {
        return countdownTask;
    }

    void setCountdownTask(BukkitTask countdownTask) {
        this.countdownTask = countdownTask;
    }
}
