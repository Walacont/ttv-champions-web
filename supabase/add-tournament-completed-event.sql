-- Add tournament_completed event type to activity_events

ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE activity_events ADD CONSTRAINT valid_event_type
    CHECK (event_type IN (
        'club_join', 'club_leave', 'rank_up', 'milestone', 'achievement',
        'club_ranking_change', 'global_ranking_change',
        'club_doubles_ranking_change', 'global_doubles_ranking_change',
        'tournament_completed'
    ));
