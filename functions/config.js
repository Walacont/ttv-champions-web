/**
 * Configuration for Cloud Functions
 * Centralized config for collections, ELO settings, and region
 */

const CONFIG = {
  COLLECTIONS: {
    USERS: 'users',
    MATCHES: 'matches',
    MATCH_REQUESTS: 'matchRequests',
    INVITATION_TOKENS: 'invitationTokens',
    INVITATION_CODES: 'invitationCodes',
    POINTS_HISTORY: 'pointsHistory',
  },
  ELO: {
    DEFAULT_RATING: 800, // Start at 800 Elo (new system)
    K_FACTOR: 32,
    SEASON_POINT_FACTOR: 0.2, // Season Points = Elo-Gewinn × 0.2
    HANDICAP_SEASON_POINTS: 8, // Feste Punktzahl für Handicap-Spiele
    // Elo Gates: Once reached, Elo can never fall below these thresholds
    GATES: [850, 900, 1000, 1100, 1300, 1600],
  },
  REGION: 'europe-west3',
};

module.exports = { CONFIG };
