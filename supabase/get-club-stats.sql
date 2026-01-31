-- Public club stats function (bypasses RLS so any visitor can see stats)
CREATE OR REPLACE FUNCTION public.get_club_stats(p_club_id UUID, p_sport_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    member_count INT;
    coach_count INT;
    match_count INT;
BEGIN
    SELECT COUNT(*) INTO member_count
    FROM profiles
    WHERE club_id = p_club_id;

    SELECT COUNT(*) INTO coach_count
    FROM profiles
    WHERE club_id = p_club_id AND role IN ('coach', 'head_coach');

    IF p_sport_id IS NOT NULL THEN
        SELECT COUNT(*) INTO match_count
        FROM matches
        WHERE club_id = p_club_id AND sport_id = p_sport_id;
    ELSE
        SELECT COUNT(*) INTO match_count
        FROM matches
        WHERE club_id = p_club_id;
    END IF;

    RETURN json_build_object(
        'members', member_count,
        'coaches', coach_count,
        'matches', match_count
    );
END;
$$;
