-- Backfill player_a_sets_won and player_b_sets_won for existing matches
-- that have sets JSONB data but 0 in the aggregated columns.
-- This handles matches created before the set counts were stored separately.

UPDATE matches
SET
    player_a_sets_won = (
        SELECT COUNT(*)
        FROM jsonb_array_elements(sets) AS s
        WHERE (COALESCE((s->>'playerA')::int, 0) > COALESCE((s->>'playerB')::int, 0))
    ),
    player_b_sets_won = (
        SELECT COUNT(*)
        FROM jsonb_array_elements(sets) AS s
        WHERE (COALESCE((s->>'playerB')::int, 0) > COALESCE((s->>'playerA')::int, 0))
    )
WHERE sets IS NOT NULL
  AND jsonb_array_length(sets) > 0
  AND player_a_sets_won = 0
  AND player_b_sets_won = 0;
