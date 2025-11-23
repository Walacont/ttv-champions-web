/**
 * ELO Rating Calculation Module
 * Contains all ELO-related calculations and gate logic
 */

const { CONFIG } = require('./config');

/**
 * Find the highest Elo gate a player has reached
 * @param {number} currentElo - Player's current Elo
 * @param {number} highestElo - Player's highest Elo ever
 * @return {number} The highest gate reached (or 0 if none)
 */
function getHighestEloGate(currentElo, highestElo) {
  const maxReached = Math.max(currentElo, highestElo || 0);
  const gates = CONFIG.ELO.GATES;

  for (let i = gates.length - 1; i >= 0; i--) {
    if (maxReached >= gates[i]) {
      return gates[i];
    }
  }
  return 0; // No gate reached
}

/**
 * Apply Elo gate protection: Elo can never fall below the highest gate reached
 * @param {number} newElo - The calculated new Elo
 * @param {number} currentElo - Player's current Elo
 * @param {number} highestElo - Player's highest Elo ever
 * @return {number} Protected Elo (at least as high as the gate)
 */
function applyEloGate(newElo, currentElo, highestElo) {
  const gate = getHighestEloGate(currentElo, highestElo);
  return Math.max(newElo, gate);
}

/**
 * Berechnet neue Elo-Ratings für Gewinner und Verlierer.
 * @param {number} winnerElo - Aktuelles Elo-Rating des Gewinners.
 * @param {number} loserElo - Aktuelles Elo-Rating des Verlierers.
 * @param {number} [kFactor=32] - Einflussfaktor für die Berechnung.
 * @return {{newWinnerElo: number, newLoserElo: number, eloDelta: number}}
 */
function calculateElo(winnerElo, loserElo, kFactor = 32) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerElo = Math.round(winnerElo + kFactor * (1 - expectedWinner));
  const newLoserElo = Math.round(loserElo + kFactor * (0 - expectedLoser));
  const eloDelta = Math.abs(newWinnerElo - winnerElo);

  return { newWinnerElo, newLoserElo, eloDelta };
}

module.exports = {
  calculateElo,
  getHighestEloGate,
  applyEloGate,
};
