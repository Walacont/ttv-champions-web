create type "public"."doubles_request_status" as enum ('pending_opponent', 'pending_coach', 'approved', 'rejected');

create type "public"."friendship_status" as enum ('pending', 'accepted', 'blocked');

create type "public"."match_proposal_status" as enum ('pending', 'accepted', 'declined', 'counter_proposed', 'cancelled');

create type "public"."match_request_status" as enum ('pending_player', 'pending_coach', 'approved', 'rejected');

create type "public"."report_status" as enum ('pending', 'reviewed', 'resolved', 'dismissed');

create type "public"."report_type" as enum ('spam', 'harassment', 'hate_speech', 'violence', 'inappropriate_content', 'impersonation', 'misinformation', 'other');

create type "public"."reportable_content_type" as enum ('user', 'post', 'poll', 'comment', 'match_media');

create type "public"."request_status" as enum ('pending', 'approved', 'rejected');

create type "public"."tournament_format" as enum ('round_robin', 'pool_6', 'pool_8', 'groups_4', 'knockout_16', 'knockout_32', 'double_elim_32', 'groups_knockout_32', 'groups_knockout_64', 'doubles_team', 'single_match', 'double_elimination');

create type "public"."tournament_match_status" as enum ('pending', 'in_progress', 'completed', 'walkover');

create type "public"."tournament_status" as enum ('draft', 'registration', 'in_progress', 'completed', 'cancelled');

create type "public"."tt_event_type" as enum ('rally_start', 'rally_end', 'point_won', 'point_lost', 'shot', 'fault', 'let', 'timeout');

create type "public"."tt_player_position" as enum ('near', 'far', 'left', 'right', 'unknown');

create type "public"."tt_shot_result" as enum ('hit', 'net', 'out', 'miss');

create type "public"."tt_shot_type" as enum ('forehand_serve', 'backhand_serve', 'forehand_topspin', 'backhand_topspin', 'forehand_push', 'backhand_push', 'forehand_block', 'backhand_block', 'other');

create type "public"."tt_table_position" as enum ('vh', 'mitte', 'rh');

create type "public"."tt_video_type" as enum ('ballmaschine', 'match', 'exercise', 'freeplay', 'other');

create type "public"."user_role" as enum ('player', 'coach', 'admin', 'head_coach', 'labeler');

create type "public"."video_analysis_status" as enum ('pending', 'reviewed');


  create table "public"."activity_comments" (
    "id" uuid not null default gen_random_uuid(),
    "activity_id" uuid not null,
    "activity_type" text not null,
    "user_id" uuid not null,
    "content" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."activity_comments" enable row level security;


  create table "public"."activity_events" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "club_id" uuid,
    "event_type" text not null,
    "event_data" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."activity_events" enable row level security;


  create table "public"."activity_likes" (
    "id" uuid not null default gen_random_uuid(),
    "activity_id" uuid not null,
    "activity_type" text not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."activity_likes" enable row level security;


  create table "public"."attendance" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid not null,
    "session_id" uuid,
    "subgroup_id" uuid,
    "user_id" uuid not null,
    "date" date not null,
    "present" boolean default true,
    "xp_awarded" integer default 0,
    "notes" text,
    "recorded_by" uuid,
    "created_at" timestamp with time zone default now(),
    "coaches" jsonb,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."attendance" enable row level security;


  create table "public"."audit_logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "action" text not null,
    "actor_id" uuid,
    "target_id" uuid,
    "target_type" text,
    "club_id" uuid,
    "sport_id" uuid,
    "details" jsonb,
    "ip_address" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."audit_logs" enable row level security;


  create table "public"."challenges" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid not null,
    "sport_id" uuid,
    "subgroup_id" uuid,
    "title" text not null,
    "description" text,
    "xp_reward" integer default 10,
    "date" date default CURRENT_DATE,
    "is_active" boolean default true,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "type" text default 'weekly'::text,
    "points" integer,
    "is_repeatable" boolean default true,
    "tiered_points" jsonb,
    "partner_system" jsonb,
    "last_reactivated_at" timestamp with time zone,
    "unit" text default 'Wiederholungen'::text
      );


alter table "public"."challenges" enable row level security;


  create table "public"."chat_conversations" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "type" text not null,
    "name" text,
    "club_id" uuid,
    "subgroup_id" uuid,
    "created_by" uuid not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."chat_conversations" enable row level security;


  create table "public"."chat_messages" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "conversation_id" uuid not null,
    "sender_id" uuid not null,
    "content" text not null,
    "created_at" timestamp with time zone default now(),
    "edited_at" timestamp with time zone
      );


alter table "public"."chat_messages" enable row level security;


  create table "public"."chat_participants" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "conversation_id" uuid not null,
    "user_id" uuid not null,
    "role" text default 'member'::text,
    "joined_at" timestamp with time zone default now(),
    "last_read_at" timestamp with time zone default now()
      );


alter table "public"."chat_participants" enable row level security;


  create table "public"."child_login_codes" (
    "id" uuid not null default gen_random_uuid(),
    "child_id" uuid not null,
    "guardian_id" uuid not null,
    "code" text not null,
    "expires_at" timestamp with time zone not null,
    "used_at" timestamp with time zone,
    "used_device_info" jsonb,
    "failed_attempts" integer not null default 0,
    "last_failed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."child_login_codes" enable row level security;


  create table "public"."child_pin_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "username" text not null,
    "attempted_at" timestamp with time zone default now(),
    "success" boolean default false,
    "ip_address" text
      );


alter table "public"."child_pin_attempts" enable row level security;


  create table "public"."child_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "child_id" uuid not null,
    "session_token" text not null,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone not null,
    "last_activity_at" timestamp with time zone default now(),
    "user_agent" text,
    "is_valid" boolean default true
      );


alter table "public"."child_sessions" enable row level security;


  create table "public"."club_requests" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "player_id" uuid not null,
    "club_id" uuid not null,
    "status" public.request_status default 'pending'::public.request_status,
    "message" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "sport_id" uuid,
    "request_type" text default 'member'::text,
    "child_first_name" text,
    "child_last_name" text,
    "child_birthdate" date,
    "child_gender" text
      );


alter table "public"."club_requests" enable row level security;


  create table "public"."club_sports" (
    "club_id" uuid not null,
    "sport_id" uuid not null,
    "is_active" boolean default true
      );


alter table "public"."club_sports" enable row level security;


  create table "public"."clubs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "description" text,
    "logo_url" text,
    "settings" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "is_test_club" boolean default false
      );


alter table "public"."clubs" enable row level security;


  create table "public"."community_polls" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "club_id" uuid,
    "question" text not null,
    "options" jsonb not null,
    "visibility" text not null default 'public'::text,
    "duration_days" integer not null default 7,
    "ends_at" timestamp with time zone not null,
    "total_votes" integer default 0,
    "comments_count" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "deleted_at" timestamp with time zone,
    "allow_multiple" boolean default false,
    "is_anonymous" boolean default true,
    "target_subgroup_ids" uuid[],
    "posted_as_club" boolean default false
      );


alter table "public"."community_polls" enable row level security;


  create table "public"."community_posts" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "club_id" uuid,
    "content" text not null,
    "image_url" text,
    "visibility" text not null default 'public'::text,
    "likes_count" integer default 0,
    "comments_count" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "deleted_at" timestamp with time zone,
    "image_urls" text[],
    "target_subgroup_ids" uuid[],
    "posted_as_club" boolean default false
      );


alter table "public"."community_posts" enable row level security;


  create table "public"."completed_challenges" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "challenge_id" uuid not null,
    "completed_at" timestamp with time zone default now()
      );


alter table "public"."completed_challenges" enable row level security;


  create table "public"."completed_exercises" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "exercise_id" uuid not null,
    "count" integer default 1,
    "best_score" integer,
    "season" text,
    "completed_at" timestamp with time zone default now(),
    "current_count" integer default 1,
    "partner_id" uuid,
    "play_mode" text default 'solo'::text
      );


alter table "public"."completed_exercises" enable row level security;


  create table "public"."config" (
    "key" text not null,
    "value" jsonb not null,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."config" enable row level security;


  create table "public"."content_reports" (
    "id" uuid not null default gen_random_uuid(),
    "reporter_id" uuid not null,
    "content_type" public.reportable_content_type not null,
    "content_id" uuid not null,
    "reported_user_id" uuid,
    "report_type" public.report_type not null,
    "description" text,
    "status" public.report_status default 'pending'::public.report_status,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "resolution_notes" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."content_reports" enable row level security;


  create table "public"."doubles_match_requests" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid,
    "sport_id" uuid,
    "initiated_by" uuid not null,
    "team_a" jsonb not null,
    "team_b" jsonb not null,
    "sets" jsonb,
    "winning_team" text,
    "status" public.doubles_request_status default 'pending_opponent'::public.doubles_request_status,
    "approvals" jsonb default '{}'::jsonb,
    "is_cross_club" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "handicap" jsonb,
    "handicap_used" boolean default false,
    "match_mode" text default 'best-of-5'::text
      );


alter table "public"."doubles_match_requests" enable row level security;


  create table "public"."doubles_matches" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid,
    "sport_id" uuid,
    "team_a_player1_id" uuid not null,
    "team_a_player2_id" uuid not null,
    "team_b_player1_id" uuid not null,
    "team_b_player2_id" uuid not null,
    "winning_team" text,
    "sets" jsonb,
    "team_a_sets_won" integer default 0,
    "team_b_sets_won" integer default 0,
    "is_cross_club" boolean default false,
    "played_at" timestamp with time zone default now(),
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "processed" boolean default false,
    "handicap_used" boolean default false,
    "team_a_pairing_id" text,
    "team_b_pairing_id" text,
    "set1_a" integer default 0,
    "set1_b" integer default 0,
    "set2_a" integer default 0,
    "set2_b" integer default 0,
    "set3_a" integer default 0,
    "set3_b" integer default 0,
    "set4_a" integer default 0,
    "set4_b" integer default 0,
    "set5_a" integer default 0,
    "set5_b" integer default 0,
    "requested_by" uuid,
    "approved_by" uuid,
    "team_a_elo_change" integer default 0,
    "team_b_elo_change" integer default 0,
    "season_points_awarded" integer default 0,
    "match_mode" character varying(50) default 'best-of-5'::character varying,
    "handicap" jsonb,
    "winner_elo_change" integer,
    "loser_elo_change" integer
      );


alter table "public"."doubles_matches" enable row level security;


  create table "public"."doubles_pairings" (
    "id" text not null,
    "player1_id" uuid not null,
    "player2_id" uuid not null,
    "player1_name" text,
    "player2_name" text,
    "player1_club_id_at_match" uuid,
    "player2_club_id_at_match" uuid,
    "club_id" uuid,
    "matches_played" integer default 0,
    "matches_won" integer default 0,
    "matches_lost" integer default 0,
    "win_rate" real default 0.0,
    "current_elo_rating" integer default 800,
    "last_played" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "doubles_highest_elo" integer default 800,
    "wins" integer default 0,
    "losses" integer default 0,
    "updated_at" timestamp with time zone default now(),
    "sport_id" uuid
      );


alter table "public"."doubles_pairings" enable row level security;


  create table "public"."elo_sport_config" (
    "id" uuid not null default gen_random_uuid(),
    "sport_id" uuid,
    "sport_key" text,
    "handicap_threshold" integer default 40,
    "handicap_per_points" integer default 40,
    "handicap_cap" integer default 7,
    "fixed_handicap_change" integer default 8,
    "a_factor_new" integer default 32,
    "a_factor_stabilizing" integer default 24,
    "a_factor_established" integer default 16,
    "a_factor_youth" integer default 20,
    "rating_floor" integer default 400,
    "rating_default" integer default 800,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."elo_sport_config" enable row level security;


  create table "public"."event_attendance" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" uuid,
    "present_user_ids" uuid[] default '{}'::uuid[],
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "completed_exercises" jsonb default '[]'::jsonb,
    "points_awarded_to" text[] default '{}'::text[],
    "coach_hours" jsonb default '{}'::jsonb,
    "occurrence_date" date
      );


alter table "public"."event_attendance" enable row level security;


  create table "public"."event_comments" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "event_id" uuid not null,
    "occurrence_date" date,
    "user_id" uuid not null,
    "content" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone
      );


alter table "public"."event_comments" enable row level security;


  create table "public"."event_invitations" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" uuid,
    "user_id" uuid,
    "status" text default 'pending'::text,
    "response_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "occurrence_date" date,
    "decline_comment" text,
    "role" text default 'participant'::text,
    "waitlist_position" integer,
    "responded_by" uuid,
    "lead_time_notified_at" timestamp with time zone
      );


alter table "public"."event_invitations" enable row level security;


  create table "public"."event_waitlist" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "event_id" uuid not null,
    "occurrence_date" date,
    "user_id" uuid not null,
    "position" integer not null default 1,
    "joined_at" timestamp with time zone default now(),
    "promoted_at" timestamp with time zone
      );


alter table "public"."event_waitlist" enable row level security;


  create table "public"."events" (
    "id" uuid not null default gen_random_uuid(),
    "club_id" uuid,
    "organizer_id" uuid,
    "title" text not null,
    "description" text,
    "start_date" date not null,
    "start_time" time without time zone not null,
    "meeting_time" time without time zone,
    "end_time" time without time zone,
    "location" text,
    "event_type" text default 'single'::text,
    "target_type" text default 'club'::text,
    "target_subgroup_ids" uuid[] default '{}'::uuid[],
    "max_participants" integer,
    "response_deadline" timestamp with time zone,
    "invitation_send_at" timestamp with time zone,
    "comments_enabled" boolean default true,
    "repeat_type" text,
    "repeat_end_date" date,
    "cancelled" boolean default false,
    "cancellation_reason" text,
    "created_at" timestamp with time zone default now(),
    "excluded_dates" text[] default '{}'::text[],
    "updated_at" timestamp with time zone default now(),
    "invitation_lead_time_value" integer,
    "invitation_lead_time_unit" text,
    "event_category" text default 'other'::text,
    "award_points" boolean,
    "organizer_ids" uuid[] default '{}'::uuid[],
    "attachments" jsonb default '[]'::jsonb,
    "auto_reminder" text default 'disabled'::text,
    "reminder_sent_at" timestamp with time zone,
    "default_participation_status" text default 'pending'::text,
    "invite_mode" text default 'members'::text,
    "notify_guardians" boolean default true
      );


alter table "public"."events" enable row level security;


  create table "public"."exercise_example_videos" (
    "id" uuid not null default gen_random_uuid(),
    "exercise_id" uuid not null,
    "video_id" uuid not null,
    "added_by" uuid not null,
    "club_id" uuid not null,
    "sort_order" integer default 0,
    "description" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."exercise_example_videos" enable row level security;


  create table "public"."exercise_milestones" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "exercise_id" uuid not null,
    "current_count" integer default 0,
    "updated_at" timestamp with time zone default now(),
    "achieved_milestones" integer[],
    "partner_id" uuid,
    "play_mode" text default 'solo'::text
      );


alter table "public"."exercise_milestones" enable row level security;


  create table "public"."exercise_records" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "exercise_id" uuid not null,
    "record_value" integer not null,
    "play_mode" text not null default 'solo'::text,
    "partner_id" uuid,
    "achieved_at" timestamp with time zone default now(),
    "points_earned" integer default 0,
    "season" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."exercises" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "sport_id" uuid,
    "name" text not null,
    "description" text,
    "category" text,
    "difficulty" integer default 1,
    "xp_reward" integer default 10,
    "record_count" integer,
    "record_holder_id" uuid,
    "record_holder_name" text,
    "record_holder_club" text,
    "record_holder_club_id" uuid,
    "record_updated_at" timestamp with time zone,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "title" text,
    "image_url" text,
    "description_content" jsonb,
    "tags" text[],
    "points" integer default 10,
    "level" text,
    "visibility" text default 'global'::text,
    "tiered_points" jsonb,
    "club_id" uuid,
    "created_by_name" text,
    "procedure" jsonb,
    "unit" character varying(50) default 'Wiederholungen'::character varying,
    "animation_steps" jsonb,
    "player_type" text default 'both_active'::text,
    "time_direction" text,
    "youtube_examples" jsonb default '[]'::jsonb
      );


alter table "public"."exercises" enable row level security;


  create table "public"."friendships" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "requester_id" uuid not null,
    "addressee_id" uuid not null,
    "status" public.friendship_status default 'pending'::public.friendship_status,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."friendships" enable row level security;


  create table "public"."guardian_consent_log" (
    "id" uuid not null default gen_random_uuid(),
    "guardian_id" uuid not null,
    "child_id" uuid not null,
    "consent_type" text not null,
    "terms_version" text not null,
    "consented_at" timestamp with time zone not null default now(),
    "ip_address" text,
    "user_agent" text,
    "metadata" jsonb default '{}'::jsonb
      );


alter table "public"."guardian_consent_log" enable row level security;


  create table "public"."guardian_event_responses" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "event_id" uuid not null,
    "occurrence_date" date,
    "child_id" uuid not null,
    "guardian_id" uuid not null,
    "status" text not null default 'pending'::text,
    "decline_comment" text,
    "responded_at" timestamp with time zone,
    "notified_at" timestamp with time zone default now()
      );


alter table "public"."guardian_event_responses" enable row level security;


  create table "public"."guardian_links" (
    "id" uuid not null default gen_random_uuid(),
    "guardian_id" uuid not null,
    "child_id" uuid not null,
    "relationship" text not null default 'parent'::text,
    "is_primary" boolean not null default true,
    "permissions" jsonb not null default '{"can_view_stats": true, "can_view_videos": true, "can_edit_profile": true, "can_view_matches": true, "can_manage_settings": true, "receives_notifications": true}'::jsonb,
    "consent_given_at" timestamp with time zone,
    "consent_version" text,
    "consent_ip_address" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."guardian_links" enable row level security;


  create table "public"."head_to_head_stats" (
    "id" uuid not null default gen_random_uuid(),
    "player_a_id" uuid not null,
    "player_b_id" uuid not null,
    "current_streak_winner_id" uuid,
    "consecutive_wins" integer default 0,
    "suggested_handicap" integer default 0,
    "player_a_wins" integer default 0,
    "player_b_wins" integer default 0,
    "total_matches" integer default 0,
    "last_winner_id" uuid,
    "last_match_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."head_to_head_stats" enable row level security;


  create table "public"."hidden_content" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "content_type" public.reportable_content_type not null,
    "content_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."hidden_content" enable row level security;


  create table "public"."invitation_codes" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "code" text not null,
    "club_id" uuid not null,
    "subgroup_id" uuid,
    "max_uses" integer,
    "use_count" integer default 0,
    "expires_at" timestamp with time zone,
    "is_active" boolean default true,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "first_name" text,
    "last_name" text,
    "role" text default 'player'::text,
    "subgroup_ids" uuid[] default '{}'::uuid[],
    "player_id" uuid,
    "used" boolean default false,
    "used_by" uuid,
    "used_at" timestamp with time zone,
    "superseded" boolean default false,
    "sport_id" uuid,
    "birthdate" text,
    "gender" text,
    "superseded_at" timestamp with time zone
      );


alter table "public"."invitation_codes" enable row level security;


  create table "public"."leave_club_requests" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "player_id" uuid not null,
    "club_id" uuid not null,
    "status" public.request_status default 'pending'::public.request_status,
    "reason" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "sport_id" uuid
      );


alter table "public"."leave_club_requests" enable row level security;


  create table "public"."match_media" (
    "id" uuid not null default gen_random_uuid(),
    "match_id" text not null,
    "match_type" text not null,
    "uploaded_by" uuid not null,
    "file_type" text not null,
    "file_path" text not null,
    "file_size" integer not null,
    "mime_type" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."match_media" enable row level security;


  create table "public"."match_proposals" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid not null,
    "sport_id" uuid,
    "requester_id" uuid not null,
    "recipient_id" uuid not null,
    "proposed_date" date,
    "proposed_time" time without time zone,
    "message" text,
    "status" public.match_proposal_status default 'pending'::public.match_proposal_status,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."match_proposals" enable row level security;


  create table "public"."match_requests" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid,
    "sport_id" uuid,
    "player_a_id" uuid not null,
    "player_b_id" uuid not null,
    "winner_id" uuid,
    "loser_id" uuid,
    "sets" jsonb,
    "status" public.match_request_status default 'pending_player'::public.match_request_status,
    "approvals" jsonb default '{}'::jsonb,
    "is_cross_club" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "handicap_used" boolean default false,
    "match_mode" character varying(50) default 'best-of-5'::character varying,
    "handicap" jsonb,
    "tournament_match_id" uuid,
    "player_a_sets_won" integer default 0,
    "player_b_sets_won" integer default 0
      );


alter table "public"."match_requests" enable row level security;


  create table "public"."matches" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid,
    "sport_id" uuid,
    "player_a_id" uuid not null,
    "player_b_id" uuid not null,
    "winner_id" uuid,
    "loser_id" uuid,
    "sets" jsonb,
    "player_a_sets_won" integer default 0,
    "player_b_sets_won" integer default 0,
    "elo_change" integer,
    "player_a_elo_before" integer,
    "player_b_elo_before" integer,
    "player_a_elo_after" integer,
    "player_b_elo_after" integer,
    "played_at" timestamp with time zone default now(),
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "score_a" integer,
    "score_b" integer,
    "handicap_used" boolean default false,
    "match_mode" character varying(50) default 'best-of-5'::character varying,
    "processed" boolean default false,
    "winner_elo_change" integer,
    "loser_elo_change" integer,
    "season_points_awarded" integer,
    "handicap" jsonb,
    "tournament_match_id" uuid
      );


alter table "public"."matches" enable row level security;


  create table "public"."ml_data_consent" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "consent_video_training" boolean default false,
    "consent_anonymized_export" boolean default false,
    "consent_research" boolean default false,
    "consented_at" timestamp with time zone,
    "consent_version" text default '1.0'::text,
    "ip_address" inet,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."ml_data_consent" enable row level security;


  create table "public"."notifications" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "type" text not null,
    "title" text not null,
    "message" text not null,
    "data" jsonb default '{}'::jsonb,
    "is_read" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."notifications" enable row level security;


  create table "public"."points_history" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "points" integer not null,
    "reason" text,
    "awarded_by" text,
    "created_at" timestamp with time zone default now(),
    "timestamp" timestamp with time zone default now(),
    "xp" integer default 0,
    "elo_change" integer default 0,
    "is_active_player" boolean default false,
    "is_partner" boolean default false,
    "partner_id" uuid,
    "play_mode" text
      );


alter table "public"."points_history" enable row level security;


  create table "public"."poll_votes" (
    "id" uuid not null default gen_random_uuid(),
    "poll_id" uuid not null,
    "user_id" uuid not null,
    "option_id" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."poll_votes" enable row level security;


  create table "public"."post_comments" (
    "id" uuid not null default gen_random_uuid(),
    "post_id" uuid,
    "poll_id" uuid,
    "user_id" uuid not null,
    "content" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."post_comments" enable row level security;


  create table "public"."post_likes" (
    "id" uuid not null default gen_random_uuid(),
    "post_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."post_likes" enable row level security;


  create table "public"."profile_club_sports" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "club_id" uuid not null,
    "sport_id" uuid not null,
    "role" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."profile_club_sports" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "email" text,
    "display_name" text,
    "avatar_url" text,
    "role" public.user_role default 'player'::public.user_role,
    "club_id" uuid,
    "xp" integer default 0,
    "points" integer default 0,
    "elo_rating" integer default 800,
    "highest_elo" integer default 800,
    "is_offline" boolean default false,
    "onboarding_complete" boolean default false,
    "privacy_settings" jsonb default '{"showElo": true, "searchable": true}'::jsonb,
    "club_request_status" public.request_status,
    "club_request_id" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "first_name" text,
    "last_name" text,
    "birthdate" date,
    "gender" text,
    "photo_url" text,
    "doubles_elo_rating" integer default 800,
    "highest_doubles_elo" integer default 800,
    "doubles_matches_played" integer default 0,
    "doubles_matches_won" integer default 0,
    "doubles_matches_lost" integer default 0,
    "fcm_token" text,
    "fcm_token_updated_at" timestamp with time zone,
    "notifications_enabled" boolean default true,
    "notification_preferences" jsonb,
    "notification_preferences_updated_at" timestamp with time zone,
    "last_season_reset" timestamp with time zone,
    "last_xp_update" timestamp with time zone,
    "subgroup_ids" text[],
    "migrated_at" timestamp with time zone,
    "migrated_from" text,
    "leaderboard_preferences" jsonb,
    "tutorial_completed" jsonb default '{}'::jsonb,
    "tutorial_completed_at" jsonb default '{}'::jsonb,
    "active_sport_id" uuid,
    "wins" integer default 0,
    "losses" integer default 0,
    "doubles_highest_elo" integer default 800,
    "doubles_wins" integer default 0,
    "doubles_losses" integer default 0,
    "qttr_points" integer,
    "age_group" text,
    "jersey_number" text,
    "sport_id" uuid,
    "singles_matches_played" integer default 0,
    "matches_played" integer default 0,
    "push_platform" text,
    "push_notifications_enabled" boolean default true,
    "push_notify_matches" boolean default true,
    "push_notify_rankings" boolean default true,
    "push_notify_social" boolean default true,
    "push_notify_club" boolean default true,
    "account_type" text default 'standard'::text,
    "age_mode" text,
    "is_guardian" boolean default false,
    "is_player" boolean default false,
    "username" text,
    "pin_hash" text,
    "spielhand" text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."push_notification_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "notification_type" text not null,
    "title" text,
    "body" text,
    "data" jsonb,
    "platform" text,
    "status" text default 'pending'::text,
    "error_message" text,
    "created_at" timestamp with time zone default now(),
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone
      );


alter table "public"."push_notification_logs" enable row level security;


  create table "public"."push_subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "endpoint" text not null,
    "p256dh" text not null,
    "auth" text not null,
    "user_agent" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "last_used_at" timestamp with time zone,
    "is_active" boolean default true
      );


alter table "public"."push_subscriptions" enable row level security;


  create table "public"."seasons" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "sport_id" uuid not null,
    "name" text not null,
    "start_date" date not null,
    "end_date" date not null,
    "is_active" boolean default false,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid,
    "club_id" uuid
      );


alter table "public"."seasons" enable row level security;


  create table "public"."sports" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "display_name" text not null,
    "icon" text,
    "description" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "config" jsonb default '{}'::jsonb
      );


alter table "public"."sports" enable row level security;


  create table "public"."streaks" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "subgroup_id" uuid not null,
    "current_streak" integer default 0,
    "longest_streak" integer default 0,
    "last_attendance_date" date,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."streaks" enable row level security;


  create table "public"."subgroup_members" (
    "subgroup_id" uuid not null,
    "user_id" uuid not null
      );


alter table "public"."subgroup_members" enable row level security;


  create table "public"."subgroups" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid,
    "sport_id" uuid,
    "name" text not null,
    "description" text,
    "color" text,
    "training_days" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "is_default" boolean default false
      );


alter table "public"."subgroups" enable row level security;


  create table "public"."tournament_matches" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tournament_id" uuid not null,
    "round_id" uuid,
    "match_number" integer,
    "round_number" integer default 1,
    "player_a_id" uuid,
    "player_b_id" uuid,
    "match_id" uuid,
    "scheduled_for" timestamp with time zone,
    "deadline" timestamp with time zone,
    "status" public.tournament_match_status default 'pending'::public.tournament_match_status,
    "winner_id" uuid,
    "player_a_sets_won" integer default 0,
    "player_b_sets_won" integer default 0,
    "is_walkover" boolean default false,
    "walkover_reason" text,
    "created_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "bracket_type" text default 'winners'::text,
    "bracket_position" integer,
    "next_winner_match_id" uuid,
    "next_loser_match_id" uuid
      );


alter table "public"."tournament_matches" enable row level security;


  create table "public"."tournament_participants" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tournament_id" uuid not null,
    "player_id" uuid not null,
    "seed" integer,
    "elo_at_registration" integer,
    "matches_played" integer default 0,
    "matches_won" integer default 0,
    "matches_lost" integer default 0,
    "sets_won" integer default 0,
    "sets_lost" integer default 0,
    "points" integer default 0,
    "final_rank" integer,
    "is_active" boolean default true,
    "disqualified_reason" text,
    "joined_at" timestamp with time zone default now()
      );


alter table "public"."tournament_participants" enable row level security;


  create table "public"."tournament_rounds" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tournament_id" uuid not null,
    "round_number" integer not null,
    "round_name" text,
    "group_name" text,
    "start_date" timestamp with time zone,
    "deadline" timestamp with time zone,
    "is_active" boolean default false,
    "is_completed" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."tournament_rounds" enable row level security;


  create table "public"."tournament_standings" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tournament_id" uuid not null,
    "round_id" uuid,
    "player_id" uuid not null,
    "matches_played" integer default 0,
    "matches_won" integer default 0,
    "matches_lost" integer default 0,
    "matches_drawn" integer default 0,
    "sets_won" integer default 0,
    "sets_lost" integer default 0,
    "sets_difference" integer default 0,
    "points_scored" integer default 0,
    "points_against" integer default 0,
    "points_difference" integer default 0,
    "tournament_points" integer default 0,
    "rank" integer,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."tournament_standings" enable row level security;


  create table "public"."tournaments" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "description" text,
    "club_id" uuid not null,
    "sport_id" uuid not null,
    "format" public.tournament_format not null,
    "max_participants" integer not null,
    "is_open" boolean default true,
    "join_code" text,
    "with_handicap" boolean default false,
    "is_live" boolean default false,
    "match_deadline_days" integer default 7,
    "status" public.tournament_status default 'draft'::public.tournament_status,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "registration_deadline" timestamp with time zone,
    "participant_count" integer default 0,
    "matches_total" integer default 0,
    "matches_completed" integer default 0,
    "winner_id" uuid,
    "runner_up_id" uuid,
    "created_by" uuid not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "is_club_only" boolean default false,
    "match_mode" text default 'best-of-5'::text
      );


alter table "public"."tournaments" enable row level security;


  create table "public"."training_sessions" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "club_id" uuid not null,
    "subgroup_id" uuid,
    "sport_id" uuid,
    "title" text,
    "date" date not null,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "notes" text,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "cancelled" boolean default false,
    "completed" boolean default false,
    "completed_at" timestamp with time zone,
    "planned_exercises" jsonb default '[]'::jsonb,
    "recurring_template_id" uuid
      );


alter table "public"."training_sessions" enable row level security;


  create table "public"."user_blocks" (
    "id" uuid not null default gen_random_uuid(),
    "blocker_id" uuid not null,
    "blocked_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."user_blocks" enable row level security;


  create table "public"."user_preferences" (
    "user_id" uuid not null,
    "dashboard_widgets" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."user_preferences" enable row level security;


  create table "public"."user_season_points" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "season_id" uuid not null,
    "points" integer default 0,
    "sport_points" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."user_season_points" enable row level security;


  create table "public"."user_sport_stats" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "sport_id" uuid not null,
    "elo_rating" integer default 1000,
    "highest_elo" integer default 1000,
    "doubles_elo_rating" integer default 1000,
    "doubles_highest_elo" integer default 1000,
    "xp" integer default 0,
    "points" integer default 0,
    "wins" integer default 0,
    "losses" integer default 0,
    "doubles_wins" integer default 0,
    "doubles_losses" integer default 0,
    "matches_played" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."user_sport_stats" enable row level security;


  create table "public"."video_ai_analyses" (
    "id" uuid not null default gen_random_uuid(),
    "video_id" uuid not null,
    "analysis_type" text not null,
    "status" text not null default 'pending'::text,
    "processing_location" text default 'browser'::text,
    "model_name" text,
    "model_version" text,
    "results" jsonb,
    "summary" jsonb,
    "processing_time_ms" integer,
    "frames_analyzed" integer,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."video_ai_analyses" enable row level security;


  create table "public"."video_ai_frames" (
    "id" uuid not null default gen_random_uuid(),
    "analysis_id" uuid not null,
    "video_id" uuid not null,
    "timestamp_seconds" double precision not null,
    "frame_number" integer,
    "poses" jsonb,
    "player_count" smallint,
    "ball_x" double precision,
    "ball_y" double precision,
    "ball_confidence" double precision,
    "table_bounds" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."video_ai_frames" enable row level security;


  create table "public"."video_analyses" (
    "id" uuid not null default gen_random_uuid(),
    "uploaded_by" uuid not null,
    "club_id" uuid,
    "exercise_id" uuid,
    "video_url" text not null,
    "thumbnail_url" text,
    "duration_seconds" double precision,
    "file_size" bigint,
    "title" text,
    "tags" text[] default '{}'::text[],
    "is_reference" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "allow_ai_training" boolean default false,
    "ai_ready" boolean default false,
    "video_type" public.tt_video_type,
    "rally_markers" jsonb,
    "video_date" date
      );


alter table "public"."video_analyses" enable row level security;


  create table "public"."video_assignments" (
    "id" uuid not null default gen_random_uuid(),
    "video_id" uuid not null,
    "player_id" uuid not null,
    "status" public.video_analysis_status default 'pending'::public.video_analysis_status,
    "assigned_at" timestamp with time zone default now(),
    "reviewed_at" timestamp with time zone,
    "club_id" uuid not null
      );


alter table "public"."video_assignments" enable row level security;


  create table "public"."video_comments" (
    "id" uuid not null default gen_random_uuid(),
    "video_id" uuid not null,
    "user_id" uuid not null,
    "content" text not null,
    "timestamp_seconds" double precision,
    "parent_id" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "club_id" uuid not null
      );


alter table "public"."video_comments" enable row level security;


  create table "public"."video_labels" (
    "id" uuid not null default gen_random_uuid(),
    "video_id" uuid not null,
    "labeled_by" uuid not null,
    "club_id" uuid,
    "timestamp_start" double precision not null,
    "timestamp_end" double precision,
    "event_type" public.tt_event_type not null default 'shot'::public.tt_event_type,
    "shot_type" public.tt_shot_type,
    "shot_quality" smallint,
    "player_position" public.tt_player_position default 'unknown'::public.tt_player_position,
    "player_id" uuid,
    "ball_position_x" double precision,
    "ball_position_y" double precision,
    "notes" text,
    "confidence" text default 'certain'::text,
    "is_verified" boolean default false,
    "verified_by" uuid,
    "exported_for_training" boolean default false,
    "export_batch_id" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "shot_from" public.tt_table_position,
    "shot_to" public.tt_table_position,
    "shot_result" public.tt_shot_result default 'hit'::public.tt_shot_result
      );


alter table "public"."video_labels" enable row level security;


  create table "public"."video_ml_metadata" (
    "id" uuid not null default gen_random_uuid(),
    "video_id" uuid not null,
    "width" integer,
    "height" integer,
    "fps" double precision,
    "duration_seconds" double precision,
    "codec" text,
    "camera_angle" text,
    "camera_distance" text,
    "lighting" text,
    "table_visible" boolean,
    "players_count" smallint,
    "has_audience" boolean,
    "audio_quality" text,
    "ball_sounds_audible" boolean,
    "suitable_for_training" boolean default true,
    "exclusion_reason" text,
    "auto_detected_fps" double precision,
    "auto_detected_table" boolean,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."video_ml_metadata" enable row level security;


  create table "public"."video_rally_segments" (
    "id" uuid not null default gen_random_uuid(),
    "video_id" uuid not null,
    "start_time" double precision not null,
    "end_time" double precision not null,
    "duration_seconds" double precision generated always as ((end_time - start_time)) stored,
    "shot_count" integer,
    "winner" text,
    "end_type" text,
    "source" text default 'manual'::text,
    "confidence" double precision,
    "created_by" uuid,
    "verified" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."video_rally_segments" enable row level security;


  create table "public"."xp_history" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "xp" integer not null,
    "reason" text,
    "source" text,
    "awarded_by" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."xp_history" enable row level security;

CREATE UNIQUE INDEX activity_comments_pkey ON public.activity_comments USING btree (id);

CREATE UNIQUE INDEX activity_events_pkey ON public.activity_events USING btree (id);

CREATE UNIQUE INDEX activity_likes_activity_id_activity_type_user_id_key ON public.activity_likes USING btree (activity_id, activity_type, user_id);

CREATE UNIQUE INDEX activity_likes_pkey ON public.activity_likes USING btree (id);

CREATE UNIQUE INDEX attendance_pkey ON public.attendance USING btree (id);

CREATE UNIQUE INDEX attendance_user_id_date_subgroup_id_key ON public.attendance USING btree (user_id, date, subgroup_id);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX challenges_pkey ON public.challenges USING btree (id);

CREATE UNIQUE INDEX chat_conversations_pkey ON public.chat_conversations USING btree (id);

CREATE UNIQUE INDEX chat_messages_pkey ON public.chat_messages USING btree (id);

CREATE UNIQUE INDEX chat_participants_conversation_id_user_id_key ON public.chat_participants USING btree (conversation_id, user_id);

CREATE UNIQUE INDEX chat_participants_pkey ON public.chat_participants USING btree (id);

CREATE UNIQUE INDEX child_login_codes_code_key ON public.child_login_codes USING btree (code);

CREATE UNIQUE INDEX child_login_codes_pkey ON public.child_login_codes USING btree (id);

CREATE UNIQUE INDEX child_pin_attempts_pkey ON public.child_pin_attempts USING btree (id);

CREATE UNIQUE INDEX child_sessions_pkey ON public.child_sessions USING btree (id);

CREATE UNIQUE INDEX child_sessions_session_token_key ON public.child_sessions USING btree (session_token);

CREATE UNIQUE INDEX club_requests_pkey ON public.club_requests USING btree (id);

CREATE UNIQUE INDEX club_sports_pkey ON public.club_sports USING btree (club_id, sport_id);

CREATE UNIQUE INDEX clubs_pkey ON public.clubs USING btree (id);

CREATE UNIQUE INDEX community_polls_pkey ON public.community_polls USING btree (id);

CREATE UNIQUE INDEX community_posts_pkey ON public.community_posts USING btree (id);

CREATE UNIQUE INDEX completed_challenges_pkey ON public.completed_challenges USING btree (id);

CREATE UNIQUE INDEX completed_challenges_user_id_challenge_id_key ON public.completed_challenges USING btree (user_id, challenge_id);

CREATE UNIQUE INDEX completed_exercises_pkey ON public.completed_exercises USING btree (id);

CREATE UNIQUE INDEX config_pkey ON public.config USING btree (key);

CREATE UNIQUE INDEX content_reports_pkey ON public.content_reports USING btree (id);

CREATE UNIQUE INDEX doubles_match_requests_pkey ON public.doubles_match_requests USING btree (id);

CREATE UNIQUE INDEX doubles_matches_pkey ON public.doubles_matches USING btree (id);

CREATE UNIQUE INDEX doubles_pairings_pkey ON public.doubles_pairings USING btree (id);

CREATE UNIQUE INDEX elo_sport_config_pkey ON public.elo_sport_config USING btree (id);

CREATE UNIQUE INDEX elo_sport_config_sport_key_key ON public.elo_sport_config USING btree (sport_key);

CREATE UNIQUE INDEX event_attendance_pkey ON public.event_attendance USING btree (id);

CREATE UNIQUE INDEX event_comments_pkey ON public.event_comments USING btree (id);

CREATE UNIQUE INDEX event_invitations_pkey ON public.event_invitations USING btree (id);

CREATE UNIQUE INDEX event_waitlist_event_id_occurrence_date_user_id_key ON public.event_waitlist USING btree (event_id, occurrence_date, user_id);

CREATE UNIQUE INDEX event_waitlist_pkey ON public.event_waitlist USING btree (id);

CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id);

CREATE UNIQUE INDEX exercise_example_videos_exercise_id_video_id_key ON public.exercise_example_videos USING btree (exercise_id, video_id);

CREATE UNIQUE INDEX exercise_example_videos_pkey ON public.exercise_example_videos USING btree (id);

CREATE UNIQUE INDEX exercise_milestones_pkey ON public.exercise_milestones USING btree (id);

CREATE UNIQUE INDEX exercise_milestones_user_exercise_unique ON public.exercise_milestones USING btree (user_id, exercise_id);

CREATE UNIQUE INDEX exercise_milestones_user_id_exercise_id_key ON public.exercise_milestones USING btree (user_id, exercise_id);

CREATE UNIQUE INDEX exercise_records_pkey ON public.exercise_records USING btree (id);

CREATE UNIQUE INDEX exercises_pkey ON public.exercises USING btree (id);

CREATE UNIQUE INDEX friendships_pkey ON public.friendships USING btree (id);

CREATE UNIQUE INDEX guardian_consent_log_pkey ON public.guardian_consent_log USING btree (id);

CREATE UNIQUE INDEX guardian_event_responses_event_id_occurrence_date_child_id__key ON public.guardian_event_responses USING btree (event_id, occurrence_date, child_id, guardian_id);

CREATE UNIQUE INDEX guardian_event_responses_pkey ON public.guardian_event_responses USING btree (id);

CREATE UNIQUE INDEX guardian_links_guardian_id_child_id_key ON public.guardian_links USING btree (guardian_id, child_id);

CREATE UNIQUE INDEX guardian_links_pkey ON public.guardian_links USING btree (id);

CREATE UNIQUE INDEX head_to_head_stats_pkey ON public.head_to_head_stats USING btree (id);

CREATE UNIQUE INDEX head_to_head_stats_player_a_id_player_b_id_key ON public.head_to_head_stats USING btree (player_a_id, player_b_id);

CREATE UNIQUE INDEX hidden_content_pkey ON public.hidden_content USING btree (id);

CREATE INDEX idx_activity_comments_activity ON public.activity_comments USING btree (activity_id, activity_type);

CREATE INDEX idx_activity_comments_created ON public.activity_comments USING btree (created_at DESC);

CREATE INDEX idx_activity_comments_user ON public.activity_comments USING btree (user_id);

CREATE INDEX idx_activity_events_club_id ON public.activity_events USING btree (club_id);

CREATE INDEX idx_activity_events_created_at ON public.activity_events USING btree (created_at DESC);

CREATE INDEX idx_activity_events_type ON public.activity_events USING btree (event_type);

CREATE INDEX idx_activity_events_user_id ON public.activity_events USING btree (user_id);

CREATE INDEX idx_activity_likes_activity ON public.activity_likes USING btree (activity_id, activity_type);

CREATE INDEX idx_activity_likes_created ON public.activity_likes USING btree (created_at DESC);

CREATE INDEX idx_activity_likes_user ON public.activity_likes USING btree (user_id);

CREATE INDEX idx_attendance_club_date ON public.attendance USING btree (club_id, date);

CREATE INDEX idx_attendance_user_date ON public.attendance USING btree (user_id, date);

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_id);

CREATE INDEX idx_audit_logs_club ON public.audit_logs USING btree (club_id);

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_sport ON public.audit_logs USING btree (sport_id);

CREATE INDEX idx_audit_logs_target ON public.audit_logs USING btree (target_id);

CREATE INDEX idx_audit_logs_target_type ON public.audit_logs USING btree (target_type);

CREATE INDEX idx_challenges_club_active ON public.challenges USING btree (club_id, is_active);

CREATE INDEX idx_challenges_club_date ON public.challenges USING btree (club_id, date);

CREATE INDEX idx_challenges_is_active ON public.challenges USING btree (is_active);

CREATE INDEX idx_challenges_is_repeatable ON public.challenges USING btree (is_repeatable);

CREATE INDEX idx_challenges_type ON public.challenges USING btree (type);

CREATE INDEX idx_chat_conversations_club ON public.chat_conversations USING btree (club_id) WHERE (club_id IS NOT NULL);

CREATE INDEX idx_chat_conversations_type ON public.chat_conversations USING btree (type);

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id, created_at DESC);

CREATE INDEX idx_chat_messages_sender ON public.chat_messages USING btree (sender_id);

CREATE INDEX idx_chat_participants_conversation ON public.chat_participants USING btree (conversation_id);

CREATE INDEX idx_chat_participants_user ON public.chat_participants USING btree (user_id);

CREATE INDEX idx_child_login_codes_child_id ON public.child_login_codes USING btree (child_id);

CREATE INDEX idx_child_login_codes_code ON public.child_login_codes USING btree (code) WHERE (used_at IS NULL);

CREATE INDEX idx_child_sessions_child_id ON public.child_sessions USING btree (child_id);

CREATE INDEX idx_child_sessions_expires ON public.child_sessions USING btree (expires_at);

CREATE INDEX idx_child_sessions_token ON public.child_sessions USING btree (session_token) WHERE (is_valid = true);

CREATE INDEX idx_club_requests_sport ON public.club_requests USING btree (sport_id);

CREATE INDEX idx_clubs_is_test_club ON public.clubs USING btree (is_test_club);

CREATE INDEX idx_community_polls_club_id ON public.community_polls USING btree (club_id);

CREATE INDEX idx_community_polls_club_public ON public.community_polls USING btree (club_id, visibility) WHERE ((posted_as_club = true) AND (deleted_at IS NULL));

CREATE INDEX idx_community_polls_created_at ON public.community_polls USING btree (created_at DESC);

CREATE INDEX idx_community_polls_ends_at ON public.community_polls USING btree (ends_at);

CREATE INDEX idx_community_polls_target_subgroup_ids ON public.community_polls USING gin (target_subgroup_ids);

CREATE INDEX idx_community_polls_user_id ON public.community_polls USING btree (user_id);

CREATE INDEX idx_community_posts_club_id ON public.community_posts USING btree (club_id);

CREATE INDEX idx_community_posts_club_public ON public.community_posts USING btree (club_id, visibility) WHERE ((posted_as_club = true) AND (deleted_at IS NULL));

CREATE INDEX idx_community_posts_created_at ON public.community_posts USING btree (created_at DESC);

CREATE INDEX idx_community_posts_target_subgroup_ids ON public.community_posts USING gin (target_subgroup_ids);

CREATE INDEX idx_community_posts_user_id ON public.community_posts USING btree (user_id);

CREATE INDEX idx_community_posts_visibility ON public.community_posts USING btree (visibility);

CREATE UNIQUE INDEX idx_completed_exercises_unique ON public.completed_exercises USING btree (user_id, exercise_id, COALESCE(season, ''::text), COALESCE(play_mode, 'solo'::text), COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX idx_consent_log_child ON public.guardian_consent_log USING btree (child_id);

CREATE INDEX idx_consent_log_guardian ON public.guardian_consent_log USING btree (guardian_id);

CREATE INDEX idx_content_reports_content ON public.content_reports USING btree (content_type, content_id);

CREATE INDEX idx_content_reports_created_at ON public.content_reports USING btree (created_at DESC);

CREATE INDEX idx_content_reports_reported_user ON public.content_reports USING btree (reported_user_id);

CREATE INDEX idx_content_reports_reporter ON public.content_reports USING btree (reporter_id);

CREATE INDEX idx_content_reports_status ON public.content_reports USING btree (status);

CREATE INDEX idx_doubles_matches_handicap_used ON public.doubles_matches USING btree (handicap_used) WHERE (handicap_used = true);

CREATE INDEX idx_doubles_matches_match_mode ON public.doubles_matches USING btree (match_mode);

CREATE INDEX idx_doubles_pairings_club ON public.doubles_pairings USING btree (club_id);

CREATE INDEX idx_doubles_pairings_player1 ON public.doubles_pairings USING btree (player1_id);

CREATE INDEX idx_doubles_pairings_player2 ON public.doubles_pairings USING btree (player2_id);

CREATE INDEX idx_doubles_pairings_wins ON public.doubles_pairings USING btree (matches_won DESC);

CREATE INDEX idx_event_attendance_event_id ON public.event_attendance USING btree (event_id);

CREATE UNIQUE INDEX idx_event_attendance_event_occurrence ON public.event_attendance USING btree (event_id, COALESCE(occurrence_date, '1900-01-01'::date));

CREATE INDEX idx_event_attendance_occurrence_date ON public.event_attendance USING btree (occurrence_date);

CREATE INDEX idx_event_comments_event_id ON public.event_comments USING btree (event_id);

CREATE INDEX idx_event_comments_event_occurrence ON public.event_comments USING btree (event_id, occurrence_date);

CREATE INDEX idx_event_invitations_occurrence_date ON public.event_invitations USING btree (event_id, occurrence_date);

CREATE INDEX idx_event_waitlist_event ON public.event_waitlist USING btree (event_id, occurrence_date, "position");

CREATE INDEX idx_events_club_date ON public.events USING btree (club_id, start_date);

CREATE INDEX idx_events_invitation_send_at ON public.events USING btree (invitation_send_at) WHERE (invitation_send_at IS NOT NULL);

CREATE INDEX idx_events_repeat_type ON public.events USING btree (repeat_type) WHERE (repeat_type IS NOT NULL);

CREATE INDEX idx_exercise_example_videos_club ON public.exercise_example_videos USING btree (club_id);

CREATE INDEX idx_exercise_example_videos_exercise ON public.exercise_example_videos USING btree (exercise_id);

CREATE INDEX idx_exercise_records_exercise ON public.exercise_records USING btree (exercise_id);

CREATE INDEX idx_exercise_records_partner ON public.exercise_records USING btree (partner_id) WHERE (partner_id IS NOT NULL);

CREATE UNIQUE INDEX idx_exercise_records_unique ON public.exercise_records USING btree (user_id, exercise_id, play_mode, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX idx_exercise_records_user ON public.exercise_records USING btree (user_id);

CREATE INDEX idx_exercises_club_id ON public.exercises USING btree (club_id);

CREATE INDEX idx_exercises_image_url ON public.exercises USING btree (image_url) WHERE (image_url IS NOT NULL);

CREATE INDEX idx_exercises_visibility ON public.exercises USING btree (visibility);

CREATE INDEX idx_friendships_addressee ON public.friendships USING btree (addressee_id);

CREATE INDEX idx_friendships_both_users ON public.friendships USING btree (requester_id, addressee_id);

CREATE INDEX idx_friendships_requester ON public.friendships USING btree (requester_id);

CREATE INDEX idx_friendships_status ON public.friendships USING btree (status);

CREATE INDEX idx_guardian_event_responses_event ON public.guardian_event_responses USING btree (event_id, occurrence_date);

CREATE INDEX idx_guardian_event_responses_guardian ON public.guardian_event_responses USING btree (guardian_id);

CREATE INDEX idx_guardian_links_child_id ON public.guardian_links USING btree (child_id);

CREATE INDEX idx_guardian_links_guardian_id ON public.guardian_links USING btree (guardian_id);

CREATE INDEX idx_h2h_player_a ON public.head_to_head_stats USING btree (player_a_id);

CREATE INDEX idx_h2h_player_b ON public.head_to_head_stats USING btree (player_b_id);

CREATE INDEX idx_h2h_players ON public.head_to_head_stats USING btree (player_a_id, player_b_id);

CREATE INDEX idx_hidden_content_lookup ON public.hidden_content USING btree (user_id, content_type, content_id);

CREATE INDEX idx_hidden_content_user ON public.hidden_content USING btree (user_id);

CREATE INDEX idx_invitation_codes_sport ON public.invitation_codes USING btree (sport_id);

CREATE INDEX idx_leave_club_requests_sport ON public.leave_club_requests USING btree (sport_id);

CREATE INDEX idx_match_media_match ON public.match_media USING btree (match_id, match_type);

CREATE INDEX idx_match_media_uploaded_by ON public.match_media USING btree (uploaded_by);

CREATE INDEX idx_match_requests_tournament_match ON public.match_requests USING btree (tournament_match_id);

CREATE INDEX idx_matches_club ON public.matches USING btree (club_id);

CREATE INDEX idx_matches_handicap_used ON public.matches USING btree (handicap_used) WHERE (handicap_used = true);

CREATE INDEX idx_matches_match_mode ON public.matches USING btree (match_mode);

CREATE INDEX idx_matches_players ON public.matches USING btree (player_a_id, player_b_id);

CREATE INDEX idx_matches_sport ON public.matches USING btree (sport_id);

CREATE INDEX idx_matches_tournament_match ON public.matches USING btree (tournament_match_id) WHERE (tournament_match_id IS NOT NULL);

CREATE INDEX idx_ml_data_consent_user ON public.ml_data_consent USING btree (user_id);

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);

CREATE INDEX idx_pin_attempts_username ON public.child_pin_attempts USING btree (username, attempted_at);

CREATE INDEX idx_points_history_timestamp ON public.points_history USING btree ("timestamp" DESC);

CREATE INDEX idx_points_history_user ON public.points_history USING btree (user_id);

CREATE INDEX idx_poll_votes_poll_id ON public.poll_votes USING btree (poll_id);

CREATE INDEX idx_poll_votes_user_id ON public.poll_votes USING btree (user_id);

CREATE INDEX idx_post_comments_created_at ON public.post_comments USING btree (created_at DESC);

CREATE INDEX idx_post_comments_poll_id ON public.post_comments USING btree (poll_id);

CREATE INDEX idx_post_comments_post_id ON public.post_comments USING btree (post_id);

CREATE INDEX idx_post_comments_user_id ON public.post_comments USING btree (user_id);

CREATE INDEX idx_post_likes_post_id ON public.post_likes USING btree (post_id);

CREATE INDEX idx_post_likes_user_id ON public.post_likes USING btree (user_id);

CREATE INDEX idx_profile_club_sports_club ON public.profile_club_sports USING btree (club_id);

CREATE INDEX idx_profile_club_sports_club_sport ON public.profile_club_sports USING btree (club_id, sport_id);

CREATE INDEX idx_profile_club_sports_role ON public.profile_club_sports USING btree (role);

CREATE INDEX idx_profile_club_sports_sport ON public.profile_club_sports USING btree (sport_id);

CREATE INDEX idx_profile_club_sports_user ON public.profile_club_sports USING btree (user_id);

CREATE INDEX idx_profile_club_sports_user_sport ON public.profile_club_sports USING btree (user_id, sport_id);

CREATE INDEX idx_profiles_active_sport ON public.profiles USING btree (active_sport_id);

CREATE INDEX idx_profiles_club ON public.profiles USING btree (club_id);

CREATE INDEX idx_profiles_is_guardian ON public.profiles USING btree (is_guardian) WHERE (is_guardian = true);

CREATE INDEX idx_profiles_matches_played ON public.profiles USING btree (matches_played);

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

CREATE INDEX idx_profiles_tutorial_completed ON public.profiles USING gin (tutorial_completed);

CREATE INDEX idx_profiles_username ON public.profiles USING btree (username) WHERE (username IS NOT NULL);

CREATE INDEX idx_push_logs_created_at ON public.push_notification_logs USING btree (created_at DESC);

CREATE INDEX idx_push_logs_status ON public.push_notification_logs USING btree (status);

CREATE INDEX idx_push_logs_user_id ON public.push_notification_logs USING btree (user_id);

CREATE INDEX idx_push_subscriptions_active ON public.push_subscriptions USING btree (is_active) WHERE (is_active = true);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

CREATE INDEX idx_seasons_active ON public.seasons USING btree (is_active);

CREATE INDEX idx_seasons_club ON public.seasons USING btree (club_id);

CREATE INDEX idx_seasons_club_sport ON public.seasons USING btree (club_id, sport_id);

CREATE INDEX idx_seasons_dates ON public.seasons USING btree (start_date, end_date);

CREATE INDEX idx_seasons_sport ON public.seasons USING btree (sport_id);

CREATE INDEX idx_subgroups_is_default ON public.subgroups USING btree (is_default);

CREATE INDEX idx_tournament_matches_bracket_type ON public.tournament_matches USING btree (tournament_id, bracket_type);

CREATE INDEX idx_tournament_matches_deadline ON public.tournament_matches USING btree (deadline) WHERE (status = 'pending'::public.tournament_match_status);

CREATE INDEX idx_tournament_matches_players ON public.tournament_matches USING btree (player_a_id, player_b_id);

CREATE INDEX idx_tournament_matches_round ON public.tournament_matches USING btree (round_id);

CREATE INDEX idx_tournament_matches_status ON public.tournament_matches USING btree (status);

CREATE INDEX idx_tournament_matches_tournament ON public.tournament_matches USING btree (tournament_id);

CREATE INDEX idx_tournament_participants_player ON public.tournament_participants USING btree (player_id);

CREATE INDEX idx_tournament_participants_rank ON public.tournament_participants USING btree (tournament_id, final_rank);

CREATE INDEX idx_tournament_participants_tournament ON public.tournament_participants USING btree (tournament_id);

CREATE INDEX idx_tournament_rounds_number ON public.tournament_rounds USING btree (tournament_id, round_number);

CREATE INDEX idx_tournament_rounds_tournament ON public.tournament_rounds USING btree (tournament_id);

CREATE INDEX idx_tournament_standings_player ON public.tournament_standings USING btree (player_id);

CREATE INDEX idx_tournament_standings_rank ON public.tournament_standings USING btree (tournament_id, rank);

CREATE INDEX idx_tournament_standings_round ON public.tournament_standings USING btree (round_id);

CREATE INDEX idx_tournament_standings_tournament ON public.tournament_standings USING btree (tournament_id);

CREATE INDEX idx_tournaments_club ON public.tournaments USING btree (club_id);

CREATE INDEX idx_tournaments_created_by ON public.tournaments USING btree (created_by);

CREATE INDEX idx_tournaments_join_code ON public.tournaments USING btree (join_code) WHERE (join_code IS NOT NULL);

CREATE INDEX idx_tournaments_sport ON public.tournaments USING btree (sport_id);

CREATE INDEX idx_tournaments_status ON public.tournaments USING btree (status);

CREATE INDEX idx_training_sessions_club_date ON public.training_sessions USING btree (club_id, date);

CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id);

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences USING btree (user_id);

CREATE INDEX idx_user_season_points_season ON public.user_season_points USING btree (season_id);

CREATE INDEX idx_user_season_points_user ON public.user_season_points USING btree (user_id);

CREATE INDEX idx_user_season_points_user_season ON public.user_season_points USING btree (user_id, season_id);

CREATE INDEX idx_user_sport_stats_elo ON public.user_sport_stats USING btree (sport_id, elo_rating DESC);

CREATE INDEX idx_user_sport_stats_matches ON public.user_sport_stats USING btree (sport_id, matches_played);

CREATE INDEX idx_user_sport_stats_sport ON public.user_sport_stats USING btree (sport_id);

CREATE INDEX idx_user_sport_stats_user ON public.user_sport_stats USING btree (user_id);

CREATE INDEX idx_video_ai_analyses_status ON public.video_ai_analyses USING btree (status) WHERE (status <> 'completed'::text);

CREATE INDEX idx_video_ai_analyses_type ON public.video_ai_analyses USING btree (video_id, analysis_type);

CREATE INDEX idx_video_ai_analyses_video ON public.video_ai_analyses USING btree (video_id);

CREATE INDEX idx_video_ai_frames_analysis ON public.video_ai_frames USING btree (analysis_id);

CREATE INDEX idx_video_ai_frames_time ON public.video_ai_frames USING btree (video_id, timestamp_seconds);

CREATE INDEX idx_video_analyses_ai_training ON public.video_analyses USING btree (allow_ai_training) WHERE (allow_ai_training = true);

CREATE INDEX idx_video_analyses_club ON public.video_analyses USING btree (club_id);

CREATE INDEX idx_video_analyses_created ON public.video_analyses USING btree (created_at DESC);

CREATE INDEX idx_video_analyses_exercise ON public.video_analyses USING btree (exercise_id);

CREATE INDEX idx_video_analyses_is_reference ON public.video_analyses USING btree (is_reference) WHERE (is_reference = true);

CREATE INDEX idx_video_analyses_pending_labeling ON public.video_analyses USING btree (allow_ai_training, ai_ready) WHERE ((allow_ai_training = true) AND (ai_ready = false));

CREATE INDEX idx_video_analyses_rally_markers ON public.video_analyses USING gin (rally_markers) WHERE (rally_markers IS NOT NULL);

CREATE INDEX idx_video_analyses_uploaded_by ON public.video_analyses USING btree (uploaded_by);

CREATE INDEX idx_video_analyses_video_type ON public.video_analyses USING btree (video_type);

CREATE INDEX idx_video_assignments_club ON public.video_assignments USING btree (club_id);

CREATE INDEX idx_video_assignments_player ON public.video_assignments USING btree (player_id);

CREATE INDEX idx_video_assignments_status ON public.video_assignments USING btree (status);

CREATE INDEX idx_video_assignments_video ON public.video_assignments USING btree (video_id);

CREATE INDEX idx_video_comments_club ON public.video_comments USING btree (club_id);

CREATE INDEX idx_video_comments_parent ON public.video_comments USING btree (parent_id);

CREATE INDEX idx_video_comments_timestamp ON public.video_comments USING btree (video_id, timestamp_seconds);

CREATE INDEX idx_video_comments_video ON public.video_comments USING btree (video_id);

CREATE INDEX idx_video_labels_club ON public.video_labels USING btree (club_id);

CREATE INDEX idx_video_labels_event_type ON public.video_labels USING btree (event_type);

CREATE INDEX idx_video_labels_exported ON public.video_labels USING btree (exported_for_training) WHERE (exported_for_training = false);

CREATE INDEX idx_video_labels_positions ON public.video_labels USING btree (shot_from, shot_to);

CREATE INDEX idx_video_labels_result ON public.video_labels USING btree (shot_result);

CREATE INDEX idx_video_labels_shot_type ON public.video_labels USING btree (shot_type);

CREATE INDEX idx_video_labels_timestamp ON public.video_labels USING btree (video_id, timestamp_start);

CREATE INDEX idx_video_labels_verified ON public.video_labels USING btree (is_verified) WHERE (is_verified = true);

CREATE INDEX idx_video_labels_video ON public.video_labels USING btree (video_id);

CREATE INDEX idx_video_ml_metadata_suitable ON public.video_ml_metadata USING btree (suitable_for_training) WHERE (suitable_for_training = true);

CREATE INDEX idx_video_ml_metadata_video ON public.video_ml_metadata USING btree (video_id);

CREATE INDEX idx_video_rally_segments_time ON public.video_rally_segments USING btree (video_id, start_time);

CREATE INDEX idx_video_rally_segments_video ON public.video_rally_segments USING btree (video_id);

CREATE INDEX idx_xp_history_user ON public.xp_history USING btree (user_id);

CREATE UNIQUE INDEX invitation_codes_code_key ON public.invitation_codes USING btree (code);

CREATE UNIQUE INDEX invitation_codes_pkey ON public.invitation_codes USING btree (id);

CREATE UNIQUE INDEX leave_club_requests_pkey ON public.leave_club_requests USING btree (id);

CREATE UNIQUE INDEX match_media_file_path_key ON public.match_media USING btree (file_path);

CREATE UNIQUE INDEX match_media_pkey ON public.match_media USING btree (id);

CREATE UNIQUE INDEX match_proposals_pkey ON public.match_proposals USING btree (id);

CREATE UNIQUE INDEX match_requests_pkey ON public.match_requests USING btree (id);

CREATE UNIQUE INDEX matches_pkey ON public.matches USING btree (id);

CREATE UNIQUE INDEX ml_data_consent_pkey ON public.ml_data_consent USING btree (id);

CREATE UNIQUE INDEX ml_data_consent_user_id_key ON public.ml_data_consent USING btree (user_id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX points_history_pkey ON public.points_history USING btree (id);

CREATE UNIQUE INDEX poll_votes_pkey ON public.poll_votes USING btree (id);

CREATE UNIQUE INDEX poll_votes_poll_id_user_id_option_id_key ON public.poll_votes USING btree (poll_id, user_id, option_id);

CREATE UNIQUE INDEX post_comments_pkey ON public.post_comments USING btree (id);

CREATE UNIQUE INDEX post_likes_pkey ON public.post_likes USING btree (id);

CREATE UNIQUE INDEX post_likes_post_id_user_id_key ON public.post_likes USING btree (post_id, user_id);

CREATE UNIQUE INDEX profile_club_sports_pkey ON public.profile_club_sports USING btree (id);

CREATE UNIQUE INDEX profile_club_sports_user_id_club_id_sport_id_key ON public.profile_club_sports USING btree (user_id, club_id, sport_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (username) WHERE (username IS NOT NULL);

CREATE UNIQUE INDEX push_notification_logs_pkey ON public.push_notification_logs USING btree (id);

CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint);

CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id);

CREATE UNIQUE INDEX seasons_pkey ON public.seasons USING btree (id);

CREATE UNIQUE INDEX sports_name_key ON public.sports USING btree (name);

CREATE UNIQUE INDEX sports_pkey ON public.sports USING btree (id);

CREATE UNIQUE INDEX streaks_pkey ON public.streaks USING btree (id);

CREATE UNIQUE INDEX streaks_user_id_subgroup_id_key ON public.streaks USING btree (user_id, subgroup_id);

CREATE UNIQUE INDEX subgroup_members_pkey ON public.subgroup_members USING btree (subgroup_id, user_id);

CREATE UNIQUE INDEX subgroups_pkey ON public.subgroups USING btree (id);

CREATE UNIQUE INDEX tournament_matches_pkey ON public.tournament_matches USING btree (id);

CREATE UNIQUE INDEX tournament_participants_pkey ON public.tournament_participants USING btree (id);

CREATE UNIQUE INDEX tournament_participants_tournament_id_player_id_key ON public.tournament_participants USING btree (tournament_id, player_id);

CREATE UNIQUE INDEX tournament_rounds_pkey ON public.tournament_rounds USING btree (id);

CREATE UNIQUE INDEX tournament_rounds_tournament_id_round_number_group_name_key ON public.tournament_rounds USING btree (tournament_id, round_number, group_name);

CREATE UNIQUE INDEX tournament_standings_pkey ON public.tournament_standings USING btree (id);

CREATE UNIQUE INDEX tournament_standings_tournament_id_round_id_player_id_key ON public.tournament_standings USING btree (tournament_id, round_id, player_id);

CREATE UNIQUE INDEX tournaments_join_code_key ON public.tournaments USING btree (join_code);

CREATE UNIQUE INDEX tournaments_pkey ON public.tournaments USING btree (id);

CREATE UNIQUE INDEX training_sessions_pkey ON public.training_sessions USING btree (id);

CREATE UNIQUE INDEX unique_block ON public.user_blocks USING btree (blocker_id, blocked_id);

CREATE UNIQUE INDEX unique_event_user_occurrence ON public.event_invitations USING btree (event_id, user_id, occurrence_date);

CREATE UNIQUE INDEX unique_friendship ON public.friendships USING btree (requester_id, addressee_id);

CREATE UNIQUE INDEX unique_hidden_content ON public.hidden_content USING btree (user_id, content_type, content_id);

CREATE UNIQUE INDEX unique_report ON public.content_reports USING btree (reporter_id, content_type, content_id);

CREATE UNIQUE INDEX user_blocks_pkey ON public.user_blocks USING btree (id);

CREATE UNIQUE INDEX user_preferences_pkey ON public.user_preferences USING btree (user_id);

CREATE UNIQUE INDEX user_season_points_pkey ON public.user_season_points USING btree (id);

CREATE UNIQUE INDEX user_season_points_user_id_season_id_key ON public.user_season_points USING btree (user_id, season_id);

CREATE UNIQUE INDEX user_sport_stats_pkey ON public.user_sport_stats USING btree (id);

CREATE UNIQUE INDEX user_sport_stats_user_id_sport_id_key ON public.user_sport_stats USING btree (user_id, sport_id);

CREATE UNIQUE INDEX video_ai_analyses_pkey ON public.video_ai_analyses USING btree (id);

CREATE UNIQUE INDEX video_ai_frames_pkey ON public.video_ai_frames USING btree (id);

CREATE UNIQUE INDEX video_analyses_pkey ON public.video_analyses USING btree (id);

CREATE UNIQUE INDEX video_assignments_pkey ON public.video_assignments USING btree (id);

CREATE UNIQUE INDEX video_assignments_video_id_player_id_key ON public.video_assignments USING btree (video_id, player_id);

CREATE UNIQUE INDEX video_comments_pkey ON public.video_comments USING btree (id);

CREATE UNIQUE INDEX video_labels_pkey ON public.video_labels USING btree (id);

CREATE UNIQUE INDEX video_ml_metadata_pkey ON public.video_ml_metadata USING btree (id);

CREATE UNIQUE INDEX video_ml_metadata_video_id_key ON public.video_ml_metadata USING btree (video_id);

CREATE UNIQUE INDEX video_rally_segments_pkey ON public.video_rally_segments USING btree (id);

CREATE UNIQUE INDEX xp_history_pkey ON public.xp_history USING btree (id);

alter table "public"."activity_comments" add constraint "activity_comments_pkey" PRIMARY KEY using index "activity_comments_pkey";

alter table "public"."activity_events" add constraint "activity_events_pkey" PRIMARY KEY using index "activity_events_pkey";

alter table "public"."activity_likes" add constraint "activity_likes_pkey" PRIMARY KEY using index "activity_likes_pkey";

alter table "public"."attendance" add constraint "attendance_pkey" PRIMARY KEY using index "attendance_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."challenges" add constraint "challenges_pkey" PRIMARY KEY using index "challenges_pkey";

alter table "public"."chat_conversations" add constraint "chat_conversations_pkey" PRIMARY KEY using index "chat_conversations_pkey";

alter table "public"."chat_messages" add constraint "chat_messages_pkey" PRIMARY KEY using index "chat_messages_pkey";

alter table "public"."chat_participants" add constraint "chat_participants_pkey" PRIMARY KEY using index "chat_participants_pkey";

alter table "public"."child_login_codes" add constraint "child_login_codes_pkey" PRIMARY KEY using index "child_login_codes_pkey";

alter table "public"."child_pin_attempts" add constraint "child_pin_attempts_pkey" PRIMARY KEY using index "child_pin_attempts_pkey";

alter table "public"."child_sessions" add constraint "child_sessions_pkey" PRIMARY KEY using index "child_sessions_pkey";

alter table "public"."club_requests" add constraint "club_requests_pkey" PRIMARY KEY using index "club_requests_pkey";

alter table "public"."club_sports" add constraint "club_sports_pkey" PRIMARY KEY using index "club_sports_pkey";

alter table "public"."clubs" add constraint "clubs_pkey" PRIMARY KEY using index "clubs_pkey";

alter table "public"."community_polls" add constraint "community_polls_pkey" PRIMARY KEY using index "community_polls_pkey";

alter table "public"."community_posts" add constraint "community_posts_pkey" PRIMARY KEY using index "community_posts_pkey";

alter table "public"."completed_challenges" add constraint "completed_challenges_pkey" PRIMARY KEY using index "completed_challenges_pkey";

alter table "public"."completed_exercises" add constraint "completed_exercises_pkey" PRIMARY KEY using index "completed_exercises_pkey";

alter table "public"."config" add constraint "config_pkey" PRIMARY KEY using index "config_pkey";

alter table "public"."content_reports" add constraint "content_reports_pkey" PRIMARY KEY using index "content_reports_pkey";

alter table "public"."doubles_match_requests" add constraint "doubles_match_requests_pkey" PRIMARY KEY using index "doubles_match_requests_pkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_pkey" PRIMARY KEY using index "doubles_matches_pkey";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_pkey" PRIMARY KEY using index "doubles_pairings_pkey";

alter table "public"."elo_sport_config" add constraint "elo_sport_config_pkey" PRIMARY KEY using index "elo_sport_config_pkey";

alter table "public"."event_attendance" add constraint "event_attendance_pkey" PRIMARY KEY using index "event_attendance_pkey";

alter table "public"."event_comments" add constraint "event_comments_pkey" PRIMARY KEY using index "event_comments_pkey";

alter table "public"."event_invitations" add constraint "event_invitations_pkey" PRIMARY KEY using index "event_invitations_pkey";

alter table "public"."event_waitlist" add constraint "event_waitlist_pkey" PRIMARY KEY using index "event_waitlist_pkey";

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY using index "events_pkey";

alter table "public"."exercise_example_videos" add constraint "exercise_example_videos_pkey" PRIMARY KEY using index "exercise_example_videos_pkey";

alter table "public"."exercise_milestones" add constraint "exercise_milestones_pkey" PRIMARY KEY using index "exercise_milestones_pkey";

alter table "public"."exercise_records" add constraint "exercise_records_pkey" PRIMARY KEY using index "exercise_records_pkey";

alter table "public"."exercises" add constraint "exercises_pkey" PRIMARY KEY using index "exercises_pkey";

alter table "public"."friendships" add constraint "friendships_pkey" PRIMARY KEY using index "friendships_pkey";

alter table "public"."guardian_consent_log" add constraint "guardian_consent_log_pkey" PRIMARY KEY using index "guardian_consent_log_pkey";

alter table "public"."guardian_event_responses" add constraint "guardian_event_responses_pkey" PRIMARY KEY using index "guardian_event_responses_pkey";

alter table "public"."guardian_links" add constraint "guardian_links_pkey" PRIMARY KEY using index "guardian_links_pkey";

alter table "public"."head_to_head_stats" add constraint "head_to_head_stats_pkey" PRIMARY KEY using index "head_to_head_stats_pkey";

alter table "public"."hidden_content" add constraint "hidden_content_pkey" PRIMARY KEY using index "hidden_content_pkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_pkey" PRIMARY KEY using index "invitation_codes_pkey";

alter table "public"."leave_club_requests" add constraint "leave_club_requests_pkey" PRIMARY KEY using index "leave_club_requests_pkey";

alter table "public"."match_media" add constraint "match_media_pkey" PRIMARY KEY using index "match_media_pkey";

alter table "public"."match_proposals" add constraint "match_proposals_pkey" PRIMARY KEY using index "match_proposals_pkey";

alter table "public"."match_requests" add constraint "match_requests_pkey" PRIMARY KEY using index "match_requests_pkey";

alter table "public"."matches" add constraint "matches_pkey" PRIMARY KEY using index "matches_pkey";

alter table "public"."ml_data_consent" add constraint "ml_data_consent_pkey" PRIMARY KEY using index "ml_data_consent_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."points_history" add constraint "points_history_pkey" PRIMARY KEY using index "points_history_pkey";

alter table "public"."poll_votes" add constraint "poll_votes_pkey" PRIMARY KEY using index "poll_votes_pkey";

alter table "public"."post_comments" add constraint "post_comments_pkey" PRIMARY KEY using index "post_comments_pkey";

alter table "public"."post_likes" add constraint "post_likes_pkey" PRIMARY KEY using index "post_likes_pkey";

alter table "public"."profile_club_sports" add constraint "profile_club_sports_pkey" PRIMARY KEY using index "profile_club_sports_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."push_notification_logs" add constraint "push_notification_logs_pkey" PRIMARY KEY using index "push_notification_logs_pkey";

alter table "public"."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY using index "push_subscriptions_pkey";

alter table "public"."seasons" add constraint "seasons_pkey" PRIMARY KEY using index "seasons_pkey";

alter table "public"."sports" add constraint "sports_pkey" PRIMARY KEY using index "sports_pkey";

alter table "public"."streaks" add constraint "streaks_pkey" PRIMARY KEY using index "streaks_pkey";

alter table "public"."subgroup_members" add constraint "subgroup_members_pkey" PRIMARY KEY using index "subgroup_members_pkey";

alter table "public"."subgroups" add constraint "subgroups_pkey" PRIMARY KEY using index "subgroups_pkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_pkey" PRIMARY KEY using index "tournament_matches_pkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_pkey" PRIMARY KEY using index "tournament_participants_pkey";

alter table "public"."tournament_rounds" add constraint "tournament_rounds_pkey" PRIMARY KEY using index "tournament_rounds_pkey";

alter table "public"."tournament_standings" add constraint "tournament_standings_pkey" PRIMARY KEY using index "tournament_standings_pkey";

alter table "public"."tournaments" add constraint "tournaments_pkey" PRIMARY KEY using index "tournaments_pkey";

alter table "public"."training_sessions" add constraint "training_sessions_pkey" PRIMARY KEY using index "training_sessions_pkey";

alter table "public"."user_blocks" add constraint "user_blocks_pkey" PRIMARY KEY using index "user_blocks_pkey";

alter table "public"."user_preferences" add constraint "user_preferences_pkey" PRIMARY KEY using index "user_preferences_pkey";

alter table "public"."user_season_points" add constraint "user_season_points_pkey" PRIMARY KEY using index "user_season_points_pkey";

alter table "public"."user_sport_stats" add constraint "user_sport_stats_pkey" PRIMARY KEY using index "user_sport_stats_pkey";

alter table "public"."video_ai_analyses" add constraint "video_ai_analyses_pkey" PRIMARY KEY using index "video_ai_analyses_pkey";

alter table "public"."video_ai_frames" add constraint "video_ai_frames_pkey" PRIMARY KEY using index "video_ai_frames_pkey";

alter table "public"."video_analyses" add constraint "video_analyses_pkey" PRIMARY KEY using index "video_analyses_pkey";

alter table "public"."video_assignments" add constraint "video_assignments_pkey" PRIMARY KEY using index "video_assignments_pkey";

alter table "public"."video_comments" add constraint "video_comments_pkey" PRIMARY KEY using index "video_comments_pkey";

alter table "public"."video_labels" add constraint "video_labels_pkey" PRIMARY KEY using index "video_labels_pkey";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_pkey" PRIMARY KEY using index "video_ml_metadata_pkey";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_pkey" PRIMARY KEY using index "video_rally_segments_pkey";

alter table "public"."xp_history" add constraint "xp_history_pkey" PRIMARY KEY using index "xp_history_pkey";

alter table "public"."activity_comments" add constraint "activity_comments_activity_type_check" CHECK ((activity_type = ANY (ARRAY['singles_match'::text, 'doubles_match'::text, 'post'::text, 'poll'::text, 'event'::text, 'rank_up'::text, 'club_join'::text]))) not valid;

alter table "public"."activity_comments" validate constraint "activity_comments_activity_type_check";

alter table "public"."activity_comments" add constraint "activity_comments_content_check" CHECK (((length(content) > 0) AND (length(content) <= 2000))) not valid;

alter table "public"."activity_comments" validate constraint "activity_comments_content_check";

alter table "public"."activity_comments" add constraint "activity_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activity_comments" validate constraint "activity_comments_user_id_fkey";

alter table "public"."activity_events" add constraint "activity_events_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."activity_events" validate constraint "activity_events_club_id_fkey";

alter table "public"."activity_events" add constraint "activity_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activity_events" validate constraint "activity_events_user_id_fkey";

alter table "public"."activity_events" add constraint "valid_event_type" CHECK ((event_type = ANY (ARRAY['club_join'::text, 'club_leave'::text, 'rank_up'::text, 'milestone'::text, 'achievement'::text, 'club_ranking_change'::text, 'global_ranking_change'::text, 'club_doubles_ranking_change'::text, 'global_doubles_ranking_change'::text, 'tournament_completed'::text]))) not valid;

alter table "public"."activity_events" validate constraint "valid_event_type";

alter table "public"."activity_likes" add constraint "activity_likes_activity_id_activity_type_user_id_key" UNIQUE using index "activity_likes_activity_id_activity_type_user_id_key";

alter table "public"."activity_likes" add constraint "activity_likes_activity_type_check" CHECK ((activity_type = ANY (ARRAY['singles_match'::text, 'doubles_match'::text, 'post'::text, 'poll'::text, 'event'::text, 'rank_up'::text, 'club_join'::text]))) not valid;

alter table "public"."activity_likes" validate constraint "activity_likes_activity_type_check";

alter table "public"."activity_likes" add constraint "activity_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activity_likes" validate constraint "activity_likes_user_id_fkey";

alter table "public"."attendance" add constraint "attendance_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."attendance" validate constraint "attendance_club_id_fkey";

alter table "public"."attendance" add constraint "attendance_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) not valid;

alter table "public"."attendance" validate constraint "attendance_recorded_by_fkey";

alter table "public"."attendance" add constraint "attendance_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."attendance" validate constraint "attendance_session_id_fkey";

alter table "public"."attendance" add constraint "attendance_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE SET NULL not valid;

alter table "public"."attendance" validate constraint "attendance_subgroup_id_fkey";

alter table "public"."attendance" add constraint "attendance_user_id_date_subgroup_id_key" UNIQUE using index "attendance_user_id_date_subgroup_id_key";

alter table "public"."attendance" add constraint "attendance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."attendance" validate constraint "attendance_user_id_fkey";

alter table "public"."audit_logs" add constraint "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_actor_id_fkey";

alter table "public"."audit_logs" add constraint "audit_logs_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_club_id_fkey";

alter table "public"."audit_logs" add constraint "audit_logs_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_sport_id_fkey";

alter table "public"."challenges" add constraint "challenges_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."challenges" validate constraint "challenges_club_id_fkey";

alter table "public"."challenges" add constraint "challenges_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."challenges" validate constraint "challenges_created_by_fkey";

alter table "public"."challenges" add constraint "challenges_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."challenges" validate constraint "challenges_sport_id_fkey";

alter table "public"."challenges" add constraint "challenges_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE SET NULL not valid;

alter table "public"."challenges" validate constraint "challenges_subgroup_id_fkey";

alter table "public"."chat_conversations" add constraint "chat_conversations_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."chat_conversations" validate constraint "chat_conversations_club_id_fkey";

alter table "public"."chat_conversations" add constraint "chat_conversations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."chat_conversations" validate constraint "chat_conversations_created_by_fkey";

alter table "public"."chat_conversations" add constraint "chat_conversations_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE SET NULL not valid;

alter table "public"."chat_conversations" validate constraint "chat_conversations_subgroup_id_fkey";

alter table "public"."chat_conversations" add constraint "chat_conversations_type_check" CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text]))) not valid;

alter table "public"."chat_conversations" validate constraint "chat_conversations_type_check";

alter table "public"."chat_messages" add constraint "chat_messages_content_check" CHECK ((char_length(content) <= 5000)) not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_content_check";

alter table "public"."chat_messages" add constraint "chat_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_conversation_id_fkey";

alter table "public"."chat_messages" add constraint "chat_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_sender_id_fkey";

alter table "public"."chat_participants" add constraint "chat_participants_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE not valid;

alter table "public"."chat_participants" validate constraint "chat_participants_conversation_id_fkey";

alter table "public"."chat_participants" add constraint "chat_participants_conversation_id_user_id_key" UNIQUE using index "chat_participants_conversation_id_user_id_key";

alter table "public"."chat_participants" add constraint "chat_participants_role_check" CHECK ((role = ANY (ARRAY['member'::text, 'admin'::text]))) not valid;

alter table "public"."chat_participants" validate constraint "chat_participants_role_check";

alter table "public"."chat_participants" add constraint "chat_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."chat_participants" validate constraint "chat_participants_user_id_fkey";

alter table "public"."child_login_codes" add constraint "child_login_codes_child_id_fkey" FOREIGN KEY (child_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."child_login_codes" validate constraint "child_login_codes_child_id_fkey";

alter table "public"."child_login_codes" add constraint "child_login_codes_code_key" UNIQUE using index "child_login_codes_code_key";

alter table "public"."child_login_codes" add constraint "child_login_codes_guardian_id_fkey" FOREIGN KEY (guardian_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."child_login_codes" validate constraint "child_login_codes_guardian_id_fkey";

alter table "public"."child_sessions" add constraint "child_sessions_child_id_fkey" FOREIGN KEY (child_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."child_sessions" validate constraint "child_sessions_child_id_fkey";

alter table "public"."child_sessions" add constraint "child_sessions_session_token_key" UNIQUE using index "child_sessions_session_token_key";

alter table "public"."child_sessions" add constraint "valid_expiry" CHECK ((expires_at > created_at)) not valid;

alter table "public"."child_sessions" validate constraint "valid_expiry";

alter table "public"."club_requests" add constraint "club_requests_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."club_requests" validate constraint "club_requests_club_id_fkey";

alter table "public"."club_requests" add constraint "club_requests_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."club_requests" validate constraint "club_requests_player_id_fkey";

alter table "public"."club_requests" add constraint "club_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) not valid;

alter table "public"."club_requests" validate constraint "club_requests_reviewed_by_fkey";

alter table "public"."club_requests" add constraint "club_requests_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."club_requests" validate constraint "club_requests_sport_id_fkey";

alter table "public"."club_requests" add constraint "valid_request_type" CHECK ((request_type = ANY (ARRAY['member'::text, 'guardian'::text]))) not valid;

alter table "public"."club_requests" validate constraint "valid_request_type";

alter table "public"."club_sports" add constraint "club_sports_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."club_sports" validate constraint "club_sports_club_id_fkey";

alter table "public"."club_sports" add constraint "club_sports_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."club_sports" validate constraint "club_sports_sport_id_fkey";

alter table "public"."community_polls" add constraint "community_polls_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."community_polls" validate constraint "community_polls_club_id_fkey";

alter table "public"."community_polls" add constraint "community_polls_question_check" CHECK ((char_length(question) <= 500)) not valid;

alter table "public"."community_polls" validate constraint "community_polls_question_check";

alter table "public"."community_polls" add constraint "community_polls_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."community_polls" validate constraint "community_polls_user_id_fkey";

alter table "public"."community_polls" add constraint "community_polls_visibility_check" CHECK ((visibility = ANY (ARRAY['public'::text, 'followers'::text, 'club'::text]))) not valid;

alter table "public"."community_polls" validate constraint "community_polls_visibility_check";

alter table "public"."community_posts" add constraint "community_posts_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."community_posts" validate constraint "community_posts_club_id_fkey";

alter table "public"."community_posts" add constraint "community_posts_content_check" CHECK ((char_length(content) <= 5000)) not valid;

alter table "public"."community_posts" validate constraint "community_posts_content_check";

alter table "public"."community_posts" add constraint "community_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."community_posts" validate constraint "community_posts_user_id_fkey";

alter table "public"."community_posts" add constraint "community_posts_visibility_check" CHECK ((visibility = ANY (ARRAY['public'::text, 'followers'::text, 'club'::text]))) not valid;

alter table "public"."community_posts" validate constraint "community_posts_visibility_check";

alter table "public"."completed_challenges" add constraint "completed_challenges_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE not valid;

alter table "public"."completed_challenges" validate constraint "completed_challenges_challenge_id_fkey";

alter table "public"."completed_challenges" add constraint "completed_challenges_user_id_challenge_id_key" UNIQUE using index "completed_challenges_user_id_challenge_id_key";

alter table "public"."completed_challenges" add constraint "completed_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."completed_challenges" validate constraint "completed_challenges_user_id_fkey";

alter table "public"."completed_exercises" add constraint "completed_exercises_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE not valid;

alter table "public"."completed_exercises" validate constraint "completed_exercises_exercise_id_fkey";

alter table "public"."completed_exercises" add constraint "completed_exercises_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."completed_exercises" validate constraint "completed_exercises_partner_id_fkey";

alter table "public"."completed_exercises" add constraint "completed_exercises_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."completed_exercises" validate constraint "completed_exercises_user_id_fkey";

alter table "public"."content_reports" add constraint "content_reports_description_check" CHECK ((char_length(description) <= 1000)) not valid;

alter table "public"."content_reports" validate constraint "content_reports_description_check";

alter table "public"."content_reports" add constraint "content_reports_reported_user_id_fkey" FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."content_reports" validate constraint "content_reports_reported_user_id_fkey";

alter table "public"."content_reports" add constraint "content_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."content_reports" validate constraint "content_reports_reporter_id_fkey";

alter table "public"."content_reports" add constraint "content_reports_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."content_reports" validate constraint "content_reports_reviewed_by_fkey";

alter table "public"."content_reports" add constraint "unique_report" UNIQUE using index "unique_report";

alter table "public"."doubles_match_requests" add constraint "doubles_match_requests_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_match_requests" validate constraint "doubles_match_requests_club_id_fkey";

alter table "public"."doubles_match_requests" add constraint "doubles_match_requests_initiated_by_fkey" FOREIGN KEY (initiated_by) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_match_requests" validate constraint "doubles_match_requests_initiated_by_fkey";

alter table "public"."doubles_match_requests" add constraint "doubles_match_requests_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_match_requests" validate constraint "doubles_match_requests_sport_id_fkey";

alter table "public"."doubles_match_requests" add constraint "doubles_match_requests_winning_team_check" CHECK ((winning_team = ANY (ARRAY['A'::text, 'B'::text]))) not valid;

alter table "public"."doubles_match_requests" validate constraint "doubles_match_requests_winning_team_check";

alter table "public"."doubles_matches" add constraint "doubles_matches_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_approved_by_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_club_id_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_created_by_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_requested_by_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_sport_id_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_team_a_player1_id_fkey" FOREIGN KEY (team_a_player1_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_team_a_player1_id_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_team_a_player2_id_fkey" FOREIGN KEY (team_a_player2_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_team_a_player2_id_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_team_b_player1_id_fkey" FOREIGN KEY (team_b_player1_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_team_b_player1_id_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_team_b_player2_id_fkey" FOREIGN KEY (team_b_player2_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_team_b_player2_id_fkey";

alter table "public"."doubles_matches" add constraint "doubles_matches_winning_team_check" CHECK ((winning_team = ANY (ARRAY['A'::text, 'B'::text]))) not valid;

alter table "public"."doubles_matches" validate constraint "doubles_matches_winning_team_check";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_pairings" validate constraint "doubles_pairings_club_id_fkey";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_player1_club_id_at_match_fkey" FOREIGN KEY (player1_club_id_at_match) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_pairings" validate constraint "doubles_pairings_player1_club_id_at_match_fkey";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_player1_id_fkey" FOREIGN KEY (player1_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_pairings" validate constraint "doubles_pairings_player1_id_fkey";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_player2_club_id_at_match_fkey" FOREIGN KEY (player2_club_id_at_match) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."doubles_pairings" validate constraint "doubles_pairings_player2_club_id_at_match_fkey";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_player2_id_fkey" FOREIGN KEY (player2_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."doubles_pairings" validate constraint "doubles_pairings_player2_id_fkey";

alter table "public"."doubles_pairings" add constraint "doubles_pairings_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) not valid;

alter table "public"."doubles_pairings" validate constraint "doubles_pairings_sport_id_fkey";

alter table "public"."elo_sport_config" add constraint "elo_sport_config_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."elo_sport_config" validate constraint "elo_sport_config_sport_id_fkey";

alter table "public"."elo_sport_config" add constraint "elo_sport_config_sport_key_key" UNIQUE using index "elo_sport_config_sport_key_key";

alter table "public"."event_attendance" add constraint "event_attendance_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."event_attendance" validate constraint "event_attendance_event_id_fkey";

alter table "public"."event_comments" add constraint "event_comments_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."event_comments" validate constraint "event_comments_event_id_fkey";

alter table "public"."event_comments" add constraint "event_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."event_comments" validate constraint "event_comments_user_id_fkey";

alter table "public"."event_invitations" add constraint "event_invitations_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."event_invitations" validate constraint "event_invitations_event_id_fkey";

alter table "public"."event_invitations" add constraint "event_invitations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."event_invitations" validate constraint "event_invitations_user_id_fkey";

alter table "public"."event_invitations" add constraint "unique_event_user_occurrence" UNIQUE using index "unique_event_user_occurrence";

alter table "public"."event_waitlist" add constraint "event_waitlist_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."event_waitlist" validate constraint "event_waitlist_event_id_fkey";

alter table "public"."event_waitlist" add constraint "event_waitlist_event_id_occurrence_date_user_id_key" UNIQUE using index "event_waitlist_event_id_occurrence_date_user_id_key";

alter table "public"."event_waitlist" add constraint "event_waitlist_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."event_waitlist" validate constraint "event_waitlist_user_id_fkey";

alter table "public"."events" add constraint "events_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) not valid;

alter table "public"."events" validate constraint "events_club_id_fkey";

alter table "public"."events" add constraint "events_organizer_id_fkey" FOREIGN KEY (organizer_id) REFERENCES public.profiles(id) not valid;

alter table "public"."events" validate constraint "events_organizer_id_fkey";

alter table "public"."exercise_example_videos" add constraint "exercise_example_videos_added_by_fkey" FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_example_videos" validate constraint "exercise_example_videos_added_by_fkey";

alter table "public"."exercise_example_videos" add constraint "exercise_example_videos_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_example_videos" validate constraint "exercise_example_videos_club_id_fkey";

alter table "public"."exercise_example_videos" add constraint "exercise_example_videos_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_example_videos" validate constraint "exercise_example_videos_exercise_id_fkey";

alter table "public"."exercise_example_videos" add constraint "exercise_example_videos_exercise_id_video_id_key" UNIQUE using index "exercise_example_videos_exercise_id_video_id_key";

alter table "public"."exercise_example_videos" add constraint "exercise_example_videos_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_example_videos" validate constraint "exercise_example_videos_video_id_fkey";

alter table "public"."exercise_milestones" add constraint "exercise_milestones_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_milestones" validate constraint "exercise_milestones_exercise_id_fkey";

alter table "public"."exercise_milestones" add constraint "exercise_milestones_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."exercise_milestones" validate constraint "exercise_milestones_partner_id_fkey";

alter table "public"."exercise_milestones" add constraint "exercise_milestones_user_exercise_unique" UNIQUE using index "exercise_milestones_user_exercise_unique";

alter table "public"."exercise_milestones" add constraint "exercise_milestones_user_id_exercise_id_key" UNIQUE using index "exercise_milestones_user_id_exercise_id_key";

alter table "public"."exercise_milestones" add constraint "exercise_milestones_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_milestones" validate constraint "exercise_milestones_user_id_fkey";

alter table "public"."exercise_records" add constraint "exercise_records_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_records" validate constraint "exercise_records_exercise_id_fkey";

alter table "public"."exercise_records" add constraint "exercise_records_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."exercise_records" validate constraint "exercise_records_partner_id_fkey";

alter table "public"."exercise_records" add constraint "exercise_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_records" validate constraint "exercise_records_user_id_fkey";

alter table "public"."exercises" add constraint "exercises_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) not valid;

alter table "public"."exercises" validate constraint "exercises_club_id_fkey";

alter table "public"."exercises" add constraint "exercises_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."exercises" validate constraint "exercises_created_by_fkey";

alter table "public"."exercises" add constraint "exercises_record_holder_club_id_fkey" FOREIGN KEY (record_holder_club_id) REFERENCES public.clubs(id) not valid;

alter table "public"."exercises" validate constraint "exercises_record_holder_club_id_fkey";

alter table "public"."exercises" add constraint "exercises_record_holder_id_fkey" FOREIGN KEY (record_holder_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."exercises" validate constraint "exercises_record_holder_id_fkey";

alter table "public"."exercises" add constraint "exercises_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."exercises" validate constraint "exercises_sport_id_fkey";

alter table "public"."friendships" add constraint "friendships_addressee_id_fkey" FOREIGN KEY (addressee_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."friendships" validate constraint "friendships_addressee_id_fkey";

alter table "public"."friendships" add constraint "friendships_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."friendships" validate constraint "friendships_requester_id_fkey";

alter table "public"."friendships" add constraint "no_self_friendship" CHECK ((requester_id <> addressee_id)) not valid;

alter table "public"."friendships" validate constraint "no_self_friendship";

alter table "public"."friendships" add constraint "unique_friendship" UNIQUE using index "unique_friendship";

alter table "public"."guardian_consent_log" add constraint "guardian_consent_log_child_id_fkey" FOREIGN KEY (child_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_consent_log" validate constraint "guardian_consent_log_child_id_fkey";

alter table "public"."guardian_consent_log" add constraint "guardian_consent_log_consent_type_check" CHECK ((consent_type = ANY (ARRAY['registration'::text, 'data_processing'::text, 'video_upload'::text, 'terms_update'::text]))) not valid;

alter table "public"."guardian_consent_log" validate constraint "guardian_consent_log_consent_type_check";

alter table "public"."guardian_consent_log" add constraint "guardian_consent_log_guardian_id_fkey" FOREIGN KEY (guardian_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_consent_log" validate constraint "guardian_consent_log_guardian_id_fkey";

alter table "public"."guardian_event_responses" add constraint "guardian_event_responses_child_id_fkey" FOREIGN KEY (child_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_event_responses" validate constraint "guardian_event_responses_child_id_fkey";

alter table "public"."guardian_event_responses" add constraint "guardian_event_responses_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_event_responses" validate constraint "guardian_event_responses_event_id_fkey";

alter table "public"."guardian_event_responses" add constraint "guardian_event_responses_event_id_occurrence_date_child_id__key" UNIQUE using index "guardian_event_responses_event_id_occurrence_date_child_id__key";

alter table "public"."guardian_event_responses" add constraint "guardian_event_responses_guardian_id_fkey" FOREIGN KEY (guardian_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_event_responses" validate constraint "guardian_event_responses_guardian_id_fkey";

alter table "public"."guardian_links" add constraint "guardian_links_child_id_fkey" FOREIGN KEY (child_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_links" validate constraint "guardian_links_child_id_fkey";

alter table "public"."guardian_links" add constraint "guardian_links_guardian_id_child_id_key" UNIQUE using index "guardian_links_guardian_id_child_id_key";

alter table "public"."guardian_links" add constraint "guardian_links_guardian_id_fkey" FOREIGN KEY (guardian_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_links" validate constraint "guardian_links_guardian_id_fkey";

alter table "public"."guardian_links" add constraint "guardian_links_guardian_id_profiles_fkey" FOREIGN KEY (guardian_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."guardian_links" validate constraint "guardian_links_guardian_id_profiles_fkey";

alter table "public"."guardian_links" add constraint "guardian_links_relationship_check" CHECK ((relationship = ANY (ARRAY['parent'::text, 'grandparent'::text, 'legal_guardian'::text, 'other'::text]))) not valid;

alter table "public"."guardian_links" validate constraint "guardian_links_relationship_check";

alter table "public"."head_to_head_stats" add constraint "head_to_head_stats_player_a_id_fkey" FOREIGN KEY (player_a_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."head_to_head_stats" validate constraint "head_to_head_stats_player_a_id_fkey";

alter table "public"."head_to_head_stats" add constraint "head_to_head_stats_player_a_id_player_b_id_key" UNIQUE using index "head_to_head_stats_player_a_id_player_b_id_key";

alter table "public"."head_to_head_stats" add constraint "head_to_head_stats_player_b_id_fkey" FOREIGN KEY (player_b_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."head_to_head_stats" validate constraint "head_to_head_stats_player_b_id_fkey";

alter table "public"."hidden_content" add constraint "hidden_content_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."hidden_content" validate constraint "hidden_content_user_id_fkey";

alter table "public"."hidden_content" add constraint "unique_hidden_content" UNIQUE using index "unique_hidden_content";

alter table "public"."invitation_codes" add constraint "invitation_codes_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_club_id_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_code_key" UNIQUE using index "invitation_codes_code_key";

alter table "public"."invitation_codes" add constraint "invitation_codes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_created_by_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_player_id_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_sport_id_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_subgroup_id_fkey";

alter table "public"."invitation_codes" add constraint "invitation_codes_used_by_fkey" FOREIGN KEY (used_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."invitation_codes" validate constraint "invitation_codes_used_by_fkey";

alter table "public"."leave_club_requests" add constraint "leave_club_requests_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."leave_club_requests" validate constraint "leave_club_requests_club_id_fkey";

alter table "public"."leave_club_requests" add constraint "leave_club_requests_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."leave_club_requests" validate constraint "leave_club_requests_player_id_fkey";

alter table "public"."leave_club_requests" add constraint "leave_club_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) not valid;

alter table "public"."leave_club_requests" validate constraint "leave_club_requests_reviewed_by_fkey";

alter table "public"."leave_club_requests" add constraint "leave_club_requests_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."leave_club_requests" validate constraint "leave_club_requests_sport_id_fkey";

alter table "public"."match_media" add constraint "match_media_file_path_key" UNIQUE using index "match_media_file_path_key";

alter table "public"."match_media" add constraint "match_media_file_type_check" CHECK ((file_type = ANY (ARRAY['photo'::text, 'video'::text]))) not valid;

alter table "public"."match_media" validate constraint "match_media_file_type_check";

alter table "public"."match_media" add constraint "match_media_match_type_check" CHECK ((match_type = ANY (ARRAY['singles'::text, 'doubles'::text]))) not valid;

alter table "public"."match_media" validate constraint "match_media_match_type_check";

alter table "public"."match_media" add constraint "match_media_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."match_media" validate constraint "match_media_uploaded_by_fkey";

alter table "public"."match_proposals" add constraint "match_proposals_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."match_proposals" validate constraint "match_proposals_club_id_fkey";

alter table "public"."match_proposals" add constraint "match_proposals_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."match_proposals" validate constraint "match_proposals_recipient_id_fkey";

alter table "public"."match_proposals" add constraint "match_proposals_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."match_proposals" validate constraint "match_proposals_requester_id_fkey";

alter table "public"."match_proposals" add constraint "match_proposals_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."match_proposals" validate constraint "match_proposals_sport_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."match_requests" validate constraint "match_requests_club_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_loser_id_fkey" FOREIGN KEY (loser_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."match_requests" validate constraint "match_requests_loser_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_player_a_id_fkey" FOREIGN KEY (player_a_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."match_requests" validate constraint "match_requests_player_a_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_player_b_id_fkey" FOREIGN KEY (player_b_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."match_requests" validate constraint "match_requests_player_b_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."match_requests" validate constraint "match_requests_sport_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_tournament_match_id_fkey" FOREIGN KEY (tournament_match_id) REFERENCES public.tournament_matches(id) ON DELETE SET NULL not valid;

alter table "public"."match_requests" validate constraint "match_requests_tournament_match_id_fkey";

alter table "public"."match_requests" add constraint "match_requests_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."match_requests" validate constraint "match_requests_winner_id_fkey";

alter table "public"."matches" add constraint "matches_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."matches" validate constraint "matches_club_id_fkey";

alter table "public"."matches" add constraint "matches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."matches" validate constraint "matches_created_by_fkey";

alter table "public"."matches" add constraint "matches_loser_id_fkey" FOREIGN KEY (loser_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."matches" validate constraint "matches_loser_id_fkey";

alter table "public"."matches" add constraint "matches_player_a_id_fkey" FOREIGN KEY (player_a_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."matches" validate constraint "matches_player_a_id_fkey";

alter table "public"."matches" add constraint "matches_player_b_id_fkey" FOREIGN KEY (player_b_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."matches" validate constraint "matches_player_b_id_fkey";

alter table "public"."matches" add constraint "matches_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."matches" validate constraint "matches_sport_id_fkey";

alter table "public"."matches" add constraint "matches_tournament_match_id_fkey" FOREIGN KEY (tournament_match_id) REFERENCES public.tournament_matches(id) ON DELETE SET NULL not valid;

alter table "public"."matches" validate constraint "matches_tournament_match_id_fkey";

alter table "public"."matches" add constraint "matches_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."matches" validate constraint "matches_winner_id_fkey";

alter table "public"."ml_data_consent" add constraint "ml_data_consent_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."ml_data_consent" validate constraint "ml_data_consent_user_id_fkey";

alter table "public"."ml_data_consent" add constraint "ml_data_consent_user_id_key" UNIQUE using index "ml_data_consent_user_id_key";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."points_history" add constraint "points_history_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."points_history" validate constraint "points_history_partner_id_fkey";

alter table "public"."points_history" add constraint "points_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."points_history" validate constraint "points_history_user_id_fkey";

alter table "public"."poll_votes" add constraint "poll_votes_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES public.community_polls(id) ON DELETE CASCADE not valid;

alter table "public"."poll_votes" validate constraint "poll_votes_poll_id_fkey";

alter table "public"."poll_votes" add constraint "poll_votes_poll_id_user_id_option_id_key" UNIQUE using index "poll_votes_poll_id_user_id_option_id_key";

alter table "public"."poll_votes" add constraint "poll_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."poll_votes" validate constraint "poll_votes_user_id_fkey";

alter table "public"."post_comments" add constraint "post_comments_check" CHECK ((((post_id IS NOT NULL) AND (poll_id IS NULL)) OR ((post_id IS NULL) AND (poll_id IS NOT NULL)))) not valid;

alter table "public"."post_comments" validate constraint "post_comments_check";

alter table "public"."post_comments" add constraint "post_comments_content_check" CHECK ((char_length(content) <= 1000)) not valid;

alter table "public"."post_comments" validate constraint "post_comments_content_check";

alter table "public"."post_comments" add constraint "post_comments_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES public.community_polls(id) ON DELETE CASCADE not valid;

alter table "public"."post_comments" validate constraint "post_comments_poll_id_fkey";

alter table "public"."post_comments" add constraint "post_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE not valid;

alter table "public"."post_comments" validate constraint "post_comments_post_id_fkey";

alter table "public"."post_comments" add constraint "post_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."post_comments" validate constraint "post_comments_user_id_fkey";

alter table "public"."post_likes" add constraint "post_likes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE not valid;

alter table "public"."post_likes" validate constraint "post_likes_post_id_fkey";

alter table "public"."post_likes" add constraint "post_likes_post_id_user_id_key" UNIQUE using index "post_likes_post_id_user_id_key";

alter table "public"."post_likes" add constraint "post_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."post_likes" validate constraint "post_likes_user_id_fkey";

alter table "public"."profile_club_sports" add constraint "profile_club_sports_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."profile_club_sports" validate constraint "profile_club_sports_club_id_fkey";

alter table "public"."profile_club_sports" add constraint "profile_club_sports_role_check" CHECK ((role = ANY (ARRAY['player'::text, 'coach'::text, 'head_coach'::text]))) not valid;

alter table "public"."profile_club_sports" validate constraint "profile_club_sports_role_check";

alter table "public"."profile_club_sports" add constraint "profile_club_sports_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."profile_club_sports" validate constraint "profile_club_sports_sport_id_fkey";

alter table "public"."profile_club_sports" add constraint "profile_club_sports_user_id_club_id_sport_id_key" UNIQUE using index "profile_club_sports_user_id_club_id_sport_id_key";

alter table "public"."profile_club_sports" add constraint "profile_club_sports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."profile_club_sports" validate constraint "profile_club_sports_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_active_sport_id_fkey" FOREIGN KEY (active_sport_id) REFERENCES public.sports(id) not valid;

alter table "public"."profiles" validate constraint "profiles_active_sport_id_fkey";

alter table "public"."profiles" add constraint "profiles_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_club_id_fkey";

alter table "public"."profiles" add constraint "profiles_spielhand_check" CHECK (((spielhand IS NULL) OR (spielhand = ANY (ARRAY['right'::text, 'left'::text])))) not valid;

alter table "public"."profiles" validate constraint "profiles_spielhand_check";

alter table "public"."profiles" add constraint "profiles_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_sport_id_fkey";

alter table "public"."profiles" add constraint "valid_account_type" CHECK ((account_type = ANY (ARRAY['standard'::text, 'child'::text, 'guardian'::text]))) not valid;

alter table "public"."profiles" validate constraint "valid_account_type";

alter table "public"."profiles" add constraint "valid_age_mode" CHECK (((age_mode IS NULL) OR (age_mode = ANY (ARRAY['kids'::text, 'teen'::text, 'full'::text])))) not valid;

alter table "public"."profiles" validate constraint "valid_age_mode";

alter table "public"."profiles" add constraint "valid_username_format" CHECK (((username IS NULL) OR ((length(username) >= 3) AND (length(username) <= 30) AND (username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$'::text)))) not valid;

alter table "public"."profiles" validate constraint "valid_username_format";

alter table "public"."push_notification_logs" add constraint "push_notification_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."push_notification_logs" validate constraint "push_notification_logs_user_id_fkey";

alter table "public"."push_subscriptions" add constraint "push_subscriptions_endpoint_key" UNIQUE using index "push_subscriptions_endpoint_key";

alter table "public"."push_subscriptions" add constraint "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."push_subscriptions" validate constraint "push_subscriptions_user_id_fkey";

alter table "public"."seasons" add constraint "seasons_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) not valid;

alter table "public"."seasons" validate constraint "seasons_club_id_fkey";

alter table "public"."seasons" add constraint "seasons_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."seasons" validate constraint "seasons_created_by_fkey";

alter table "public"."seasons" add constraint "seasons_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."seasons" validate constraint "seasons_sport_id_fkey";

alter table "public"."seasons" add constraint "valid_date_range" CHECK ((end_date > start_date)) not valid;

alter table "public"."seasons" validate constraint "valid_date_range";

alter table "public"."sports" add constraint "sports_name_key" UNIQUE using index "sports_name_key";

alter table "public"."streaks" add constraint "streaks_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE CASCADE not valid;

alter table "public"."streaks" validate constraint "streaks_subgroup_id_fkey";

alter table "public"."streaks" add constraint "streaks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."streaks" validate constraint "streaks_user_id_fkey";

alter table "public"."streaks" add constraint "streaks_user_id_subgroup_id_key" UNIQUE using index "streaks_user_id_subgroup_id_key";

alter table "public"."subgroup_members" add constraint "subgroup_members_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE CASCADE not valid;

alter table "public"."subgroup_members" validate constraint "subgroup_members_subgroup_id_fkey";

alter table "public"."subgroup_members" add constraint "subgroup_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."subgroup_members" validate constraint "subgroup_members_user_id_fkey";

alter table "public"."subgroups" add constraint "subgroups_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."subgroups" validate constraint "subgroups_club_id_fkey";

alter table "public"."subgroups" add constraint "subgroups_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."subgroups" validate constraint "subgroups_sport_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_match_id_fkey" FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_match_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_next_loser_match_id_fkey" FOREIGN KEY (next_loser_match_id) REFERENCES public.tournament_matches(id) not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_next_loser_match_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_next_winner_match_id_fkey" FOREIGN KEY (next_winner_match_id) REFERENCES public.tournament_matches(id) not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_next_winner_match_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_player_a_id_fkey" FOREIGN KEY (player_a_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_player_a_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_player_b_id_fkey" FOREIGN KEY (player_b_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_player_b_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.tournament_rounds(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_round_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_tournament_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.profiles(id) not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_winner_id_fkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_participants" validate constraint "tournament_participants_player_id_fkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_participants" validate constraint "tournament_participants_tournament_id_fkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_tournament_id_player_id_key" UNIQUE using index "tournament_participants_tournament_id_player_id_key";

alter table "public"."tournament_rounds" add constraint "tournament_rounds_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_rounds" validate constraint "tournament_rounds_tournament_id_fkey";

alter table "public"."tournament_rounds" add constraint "tournament_rounds_tournament_id_round_number_group_name_key" UNIQUE using index "tournament_rounds_tournament_id_round_number_group_name_key";

alter table "public"."tournament_standings" add constraint "tournament_standings_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_standings" validate constraint "tournament_standings_player_id_fkey";

alter table "public"."tournament_standings" add constraint "tournament_standings_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.tournament_rounds(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_standings" validate constraint "tournament_standings_round_id_fkey";

alter table "public"."tournament_standings" add constraint "tournament_standings_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_standings" validate constraint "tournament_standings_tournament_id_fkey";

alter table "public"."tournament_standings" add constraint "tournament_standings_tournament_id_round_id_player_id_key" UNIQUE using index "tournament_standings_tournament_id_round_id_player_id_key";

alter table "public"."tournaments" add constraint "tournaments_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."tournaments" validate constraint "tournaments_club_id_fkey";

alter table "public"."tournaments" add constraint "tournaments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."tournaments" validate constraint "tournaments_created_by_fkey";

alter table "public"."tournaments" add constraint "tournaments_join_code_key" UNIQUE using index "tournaments_join_code_key";

alter table "public"."tournaments" add constraint "tournaments_runner_up_id_fkey" FOREIGN KEY (runner_up_id) REFERENCES public.profiles(id) not valid;

alter table "public"."tournaments" validate constraint "tournaments_runner_up_id_fkey";

alter table "public"."tournaments" add constraint "tournaments_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."tournaments" validate constraint "tournaments_sport_id_fkey";

alter table "public"."tournaments" add constraint "tournaments_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.profiles(id) not valid;

alter table "public"."tournaments" validate constraint "tournaments_winner_id_fkey";

alter table "public"."training_sessions" add constraint "training_sessions_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."training_sessions" validate constraint "training_sessions_club_id_fkey";

alter table "public"."training_sessions" add constraint "training_sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."training_sessions" validate constraint "training_sessions_created_by_fkey";

alter table "public"."training_sessions" add constraint "training_sessions_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE SET NULL not valid;

alter table "public"."training_sessions" validate constraint "training_sessions_sport_id_fkey";

alter table "public"."training_sessions" add constraint "training_sessions_subgroup_id_fkey" FOREIGN KEY (subgroup_id) REFERENCES public.subgroups(id) ON DELETE SET NULL not valid;

alter table "public"."training_sessions" validate constraint "training_sessions_subgroup_id_fkey";

alter table "public"."user_blocks" add constraint "no_self_block" CHECK ((blocker_id <> blocked_id)) not valid;

alter table "public"."user_blocks" validate constraint "no_self_block";

alter table "public"."user_blocks" add constraint "unique_block" UNIQUE using index "unique_block";

alter table "public"."user_blocks" add constraint "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_blocks" validate constraint "user_blocks_blocked_id_fkey";

alter table "public"."user_blocks" add constraint "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_blocks" validate constraint "user_blocks_blocker_id_fkey";

alter table "public"."user_preferences" add constraint "user_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_preferences" validate constraint "user_preferences_user_id_fkey";

alter table "public"."user_season_points" add constraint "user_season_points_season_id_fkey" FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE not valid;

alter table "public"."user_season_points" validate constraint "user_season_points_season_id_fkey";

alter table "public"."user_season_points" add constraint "user_season_points_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_season_points" validate constraint "user_season_points_user_id_fkey";

alter table "public"."user_season_points" add constraint "user_season_points_user_id_season_id_key" UNIQUE using index "user_season_points_user_id_season_id_key";

alter table "public"."user_sport_stats" add constraint "user_sport_stats_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE not valid;

alter table "public"."user_sport_stats" validate constraint "user_sport_stats_sport_id_fkey";

alter table "public"."user_sport_stats" add constraint "user_sport_stats_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_sport_stats" validate constraint "user_sport_stats_user_id_fkey";

alter table "public"."user_sport_stats" add constraint "user_sport_stats_user_id_sport_id_key" UNIQUE using index "user_sport_stats_user_id_sport_id_key";

alter table "public"."video_ai_analyses" add constraint "video_ai_analyses_analysis_type_check" CHECK ((analysis_type = ANY (ARRAY['pose_estimation'::text, 'shot_classification'::text, 'ball_tracking'::text, 'match_analysis'::text, 'movement_quality'::text, 'player_detection'::text, 'table_ball'::text, 'table_calibration'::text, 'claude_technique_analysis'::text]))) not valid;

alter table "public"."video_ai_analyses" validate constraint "video_ai_analyses_analysis_type_check";

alter table "public"."video_ai_analyses" add constraint "video_ai_analyses_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."video_ai_analyses" validate constraint "video_ai_analyses_created_by_fkey";

alter table "public"."video_ai_analyses" add constraint "video_ai_analyses_processing_location_check" CHECK ((processing_location = ANY (ARRAY['browser'::text, 'edge_function'::text, 'server'::text]))) not valid;

alter table "public"."video_ai_analyses" validate constraint "video_ai_analyses_processing_location_check";

alter table "public"."video_ai_analyses" add constraint "video_ai_analyses_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."video_ai_analyses" validate constraint "video_ai_analyses_status_check";

alter table "public"."video_ai_analyses" add constraint "video_ai_analyses_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_ai_analyses" validate constraint "video_ai_analyses_video_id_fkey";

alter table "public"."video_ai_frames" add constraint "video_ai_frames_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES public.video_ai_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_ai_frames" validate constraint "video_ai_frames_analysis_id_fkey";

alter table "public"."video_ai_frames" add constraint "video_ai_frames_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_ai_frames" validate constraint "video_ai_frames_video_id_fkey";

alter table "public"."video_analyses" add constraint "video_analyses_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."video_analyses" validate constraint "video_analyses_club_id_fkey";

alter table "public"."video_analyses" add constraint "video_analyses_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL not valid;

alter table "public"."video_analyses" validate constraint "video_analyses_exercise_id_fkey";

alter table "public"."video_analyses" add constraint "video_analyses_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."video_analyses" validate constraint "video_analyses_uploaded_by_fkey";

alter table "public"."video_assignments" add constraint "video_assignments_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."video_assignments" validate constraint "video_assignments_club_id_fkey";

alter table "public"."video_assignments" add constraint "video_assignments_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."video_assignments" validate constraint "video_assignments_player_id_fkey";

alter table "public"."video_assignments" add constraint "video_assignments_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_assignments" validate constraint "video_assignments_video_id_fkey";

alter table "public"."video_assignments" add constraint "video_assignments_video_id_player_id_key" UNIQUE using index "video_assignments_video_id_player_id_key";

alter table "public"."video_comments" add constraint "video_comments_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."video_comments" validate constraint "video_comments_club_id_fkey";

alter table "public"."video_comments" add constraint "video_comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.video_comments(id) ON DELETE CASCADE not valid;

alter table "public"."video_comments" validate constraint "video_comments_parent_id_fkey";

alter table "public"."video_comments" add constraint "video_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."video_comments" validate constraint "video_comments_user_id_fkey";

alter table "public"."video_comments" add constraint "video_comments_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_comments" validate constraint "video_comments_video_id_fkey";

alter table "public"."video_labels" add constraint "video_labels_ball_position_x_check" CHECK (((ball_position_x >= (0)::double precision) AND (ball_position_x <= (1)::double precision))) not valid;

alter table "public"."video_labels" validate constraint "video_labels_ball_position_x_check";

alter table "public"."video_labels" add constraint "video_labels_ball_position_y_check" CHECK (((ball_position_y >= (0)::double precision) AND (ball_position_y <= (1)::double precision))) not valid;

alter table "public"."video_labels" validate constraint "video_labels_ball_position_y_check";

alter table "public"."video_labels" add constraint "video_labels_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."video_labels" validate constraint "video_labels_club_id_fkey";

alter table "public"."video_labels" add constraint "video_labels_confidence_check" CHECK ((confidence = ANY (ARRAY['certain'::text, 'probable'::text, 'uncertain'::text]))) not valid;

alter table "public"."video_labels" validate constraint "video_labels_confidence_check";

alter table "public"."video_labels" add constraint "video_labels_labeled_by_fkey" FOREIGN KEY (labeled_by) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."video_labels" validate constraint "video_labels_labeled_by_fkey";

alter table "public"."video_labels" add constraint "video_labels_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) not valid;

alter table "public"."video_labels" validate constraint "video_labels_player_id_fkey";

alter table "public"."video_labels" add constraint "video_labels_shot_quality_check" CHECK (((shot_quality >= 1) AND (shot_quality <= 5))) not valid;

alter table "public"."video_labels" validate constraint "video_labels_shot_quality_check";

alter table "public"."video_labels" add constraint "video_labels_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES public.profiles(id) not valid;

alter table "public"."video_labels" validate constraint "video_labels_verified_by_fkey";

alter table "public"."video_labels" add constraint "video_labels_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_labels" validate constraint "video_labels_video_id_fkey";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_audio_quality_check" CHECK ((audio_quality = ANY (ARRAY['good'::text, 'moderate'::text, 'poor'::text, 'none'::text, 'unknown'::text]))) not valid;

alter table "public"."video_ml_metadata" validate constraint "video_ml_metadata_audio_quality_check";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_camera_angle_check" CHECK ((camera_angle = ANY (ARRAY['side'::text, 'behind'::text, 'above'::text, 'mixed'::text, 'unknown'::text]))) not valid;

alter table "public"."video_ml_metadata" validate constraint "video_ml_metadata_camera_angle_check";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_camera_distance_check" CHECK ((camera_distance = ANY (ARRAY['close'::text, 'medium'::text, 'far'::text, 'unknown'::text]))) not valid;

alter table "public"."video_ml_metadata" validate constraint "video_ml_metadata_camera_distance_check";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_lighting_check" CHECK ((lighting = ANY (ARRAY['good'::text, 'moderate'::text, 'poor'::text, 'unknown'::text]))) not valid;

alter table "public"."video_ml_metadata" validate constraint "video_ml_metadata_lighting_check";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_ml_metadata" validate constraint "video_ml_metadata_video_id_fkey";

alter table "public"."video_ml_metadata" add constraint "video_ml_metadata_video_id_key" UNIQUE using index "video_ml_metadata_video_id_key";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_confidence_check" CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))) not valid;

alter table "public"."video_rally_segments" validate constraint "video_rally_segments_confidence_check";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."video_rally_segments" validate constraint "video_rally_segments_created_by_fkey";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_end_type_check" CHECK ((end_type = ANY (ARRAY['winner'::text, 'error'::text, 'net'::text, 'out'::text, 'unknown'::text]))) not valid;

alter table "public"."video_rally_segments" validate constraint "video_rally_segments_end_type_check";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'ai_detected'::text, 'ai_verified'::text]))) not valid;

alter table "public"."video_rally_segments" validate constraint "video_rally_segments_source_check";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_video_id_fkey" FOREIGN KEY (video_id) REFERENCES public.video_analyses(id) ON DELETE CASCADE not valid;

alter table "public"."video_rally_segments" validate constraint "video_rally_segments_video_id_fkey";

alter table "public"."video_rally_segments" add constraint "video_rally_segments_winner_check" CHECK ((winner = ANY (ARRAY['near'::text, 'far'::text, 'unknown'::text]))) not valid;

alter table "public"."video_rally_segments" validate constraint "video_rally_segments_winner_check";

alter table "public"."xp_history" add constraint "xp_history_awarded_by_fkey" FOREIGN KEY (awarded_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."xp_history" validate constraint "xp_history_awarded_by_fkey";

alter table "public"."xp_history" add constraint "xp_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."xp_history" validate constraint "xp_history_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.accept_friend_request(current_user_id uuid, friendship_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    friendship friendships%ROWTYPE;
    accepter_name TEXT;
    accepter_profile profiles%ROWTYPE;
BEGIN
    -- Get friendship
    SELECT * INTO friendship
    FROM friendships
    WHERE id = friendship_id
    AND addressee_id = current_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Follow request not found or not pending');
    END IF;

    -- Get accepter name
    SELECT * INTO accepter_profile FROM profiles WHERE id = current_user_id;
    accepter_name := COALESCE(accepter_profile.first_name, '') || ' ' || COALESCE(accepter_profile.last_name, '');
    accepter_name := TRIM(accepter_name);
    IF accepter_name = '' THEN
        accepter_name := 'Ein Nutzer';
    END IF;

    -- Update status to accepted
    UPDATE friendships
    SET status = 'accepted', updated_at = NOW()
    WHERE id = friendship_id;

    -- Send notification to requester
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        friendship.requester_id,
        'follow_request_accepted',
        'Anfrage angenommen',
        accepter_name || ' hat deine Anfrage angenommen. Du folgst jetzt ' || accepter_name || '!',
        json_build_object('friendship_id', friendship_id, 'user_id', current_user_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Follow request accepted',
        'friendship_id', friendship_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_guardian_invite(p_code text, p_child_birthdate date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_new_guardian_id UUID;
    v_code_record RECORD;
    v_child RECORD;
BEGIN
    v_new_guardian_id := auth.uid();

    IF v_new_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Find the invite code
    SELECT * INTO v_code_record
    FROM child_login_codes
    WHERE code = UPPER(TRIM(p_code))
    AND used_at IS NULL
    AND expires_at > now();

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ungültiger oder abgelaufener Einladungscode'
        );
    END IF;

    -- Get child
    SELECT * INTO v_child
    FROM profiles
    WHERE id = v_code_record.child_id;

    -- Verify birthdate
    IF v_child.birthdate != p_child_birthdate THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Geburtsdatum stimmt nicht überein'
        );
    END IF;

    -- Check not already a guardian
    IF EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_new_guardian_id
        AND child_id = v_code_record.child_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Du bist bereits als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Mark code as used
    UPDATE child_login_codes
    SET used_at = now()
    WHERE id = v_code_record.id;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_new_guardian_id,
        v_code_record.child_id,
        'parent',
        false,
        now(),
        '1.0'
    );

    -- Update new guardian's is_guardian flag
    UPDATE profiles
    SET is_guardian = true
    WHERE id = v_new_guardian_id
    AND is_guardian = false;

    -- Notify original guardian
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        is_read
    ) VALUES (
        v_code_record.guardian_id,
        'guardian_added',
        'Weiterer Vormund hinzugefügt',
        'Ein weiterer Vormund wurde für ' || v_child.first_name || ' registriert.',
        json_build_object('child_id', v_code_record.child_id, 'new_guardian_id', v_new_guardian_id),
        false
    );

    RETURN json_build_object(
        'success', true,
        'child_id', v_code_record.child_id,
        'child_name', v_child.first_name || ' ' || v_child.last_name,
        'message', 'Du wurdest erfolgreich als Vormund hinzugefügt'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_activity_comment(p_activity_id uuid, p_activity_type text, p_content text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_comment_id UUID;
    v_comment_count INT;
BEGIN
    -- Validate content
    IF length(p_content) = 0 OR length(p_content) > 2000 THEN
        RAISE EXCEPTION 'Comment must be between 1 and 2000 characters';
    END IF;

    -- Validate activity type
    IF p_activity_type NOT IN ('singles_match', 'doubles_match', 'post', 'poll', 'event', 'rank_up', 'club_join') THEN
        RAISE EXCEPTION 'Invalid activity type: %', p_activity_type;
    END IF;

    -- Insert comment
    INSERT INTO activity_comments (activity_id, activity_type, user_id, content)
    VALUES (p_activity_id, p_activity_type, v_user_id, p_content)
    RETURNING id INTO v_comment_id;

    -- Send notifications
    IF p_activity_type = 'singles_match' THEN
        -- Notify both players
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            player_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Spiel kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM (
            SELECT player_a_id AS player_id FROM matches WHERE id = p_activity_id
            UNION
            SELECT player_b_id FROM matches WHERE id = p_activity_id
        ) AS players
        WHERE player_id != v_user_id AND player_id IS NOT NULL;

    ELSIF p_activity_type = 'doubles_match' THEN
        -- Notify all 4 players
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            player_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Doppel kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM (
            SELECT team_a_player1_id AS player_id FROM doubles_matches WHERE id = p_activity_id
            UNION
            SELECT team_a_player2_id FROM doubles_matches WHERE id = p_activity_id
            UNION
            SELECT team_b_player1_id FROM doubles_matches WHERE id = p_activity_id
            UNION
            SELECT team_b_player2_id FROM doubles_matches WHERE id = p_activity_id
        ) AS players
        WHERE player_id != v_user_id AND player_id IS NOT NULL;

    ELSIF p_activity_type = 'post' THEN
        -- Notify post author
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            user_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deinen Beitrag kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM community_posts
        WHERE id = p_activity_id AND user_id != v_user_id;

    ELSIF p_activity_type = 'poll' THEN
        -- Notify poll author
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            created_by,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Umfrage kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM community_posts
        WHERE id = p_activity_id AND type = 'poll' AND created_by != v_user_id;

    ELSIF p_activity_type IN ('rank_up', 'club_join', 'event') THEN
        -- Notify event owner
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            user_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Aktivit�t kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM activity_events
        WHERE id = p_activity_id AND user_id != v_user_id;
    END IF;

    -- Get updated comment count
    SELECT COUNT(*) INTO v_comment_count
    FROM activity_comments
    WHERE activity_id = p_activity_id AND activity_type = p_activity_type;

    RETURN json_build_object(
        'comment_id', v_comment_id,
        'comment_count', v_comment_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_player_points(p_user_id uuid, p_points integer, p_xp integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE profiles
    SET
        points = COALESCE(points, 0) + p_points,
        xp = COALESCE(xp, 0) + COALESCE(p_xp, p_points),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_points_to_training_summary(p_player_id uuid, p_event_id text, p_amount integer, p_reason text, p_type text, p_exercise_name text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post_id UUID;
    v_post_club_id UUID;
    v_content TEXT;
    v_summary_data JSONB;
    v_points JSONB;
    v_new_point JSONB;
    v_total_points INTEGER;
    v_coach_id UUID;
    v_is_coach BOOLEAN;
    TRAINING_SUMMARY_PREFIX CONSTANT TEXT := 'TRAINING_SUMMARY|';
BEGIN
    -- Get the current user (coach)
    v_coach_id := auth.uid();

    -- Find the training summary post for this player and event (and get club_id from post)
    -- Use JSONB extraction to properly match event_id regardless of JSON formatting
    SELECT id, club_id, content INTO v_post_id, v_post_club_id, v_content
    FROM community_posts
    WHERE user_id = p_player_id
    AND content LIKE TRAINING_SUMMARY_PREFIX || '%'
    AND deleted_at IS NULL
    AND (SUBSTRING(content FROM LENGTH(TRAINING_SUMMARY_PREFIX) + 1))::JSONB->>'event_id' = p_event_id
    LIMIT 1;

    IF v_post_id IS NULL THEN
        -- No training summary found for this event
        RETURN FALSE;
    END IF;

    -- Check if the current user is a coach in the post's club
    -- Check both profile_club_sports (per-sport role) and profiles table (global role)
    SELECT EXISTS (
        SELECT 1 FROM profile_club_sports pcs
        WHERE pcs.user_id = v_coach_id
        AND pcs.club_id = v_post_club_id
        AND pcs.role IN ('coach', 'head_coach')
    ) OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = v_coach_id
        AND p.club_id = v_post_club_id
        AND p.role IN ('coach', 'head_coach')
    ) INTO v_is_coach;

    IF NOT v_is_coach THEN
        RAISE EXCEPTION 'Not authorized: User is not a coach in this club';
    END IF;

    -- Parse the existing summary data
    v_summary_data := (SUBSTRING(v_content FROM LENGTH(TRAINING_SUMMARY_PREFIX) + 1))::JSONB;

    -- Get existing points array or create empty one
    v_points := COALESCE(v_summary_data->'points', '[]'::JSONB);

    -- Create new point entry
    v_new_point := jsonb_build_object(
        'amount', p_amount,
        'reason', COALESCE(p_reason, ''),
        'type', COALESCE(p_type, 'exercise'),
        'exercise_name', p_exercise_name,
        'added_at', NOW()
    );

    -- Add new point to array
    v_points := v_points || v_new_point;

    -- Calculate new total
    v_total_points := COALESCE((v_summary_data->>'total_points')::INTEGER, 0) + p_amount;

    -- Update summary data
    v_summary_data := v_summary_data || jsonb_build_object(
        'points', v_points,
        'total_points', v_total_points,
        'updated_at', NOW()
    );

    -- Update the post
    UPDATE community_posts
    SET content = TRAINING_SUMMARY_PREFIX || v_summary_data::TEXT,
        updated_at = NOW()
    WHERE id = v_post_id;

    RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.anonymize_account(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Now just calls hard_delete_account for complete deletion
    RETURN hard_delete_account(p_user_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_elo_gate(new_elo integer, current_elo integer, highest_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- No gate protection - only prevent negative Elo
    RETURN GREATEST(new_elo, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_club_join_request(p_request_id uuid, p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    request_data RECORD;
    player_update_count INTEGER;
    request_update_count INTEGER;
    v_hauptgruppe_id UUID;
    v_restored_points INTEGER := 0;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Get or create Hauptgruppe for this club
    v_hauptgruppe_id := get_hauptgruppe_id(request_data.club_id);
    IF v_hauptgruppe_id IS NULL THEN
        v_hauptgruppe_id := create_hauptgruppe_for_club(request_data.club_id);
    END IF;

    -- *** NEU: Gespeicherte Saisonpunkte prüfen ***
    -- Wenn der Spieler in derselben Saison war, werden seine Punkte wiederhergestellt
    v_restored_points := restore_user_season_points(
        request_data.player_id,
        request_data.club_id
    );

    -- Update the player's club_id and add to Hauptgruppe
    -- Punkte werden auf den gespeicherten Wert gesetzt (oder 0 bei neuer Saison)
    UPDATE profiles
    SET
        club_id = request_data.club_id,
        subgroup_ids = CASE
            WHEN v_hauptgruppe_id IS NOT NULL THEN ARRAY[v_hauptgruppe_id::text]
            ELSE '{}'
        END,
        points = v_restored_points,
        updated_at = NOW()
    WHERE id = request_data.player_id;

    -- Sport-spezifische Punkte wurden bereits von restore_user_season_points() behandelt
    -- Falls KEINE gespeicherten Punkte existieren, auf 0 setzen
    IF v_restored_points = 0 THEN
        UPDATE user_sport_stats
        SET points = 0
        WHERE user_id = request_data.player_id;
    END IF;

    GET DIAGNOSTICS player_update_count = ROW_COUNT;

    IF player_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    -- Update the request status
    UPDATE club_requests
    SET
        status = 'approved',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE
            WHEN v_restored_points > 0 THEN 'Spieler wurde zum Verein hinzugefügt (Saisonpunkte wiederhergestellt: ' || v_restored_points || ')'
            ELSE 'Spieler wurde zum Verein hinzugefügt'
        END,
        'player_updated', player_update_count,
        'request_updated', request_update_count,
        'hauptgruppe_id', v_hauptgruppe_id,
        'restored_points', v_restored_points
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_club_leave_request(p_request_id uuid, p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    request_data RECORD;
    player_update_count INTEGER;
    request_update_count INTEGER;
    v_club_id UUID;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM leave_club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    v_club_id := request_data.club_id;

    -- *** NEU: Saisonpunkte speichern BEVOR sie zurückgesetzt werden ***
    PERFORM save_user_season_points(request_data.player_id, v_club_id);

    -- Remove the player from the club
    -- Reset season points
    UPDATE profiles
    SET
        club_id = NULL,
        points = 0,
        updated_at = NOW()
    WHERE id = request_data.player_id;

    GET DIAGNOSTICS player_update_count = ROW_COUNT;

    IF player_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    -- Reset sport-specific season points
    UPDATE user_sport_stats
    SET points = 0
    WHERE user_id = request_data.player_id;

    -- Update the request status
    UPDATE leave_club_requests
    SET
        status = 'approved',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Spieler hat den Verein verlassen',
        'player_updated', player_update_count,
        'request_updated', request_update_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_guardian_club_request(p_request_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_coach_id UUID;
    v_request RECORD;
    v_child_id UUID;
    v_age_mode TEXT;
BEGIN
    v_coach_id := auth.uid();

    IF v_coach_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get request
    SELECT * INTO v_request
    FROM club_requests
    WHERE id = p_request_id
    AND status = 'pending'
    AND request_type = 'guardian';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Anfrage nicht gefunden oder bereits bearbeitet'
        );
    END IF;

    -- Verify coach is in the same club
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = v_coach_id
        AND club_id = v_request.club_id
        AND role IN ('coach', 'head_coach')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Keine Berechtigung für diesen Verein'
        );
    END IF;

    -- Calculate age mode for child
    v_age_mode := calculate_age_mode(v_request.child_birthdate);

    -- Create child profile
    v_child_id := gen_random_uuid();

    INSERT INTO profiles (
        id,
        first_name,
        last_name,
        display_name,
        birthdate,
        gender,
        club_id,
        role,
        account_type,
        age_mode,
        is_offline,
        is_match_ready,
        onboarding_complete,
        elo_rating,
        highest_elo,
        xp,
        points,
        created_at,
        updated_at
    ) VALUES (
        v_child_id,
        v_request.child_first_name,
        v_request.child_last_name,
        TRIM(v_request.child_first_name || ' ' || v_request.child_last_name),
        v_request.child_birthdate,
        v_request.child_gender,
        v_request.club_id,
        'player',
        'child',
        v_age_mode,
        true,  -- Like offline player
        false,
        false,
        800,
        800,
        0,
        0,
        now(),
        now()
    );

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_request.player_id,
        v_child_id,
        'parent',
        true,
        now(),
        '1.0'
    );

    -- Update guardian's is_guardian flag
    UPDATE profiles
    SET is_guardian = true
    WHERE id = v_request.player_id
    AND is_guardian = false;

    -- Update request status
    UPDATE club_requests
    SET
        status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_coach_id
    WHERE id = p_request_id;

    -- Create notification for guardian
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        is_read
    ) VALUES (
        v_request.player_id,
        'guardian_request_approved',
        'Beitrittsanfrage akzeptiert',
        v_request.child_first_name || ' wurde erfolgreich im Verein aufgenommen.',
        json_build_object('child_id', v_child_id, 'club_id', v_request.club_id),
        false
    );

    RETURN json_build_object(
        'success', true,
        'child_id', v_child_id,
        'message', 'Kind wurde erfolgreich erstellt und Vormund verknüpft'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_create_club_on_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    existing_club RECORD;
BEGIN
    -- Check if club exists
    SELECT * INTO existing_club FROM clubs WHERE id = NEW.club_id;

    IF existing_club IS NULL THEN
        -- Create club
        INSERT INTO clubs (id, name, created_at)
        VALUES (NEW.club_id, NEW.club_id, NOW())
        ON CONFLICT (id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_points(p_user_id uuid, p_points integer, p_reason text DEFAULT NULL::text, p_awarded_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Punkte zum Profil hinzufügen
    UPDATE profiles
    SET points = COALESCE(points, 0) + p_points,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Points History eintragen
    INSERT INTO points_history (user_id, points, reason, awarded_by, created_at)
    VALUES (p_user_id, p_points, p_reason, p_awarded_by, NOW());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_xp(p_user_id uuid, p_xp_amount integer, p_reason text DEFAULT NULL::text, p_source text DEFAULT 'system'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- XP zum Profil hinzufügen
    UPDATE profiles
    SET xp = COALESCE(xp, 0) + p_xp_amount,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- XP History eintragen
    INSERT INTO xp_history (user_id, xp, reason, source, created_at)
    VALUES (p_user_id, p_xp_amount, p_reason, p_source, NOW());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.block_user(current_user_id uuid, target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    target_name TEXT;
BEGIN
    -- Validate: Can't block yourself
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot block yourself');
    END IF;

    -- Check if already blocked
    IF EXISTS (
        SELECT 1 FROM user_blocks
        WHERE blocker_id = current_user_id AND blocked_id = target_user_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'User already blocked');
    END IF;

    -- Get target name for confirmation
    SELECT first_name || ' ' || last_name INTO target_name
    FROM profiles WHERE id = target_user_id;

    -- Create block
    INSERT INTO user_blocks (blocker_id, blocked_id)
    VALUES (current_user_id, target_user_id);

    -- Remove any existing friendships in both directions
    DELETE FROM friendships
    WHERE (requester_id = current_user_id AND addressee_id = target_user_id)
       OR (requester_id = target_user_id AND addressee_id = current_user_id);

    RETURN json_build_object(
        'success', true,
        'message', 'User blocked successfully',
        'blocked_user_name', target_name
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_age(p_birthdate date)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    IF p_birthdate IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN EXTRACT(YEAR FROM age(CURRENT_DATE, p_birthdate))::INT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_age_mode(p_birthdate date)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_age INT;
BEGIN
    IF p_birthdate IS NULL THEN
        RETURN NULL;
    END IF;

    v_age := calculate_age(p_birthdate);

    IF v_age < 14 THEN
        RETURN 'kids';
    ELSIF v_age < 16 THEN
        RETURN 'teen';
    ELSE
        RETURN 'full';
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_elo(winner_elo integer, loser_elo integer, k_factor integer DEFAULT 32)
 RETURNS TABLE(new_winner_elo integer, new_loser_elo integer, elo_delta integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    expected_winner FLOAT;
    expected_loser FLOAT;
    calc_winner_elo INTEGER;
    calc_loser_elo INTEGER;
    calc_delta INTEGER;
BEGIN
    expected_winner := 1.0 / (1.0 + POWER(10, (loser_elo - winner_elo)::FLOAT / 400));
    expected_loser := 1.0 - expected_winner;

    calc_winner_elo := ROUND(winner_elo + k_factor * (1 - expected_winner));
    calc_loser_elo := ROUND(loser_elo + k_factor * (0 - expected_loser));
    calc_delta := ABS(calc_winner_elo - winner_elo);

    RETURN QUERY SELECT calc_winner_elo, calc_loser_elo, calc_delta;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_elo_advanced(p_winner_id uuid, p_loser_id uuid, p_winner_elo integer, p_loser_elo integer, p_handicap_used boolean DEFAULT false, p_sport_key text DEFAULT 'table-tennis'::text)
 RETURNS TABLE(new_winner_elo integer, new_loser_elo integer, winner_elo_change integer, loser_elo_change integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_winner_factor INTEGER;
    v_loser_factor INTEGER;
    v_expected_winner NUMERIC;
    v_expected_loser NUMERIC;
    v_winner_change INTEGER;
    v_loser_change INTEGER;
    v_new_winner INTEGER;
    v_new_loser INTEGER;
    v_config RECORD;
BEGIN
    -- Get sport config
    SELECT * INTO v_config FROM elo_sport_config WHERE sport_key = p_sport_key;
    IF NOT FOUND THEN
        v_config.fixed_handicap_change := 8;
        v_config.rating_floor := 400;
    END IF;

    -- If handicap was used, apply fixed change
    IF p_handicap_used THEN
        v_winner_change := v_config.fixed_handicap_change;
        v_loser_change := -v_config.fixed_handicap_change;
    ELSE
        -- Get individual A-factors
        v_winner_factor := get_a_factor(p_winner_id, p_sport_key);
        v_loser_factor := get_a_factor(p_loser_id, p_sport_key);

        -- Calculate expected scores (standard ELO formula)
        v_expected_winner := 1.0 / (1.0 + POWER(10.0, (p_loser_elo - p_winner_elo)::NUMERIC / 400.0));
        v_expected_loser := 1.0 - v_expected_winner;

        -- Decoupled calculation: each player uses their own factor
        -- Winner: Factor * (1 - expected)
        -- Loser: Factor * (0 - expected)
        v_winner_change := ROUND(v_winner_factor * (1.0 - v_expected_winner));
        v_loser_change := ROUND(v_loser_factor * (0.0 - v_expected_loser));
    END IF;

    -- Calculate new ratings
    v_new_winner := p_winner_elo + v_winner_change;
    v_new_loser := p_loser_elo + v_loser_change;

    -- Apply rating floor
    IF v_new_loser < v_config.rating_floor THEN
        v_new_loser := v_config.rating_floor;
        v_loser_change := v_new_loser - p_loser_elo;
    END IF;

    RETURN QUERY SELECT v_new_winner, v_new_loser, v_winner_change, v_loser_change;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_rank(p_elo integer, p_xp integer, p_grundlagen integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    IF p_elo >= 1600 AND p_xp >= 1800 THEN RETURN 'Champion'; END IF;
    IF p_elo >= 1400 AND p_xp >= 1000 THEN RETURN 'Platin'; END IF;
    IF p_elo >= 1200 AND p_xp >= 500 THEN RETURN 'Gold'; END IF;
    IF p_elo >= 1000 AND p_xp >= 200 THEN RETURN 'Silber'; END IF;
    IF p_elo >= 850 AND p_xp >= 50 AND p_grundlagen >= 5 THEN RETURN 'Bronze'; END IF;
    RETURN 'Rekrut';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_coach_see_profile(profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Check if the current user is a coach/head_coach and the profile is in their club/sport
  SELECT EXISTS (
    SELECT 1
    FROM profile_club_sports pcs_coach
    INNER JOIN profile_club_sports pcs_player
      ON pcs_coach.club_id = pcs_player.club_id
      AND pcs_coach.sport_id = pcs_player.sport_id
    WHERE pcs_coach.user_id = auth.uid()
      AND pcs_coach.role IN ('coach', 'head_coach')
      AND pcs_player.user_id = profile_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_upload_match_media(p_match_id text, p_match_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_participant BOOLEAN := FALSE;
BEGIN
    IF p_match_type = 'singles' THEN
        SELECT EXISTS (
            SELECT 1 FROM matches WHERE id::text = p_match_id
            AND (player_a_id = v_user_id OR player_b_id = v_user_id)
        ) INTO v_is_participant;
    ELSIF p_match_type = 'doubles' THEN
        SELECT EXISTS (
            SELECT 1 FROM double_matches WHERE id::text = p_match_id
            AND (team_a_player1_id = v_user_id OR team_a_player2_id = v_user_id 
                 OR team_b_player1_id = v_user_id OR team_b_player2_id = v_user_id)
        ) INTO v_is_participant;
    END IF;
    RETURN v_is_participant;
END; $function$
;

CREATE OR REPLACE FUNCTION public.cancel_follow_request(current_user_id uuid, target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    friendship friendships%ROWTYPE;
BEGIN
    -- Find the pending request sent by current user
    SELECT * INTO friendship
    FROM friendships
    WHERE requester_id = current_user_id
    AND addressee_id = target_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No pending follow request found');
    END IF;

    -- Delete the friendship request
    DELETE FROM friendships WHERE id = friendship.id;

    -- Delete any related notification for the target user
    DELETE FROM notifications
    WHERE user_id = target_user_id
    AND type = 'follow_request'
    AND (data->>'requester_id')::uuid = current_user_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Follow request cancelled'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_and_send_lead_time_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_event RECORD;
    v_occurrence_date DATE;
    v_lead_time_start DATE;
    v_member RECORD;
    v_existing_inv RECORD;
    v_inv_id UUID;
    v_event_date_formatted TEXT;
    v_notifications_sent INTEGER := 0;
    v_invitations_created INTEGER := 0;
    v_today DATE := CURRENT_DATE;
    v_window_end DATE := CURRENT_DATE + INTERVAL '8 weeks';
BEGIN
    -- Alle wiederkehrenden Events mit Vorlaufzeit-Einstellung finden
    FOR v_event IN
        SELECT e.id, e.title, e.start_date, e.start_time, e.repeat_type,
               e.repeat_end_date, e.excluded_dates, e.club_id,
               e.target_type, e.target_subgroup_ids,
               e.invitation_lead_time_value, e.invitation_lead_time_unit,
               e.event_type
        FROM events e
        WHERE e.event_type = 'recurring'
          AND e.invitation_lead_time_value IS NOT NULL
          AND e.invitation_lead_time_unit IS NOT NULL
          AND e.repeat_type IS NOT NULL
          AND e.repeat_type != 'none'
          -- Event darf nicht abgelaufen sein
          AND (e.repeat_end_date IS NULL OR e.repeat_end_date >= v_today)
    LOOP
        -- Für jedes Event: Nächste Termine berechnen
        v_occurrence_date := v_event.start_date;

        -- Zum ersten Termin ab heute vorspulen
        WHILE v_occurrence_date < v_today LOOP
            v_occurrence_date := CASE v_event.repeat_type
                WHEN 'daily' THEN v_occurrence_date + INTERVAL '1 day'
                WHEN 'weekly' THEN v_occurrence_date + INTERVAL '7 days'
                WHEN 'biweekly' THEN v_occurrence_date + INTERVAL '14 days'
                WHEN 'monthly' THEN v_occurrence_date + INTERVAL '1 month'
                ELSE v_occurrence_date + INTERVAL '7 days'
            END;
        END LOOP;

        -- Termine innerhalb des Fensters durchgehen
        WHILE v_occurrence_date <= v_window_end LOOP
            -- Prüfen ob Datum nicht ausgeschlossen ist
            IF v_event.excluded_dates IS NULL
               OR NOT (v_occurrence_date::text = ANY(v_event.excluded_dates)) THEN

                -- Vorlaufzeit-Startdatum berechnen
                v_lead_time_start := CASE v_event.invitation_lead_time_unit
                    WHEN 'hours' THEN v_occurrence_date -- Bei Stunden: ab dem Tag selbst
                    WHEN 'days' THEN v_occurrence_date - (v_event.invitation_lead_time_value * INTERVAL '1 day')
                    WHEN 'weeks' THEN v_occurrence_date - (v_event.invitation_lead_time_value * 7 * INTERVAL '1 day')
                    ELSE v_occurrence_date - (v_event.invitation_lead_time_value * INTERVAL '1 day')
                END;

                -- Nur verarbeiten wenn wir im Vorlaufzeit-Fenster sind
                IF v_today >= v_lead_time_start AND v_occurrence_date >= v_today THEN

                    -- Datum formatieren für Benachrichtigungstext
                    v_event_date_formatted := to_char(v_occurrence_date, 'DD.MM.YYYY');

                    -- Relevante Club-Mitglieder finden
                    FOR v_member IN
                        SELECT p.id AS user_id
                        FROM profiles p
                        WHERE p.club_id = v_event.club_id
                          AND p.role = 'player'
                          AND (
                              v_event.target_type != 'subgroups'
                              OR v_event.target_subgroup_ids IS NULL
                              OR p.subgroup_ids::text[] && v_event.target_subgroup_ids::text[]
                          )
                    LOOP
                        -- Prüfen ob Einladung für diesen Termin existiert
                        -- (mit oder ohne occurrence_date, da ältere Einladungen kein occurrence_date haben)
                        SELECT id, status, lead_time_notified_at
                        INTO v_existing_inv
                        FROM event_invitations
                        WHERE event_id = v_event.id
                          AND user_id = v_member.user_id
                          AND (occurrence_date = v_occurrence_date OR occurrence_date IS NULL)
                        LIMIT 1;

                        IF v_existing_inv IS NULL THEN
                            -- Einladung erstellen (mit Exception-Handler für ältere unique constraints)
                            BEGIN
                                INSERT INTO event_invitations (event_id, user_id, occurrence_date, status, created_at)
                                VALUES (v_event.id, v_member.user_id, v_occurrence_date, 'pending', NOW())
                                RETURNING id INTO v_inv_id;

                                v_invitations_created := v_invitations_created + 1;
                            EXCEPTION WHEN unique_violation THEN
                                -- Einladung existiert bereits (alter Constraint ohne occurrence_date)
                                v_inv_id := NULL;
                            END;

                            -- Nur benachrichtigen wenn Einladung neu erstellt oder noch nicht benachrichtigt
                            IF v_inv_id IS NOT NULL THEN
                                -- Benachrichtigung erstellen (Trigger sendet Push automatisch)
                                INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
                                VALUES (
                                    v_member.user_id,
                                    'event_reminder',
                                    v_event.title,
                                    'Du wurdest zu "' || v_event.title || '" am ' || v_event_date_formatted || ' eingeladen. Bitte sage zu oder ab.',
                                    jsonb_build_object('event_id', v_event.id, 'occurrence_date', v_occurrence_date::text),
                                    false,
                                    NOW()
                                );

                                -- Tracking-Spalte setzen
                                UPDATE event_invitations
                                SET lead_time_notified_at = NOW()
                                WHERE id = v_inv_id;

                                v_notifications_sent := v_notifications_sent + 1;
                            END IF;

                        ELSIF v_existing_inv.lead_time_notified_at IS NULL
                              AND v_existing_inv.status = 'pending' THEN
                            -- Einladung existiert aber noch keine Benachrichtigung gesendet
                            INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
                            VALUES (
                                v_member.user_id,
                                'event_reminder',
                                v_event.title,
                                'Erinnerung: "' || v_event.title || '" am ' || v_event_date_formatted || '. Bitte sage zu oder ab.',
                                jsonb_build_object('event_id', v_event.id, 'occurrence_date', v_occurrence_date::text),
                                false,
                                NOW()
                            );

                            UPDATE event_invitations
                            SET lead_time_notified_at = NOW()
                            WHERE id = v_existing_inv.id;

                            v_notifications_sent := v_notifications_sent + 1;
                        END IF;
                        -- Wenn lead_time_notified_at gesetzt oder status != 'pending': überspringen

                    END LOOP; -- v_member
                END IF; -- im Vorlaufzeit-Fenster
            END IF; -- nicht ausgeschlossen

            -- Zum nächsten Termin
            v_occurrence_date := CASE v_event.repeat_type
                WHEN 'daily' THEN v_occurrence_date + INTERVAL '1 day'
                WHEN 'weekly' THEN v_occurrence_date + INTERVAL '7 days'
                WHEN 'biweekly' THEN v_occurrence_date + INTERVAL '14 days'
                WHEN 'monthly' THEN v_occurrence_date + INTERVAL '1 month'
                ELSE v_occurrence_date + INTERVAL '7 days'
            END;

            -- Repeat-End-Date prüfen
            IF v_event.repeat_end_date IS NOT NULL AND v_occurrence_date > v_event.repeat_end_date THEN
                EXIT;
            END IF;
        END LOOP; -- v_occurrence_date
    END LOOP; -- v_event

    RETURN jsonb_build_object(
        'invitations_created', v_invitations_created,
        'notifications_sent', v_notifications_sent,
        'checked_at', NOW()::text
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_child_login_setup(p_username text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_normalized_username TEXT;
    v_profile RECORD;
BEGIN
    v_normalized_username := LOWER(TRIM(COALESCE(p_username, '')));

    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.username,
        p.account_type,
        p.is_offline,
        (p.pin_hash IS NOT NULL AND p.pin_hash != '') as has_pin,
        EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id) as has_guardian
    INTO v_profile
    FROM profiles p
    WHERE p.username = v_normalized_username;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'found', FALSE,
            'message', 'Kein Profil mit diesem Benutzernamen gefunden'
        );
    END IF;

    RETURN json_build_object(
        'found', TRUE,
        'first_name', v_profile.first_name,
        'account_type', v_profile.account_type,
        'is_offline', v_profile.is_offline,
        'has_pin', v_profile.has_pin,
        'has_guardian', v_profile.has_guardian,
        'can_use_child_login', (
            v_profile.account_type = 'child'
            OR v_profile.is_offline = TRUE
            OR v_profile.has_guardian
        )
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_duplicate_child(p_club_id uuid, p_first_name text, p_last_name text, p_birthdate date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_child RECORD;
BEGIN
    -- Search for existing child profile with same name and birthdate in the club
    SELECT id, first_name, last_name, birthdate, display_name
    INTO v_existing_child
    FROM profiles
    WHERE club_id = p_club_id
    AND LOWER(TRIM(first_name)) = LOWER(TRIM(p_first_name))
    AND LOWER(TRIM(last_name)) = LOWER(TRIM(p_last_name))
    AND birthdate = p_birthdate
    AND (account_type = 'child' OR is_offline = true)
    LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object(
            'found', true,
            'child_id', v_existing_child.id,
            'display_name', v_existing_child.display_name,
            'message', 'Ein Kind mit diesem Namen und Geburtsdatum existiert bereits im Verein.'
        );
    END IF;

    RETURN json_build_object(
        'found', false,
        'child_id', NULL,
        'message', NULL
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_pin_rate_limit(p_username text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_recent_attempts INT;
    v_lockout_until TIMESTAMPTZ;
    v_normalized_username TEXT;
BEGIN
    v_normalized_username := LOWER(TRIM(p_username));

    -- Count failed attempts in the last 15 minutes
    SELECT COUNT(*) INTO v_recent_attempts
    FROM child_pin_attempts
    WHERE username = v_normalized_username
    AND attempted_at > now() - interval '15 minutes'
    AND success = false;

    -- Allow max 5 failed attempts per 15 minutes
    IF v_recent_attempts >= 5 THEN
        -- Find when the oldest attempt in the window was
        SELECT MIN(attempted_at) + interval '15 minutes' INTO v_lockout_until
        FROM child_pin_attempts
        WHERE username = v_normalized_username
        AND attempted_at > now() - interval '15 minutes'
        AND success = false;

        RETURN json_build_object(
            'allowed', false,
            'reason', 'Zu viele Fehlversuche. Bitte warte ' ||
                      EXTRACT(MINUTES FROM (v_lockout_until - now()))::INT || ' Minuten.',
            'lockout_until', v_lockout_until,
            'attempts_remaining', 0
        );
    END IF;

    RETURN json_build_object(
        'allowed', true,
        'attempts_remaining', 5 - v_recent_attempts
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_single_coach_sport()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Nur prüfen wenn Rolle coach oder head_coach ist
    IF NEW.role IN ('coach', 'head_coach') THEN
        -- Prüfen ob User bereits Coach/Head_Coach in einer anderen Sportart ist
        IF EXISTS (
            SELECT 1 FROM profile_club_sports
            WHERE user_id = NEW.user_id
            AND club_id = NEW.club_id
            AND sport_id != NEW.sport_id
            AND role IN ('coach', 'head_coach')
        ) THEN
            RAISE EXCEPTION 'Ein Benutzer kann nur in einer Sportart Coach oder Spartenleiter sein';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_username_available(p_username text, p_child_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_normalized_username TEXT;
    v_existing_id UUID;
BEGIN
    v_normalized_username := LOWER(TRIM(p_username));

    -- Check format
    IF LENGTH(v_normalized_username) < 3 THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Zu kurz (min. 3 Zeichen)'
        );
    END IF;

    IF LENGTH(v_normalized_username) > 30 THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Zu lang (max. 30 Zeichen)'
        );
    END IF;

    IF NOT v_normalized_username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' AND NOT v_normalized_username ~ '^[a-z0-9]$' THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Ungültige Zeichen'
        );
    END IF;

    -- Check if taken
    SELECT id INTO v_existing_id
    FROM profiles
    WHERE username = v_normalized_username
    AND (p_child_id IS NULL OR id != p_child_id);

    IF v_existing_id IS NOT NULL THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Bereits vergeben'
        );
    END IF;

    RETURN json_build_object(
        'available', TRUE,
        'normalized', v_normalized_username
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'available', FALSE,
        'reason', 'Fehler bei der Prüfung'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_invitation_code(p_user_id uuid, p_code text, p_code_id uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    code_data RECORD;
    existing_profile RECORD;
    old_player_data RECORD;
BEGIN
    -- Get code
    SELECT * INTO code_data FROM invitation_codes WHERE id = p_code_id;

    IF code_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code nicht gefunden');
    END IF;

    -- Validate code
    IF code_data.code != p_code THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code stimmt nicht überein');
    END IF;

    IF code_data.used = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code wurde bereits verwendet');
    END IF;

    IF code_data.superseded = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code wurde ersetzt');
    END IF;

    IF code_data.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code ist abgelaufen');
    END IF;

    -- Check if profile already exists
    SELECT * INTO existing_profile FROM profiles WHERE id = p_user_id;

    IF existing_profile IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profil existiert bereits');
    END IF;

    -- Check if this is a migration (existing offline player)
    IF code_data.player_id IS NOT NULL THEN
        -- Get old player data
        SELECT * INTO old_player_data FROM profiles WHERE id = code_data.player_id;

        IF old_player_data IS NOT NULL THEN
            -- Create new profile with old data
            INSERT INTO profiles (
                id, email, first_name, last_name, club_id, role,
                points, xp, elo_rating, highest_elo, wins, losses,
                doubles_elo_rating, doubles_highest_elo, doubles_wins, doubles_losses,
                league, onboarding_complete, is_offline, display_name,
                created_at, migrated_from, migrated_at
            ) VALUES (
                p_user_id, COALESCE(p_email, old_player_data.email),
                old_player_data.first_name, old_player_data.last_name,
                old_player_data.club_id, old_player_data.role,
                old_player_data.points, old_player_data.xp,
                old_player_data.elo_rating, old_player_data.highest_elo,
                old_player_data.wins, old_player_data.losses,
                old_player_data.doubles_elo_rating, old_player_data.doubles_highest_elo,
                old_player_data.doubles_wins, old_player_data.doubles_losses,
                old_player_data.league, false, true, old_player_data.display_name,
                NOW(), code_data.player_id, NOW()
            );

            -- Delete old offline profile
            DELETE FROM profiles WHERE id = code_data.player_id;
        END IF;
    ELSE
        -- Create new profile
        INSERT INTO profiles (
            id, email, first_name, last_name, club_id, role,
            points, xp, elo_rating, highest_elo, wins, losses,
            onboarding_complete, is_offline, created_at
        ) VALUES (
            p_user_id, p_email,
            code_data.first_name, code_data.last_name,
            code_data.club_id, COALESCE(code_data.role, 'player'),
            0, 0, 800, 800, 0, 0,
            false, true, NOW()
        );
    END IF;

    -- Mark code as used
    UPDATE invitation_codes SET
        used = true,
        used_by = p_user_id,
        used_at = NOW()
    WHERE id = p_code_id;

    RETURN jsonb_build_object('success', true, 'message', 'Code erfolgreich eingelöst');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_child_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_deleted INT;
BEGIN
    -- Delete expired sessions older than 7 days
    DELETE FROM child_sessions
    WHERE expires_at < now() - interval '7 days'
    OR (is_valid = false AND created_at < now() - interval '1 day');

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Also clean up old PIN attempts (older than 24 hours)
    DELETE FROM child_pin_attempts WHERE attempted_at < now() - interval '24 hours';

    RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_invitation_codes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM invitation_codes
    WHERE expires_at < NOW()
    AND used = false;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_guardian_links_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- When a profile is anonymized (email changed to deleted_*), remove all guardian links
    IF NEW.email LIKE 'deleted_%@anonymous.local' AND (OLD.email IS NULL OR OLD.email NOT LIKE 'deleted_%@anonymous.local') THEN
        DELETE FROM guardian_links WHERE child_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.count_audit_logs(p_action_filter text DEFAULT NULL::text, p_club_filter uuid DEFAULT NULL::uuid, p_sport_filter uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM audit_logs al
    WHERE
        (p_action_filter IS NULL OR al.action = p_action_filter)
        AND (p_club_filter IS NULL OR al.club_id = p_club_filter)
        AND (p_sport_filter IS NULL OR al.sport_id = p_sport_filter)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to);

    RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_child_profile(p_first_name text, p_last_name text, p_birthdate text, p_gender text DEFAULT NULL::text, p_club_id uuid DEFAULT NULL::uuid, p_sport_id uuid DEFAULT NULL::uuid, p_subgroup_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_guardian_profile RECORD;
    v_child_id UUID;
    v_display_name TEXT;
    v_age INT;
    v_age_mode TEXT;
    v_result JSON;
BEGIN
    -- Get the caller's ID (must be authenticated)
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get guardian's profile to check account type and get club if not provided
    SELECT * INTO v_guardian_profile
    FROM profiles
    WHERE id = v_guardian_id;

    -- Verify caller is a guardian (or will become one)
    -- First-time guardians will have 'standard' account type
    IF v_guardian_profile.account_type NOT IN ('standard', 'guardian') THEN
        RAISE EXCEPTION 'Only guardians can create child profiles';
    END IF;

    -- Validate birthdate and check age
    IF p_birthdate IS NULL THEN
        RAISE EXCEPTION 'Birthdate is required for child profiles';
    END IF;

    v_age := calculate_age(p_birthdate::DATE);
    v_age_mode := calculate_age_mode(p_birthdate::DATE);

    IF v_age >= 16 THEN
        RAISE EXCEPTION 'Child must be under 16 years old. Users 16+ should register themselves.';
    END IF;

    -- Use guardian's club if not provided
    IF p_club_id IS NULL THEN
        p_club_id := v_guardian_profile.club_id;
    END IF;

    -- Generate child ID
    v_child_id := gen_random_uuid();
    v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));

    -- Create child profile (similar to offline player)
    INSERT INTO profiles (
        id,
        first_name,
        last_name,
        display_name,
        birthdate,
        gender,
        club_id,
        active_sport_id,
        subgroup_ids,
        role,
        account_type,
        age_mode,
        is_offline,
        is_match_ready,
        onboarding_complete,
        elo_rating,
        highest_elo,
        xp,
        points,
        created_at,
        updated_at
    ) VALUES (
        v_child_id,
        p_first_name,
        p_last_name,
        v_display_name,
        p_birthdate::DATE,
        p_gender,
        p_club_id,
        p_sport_id,
        p_subgroup_ids,
        'player',
        'child',
        v_age_mode,
        TRUE,  -- Children are like offline players (no auth account)
        FALSE, -- Not match ready by default
        FALSE, -- Onboarding not complete
        800,
        800,
        0,
        0,
        now(),
        now()
    );

    -- Create profile_club_sports entry if sport provided
    IF p_sport_id IS NOT NULL AND p_club_id IS NOT NULL THEN
        INSERT INTO profile_club_sports (user_id, club_id, sport_id, role, created_at)
        VALUES (v_child_id, p_club_id, p_sport_id, 'player', now())
        ON CONFLICT (user_id, club_id, sport_id) DO NOTHING;
    END IF;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_guardian_id,
        v_child_id,
        'parent',
        TRUE,
        now(),
        '1.0'
    );

    -- Update guardian's account type if needed
    IF v_guardian_profile.account_type = 'standard' THEN
        UPDATE profiles
        SET account_type = 'guardian'
        WHERE id = v_guardian_id;
    END IF;

    -- Log consent
    INSERT INTO guardian_consent_log (
        guardian_id,
        child_id,
        consent_type,
        terms_version
    ) VALUES (
        v_guardian_id,
        v_child_id,
        'registration',
        '1.0'
    );

    -- Return the new child profile
    SELECT json_build_object(
        'success', TRUE,
        'child_id', v_child_id,
        'first_name', p_first_name,
        'last_name', p_last_name,
        'age', v_age,
        'age_mode', v_age_mode,
        'club_id', p_club_id
    ) INTO v_result;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_club_join_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_club_name TEXT;
    v_old_club_name TEXT;
BEGIN
    -- Handle CLUB JOIN: club_id changed from NULL to a value, or changed to a different club
    IF (OLD.club_id IS DISTINCT FROM NEW.club_id) AND NEW.club_id IS NOT NULL THEN
        -- Get club name
        SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

        -- Insert club join activity event
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NEW.club_id,
            'club_join',
            jsonb_build_object(
                'club_name', COALESCE(v_club_name, 'Unbekannt'),
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url
            )
        );
    END IF;

    -- Handle CLUB LEAVE: club_id changed from a value to NULL
    IF OLD.club_id IS NOT NULL AND NEW.club_id IS NULL THEN
        -- Get old club name for the event
        SELECT name INTO v_old_club_name FROM clubs WHERE id = OLD.club_id;

        -- Insert club leave activity event
        -- Note: We use OLD.club_id so the event is visible to the old club members
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            OLD.club_id,  -- Use the OLD club_id so event shows for the club that was left
            'club_leave',
            jsonb_build_object(
                'club_name', COALESCE(v_old_club_name, 'Unbekannt'),
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url
            )
        );
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_doubles_pairing_ranking_events()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_club_position INT;
    v_new_club_position INT;
    v_old_global_position INT;
    v_new_global_position INT;
    v_club_pairing_count INT;
    v_global_pairing_count INT;
    v_position_medal TEXT;
    v_old_holder_id TEXT;
    v_old_holder_names TEXT;
    v_old_holder_elo INT;
    v_direction TEXT;
    v_player1_exists BOOLEAN;
    v_player2_exists BOOLEAN;
    v_player1_offline BOOLEAN;
    v_player2_offline BOOLEAN;
    v_player1_name TEXT;
    v_player2_name TEXT;
    v_display_name TEXT;
    v_sport_id UUID;
BEGIN
    -- Only process if Elo actually changed
    IF OLD.current_elo_rating IS NOT DISTINCT FROM NEW.current_elo_rating THEN
        RETURN NEW;
    END IF;

    -- Get the pairing's sport (rankings are per-sport)
    v_sport_id := NEW.sport_id;

    -- Get player names from profiles table (more reliable than pairing names)
    SELECT COALESCE(display_name, first_name, 'Spieler 1'), is_offline
    INTO v_player1_name, v_player1_offline
    FROM profiles WHERE id = NEW.player1_id;

    SELECT COALESCE(display_name, first_name, 'Spieler 2'), is_offline
    INTO v_player2_name, v_player2_offline
    FROM profiles WHERE id = NEW.player2_id;

    -- Build display name
    v_display_name := v_player1_name || ' & ' || v_player2_name;

    IF v_player1_offline IS TRUE AND v_player2_offline IS TRUE THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = NEW.player1_id) INTO v_player1_exists;
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = NEW.player2_id) INTO v_player2_exists;

    -- At least one real user must exist
    IF NOT v_player1_exists AND NOT v_player2_exists THEN
        RETURN NEW;
    END IF;

    -- ============================================
    -- CLUB TOP 10 DOUBLES PAIRING RANKING
    -- ============================================

    IF NEW.club_id IS NOT NULL THEN
        -- Count pairings in club for the same sport (minimum 3 needed)
        SELECT COUNT(*) INTO v_club_pairing_count
        FROM doubles_pairings
        WHERE club_id = NEW.club_id
          AND matches_played > 0
          AND (v_sport_id IS NULL OR sport_id = v_sport_id);

        IF v_club_pairing_count >= 3 THEN
            -- Calculate old position - filtered by sport
            v_old_club_position := get_club_doubles_pairing_position(NEW.id, NEW.club_id, COALESCE(OLD.current_elo_rating, 800), v_sport_id);
            -- Calculate new position - filtered by sport
            v_new_club_position := get_club_doubles_pairing_position(NEW.id, NEW.club_id, NEW.current_elo_rating, v_sport_id);

            -- Only create event for TOP 10 changes
            IF (v_old_club_position > 10 AND v_new_club_position <= 10) OR
               (v_old_club_position <= 10 AND v_new_club_position > 10) OR
               (v_old_club_position <= 10 AND v_new_club_position <= 10 AND v_old_club_position != v_new_club_position) THEN

                -- Determine direction
                IF v_new_club_position < v_old_club_position THEN
                    v_direction := 'up';
                ELSE
                    v_direction := 'down';
                END IF;

                -- Get medal emoji for top 3
                v_position_medal := CASE v_new_club_position
                    WHEN 1 THEN '🥇'
                    WHEN 2 THEN '🥈'
                    WHEN 3 THEN '🥉'
                    ELSE ''
                END;

                -- Get previous holder info (if moving up) - filtered by sport
                IF v_direction = 'up' AND v_new_club_position <= 10 THEN
                    SELECT
                        dp.id,
                        COALESCE(dp.player1_name, '') || ' & ' || COALESCE(dp.player2_name, ''),
                        dp.current_elo_rating
                    INTO v_old_holder_id, v_old_holder_names, v_old_holder_elo
                    FROM doubles_pairings dp
                    WHERE dp.club_id = NEW.club_id
                      AND dp.id != NEW.id
                      AND dp.matches_played > 0
                      AND (v_sport_id IS NULL OR dp.sport_id = v_sport_id)
                    ORDER BY dp.current_elo_rating DESC, dp.matches_played DESC
                    OFFSET (v_new_club_position - 1)
                    LIMIT 1;
                END IF;

                -- Create event for player 1 (if real user)
                IF v_player1_exists AND v_player1_offline IS NOT TRUE THEN
                    INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                    VALUES (
                        NEW.player1_id,
                        NEW.club_id,
                        'club_doubles_ranking_change',
                        jsonb_build_object(
                            'pairing_id', NEW.id,
                            'player1_id', NEW.player1_id,
                            'player2_id', NEW.player2_id,
                            'player1_name', v_player1_name,
                            'player2_name', v_player2_name,
                            'display_name', v_display_name,
                            'new_position', v_new_club_position,
                            'old_position', v_old_club_position,
                            'position_medal', v_position_medal,
                            'elo_rating', NEW.current_elo_rating,
                            'previous_holder_id', v_old_holder_id,
                            'previous_holder_name', v_old_holder_names,
                            'previous_holder_elo', v_old_holder_elo,
                            'direction', v_direction,
                            'ranking_type', 'club_doubles_pairing',
                            'sport_id', v_sport_id
                        )
                    );
                END IF;

                -- Create event for player 2 (if real user and different from player 1)
                IF v_player2_exists AND v_player2_offline IS NOT TRUE AND NEW.player2_id != NEW.player1_id THEN
                    INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                    VALUES (
                        NEW.player2_id,
                        NEW.club_id,
                        'club_doubles_ranking_change',
                        jsonb_build_object(
                            'pairing_id', NEW.id,
                            'player1_id', NEW.player1_id,
                            'player2_id', NEW.player2_id,
                            'player1_name', v_player1_name,
                            'player2_name', v_player2_name,
                            'display_name', v_display_name,
                            'new_position', v_new_club_position,
                            'old_position', v_old_club_position,
                            'position_medal', v_position_medal,
                            'elo_rating', NEW.current_elo_rating,
                            'previous_holder_id', v_old_holder_id,
                            'previous_holder_name', v_old_holder_names,
                            'previous_holder_elo', v_old_holder_elo,
                            'direction', v_direction,
                            'ranking_type', 'club_doubles_pairing',
                            'sport_id', v_sport_id
                        )
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    -- ============================================
    -- GLOBAL DOUBLES PAIRING RANKING - filtered by sport
    -- ============================================

    -- Count global pairings for the same sport (minimum 3 needed)
    SELECT COUNT(*) INTO v_global_pairing_count
    FROM doubles_pairings
    WHERE matches_played > 0
      AND (v_sport_id IS NULL OR sport_id = v_sport_id);

    IF v_global_pairing_count >= 3 THEN
        -- Calculate positions - filtered by sport
        v_old_global_position := get_global_doubles_pairing_position(NEW.id, COALESCE(OLD.current_elo_rating, 800), v_sport_id);
        v_new_global_position := get_global_doubles_pairing_position(NEW.id, NEW.current_elo_rating, v_sport_id);

        -- Only create event if position changed
        IF v_old_global_position != v_new_global_position THEN
            -- Determine direction
            IF v_new_global_position < v_old_global_position THEN
                v_direction := 'up';
            ELSE
                v_direction := 'down';
            END IF;

            -- Get medal emoji for top 3
            v_position_medal := CASE v_new_global_position
                WHEN 1 THEN '🥇'
                WHEN 2 THEN '🥈'
                WHEN 3 THEN '🥉'
                ELSE ''
            END;

            -- Create event for player 1 (if real user)
            IF v_player1_exists AND v_player1_offline IS NOT TRUE THEN
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.player1_id,
                    NEW.club_id,
                    'global_doubles_ranking_change',
                    jsonb_build_object(
                        'pairing_id', NEW.id,
                        'player1_id', NEW.player1_id,
                        'player2_id', NEW.player2_id,
                        'player1_name', v_player1_name,
                        'player2_name', v_player2_name,
                        'display_name', v_display_name,
                        'new_position', v_new_global_position,
                        'old_position', v_old_global_position,
                        'positions_changed', ABS(v_new_global_position - v_old_global_position),
                        'position_medal', v_position_medal,
                        'elo_rating', NEW.current_elo_rating,
                        'direction', v_direction,
                        'ranking_type', 'global_doubles_pairing',
                        'sport_id', v_sport_id
                    )
                );
            END IF;

            -- Create event for player 2 (if real user and different)
            IF v_player2_exists AND v_player2_offline IS NOT TRUE AND NEW.player2_id != NEW.player1_id THEN
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.player2_id,
                    NEW.club_id,
                    'global_doubles_ranking_change',
                    jsonb_build_object(
                        'pairing_id', NEW.id,
                        'player1_id', NEW.player1_id,
                        'player2_id', NEW.player2_id,
                        'player1_name', v_player1_name,
                        'player2_name', v_player2_name,
                        'display_name', v_display_name,
                        'new_position', v_new_global_position,
                        'old_position', v_old_global_position,
                        'positions_changed', ABS(v_new_global_position - v_old_global_position),
                        'position_medal', v_position_medal,
                        'elo_rating', NEW.current_elo_rating,
                        'direction', v_direction,
                        'ranking_type', 'global_doubles_pairing',
                        'sport_id', v_sport_id
                    )
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_doubles_ranking_change_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_old_club_position INT;
    v_new_club_position INT;
    v_old_global_position INT;
    v_new_global_position INT;
    v_club_player_count INT;
    v_position_medal TEXT;
    v_old_holder_id UUID;
    v_old_holder_name TEXT;
    v_old_holder_elo INT;
    v_direction TEXT;
    v_user_exists BOOLEAN;
BEGIN
    -- Only process if Doubles Elo actually changed
    IF OLD.doubles_elo_rating IS NOT DISTINCT FROM NEW.doubles_elo_rating THEN
        RETURN NEW;
    END IF;

    -- Skip offline players (they don't exist in auth.users)
    IF NEW.is_offline = true THEN
        RETURN NEW;
    END IF;

    -- Check if user exists in auth.users (foreign key requirement)
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = NEW.id) INTO v_user_exists;
    IF NOT v_user_exists THEN
        RETURN NEW;
    END IF;

    -- ============================================
    -- CLUB TOP 10 DOUBLES RANKING CHANGE
    -- ============================================

    IF NEW.club_id IS NOT NULL THEN
        -- Count players in club (minimum 3 needed for ranking to matter)
        SELECT COUNT(*) INTO v_club_player_count
        FROM profiles
        WHERE club_id = NEW.club_id
          AND role IN ('player', 'coach', 'head_coach');

        IF v_club_player_count >= 3 THEN
            -- Calculate old position (with old Doubles Elo)
            SELECT COUNT(*) + 1 INTO v_old_club_position
            FROM profiles
            WHERE club_id = NEW.club_id
              AND role IN ('player', 'coach', 'head_coach')
              AND id != NEW.id
              AND (
                  COALESCE(doubles_elo_rating, 800) > COALESCE(OLD.doubles_elo_rating, 800)
                  OR (COALESCE(doubles_elo_rating, 800) = COALESCE(OLD.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
              );

            -- Calculate new position (with new Doubles Elo)
            SELECT COUNT(*) + 1 INTO v_new_club_position
            FROM profiles
            WHERE club_id = NEW.club_id
              AND role IN ('player', 'coach', 'head_coach')
              AND id != NEW.id
              AND (
                  COALESCE(doubles_elo_rating, 800) > COALESCE(NEW.doubles_elo_rating, 800)
                  OR (COALESCE(doubles_elo_rating, 800) = COALESCE(NEW.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
              );

            -- Only create event for TOP 10 changes
            IF (v_old_club_position > 10 AND v_new_club_position <= 10) OR
               (v_old_club_position <= 10 AND v_new_club_position > 10) OR
               (v_old_club_position <= 10 AND v_new_club_position <= 10 AND v_old_club_position != v_new_club_position) THEN

                -- Determine direction
                IF v_new_club_position < v_old_club_position THEN
                    v_direction := 'up';
                ELSE
                    v_direction := 'down';
                END IF;

                -- Get medal emoji for top 3
                v_position_medal := CASE v_new_club_position
                    WHEN 1 THEN '🥇'
                    WHEN 2 THEN '🥈'
                    WHEN 3 THEN '🥉'
                    ELSE ''
                END;

                -- Get the previous holder of the new position (if moving up)
                IF v_direction = 'up' AND v_new_club_position <= 10 THEN
                    WITH ranked_before AS (
                        SELECT
                            p.id,
                            COALESCE(p.display_name, p.first_name, 'Spieler') as display_name,
                            COALESCE(p.doubles_elo_rating, 800) as doubles_elo_rating,
                            ROW_NUMBER() OVER (
                                ORDER BY
                                    CASE WHEN p.id = NEW.id THEN COALESCE(OLD.doubles_elo_rating, 800) ELSE COALESCE(p.doubles_elo_rating, 800) END DESC,
                                    COALESCE(p.doubles_matches_played, 0) DESC
                            ) as old_position
                        FROM profiles p
                        WHERE p.club_id = NEW.club_id
                          AND p.role IN ('player', 'coach', 'head_coach')
                    )
                    SELECT id, display_name, doubles_elo_rating
                    INTO v_old_holder_id, v_old_holder_name, v_old_holder_elo
                    FROM ranked_before
                    WHERE old_position = v_new_club_position AND id != NEW.id;
                END IF;

                -- Create the club doubles ranking change event
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.id,
                    NEW.club_id,
                    'club_doubles_ranking_change',
                    jsonb_build_object(
                        'new_position', v_new_club_position,
                        'old_position', v_old_club_position,
                        'position_medal', v_position_medal,
                        'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                        'avatar_url', NEW.avatar_url,
                        'elo_rating', NEW.doubles_elo_rating,
                        'previous_holder_id', v_old_holder_id,
                        'previous_holder_name', v_old_holder_name,
                        'previous_holder_elo', v_old_holder_elo,
                        'direction', v_direction,
                        'ranking_type', 'club_doubles'
                    )
                );
            END IF;
        END IF;
    END IF;

    -- ============================================
    -- GLOBAL DOUBLES RANKING CHANGE (for followers)
    -- ============================================

    -- Calculate old global position (with old Doubles Elo)
    SELECT COUNT(*) + 1 INTO v_old_global_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != NEW.id
      AND (
          COALESCE(doubles_elo_rating, 800) > COALESCE(OLD.doubles_elo_rating, 800)
          OR (COALESCE(doubles_elo_rating, 800) = COALESCE(OLD.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
      );

    -- Calculate new global position (with new Doubles Elo)
    SELECT COUNT(*) + 1 INTO v_new_global_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != NEW.id
      AND (
          COALESCE(doubles_elo_rating, 800) > COALESCE(NEW.doubles_elo_rating, 800)
          OR (COALESCE(doubles_elo_rating, 800) = COALESCE(NEW.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
      );

    -- Create event for ANY global position change
    IF v_old_global_position != v_new_global_position THEN
        -- Determine direction
        IF v_new_global_position < v_old_global_position THEN
            v_direction := 'up';
        ELSE
            v_direction := 'down';
        END IF;

        -- Get medal emoji for top 3
        v_position_medal := CASE v_new_global_position
            WHEN 1 THEN '🥇'
            WHEN 2 THEN '🥈'
            WHEN 3 THEN '🥉'
            ELSE ''
        END;

        -- Create the global doubles ranking change event (NO club_id so it's not club-visible)
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NULL,  -- Important: NULL club_id means it won't show in club feed
            'global_doubles_ranking_change',
            jsonb_build_object(
                'new_position', v_new_global_position,
                'old_position', v_old_global_position,
                'position_medal', v_position_medal,
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url,
                'elo_rating', NEW.doubles_elo_rating,
                'direction', v_direction,
                'ranking_type', 'global_doubles',
                'positions_changed', ABS(v_new_global_position - v_old_global_position)
            )
        );
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_chat(current_user_id uuid, group_name text, member_ids uuid[], p_club_id uuid DEFAULT NULL::uuid, p_subgroup_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_conversation_id UUID;
    member_id UUID;
BEGIN
    -- Validierung
    IF group_name IS NULL OR char_length(trim(group_name)) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Gruppenname ist erforderlich');
    END IF;

    IF array_length(member_ids, 1) IS NULL OR array_length(member_ids, 1) < 1 THEN
        RETURN json_build_object('success', false, 'error', 'Mindestens ein Mitglied erforderlich');
    END IF;

    -- Gruppen-Chat erstellen
    INSERT INTO chat_conversations (type, name, club_id, subgroup_id, created_by)
    VALUES ('group', trim(group_name), p_club_id, p_subgroup_id, current_user_id)
    RETURNING id INTO new_conversation_id;

    -- Ersteller als Admin hinzufügen
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES (new_conversation_id, current_user_id, 'admin');

    -- Mitglieder hinzufügen
    FOREACH member_id IN ARRAY member_ids LOOP
        IF member_id != current_user_id THEN
            INSERT INTO chat_participants (conversation_id, user_id, role)
            VALUES (new_conversation_id, member_id, 'member')
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;
    END LOOP;

    RETURN json_build_object('success', true, 'conversation_id', new_conversation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_hauptgruppe_for_club(p_club_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_hauptgruppe_id UUID;
BEGIN
    -- Check if Hauptgruppe already exists
    SELECT id INTO v_hauptgruppe_id
    FROM subgroups
    WHERE club_id = p_club_id AND is_default = true
    LIMIT 1;

    -- If exists, return existing ID
    IF v_hauptgruppe_id IS NOT NULL THEN
        RETURN v_hauptgruppe_id;
    END IF;

    -- Create new Hauptgruppe
    INSERT INTO subgroups (id, club_id, name, color, is_default, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        p_club_id,
        'Hauptgruppe',
        '#6366f1',  -- Indigo color
        true,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_hauptgruppe_id;

    RETURN v_hauptgruppe_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_offline_player(p_first_name text, p_last_name text, p_club_id uuid, p_subgroup_ids uuid[] DEFAULT '{}'::uuid[], p_birthdate text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_sport_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_new_player_id UUID;
    v_display_name TEXT;
    v_result JSON;
    v_hauptgruppe_id UUID;
    v_final_subgroup_ids UUID[];
BEGIN
    -- Get the caller's ID
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if caller is coach, head_coach, or admin in this club
    SELECT role INTO v_caller_role
    FROM profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('coach', 'head_coach', 'admin') THEN
        -- Also check profile_club_sports for sport-specific coach role
        SELECT pcs.role INTO v_caller_role
        FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id
          AND pcs.club_id = p_club_id
          AND pcs.role IN ('coach', 'head_coach');

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Not authorized to create players';
        END IF;
    END IF;

    -- Generate a new UUID for the offline player
    v_new_player_id := gen_random_uuid();

    -- Create display name
    v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));

    -- Get or create Hauptgruppe for this club
    v_hauptgruppe_id := get_hauptgruppe_id(p_club_id);
    IF v_hauptgruppe_id IS NULL THEN
        v_hauptgruppe_id := create_hauptgruppe_for_club(p_club_id);
    END IF;

    -- Merge provided subgroup_ids with Hauptgruppe (ensure Hauptgruppe is always included)
    IF v_hauptgruppe_id IS NOT NULL THEN
        IF p_subgroup_ids IS NULL OR array_length(p_subgroup_ids, 1) IS NULL THEN
            v_final_subgroup_ids := ARRAY[v_hauptgruppe_id];
        ELSIF NOT (v_hauptgruppe_id = ANY(p_subgroup_ids)) THEN
            v_final_subgroup_ids := array_append(p_subgroup_ids, v_hauptgruppe_id);
        ELSE
            v_final_subgroup_ids := p_subgroup_ids;
        END IF;
    ELSE
        v_final_subgroup_ids := COALESCE(p_subgroup_ids, '{}');
    END IF;

    -- Create the offline player profile
    INSERT INTO profiles (
        id,
        first_name,
        last_name,
        display_name,
        club_id,
        role,
        is_offline,
        onboarding_complete,
        points,
        elo_rating,
        highest_elo,
        xp,
        subgroup_ids,
        birthdate,
        gender,
        active_sport_id,
        created_at,
        updated_at
    ) VALUES (
        v_new_player_id,
        p_first_name,
        p_last_name,
        v_display_name,
        p_club_id,
        'player',
        TRUE,
        FALSE,
        0,
        800,
        800,
        0,
        v_final_subgroup_ids,
        CASE WHEN p_birthdate IS NOT NULL THEN p_birthdate::DATE ELSE NULL END,
        p_gender,
        p_sport_id,
        NOW(),
        NOW()
    );

    -- If sport_id is provided, also create profile_club_sports entry
    IF p_sport_id IS NOT NULL AND p_club_id IS NOT NULL THEN
        INSERT INTO profile_club_sports (user_id, club_id, sport_id, role, created_at)
        VALUES (v_new_player_id, p_club_id, p_sport_id, 'player', NOW())
        ON CONFLICT (user_id, club_id, sport_id) DO NOTHING;
    END IF;

    -- Return the new player data
    SELECT json_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'club_id', p.club_id,
        'role', p.role,
        'is_offline', p.is_offline,
        'xp', p.xp,
        'points', p.points,
        'elo_rating', p.elo_rating,
        'subgroup_ids', p.subgroup_ids,
        'birthdate', p.birthdate,
        'gender', p.gender
    ) INTO v_result
    FROM profiles p
    WHERE p.id = v_new_player_id;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_rank_up_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_old_rank TEXT;
    v_new_rank TEXT;
    v_old_rank_order INT;
    v_new_rank_order INT;
    v_existing_event UUID;
BEGIN
    v_old_rank := calculate_rank(
        COALESCE(OLD.elo_rating, 800),
        COALESCE(OLD.xp, 0),
        COALESCE(OLD.grundlagen_completed, 0)
    );

    v_new_rank := calculate_rank(
        COALESCE(NEW.elo_rating, 800),
        COALESCE(NEW.xp, 0),
        COALESCE(NEW.grundlagen_completed, 0)
    );

    IF v_old_rank != v_new_rank THEN
        v_old_rank_order := get_rank_order(v_old_rank);
        v_new_rank_order := get_rank_order(v_new_rank);

        IF v_new_rank_order > v_old_rank_order THEN
            -- Check if we already have a rank_up event for this user and rank
            SELECT id INTO v_existing_event
            FROM activity_events
            WHERE user_id = NEW.id
              AND event_type = 'rank_up'
              AND event_data->>'rank_name' = v_new_rank
            LIMIT 1;

            -- Only insert if no existing event for this rank
            IF v_existing_event IS NULL THEN
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.id,
                    NEW.club_id,
                    'rank_up',
                    jsonb_build_object(
                        'rank_name', v_new_rank,
                        'old_rank_name', v_old_rank,
                        'old_rank_order', v_old_rank_order,
                        'new_rank_order', v_new_rank_order,
                        'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                        'avatar_url', NEW.avatar_url,
                        'elo_rating', NEW.elo_rating,
                        'xp', NEW.xp
                    )
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_ranking_change_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_old_club_position INT;
    v_new_club_position INT;
    v_old_global_position INT;
    v_new_global_position INT;
    v_club_player_count INT;
    v_position_medal TEXT;
    v_old_holder_id UUID;
    v_old_holder_name TEXT;
    v_old_holder_elo INT;
    v_direction TEXT;
    v_sport_id UUID;
BEGIN
    -- Only process if Elo actually changed
    IF OLD.elo_rating IS NOT DISTINCT FROM NEW.elo_rating THEN
        RETURN NEW;
    END IF;

    -- Get the player's active sport (rankings are per-sport)
    v_sport_id := NEW.active_sport_id;

    -- ============================================
    -- CLUB TOP 10 RANKING CHANGE
    -- ============================================

    IF NEW.club_id IS NOT NULL THEN
        -- Count players in club for the same sport (minimum 3 needed for ranking to matter)
        SELECT COUNT(*) INTO v_club_player_count
        FROM profiles
        WHERE club_id = NEW.club_id
          AND role IN ('player', 'coach', 'head_coach')
          AND (v_sport_id IS NULL OR active_sport_id = v_sport_id);

        IF v_club_player_count >= 3 THEN
            -- Calculate old position (with old Elo) - filtered by sport
            SELECT COUNT(*) + 1 INTO v_old_club_position
            FROM profiles
            WHERE club_id = NEW.club_id
              AND role IN ('player', 'coach', 'head_coach')
              AND id != NEW.id
              AND (v_sport_id IS NULL OR active_sport_id = v_sport_id)
              AND (
                  COALESCE(elo_rating, 800) > COALESCE(OLD.elo_rating, 800)
                  OR (COALESCE(elo_rating, 800) = COALESCE(OLD.elo_rating, 800) AND COALESCE(matches_played, 0) > COALESCE(NEW.matches_played, 0))
              );

            -- Calculate new position (with new Elo) - filtered by sport
            SELECT COUNT(*) + 1 INTO v_new_club_position
            FROM profiles
            WHERE club_id = NEW.club_id
              AND role IN ('player', 'coach', 'head_coach')
              AND id != NEW.id
              AND (v_sport_id IS NULL OR active_sport_id = v_sport_id)
              AND (
                  COALESCE(elo_rating, 800) > COALESCE(NEW.elo_rating, 800)
                  OR (COALESCE(elo_rating, 800) = COALESCE(NEW.elo_rating, 800) AND COALESCE(matches_played, 0) > COALESCE(NEW.matches_played, 0))
              );

            -- Only create event for TOP 10 changes
            IF (v_old_club_position > 10 AND v_new_club_position <= 10) OR
               (v_old_club_position <= 10 AND v_new_club_position > 10) OR
               (v_old_club_position <= 10 AND v_new_club_position <= 10 AND v_old_club_position != v_new_club_position) THEN

                -- Determine direction
                IF v_new_club_position < v_old_club_position THEN
                    v_direction := 'up';
                ELSE
                    v_direction := 'down';
                END IF;

                -- Get medal emoji for top 3
                v_position_medal := CASE v_new_club_position
                    WHEN 1 THEN '🥇'
                    WHEN 2 THEN '🥈'
                    WHEN 3 THEN '🥉'
                    ELSE ''
                END;

                -- Get the previous holder of the new position (if moving up)
                IF v_direction = 'up' AND v_new_club_position <= 10 THEN
                    WITH ranked_before AS (
                        SELECT
                            p.id,
                            COALESCE(p.display_name, p.first_name, 'Spieler') as display_name,
                            COALESCE(p.elo_rating, 800) as elo_rating,
                            ROW_NUMBER() OVER (
                                ORDER BY
                                    CASE WHEN p.id = NEW.id THEN COALESCE(OLD.elo_rating, 800) ELSE COALESCE(p.elo_rating, 800) END DESC,
                                    COALESCE(p.matches_played, 0) DESC
                            ) as old_position
                        FROM profiles p
                        WHERE p.club_id = NEW.club_id
                          AND p.role IN ('player', 'coach', 'head_coach')
                          AND (v_sport_id IS NULL OR p.active_sport_id = v_sport_id)
                    )
                    SELECT id, display_name, elo_rating
                    INTO v_old_holder_id, v_old_holder_name, v_old_holder_elo
                    FROM ranked_before
                    WHERE old_position = v_new_club_position AND id != NEW.id;
                END IF;

                -- Create the club ranking change event
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.id,
                    NEW.club_id,
                    'club_ranking_change',
                    jsonb_build_object(
                        'new_position', v_new_club_position,
                        'old_position', v_old_club_position,
                        'position_medal', v_position_medal,
                        'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                        'avatar_url', NEW.avatar_url,
                        'elo_rating', NEW.elo_rating,
                        'previous_holder_id', v_old_holder_id,
                        'previous_holder_name', v_old_holder_name,
                        'previous_holder_elo', v_old_holder_elo,
                        'direction', v_direction,
                        'ranking_type', 'club',
                        'sport_id', v_sport_id
                    )
                );
            END IF;
        END IF;
    END IF;

    -- ============================================
    -- GLOBAL RANKING CHANGE (for followers) - filtered by sport
    -- ============================================

    -- Calculate old global position (with old Elo) - filtered by sport
    SELECT COUNT(*) + 1 INTO v_old_global_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != NEW.id
      AND (v_sport_id IS NULL OR active_sport_id = v_sport_id)
      AND (
          COALESCE(elo_rating, 800) > COALESCE(OLD.elo_rating, 800)
          OR (COALESCE(elo_rating, 800) = COALESCE(OLD.elo_rating, 800) AND COALESCE(matches_played, 0) > COALESCE(NEW.matches_played, 0))
      );

    -- Calculate new global position (with new Elo) - filtered by sport
    SELECT COUNT(*) + 1 INTO v_new_global_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != NEW.id
      AND (v_sport_id IS NULL OR active_sport_id = v_sport_id)
      AND (
          COALESCE(elo_rating, 800) > COALESCE(NEW.elo_rating, 800)
          OR (COALESCE(elo_rating, 800) = COALESCE(NEW.elo_rating, 800) AND COALESCE(matches_played, 0) > COALESCE(NEW.matches_played, 0))
      );

    -- Create event for ANY global position change
    IF v_old_global_position != v_new_global_position THEN
        -- Determine direction
        IF v_new_global_position < v_old_global_position THEN
            v_direction := 'up';
        ELSE
            v_direction := 'down';
        END IF;

        -- Get medal emoji for top 3
        v_position_medal := CASE v_new_global_position
            WHEN 1 THEN '🥇'
            WHEN 2 THEN '🥈'
            WHEN 3 THEN '🥉'
            ELSE ''
        END;

        -- Create the global ranking change event (NO club_id so it's not club-visible)
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NULL,  -- Important: NULL club_id means it won't show in club feed
            'global_ranking_change',
            jsonb_build_object(
                'new_position', v_new_global_position,
                'old_position', v_old_global_position,
                'position_medal', v_position_medal,
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url,
                'elo_rating', NEW.elo_rating,
                'direction', v_direction,
                'ranking_type', 'global',
                'positions_changed', ABS(v_new_global_position - v_old_global_position),
                'sport_id', v_sport_id
            )
        );
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_training_summary(p_user_id uuid, p_club_id uuid, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post_id UUID;
    v_coach_id UUID;
    v_is_coach BOOLEAN;
BEGIN
    -- Get the current user (coach)
    v_coach_id := auth.uid();

    -- Check if the current user is a coach in the player's club
    -- Check both profile_club_sports (per-sport role) and profiles table (global role)
    SELECT EXISTS (
        SELECT 1 FROM profile_club_sports pcs
        WHERE pcs.user_id = v_coach_id
        AND pcs.club_id = p_club_id
        AND pcs.role IN ('coach', 'head_coach')
    ) OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = v_coach_id
        AND p.club_id = p_club_id
        AND p.role IN ('coach', 'head_coach')
    ) INTO v_is_coach;

    IF NOT v_is_coach THEN
        RAISE EXCEPTION 'Not authorized: User is not a coach in this club';
    END IF;

    -- Insert the training summary post
    INSERT INTO community_posts (
        user_id,
        club_id,
        content,
        visibility,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_club_id,
        p_content,
        'club',  -- Only visible within the club
        NOW(),
        NOW()
    )
    RETURNING id INTO v_post_id;

    RETURN v_post_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deactivate_push_subscription(p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE push_subscriptions
    SET is_active = false
    WHERE endpoint = p_endpoint;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decline_friend_request(current_user_id uuid, friendship_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    friendship friendships%ROWTYPE;
    decliner_name TEXT;
    decliner_profile profiles%ROWTYPE;
BEGIN
    -- Get friendship
    SELECT * INTO friendship
    FROM friendships
    WHERE id = friendship_id
    AND addressee_id = current_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Follow request not found or not pending');
    END IF;

    -- Get decliner name
    SELECT * INTO decliner_profile FROM profiles WHERE id = current_user_id;
    decliner_name := COALESCE(decliner_profile.first_name, '') || ' ' || COALESCE(decliner_profile.last_name, '');
    decliner_name := TRIM(decliner_name);
    IF decliner_name = '' THEN
        decliner_name := 'Ein Nutzer';
    END IF;

    -- Delete the friendship request
    DELETE FROM friendships WHERE id = friendship_id;

    -- Send notification to requester about decline
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        friendship.requester_id,
        'follow_request_declined',
        'Anfrage abgelehnt',
        decliner_name || ' hat deine Anfrage abgelehnt',
        json_build_object('user_id', current_user_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Follow request declined'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_poll_votes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE community_polls
    SET total_votes = GREATEST(0, total_votes - 1),
        options = (
            SELECT jsonb_agg(
                CASE
                    WHEN elem->>'id' = OLD.option_id
                    THEN jsonb_set(elem, '{votes}', to_jsonb(GREATEST(0, COALESCE((elem->>'votes')::int, 0) - 1)))
                    ELSE elem
                END
            )
            FROM jsonb_array_elements(options) elem
        )
    WHERE id = OLD.poll_id;
    RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_post_likes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE community_posts
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_player_points(p_user_id uuid, p_points integer, p_xp integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE profiles
    SET
        points = GREATEST(0, COALESCE(points, 0) - p_points),
        xp = GREATEST(0, COALESCE(xp, 0) - COALESCE(p_xp, p_points)),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_activity_comment(p_comment_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity_id UUID;
    v_activity_type TEXT;
    v_comment_count INT;
BEGIN
    -- Get activity info and verify ownership
    SELECT activity_id, activity_type INTO v_activity_id, v_activity_type
    FROM activity_comments
    WHERE id = p_comment_id AND user_id = v_user_id;

    IF v_activity_id IS NULL THEN
        RAISE EXCEPTION 'Comment not found or you do not have permission to delete it';
    END IF;

    -- Delete comment
    DELETE FROM activity_comments WHERE id = p_comment_id;

    -- Get updated comment count
    SELECT COUNT(*) INTO v_comment_count
    FROM activity_comments
    WHERE activity_id = v_activity_id AND activity_type = v_activity_type;

    RETURN json_build_object(
        'comment_count', v_comment_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_offline_player(p_offline_player_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_deleted_count INT;
BEGIN
    -- First, clear any invitation_code references to this player
    UPDATE invitation_codes SET player_id = NULL
    WHERE player_id = p_offline_player_id;

    -- Delete event invitations for this player
    DELETE FROM event_invitations
    WHERE user_id = p_offline_player_id;

    -- Only delete if the profile exists and is marked as offline
    DELETE FROM profiles
    WHERE id = p_offline_player_id
    AND is_offline = TRUE;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        RETURN json_build_object(
            'success', TRUE,
            'deleted_id', p_offline_player_id,
            'message', 'Offline player deleted successfully'
        );
    ELSE
        RETURN json_build_object(
            'success', FALSE,
            'error', 'No offline player found with this ID or player is not offline'
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_player_video(p_video_id uuid, p_player_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_can_delete BOOLEAN := FALSE;
    v_video_exists BOOLEAN := FALSE;
BEGIN
    -- Prüfen ob das Video existiert
    SELECT EXISTS(
        SELECT 1 FROM video_analyses WHERE id = p_video_id
    ) INTO v_video_exists;

    IF NOT v_video_exists THEN
        -- Video existiert nicht, als erfolgreich behandeln
        RETURN TRUE;
    END IF;

    -- Prüfen ob der Spieler berechtigt ist das Video zu löschen
    SELECT EXISTS(
        SELECT 1 FROM video_analyses va
        WHERE va.id = p_video_id
        AND (
            -- Eigenes Video
            va.uploaded_by = p_player_id
            OR
            -- Zugewiesenes Video
            EXISTS (
                SELECT 1 FROM video_assignments vass
                WHERE vass.video_id = va.id
                AND vass.player_id = p_player_id
            )
        )
    ) INTO v_can_delete;

    IF NOT v_can_delete THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Löschen dieses Videos';
    END IF;

    -- Video löschen (CASCADE löscht automatisch assignments und comments)
    DELETE FROM video_analyses WHERE id = p_video_id;

    RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.demote_to_player(p_player_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID; v_caller_role TEXT; v_player_club_id UUID; v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT club_id INTO v_player_club_id FROM profiles WHERE id = p_player_id;
    IF v_player_club_id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player_club_id AND pcs.role = 'head_coach';
        IF v_caller_role IS NULL THEN RAISE EXCEPTION 'Only head_coach or admin can demote coaches'; END IF;
    END IF;
    UPDATE profiles SET role = 'player', updated_at = NOW() WHERE id = p_player_id;
    UPDATE profile_club_sports SET role = 'player' WHERE user_id = p_player_id AND club_id = v_player_club_id;
    SELECT json_build_object('success', TRUE, 'new_role', 'player') INTO v_result;
    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.end_season(p_season_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role TEXT;
    v_season_club_id UUID;
    v_season_sport_id UUID;
    v_user_club_id UUID;
BEGIN
    -- Benutzer-Rolle und Club abrufen
    SELECT role, club_id INTO v_user_role, v_user_club_id
    FROM profiles
    WHERE id = auth.uid();

    -- Saison-Daten abrufen
    SELECT club_id, sport_id INTO v_season_club_id, v_season_sport_id
    FROM seasons
    WHERE id = p_season_id;

    -- Berechtigung prüfen: Admin ODER Head-Coach des gleichen Vereins
    IF v_user_role = 'admin' OR 
       (v_user_role = 'head_coach' AND v_user_club_id = v_season_club_id) THEN
        
        -- Saison-Punkte für alle Spieler im Club/Sport auf 0 setzen
        UPDATE profiles
        SET points = 0
        WHERE club_id = v_season_club_id
          AND (v_season_sport_id IS NULL OR active_sport_id = v_season_sport_id);

        -- Saison als beendet markieren
        UPDATE seasons
        SET is_active = false
        WHERE id = p_season_id;
    ELSE
        RAISE EXCEPTION 'Nur Admins oder Head-Coaches können Saisons beenden';
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_active_season()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Wenn die neue Saison aktiv gesetzt wird, deaktiviere alle anderen
    -- NUR für den gleichen Verein und die gleiche Sportart
    IF NEW.is_active = true AND NEW.club_id IS NOT NULL THEN
        UPDATE seasons
        SET is_active = false
        WHERE sport_id = NEW.sport_id
        AND club_id = NEW.club_id
        AND id != NEW.id
        AND is_active = true;
    ELSIF NEW.is_active = true AND NEW.club_id IS NULL THEN
        -- Fallback für alte Logik ohne club_id
        UPDATE seasons
        SET is_active = false
        WHERE sport_id = NEW.sport_id
        AND club_id IS NULL
        AND id != NEW.id
        AND is_active = true;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_labels_for_training(p_min_labels_per_type integer DEFAULT 10, p_only_verified boolean DEFAULT false, p_batch_id text DEFAULT NULL::text)
 RETURNS TABLE(video_url text, timestamp_start double precision, timestamp_end double precision, event_type public.tt_event_type, shot_type public.tt_shot_type, player_position public.tt_player_position, confidence text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_batch_id TEXT;
BEGIN
    -- Batch-ID generieren falls nicht angegeben
    v_batch_id := COALESCE(p_batch_id, 'export_' || NOW()::TEXT);

    -- Labels markieren als exportiert
    UPDATE video_labels
    SET exported_for_training = true,
        export_batch_id = v_batch_id
    WHERE id IN (
        SELECT vl.id
        FROM video_labels vl
        WHERE (NOT p_only_verified OR vl.is_verified)
          AND vl.exported_for_training = false
    );

    -- Daten zurückgeben
    RETURN QUERY
    SELECT
        va.video_url,
        vl.timestamp_start,
        vl.timestamp_end,
        vl.event_type,
        vl.shot_type,
        vl.player_position,
        vl.confidence
    FROM video_labels vl
    JOIN video_analyses va ON va.id = vl.video_id
    WHERE vl.export_batch_id = v_batch_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.forward_notification_to_guardians()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian RECORD;
    v_child_name TEXT;
    v_child_profile RECORD;
BEGIN
    -- Skip if this is already a forwarded notification (marked in data)
    IF NEW.data->>'forwarded_from' IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Get child profile info
    SELECT first_name, last_name, account_type, age_mode
    INTO v_child_profile
    FROM profiles
    WHERE id = NEW.user_id;

    -- Only forward if recipient is a child profile (age_mode = 'kids' or 'teen', or account_type = 'child')
    IF v_child_profile.account_type != 'child' AND v_child_profile.age_mode NOT IN ('kids', 'teen') THEN
        RETURN NEW;
    END IF;

    v_child_name := COALESCE(v_child_profile.first_name || ' ' || v_child_profile.last_name, 'Kind');

    -- Find all guardians for this child
    FOR v_guardian IN
        SELECT gl.guardian_id, p.first_name AS guardian_first_name
        FROM guardian_links gl
        JOIN profiles p ON p.id = gl.guardian_id
        WHERE gl.child_id = NEW.user_id
        AND COALESCE((gl.permissions->>'receives_notifications')::boolean, true) = true
    LOOP
        -- Create a copy of the notification for the guardian
        INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            data,
            is_read
        ) VALUES (
            v_guardian.guardian_id,
            NEW.type,
            '[' || v_child_name || '] ' || NEW.title,
            NEW.message,
            jsonb_build_object(
                'forwarded_from', NEW.user_id,
                'child_id', NEW.user_id,
                'child_name', v_child_name,
                'original_data', NEW.data
            ),
            false
        );
    END LOOP;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_child_login_code(p_child_id uuid, p_validity_minutes integer DEFAULT 15)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_is_guardian BOOLEAN;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify caller is guardian of this child
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_guardian_id
        AND child_id = p_child_id
    ) INTO v_is_guardian;

    IF NOT v_is_guardian THEN
        RAISE EXCEPTION 'Not authorized: You are not the guardian of this child';
    END IF;

    -- DELETE any existing unused codes for this child (instead of just invalidating)
    DELETE FROM child_login_codes
    WHERE child_id = p_child_id
    AND used_at IS NULL;

    -- Generate a new 6-character code (no confusing characters: 0/O, 1/I/l)
    v_code := '';
    FOR i IN 1..6 LOOP
        v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 32 + 1)::int, 1);
    END LOOP;

    v_expires_at := now() + (p_validity_minutes || ' minutes')::interval;

    -- Insert new code
    INSERT INTO child_login_codes (
        child_id,
        guardian_id,
        code,
        expires_at
    ) VALUES (
        p_child_id,
        v_guardian_id,
        v_code,
        v_expires_at
    );

    RETURN json_build_object(
        'success', TRUE,
        'code', v_code,
        'expires_at', v_expires_at,
        'validity_minutes', p_validity_minutes
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_guardian_invite_code(p_child_id uuid, p_validity_minutes integer DEFAULT 1440)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_is_guardian BOOLEAN;
    v_code TEXT;
    v_child RECORD;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify caller is guardian of this child
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_guardian_id
        AND child_id = p_child_id
    ) INTO v_is_guardian;

    IF NOT v_is_guardian THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Du bist nicht als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Get child info
    SELECT first_name, last_name INTO v_child
    FROM profiles
    WHERE id = p_child_id;

    -- Generate a unique code (format: GRD-XXXXXX)
    v_code := 'GRD-';
    FOR i IN 1..6 LOOP
        v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 32 + 1)::int, 1);
    END LOOP;

    -- DELETE any existing unused guardian invite codes for this child (GRD- prefix)
    DELETE FROM child_login_codes
    WHERE child_id = p_child_id
    AND used_at IS NULL
    AND code LIKE 'GRD-%';

    -- Store in child_login_codes table (repurposed for guardian invites too)
    -- We use a different prefix to distinguish
    INSERT INTO child_login_codes (
        child_id,
        guardian_id,
        code,
        expires_at
    ) VALUES (
        p_child_id,
        v_guardian_id,
        v_code,
        now() + (p_validity_minutes || ' minutes')::interval
    );

    RETURN json_build_object(
        'success', true,
        'code', v_code,
        'child_name', v_child.first_name || ' ' || v_child.last_name,
        'expires_at', now() + (p_validity_minutes || ' minutes')::interval,
        'validity_minutes', p_validity_minutes
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_tournament_join_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_a_factor(p_player_id uuid, p_sport_key text DEFAULT 'table-tennis'::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_matches_played INTEGER;
    v_birthdate TEXT;
    v_age INTEGER;
    v_config RECORD;
BEGIN
    -- Get sport config
    SELECT * INTO v_config FROM elo_sport_config WHERE sport_key = p_sport_key;
    IF NOT FOUND THEN
        -- Default values
        v_config.a_factor_new := 32;
        v_config.a_factor_stabilizing := 24;
        v_config.a_factor_established := 16;
        v_config.a_factor_youth := 20;
    END IF;

    -- Get player data
    SELECT singles_matches_played, birthdate
    INTO v_matches_played, v_birthdate
    FROM profiles
    WHERE id = p_player_id;

    v_matches_played := COALESCE(v_matches_played, 0);

    -- Check if youth player (U21 = under 21)
    v_age := get_player_age(v_birthdate);
    IF v_age IS NOT NULL AND v_age < 21 THEN
        RETURN v_config.a_factor_youth; -- 20
    END IF;

    -- Determine factor based on matches played
    IF v_matches_played < 10 THEN
        RETURN v_config.a_factor_new; -- 32 (Initialization phase)
    ELSIF v_matches_played < 20 THEN
        RETURN v_config.a_factor_stabilizing; -- 24 (Stabilization phase)
    ELSE
        RETURN v_config.a_factor_established; -- 16 (Established player)
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_activity_comment_counts_batch(p_activity_ids uuid[], p_activity_types text[])
 RETURNS TABLE(activity_id uuid, activity_type text, comment_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        ac.activity_id,
        ac.activity_type,
        COUNT(*)::BIGINT as comment_count
    FROM activity_comments ac
    WHERE (ac.activity_id, ac.activity_type) IN (
        SELECT UNNEST(p_activity_ids), UNNEST(p_activity_types)
    )
    GROUP BY ac.activity_id, ac.activity_type;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_activity_comments(p_activity_id uuid, p_activity_type text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, content text, created_at timestamp with time zone, updated_at timestamp with time zone, user_id uuid, user_name text, user_avatar_url text, is_author boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        ac.id,
        ac.content,
        ac.created_at,
        ac.updated_at,
        ac.user_id,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS user_name,
        p.avatar_url AS user_avatar_url,
        (ac.user_id = v_user_id) AS is_author
    FROM activity_comments ac
    LEFT JOIN profiles p ON ac.user_id = p.id
    WHERE ac.activity_id = p_activity_id
      AND ac.activity_type = p_activity_type
    ORDER BY ac.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_activity_likes_batch(p_activity_ids uuid[], p_activity_types text[])
 RETURNS TABLE(activity_id uuid, activity_type text, like_count bigint, is_liked_by_me boolean, recent_likers jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    WITH activity_pairs AS (
        SELECT unnest(p_activity_ids) AS activity_id, unnest(p_activity_types) AS activity_type
    ),
    like_counts AS (
        SELECT
            al.activity_id,
            al.activity_type,
            COUNT(*) AS total_likes,
            BOOL_OR(al.user_id = v_user_id) AS is_liked
        FROM activity_likes al
        INNER JOIN activity_pairs ap ON al.activity_id = ap.activity_id AND al.activity_type = ap.activity_type
        GROUP BY al.activity_id, al.activity_type
    ),
    recent_likers AS (
        SELECT
            al.activity_id,
            al.activity_type,
            jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.'),
                    'avatar_url', p.avatar_url
                ) ORDER BY al.created_at DESC
            ) FILTER (WHERE p.id IS NOT NULL) AS likers
        FROM activity_likes al
        INNER JOIN activity_pairs ap ON al.activity_id = ap.activity_id AND al.activity_type = ap.activity_type
        LEFT JOIN profiles p ON al.user_id = p.id
        GROUP BY al.activity_id, al.activity_type
    )
    SELECT
        ap.activity_id,
        ap.activity_type,
        COALESCE(lc.total_likes, 0)::BIGINT AS like_count,
        COALESCE(lc.is_liked, FALSE) AS is_liked_by_me,
        COALESCE(rl.likers, '[]'::JSONB) AS recent_likers
    FROM activity_pairs ap
    LEFT JOIN like_counts lc ON ap.activity_id = lc.activity_id AND ap.activity_type = lc.activity_type
    LEFT JOIN recent_likers rl ON ap.activity_id = rl.activity_id AND ap.activity_type = rl.activity_type;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_all_seasons(p_sport_id uuid)
 RETURNS TABLE(id uuid, name text, start_date date, end_date date, is_active boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date, s.is_active, s.created_at
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    ORDER BY s.start_date DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_all_seasons(p_sport_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, start_date date, end_date date, is_active boolean, created_at timestamp with time zone, club_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date, s.is_active, s.created_at, s.club_id
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    AND (p_club_id IS NULL OR s.club_id = p_club_id OR s.club_id IS NULL)
    ORDER BY s.start_date DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_audit_logs(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_action_filter text DEFAULT NULL::text, p_club_filter uuid DEFAULT NULL::uuid, p_sport_filter uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, action text, actor_id uuid, actor_name text, actor_email text, target_id uuid, target_type text, target_name text, club_id uuid, club_name text, sport_id uuid, sport_name text, details jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.action,
        al.actor_id,
        COALESCE(actor.first_name || ' ' || actor.last_name, 'System') as actor_name,
        actor.email as actor_email,
        al.target_id,
        al.target_type,
        CASE
            WHEN al.target_type = 'user' THEN
                (SELECT COALESCE(p.first_name || ' ' || p.last_name, p.email)
                 FROM profiles p WHERE p.id = al.target_id)
            WHEN al.target_type = 'club' THEN
                (SELECT c.name FROM clubs c WHERE c.id = al.target_id)
            WHEN al.target_type = 'sport' THEN
                (SELECT s.display_name FROM sports s WHERE s.id = al.target_id)
            WHEN al.target_type = 'season' THEN
                (SELECT se.name FROM seasons se WHERE se.id = al.target_id)
            ELSE NULL
        END as target_name,
        al.club_id,
        club.name as club_name,
        al.sport_id,
        sport.display_name as sport_name,
        al.details,
        al.created_at
    FROM audit_logs al
    LEFT JOIN profiles actor ON actor.id = al.actor_id
    LEFT JOIN clubs club ON club.id = al.club_id
    LEFT JOIN sports sport ON sport.id = al.sport_id
    WHERE
        (p_action_filter IS NULL OR al.action = p_action_filter)
        AND (p_club_filter IS NULL OR al.club_id = p_club_filter)
        AND (p_sport_filter IS NULL OR al.sport_id = p_sport_filter)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
    ORDER BY al.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_blocked_user_ids(current_user_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    blocked_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(blocked_id) INTO blocked_ids
    FROM user_blocks
    WHERE blocker_id = current_user_id;

    RETURN COALESCE(blocked_ids, ARRAY[]::UUID[]);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_blocked_users(current_user_id uuid)
 RETURNS TABLE(id uuid, blocked_id uuid, blocked_first_name text, blocked_last_name text, blocked_avatar_url text, blocked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ub.id,
        p.id as blocked_id,
        p.first_name as blocked_first_name,
        p.last_name as blocked_last_name,
        p.avatar_url as blocked_avatar_url,
        ub.created_at as blocked_at
    FROM user_blocks ub
    INNER JOIN profiles p ON p.id = ub.blocked_id
    WHERE ub.blocker_id = current_user_id
    ORDER BY ub.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_calendar_events_for_child_session(p_session_token text, p_start_date date, p_end_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_club_id UUID;
    v_events JSON;
    v_participations JSON;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_club_id FROM profiles WHERE id = v_child_id;

    -- Get events where child is invited or club events
    -- Using correct column names: organizer_id, start_date, start_time
    SELECT json_agg(e ORDER BY e.start_date, e.start_time)
    INTO v_events
    FROM (
        SELECT DISTINCT ON (ev.id)
            ev.id,
            ev.title,
            ev.description,
            ev.event_type,
            ev.event_category,
            ev.start_date,
            ev.start_time,
            ev.end_time,
            ev.location,
            ev.club_id,
            ev.organizer_id,
            ev.max_participants,
            ev.repeat_type,
            ev.repeat_end_date,
            ev.target_type,
            ev.target_subgroup_ids
        FROM events ev
        LEFT JOIN event_invitations ei ON ei.event_id = ev.id
        WHERE
            ev.start_date >= p_start_date
            AND ev.start_date <= p_end_date
            AND ev.cancelled = false
            AND (
                -- Club events
                (v_club_id IS NOT NULL AND ev.club_id = v_club_id)
                -- Personal invitations
                OR ei.user_id = v_child_id
            )
        ORDER BY ev.id, ev.start_date, ev.start_time
    ) e;

    -- Get child's participations
    SELECT json_agg(json_build_object(
        'event_id', ep.event_id,
        'status', ep.status,
        'responded_at', ep.responded_at
    ))
    INTO v_participations
    FROM event_participations ep
    JOIN events ev ON ev.id = ep.event_id
    WHERE ep.user_id = v_child_id
    AND ev.start_date >= p_start_date
    AND ev.start_date <= p_end_date;

    RETURN json_build_object(
        'success', true,
        'events', COALESCE(v_events, '[]'::json),
        'participations', COALESCE(v_participations, '[]'::json),
        'club_id', v_club_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_contacts(current_user_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, avatar_url text, club_id uuid, club_name text, elo_rating integer, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_club_id UUID;
BEGIN
    -- Get current user's club
    SELECT p.club_id INTO v_club_id
    FROM profiles p WHERE p.id = current_user_id;

    RETURN QUERY
    SELECT
        combined.id,
        combined.first_name,
        combined.last_name,
        combined.avatar_url,
        combined.club_id,
        combined.club_name,
        combined.elo_rating,
        -- If both friend and club member, show 'both'
        CASE
            WHEN bool_or(combined.is_friend) AND bool_or(combined.is_club) THEN 'both'
            WHEN bool_or(combined.is_friend) THEN 'friend'
            ELSE 'club'
        END AS source
    FROM (
        -- Friends (people you follow)
        SELECT
            p.id, p.first_name, p.last_name, p.avatar_url,
            p.club_id, c.name AS club_name, p.elo_rating,
            true AS is_friend, false AS is_club
        FROM friendships f
        INNER JOIN profiles p ON p.id = f.addressee_id
        LEFT JOIN clubs c ON p.club_id = c.id
        WHERE f.requester_id = current_user_id AND f.status = 'accepted'

        UNION ALL

        -- Club members (same club_id, excluding self)
        SELECT
            p.id, p.first_name, p.last_name, p.avatar_url,
            p.club_id, c.name AS club_name, p.elo_rating,
            false AS is_friend, true AS is_club
        FROM profiles p
        LEFT JOIN clubs c ON p.club_id = c.id
        WHERE v_club_id IS NOT NULL
          AND p.club_id = v_club_id
          AND p.id != current_user_id
    ) combined
    GROUP BY combined.id, combined.first_name, combined.last_name,
             combined.avatar_url, combined.club_id, combined.club_name, combined.elo_rating
    ORDER BY combined.first_name, combined.last_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_child_conversations(guardian_user_id uuid, child_user_id uuid)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_name text, last_message_content text, last_message_sender_name text, last_message_at timestamp with time zone, participant_names text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Prüfe ob Guardian-Beziehung existiert
    IF NOT EXISTS (
        SELECT 1 FROM guardian_links gl
        WHERE gl.guardian_id = guardian_user_id AND gl.child_id = child_user_id
    ) THEN
        RETURN; -- Kein Zugriff
    END IF;

    RETURN QUERY
    SELECT
        cc.id AS conversation_id,
        cc.type AS conversation_type,
        cc.name AS conversation_name,
        lm.content AS last_message_content,
        (SELECT p.first_name || ' ' || p.last_name FROM profiles p WHERE p.id = lm.sender_id) AS last_message_sender_name,
        lm.created_at AS last_message_at,
        (
            SELECT ARRAY_AGG(p2.first_name || ' ' || p2.last_name)
            FROM chat_participants cp2
            JOIN profiles p2 ON p2.id = cp2.user_id
            WHERE cp2.conversation_id = cc.id
        ) AS participant_names
    FROM chat_conversations cc
    JOIN chat_participants cp ON cp.conversation_id = cc.id AND cp.user_id = child_user_id
    LEFT JOIN LATERAL (
        SELECT cm.content, cm.sender_id, cm.created_at
        FROM chat_messages cm
        WHERE cm.conversation_id = cc.id
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) lm ON true
    ORDER BY COALESCE(lm.created_at, cc.created_at) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_child_profile_for_session(p_session_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_profile RECORD;
    v_club RECORD;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get profile
    SELECT p.id, p.first_name, p.last_name, p.email, p.avatar_url, p.role, p.club_id,
           p.elo_rating, p.wins, p.losses, p.points, p.birthdate, p.age_mode,
           p.is_player, p.is_guardian, p.account_type, p.created_at, p.xp
    INTO v_profile
    FROM profiles p WHERE p.id = v_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profil nicht gefunden');
    END IF;

    IF v_profile.club_id IS NOT NULL THEN
        SELECT id, name INTO v_club FROM clubs WHERE id = v_profile.club_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'profile', json_build_object(
            'id', v_profile.id, 'first_name', v_profile.first_name, 'last_name', v_profile.last_name,
            'email', v_profile.email, 'avatar_url', v_profile.avatar_url, 'role', v_profile.role,
            'club_id', v_profile.club_id, 'elo_rating', v_profile.elo_rating, 'wins', v_profile.wins,
            'losses', v_profile.losses, 'points', v_profile.points, 'xp', v_profile.xp,
            'birthdate', v_profile.birthdate, 'age_mode', v_profile.age_mode,
            'is_player', v_profile.is_player, 'is_guardian', v_profile.is_guardian,
            'account_type', v_profile.account_type, 'created_at', v_profile.created_at
        ),
        'club', CASE WHEN v_club.id IS NOT NULL THEN
            json_build_object('id', v_club.id, 'name', v_club.name) ELSE NULL END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_active_season(p_club_id uuid, p_sport_id uuid)
 RETURNS TABLE(id uuid, name text, start_date date, end_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date
    FROM seasons s
    WHERE s.club_id = p_club_id
    AND s.sport_id = p_sport_id
    AND s.is_active = true
    LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_activities_for_child_session(p_session_token text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_club_id UUID;
    v_matches JSON;
    v_doubles_matches JSON;
    v_activity_events JSON;
    v_community_posts JSON;
    v_community_polls JSON;
    v_member_ids UUID[];
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_club_id FROM profiles WHERE id = v_child_id;

    IF v_club_id IS NULL THEN
        RETURN json_build_object(
            'success', true,
            'matches', '[]'::json,
            'doubles_matches', '[]'::json,
            'activity_events', '[]'::json,
            'community_posts', '[]'::json,
            'community_polls', '[]'::json,
            'member_ids', '[]'::json
        );
    END IF;

    -- Get ALL member IDs from the child's club (NO privacy filter here!)
    -- Privacy filtering happens in each individual query with the appropriate field
    SELECT ARRAY_AGG(id) INTO v_member_ids
    FROM profiles
    WHERE club_id = v_club_id
    AND is_player = true;

    -- ============================================
    -- 1. Singles Matches (with matches_visibility filter)
    -- ============================================
    SELECT json_agg(m ORDER BY m.created_at DESC)
    INTO v_matches
    FROM (
        SELECT
            mat.id,
            mat.player_a_id,
            mat.player_b_id,
            mat.winner_id,
            mat.loser_id,
            mat.sets,
            mat.winner_elo_change,
            mat.loser_elo_change,
            mat.match_mode,
            mat.handicap,
            mat.played_at,
            mat.created_at
        FROM matches mat
        JOIN profiles pa ON pa.id = mat.player_a_id
        JOIN profiles pb ON pb.id = mat.player_b_id
        WHERE (mat.player_a_id = ANY(v_member_ids) OR mat.player_b_id = ANY(v_member_ids))
        -- Privacy check using matches_visibility
        AND (
            -- Child is a player in this match - always visible
            mat.player_a_id = v_child_id OR mat.player_b_id = v_child_id
            OR
            -- Both players allow visibility based on matches_visibility
            (
                -- Player A visibility check
                (
                    COALESCE(pa.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(pa.privacy_settings->>'matches_visibility', 'global') = 'club_only' AND pa.club_id = v_club_id)
                    OR (COALESCE(pa.privacy_settings->>'matches_visibility', 'global') = 'followers_only' AND pa.club_id = v_club_id)
                )
                AND
                -- Player B visibility check
                (
                    COALESCE(pb.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(pb.privacy_settings->>'matches_visibility', 'global') = 'club_only' AND pb.club_id = v_club_id)
                    OR (COALESCE(pb.privacy_settings->>'matches_visibility', 'global') = 'followers_only' AND pb.club_id = v_club_id)
                )
            )
        )
        ORDER BY mat.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) m;

    -- ============================================
    -- 2. Doubles Matches (with matches_visibility filter)
    -- ============================================
    SELECT json_agg(dm ORDER BY dm.created_at DESC)
    INTO v_doubles_matches
    FROM (
        SELECT
            mat.id,
            mat.team_a_player1_id,
            mat.team_a_player2_id,
            mat.team_b_player1_id,
            mat.team_b_player2_id,
            mat.winning_team,
            mat.sets,
            mat.team_a_sets_won,
            mat.team_b_sets_won,
            mat.played_at,
            mat.created_at
        FROM doubles_matches mat
        JOIN profiles p1 ON p1.id = mat.team_a_player1_id
        JOIN profiles p2 ON p2.id = mat.team_a_player2_id
        JOIN profiles p3 ON p3.id = mat.team_b_player1_id
        JOIN profiles p4 ON p4.id = mat.team_b_player2_id
        WHERE (
            mat.team_a_player1_id = ANY(v_member_ids) OR
            mat.team_a_player2_id = ANY(v_member_ids) OR
            mat.team_b_player1_id = ANY(v_member_ids) OR
            mat.team_b_player2_id = ANY(v_member_ids)
        )
        -- Privacy check using matches_visibility
        AND (
            -- Child is a player - always visible
            mat.team_a_player1_id = v_child_id OR mat.team_a_player2_id = v_child_id
            OR mat.team_b_player1_id = v_child_id OR mat.team_b_player2_id = v_child_id
            OR
            -- All 4 players allow visibility
            (
                -- Player 1
                (
                    COALESCE(p1.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p1.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p1.club_id = v_club_id)
                )
                AND
                -- Player 2
                (
                    COALESCE(p2.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p2.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p2.club_id = v_club_id)
                )
                AND
                -- Player 3
                (
                    COALESCE(p3.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p3.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p3.club_id = v_club_id)
                )
                AND
                -- Player 4
                (
                    COALESCE(p4.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p4.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p4.club_id = v_club_id)
                )
            )
        )
        ORDER BY mat.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) dm;

    -- ============================================
    -- 3. Activity Events (with searchable filter)
    -- For general activity events, searchable is appropriate
    -- ============================================
    SELECT json_agg(ae ORDER BY ae.created_at DESC)
    INTO v_activity_events
    FROM (
        SELECT
            ev.id,
            ev.user_id,
            ev.club_id,
            ev.event_type,
            ev.event_data,
            ev.created_at
        FROM activity_events ev
        JOIN profiles p ON p.id = ev.user_id
        WHERE ev.user_id = ANY(v_member_ids)
        -- Privacy using searchable (appropriate for general visibility)
        AND (
            ev.user_id = v_child_id
            OR COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
            OR (COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only') AND p.club_id = v_club_id)
        )
        ORDER BY ev.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) ae;

    -- ============================================
    -- 4. Community Posts (with searchable filter)
    -- ============================================
    SELECT json_agg(cp ORDER BY cp.created_at DESC)
    INTO v_community_posts
    FROM (
        SELECT
            post.id,
            post.user_id,
            post.club_id,
            post.content,
            post.image_url,
            post.visibility,
            post.likes_count,
            post.comments_count,
            post.created_at
        FROM community_posts post
        JOIN profiles p ON p.id = post.user_id
        WHERE post.deleted_at IS NULL
        AND (
            (post.club_id = v_club_id)
            OR
            (post.user_id = ANY(v_member_ids) AND post.visibility IN ('public', 'followers'))
        )
        -- Privacy using searchable
        AND (
            post.user_id = v_child_id
            OR COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
            OR (COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only') AND p.club_id = v_club_id)
        )
        -- Exclude training summaries
        AND post.content NOT LIKE 'TRAINING_SUMMARY|%'
        ORDER BY post.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) cp;

    -- ============================================
    -- 5. Community Polls (with searchable filter)
    -- ============================================
    SELECT json_agg(poll ORDER BY poll.created_at DESC)
    INTO v_community_polls
    FROM (
        SELECT
            pl.id,
            pl.user_id,
            pl.club_id,
            pl.question,
            pl.options,
            pl.visibility,
            pl.duration_days,
            pl.ends_at,
            pl.total_votes,
            pl.comments_count,
            pl.created_at
        FROM community_polls pl
        JOIN profiles p ON p.id = pl.user_id
        WHERE pl.deleted_at IS NULL
        AND (
            (pl.club_id = v_club_id)
            OR
            (pl.user_id = ANY(v_member_ids) AND pl.visibility IN ('public', 'followers'))
        )
        -- Privacy using searchable
        AND (
            pl.user_id = v_child_id
            OR COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
            OR (COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only') AND p.club_id = v_club_id)
        )
        ORDER BY pl.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) poll;

    RETURN json_build_object(
        'success', true,
        'matches', COALESCE(v_matches, '[]'::json),
        'doubles_matches', COALESCE(v_doubles_matches, '[]'::json),
        'activity_events', COALESCE(v_activity_events, '[]'::json),
        'community_posts', COALESCE(v_community_posts, '[]'::json),
        'community_polls', COALESCE(v_community_polls, '[]'::json),
        'member_ids', to_json(v_member_ids),
        'club_id', v_club_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_activity_for_child_session(p_child_id uuid, p_club_id uuid, p_limit integer DEFAULT 20)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_has_valid_session BOOLEAN;
    v_activities JSON;
BEGIN
    -- Verify the child has valid PIN credentials
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = p_child_id
        AND p.pin_hash IS NOT NULL
        AND (
            p.account_type = 'child'
            OR p.is_offline = TRUE
            OR EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id)
        )
    ) INTO v_has_valid_session;

    IF NOT v_has_valid_session THEN
        RETURN json_build_object('success', false, 'error', 'Keine gültige Sitzung');
    END IF;

    -- Get recent matches from the club
    SELECT json_agg(row_to_json(t)) INTO v_activities
    FROM (
        SELECT
            m.id,
            m.created_at,
            m.player_a_id,
            m.player_b_id,
            m.player_a_score,
            m.player_b_score,
            m.winner_id,
            pa.first_name as player_a_first_name,
            pa.last_name as player_a_last_name,
            pa.avatar_url as player_a_avatar,
            pb.first_name as player_b_first_name,
            pb.last_name as player_b_last_name,
            pb.avatar_url as player_b_avatar
        FROM matches m
        JOIN profiles pa ON pa.id = m.player_a_id
        JOIN profiles pb ON pb.id = m.player_b_id
        WHERE m.status = 'approved'
        AND (pa.club_id = p_club_id OR pb.club_id = p_club_id)
        ORDER BY m.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN json_build_object(
        'success', true,
        'activities', COALESCE(v_activities, '[]'::json)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_doubles_pairing_position(p_pairing_id text, p_club_id uuid, p_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
    v_matches_played INT;
BEGIN
    -- Get the pairing's matches_played for tie-breaking
    SELECT COALESCE(matches_played, 0) INTO v_matches_played
    FROM doubles_pairings WHERE id = p_pairing_id;

    -- Count pairings with higher Elo (or same Elo but more matches)
    SELECT COUNT(*) + 1 INTO v_position
    FROM doubles_pairings
    WHERE club_id = p_club_id
      AND id != p_pairing_id
      AND matches_played > 0  -- Only count pairings that have played
      AND (
          current_elo_rating > p_elo
          OR (current_elo_rating = p_elo AND matches_played > v_matches_played)
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_doubles_pairing_position(p_pairing_id text, p_club_id uuid, p_elo integer, p_sport_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
    v_matches_played INT;
BEGIN
    -- Get the pairing's matches_played for tie-breaking
    SELECT COALESCE(matches_played, 0) INTO v_matches_played
    FROM doubles_pairings WHERE id = p_pairing_id;

    -- Count pairings with higher Elo (or same Elo but more matches) - filtered by sport
    SELECT COUNT(*) + 1 INTO v_position
    FROM doubles_pairings
    WHERE club_id = p_club_id
      AND id != p_pairing_id
      AND matches_played > 0  -- Only count pairings that have played
      AND (p_sport_id IS NULL OR sport_id = p_sport_id)
      AND (
          current_elo_rating > p_elo
          OR (current_elo_rating = p_elo AND matches_played > v_matches_played)
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_doubles_ranking_position(p_player_id uuid, p_club_id uuid, p_doubles_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE club_id = p_club_id
      AND role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      AND (
          COALESCE(doubles_elo_rating, 800) > p_doubles_elo
          OR (COALESCE(doubles_elo_rating, 800) = p_doubles_elo AND COALESCE(doubles_matches_played, 0) > (SELECT COALESCE(doubles_matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_member_count_for_child_session(p_session_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_club_id UUID;
    v_member_count INT;
    v_club_name TEXT;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_club_id FROM profiles WHERE id = v_child_id;

    IF v_club_id IS NULL THEN
        RETURN json_build_object('success', true, 'member_count', 0, 'club_id', null, 'club_name', null);
    END IF;

    -- Get club name
    SELECT name INTO v_club_name FROM clubs WHERE id = v_club_id;

    -- Count members
    SELECT COUNT(*) INTO v_member_count
    FROM profiles
    WHERE club_id = v_club_id;

    RETURN json_build_object(
        'success', true,
        'member_count', v_member_count,
        'club_id', v_club_id,
        'club_name', v_club_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_member_ids_for_child_session(p_session_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_club_id UUID;
    v_member_ids JSON;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_club_id FROM profiles WHERE id = v_child_id;

    IF v_club_id IS NULL THEN
        RETURN json_build_object('success', true, 'member_ids', '[]'::json, 'club_id', null);
    END IF;

    -- Get all member IDs from the child's club
    SELECT json_agg(id) INTO v_member_ids
    FROM profiles
    WHERE club_id = v_club_id AND is_player = true;

    RETURN json_build_object(
        'success', true,
        'member_ids', COALESCE(v_member_ids, '[]'::json),
        'club_id', v_club_id,
        'child_id', v_child_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_ranking_position(p_player_id uuid, p_club_id uuid, p_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE club_id = p_club_id
      AND role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      AND (
          COALESCE(elo_rating, 800) > p_elo
          OR (COALESCE(elo_rating, 800) = p_elo AND COALESCE(matches_played, 0) > (SELECT COALESCE(matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_ranking_position(p_player_id uuid, p_club_id uuid, p_elo integer, p_sport_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE club_id = p_club_id
      AND role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      -- Filter by sport if provided
      AND (p_sport_id IS NULL OR active_sport_id = p_sport_id)
      AND (
          COALESCE(elo_rating, 800) > p_elo
          OR (COALESCE(elo_rating, 800) = p_elo AND COALESCE(matches_played, 0) > (SELECT COALESCE(matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_stats(p_club_id uuid, p_sport_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_conversation_messages(current_user_id uuid, p_conversation_id uuid, p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(message_id uuid, sender_id uuid, sender_name text, sender_avatar text, content text, created_at timestamp with time zone, edited_at timestamp with time zone, is_own boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Prüfe ob User Teilnehmer ist
    IF NOT EXISTS (
        SELECT 1 FROM chat_participants cp
        WHERE cp.conversation_id = p_conversation_id AND cp.user_id = current_user_id
    ) THEN
        RETURN; -- Leeres Ergebnis
    END IF;

    -- last_read_at aktualisieren
    UPDATE chat_participants
    SET last_read_at = NOW()
    WHERE conversation_id = p_conversation_id AND user_id = current_user_id;

    RETURN QUERY
    SELECT
        cm.id AS message_id,
        cm.sender_id,
        (p.first_name || ' ' || p.last_name) AS sender_name,
        COALESCE(p.avatar_url, '') AS sender_avatar,
        cm.content,
        cm.created_at,
        cm.edited_at,
        (cm.sender_id = current_user_id) AS is_own
    FROM chat_messages cm
    JOIN profiles p ON p.id = cm.sender_id
    WHERE cm.conversation_id = p_conversation_id
    AND (p_before IS NULL OR cm.created_at < p_before)
    ORDER BY cm.created_at DESC
    LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_season(p_sport_id uuid)
 RETURNS TABLE(id uuid, name text, start_date date, end_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    AND s.is_active = true
    LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_season(p_sport_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, start_date date, end_date date, club_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date, s.club_id
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    AND s.is_active = true
    AND (p_club_id IS NULL OR s.club_id = p_club_id OR s.club_id IS NULL)
    ORDER BY s.club_id NULLS LAST  -- Prefer club-specific season
    LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_exercise_example_videos(p_exercise_id uuid, p_club_id uuid)
 RETURNS TABLE(id uuid, video_id uuid, video_url text, thumbnail_url text, title text, description text, uploaded_by uuid, uploader_name text, sort_order integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        eev.id AS id,
        va.id AS video_id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        eev.description AS description,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        eev.sort_order AS sort_order,
        eev.created_at AS created_at
    FROM exercise_example_videos eev
    JOIN video_analyses va ON va.id = eev.video_id
    JOIN profiles p ON p.id = va.uploaded_by
    WHERE eev.exercise_id = p_exercise_id
      AND eev.club_id = p_club_id
    ORDER BY eev.sort_order ASC, eev.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_follow_counts(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_followers INT;
    v_following INT;
BEGIN
    -- Count followers (people who follow this user - they are the requesters)
    SELECT COUNT(*) INTO v_followers
    FROM friendships
    WHERE addressee_id = p_user_id
    AND status = 'accepted';

    -- Count following (people this user follows - this user is the requester)
    SELECT COUNT(*) INTO v_following
    FROM friendships
    WHERE requester_id = p_user_id
    AND status = 'accepted';

    RETURN jsonb_build_object(
        'followers', v_followers,
        'following', v_following
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_follow_status(current_user_id uuid, target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    outgoing_friendship friendships%ROWTYPE;
    incoming_friendship friendships%ROWTYPE;
BEGIN
    -- Check if current user follows target (or has pending request)
    SELECT * INTO outgoing_friendship
    FROM friendships
    WHERE requester_id = current_user_id AND addressee_id = target_user_id;

    -- Check if target follows current user
    SELECT * INTO incoming_friendship
    FROM friendships
    WHERE requester_id = target_user_id AND addressee_id = current_user_id
    AND status = 'accepted';

    RETURN json_build_object(
        'is_following', outgoing_friendship.status = 'accepted',
        'has_pending_request', outgoing_friendship.status = 'pending',
        'is_followed_by', incoming_friendship.id IS NOT NULL,
        'outgoing_friendship_id', outgoing_friendship.id,
        'incoming_friendship_id', incoming_friendship.id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_followers(current_user_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, avatar_url text, club_id uuid, club_name text, elo_rating integer, friendship_id uuid, friendship_created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        f.id as friendship_id,
        f.created_at as friendship_created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.requester_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.addressee_id = current_user_id  -- Only where others follow YOU
    AND f.status = 'accepted'
    ORDER BY p.first_name, p.last_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_friends(current_user_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, avatar_url text, club_id uuid, club_name text, elo_rating integer, friendship_id uuid, friendship_created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        f.id as friendship_id,
        f.created_at as friendship_created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.addressee_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.requester_id = current_user_id  -- Only where YOU are the follower
    AND f.status = 'accepted'
    ORDER BY p.first_name, p.last_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_doubles_pairing_position(p_pairing_id text, p_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
    v_matches_played INT;
BEGIN
    -- Get the pairing's matches_played for tie-breaking
    SELECT COALESCE(matches_played, 0) INTO v_matches_played
    FROM doubles_pairings WHERE id = p_pairing_id;

    -- Count all pairings with higher Elo globally
    SELECT COUNT(*) + 1 INTO v_position
    FROM doubles_pairings
    WHERE id != p_pairing_id
      AND matches_played > 0  -- Only count pairings that have played
      AND (
          current_elo_rating > p_elo
          OR (current_elo_rating = p_elo AND matches_played > v_matches_played)
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_doubles_pairing_position(p_pairing_id text, p_elo integer, p_sport_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
    v_matches_played INT;
BEGIN
    -- Get the pairing's matches_played for tie-breaking
    SELECT COALESCE(matches_played, 0) INTO v_matches_played
    FROM doubles_pairings WHERE id = p_pairing_id;

    -- Count all pairings with higher Elo globally - filtered by sport
    SELECT COUNT(*) + 1 INTO v_position
    FROM doubles_pairings
    WHERE id != p_pairing_id
      AND matches_played > 0  -- Only count pairings that have played
      AND (p_sport_id IS NULL OR sport_id = p_sport_id)
      AND (
          current_elo_rating > p_elo
          OR (current_elo_rating = p_elo AND matches_played > v_matches_played)
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_doubles_ranking_position(p_player_id uuid, p_doubles_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      AND (
          COALESCE(doubles_elo_rating, 800) > p_doubles_elo
          OR (COALESCE(doubles_elo_rating, 800) = p_doubles_elo AND COALESCE(doubles_matches_played, 0) > (SELECT COALESCE(doubles_matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_ranking_position(p_player_id uuid, p_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      AND (
          COALESCE(elo_rating, 800) > p_elo
          OR (COALESCE(elo_rating, 800) = p_elo AND COALESCE(matches_played, 0) > (SELECT COALESCE(matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_ranking_position(p_player_id uuid, p_elo integer, p_sport_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      -- Filter by sport if provided
      AND (p_sport_id IS NULL OR active_sport_id = p_sport_id)
      AND (
          COALESCE(elo_rating, 800) > p_elo
          OR (COALESCE(elo_rating, 800) = p_elo AND COALESCE(matches_played, 0) > (SELECT COALESCE(matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_guardian_children()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_children JSON;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT json_agg(
        json_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'birthdate', p.birthdate,
            'age', calculate_age(p.birthdate),
            'age_mode', p.age_mode,
            'club_id', p.club_id,
            'xp', p.xp,
            'elo_rating', p.elo_rating,
            'username', p.username,
            'has_pin', (p.pin_hash IS NOT NULL),
            'relationship', gl.relationship,
            'is_primary', gl.is_primary,
            'permissions', gl.permissions
        )
    ) INTO v_children
    FROM guardian_links gl
    JOIN profiles p ON p.id = gl.child_id
    WHERE gl.guardian_id = v_guardian_id
      AND p.email NOT LIKE 'deleted_%@anonymous.local';  -- Filter out deleted/anonymized profiles

    RETURN json_build_object(
        'success', TRUE,
        'children', COALESCE(v_children, '[]'::json)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_h2h_handicap(p1_id uuid, p2_id uuid)
 RETURNS TABLE(suggested_handicap integer, consecutive_wins integer, streak_winner_id uuid, streak_loser_id uuid, total_matches integer, p1_wins integer, p2_wins integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    ordered_a UUID;
    ordered_b UUID;
    h2h RECORD;
BEGIN
    -- Order IDs
    IF p1_id < p2_id THEN
        ordered_a := p1_id;
        ordered_b := p2_id;
    ELSE
        ordered_a := p2_id;
        ordered_b := p1_id;
    END IF;

    -- Find h2h record
    SELECT * INTO h2h FROM head_to_head_stats
    WHERE player_a_id = ordered_a AND player_b_id = ordered_b;

    IF h2h IS NULL THEN
        -- No history
        RETURN QUERY SELECT
            0::INTEGER,
            0::INTEGER,
            NULL::UUID,
            NULL::UUID,
            0::INTEGER,
            0::INTEGER,
            0::INTEGER;
    ELSE
        RETURN QUERY SELECT
            h2h.suggested_handicap,
            h2h.consecutive_wins,
            h2h.current_streak_winner_id,
            -- The loser is the other player
            (CASE
                WHEN h2h.current_streak_winner_id = p1_id THEN p2_id
                WHEN h2h.current_streak_winner_id = p2_id THEN p1_id
                ELSE NULL
            END)::UUID,
            h2h.total_matches,
            (CASE WHEN p1_id = h2h.player_a_id THEN h2h.player_a_wins ELSE h2h.player_b_wins END)::INTEGER,
            (CASE WHEN p2_id = h2h.player_a_id THEN h2h.player_a_wins ELSE h2h.player_b_wins END)::INTEGER;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_hauptgruppe_id(p_club_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_hauptgruppe_id UUID;
BEGIN
    SELECT id INTO v_hauptgruppe_id
    FROM subgroups
    WHERE club_id = p_club_id AND is_default = true
    LIMIT 1;

    RETURN v_hauptgruppe_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_hidden_content_ids(current_user_id uuid, p_content_type text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    hidden_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(content_id) INTO hidden_ids
    FROM hidden_content
    WHERE user_id = current_user_id
    AND content_type = p_content_type::reportable_content_type;

    RETURN COALESCE(hidden_ids, ARRAY[]::UUID[]);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_highest_elo_gate(current_elo integer, highest_elo integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- No gates - always return 0
    RETURN 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_label_statistics(p_club_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shot_type public.tt_shot_type, label_count bigint, verified_count bigint, avg_quality numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        vl.shot_type,
        COUNT(*)::BIGINT AS label_count,
        COUNT(*) FILTER (WHERE vl.is_verified)::BIGINT AS verified_count,
        ROUND(AVG(vl.shot_quality), 2) AS avg_quality
    FROM video_labels vl
    WHERE vl.shot_type IS NOT NULL
      AND (p_club_id IS NULL OR vl.club_id = p_club_id)
    GROUP BY vl.shot_type
    ORDER BY label_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_for_child_session(p_session_token text, p_club_id uuid, p_type text DEFAULT 'skill'::text, p_limit integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_child_club_id UUID;
    v_error TEXT;
    v_leaderboard JSON;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id for privacy context
    SELECT club_id INTO v_child_club_id FROM profiles WHERE id = v_child_id;

    IF p_type = 'skill' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.club_id, c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            -- Privacy filter: use leaderboard_visibility (NOT searchable!)
            AND (
                -- Own profile always visible
                p.id = v_child_id
                OR
                -- Same club members visible (unless leaderboard_visibility='none')
                (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id
                 AND COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') != 'none')
                OR
                -- Global visibility
                (COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') = 'global')
            )
            ORDER BY p.elo_rating DESC NULLS LAST
            LIMIT p_limit
        ) t;
    ELSIF p_type = 'effort' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.club_id, c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            -- Privacy filter: use leaderboard_visibility
            AND (
                p.id = v_child_id
                OR
                (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id
                 AND COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') != 'none')
                OR
                (COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') = 'global')
            )
            ORDER BY p.xp DESC NULLS LAST
            LIMIT p_limit
        ) t;
    ELSE
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.points, p.club_id, c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            -- Privacy filter: use leaderboard_visibility
            AND (
                p.id = v_child_id
                OR
                (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id
                 AND COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') != 'none')
                OR
                (COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') = 'global')
            )
            ORDER BY p.points DESC NULLS LAST
            LIMIT p_limit
        ) t;
    END IF;

    RETURN json_build_object('success', true, 'leaderboard', COALESCE(v_leaderboard, '[]'::json));
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_match_media(p_match_id text, p_match_type text)
 RETURNS TABLE(id uuid, match_id text, match_type text, uploaded_by uuid, uploader_name text, file_type text, file_path text, file_size integer, mime_type text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT mm.id, mm.match_id, mm.match_type, mm.uploaded_by,
           COALESCE(p.display_name, p.username, 'Unbekannt') as uploader_name,
           mm.file_type, mm.file_path, mm.file_size, mm.mime_type, mm.created_at
    FROM match_media mm
    LEFT JOIN profiles p ON p.id = mm.uploaded_by
    WHERE mm.match_id = p_match_id AND mm.match_type = p_match_type
    ORDER BY mm.created_at DESC;
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_my_children()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_children JSON;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT json_agg(
        json_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'birthdate', p.birthdate,
            'age', calculate_age(p.birthdate),
            'age_mode', p.age_mode,
            'club_id', p.club_id,
            'club_name', c.name,
            'username', p.username,
            'has_pin', (p.pin_hash IS NOT NULL),
            'xp', p.xp,
            'elo_rating', p.elo_rating,
            'relationship', gl.relationship,
            'is_primary', gl.is_primary,
            'permissions', gl.permissions,
            'other_guardians', (
                SELECT json_agg(json_build_object(
                    'first_name', gp.first_name,
                    'last_name', gp.last_name
                ))
                FROM guardian_links gl2
                JOIN profiles gp ON gp.id = gl2.guardian_id
                WHERE gl2.child_id = p.id
                AND gl2.guardian_id != v_guardian_id
            )
        )
    ) INTO v_children
    FROM guardian_links gl
    JOIN profiles p ON p.id = gl.child_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE gl.guardian_id = v_guardian_id;

    RETURN json_build_object(
        'success', TRUE,
        'children', COALESCE(v_children, '[]'::json)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT club_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_conversations(current_user_id uuid)
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_name text, club_id uuid, subgroup_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, last_message_content text, last_message_sender_id uuid, last_message_sender_name text, last_message_at timestamp with time zone, unread_count bigint, participant_ids uuid[], participant_names text[], participant_avatars text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        cc.id AS conversation_id,
        cc.type AS conversation_type,
        cc.name AS conversation_name,
        cc.club_id,
        cc.subgroup_id,
        cc.created_at,
        cc.updated_at,
        lm.content AS last_message_content,
        lm.sender_id AS last_message_sender_id,
        (SELECT p.first_name || ' ' || p.last_name FROM profiles p WHERE p.id = lm.sender_id) AS last_message_sender_name,
        lm.created_at AS last_message_at,
        -- Ungelesene Nachrichten zählen
        (
            SELECT COUNT(*)::BIGINT FROM chat_messages cm
            WHERE cm.conversation_id = cc.id
            AND cm.created_at > COALESCE(my_cp.last_read_at, '1970-01-01'::timestamptz)
            AND cm.sender_id != current_user_id
        ) AS unread_count,
        -- Teilnehmer-IDs (ohne aktuellen User)
        (
            SELECT ARRAY_AGG(cp3.user_id)
            FROM chat_participants cp3
            WHERE cp3.conversation_id = cc.id AND cp3.user_id != current_user_id
        ) AS participant_ids,
        -- Teilnehmer-Namen (ohne aktuellen User)
        (
            SELECT ARRAY_AGG(p2.first_name || ' ' || p2.last_name)
            FROM chat_participants cp4
            JOIN profiles p2 ON p2.id = cp4.user_id
            WHERE cp4.conversation_id = cc.id AND cp4.user_id != current_user_id
        ) AS participant_names,
        -- Teilnehmer-Avatare (ohne aktuellen User)
        (
            SELECT ARRAY_AGG(COALESCE(p3.avatar_url, ''))
            FROM chat_participants cp5
            JOIN profiles p3 ON p3.id = cp5.user_id
            WHERE cp5.conversation_id = cc.id AND cp5.user_id != current_user_id
        ) AS participant_avatars
    FROM chat_conversations cc
    JOIN chat_participants my_cp ON my_cp.conversation_id = cc.id AND my_cp.user_id = current_user_id
    -- Letzte Nachricht per LATERAL Join
    LEFT JOIN LATERAL (
        SELECT cm.content, cm.sender_id, cm.created_at
        FROM chat_messages cm
        WHERE cm.conversation_id = cc.id
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) lm ON true
    ORDER BY COALESCE(lm.created_at, cc.created_at) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_reports(current_user_id uuid)
 RETURNS TABLE(id uuid, content_type public.reportable_content_type, content_id uuid, report_type public.report_type, description text, status public.report_status, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        cr.id,
        cr.content_type,
        cr.content_id,
        cr.report_type,
        cr.description,
        cr.status,
        cr.created_at
    FROM content_reports cr
    WHERE cr.reporter_id = current_user_id
    ORDER BY cr.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS public.user_role
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT role FROM profiles WHERE id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(current_user_id uuid, other_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    existing_conversation_id UUID;
    new_conversation_id UUID;
BEGIN
    -- Kein Chat mit sich selbst
    IF current_user_id = other_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Kein Chat mit dir selbst möglich');
    END IF;

    -- Existierenden Direktchat suchen
    SELECT cc.id INTO existing_conversation_id
    FROM chat_conversations cc
    WHERE cc.type = 'direct'
    AND EXISTS (
        SELECT 1 FROM chat_participants cp1
        WHERE cp1.conversation_id = cc.id AND cp1.user_id = current_user_id
    )
    AND EXISTS (
        SELECT 1 FROM chat_participants cp2
        WHERE cp2.conversation_id = cc.id AND cp2.user_id = other_user_id
    )
    LIMIT 1;

    IF existing_conversation_id IS NOT NULL THEN
        RETURN json_build_object('success', true, 'conversation_id', existing_conversation_id, 'created', false);
    END IF;

    -- Neuen Direktchat erstellen
    INSERT INTO chat_conversations (type, created_by)
    VALUES ('direct', current_user_id)
    RETURNING id INTO new_conversation_id;

    -- Beide Teilnehmer hinzufügen
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES
        (new_conversation_id, current_user_id, 'member'),
        (new_conversation_id, other_user_id, 'member');

    RETURN json_build_object('success', true, 'conversation_id', new_conversation_id, 'created', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_h2h_stats(p1_id uuid, p2_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    h2h_id UUID;
    ordered_a UUID;
    ordered_b UUID;
BEGIN
    -- Always order by UUID to ensure consistency
    IF p1_id < p2_id THEN
        ordered_a := p1_id;
        ordered_b := p2_id;
    ELSE
        ordered_a := p2_id;
        ordered_b := p1_id;
    END IF;

    -- Try to find existing record
    SELECT id INTO h2h_id
    FROM head_to_head_stats
    WHERE (player_a_id = ordered_a AND player_b_id = ordered_b);

    -- Create if not exists
    IF h2h_id IS NULL THEN
        INSERT INTO head_to_head_stats (player_a_id, player_b_id)
        VALUES (ordered_a, ordered_b)
        RETURNING id INTO h2h_id;
    END IF;

    RETURN h2h_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_sport_stats(p_user_id uuid, p_sport_id uuid)
 RETURNS public.user_sport_stats
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_stats user_sport_stats;
BEGIN
    -- Versuche existierende Stats zu finden
    SELECT * INTO v_stats
    FROM user_sport_stats
    WHERE user_id = p_user_id AND sport_id = p_sport_id;

    -- Falls nicht vorhanden, erstelle neue
    IF v_stats.id IS NULL THEN
        INSERT INTO user_sport_stats (user_id, sport_id)
        VALUES (p_user_id, p_sport_id)
        RETURNING * INTO v_stats;
    END IF;

    RETURN v_stats;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_friend_requests(current_user_id uuid)
 RETURNS TABLE(id uuid, requester_id uuid, requester_first_name text, requester_last_name text, requester_photo_url text, requester_club_id uuid, requester_club_name text, requester_elo_rating integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        p.id as requester_id,
        p.first_name as requester_first_name,
        p.last_name as requester_last_name,
        p.photo_url as requester_photo_url,
        p.club_id as requester_club_id,
        c.name as requester_club_name,
        p.elo_rating as requester_elo_rating,
        f.created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.requester_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.addressee_id = current_user_id
    AND f.status = 'pending'
    ORDER BY f.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_videos_for_coach(p_coach_id uuid)
 RETURNS TABLE(id uuid, video_url text, thumbnail_url text, title text, tags text[], exercise_id uuid, exercise_name text, uploaded_by uuid, uploader_name text, uploader_avatar text, assigned_players text[], assignment_count bigint, pending_count bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_club_id UUID;
BEGIN
    SELECT profiles.club_id INTO v_club_id FROM profiles WHERE profiles.id = p_coach_id;

    RETURN QUERY
    SELECT
        va.id AS id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        va.tags AS tags,
        va.exercise_id AS exercise_id,
        e.name AS exercise_name,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        p.avatar_url AS uploader_avatar,
        (SELECT ARRAY_AGG(COALESCE(pl.display_name, pl.first_name || ' ' || LEFT(pl.last_name, 1) || '.'))
         FROM video_assignments vass2
         JOIN profiles pl ON pl.id = vass2.player_id
         WHERE vass2.video_id = va.id)::TEXT[] AS assigned_players,
        (SELECT COUNT(*) FROM video_assignments vass WHERE vass.video_id = va.id)::BIGINT AS assignment_count,
        (SELECT COUNT(*) FROM video_assignments vass WHERE vass.video_id = va.id AND vass.status = 'pending')::BIGINT AS pending_count,
        va.created_at AS created_at
    FROM video_analyses va
    LEFT JOIN exercises e ON e.id = va.exercise_id
    LEFT JOIN profiles p ON p.id = va.uploaded_by
    WHERE va.club_id = v_club_id
      AND va.is_reference = false
      AND EXISTS (
          SELECT 1 FROM video_assignments vass
          WHERE vass.video_id = va.id AND vass.status = 'pending'
      )
    ORDER BY va.created_at ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_age(p_birthdate text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_birthdate IS NULL OR p_birthdate = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_birthdate::DATE))::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_streak(p_user_id uuid, p_subgroup_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    streak_count INTEGER;
BEGIN
    SELECT current_streak INTO streak_count
    FROM streaks
    WHERE user_id = p_user_id AND subgroup_id = p_subgroup_id;

    RETURN COALESCE(streak_count, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_videos(p_player_id uuid)
 RETURNS TABLE(id uuid, video_url text, thumbnail_url text, title text, tags text[], is_reference boolean, exercise_id uuid, exercise_name text, uploaded_by uuid, uploader_name text, status public.video_analysis_status, comment_count bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        va.id AS id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        va.tags AS tags,
        va.is_reference AS is_reference,
        va.exercise_id AS exercise_id,
        e.name AS exercise_name,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        COALESCE(vass.status, 'pending'::video_analysis_status) AS status,
        (SELECT COUNT(*) FROM video_comments vc WHERE vc.video_id = va.id)::BIGINT AS comment_count,
        va.created_at AS created_at
    FROM video_analyses va
    LEFT JOIN video_assignments vass ON vass.video_id = va.id AND vass.player_id = p_player_id
    LEFT JOIN exercises e ON e.id = va.exercise_id
    LEFT JOIN profiles p ON p.id = va.uploaded_by
    WHERE vass.player_id = p_player_id
       OR (va.uploaded_by = p_player_id AND va.club_id IS NULL)
    ORDER BY va.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_poll_details_for_child_session(p_session_token text, p_poll_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_child_club_id UUID;
    v_poll RECORD;
    v_options JSON;
    v_votes JSON;
    v_total_votes INT;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_child_club_id FROM profiles WHERE id = v_child_id;

    -- Get poll
    SELECT * INTO v_poll FROM polls WHERE id = p_poll_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Umfrage nicht gefunden');
    END IF;

    -- Check if child can see this poll (same club or public)
    IF v_poll.club_id != v_child_club_id AND v_poll.visibility != 'public' THEN
        RETURN json_build_object('success', false, 'error', 'Keine Berechtigung');
    END IF;

    -- Get options with vote counts
    SELECT json_agg(json_build_object(
        'id', po.id,
        'option_text', po.option_text,
        'vote_count', (SELECT COUNT(*) FROM poll_votes pv WHERE pv.option_id = po.id)
    ))
    INTO v_options
    FROM poll_options po
    WHERE po.poll_id = p_poll_id;

    -- Get total votes
    SELECT COUNT(*) INTO v_total_votes
    FROM poll_votes pv
    JOIN poll_options po ON pv.option_id = po.id
    WHERE po.poll_id = p_poll_id;

    -- Get votes if not anonymous
    IF v_poll.is_anonymous = false THEN
        SELECT json_agg(json_build_object(
            'user_id', pv.user_id,
            'option_id', pv.option_id,
            'voted_at', pv.voted_at
        ))
        INTO v_votes
        FROM poll_votes pv
        JOIN poll_options po ON pv.option_id = po.id
        WHERE po.poll_id = p_poll_id;
    ELSE
        v_votes := '[]'::json;
    END IF;

    RETURN json_build_object(
        'success', true,
        'poll', json_build_object(
            'id', v_poll.id,
            'question', v_poll.question,
            'visibility', v_poll.visibility,
            'is_anonymous', v_poll.is_anonymous,
            'status', v_poll.status,
            'ends_at', v_poll.ends_at,
            'created_at', v_poll.created_at,
            'creator_id', v_poll.creator_id
        ),
        'options', COALESCE(v_options, '[]'::json),
        'votes', v_votes,
        'total_votes', v_total_votes
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_for_child_session(p_session_token text, p_profile_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_profile RECORD;
    v_club RECORD;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get requested profile
    SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
           p.elo_rating, p.highest_elo, p.points, p.xp, p.grundlagen_completed,
           p.club_id, p.privacy_settings, p.age_mode
    INTO v_profile
    FROM profiles p WHERE p.id = p_profile_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profil nicht gefunden');
    END IF;

    IF v_profile.club_id IS NOT NULL THEN
        SELECT id, name INTO v_club FROM clubs WHERE id = v_profile.club_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'profile', json_build_object(
            'id', v_profile.id, 'first_name', v_profile.first_name, 'last_name', v_profile.last_name,
            'display_name', v_profile.display_name, 'avatar_url', v_profile.avatar_url,
            'elo_rating', v_profile.elo_rating, 'highest_elo', v_profile.highest_elo,
            'points', v_profile.points, 'xp', v_profile.xp,
            'grundlagen_completed', v_profile.grundlagen_completed, 'club_id', v_profile.club_id,
            'privacy_settings', v_profile.privacy_settings, 'age_mode', v_profile.age_mode,
            'clubs', CASE WHEN v_club.id IS NOT NULL THEN
                json_build_object('id', v_club.id, 'name', v_club.name) ELSE NULL END
        )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_profiles_for_child_session(p_session_token text, p_profile_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_child_club_id UUID;
    v_profiles JSON;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id for privacy filtering
    SELECT club_id INTO v_child_club_id FROM profiles WHERE id = v_child_id;

    -- Get profiles - respect privacy settings using 'searchable'
    SELECT json_agg(json_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'elo_rating', p.elo_rating,
        'club_id', p.club_id,
        'privacy_settings', p.privacy_settings
    ))
    INTO v_profiles
    FROM profiles p
    WHERE p.id = ANY(p_profile_ids)
    AND (
        -- Own profile always visible
        p.id = v_child_id
        OR
        -- Global visibility
        COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
        OR
        -- Same club members (for club_only or followers_only)
        (
            v_child_club_id IS NOT NULL
            AND p.club_id = v_child_club_id
            AND COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only')
        )
        -- Note: 'none' always hidden (not in any condition above)
    );

    RETURN json_build_object(
        'success', true,
        'profiles', COALESCE(v_profiles, '[]'::json)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_push_recipients(p_user_ids uuid[], p_notification_type text)
 RETURNS TABLE(user_id uuid, fcm_token text, push_platform text, display_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.fcm_token,
        p.push_platform,
        COALESCE(p.display_name, p.first_name, 'Nutzer') as display_name
    FROM profiles p
    WHERE p.id = ANY(p_user_ids)
      AND p.fcm_token IS NOT NULL
      AND p.notifications_enabled = true
      AND (
          p.notification_preferences IS NULL
          OR p.notification_preferences->>p_notification_type IS NULL
          OR (p.notification_preferences->>p_notification_type)::boolean = true
      );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rank_order(p_rank_name text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    RETURN CASE p_rank_name
        WHEN 'Rekrut' THEN 0
        WHEN 'Bronze' THEN 1
        WHEN 'Silber' THEN 2
        WHEN 'Gold' THEN 3
        WHEN 'Platin' THEN 4
        WHEN 'Champion' THEN 5
        ELSE 0
    END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_reference_videos(p_exercise_id uuid, p_club_id uuid)
 RETURNS TABLE(id uuid, video_url text, thumbnail_url text, title text, uploaded_by uuid, uploader_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        va.id AS id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        va.created_at AS created_at
    FROM video_analyses va
    JOIN profiles p ON p.id = va.uploaded_by
    WHERE va.exercise_id = p_exercise_id
      AND va.club_id = p_club_id
      AND va.is_reference = true
    ORDER BY va.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sent_friend_requests(current_user_id uuid)
 RETURNS TABLE(id uuid, addressee_id uuid, addressee_first_name text, addressee_last_name text, addressee_photo_url text, addressee_club_id uuid, addressee_club_name text, addressee_elo_rating integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        p.id as addressee_id,
        p.first_name as addressee_first_name,
        p.last_name as addressee_last_name,
        p.photo_url as addressee_photo_url,
        p.club_id as addressee_club_id,
        c.name as addressee_club_name,
        p.elo_rating as addressee_elo_rating,
        f.created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.addressee_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.requester_id = current_user_id
    AND f.status = 'pending'
    ORDER BY f.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sport_members(p_club_id uuid, p_sport_id uuid)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, email text, role text, photo_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.id as user_id,
        p.first_name,
        p.last_name,
        p.email,
        pcs.role,
        p.photo_url
    FROM profile_club_sports pcs
    JOIN profiles p ON p.id = pcs.user_id
    WHERE pcs.club_id = p_club_id
    AND pcs.sport_id = p_sport_id
    ORDER BY
        CASE pcs.role
            WHEN 'head_coach' THEN 1
            WHEN 'coach' THEN 2
            ELSE 3
        END,
        p.last_name,
        p.first_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_unread_count(current_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    total BIGINT;
BEGIN
    SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM chat_messages cm
         WHERE cm.conversation_id = cp.conversation_id
         AND cm.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
         AND cm.sender_id != current_user_id)
    ), 0) INTO total
    FROM chat_participants cp
    WHERE cp.user_id = current_user_id;

    RETURN total;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_active_sport(p_user_id uuid)
 RETURNS TABLE(sport_id uuid, sport_name text, display_name text, config jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    -- Erst prüfen ob active_sport_id gesetzt ist
    SELECT s.id, s.name, s.display_name, s.config
    FROM profiles p
    JOIN sports s ON s.id = p.active_sport_id
    WHERE p.id = p_user_id
    AND p.active_sport_id IS NOT NULL
    LIMIT 1;

    -- Falls nichts gefunden, erste Sportart aus profile_club_sports nehmen
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT s.id, s.name, s.display_name, s.config
        FROM profile_club_sports pcs
        JOIN sports s ON s.id = pcs.sport_id
        WHERE pcs.user_id = p_user_id
        ORDER BY pcs.created_at ASC
        LIMIT 1;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_exercise_records(p_user_id uuid, p_exercise_id uuid)
 RETURNS TABLE(record_value integer, play_mode text, partner_id uuid, partner_name text, achieved_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        er.record_value,
        er.play_mode,
        er.partner_id,
        CASE
            WHEN er.partner_id IS NOT NULL THEN p.first_name || ' ' || p.last_name
            ELSE NULL
        END as partner_name,
        er.achieved_at
    FROM exercise_records er
    LEFT JOIN profiles p ON er.partner_id = p.id
    WHERE er.user_id = p_user_id
      AND er.exercise_id = p_exercise_id
    ORDER BY er.record_value DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_followers(p_profile_id uuid, p_viewer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_privacy_setting TEXT;
    v_profile_club_id UUID;
    v_viewer_club_id UUID;
    v_is_following BOOLEAN;
    v_can_view BOOLEAN := false;
    v_followers JSONB;
BEGIN
    -- Own profile - always allowed
    IF p_profile_id = p_viewer_id AND p_viewer_id IS NOT NULL THEN
        v_can_view := true;
    ELSE
        -- Get profile's privacy settings and club
        -- Check both profile_visibility and searchable for compatibility
        SELECT
            COALESCE(
                privacy_settings->>'profile_visibility',
                privacy_settings->>'searchable',
                'global'
            ),
            club_id
        INTO v_privacy_setting, v_profile_club_id
        FROM profiles
        WHERE id = p_profile_id;

        -- Check based on privacy setting
        IF v_privacy_setting = 'global' OR v_privacy_setting = 'true' THEN
            v_can_view := true;
        ELSIF v_privacy_setting = 'club_only' AND p_viewer_id IS NOT NULL THEN
            -- Check if viewer is in same club
            SELECT club_id INTO v_viewer_club_id
            FROM profiles WHERE id = p_viewer_id;

            v_can_view := (v_profile_club_id IS NOT NULL AND v_profile_club_id = v_viewer_club_id);
        ELSIF v_privacy_setting IN ('friends_only', 'followers_only') AND p_viewer_id IS NOT NULL THEN
            -- Check if viewer follows the profile
            SELECT EXISTS (
                SELECT 1 FROM friendships
                WHERE requester_id = p_viewer_id
                AND addressee_id = p_profile_id
                AND status = 'accepted'
            ) INTO v_is_following;

            v_can_view := v_is_following;
        END IF;
        -- 'none' or no viewer = v_can_view stays false
    END IF;

    IF NOT v_can_view THEN
        RETURN jsonb_build_object(
            'success', false,
            'access_denied', true,
            'privacy_setting', v_privacy_setting,
            'message', CASE v_privacy_setting
                WHEN 'friends_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'followers_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'club_only' THEN 'Nur für Vereinsmitglieder sichtbar'
                WHEN 'none' THEN 'Diese Liste ist privat'
                ELSE 'Kein Zugriff'
            END
        );
    END IF;

    -- Get followers (people who follow this profile)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'avatar_url', p.avatar_url,
            'club_id', p.club_id,
            'club_name', c.name
        )
    ), '[]'::jsonb)
    INTO v_followers
    FROM friendships f
    JOIN profiles p ON p.id = f.requester_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE f.addressee_id = p_profile_id
    AND f.status = 'accepted';

    RETURN jsonb_build_object(
        'success', true,
        'access_denied', false,
        'followers', v_followers
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_following(p_profile_id uuid, p_viewer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_privacy_setting TEXT;
    v_profile_club_id UUID;
    v_viewer_club_id UUID;
    v_is_following BOOLEAN;
    v_can_view BOOLEAN := false;
    v_following JSONB;
BEGIN
    -- Own profile - always allowed
    IF p_profile_id = p_viewer_id AND p_viewer_id IS NOT NULL THEN
        v_can_view := true;
    ELSE
        -- Get profile's privacy settings and club
        SELECT
            COALESCE(
                privacy_settings->>'profile_visibility',
                privacy_settings->>'searchable',
                'global'
            ),
            club_id
        INTO v_privacy_setting, v_profile_club_id
        FROM profiles
        WHERE id = p_profile_id;

        -- Check based on privacy setting
        IF v_privacy_setting = 'global' OR v_privacy_setting = 'true' THEN
            v_can_view := true;
        ELSIF v_privacy_setting = 'club_only' AND p_viewer_id IS NOT NULL THEN
            -- Check if viewer is in same club
            SELECT club_id INTO v_viewer_club_id
            FROM profiles WHERE id = p_viewer_id;

            v_can_view := (v_profile_club_id IS NOT NULL AND v_profile_club_id = v_viewer_club_id);
        ELSIF v_privacy_setting IN ('friends_only', 'followers_only') AND p_viewer_id IS NOT NULL THEN
            -- Check if viewer follows the profile
            SELECT EXISTS (
                SELECT 1 FROM friendships
                WHERE requester_id = p_viewer_id
                AND addressee_id = p_profile_id
                AND status = 'accepted'
            ) INTO v_is_following;

            v_can_view := v_is_following;
        END IF;
    END IF;

    IF NOT v_can_view THEN
        RETURN jsonb_build_object(
            'success', false,
            'access_denied', true,
            'privacy_setting', v_privacy_setting,
            'message', CASE v_privacy_setting
                WHEN 'friends_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'followers_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'club_only' THEN 'Nur für Vereinsmitglieder sichtbar'
                WHEN 'none' THEN 'Diese Liste ist privat'
                ELSE 'Kein Zugriff'
            END
        );
    END IF;

    -- Get following (people this profile follows)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'avatar_url', p.avatar_url,
            'club_id', p.club_id,
            'club_name', c.name
        )
    ), '[]'::jsonb)
    INTO v_following
    FROM friendships f
    JOIN profiles p ON p.id = f.addressee_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE f.requester_id = p_profile_id
    AND f.status = 'accepted';

    RETURN jsonb_build_object(
        'success', true,
        'access_denied', false,
        'following', v_following
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_push_subscriptions(p_user_id uuid)
 RETURNS TABLE(endpoint text, p256dh text, auth text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    WHERE ps.user_id = p_user_id
      AND ps.is_active = true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_season_points(p_user_id uuid, p_club_id uuid)
 RETURNS TABLE(season_id uuid, season_name text, is_active boolean, points integer, sport_points integer, saved_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.is_active,
        usp.points,
        usp.sport_points,
        usp.updated_at
    FROM user_season_points usp
    JOIN seasons s ON s.id = usp.season_id
    WHERE usp.user_id = p_user_id
    AND s.club_id = p_club_id
    ORDER BY s.start_date DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_sport_context(p_user_id uuid)
 RETURNS TABLE(sport_id uuid, sport_name text, display_name text, config jsonb, club_id uuid, club_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_active_sport_id uuid;
BEGIN
    -- Get user's active sport from profile
    SELECT active_sport_id INTO v_active_sport_id
    FROM profiles
    WHERE id = p_user_id;

    -- If no active sport set, get first sport from profile_club_sports
    IF v_active_sport_id IS NULL THEN
        SELECT pcs.sport_id INTO v_active_sport_id
        FROM profile_club_sports pcs
        WHERE pcs.user_id = p_user_id
        ORDER BY pcs.created_at ASC
        LIMIT 1;
    END IF;

    -- If still no sport found, return empty
    IF v_active_sport_id IS NULL THEN
        RETURN;
    END IF;

    -- Return full context
    -- FIXED: Query sports table first, then LEFT JOIN profile_club_sports
    -- This way the query returns data even if user isn't in a club for that sport
    RETURN QUERY
    SELECT
        s.id as sport_id,
        s.name as sport_name,
        s.display_name,
        s.config,
        pcs.club_id,
        c.name as club_name,
        pcs.role
    FROM sports s
    LEFT JOIN profile_club_sports pcs ON pcs.sport_id = s.id AND pcs.user_id = p_user_id
    LEFT JOIN clubs c ON c.id = pcs.club_id
    WHERE s.id = v_active_sport_id
    LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_sports(p_user_id uuid)
 RETURNS TABLE(sport_id uuid, sport_name text, display_name text, config jsonb, role text, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.display_name,
        s.config,
        pcs.role,
        (p.active_sport_id = s.id) as is_active
    FROM profile_club_sports pcs
    JOIN sports s ON s.id = pcs.sport_id
    JOIN profiles p ON p.id = pcs.user_id
    WHERE pcs.user_id = p_user_id
    ORDER BY s.display_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_sports(p_user_id uuid, p_club_id uuid)
 RETURNS TABLE(sport_id uuid, sport_name text, sport_display_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        s.id as sport_id,
        s.name as sport_name,
        s.display_name as sport_display_name,
        pcs.role
    FROM profile_club_sports pcs
    JOIN sports s ON s.id = pcs.sport_id
    WHERE pcs.user_id = p_user_id
    AND pcs.club_id = p_club_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_video_comments(p_video_id uuid)
 RETURNS TABLE(id uuid, content text, timestamp_seconds double precision, parent_id uuid, user_id uuid, user_name text, user_avatar text, user_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        vc.id AS id,
        vc.content AS content,
        vc.timestamp_seconds AS timestamp_seconds,
        vc.parent_id AS parent_id,
        vc.user_id AS user_id,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS user_name,
        p.avatar_url AS user_avatar,
        p.role::TEXT AS user_role,
        vc.created_at AS created_at
    FROM video_comments vc
    JOIN profiles p ON p.id = vc.user_id
    WHERE vc.video_id = p_video_id
    ORDER BY COALESCE(vc.timestamp_seconds, 999999), vc.created_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_video_rallies(p_video_id uuid)
 RETURNS TABLE(id uuid, start_time double precision, end_time double precision, duration_seconds double precision, shot_count integer, winner text, source text, confidence double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        vrs.id,
        vrs.start_time,
        vrs.end_time,
        vrs.duration_seconds,
        vrs.shot_count,
        vrs.winner,
        vrs.source,
        vrs.confidence
    FROM video_rally_segments vrs
    WHERE vrs.video_id = p_video_id
    ORDER BY vrs.start_time;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_club_request(p_request_id uuid, p_action text, p_handled_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    request_data RECORD;
BEGIN
    -- Get request
    SELECT * INTO request_data FROM club_requests WHERE id = p_request_id;

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden');
    END IF;

    IF request_data.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage wurde bereits bearbeitet');
    END IF;

    IF p_action = 'approve' THEN
        IF request_data.type = 'join' THEN
            -- Add user to club
            UPDATE profiles SET
                club_id = request_data.club_id,
                club_joined_at = NOW(),
                updated_at = NOW()
            WHERE id = request_data.user_id;
        ELSIF request_data.type = 'leave' THEN
            -- Remove user from club
            UPDATE profiles SET
                club_id = NULL,
                club_joined_at = NULL,
                updated_at = NOW()
            WHERE id = request_data.user_id;
        END IF;

        -- Update request status
        UPDATE club_requests SET
            status = 'approved',
            handled_by = p_handled_by,
            handled_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', true, 'message', 'Anfrage genehmigt');
    ELSIF p_action = 'reject' THEN
        UPDATE club_requests SET
            status = 'rejected',
            handled_by = p_handled_by,
            handled_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', true, 'message', 'Anfrage abgelehnt');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Ungültige Aktion');
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.profiles (
        id, 
        email, 
        role, 
        onboarding_complete, 
        is_offline, 
        xp, 
        points, 
        elo_rating, 
        highest_elo,
        first_name,
        last_name,
        display_name
    )
    VALUES (
        NEW.id, 
        NEW.email, 
        'player', 
        false, 
        false, 
        0, 
        0, 
        1000, 
        1000,
        '',
        '',
        ''
    );
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hard_delete_account(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_own_account BOOLEAN;
    v_is_guardian_of_child BOOLEAN;
    v_profile_exists BOOLEAN;
    v_singles_match_ids UUID[];
    v_doubles_match_ids UUID[];
BEGIN
    -- Check if profile exists
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) INTO v_profile_exists;

    IF NOT v_profile_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Profil nicht gefunden'
        );
    END IF;

    -- Check if user is deleting their own account
    v_is_own_account := (p_user_id = auth.uid());

    -- Check if user is guardian of this child
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = auth.uid()
        AND child_id = p_user_id
    ) INTO v_is_guardian_of_child;

    -- Must be either own account or guardian of child
    IF NOT v_is_own_account AND NOT v_is_guardian_of_child THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Keine Berechtigung zum Löschen dieses Accounts'
        );
    END IF;

    -- =====================================================
    -- DELETE ALL USER DATA (order matters for FK constraints)
    -- =====================================================

    -- 1. Delete guardian relationships (both as guardian and as child)
    DELETE FROM guardian_links WHERE guardian_id = p_user_id OR child_id = p_user_id;

    -- 2. FIRST: Collect all match IDs where user is involved (for activity cleanup)
    SELECT ARRAY_AGG(id) INTO v_singles_match_ids
    FROM matches
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    SELECT ARRAY_AGG(id) INTO v_doubles_match_ids
    FROM doubles_matches
    WHERE team_a_player1_id = p_user_id
       OR team_a_player2_id = p_user_id
       OR team_b_player1_id = p_user_id
       OR team_b_player2_id = p_user_id;

    -- 3. Delete all likes and comments on user's matches (activity cards)
    BEGIN
        IF v_singles_match_ids IS NOT NULL AND array_length(v_singles_match_ids, 1) > 0 THEN
            DELETE FROM activity_likes
            WHERE activity_type = 'singles_match'
            AND activity_id = ANY(v_singles_match_ids);

            DELETE FROM activity_comments
            WHERE activity_type = 'singles_match'
            AND activity_id = ANY(v_singles_match_ids);
        END IF;

        IF v_doubles_match_ids IS NOT NULL AND array_length(v_doubles_match_ids, 1) > 0 THEN
            DELETE FROM activity_likes
            WHERE activity_type = 'doubles_match'
            AND activity_id = ANY(v_doubles_match_ids);

            DELETE FROM activity_comments
            WHERE activity_type = 'doubles_match'
            AND activity_id = ANY(v_doubles_match_ids);
        END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 4. Delete all match-related data
    -- Singles matches (as player A, B, winner, or loser)
    DELETE FROM matches
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    -- Match requests
    DELETE FROM match_requests
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    -- Match proposals
    DELETE FROM match_proposals
    WHERE requester_id = p_user_id OR recipient_id = p_user_id;

    -- 5. Delete doubles match data
    DELETE FROM doubles_matches
    WHERE team_a_player1_id = p_user_id
       OR team_a_player2_id = p_user_id
       OR team_b_player1_id = p_user_id
       OR team_b_player2_id = p_user_id;

    DELETE FROM doubles_match_requests
    WHERE initiated_by = p_user_id
       OR (team_a->>'player1_id')::UUID = p_user_id
       OR (team_a->>'player2_id')::UUID = p_user_id
       OR (team_b->>'player1_id')::UUID = p_user_id
       OR (team_b->>'player2_id')::UUID = p_user_id;

    -- Delete doubles pairings where user is involved
    DELETE FROM doubles_pairings
    WHERE player1_id = p_user_id OR player2_id = p_user_id;

    -- 6. Delete attendance records
    DELETE FROM attendance WHERE user_id = p_user_id;

    -- 7. Delete history records
    DELETE FROM points_history WHERE user_id = p_user_id;
    DELETE FROM xp_history WHERE user_id = p_user_id;

    -- 8. Delete streaks
    DELETE FROM streaks WHERE user_id = p_user_id;

    -- 9. Delete completed challenges and exercises
    DELETE FROM completed_challenges WHERE user_id = p_user_id;
    DELETE FROM completed_exercises WHERE user_id = p_user_id;
    DELETE FROM exercise_milestones WHERE user_id = p_user_id;

    -- 10. Delete notifications
    DELETE FROM notifications WHERE user_id = p_user_id;

    -- 11. Delete social data (friendships)
    -- Friendships table uses requester_id and addressee_id columns
    BEGIN
        DELETE FROM friendships WHERE requester_id = p_user_id OR addressee_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 12. Delete remaining activity data (user's own likes, comments, events)
    BEGIN
        DELETE FROM activity_likes WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM activity_comments WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM activity_events WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 13. Delete community posts
    BEGIN
        DELETE FROM posts WHERE author_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM poll_votes WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 14. Delete club requests
    DELETE FROM club_requests WHERE player_id = p_user_id;
    DELETE FROM leave_club_requests WHERE player_id = p_user_id;

    -- 15. Delete subgroup memberships
    DELETE FROM subgroup_members WHERE user_id = p_user_id;

    -- 16. Clear record holder references in exercises (set to NULL)
    UPDATE exercises SET
        record_holder_id = NULL,
        record_holder_name = NULL
    WHERE record_holder_id = p_user_id;

    -- 17. Delete user preferences if table exists
    BEGIN
        DELETE FROM user_preferences WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 18. Delete user sport stats if table exists
    BEGIN
        DELETE FROM user_sport_stats WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 19. Delete profile club sports if table exists
    BEGIN
        DELETE FROM profile_club_sports WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 20. FINALLY: Delete the profile itself
    DELETE FROM profiles WHERE id = p_user_id;

    -- 21. Delete the auth account (for regular accounts, not child accounts)
    -- Child accounts don't have auth.users entries
    IF v_is_own_account THEN
        DELETE FROM auth.users WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account und alle Daten wurden vollständig gelöscht'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hide_content(current_user_id uuid, p_content_type text, p_content_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Check if already hidden
    IF EXISTS (
        SELECT 1 FROM hidden_content
        WHERE user_id = current_user_id
        AND content_type = p_content_type::reportable_content_type
        AND content_id = p_content_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Content already hidden');
    END IF;

    INSERT INTO hidden_content (user_id, content_type, content_id)
    VALUES (current_user_id, p_content_type::reportable_content_type, p_content_id);

    RETURN json_build_object(
        'success', true,
        'message', 'Content hidden successfully'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_poll_votes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE community_polls
    SET total_votes = total_votes + 1,
        options = (
            SELECT jsonb_agg(
                CASE
                    WHEN elem->>'id' = NEW.option_id
                    THEN jsonb_set(elem, '{votes}', to_jsonb(COALESCE((elem->>'votes')::int, 0) + 1))
                    ELSE elem
                END
            )
            FROM jsonb_array_elements(options) elem
        )
    WHERE id = NEW.poll_id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_post_likes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE community_posts
    SET likes_count = likes_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.is_chat_admin(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid() AND role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_chat_participant(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_coach_for_player_club(p_child_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_coach_club_id UUID;
    v_child_club_id UUID;
    v_coach_role TEXT;
BEGIN
    -- Get coach's club and role
    SELECT club_id, role INTO v_coach_club_id, v_coach_role
    FROM profiles
    WHERE id = auth.uid();

    -- Check if user is a coach
    IF v_coach_role NOT IN ('coach', 'head_coach', 'admin') THEN
        RETURN FALSE;
    END IF;

    -- Get child's club
    SELECT club_id INTO v_child_club_id
    FROM profiles
    WHERE id = p_child_id;

    -- Check if same club
    RETURN v_coach_club_id IS NOT NULL AND v_coach_club_id = v_child_club_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_coach_for_sport(p_user_id uuid, p_club_id uuid, p_sport_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profile_club_sports
        WHERE user_id = p_user_id
        AND club_id = p_club_id
        AND sport_id = p_sport_id
        AND role IN ('coach', 'head_coach')
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_coach_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('coach', 'head_coach', 'admin')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_guardian_of_participant(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM guardian_links gl
    JOIN chat_participants cp ON cp.conversation_id = p_conversation_id AND cp.user_id = gl.child_id
    WHERE gl.guardian_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_head_coach_for_sport(p_user_id uuid, p_club_id uuid, p_sport_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profile_club_sports
        WHERE user_id = p_user_id
        AND club_id = p_club_id
        AND sport_id = p_sport_id
        AND role = 'head_coach'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_blocked(current_user_id uuid, target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN json_build_object(
        'is_blocked', EXISTS (
            SELECT 1 FROM user_blocks
            WHERE blocker_id = current_user_id AND blocked_id = target_user_id
        ),
        'is_blocked_by', EXISTS (
            SELECT 1 FROM user_blocks
            WHERE blocker_id = target_user_id AND blocked_id = current_user_id
        )
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.kick_player_from_club(p_player_id uuid, p_head_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_player_club_id UUID;
    v_head_coach_club_id UUID;
    v_head_coach_role TEXT;
    v_player_role TEXT;
BEGIN
    -- Get head_coach's club and role
    SELECT club_id, role INTO v_head_coach_club_id, v_head_coach_role
    FROM profiles
    WHERE id = p_head_coach_id;

    -- Verify the caller is a head_coach
    IF v_head_coach_role != 'head_coach' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nur Head-Coaches können Spieler aus dem Verein entfernen.');
    END IF;

    -- Get player's club and role
    SELECT club_id, role INTO v_player_club_id, v_player_role
    FROM profiles
    WHERE id = p_player_id;

    -- Check player exists
    IF v_player_club_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist in keinem Verein.');
    END IF;

    -- Check player is in the same club
    IF v_player_club_id != v_head_coach_club_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist nicht in deinem Verein.');
    END IF;

    -- Cannot kick another head_coach
    IF v_player_role = 'head_coach' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Head-Coaches können nicht entfernt werden.');
    END IF;

    -- Cannot kick yourself
    IF p_player_id = p_head_coach_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst entfernen.');
    END IF;

    -- Kick the player: set club_id to NULL and role to 'player'
    UPDATE profiles
    SET
        club_id = NULL,
        role = 'player',
        updated_at = NOW()
    WHERE id = p_player_id;

    RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_club_directly(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_player RECORD;
    v_club_id UUID;
BEGIN
    -- Get the player's current data
    SELECT id, club_id, role INTO v_player
    FROM profiles
    WHERE id = p_player_id;

    IF v_player IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    IF v_player.club_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist keinem Verein zugeordnet');
    END IF;

    v_club_id := v_player.club_id;

    -- *** NEU: Saisonpunkte speichern BEVOR sie zurückgesetzt werden ***
    PERFORM save_user_season_points(p_player_id, v_club_id);

    -- Remove player from club, clear subgroups, downgrade role if coach
    -- Reset season points (points are club-bound)
    UPDATE profiles
    SET
        club_id = NULL,
        subgroup_ids = '{}',
        points = 0,
        role = CASE
            WHEN role IN ('coach', 'head_coach') THEN 'player'
            ELSE role
        END,
        updated_at = NOW()
    WHERE id = p_player_id;

    -- Reset sport-specific season points
    UPDATE user_sport_stats
    SET points = 0
    WHERE user_id = p_player_id;

    -- Remove from subgroup_members table if it exists
    DELETE FROM subgroup_members
    WHERE user_id = p_player_id
    AND subgroup_id IN (SELECT id FROM subgroups WHERE club_id = v_club_id);

    -- Remove from profile_club_sports
    DELETE FROM profile_club_sports
    WHERE user_id = p_player_id AND club_id = v_club_id;

    -- Create activity event
    INSERT INTO activity_events (user_id, club_id, event_type, event_data, created_at)
    VALUES (
        p_player_id,
        v_club_id,
        'club_leave',
        jsonb_build_object(
            'left_directly', true,
            'previous_role', v_player.role
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Spieler hat den Verein verlassen',
        'was_coach', v_player.role IN ('coach', 'head_coach')
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.link_guardian_to_child(p_child_id uuid, p_child_birthdate date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_child RECORD;
    v_existing_link RECORD;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get child profile
    SELECT * INTO v_child
    FROM profiles
    WHERE id = p_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Kind nicht gefunden'
        );
    END IF;

    -- Verify birthdate matches
    IF v_child.birthdate != p_child_birthdate THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Geburtsdatum stimmt nicht überein'
        );
    END IF;

    -- Check if link already exists
    SELECT * INTO v_existing_link
    FROM guardian_links
    WHERE guardian_id = v_guardian_id
    AND child_id = p_child_id;

    IF FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Du bist bereits als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_guardian_id,
        p_child_id,
        'parent',
        false,  -- Not primary if linking to existing child
        now(),
        '1.0'
    );

    -- Update guardian's is_guardian flag
    UPDATE profiles
    SET is_guardian = true
    WHERE id = v_guardian_id
    AND is_guardian = false;

    -- Log consent
    INSERT INTO guardian_consent_log (
        guardian_id,
        child_id,
        consent_type,
        terms_version
    ) VALUES (
        v_guardian_id,
        p_child_id,
        'registration',
        '1.0'
    );

    RETURN json_build_object(
        'success', true,
        'child_id', p_child_id,
        'child_name', v_child.display_name
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.link_guardian_via_code(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_code_record RECORD;
    v_child_profile RECORD;
    v_existing_link RECORD;
    v_guardian_profile RECORD;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RETURN json_build_object('success', FALSE, 'error', 'Nicht angemeldet');
    END IF;

    -- Normalize code
    p_code := UPPER(TRIM(p_code));

    -- Find valid code
    SELECT * INTO v_code_record
    FROM child_login_codes
    WHERE code = p_code
    AND used_at IS NULL
    AND expires_at > now()
    AND failed_attempts < 5;

    IF NOT FOUND THEN
        -- Increment failed attempts if code exists
        UPDATE child_login_codes
        SET failed_attempts = failed_attempts + 1
        WHERE code = p_code;

        RETURN json_build_object('success', FALSE, 'error', 'Ungültiger oder abgelaufener Code');
    END IF;

    -- Get child profile
    SELECT * INTO v_child_profile
    FROM profiles
    WHERE id = v_code_record.child_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Kind nicht gefunden');
    END IF;

    -- Check if guardian is already linked to this child
    SELECT * INTO v_existing_link
    FROM guardian_links
    WHERE guardian_id = v_guardian_id
    AND child_id = v_child_profile.id;

    IF FOUND THEN
        -- Still mark code as used
        UPDATE child_login_codes
        SET used_at = now()
        WHERE id = v_code_record.id;

        RETURN json_build_object(
            'success', TRUE,
            'child_id', v_child_profile.id,
            'message', 'Du bist bereits als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_guardian_id,
        v_child_profile.id,
        'parent',
        TRUE,
        now(),
        '1.0'
    );

    -- Mark code as used
    UPDATE child_login_codes
    SET used_at = now()
    WHERE id = v_code_record.id;

    -- Update guardian's profile to mark as guardian if not already
    UPDATE profiles
    SET
        is_guardian = TRUE,
        account_type = CASE
            WHEN account_type = 'standard' THEN 'guardian'
            ELSE account_type
        END
    WHERE id = v_guardian_id;

    -- Update child's guardian_id reference if empty
    UPDATE profiles
    SET guardian_id = v_guardian_id
    WHERE id = v_child_profile.id
    AND guardian_id IS NULL;

    RETURN json_build_object(
        'success', TRUE,
        'child_id', v_child_profile.id,
        'child_name', v_child_profile.first_name || ' ' || COALESCE(v_child_profile.last_name, ''),
        'message', 'Kind erfolgreich verknüpft'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.link_guardian_via_invitation_code(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_code_record RECORD;
    v_child_profile RECORD;
    v_existing_link RECORD;
    v_child_id UUID;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RETURN json_build_object('success', FALSE, 'error', 'Nicht angemeldet');
    END IF;

    -- Normalize code
    p_code := UPPER(TRIM(p_code));

    -- Find valid code
    SELECT * INTO v_code_record
    FROM invitation_codes
    WHERE code = p_code
    AND (used = FALSE OR used IS NULL)
    AND (expires_at IS NULL OR expires_at > now())
    AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Ungültiger oder abgelaufener Code');
    END IF;

    -- Determine child ID
    IF v_code_record.player_id IS NOT NULL THEN
        -- Use existing offline player
        v_child_id := v_code_record.player_id;

        -- Get child profile
        SELECT * INTO v_child_profile
        FROM profiles
        WHERE id = v_child_id;

        IF NOT FOUND THEN
            RETURN json_build_object('success', FALSE, 'error', 'Spielerprofil nicht gefunden');
        END IF;
    ELSE
        -- Code has no player_id - this shouldn't happen for offline players
        -- Return error since we expect offline players to have player_id set
        RETURN json_build_object('success', FALSE, 'error', 'Code ist nicht mit einem Spieler verknüpft');
    END IF;

    -- Check if guardian is already linked to this child
    SELECT * INTO v_existing_link
    FROM guardian_links
    WHERE guardian_id = v_guardian_id
    AND child_id = v_child_id;

    IF FOUND THEN
        -- Mark code as used
        UPDATE invitation_codes
        SET used = TRUE, used_by = v_guardian_id, used_at = now()
        WHERE id = v_code_record.id;

        RETURN json_build_object(
            'success', TRUE,
            'child_id', v_child_id,
            'message', 'Du bist bereits als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_guardian_id,
        v_child_id,
        'parent',
        TRUE,
        now(),
        '1.0'
    );

    -- Mark code as used
    UPDATE invitation_codes
    SET used = TRUE, used_by = v_guardian_id, used_at = now()
    WHERE id = v_code_record.id;

    -- Update guardian's profile to mark as guardian if not already
    UPDATE profiles
    SET
        is_guardian = TRUE,
        account_type = CASE
            WHEN account_type = 'standard' THEN 'guardian'
            ELSE account_type
        END
    WHERE id = v_guardian_id;

    -- Update child to mark as child account if it's an offline player
    UPDATE profiles
    SET account_type = 'child'
    WHERE id = v_child_id
    AND (account_type IS NULL OR account_type = 'standard' OR is_offline = TRUE);

    RETURN json_build_object(
        'success', TRUE,
        'child_id', v_child_id,
        'child_name', COALESCE(v_child_profile.first_name, '') || ' ' || COALESCE(v_child_profile.last_name, ''),
        'message', 'Kind erfolgreich verknüpft'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_actor_id uuid, p_target_id uuid DEFAULT NULL::uuid, p_target_type text DEFAULT NULL::text, p_club_id uuid DEFAULT NULL::uuid, p_sport_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        action,
        actor_id,
        target_id,
        target_type,
        club_id,
        sport_id,
        details
    ) VALUES (
        p_action,
        p_actor_id,
        p_target_id,
        p_target_type,
        p_club_id,
        p_sport_id,
        p_details
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.logout_child_session(p_session_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE child_sessions
    SET is_valid = false
    WHERE session_token = p_session_token;

    RETURN json_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_push_subscription_used(p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE push_subscriptions
    SET last_used_at = now()
    WHERE endpoint = p_endpoint;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.migrate_offline_player(p_new_user_id uuid, p_offline_player_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_offline_player RECORD;
    v_matches_a INT := 0;
    v_matches_b INT := 0;
    v_matches_winner INT := 0;
    v_matches_loser INT := 0;
    v_deleted_count INT := 0;
BEGIN
    SELECT * INTO v_offline_player
    FROM profiles
    WHERE id = p_offline_player_id AND is_offline = TRUE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Offline player not found');
    END IF;

    UPDATE profiles SET
        first_name = COALESCE(v_offline_player.first_name, first_name),
        last_name = COALESCE(v_offline_player.last_name, last_name),
        display_name = COALESCE(v_offline_player.display_name, display_name),
        club_id = v_offline_player.club_id,
        role = COALESCE(v_offline_player.role, 'player'),
        xp = COALESCE(v_offline_player.xp, 0),
        points = COALESCE(v_offline_player.points, 0),
        elo_rating = COALESCE(v_offline_player.elo_rating, 800),
        highest_elo = COALESCE(v_offline_player.highest_elo, 800),
        doubles_elo_rating = COALESCE(v_offline_player.doubles_elo_rating, 800),
        is_match_ready = COALESCE(v_offline_player.is_match_ready, FALSE),
        subgroup_ids = COALESCE(v_offline_player.subgroup_ids, '{}'),
        active_sport_id = v_offline_player.active_sport_id,
        is_offline = FALSE,
        updated_at = NOW()
    WHERE id = p_new_user_id;

    UPDATE matches SET player_a_id = p_new_user_id WHERE player_a_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_a = ROW_COUNT;
    UPDATE matches SET player_b_id = p_new_user_id WHERE player_b_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_b = ROW_COUNT;
    UPDATE matches SET winner_id = p_new_user_id WHERE winner_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_winner = ROW_COUNT;
    UPDATE matches SET loser_id = p_new_user_id WHERE loser_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_loser = ROW_COUNT;

    UPDATE doubles_matches SET team_a_player1_id = p_new_user_id WHERE team_a_player1_id = p_offline_player_id;
    UPDATE doubles_matches SET team_a_player2_id = p_new_user_id WHERE team_a_player2_id = p_offline_player_id;
    UPDATE doubles_matches SET team_b_player1_id = p_new_user_id WHERE team_b_player1_id = p_offline_player_id;
    UPDATE doubles_matches SET team_b_player2_id = p_new_user_id WHERE team_b_player2_id = p_offline_player_id;

    UPDATE attendance SET user_id = p_new_user_id WHERE user_id = p_offline_player_id;
    UPDATE profile_club_sports SET user_id = p_new_user_id WHERE user_id = p_offline_player_id;
    UPDATE match_requests SET player_a_id = p_new_user_id WHERE player_a_id = p_offline_player_id;
    UPDATE match_requests SET player_b_id = p_new_user_id WHERE player_b_id = p_offline_player_id;

    UPDATE invitation_codes SET player_id = NULL, used_by = p_new_user_id, used_at = NOW()
    WHERE player_id = p_offline_player_id;

    DELETE FROM profiles WHERE id = p_offline_player_id AND is_offline = TRUE;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN json_build_object(
        'success', TRUE,
        'matches_player_a_updated', v_matches_a,
        'matches_player_b_updated', v_matches_b,
        'matches_winner_updated', v_matches_winner,
        'matches_loser_updated', v_matches_loser,
        'profile_deleted', v_deleted_count > 0
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_club_coaches(p_club_id uuid, p_request_type text, p_player_name text, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_coach RECORD;
    v_notification_count INT := 0;
    v_notification_type TEXT;
    v_title TEXT;
    v_message TEXT;
BEGIN
    -- Validate request type
    IF p_request_type NOT IN ('join', 'leave') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid request type');
    END IF;

    -- Set notification details based on type
    IF p_request_type = 'join' THEN
        v_notification_type := 'club_join_request';
        v_title := 'Neue Beitrittsanfrage';
        v_message := p_player_name || ' möchte dem Verein beitreten.';
    ELSE
        v_notification_type := 'club_leave_request';
        v_title := 'Neue Austrittsanfrage';
        v_message := p_player_name || ' möchte den Verein verlassen.';
    END IF;

    -- Find all coaches and head_coaches in the club and notify them
    FOR v_coach IN
        SELECT id FROM profiles
        WHERE club_id = p_club_id
        AND role IN ('coach', 'head_coach')
    LOOP
        INSERT INTO notifications (user_id, type, title, message, data, is_read)
        VALUES (
            v_coach.id,
            v_notification_type,
            v_title,
            v_message,
            jsonb_build_object('player_name', p_player_name, 'player_id', p_player_id),
            false
        );
        v_notification_count := v_notification_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'coaches_notified', v_notification_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_coaches_on_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    reporter_name TEXT;
    reported_name TEXT;
    report_type_label TEXT;
    content_type_label TEXT;
    coach_record RECORD;
BEGIN
    -- Get reporter name
    SELECT COALESCE(first_name || ' ' || last_name, 'Unbekannt')
    INTO reporter_name
    FROM profiles WHERE id = NEW.reporter_id;

    -- Get reported user name
    SELECT COALESCE(first_name || ' ' || last_name, 'Unbekannt')
    INTO reported_name
    FROM profiles WHERE id = NEW.reported_user_id;

    -- Map report type to German label
    report_type_label := CASE NEW.report_type
        WHEN 'spam' THEN 'Spam'
        WHEN 'harassment' THEN 'Belästigung'
        WHEN 'hate_speech' THEN 'Hassrede'
        WHEN 'violence' THEN 'Gewalt'
        WHEN 'inappropriate_content' THEN 'Unangemessener Inhalt'
        WHEN 'impersonation' THEN 'Identitätsdiebstahl'
        WHEN 'misinformation' THEN 'Fehlinformation'
        ELSE 'Sonstiges'
    END;

    -- Map content type to German label
    content_type_label := CASE NEW.content_type::TEXT
        WHEN 'user' THEN 'Nutzer'
        WHEN 'post' THEN 'Beitrag'
        WHEN 'poll' THEN 'Umfrage'
        WHEN 'comment' THEN 'Kommentar'
        ELSE 'Inhalt'
    END;

    -- Create notification for all coaches in the reporter's club
    FOR coach_record IN
        SELECT p.id
        FROM profiles p
        WHERE p.role IN ('coach', 'admin', 'head_coach')
        AND (
            -- Same club as reporter
            p.club_id = (SELECT club_id FROM profiles WHERE id = NEW.reporter_id)
            -- Or same club as reported user
            OR p.club_id = (SELECT club_id FROM profiles WHERE id = NEW.reported_user_id)
        )
    LOOP
        INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            data
        ) VALUES (
            coach_record.id,
            'content_report',
            'Neue Meldung eingegangen',
            reporter_name || ' hat einen ' || content_type_label || ' gemeldet (' || report_type_label || ')',
            json_build_object(
                'report_id', NEW.id,
                'reporter_id', NEW.reporter_id,
                'reported_user_id', NEW.reported_user_id,
                'content_type', NEW.content_type,
                'report_type', NEW.report_type,
                'url', '/admin-reports.html'
            )
        );
    END LOOP;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_head_coach_leave(p_club_id uuid, p_player_name text, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_head_coach RECORD;
    v_notification_count INT := 0;
BEGIN
    -- Find only the head_coach(es) in the club
    FOR v_head_coach IN
        SELECT id FROM profiles
        WHERE club_id = p_club_id
        AND role = 'head_coach'
    LOOP
        INSERT INTO notifications (user_id, type, title, message, data, is_read)
        VALUES (
            v_head_coach.id,
            'club_member_left',
            'Mitglied ausgetreten',
            p_player_name || ' hat den Verein verlassen.',
            jsonb_build_object('player_name', p_player_name, 'player_id', p_player_id),
            false
        );
        v_notification_count := v_notification_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'coaches_notified', v_notification_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.perform_season_reset(p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    club_record RECORD;
    clubs_reset INTEGER := 0;
    players_reset INTEGER := 0;
    total_players INTEGER := 0;
BEGIN
    -- Process clubs (all clubs if p_club_id is NULL)
    FOR club_record IN
        SELECT id FROM clubs
        WHERE (p_club_id IS NULL OR id = p_club_id)
    LOOP
        -- Reset points for all players in club
        UPDATE profiles SET
            points = 0,
            last_season_reset = NOW(),
            updated_at = NOW()
        WHERE club_id = club_record.id AND role = 'player';

        -- Note: League promotions/demotions would need more complex logic
        -- This is simplified to just reset points

        clubs_reset := clubs_reset + 1;

        SELECT COUNT(*) INTO total_players
        FROM profiles
        WHERE club_id = club_record.id AND role = 'player';

        players_reset := players_reset + total_players;
    END LOOP;

    -- Update config
    UPDATE config SET
        value = jsonb_set(value, '{last_reset_date}', to_jsonb(NOW()::TEXT)),
        updated_at = NOW()
    WHERE key = 'season_reset';

    RETURN jsonb_build_object(
        'success', true,
        'clubs_reset', clubs_reset,
        'players_reset', players_reset,
        'reset_date', NOW()
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_approved_doubles_match_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create doubles match from request (extract from JSONB team_a and team_b)
        INSERT INTO doubles_matches (
            club_id, winning_team,
            team_a_player1_id, team_a_player2_id, team_a_pairing_id,
            team_b_player1_id, team_b_player2_id, team_b_pairing_id,
            sets, match_mode, handicap_used, handicap, is_cross_club, played_at, created_at
        ) VALUES (
            NEW.club_id, NEW.winning_team,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            NEW.team_a->>'pairing_id',
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.team_b->>'pairing_id',
            NEW.sets, COALESCE(NEW.match_mode, 'best-of-5'), COALESCE(NEW.handicap_used, false), NEW.handicap, NEW.is_cross_club, NOW(), NOW()
        );

        -- Delete the request
        DELETE FROM doubles_match_requests WHERE id = NEW.id;

        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_approved_doubles_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create the doubles match from the request
        INSERT INTO doubles_matches (
            club_id,
            team_a_player1_id,
            team_a_player2_id,
            team_a_pairing_id,
            team_b_player1_id,
            team_b_player2_id,
            team_b_pairing_id,
            winning_team,
            sets,
            match_mode,
            handicap_used,
            handicap,
            is_cross_club,
            created_by
        ) VALUES (
            NEW.club_id,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            NEW.team_a->>'pairing_id',
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.team_b->>'pairing_id',
            NEW.winning_team,
            NEW.sets,
            COALESCE(NEW.match_mode, 'best-of-5'),
            COALESCE(NEW.handicap_used, false),
            NEW.handicap,
            NEW.is_cross_club,
            NEW.initiated_by
        );
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_doubles_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    team_a_avg_elo INTEGER;
    team_b_avg_elo INTEGER;
    winner_elo INTEGER;
    loser_elo INTEGER;
    elo_delta INTEGER;
    k_factor INTEGER := 32;
    winner_team TEXT;
    winner_pairing_id TEXT;
    loser_pairing_id TEXT;
    season_points INTEGER;
BEGIN
    -- Skip if already processed or no winning_team
    IF NEW.winning_team IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calculate pairing IDs (sorted player IDs)
    IF NEW.team_a_player1_id < NEW.team_a_player2_id THEN
        winner_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_a_player1_id || '_' || NEW.team_a_player2_id
            ELSE NEW.team_b_player1_id || '_' || NEW.team_b_player2_id END;
        loser_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_b_player1_id || '_' || NEW.team_b_player2_id
            ELSE NEW.team_a_player1_id || '_' || NEW.team_a_player2_id END;
    ELSE
        winner_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_a_player2_id || '_' || NEW.team_a_player1_id
            ELSE NEW.team_b_player2_id || '_' || NEW.team_b_player1_id END;
        loser_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_b_player2_id || '_' || NEW.team_b_player1_id
            ELSE NEW.team_a_player2_id || '_' || NEW.team_a_player1_id END;
    END IF;

    -- Get or create pairings with their ELO ratings
    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name)
    SELECT
        winner_pairing_id,
        LEAST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END
        ),
        GREATEST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END
        ),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name)
    SELECT
        loser_pairing_id,
        LEAST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END
        ),
        GREATEST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END
        ),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END)
    ON CONFLICT (id) DO NOTHING;

    -- Get current ELO ratings
    SELECT COALESCE(current_elo_rating, 1000) INTO winner_elo
    FROM doubles_pairings WHERE id = winner_pairing_id;

    SELECT COALESCE(current_elo_rating, 1000) INTO loser_elo
    FROM doubles_pairings WHERE id = loser_pairing_id;

    -- Calculate ELO change
    elo_delta := ROUND(k_factor * (1.0 - (1.0 / (1.0 + POWER(10.0, (loser_elo - winner_elo)::NUMERIC / 400.0)))));

    -- Update winner pairing
    UPDATE doubles_pairings
    SET
        matches_played = matches_played + 1,
        matches_won = matches_won + 1,
        current_elo_rating = current_elo_rating + elo_delta,
        win_rate = (matches_won + 1)::REAL / (matches_played + 1)::REAL,
        last_played = NOW()
    WHERE id = winner_pairing_id;

    -- Update loser pairing
    UPDATE doubles_pairings
    SET
        matches_played = matches_played + 1,
        matches_lost = matches_lost + 1,
        current_elo_rating = GREATEST(100, current_elo_rating - elo_delta),
        win_rate = matches_won::REAL / (matches_played + 1)::REAL,
        last_played = NOW()
    WHERE id = loser_pairing_id;

    -- Update individual player stats
    UPDATE profiles
    SET
        doubles_matches_played = COALESCE(doubles_matches_played, 0) + 1,
        doubles_matches_won = CASE
            WHEN id IN (
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END,
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END
            ) THEN COALESCE(doubles_matches_won, 0) + 1
            ELSE COALESCE(doubles_matches_won, 0)
        END,
        doubles_matches_lost = CASE
            WHEN id IN (
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END,
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END
            ) THEN COALESCE(doubles_matches_lost, 0) + 1
            ELSE COALESCE(doubles_matches_lost, 0)
        END
    WHERE id IN (
        NEW.team_a_player1_id, NEW.team_a_player2_id,
        NEW.team_b_player1_id, NEW.team_b_player2_id
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_doubles_match_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    winning_players UUID[];
    losing_players UUID[];
    team_a_pairing TEXT;
    team_b_pairing TEXT;
    winner_pairing TEXT;
    loser_pairing TEXT;
    team_a_elo INTEGER;
    team_b_elo INTEGER;
    elo_result RECORD;
    season_point_change INTEGER;
    xp_per_player INTEGER;
    k_factor INTEGER := 32;
    handicap_points INTEGER := 8;
    player_id UUID;
    winner_elo_change INTEGER;
    loser_elo_change INTEGER;
    partner_name_1 TEXT;
    partner_name_2 TEXT;
BEGIN
    -- Skip if already processed
    IF NEW.processed = true THEN
        RETURN NEW;
    END IF;

    -- Determine winning and losing teams
    IF NEW.winning_team = 'A' THEN
        winning_players := ARRAY[NEW.team_a_player1_id, NEW.team_a_player2_id];
        losing_players := ARRAY[NEW.team_b_player1_id, NEW.team_b_player2_id];
    ELSE
        winning_players := ARRAY[NEW.team_b_player1_id, NEW.team_b_player2_id];
        losing_players := ARRAY[NEW.team_a_player1_id, NEW.team_a_player2_id];
    END IF;

    -- Calculate pairing IDs (sorted player IDs for consistency)
    IF NEW.team_a_player1_id < NEW.team_a_player2_id THEN
        team_a_pairing := NEW.team_a_player1_id || '_' || NEW.team_a_player2_id;
    ELSE
        team_a_pairing := NEW.team_a_player2_id || '_' || NEW.team_a_player1_id;
    END IF;

    IF NEW.team_b_player1_id < NEW.team_b_player2_id THEN
        team_b_pairing := NEW.team_b_player1_id || '_' || NEW.team_b_player2_id;
    ELSE
        team_b_pairing := NEW.team_b_player2_id || '_' || NEW.team_b_player1_id;
    END IF;

    -- Store pairing IDs on match record
    NEW.team_a_pairing_id := team_a_pairing;
    NEW.team_b_pairing_id := team_b_pairing;

    -- Determine winner/loser pairings
    IF NEW.winning_team = 'A' THEN
        winner_pairing := team_a_pairing;
        loser_pairing := team_b_pairing;
    ELSE
        winner_pairing := team_b_pairing;
        loser_pairing := team_a_pairing;
    END IF;

    -- Create pairings if they don't exist (start at 800 Elo)
    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name, current_elo_rating)
    VALUES (
        team_a_pairing,
        LEAST(NEW.team_a_player1_id, NEW.team_a_player2_id),
        GREATEST(NEW.team_a_player1_id, NEW.team_a_player2_id),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_a_player1_id),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_a_player2_id),
        800
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name, current_elo_rating)
    VALUES (
        team_b_pairing,
        LEAST(NEW.team_b_player1_id, NEW.team_b_player2_id),
        GREATEST(NEW.team_b_player1_id, NEW.team_b_player2_id),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_b_player1_id),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_b_player2_id),
        800
    ) ON CONFLICT (id) DO NOTHING;

    -- Get PAIRING Elo (not individual player average!)
    SELECT COALESCE(current_elo_rating, 800) INTO team_a_elo
    FROM doubles_pairings WHERE id = team_a_pairing;

    SELECT COALESCE(current_elo_rating, 800) INTO team_b_elo
    FROM doubles_pairings WHERE id = team_b_pairing;

    IF COALESCE(NEW.handicap_used, false) THEN
        -- Handicap match: Fixed changes
        season_point_change := handicap_points / 2;
        xp_per_player := 0;
        winner_elo_change := handicap_points;
        loser_elo_change := -handicap_points;

        -- Update PAIRING Elo (winner)
        UPDATE doubles_pairings SET
            current_elo_rating = current_elo_rating + handicap_points,
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_won = COALESCE(matches_won, 0) + 1,
            win_rate = (COALESCE(matches_won, 0) + 1)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = winner_pairing;

        -- Update PAIRING Elo (loser) with floor at 100
        UPDATE doubles_pairings SET
            current_elo_rating = GREATEST(100, current_elo_rating - handicap_points),
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_lost = COALESCE(matches_lost, 0) + 1,
            win_rate = COALESCE(matches_won, 0)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = loser_pairing;
    ELSE
        -- Standard match: Calculate Elo based on PAIRING ratings
        SELECT * INTO elo_result FROM calculate_elo(
            CASE WHEN NEW.winning_team = 'A' THEN team_a_elo ELSE team_b_elo END,
            CASE WHEN NEW.winning_team = 'A' THEN team_b_elo ELSE team_a_elo END,
            k_factor
        );

        season_point_change := ROUND(elo_result.elo_delta * 0.2 / 2);
        xp_per_player := ROUND(elo_result.elo_delta / 2);
        winner_elo_change := elo_result.elo_delta;
        loser_elo_change := -elo_result.elo_delta;

        -- Update PAIRING Elo (winner)
        UPDATE doubles_pairings SET
            current_elo_rating = current_elo_rating + elo_result.elo_delta,
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_won = COALESCE(matches_won, 0) + 1,
            win_rate = (COALESCE(matches_won, 0) + 1)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = winner_pairing;

        -- Update PAIRING Elo (loser) with floor at 100
        UPDATE doubles_pairings SET
            current_elo_rating = GREATEST(100, current_elo_rating - elo_result.elo_delta),
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_lost = COALESCE(matches_lost, 0) + 1,
            win_rate = COALESCE(matches_won, 0)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = loser_pairing;
    END IF;

    -- Update individual player stats (wins/losses, points, XP - but NOT individual doubles_elo_rating)
    FOREACH player_id IN ARRAY winning_players LOOP
        UPDATE profiles SET
            points = COALESCE(points, 0) + season_point_change,
            xp = COALESCE(xp, 0) + COALESCE(xp_per_player, 0),
            doubles_wins = COALESCE(doubles_wins, 0) + 1,
            updated_at = NOW()
        WHERE id = player_id;
    END LOOP;

    FOREACH player_id IN ARRAY losing_players LOOP
        UPDATE profiles SET
            doubles_losses = COALESCE(doubles_losses, 0) + 1,
            updated_at = NOW()
        WHERE id = player_id;
    END LOOP;

    -- Store Elo changes on the match record
    IF NEW.winning_team = 'A' THEN
        NEW.team_a_elo_change := winner_elo_change;
        NEW.team_b_elo_change := loser_elo_change;
    ELSE
        NEW.team_a_elo_change := loser_elo_change;
        NEW.team_b_elo_change := winner_elo_change;
    END IF;
    NEW.season_points_awarded := season_point_change;

    -- Add points_history for winning players (with partner name)
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_1 FROM profiles WHERE id = winning_players[1];
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_2 FROM profiles WHERE id = winning_players[2];

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        winning_players[1],
        season_point_change,
        COALESCE(xp_per_player, 0),
        winner_elo_change,
        'Doppel gewonnen (mit ' || COALESCE(partner_name_2, 'Partner') || ')',
        NOW(),
        NOW()
    );

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        winning_players[2],
        season_point_change,
        COALESCE(xp_per_player, 0),
        winner_elo_change,
        'Doppel gewonnen (mit ' || COALESCE(partner_name_1, 'Partner') || ')',
        NOW(),
        NOW()
    );

    -- Add points_history for losing players (with partner name)
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_1 FROM profiles WHERE id = losing_players[1];
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_2 FROM profiles WHERE id = losing_players[2];

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        losing_players[1],
        0,
        0,
        loser_elo_change,
        'Doppel verloren (mit ' || COALESCE(partner_name_2, 'Partner') || ')',
        NOW(),
        NOW()
    );

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        losing_players[2],
        0,
        0,
        loser_elo_change,
        'Doppel verloren (mit ' || COALESCE(partner_name_1, 'Partner') || ')',
        NOW(),
        NOW()
    );

    -- Mark match as processed
    NEW.processed := true;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_match_elo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_winner_current_elo INTEGER;
    v_loser_current_elo INTEGER;
    v_winner_highest_elo INTEGER;
    v_loser_highest_elo INTEGER;
    v_sport_key TEXT;
    v_elo_result RECORD;
    v_season_points INTEGER;
    v_xp_gain INTEGER;
BEGIN
    -- Only process if winner_id is set
    IF NEW.winner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if already processed (either by elo_change or processed flag)
    IF NEW.elo_change IS NOT NULL OR NEW.processed = true THEN
        RETURN NEW;
    END IF;

    -- Get sport key (default to table-tennis)
    SELECT COALESCE(s.name, 'table-tennis') INTO v_sport_key
    FROM sports s WHERE s.id = NEW.sport_id;
    v_sport_key := COALESCE(v_sport_key, 'table-tennis');

    -- Get current ELO ratings
    SELECT elo_rating, highest_elo
    INTO v_winner_current_elo, v_winner_highest_elo
    FROM profiles WHERE id = NEW.winner_id;

    SELECT elo_rating, highest_elo
    INTO v_loser_current_elo, v_loser_highest_elo
    FROM profiles WHERE id = NEW.loser_id;

    -- Fallback to 800 if no ELO
    v_winner_current_elo := COALESCE(v_winner_current_elo, 800);
    v_loser_current_elo := COALESCE(v_loser_current_elo, 800);
    v_winner_highest_elo := COALESCE(v_winner_highest_elo, v_winner_current_elo);
    v_loser_highest_elo := COALESCE(v_loser_highest_elo, v_loser_current_elo);

    -- Calculate ELO with advanced system
    SELECT * INTO v_elo_result FROM calculate_elo_advanced(
        NEW.winner_id,
        NEW.loser_id,
        v_winner_current_elo,
        v_loser_current_elo,
        COALESCE(NEW.handicap_used, FALSE),
        v_sport_key
    );

    -- Calculate season points and XP
    IF COALESCE(NEW.handicap_used, false) THEN
        v_season_points := 8;  -- Fixed for handicap
        v_xp_gain := 0;
    ELSE
        v_season_points := ROUND(v_elo_result.winner_elo_change * 0.2);
        v_xp_gain := v_elo_result.winner_elo_change;
    END IF;

    -- Update match with ELO data
    NEW.player_a_elo_before := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN v_winner_current_elo
        ELSE v_loser_current_elo
    END;
    NEW.player_b_elo_before := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN v_winner_current_elo
        ELSE v_loser_current_elo
    END;
    NEW.player_a_elo_after := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN v_elo_result.new_winner_elo
        ELSE v_elo_result.new_loser_elo
    END;
    NEW.player_b_elo_after := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN v_elo_result.new_winner_elo
        ELSE v_elo_result.new_loser_elo
    END;
    NEW.elo_change := v_elo_result.winner_elo_change;
    NEW.winner_elo_change := v_elo_result.winner_elo_change;
    NEW.loser_elo_change := v_elo_result.loser_elo_change;
    NEW.season_points_awarded := v_season_points;
    NEW.processed := true;

    -- Update winner profile (ELO + wins + XP + points)
    UPDATE profiles
    SET
        elo_rating = v_elo_result.new_winner_elo,
        highest_elo = GREATEST(v_winner_highest_elo, v_elo_result.new_winner_elo),
        singles_matches_played = COALESCE(singles_matches_played, 0) + 1,
        wins = COALESCE(wins, 0) + 1,
        xp = COALESCE(xp, 0) + v_xp_gain,
        points = COALESCE(points, 0) + v_season_points,
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Update loser profile (ELO + losses)
    UPDATE profiles
    SET
        elo_rating = v_elo_result.new_loser_elo,
        singles_matches_played = COALESCE(singles_matches_played, 0) + 1,
        losses = COALESCE(losses, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.loser_id;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_match_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    winner_data RECORD;
    loser_data RECORD;
    winner_elo INTEGER;
    loser_elo INTEGER;
    winner_highest_elo INTEGER;
    loser_highest_elo INTEGER;
    new_winner_elo INTEGER;
    new_loser_elo INTEGER;
    protected_loser_elo INTEGER;
    elo_result RECORD;
    season_point_change INTEGER;
    winner_xp_gain INTEGER;
    k_factor INTEGER := 32;
    handicap_points INTEGER := 8;
BEGIN
    -- Skip if already processed
    IF NEW.processed = true THEN
        RETURN NEW;
    END IF;

    -- Validate data
    IF NEW.winner_id IS NULL OR NEW.loser_id IS NULL THEN
        RAISE EXCEPTION 'Invalid match data: missing player IDs';
    END IF;

    -- Get player data
    SELECT * INTO winner_data FROM profiles WHERE id = NEW.winner_id;
    SELECT * INTO loser_data FROM profiles WHERE id = NEW.loser_id;

    IF winner_data IS NULL OR loser_data IS NULL THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    -- Get current Elo ratings (default 800)
    winner_elo := COALESCE(winner_data.elo_rating, 800);
    loser_elo := COALESCE(loser_data.elo_rating, 800);
    winner_highest_elo := COALESCE(winner_data.highest_elo, winner_elo);
    loser_highest_elo := COALESCE(loser_data.highest_elo, loser_elo);

    IF COALESCE(NEW.handicap_used, false) THEN
        -- Handicap match: Fixed Elo changes (+8/-8), no XP
        season_point_change := handicap_points;
        winner_xp_gain := 0;

        new_winner_elo := winner_elo + handicap_points;
        new_loser_elo := loser_elo - handicap_points;

        -- Apply Elo gate protection
        protected_loser_elo := apply_elo_gate(new_loser_elo, loser_elo, loser_highest_elo);
    ELSE
        -- Standard match: Calculate Elo dynamically
        SELECT * INTO elo_result FROM calculate_elo(winner_elo, loser_elo, k_factor);

        new_winner_elo := elo_result.new_winner_elo;
        new_loser_elo := elo_result.new_loser_elo;

        -- Apply Elo gate protection
        protected_loser_elo := apply_elo_gate(new_loser_elo, loser_elo, loser_highest_elo);

        -- Calculate season points (Elo delta * 0.2)
        season_point_change := ROUND(elo_result.elo_delta * 0.2);
        winner_xp_gain := elo_result.elo_delta;
    END IF;

    -- Update winner
    UPDATE profiles SET
        elo_rating = new_winner_elo,
        highest_elo = GREATEST(new_winner_elo, winner_highest_elo),
        points = COALESCE(points, 0) + season_point_change,
        xp = COALESCE(xp, 0) + winner_xp_gain,
        wins = COALESCE(wins, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Update loser
    UPDATE profiles SET
        elo_rating = protected_loser_elo,
        highest_elo = GREATEST(protected_loser_elo, loser_highest_elo),
        losses = COALESCE(losses, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.loser_id;

    -- Mark match as processed
    NEW.processed := true;
    NEW.winner_elo_change := new_winner_elo - winner_elo;
    NEW.loser_elo_change := protected_loser_elo - loser_elo;
    NEW.season_points_awarded := season_point_change;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    next_waitlist RECORD;
    event_max INTEGER;
    current_accepted INTEGER;
BEGIN
    -- Only trigger when status changes to 'declined'
    IF NEW.status = 'declined' AND (OLD.status IS NULL OR OLD.status != 'declined') THEN
        -- Get max participants for this event
        SELECT max_participants INTO event_max
        FROM events WHERE id = NEW.event_id;

        -- Only process if max_participants is set
        IF event_max IS NOT NULL THEN
            -- Count current accepted participants (excluding organizers)
            SELECT COUNT(*) INTO current_accepted
            FROM event_invitations
            WHERE event_id = NEW.event_id
            AND occurrence_date = NEW.occurrence_date
            AND status = 'accepted'
            AND role = 'participant';

            -- If there's room, promote next waitlisted person
            IF current_accepted < event_max THEN
                SELECT * INTO next_waitlist
                FROM event_waitlist
                WHERE event_id = NEW.event_id
                AND occurrence_date = NEW.occurrence_date
                AND promoted_at IS NULL
                ORDER BY position ASC
                LIMIT 1;

                IF FOUND THEN
                    -- Promote: update invitation to accepted
                    UPDATE event_invitations
                    SET status = 'accepted', response_at = NOW()
                    WHERE event_id = NEW.event_id
                    AND user_id = next_waitlist.user_id
                    AND occurrence_date = NEW.occurrence_date;

                    -- Mark as promoted
                    UPDATE event_waitlist
                    SET promoted_at = NOW()
                    WHERE id = next_waitlist.id;

                    -- Create notification for promoted user
                    INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
                    VALUES (
                        next_waitlist.user_id,
                        'event_waitlist_promoted',
                        'Platz frei geworden!',
                        'Ein Platz ist frei geworden. Du bist jetzt auf der Teilnehmerliste.',
                        jsonb_build_object('event_id', NEW.event_id),
                        false,
                        NOW()
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_to_coach(p_player_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID; v_caller_role TEXT; v_player_club_id UUID; v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT club_id INTO v_player_club_id FROM profiles WHERE id = p_player_id;
    IF v_player_club_id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player_club_id AND pcs.role = 'head_coach';
        IF v_caller_role IS NULL THEN RAISE EXCEPTION 'Only head_coach or admin can promote players'; END IF;
    END IF;
    UPDATE profiles SET role = 'coach', updated_at = NOW() WHERE id = p_player_id;
    UPDATE profile_club_sports SET role = 'coach' WHERE user_id = p_player_id AND club_id = v_player_club_id;
    SELECT json_build_object('success', TRUE, 'new_role', 'coach') INTO v_result;
    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_push_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_recipient RECORD;
    v_title TEXT;
    v_body TEXT;
BEGIN
    -- Get recipient info
    SELECT fcm_token, push_platform, notifications_enabled,
           notification_preferences, display_name, first_name
    INTO v_recipient
    FROM profiles
    WHERE id = NEW.user_id;

    -- Skip if no token or notifications disabled
    IF v_recipient.fcm_token IS NULL OR v_recipient.notifications_enabled = false THEN
        RETURN NEW;
    END IF;

    -- Check notification preferences for this type
    IF v_recipient.notification_preferences IS NOT NULL THEN
        -- Map notification type to preference key
        DECLARE
            v_pref_key TEXT;
        BEGIN
            v_pref_key := CASE NEW.type
                WHEN 'match_request' THEN 'match_requests'
                WHEN 'doubles_match_request' THEN 'doubles_match_requests'
                WHEN 'follow_request' THEN 'friend_requests'
                WHEN 'friend_request' THEN 'friend_requests'
                WHEN 'club_join_request' THEN 'club_requests'
                WHEN 'club_leave_request' THEN 'club_requests'
                WHEN 'points_awarded' THEN 'points_awarded'
                WHEN 'points_deducted' THEN 'points_awarded'
                ELSE NULL
            END;

            IF v_pref_key IS NOT NULL AND
               v_recipient.notification_preferences->>v_pref_key IS NOT NULL AND
               (v_recipient.notification_preferences->>v_pref_key)::boolean = false THEN
                RETURN NEW;
            END IF;
        END;
    END IF;

    -- Log the push notification to be sent
    INSERT INTO push_notification_logs (
        user_id,
        notification_type,
        title,
        body,
        data,
        platform,
        status
    ) VALUES (
        NEW.user_id,
        NEW.type,
        NEW.title,
        NEW.message,
        jsonb_build_object(
            'notification_id', NEW.id,
            'type', NEW.type,
            'data', NEW.data
        ),
        v_recipient.push_platform,
        'pending'
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_club_join_request(p_request_id uuid, p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    request_data RECORD;
    request_update_count INTEGER;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Update the request status
    UPDATE club_requests
    SET
        status = 'rejected',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Anfrage wurde abgelehnt', 'request_updated', request_update_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_club_leave_request(p_request_id uuid, p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    request_data RECORD;
    request_update_count INTEGER;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM leave_club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Update the request status
    UPDATE leave_club_requests
    SET
        status = 'rejected',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Austrittsanfrage wurde abgelehnt', 'request_updated', request_update_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_friend(current_user_id uuid, friend_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    deleted_count INT;
BEGIN
    -- Delete friendship ONE-WAY only
    -- Only delete where current user is the follower (requester)
    DELETE FROM friendships
    WHERE requester_id = current_user_id
    AND addressee_id = friend_id
    AND status = 'accepted';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Friendship not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Friend removed'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.report_content(reporter_user_id uuid, p_content_type text, p_content_id uuid, p_report_type text, p_description text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    reported_owner_id UUID;
    report_id UUID;
BEGIN
    -- Get the owner of the reported content
    CASE p_content_type
        WHEN 'user' THEN
            reported_owner_id := p_content_id;
        WHEN 'post' THEN
            SELECT user_id INTO reported_owner_id FROM community_posts WHERE id = p_content_id;
        WHEN 'poll' THEN
            SELECT user_id INTO reported_owner_id FROM community_polls WHERE id = p_content_id;
        WHEN 'comment' THEN
            SELECT user_id INTO reported_owner_id FROM post_comments WHERE id = p_content_id;
            IF reported_owner_id IS NULL THEN
                SELECT user_id INTO reported_owner_id FROM activity_comments WHERE id = p_content_id;
            END IF;
        WHEN 'match_media' THEN
            -- Match media owner would be determined by match participant
            reported_owner_id := NULL;
        ELSE
            RETURN json_build_object('success', false, 'error', 'Invalid content type');
    END CASE;

    -- Can't report yourself
    IF reporter_user_id = reported_owner_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot report your own content');
    END IF;

    -- Check if already reported
    IF EXISTS (
        SELECT 1 FROM content_reports
        WHERE reporter_id = reporter_user_id
        AND content_type = p_content_type::reportable_content_type
        AND content_id = p_content_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'You have already reported this content');
    END IF;

    -- Create the report
    INSERT INTO content_reports (
        reporter_id,
        content_type,
        content_id,
        reported_user_id,
        report_type,
        description
    )
    VALUES (
        reporter_user_id,
        p_content_type::reportable_content_type,
        p_content_id,
        reported_owner_id,
        p_report_type::report_type,
        p_description
    )
    RETURNING id INTO report_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Report submitted successfully',
        'report_id', report_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_season_points(p_club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    affected_count INTEGER;
    v_season RECORD;
BEGIN
    -- *** NEU: Punkte für alle aktiven Saisons archivieren ***
    FOR v_season IN
        SELECT s.id AS season_id, s.sport_id
        FROM seasons s
        WHERE s.club_id = p_club_id AND s.is_active = true
    LOOP
        INSERT INTO user_season_points (user_id, season_id, points, sport_points)
        SELECT
            p.id,
            v_season.season_id,
            COALESCE(p.points, 0),
            COALESCE(uss.points, 0)
        FROM profiles p
        LEFT JOIN user_sport_stats uss ON uss.user_id = p.id AND uss.sport_id = v_season.sport_id
        WHERE p.club_id = p_club_id
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            sport_points = EXCLUDED.sport_points,
            updated_at = NOW();
    END LOOP;

    -- Dann wie bisher zurücksetzen
    UPDATE profiles
    SET points = 0, updated_at = NOW()
    WHERE club_id = p_club_id;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_user_season_points(p_user_id uuid, p_club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_restored_points INTEGER := 0;
    v_season RECORD;
    v_saved RECORD;
BEGIN
    -- Für jede aktive Saison des Vereins prüfen ob Punkte gespeichert sind
    SELECT usp.points INTO v_restored_points
    FROM user_season_points usp
    JOIN seasons s ON s.id = usp.season_id
    WHERE usp.user_id = p_user_id
    AND s.club_id = p_club_id
    AND s.is_active = true
    ORDER BY usp.updated_at DESC
    LIMIT 1;

    v_restored_points := COALESCE(v_restored_points, 0);

    -- Sport-spezifische Punkte wiederherstellen
    FOR v_season IN
        SELECT s.id AS season_id, s.sport_id
        FROM seasons s
        WHERE s.club_id = p_club_id AND s.is_active = true
    LOOP
        SELECT usp.sport_points INTO v_saved
        FROM user_season_points usp
        WHERE usp.user_id = p_user_id AND usp.season_id = v_season.season_id;

        IF FOUND AND v_saved.sport_points > 0 THEN
            UPDATE user_sport_stats
            SET points = v_saved.sport_points
            WHERE user_id = p_user_id AND sport_id = v_season.sport_id;
        ELSE
            UPDATE user_sport_stats
            SET points = 0
            WHERE user_id = p_user_id AND sport_id = v_season.sport_id;
        END IF;
    END LOOP;

    RETURN v_restored_points;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_user_season_points(p_user_id uuid, p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile_points INTEGER;
    v_season RECORD;
    v_sport_points INTEGER;
BEGIN
    -- Aktuelle Punkte aus profiles holen
    SELECT COALESCE(points, 0) INTO v_profile_points
    FROM profiles
    WHERE id = p_user_id;

    -- Für jede aktive Saison des Vereins die Punkte speichern
    FOR v_season IN
        SELECT s.id AS season_id, s.sport_id
        FROM seasons s
        WHERE s.club_id = p_club_id AND s.is_active = true
    LOOP
        -- Sport-spezifische Punkte holen
        SELECT COALESCE(uss.points, 0) INTO v_sport_points
        FROM user_sport_stats uss
        WHERE uss.user_id = p_user_id AND uss.sport_id = v_season.sport_id;

        v_sport_points := COALESCE(v_sport_points, 0);

        -- Upsert in user_season_points
        INSERT INTO user_season_points (user_id, season_id, points, sport_points)
        VALUES (p_user_id, v_season.season_id, v_profile_points, v_sport_points)
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            sport_points = EXCLUDED.sport_points,
            updated_at = NOW();
    END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_players(search_query text, current_user_id uuid, limit_count integer DEFAULT 20)
 RETURNS TABLE(id uuid, first_name text, last_name text, avatar_url text, club_id uuid, club_name text, elo_rating integer, is_friend boolean, friendship_status public.friendship_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_user_club_id UUID;
BEGIN
    -- Get current user's club_id once
    SELECT p.club_id INTO current_user_club_id FROM profiles p WHERE p.id = current_user_id;

    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        -- Check if already friends
        EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.requester_id = current_user_id AND f.addressee_id = p.id)
               OR (f.requester_id = p.id AND f.addressee_id = current_user_id)
        ) as is_friend,
        -- Get friendship status if exists
        (
            SELECT f.status FROM friendships f
            WHERE (f.requester_id = current_user_id AND f.addressee_id = p.id)
               OR (f.requester_id = p.id AND f.addressee_id = current_user_id)
            LIMIT 1
        ) as friendship_status
    FROM profiles p
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE
        -- Not the current user
        p.id != current_user_id
        -- Exclude blocked users (in both directions)
        AND NOT EXISTS (
            SELECT 1 FROM user_blocks ub
            WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = p.id)
               OR (ub.blocker_id = p.id AND ub.blocked_id = current_user_id)
        )
        -- Search filter
        AND (
            p.first_name ILIKE '%' || search_query || '%'
            OR p.last_name ILIKE '%' || search_query || '%'
            OR (p.first_name || ' ' || p.last_name) ILIKE '%' || search_query || '%'
        )
        -- Privacy filter
        AND (
            (p.privacy_settings->>'searchable' = 'global' OR p.privacy_settings->>'searchable' = 'true')
            OR (
                p.privacy_settings->>'searchable' = 'club_only'
                AND p.club_id IS NOT NULL
                AND p.club_id = current_user_club_id
            )
            OR (
                p.privacy_settings->>'searchable' = 'friends_only'
                AND EXISTS (
                    SELECT 1 FROM friendships f2
                    WHERE ((f2.requester_id = current_user_id AND f2.addressee_id = p.id)
                        OR (f2.requester_id = p.id AND f2.addressee_id = current_user_id))
                    AND f2.status = 'accepted'
                )
            )
        )
    ORDER BY
        -- Friends first
        CASE WHEN EXISTS (
            SELECT 1 FROM friendships f3
            WHERE ((f3.requester_id = current_user_id AND f3.addressee_id = p.id)
                OR (f3.requester_id = p.id AND f3.addressee_id = current_user_id))
            AND f3.status = 'accepted'
        ) THEN 0 ELSE 1 END,
        p.first_name, p.last_name
    LIMIT limit_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_chat_push_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
        v_sender_name TEXT;
        v_conv_type TEXT;
        v_conv_name TEXT;
        v_participant RECORD;
        v_supabase_url TEXT;
        v_service_key TEXT;
        v_title TEXT;
        v_body TEXT;
        v_pref_value TEXT;
    BEGIN
        -- Get Supabase credentials
        v_supabase_url := current_setting('app.settings.supabase_url', true);
        v_service_key := current_setting('app.settings.service_role_key', true);

        IF v_supabase_url IS NULL THEN
            SELECT decrypted_secret INTO v_supabase_url
            FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
        END IF;

        IF v_service_key IS NULL THEN
            SELECT decrypted_secret INTO v_service_key
            FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
        END IF;

        -- Skip if credentials not configured
        IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
            RETURN NEW;
        END IF;

        -- Get sender name
        SELECT COALESCE(display_name, first_name, 'Jemand')
        INTO v_sender_name
        FROM profiles WHERE id = NEW.sender_id;

        -- Get conversation info
        SELECT type, name INTO v_conv_type, v_conv_name
        FROM chat_conversations WHERE id = NEW.conversation_id;

        -- Build notification title and body
        IF v_conv_type = 'group' THEN
            v_title := COALESCE(v_conv_name, 'Gruppenchat');
            v_body := v_sender_name || ': ' || LEFT(NEW.content, 100);
        ELSE
            v_title := v_sender_name;
            v_body := LEFT(NEW.content, 100);
        END IF;

        -- Send to all participants except the sender
        FOR v_participant IN
            SELECT cp.user_id, p.fcm_token, p.notifications_enabled, p.notification_preferences
            FROM chat_participants cp
            JOIN profiles p ON p.id = cp.user_id
            WHERE cp.conversation_id = NEW.conversation_id
            AND cp.user_id != NEW.sender_id
            AND p.fcm_token IS NOT NULL
            AND p.notifications_enabled = true
        LOOP
            -- Check if user has disabled chat_messages notifications
            IF v_participant.notification_preferences IS NOT NULL THEN
                v_pref_value := v_participant.notification_preferences->>'chat_messages';
                IF v_pref_value IS NOT NULL AND v_pref_value::boolean = false THEN
                    CONTINUE;
                END IF;
            END IF;

            -- Send push via pg_net (async, non-blocking)
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-push-notification',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := jsonb_build_object(
                    'user_id', v_participant.user_id::text,
                    'title', v_title,
                    'body', v_body,
                    'notification_type', 'chat_message',
                    'data', jsonb_build_object(
                        'type', 'chat_message',
                        'conversation_id', NEW.conversation_id::text,
                        'sender_id', NEW.sender_id::text
                    )
                )
            );
        END LOOP;

        RETURN NEW;
    END;
    $function$
;

CREATE OR REPLACE FUNCTION public.send_friend_request(current_user_id uuid, target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    existing_friendship friendships%ROWTYPE;
    new_friendship_id UUID;
    requester_name TEXT;
    requester_profile profiles%ROWTYPE;
    target_profile profiles%ROWTYPE;
    target_privacy_setting TEXT;
    should_auto_accept BOOLEAN := false;
    result_status TEXT;
    notification_type TEXT;
    notification_title TEXT;
    notification_message TEXT;
    result JSON;
BEGIN
    -- Validierung: Nicht sich selbst als Freund hinzufuegen
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot follow yourself');
    END IF;

    -- Check if either user has blocked the other
    IF EXISTS (
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = current_user_id AND blocked_id = target_user_id)
           OR (blocker_id = target_user_id AND blocked_id = current_user_id)
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Cannot send follow request');
    END IF;

    -- Get requester profile
    SELECT * INTO requester_profile FROM profiles WHERE id = current_user_id;
    requester_name := COALESCE(requester_profile.first_name, '') || ' ' || COALESCE(requester_profile.last_name, '');
    requester_name := TRIM(requester_name);
    IF requester_name = '' THEN
        requester_name := 'Ein Nutzer';
    END IF;

    -- Get target profile and privacy settings
    SELECT * INTO target_profile FROM profiles WHERE id = target_user_id;
    target_privacy_setting := COALESCE(target_profile.privacy_settings->>'profile_visibility', 'global');

    -- Check ob bereits eine Freundschaft existiert (in beide Richtungen)
    SELECT * INTO existing_friendship
    FROM friendships
    WHERE (requester_id = current_user_id AND addressee_id = target_user_id)
       OR (requester_id = target_user_id AND addressee_id = current_user_id)
    LIMIT 1;

    -- Wenn bereits existiert
    IF existing_friendship.id IS NOT NULL THEN
        IF existing_friendship.status = 'accepted' THEN
            RETURN json_build_object('success', false, 'error', 'Already following');
        ELSIF existing_friendship.status = 'pending' THEN
            -- Wenn die andere Person bereits eine Anfrage gesendet hat
            IF existing_friendship.requester_id = target_user_id THEN
                -- Auto-accept: both want to follow each other
                UPDATE friendships
                SET status = 'accepted', updated_at = NOW()
                WHERE id = existing_friendship.id;

                -- Notification: Mutual follow
                INSERT INTO notifications (user_id, type, title, message, data)
                VALUES (
                    target_user_id,
                    'new_follower',
                    'Neuer Abonnent',
                    requester_name || ' folgt dir jetzt',
                    json_build_object('friendship_id', existing_friendship.id, 'user_id', current_user_id)
                );

                RETURN json_build_object(
                    'success', true,
                    'message', 'Now following (mutual)',
                    'status', 'accepted',
                    'instant', true
                );
            ELSE
                RETURN json_build_object('success', false, 'error', 'Follow request already pending');
            END IF;
        ELSIF existing_friendship.status = 'blocked' THEN
            RETURN json_build_object('success', false, 'error', 'Cannot send follow request');
        END IF;
    END IF;

    -- Determine if auto-accept based on profile_visibility
    IF target_privacy_setting = 'global' THEN
        should_auto_accept := true;
    ELSIF target_privacy_setting = 'club_only' THEN
        IF requester_profile.club_id IS NOT NULL
           AND target_profile.club_id IS NOT NULL
           AND requester_profile.club_id = target_profile.club_id THEN
            should_auto_accept := true;
        ELSE
            should_auto_accept := false;
        END IF;
    ELSIF target_privacy_setting = 'followers_only' THEN
        IF EXISTS (
            SELECT 1 FROM friendships
            WHERE requester_id = target_user_id
            AND addressee_id = current_user_id
            AND status = 'accepted'
        ) THEN
            should_auto_accept := true;
        ELSE
            should_auto_accept := false;
        END IF;
    ELSE
        should_auto_accept := true;
    END IF;

    -- Create friendship with appropriate status
    IF should_auto_accept THEN
        result_status := 'accepted';
        notification_type := 'new_follower';
        notification_title := 'Neuer Abonnent';
        notification_message := requester_name || ' folgt dir jetzt';
    ELSE
        result_status := 'pending';
        notification_type := 'follow_request';
        notification_title := 'Neue Abonnement-Anfrage';
        notification_message := requester_name || ' moechte dir folgen';
    END IF;

    -- Insert new friendship
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES (current_user_id, target_user_id, result_status::friendship_status)
    RETURNING id INTO new_friendship_id;

    -- Create notification
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        target_user_id,
        notification_type,
        notification_title,
        notification_message,
        json_build_object(
            'friendship_id', new_friendship_id,
            'requester_id', current_user_id,
            'requires_action', NOT should_auto_accept
        )
    );

    result := json_build_object(
        'success', true,
        'message', CASE WHEN should_auto_accept THEN 'Now following' ELSE 'Follow request sent' END,
        'status', result_status,
        'friendship_id', new_friendship_id,
        'instant', should_auto_accept
    );

    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_push_notification_instant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_recipient RECORD;
    v_supabase_url TEXT := 'https://wmrbjuyqgbmvtzrujuxs.supabase.co'; 
    v_service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';         
    v_pref_key TEXT;
BEGIN
    -- Get recipient info
    SELECT fcm_token, push_platform, notifications_enabled,
           notification_preferences, display_name, first_name
    INTO v_recipient
    FROM profiles
    WHERE id = NEW.user_id;

    -- Skip if no token or notifications disabled
    IF v_recipient.fcm_token IS NULL OR v_recipient.notifications_enabled = false THEN
        RETURN NEW;
    END IF;

    -- Check notification preferences for this type
    IF v_recipient.notification_preferences IS NOT NULL THEN
        v_pref_key := CASE NEW.type
            WHEN 'match_request' THEN 'match_requests'
            WHEN 'doubles_match_request' THEN 'doubles_match_requests'
            WHEN 'follow_request' THEN 'friend_requests'
            WHEN 'friend_request' THEN 'friend_requests'
            WHEN 'club_join_request' THEN 'club_requests'
            WHEN 'club_leave_request' THEN 'club_requests'
            WHEN 'points_awarded' THEN 'points_awarded'
            WHEN 'points_deducted' THEN 'points_awarded'
            WHEN 'ranking_change' THEN 'ranking_changes'
            WHEN 'training_reminder' THEN 'training_reminders'
            ELSE NULL
        END;

        IF v_pref_key IS NOT NULL AND
           v_recipient.notification_preferences->>v_pref_key IS NOT NULL AND
           (v_recipient.notification_preferences->>v_pref_key)::boolean = false THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Call Edge Function via pg_net
    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'user_id', NEW.user_id::text,
            'title', NEW.title,
            'body', NEW.message,
            'notification_type', NEW.type,
            'data', jsonb_build_object(
                'notification_id', NEW.id::text,
                'type', NEW.type
            )
        )
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_child_credentials(p_child_id uuid, p_username text, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_guardian_id UUID;
    v_is_guardian BOOLEAN;
    v_existing_username UUID;
    v_normalized_username TEXT;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_guardian_id
        AND child_id = p_child_id
    ) INTO v_is_guardian;

    IF NOT v_is_guardian THEN
        RETURN json_build_object('success', FALSE, 'error', 'Du bist nicht der Vormund dieses Kindes');
    END IF;

    IF p_username IS NULL OR LENGTH(TRIM(p_username)) < 3 THEN
        RETURN json_build_object('success', FALSE, 'error', 'Benutzername muss mindestens 3 Zeichen haben');
    END IF;

    v_normalized_username := LOWER(TRIM(p_username));

    IF NOT v_normalized_username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' AND NOT v_normalized_username ~ '^[a-z0-9]$' THEN
        RETURN json_build_object('success', FALSE, 'error', 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Unterstriche und Bindestriche enthalten');
    END IF;

    SELECT id INTO v_existing_username FROM profiles WHERE username = v_normalized_username AND id != p_child_id;

    IF v_existing_username IS NOT NULL THEN
        RETURN json_build_object('success', FALSE, 'error', 'Dieser Benutzername ist bereits vergeben');
    END IF;

    IF p_pin IS NULL OR LENGTH(p_pin) < 4 OR LENGTH(p_pin) > 6 THEN
        RETURN json_build_object('success', FALSE, 'error', 'PIN muss 4-6 Ziffern haben');
    END IF;

    IF NOT p_pin ~ '^[0-9]{4,6}$' THEN
        RETURN json_build_object('success', FALSE, 'error', 'PIN darf nur Ziffern enthalten');
    END IF;

    UPDATE profiles
    SET username = v_normalized_username, pin_hash = crypt(p_pin, gen_salt('bf', 8)), updated_at = now()
    WHERE id = p_child_id;

    RETURN json_build_object('success', TRUE, 'username', v_normalized_username, 'message', 'Zugangsdaten erfolgreich gespeichert');

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', FALSE, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_player_match_ready(p_player_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID; v_caller_role TEXT; v_player_club_id UUID; v_current_xp INTEGER; v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT club_id, xp INTO v_player_club_id, v_current_xp FROM profiles WHERE id = p_player_id;
    IF v_player_club_id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('coach', 'head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player_club_id AND pcs.role IN ('coach', 'head_coach');
        IF v_caller_role IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
    END IF;
    UPDATE profiles SET is_match_ready = TRUE, grundlagen_completed = 5, xp = COALESCE(v_current_xp, 0) + 50, updated_at = NOW() WHERE id = p_player_id;
    SELECT json_build_object('success', TRUE, 'new_xp', COALESCE(v_current_xp, 0) + 50) INTO v_result;
    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_active_sport(p_user_id uuid, p_sport_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Prüfen ob User in dieser Sportart ist
    IF NOT EXISTS (
        SELECT 1 FROM profile_club_sports
        WHERE user_id = p_user_id AND sport_id = p_sport_id
    ) THEN
        RAISE EXCEPTION 'User ist nicht in dieser Sportart registriert';
    END IF;

    -- Aktive Sportart setzen
    UPDATE profiles
    SET active_sport_id = p_sport_id
    WHERE id = p_user_id;

    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.should_use_handicap(p_player_a_elo integer, p_player_b_elo integer, p_sport_key text DEFAULT 'table-tennis'::text)
 RETURNS TABLE(use_handicap boolean, handicap_points integer, stronger_player text, elo_difference integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_config RECORD;
    v_diff INTEGER;
    v_handicap INTEGER;
    v_stronger TEXT;
BEGIN
    -- Get sport config
    SELECT * INTO v_config FROM elo_sport_config WHERE sport_key = p_sport_key;
    IF NOT FOUND THEN
        v_config.handicap_threshold := 40;
        v_config.handicap_per_points := 40;
        v_config.handicap_cap := 7;
    END IF;

    -- Calculate absolute difference
    v_diff := ABS(p_player_a_elo - p_player_b_elo);

    -- Determine stronger player
    IF p_player_a_elo > p_player_b_elo THEN
        v_stronger := 'A';
    ELSIF p_player_b_elo > p_player_a_elo THEN
        v_stronger := 'B';
    ELSE
        v_stronger := NULL;
    END IF;

    -- Check if handicap should be used
    IF v_diff >= v_config.handicap_threshold THEN
        -- Calculate handicap points
        v_handicap := LEAST(
            FLOOR(v_diff::NUMERIC / v_config.handicap_per_points)::INTEGER,
            v_config.handicap_cap
        );
        RETURN QUERY SELECT TRUE, v_handicap, v_stronger, v_diff;
    ELSE
        RETURN QUERY SELECT FALSE, 0, v_stronger, v_diff;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_new_season(p_sport_id uuid, p_name text, p_start_date date, p_end_date date, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new_season_id UUID;
BEGIN
    -- 1. Neue Saison erstellen (Trigger deaktiviert automatisch die alte)
    INSERT INTO seasons (sport_id, name, start_date, end_date, is_active, created_by)
    VALUES (p_sport_id, p_name, p_start_date, p_end_date, true, p_created_by)
    RETURNING id INTO v_new_season_id;

    -- 2. Saison-Punkte aller Spieler dieser Sportart auf 0 setzen
    -- (Nur für Spieler die in profile_club_sports für diese Sportart sind)
    UPDATE profiles p
    SET
        points = 0,  -- Saison-Punkte auf 0
        updated_at = NOW()
    WHERE p.id IN (
        SELECT pcs.user_id
        FROM profile_club_sports pcs
        WHERE pcs.sport_id = p_sport_id
    );

    RAISE NOTICE 'Neue Saison % gestartet für Sport %. Punkte wurden zurückgesetzt.', p_name, p_sport_id;

    RETURN v_new_season_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_new_season(p_sport_id uuid, p_name text, p_start_date date, p_end_date date, p_created_by uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new_season_id UUID;
    v_club_id UUID;
    v_old_season_id UUID;
BEGIN
    -- Club-ID vom Benutzer holen falls nicht übergeben
    IF p_club_id IS NULL THEN
        SELECT club_id INTO v_club_id
        FROM profiles
        WHERE id = p_created_by;
    ELSE
        v_club_id := p_club_id;
    END IF;

    -- *** NEU: Aktuelle Punkte für die ALTE Saison archivieren ***
    SELECT s.id INTO v_old_season_id
    FROM seasons s
    WHERE s.club_id = v_club_id
    AND s.sport_id = p_sport_id
    AND s.is_active = true
    LIMIT 1;

    IF v_old_season_id IS NOT NULL THEN
        -- Punkte aller Spieler dieses Vereins/Sports für die alte Saison speichern
        INSERT INTO user_season_points (user_id, season_id, points, sport_points)
        SELECT
            pcs.user_id,
            v_old_season_id,
            COALESCE(p.points, 0),
            COALESCE(uss.points, 0)
        FROM profile_club_sports pcs
        JOIN profiles p ON p.id = pcs.user_id
        LEFT JOIN user_sport_stats uss ON uss.user_id = pcs.user_id AND uss.sport_id = pcs.sport_id
        WHERE pcs.sport_id = p_sport_id
        AND pcs.club_id = v_club_id
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            sport_points = EXCLUDED.sport_points,
            updated_at = NOW();
    END IF;

    -- 1. Neue Saison erstellen (Trigger deaktiviert automatisch die alte für diesen Club)
    INSERT INTO seasons (sport_id, name, start_date, end_date, is_active, created_by, club_id)
    VALUES (p_sport_id, p_name, p_start_date, p_end_date, true, p_created_by, v_club_id)
    RETURNING id INTO v_new_season_id;

    -- 2. Saison-Punkte aller Spieler DIESES VEREINS für diese Sportart auf 0 setzen
    UPDATE profiles p
    SET
        points = 0,
        updated_at = NOW()
    WHERE p.id IN (
        SELECT pcs.user_id
        FROM profile_club_sports pcs
        WHERE pcs.sport_id = p_sport_id
        AND pcs.club_id = v_club_id
    );

    RAISE NOTICE 'Neue Saison % gestartet für Sport % in Club %. Punkte wurden zurückgesetzt.',
        p_name, p_sport_id, v_club_id;

    RETURN v_new_season_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.suggest_username(p_first_name text, p_birth_year integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base_username TEXT;
    v_suggestion TEXT;
    v_counter INT := 0;
    v_suggestions TEXT[] := '{}';
BEGIN
    -- Create base username from first name
    v_base_username := LOWER(TRIM(regexp_replace(p_first_name, '[^a-zA-Z0-9]', '', 'g')));

    IF LENGTH(v_base_username) < 3 THEN
        v_base_username := v_base_username || 'user';
    END IF;

    -- Try different combinations
    -- 1. Just the name
    v_suggestion := v_base_username;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
        v_suggestions := array_append(v_suggestions, v_suggestion);
    END IF;

    -- 2. Name + birth year
    IF p_birth_year IS NOT NULL THEN
        v_suggestion := v_base_username || p_birth_year::TEXT;
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
            v_suggestions := array_append(v_suggestions, v_suggestion);
        END IF;

        -- Short year version
        v_suggestion := v_base_username || (p_birth_year % 100)::TEXT;
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
            v_suggestions := array_append(v_suggestions, v_suggestion);
        END IF;
    END IF;

    -- 3. Name + random numbers
    WHILE array_length(v_suggestions, 1) < 3 AND v_counter < 100 LOOP
        v_suggestion := v_base_username || floor(random() * 1000)::INT::TEXT;
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
            IF NOT v_suggestion = ANY(v_suggestions) THEN
                v_suggestions := array_append(v_suggestions, v_suggestion);
            END IF;
        END IF;
        v_counter := v_counter + 1;
    END LOOP;

    RETURN json_build_object(
        'suggestions', v_suggestions
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_doubles_pairing_elo_to_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- When a pairing's Elo changes, update both players' profile
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update player 1
        PERFORM update_player_doubles_elo(NEW.player1_id);
        -- Update player 2
        PERFORM update_player_doubles_elo(NEW.player2_id);
    END IF;

    -- For updates where players change (rare), also update old players
    IF TG_OP = 'UPDATE' THEN
        IF OLD.player1_id IS DISTINCT FROM NEW.player1_id THEN
            PERFORM update_player_doubles_elo(OLD.player1_id);
        END IF;
        IF OLD.player2_id IS DISTINCT FROM NEW.player2_id THEN
            PERFORM update_player_doubles_elo(OLD.player2_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_season_points_on_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Nur synchronisieren wenn:
    -- 1. Punkte sich geändert haben
    -- 2. Spieler in einem Verein ist
    -- 3. club_id hat sich NICHT geändert (kein Join/Leave)
    IF NEW.points IS DISTINCT FROM OLD.points
       AND NEW.club_id IS NOT NULL
       AND OLD.club_id IS NOT NULL
       AND OLD.club_id = NEW.club_id THEN

        INSERT INTO user_season_points (user_id, season_id, points)
        SELECT NEW.id, s.id, NEW.points
        FROM seasons s
        WHERE s.club_id = NEW.club_id AND s.is_active = true
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_season_points_on_sport_stats_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_club_id UUID;
BEGIN
    -- Nur synchronisieren wenn Punkte sich geändert haben
    IF NEW.points IS DISTINCT FROM OLD.points THEN
        -- Club-ID des Spielers holen
        SELECT club_id INTO v_club_id
        FROM profiles
        WHERE id = NEW.user_id;

        -- Nur wenn Spieler in einem Verein ist
        IF v_club_id IS NOT NULL THEN
            UPDATE user_season_points usp
            SET sport_points = NEW.points, updated_at = NOW()
            FROM seasons s
            WHERE usp.season_id = s.id
            AND s.club_id = v_club_id
            AND s.sport_id = NEW.sport_id
            AND s.is_active = true
            AND usp.user_id = NEW.user_id;

            -- Falls kein Eintrag existiert, erstelle einen
            IF NOT FOUND THEN
                INSERT INTO user_season_points (user_id, season_id, points, sport_points)
                SELECT NEW.user_id, s.id,
                    COALESCE((SELECT points FROM profiles WHERE id = NEW.user_id), 0),
                    NEW.points
                FROM seasons s
                WHERE s.club_id = v_club_id
                AND s.sport_id = NEW.sport_id
                AND s.is_active = true
                ON CONFLICT (user_id, season_id) DO UPDATE SET
                    sport_points = EXCLUDED.sport_points,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_activity_like(p_activity_id uuid, p_activity_type text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_existing_like UUID;
    v_like_count INT;
    v_is_liked BOOLEAN;
    v_is_owner BOOLEAN := FALSE;
BEGIN
    -- Validate activity type
    IF p_activity_type NOT IN ('singles_match', 'doubles_match', 'post', 'poll', 'event', 'rank_up', 'club_join') THEN
        RAISE EXCEPTION 'Invalid activity type: %', p_activity_type;
    END IF;

    -- Check if user is owner/participant of the activity
    IF p_activity_type = 'singles_match' THEN
        SELECT EXISTS (
            SELECT 1 FROM matches
            WHERE id = p_activity_id
            AND (player_a_id = v_user_id OR player_b_id = v_user_id)
        ) INTO v_is_owner;
    ELSIF p_activity_type = 'doubles_match' THEN
        SELECT EXISTS (
            SELECT 1 FROM doubles_matches
            WHERE id = p_activity_id
            AND (team_a_player1_id = v_user_id OR team_a_player2_id = v_user_id
                 OR team_b_player1_id = v_user_id OR team_b_player2_id = v_user_id)
        ) INTO v_is_owner;
    ELSIF p_activity_type IN ('post', 'poll') THEN
        SELECT EXISTS (
            SELECT 1 FROM community_posts
            WHERE id = p_activity_id
            AND (user_id = v_user_id OR created_by = v_user_id)
        ) INTO v_is_owner;
    ELSIF p_activity_type IN ('rank_up', 'club_join', 'event') THEN
        SELECT EXISTS (
            SELECT 1 FROM activity_events
            WHERE id = p_activity_id
            AND user_id = v_user_id
        ) INTO v_is_owner;
    END IF;

    -- Prevent users from liking their own activities
    IF v_is_owner THEN
        RAISE EXCEPTION 'You cannot like your own activity';
    END IF;

    -- Check if user already liked this activity
    SELECT id INTO v_existing_like
    FROM activity_likes
    WHERE activity_id = p_activity_id
      AND activity_type = p_activity_type
      AND user_id = v_user_id;

    IF v_existing_like IS NOT NULL THEN
        -- Unlike
        DELETE FROM activity_likes WHERE id = v_existing_like;
        v_is_liked := FALSE;
    ELSE
        -- Like
        INSERT INTO activity_likes (activity_id, activity_type, user_id)
        VALUES (p_activity_id, p_activity_type, v_user_id);
        v_is_liked := TRUE;

        -- Send notifications based on activity type
        IF p_activity_type = 'singles_match' THEN
            -- Notify both players
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                player_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Spiel geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM (
                SELECT player_a_id AS player_id FROM matches WHERE id = p_activity_id
                UNION
                SELECT player_b_id FROM matches WHERE id = p_activity_id
            ) AS players
            WHERE player_id != v_user_id AND player_id IS NOT NULL;

        ELSIF p_activity_type = 'doubles_match' THEN
            -- Notify all 4 players
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                player_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Doppel geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM (
                SELECT team_a_player1_id AS player_id FROM doubles_matches WHERE id = p_activity_id
                UNION
                SELECT team_a_player2_id FROM doubles_matches WHERE id = p_activity_id
                UNION
                SELECT team_b_player1_id FROM doubles_matches WHERE id = p_activity_id
                UNION
                SELECT team_b_player2_id FROM doubles_matches WHERE id = p_activity_id
            ) AS players
            WHERE player_id != v_user_id AND player_id IS NOT NULL;

        ELSIF p_activity_type = 'post' THEN
            -- Notify post author
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                user_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deinen Beitrag geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM community_posts
            WHERE id = p_activity_id AND user_id != v_user_id;

        ELSIF p_activity_type = 'poll' THEN
            -- Notify poll author
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                created_by,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Umfrage geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM community_posts
            WHERE id = p_activity_id AND type = 'poll' AND created_by != v_user_id;

        ELSIF p_activity_type IN ('rank_up', 'club_join', 'event') THEN
            -- Notify event owner
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                user_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Aktivit�t geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM activity_events
            WHERE id = p_activity_id AND user_id != v_user_id;
        END IF;
    END IF;

    -- Get updated like count
    SELECT COUNT(*) INTO v_like_count
    FROM activity_likes
    WHERE activity_id = p_activity_id AND activity_type = p_activity_type;

    RETURN json_build_object(
        'is_liked', v_is_liked,
        'like_count', v_like_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unblock_user(current_user_id uuid, target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM user_blocks
    WHERE blocker_id = current_user_id AND blocked_id = target_user_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'User is not blocked');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'User unblocked successfully'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unhide_content(current_user_id uuid, p_content_type text, p_content_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM hidden_content
    WHERE user_id = current_user_id
    AND content_type = p_content_type::reportable_content_type
    AND content_id = p_content_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Content is not hidden');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Content is now visible again'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_activity_comment_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_age_mode()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only update if birthdate changed or is being set
    IF NEW.birthdate IS DISTINCT FROM OLD.birthdate THEN
        NEW.age_mode := calculate_age_mode(NEW.birthdate::DATE);
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_attendance_streak()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    last_date DATE;
    current_streak_val INTEGER;
    longest_streak_val INTEGER;
BEGIN
    -- Nur für anwesende Spieler
    IF NEW.present = FALSE THEN
        RETURN NEW;
    END IF;

    -- Aktuellen Streak holen
    SELECT last_attendance_date, current_streak, longest_streak
    INTO last_date, current_streak_val, longest_streak_val
    FROM streaks
    WHERE user_id = NEW.user_id AND subgroup_id = NEW.subgroup_id;

    IF NOT FOUND THEN
        -- Neuen Streak-Eintrag erstellen
        INSERT INTO streaks (user_id, subgroup_id, current_streak, longest_streak, last_attendance_date)
        VALUES (NEW.user_id, NEW.subgroup_id, 1, 1, NEW.date);
    ELSE
        -- Streak aktualisieren
        IF last_date IS NULL OR NEW.date > last_date THEN
            -- Prüfen ob Streak fortgesetzt wird (innerhalb von 7 Tagen)
            IF last_date IS NOT NULL AND (NEW.date - last_date) <= 7 THEN
                current_streak_val := current_streak_val + 1;
            ELSE
                current_streak_val := 1;
            END IF;

            longest_streak_val := GREATEST(longest_streak_val, current_streak_val);

            UPDATE streaks
            SET current_streak = current_streak_val,
                longest_streak = longest_streak_val,
                last_attendance_date = NEW.date,
                updated_at = NOW()
            WHERE user_id = NEW.user_id AND subgroup_id = NEW.subgroup_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_exercise_record(p_user_id uuid, p_exercise_id uuid, p_record_value integer, p_play_mode text DEFAULT 'solo'::text, p_partner_id uuid DEFAULT NULL::uuid, p_points_earned integer DEFAULT 0, p_season text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_existing_value INTEGER;
    v_time_direction TEXT;
    v_is_better BOOLEAN;
BEGIN
    -- Get the time direction for this exercise
    SELECT time_direction INTO v_time_direction
    FROM exercises
    WHERE id = p_exercise_id;

    -- Check existing record
    SELECT record_value INTO v_existing_value
    FROM exercise_records
    WHERE user_id = p_user_id
      AND exercise_id = p_exercise_id
      AND play_mode = p_play_mode
      AND COALESCE(partner_id, '00000000-0000-0000-0000-000000000000') = COALESCE(p_partner_id, '00000000-0000-0000-0000-000000000000');

    -- Determine if new value is better
    IF v_existing_value IS NULL THEN
        v_is_better := TRUE;
    ELSIF v_time_direction = 'faster' THEN
        v_is_better := p_record_value < v_existing_value;
    ELSE
        -- For 'longer' time or count-based: higher is better
        v_is_better := p_record_value > v_existing_value;
    END IF;

    -- Update if better
    IF v_is_better THEN
        INSERT INTO exercise_records (
            user_id, exercise_id, record_value, play_mode, partner_id, points_earned, season, achieved_at
        ) VALUES (
            p_user_id, p_exercise_id, p_record_value, p_play_mode, p_partner_id, p_points_earned, p_season, NOW()
        )
        ON CONFLICT (user_id, exercise_id, play_mode, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'))
        DO UPDATE SET
            record_value = p_record_value,
            points_earned = p_points_earned,
            achieved_at = NOW(),
            updated_at = NOW(),
            season = COALESCE(p_season, exercise_records.season);

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_head_to_head_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    h2h_id UUID;
    prev_last_winner UUID;
    prev_consecutive INTEGER;
    prev_handicap INTEGER;
    prev_streak_winner UUID;
    new_consecutive INTEGER;
    new_handicap INTEGER;
    new_streak_winner UUID;
    sport_handicap_cap INTEGER;
BEGIN
    -- Get or create h2h record
    h2h_id := get_or_create_h2h_stats(NEW.winner_id, NEW.loser_id);

    -- Get previous state (including current_streak_winner_id!)
    SELECT last_winner_id, consecutive_wins, suggested_handicap, current_streak_winner_id
    INTO prev_last_winner, prev_consecutive, prev_handicap, prev_streak_winner
    FROM head_to_head_stats WHERE id = h2h_id;

    prev_consecutive := COALESCE(prev_consecutive, 0);
    prev_handicap := COALESCE(prev_handicap, 0);

    -- Get sport-specific handicap cap from the match
    -- Default to 7 (table tennis) if not found
    BEGIN
        SELECT COALESCE(esc.handicap_cap, 7)
        INTO sport_handicap_cap
        FROM sports s
        LEFT JOIN elo_sport_config esc ON esc.sport_key = LOWER(REPLACE(s.name, ' ', '-'))
        WHERE s.id = NEW.sport_id;

        IF sport_handicap_cap IS NULL THEN
            sport_handicap_cap := 7; -- Default for table tennis
        END IF;
    EXCEPTION WHEN OTHERS THEN
        sport_handicap_cap := 7;
    END;

    -- Check if there's an active handicap situation
    IF prev_streak_winner IS NOT NULL AND prev_handicap > 0 THEN
        -- ACTIVE HANDICAP MODE: Someone has a streak with handicap
        IF NEW.winner_id = prev_streak_winner THEN
            -- Streak winner (favorite) wins again -> INCREASE handicap
            new_consecutive := prev_consecutive + 1;
            new_handicap := LEAST(prev_handicap + 1, sport_handicap_cap);
            new_streak_winner := prev_streak_winner;
        ELSE
            -- Underdog wins -> DECREASE handicap by 1
            new_consecutive := 1;
            new_handicap := prev_handicap - 1;

            IF new_handicap > 0 THEN
                -- Still has handicap, keep streak winner
                new_streak_winner := prev_streak_winner;
            ELSE
                -- Handicap is now 0, reset streak winner
                new_streak_winner := NULL;
            END IF;
        END IF;
    ELSE
        -- NO ACTIVE HANDICAP: Normal streak tracking
        IF prev_last_winner IS NULL OR prev_last_winner = NEW.winner_id THEN
            -- Same winner or first match - increment streak
            new_consecutive := prev_consecutive + 1;

            -- Handicap starts after 2 consecutive wins
            -- 2 wins = 1, 3 wins = 2, 4 wins = 3, etc. (capped by sport)
            IF new_consecutive >= 2 THEN
                new_handicap := LEAST(new_consecutive - 1, sport_handicap_cap);
                new_streak_winner := NEW.winner_id;
            ELSE
                new_handicap := 0;
                new_streak_winner := NULL;
            END IF;
        ELSE
            -- Different winner, reset streak
            new_consecutive := 1;
            new_handicap := 0;
            new_streak_winner := NULL;
        END IF;
    END IF;

    -- Update the h2h stats
    UPDATE head_to_head_stats SET
        last_winner_id = NEW.winner_id,
        consecutive_wins = new_consecutive,
        current_streak_winner_id = new_streak_winner,
        suggested_handicap = new_handicap,
        player_a_wins = CASE WHEN NEW.winner_id = player_a_id THEN player_a_wins + 1 ELSE player_a_wins END,
        player_b_wins = CASE WHEN NEW.winner_id = player_b_id THEN player_b_wins + 1 ELSE player_b_wins END,
        total_matches = total_matches + 1,
        last_match_at = NOW(),
        updated_at = NOW()
    WHERE id = h2h_id;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_matches_played()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE profiles
    SET matches_played = COALESCE(matches_played, 0) + 1
    WHERE id IN (NEW.player_a_id, NEW.player_b_id);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_player_doubles_elo(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_best_elo INT;
    v_total_matches INT;
BEGIN
    -- Find the player's best pairing Elo
    SELECT
        COALESCE(MAX(current_elo_rating), 800),
        COALESCE(SUM(matches_played), 0)
    INTO v_best_elo, v_total_matches
    FROM doubles_pairings
    WHERE player1_id = p_player_id OR player2_id = p_player_id;

    -- Update the player's profile
    UPDATE profiles
    SET
        doubles_elo_rating = v_best_elo,
        doubles_matches_played = v_total_matches
    WHERE id = p_player_id
      AND (doubles_elo_rating IS DISTINCT FROM v_best_elo
           OR doubles_matches_played IS DISTINCT FROM v_total_matches);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_push_subscription_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_sport_elo_after_match(p_winner_id uuid, p_loser_id uuid, p_sport_id uuid, p_is_doubles boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_winner_stats user_sport_stats;
    v_loser_stats user_sport_stats;
    v_winner_elo INTEGER;
    v_loser_elo INTEGER;
    v_expected_winner FLOAT;
    v_k_factor INTEGER := 32;
    v_elo_change INTEGER;
    v_new_winner_elo INTEGER;
    v_new_loser_elo INTEGER;
    v_min_elo INTEGER := 100;
BEGIN
    -- Stats holen oder erstellen
    SELECT * INTO v_winner_stats FROM get_or_create_sport_stats(p_winner_id, p_sport_id);
    SELECT * INTO v_loser_stats FROM get_or_create_sport_stats(p_loser_id, p_sport_id);

    -- ELO basierend auf Singles/Doubles
    IF p_is_doubles THEN
        v_winner_elo := COALESCE(v_winner_stats.doubles_elo_rating, 1000);
        v_loser_elo := COALESCE(v_loser_stats.doubles_elo_rating, 1000);
    ELSE
        v_winner_elo := COALESCE(v_winner_stats.elo_rating, 1000);
        v_loser_elo := COALESCE(v_loser_stats.elo_rating, 1000);
    END IF;

    -- ELO-Berechnung
    v_expected_winner := 1.0 / (1.0 + POWER(10, (v_loser_elo - v_winner_elo)::FLOAT / 400));
    v_elo_change := ROUND(v_k_factor * (1 - v_expected_winner));

    v_new_winner_elo := v_winner_elo + v_elo_change;
    v_new_loser_elo := GREATEST(v_min_elo, v_loser_elo - v_elo_change);

    -- Update Winner
    IF p_is_doubles THEN
        UPDATE user_sport_stats SET
            doubles_elo_rating = v_new_winner_elo,
            doubles_highest_elo = GREATEST(doubles_highest_elo, v_new_winner_elo),
            doubles_wins = doubles_wins + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_winner_id AND sport_id = p_sport_id;
    ELSE
        UPDATE user_sport_stats SET
            elo_rating = v_new_winner_elo,
            highest_elo = GREATEST(highest_elo, v_new_winner_elo),
            wins = wins + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_winner_id AND sport_id = p_sport_id;
    END IF;

    -- Update Loser
    IF p_is_doubles THEN
        UPDATE user_sport_stats SET
            doubles_elo_rating = v_new_loser_elo,
            doubles_losses = doubles_losses + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_loser_id AND sport_id = p_sport_id;
    ELSE
        UPDATE user_sport_stats SET
            elo_rating = v_new_loser_elo,
            losses = losses + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_loser_id AND sport_id = p_sport_id;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tournament_match_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE tournaments
    SET
        matches_total = (
            SELECT COUNT(*) FROM tournament_matches
            WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
        ),
        matches_completed = (
            SELECT COUNT(*) FROM tournament_matches
            WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
            AND status = 'completed'
        )
    WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);
    RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tournament_participant_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE tournaments
    SET participant_count = (
        SELECT COUNT(*)
        FROM tournament_participants
        WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
    )
    WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);
    RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tournament_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update participant count
    UPDATE tournaments
    SET participant_count = (
        SELECT COUNT(*)
        FROM tournament_participants
        WHERE tournament_id = NEW.tournament_id
    )
    WHERE id = NEW.tournament_id;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_training_summary(p_player_id uuid, p_event_date text, p_content text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_summary_id UUID;
    v_caller_role TEXT;
    v_caller_club UUID;
    v_player_club UUID;
BEGIN
    -- Prüfe ob Aufrufer Coach ist
    SELECT role, club_id INTO v_caller_role, v_caller_club
    FROM profiles
    WHERE id = auth.uid();
    
    IF v_caller_role NOT IN ('coach', 'head_coach') THEN
        RAISE EXCEPTION 'Nur Coaches dürfen Training-Summaries aktualisieren';
    END IF;
    
    -- Prüfe ob Spieler im gleichen Club ist
    SELECT club_id INTO v_player_club FROM profiles WHERE id = p_player_id;
    
    IF v_player_club != v_caller_club THEN
        RAISE EXCEPTION 'Spieler nicht im gleichen Club';
    END IF;
    
    -- Finde die Training-Summary für Spieler + Datum
    SELECT id INTO v_summary_id
    FROM community_posts
    WHERE user_id = p_player_id
      AND content LIKE 'TRAINING_SUMMARY|%'
      AND content LIKE '%"event_date":"' || p_event_date || '"%'
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_summary_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Aktualisiere die Summary
    UPDATE community_posts
    SET content = p_content,
        updated_at = NOW()
    WHERE id = v_summary_id;
    
    RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_preferences_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_season_points_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_sport_stats_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_video_ai_analyses_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upgrade_child_account(p_child_id uuid, p_email text, p_guardian_approval boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID;
    v_child RECORD;
    v_age INT;
    v_is_guardian BOOLEAN;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get child profile
    SELECT * INTO v_child
    FROM profiles
    WHERE id = p_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Kind nicht gefunden'
        );
    END IF;

    -- Check if child is old enough (16+)
    v_age := calculate_age(v_child.birthdate);
    IF v_age < 16 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Das Kind muss mindestens 16 Jahre alt sein'
        );
    END IF;

    -- Check caller is guardian of this child (for approval)
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_caller_id
        AND child_id = p_child_id
    ) INTO v_is_guardian;

    IF NOT v_is_guardian THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Nur Vormünder können das Upgrade genehmigen'
        );
    END IF;

    -- Update child profile
    UPDATE profiles
    SET
        account_type = 'standard',
        age_mode = 'full',
        email = p_email,
        updated_at = now()
    WHERE id = p_child_id;

    -- Note: The actual auth.users entry needs to be created separately
    -- This function just prepares the profile

    RETURN json_build_object(
        'success', true,
        'message', 'Kind-Profil wurde für Upgrade vorbereitet. E-Mail-Verifizierung erforderlich.'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upgrade_guardian_to_player()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_profile RECORD;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Get current profile
    SELECT * INTO v_profile
    FROM profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profile not found');
    END IF;

    -- Check if already a player
    IF v_profile.is_player = true THEN
        RETURN json_build_object('success', false, 'error', 'Already a player');
    END IF;

    -- Check if is a guardian
    IF v_profile.account_type != 'guardian' AND v_profile.is_guardian != true THEN
        RETURN json_build_object('success', false, 'error', 'Not a guardian');
    END IF;

    -- Upgrade to player
    UPDATE profiles
    SET
        is_player = true,
        is_match_ready = true,
        elo_rating = COALESCE(elo_rating, 800),
        highest_elo = COALESCE(highest_elo, 800),
        xp = COALESCE(xp, 0),
        points = COALESCE(points, 0),
        grundlagen_completed = COALESCE(grundlagen_completed, 5),
        updated_at = now()
    WHERE id = v_user_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Successfully upgraded to player'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_child_login_code(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_code_record RECORD;
    v_child_profile RECORD;
BEGIN
    -- Normalize code (uppercase, trim)
    p_code := UPPER(TRIM(p_code));

    -- Find the code (but don't mark as used yet - that's for login or linking)
    SELECT * INTO v_code_record
    FROM child_login_codes
    WHERE code = p_code
    AND used_at IS NULL
    AND expires_at > now()
    AND failed_attempts < 5;

    IF NOT FOUND THEN
        -- Check if code exists but is invalid (for better error message)
        SELECT * INTO v_code_record
        FROM child_login_codes
        WHERE code = p_code;

        IF FOUND THEN
            IF v_code_record.used_at IS NOT NULL THEN
                RETURN json_build_object('valid', FALSE, 'error', 'Code wurde bereits verwendet');
            ELSIF v_code_record.expires_at <= now() THEN
                RETURN json_build_object('valid', FALSE, 'error', 'Code ist abgelaufen');
            ELSIF v_code_record.failed_attempts >= 5 THEN
                RETURN json_build_object('valid', FALSE, 'error', 'Zu viele Fehlversuche. Bitte neuen Code generieren.');
            END IF;
        END IF;

        RETURN json_build_object('valid', FALSE, 'error', 'Ungültiger Code');
    END IF;

    -- Get child profile
    SELECT * INTO v_child_profile
    FROM profiles
    WHERE id = v_code_record.child_id;

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'Kind nicht gefunden');
    END IF;

    -- Return child info for preview (don't mark code as used yet)
    RETURN json_build_object(
        'valid', TRUE,
        'child', json_build_object(
            'id', v_child_profile.id,
            'first_name', v_child_profile.first_name,
            'last_name', v_child_profile.last_name,
            'birthdate', v_child_profile.birthdate,
            'avatar_url', v_child_profile.avatar_url
        )
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'valid', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_child_pin_login(p_username text, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_child RECORD;
    v_guardian RECORD;
    v_normalized_username TEXT;
    v_profile_exists BOOLEAN;
    v_rate_check JSON;
    v_session_token TEXT;
    v_session_id UUID;
BEGIN
    v_normalized_username := LOWER(TRIM(COALESCE(p_username, '')));

    -- Check rate limiting first
    v_rate_check := check_pin_rate_limit(v_normalized_username);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', v_rate_check->>'reason',
            'rate_limited', TRUE
        );
    END IF;

    -- Check if username is empty
    IF v_normalized_username = '' OR LENGTH(v_normalized_username) < 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Bitte gib einen gültigen Benutzernamen ein (min. 3 Zeichen)'
        );
    END IF;

    -- Check if profile exists
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE username = v_normalized_username
    ) INTO v_profile_exists;

    IF NOT v_profile_exists THEN
        -- Log failed attempt
        INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, false);
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Benutzername nicht gefunden. Bitte überprüfe die Eingabe.'
        );
    END IF;

    -- Find child profile with credentials
    SELECT
        p.id, p.first_name, p.last_name, p.age_mode, p.club_id,
        p.pin_hash, p.account_type, p.is_offline
    INTO v_child
    FROM profiles p
    WHERE p.username = v_normalized_username
    AND (
        p.account_type = 'child'
        OR p.is_offline = TRUE
        OR EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id)
    );

    IF NOT FOUND THEN
        INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, false);
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Dieser Benutzername ist für einen Erwachsenen-Account. Bitte nutze den E-Mail Login.'
        );
    END IF;

    -- Check if PIN is set
    IF v_child.pin_hash IS NULL OR v_child.pin_hash = '' THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Kein PIN gesetzt. Bitte den Vormund kontaktieren.'
        );
    END IF;

    -- Verify PIN
    IF v_child.pin_hash != crypt(p_pin, v_child.pin_hash) THEN
        -- Log failed attempt
        INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, false);

        -- Check remaining attempts
        v_rate_check := check_pin_rate_limit(v_normalized_username);

        RETURN json_build_object(
            'success', FALSE,
            'error', 'Falscher PIN. ' || (v_rate_check->>'attempts_remaining')::INT || ' Versuche übrig.',
            'attempts_remaining', (v_rate_check->>'attempts_remaining')::INT
        );
    END IF;

    -- PIN correct! Log successful attempt
    INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, true);

    -- Invalidate any existing sessions for this child (single session policy)
    UPDATE child_sessions
    SET is_valid = false
    WHERE child_id = v_child.id AND is_valid = true;

    -- Create new session token
    v_session_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO child_sessions (child_id, session_token, expires_at)
    VALUES (v_child.id, v_session_token, now() + interval '24 hours')
    RETURNING id INTO v_session_id;

    -- Get guardian ID
    SELECT gl.guardian_id INTO v_guardian
    FROM guardian_links gl
    WHERE gl.child_id = v_child.id AND gl.is_primary = TRUE
    LIMIT 1;

    -- Return session data
    RETURN json_build_object(
        'success', TRUE,
        'session_token', v_session_token,
        'child_id', v_child.id,
        'first_name', v_child.first_name,
        'last_name', v_child.last_name,
        'age_mode', v_child.age_mode,
        'club_id', v_child.club_id,
        'guardian_id', v_guardian.guardian_id,
        'expires_at', (now() + interval '24 hours')
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'validate_child_pin_login error: %', SQLERRM;
    RETURN json_build_object(
        'success', FALSE,
        'error', 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_child_session_token(p_session_token text)
 RETURNS TABLE(is_valid boolean, child_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session RECORD;
BEGIN
    -- Find the session
    SELECT cs.*, p.first_name, p.last_name
    INTO v_session
    FROM child_sessions cs
    JOIN profiles p ON p.id = cs.child_id
    WHERE cs.session_token = p_session_token
    AND cs.is_valid = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Session nicht gefunden'::TEXT;
        RETURN;
    END IF;

    -- Check if expired
    IF v_session.expires_at < now() THEN
        -- Mark session as invalid
        UPDATE child_sessions SET is_valid = false WHERE id = v_session.id;
        RETURN QUERY SELECT false, NULL::UUID, 'Session abgelaufen'::TEXT;
        RETURN;
    END IF;

    -- Update last activity
    UPDATE child_sessions
    SET last_activity_at = now()
    WHERE id = v_session.id;

    RETURN QUERY SELECT true, v_session.child_id, NULL::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_guardian_invitation_code(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_code_record RECORD;
    v_player_profile RECORD;
BEGIN
    -- Normalize code (uppercase, trim)
    p_code := UPPER(TRIM(p_code));

    -- Find the code in invitation_codes table
    SELECT * INTO v_code_record
    FROM invitation_codes
    WHERE code = p_code
    AND (used = FALSE OR used IS NULL)
    AND (expires_at IS NULL OR expires_at > now())
    AND is_active = TRUE;

    IF NOT FOUND THEN
        -- Check if code exists but is invalid (for better error message)
        SELECT * INTO v_code_record
        FROM invitation_codes
        WHERE code = p_code;

        IF FOUND THEN
            IF v_code_record.used = TRUE THEN
                RETURN json_build_object('valid', FALSE, 'error', 'Code wurde bereits verwendet');
            ELSIF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN
                RETURN json_build_object('valid', FALSE, 'error', 'Code ist abgelaufen');
            ELSIF v_code_record.is_active = FALSE THEN
                RETURN json_build_object('valid', FALSE, 'error', 'Code ist nicht mehr aktiv');
            END IF;
        END IF;

        RETURN json_build_object('valid', FALSE, 'error', 'Ungültiger Code');
    END IF;

    -- Check if code has a player_id (linked to offline player)
    IF v_code_record.player_id IS NOT NULL THEN
        -- Get player profile
        SELECT * INTO v_player_profile
        FROM profiles
        WHERE id = v_code_record.player_id;

        IF FOUND THEN
            RETURN json_build_object(
                'valid', TRUE,
                'child', json_build_object(
                    'id', v_player_profile.id,
                    'first_name', v_player_profile.first_name,
                    'last_name', v_player_profile.last_name,
                    'birthdate', v_player_profile.birthdate,
                    'avatar_url', v_player_profile.avatar_url
                ),
                'code_id', v_code_record.id
            );
        END IF;
    END IF;

    -- Code exists but no player linked - return code data for creating new profile
    RETURN json_build_object(
        'valid', TRUE,
        'child', json_build_object(
            'id', NULL,
            'first_name', v_code_record.first_name,
            'last_name', v_code_record.last_name,
            'birthdate', v_code_record.birthdate,
            'avatar_url', NULL
        ),
        'code_id', v_code_record.id,
        'needs_profile', TRUE
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'valid', FALSE,
        'error', SQLERRM
    );
END;
$function$
;

grant delete on table "public"."activity_comments" to "anon";

grant insert on table "public"."activity_comments" to "anon";

grant references on table "public"."activity_comments" to "anon";

grant select on table "public"."activity_comments" to "anon";

grant trigger on table "public"."activity_comments" to "anon";

grant truncate on table "public"."activity_comments" to "anon";

grant update on table "public"."activity_comments" to "anon";

grant delete on table "public"."activity_comments" to "authenticated";

grant insert on table "public"."activity_comments" to "authenticated";

grant references on table "public"."activity_comments" to "authenticated";

grant select on table "public"."activity_comments" to "authenticated";

grant trigger on table "public"."activity_comments" to "authenticated";

grant truncate on table "public"."activity_comments" to "authenticated";

grant update on table "public"."activity_comments" to "authenticated";

grant delete on table "public"."activity_comments" to "service_role";

grant insert on table "public"."activity_comments" to "service_role";

grant references on table "public"."activity_comments" to "service_role";

grant select on table "public"."activity_comments" to "service_role";

grant trigger on table "public"."activity_comments" to "service_role";

grant truncate on table "public"."activity_comments" to "service_role";

grant update on table "public"."activity_comments" to "service_role";

grant delete on table "public"."activity_events" to "anon";

grant insert on table "public"."activity_events" to "anon";

grant references on table "public"."activity_events" to "anon";

grant select on table "public"."activity_events" to "anon";

grant trigger on table "public"."activity_events" to "anon";

grant truncate on table "public"."activity_events" to "anon";

grant update on table "public"."activity_events" to "anon";

grant delete on table "public"."activity_events" to "authenticated";

grant insert on table "public"."activity_events" to "authenticated";

grant references on table "public"."activity_events" to "authenticated";

grant select on table "public"."activity_events" to "authenticated";

grant trigger on table "public"."activity_events" to "authenticated";

grant truncate on table "public"."activity_events" to "authenticated";

grant update on table "public"."activity_events" to "authenticated";

grant delete on table "public"."activity_events" to "service_role";

grant insert on table "public"."activity_events" to "service_role";

grant references on table "public"."activity_events" to "service_role";

grant select on table "public"."activity_events" to "service_role";

grant trigger on table "public"."activity_events" to "service_role";

grant truncate on table "public"."activity_events" to "service_role";

grant update on table "public"."activity_events" to "service_role";

grant delete on table "public"."activity_likes" to "anon";

grant insert on table "public"."activity_likes" to "anon";

grant references on table "public"."activity_likes" to "anon";

grant select on table "public"."activity_likes" to "anon";

grant trigger on table "public"."activity_likes" to "anon";

grant truncate on table "public"."activity_likes" to "anon";

grant update on table "public"."activity_likes" to "anon";

grant delete on table "public"."activity_likes" to "authenticated";

grant insert on table "public"."activity_likes" to "authenticated";

grant references on table "public"."activity_likes" to "authenticated";

grant select on table "public"."activity_likes" to "authenticated";

grant trigger on table "public"."activity_likes" to "authenticated";

grant truncate on table "public"."activity_likes" to "authenticated";

grant update on table "public"."activity_likes" to "authenticated";

grant delete on table "public"."activity_likes" to "service_role";

grant insert on table "public"."activity_likes" to "service_role";

grant references on table "public"."activity_likes" to "service_role";

grant select on table "public"."activity_likes" to "service_role";

grant trigger on table "public"."activity_likes" to "service_role";

grant truncate on table "public"."activity_likes" to "service_role";

grant update on table "public"."activity_likes" to "service_role";

grant delete on table "public"."attendance" to "anon";

grant insert on table "public"."attendance" to "anon";

grant references on table "public"."attendance" to "anon";

grant select on table "public"."attendance" to "anon";

grant trigger on table "public"."attendance" to "anon";

grant truncate on table "public"."attendance" to "anon";

grant update on table "public"."attendance" to "anon";

grant delete on table "public"."attendance" to "authenticated";

grant insert on table "public"."attendance" to "authenticated";

grant references on table "public"."attendance" to "authenticated";

grant select on table "public"."attendance" to "authenticated";

grant trigger on table "public"."attendance" to "authenticated";

grant truncate on table "public"."attendance" to "authenticated";

grant update on table "public"."attendance" to "authenticated";

grant delete on table "public"."attendance" to "service_role";

grant insert on table "public"."attendance" to "service_role";

grant references on table "public"."attendance" to "service_role";

grant select on table "public"."attendance" to "service_role";

grant trigger on table "public"."attendance" to "service_role";

grant truncate on table "public"."attendance" to "service_role";

grant update on table "public"."attendance" to "service_role";

grant delete on table "public"."audit_logs" to "anon";

grant insert on table "public"."audit_logs" to "anon";

grant references on table "public"."audit_logs" to "anon";

grant select on table "public"."audit_logs" to "anon";

grant trigger on table "public"."audit_logs" to "anon";

grant truncate on table "public"."audit_logs" to "anon";

grant update on table "public"."audit_logs" to "anon";

grant delete on table "public"."audit_logs" to "authenticated";

grant insert on table "public"."audit_logs" to "authenticated";

grant references on table "public"."audit_logs" to "authenticated";

grant select on table "public"."audit_logs" to "authenticated";

grant trigger on table "public"."audit_logs" to "authenticated";

grant truncate on table "public"."audit_logs" to "authenticated";

grant update on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant delete on table "public"."challenges" to "anon";

grant insert on table "public"."challenges" to "anon";

grant references on table "public"."challenges" to "anon";

grant select on table "public"."challenges" to "anon";

grant trigger on table "public"."challenges" to "anon";

grant truncate on table "public"."challenges" to "anon";

grant update on table "public"."challenges" to "anon";

grant delete on table "public"."challenges" to "authenticated";

grant insert on table "public"."challenges" to "authenticated";

grant references on table "public"."challenges" to "authenticated";

grant select on table "public"."challenges" to "authenticated";

grant trigger on table "public"."challenges" to "authenticated";

grant truncate on table "public"."challenges" to "authenticated";

grant update on table "public"."challenges" to "authenticated";

grant delete on table "public"."challenges" to "service_role";

grant insert on table "public"."challenges" to "service_role";

grant references on table "public"."challenges" to "service_role";

grant select on table "public"."challenges" to "service_role";

grant trigger on table "public"."challenges" to "service_role";

grant truncate on table "public"."challenges" to "service_role";

grant update on table "public"."challenges" to "service_role";

grant delete on table "public"."chat_conversations" to "anon";

grant insert on table "public"."chat_conversations" to "anon";

grant references on table "public"."chat_conversations" to "anon";

grant select on table "public"."chat_conversations" to "anon";

grant trigger on table "public"."chat_conversations" to "anon";

grant truncate on table "public"."chat_conversations" to "anon";

grant update on table "public"."chat_conversations" to "anon";

grant delete on table "public"."chat_conversations" to "authenticated";

grant insert on table "public"."chat_conversations" to "authenticated";

grant references on table "public"."chat_conversations" to "authenticated";

grant select on table "public"."chat_conversations" to "authenticated";

grant trigger on table "public"."chat_conversations" to "authenticated";

grant truncate on table "public"."chat_conversations" to "authenticated";

grant update on table "public"."chat_conversations" to "authenticated";

grant delete on table "public"."chat_conversations" to "service_role";

grant insert on table "public"."chat_conversations" to "service_role";

grant references on table "public"."chat_conversations" to "service_role";

grant select on table "public"."chat_conversations" to "service_role";

grant trigger on table "public"."chat_conversations" to "service_role";

grant truncate on table "public"."chat_conversations" to "service_role";

grant update on table "public"."chat_conversations" to "service_role";

grant delete on table "public"."chat_messages" to "anon";

grant insert on table "public"."chat_messages" to "anon";

grant references on table "public"."chat_messages" to "anon";

grant select on table "public"."chat_messages" to "anon";

grant trigger on table "public"."chat_messages" to "anon";

grant truncate on table "public"."chat_messages" to "anon";

grant update on table "public"."chat_messages" to "anon";

grant delete on table "public"."chat_messages" to "authenticated";

grant insert on table "public"."chat_messages" to "authenticated";

grant references on table "public"."chat_messages" to "authenticated";

grant select on table "public"."chat_messages" to "authenticated";

grant trigger on table "public"."chat_messages" to "authenticated";

grant truncate on table "public"."chat_messages" to "authenticated";

grant update on table "public"."chat_messages" to "authenticated";

grant delete on table "public"."chat_messages" to "service_role";

grant insert on table "public"."chat_messages" to "service_role";

grant references on table "public"."chat_messages" to "service_role";

grant select on table "public"."chat_messages" to "service_role";

grant trigger on table "public"."chat_messages" to "service_role";

grant truncate on table "public"."chat_messages" to "service_role";

grant update on table "public"."chat_messages" to "service_role";

grant delete on table "public"."chat_participants" to "anon";

grant insert on table "public"."chat_participants" to "anon";

grant references on table "public"."chat_participants" to "anon";

grant select on table "public"."chat_participants" to "anon";

grant trigger on table "public"."chat_participants" to "anon";

grant truncate on table "public"."chat_participants" to "anon";

grant update on table "public"."chat_participants" to "anon";

grant delete on table "public"."chat_participants" to "authenticated";

grant insert on table "public"."chat_participants" to "authenticated";

grant references on table "public"."chat_participants" to "authenticated";

grant select on table "public"."chat_participants" to "authenticated";

grant trigger on table "public"."chat_participants" to "authenticated";

grant truncate on table "public"."chat_participants" to "authenticated";

grant update on table "public"."chat_participants" to "authenticated";

grant delete on table "public"."chat_participants" to "service_role";

grant insert on table "public"."chat_participants" to "service_role";

grant references on table "public"."chat_participants" to "service_role";

grant select on table "public"."chat_participants" to "service_role";

grant trigger on table "public"."chat_participants" to "service_role";

grant truncate on table "public"."chat_participants" to "service_role";

grant update on table "public"."chat_participants" to "service_role";

grant delete on table "public"."child_login_codes" to "anon";

grant insert on table "public"."child_login_codes" to "anon";

grant references on table "public"."child_login_codes" to "anon";

grant select on table "public"."child_login_codes" to "anon";

grant trigger on table "public"."child_login_codes" to "anon";

grant truncate on table "public"."child_login_codes" to "anon";

grant update on table "public"."child_login_codes" to "anon";

grant delete on table "public"."child_login_codes" to "authenticated";

grant insert on table "public"."child_login_codes" to "authenticated";

grant references on table "public"."child_login_codes" to "authenticated";

grant select on table "public"."child_login_codes" to "authenticated";

grant trigger on table "public"."child_login_codes" to "authenticated";

grant truncate on table "public"."child_login_codes" to "authenticated";

grant update on table "public"."child_login_codes" to "authenticated";

grant delete on table "public"."child_login_codes" to "service_role";

grant insert on table "public"."child_login_codes" to "service_role";

grant references on table "public"."child_login_codes" to "service_role";

grant select on table "public"."child_login_codes" to "service_role";

grant trigger on table "public"."child_login_codes" to "service_role";

grant truncate on table "public"."child_login_codes" to "service_role";

grant update on table "public"."child_login_codes" to "service_role";

grant delete on table "public"."child_pin_attempts" to "anon";

grant insert on table "public"."child_pin_attempts" to "anon";

grant references on table "public"."child_pin_attempts" to "anon";

grant select on table "public"."child_pin_attempts" to "anon";

grant trigger on table "public"."child_pin_attempts" to "anon";

grant truncate on table "public"."child_pin_attempts" to "anon";

grant update on table "public"."child_pin_attempts" to "anon";

grant delete on table "public"."child_pin_attempts" to "authenticated";

grant insert on table "public"."child_pin_attempts" to "authenticated";

grant references on table "public"."child_pin_attempts" to "authenticated";

grant select on table "public"."child_pin_attempts" to "authenticated";

grant trigger on table "public"."child_pin_attempts" to "authenticated";

grant truncate on table "public"."child_pin_attempts" to "authenticated";

grant update on table "public"."child_pin_attempts" to "authenticated";

grant delete on table "public"."child_pin_attempts" to "service_role";

grant insert on table "public"."child_pin_attempts" to "service_role";

grant references on table "public"."child_pin_attempts" to "service_role";

grant select on table "public"."child_pin_attempts" to "service_role";

grant trigger on table "public"."child_pin_attempts" to "service_role";

grant truncate on table "public"."child_pin_attempts" to "service_role";

grant update on table "public"."child_pin_attempts" to "service_role";

grant delete on table "public"."child_sessions" to "anon";

grant insert on table "public"."child_sessions" to "anon";

grant references on table "public"."child_sessions" to "anon";

grant select on table "public"."child_sessions" to "anon";

grant trigger on table "public"."child_sessions" to "anon";

grant truncate on table "public"."child_sessions" to "anon";

grant update on table "public"."child_sessions" to "anon";

grant delete on table "public"."child_sessions" to "authenticated";

grant insert on table "public"."child_sessions" to "authenticated";

grant references on table "public"."child_sessions" to "authenticated";

grant select on table "public"."child_sessions" to "authenticated";

grant trigger on table "public"."child_sessions" to "authenticated";

grant truncate on table "public"."child_sessions" to "authenticated";

grant update on table "public"."child_sessions" to "authenticated";

grant delete on table "public"."child_sessions" to "service_role";

grant insert on table "public"."child_sessions" to "service_role";

grant references on table "public"."child_sessions" to "service_role";

grant select on table "public"."child_sessions" to "service_role";

grant trigger on table "public"."child_sessions" to "service_role";

grant truncate on table "public"."child_sessions" to "service_role";

grant update on table "public"."child_sessions" to "service_role";

grant delete on table "public"."club_requests" to "anon";

grant insert on table "public"."club_requests" to "anon";

grant references on table "public"."club_requests" to "anon";

grant select on table "public"."club_requests" to "anon";

grant trigger on table "public"."club_requests" to "anon";

grant truncate on table "public"."club_requests" to "anon";

grant update on table "public"."club_requests" to "anon";

grant delete on table "public"."club_requests" to "authenticated";

grant insert on table "public"."club_requests" to "authenticated";

grant references on table "public"."club_requests" to "authenticated";

grant select on table "public"."club_requests" to "authenticated";

grant trigger on table "public"."club_requests" to "authenticated";

grant truncate on table "public"."club_requests" to "authenticated";

grant update on table "public"."club_requests" to "authenticated";

grant delete on table "public"."club_requests" to "service_role";

grant insert on table "public"."club_requests" to "service_role";

grant references on table "public"."club_requests" to "service_role";

grant select on table "public"."club_requests" to "service_role";

grant trigger on table "public"."club_requests" to "service_role";

grant truncate on table "public"."club_requests" to "service_role";

grant update on table "public"."club_requests" to "service_role";

grant delete on table "public"."club_sports" to "anon";

grant insert on table "public"."club_sports" to "anon";

grant references on table "public"."club_sports" to "anon";

grant select on table "public"."club_sports" to "anon";

grant trigger on table "public"."club_sports" to "anon";

grant truncate on table "public"."club_sports" to "anon";

grant update on table "public"."club_sports" to "anon";

grant delete on table "public"."club_sports" to "authenticated";

grant insert on table "public"."club_sports" to "authenticated";

grant references on table "public"."club_sports" to "authenticated";

grant select on table "public"."club_sports" to "authenticated";

grant trigger on table "public"."club_sports" to "authenticated";

grant truncate on table "public"."club_sports" to "authenticated";

grant update on table "public"."club_sports" to "authenticated";

grant delete on table "public"."club_sports" to "service_role";

grant insert on table "public"."club_sports" to "service_role";

grant references on table "public"."club_sports" to "service_role";

grant select on table "public"."club_sports" to "service_role";

grant trigger on table "public"."club_sports" to "service_role";

grant truncate on table "public"."club_sports" to "service_role";

grant update on table "public"."club_sports" to "service_role";

grant delete on table "public"."clubs" to "anon";

grant insert on table "public"."clubs" to "anon";

grant references on table "public"."clubs" to "anon";

grant select on table "public"."clubs" to "anon";

grant trigger on table "public"."clubs" to "anon";

grant truncate on table "public"."clubs" to "anon";

grant update on table "public"."clubs" to "anon";

grant delete on table "public"."clubs" to "authenticated";

grant insert on table "public"."clubs" to "authenticated";

grant references on table "public"."clubs" to "authenticated";

grant select on table "public"."clubs" to "authenticated";

grant trigger on table "public"."clubs" to "authenticated";

grant truncate on table "public"."clubs" to "authenticated";

grant update on table "public"."clubs" to "authenticated";

grant delete on table "public"."clubs" to "service_role";

grant insert on table "public"."clubs" to "service_role";

grant references on table "public"."clubs" to "service_role";

grant select on table "public"."clubs" to "service_role";

grant trigger on table "public"."clubs" to "service_role";

grant truncate on table "public"."clubs" to "service_role";

grant update on table "public"."clubs" to "service_role";

grant delete on table "public"."community_polls" to "anon";

grant insert on table "public"."community_polls" to "anon";

grant references on table "public"."community_polls" to "anon";

grant select on table "public"."community_polls" to "anon";

grant trigger on table "public"."community_polls" to "anon";

grant truncate on table "public"."community_polls" to "anon";

grant update on table "public"."community_polls" to "anon";

grant delete on table "public"."community_polls" to "authenticated";

grant insert on table "public"."community_polls" to "authenticated";

grant references on table "public"."community_polls" to "authenticated";

grant select on table "public"."community_polls" to "authenticated";

grant trigger on table "public"."community_polls" to "authenticated";

grant truncate on table "public"."community_polls" to "authenticated";

grant update on table "public"."community_polls" to "authenticated";

grant delete on table "public"."community_polls" to "service_role";

grant insert on table "public"."community_polls" to "service_role";

grant references on table "public"."community_polls" to "service_role";

grant select on table "public"."community_polls" to "service_role";

grant trigger on table "public"."community_polls" to "service_role";

grant truncate on table "public"."community_polls" to "service_role";

grant update on table "public"."community_polls" to "service_role";

grant delete on table "public"."community_posts" to "anon";

grant insert on table "public"."community_posts" to "anon";

grant references on table "public"."community_posts" to "anon";

grant select on table "public"."community_posts" to "anon";

grant trigger on table "public"."community_posts" to "anon";

grant truncate on table "public"."community_posts" to "anon";

grant update on table "public"."community_posts" to "anon";

grant delete on table "public"."community_posts" to "authenticated";

grant insert on table "public"."community_posts" to "authenticated";

grant references on table "public"."community_posts" to "authenticated";

grant select on table "public"."community_posts" to "authenticated";

grant trigger on table "public"."community_posts" to "authenticated";

grant truncate on table "public"."community_posts" to "authenticated";

grant update on table "public"."community_posts" to "authenticated";

grant delete on table "public"."community_posts" to "service_role";

grant insert on table "public"."community_posts" to "service_role";

grant references on table "public"."community_posts" to "service_role";

grant select on table "public"."community_posts" to "service_role";

grant trigger on table "public"."community_posts" to "service_role";

grant truncate on table "public"."community_posts" to "service_role";

grant update on table "public"."community_posts" to "service_role";

grant delete on table "public"."completed_challenges" to "anon";

grant insert on table "public"."completed_challenges" to "anon";

grant references on table "public"."completed_challenges" to "anon";

grant select on table "public"."completed_challenges" to "anon";

grant trigger on table "public"."completed_challenges" to "anon";

grant truncate on table "public"."completed_challenges" to "anon";

grant update on table "public"."completed_challenges" to "anon";

grant delete on table "public"."completed_challenges" to "authenticated";

grant insert on table "public"."completed_challenges" to "authenticated";

grant references on table "public"."completed_challenges" to "authenticated";

grant select on table "public"."completed_challenges" to "authenticated";

grant trigger on table "public"."completed_challenges" to "authenticated";

grant truncate on table "public"."completed_challenges" to "authenticated";

grant update on table "public"."completed_challenges" to "authenticated";

grant delete on table "public"."completed_challenges" to "service_role";

grant insert on table "public"."completed_challenges" to "service_role";

grant references on table "public"."completed_challenges" to "service_role";

grant select on table "public"."completed_challenges" to "service_role";

grant trigger on table "public"."completed_challenges" to "service_role";

grant truncate on table "public"."completed_challenges" to "service_role";

grant update on table "public"."completed_challenges" to "service_role";

grant delete on table "public"."completed_exercises" to "anon";

grant insert on table "public"."completed_exercises" to "anon";

grant references on table "public"."completed_exercises" to "anon";

grant select on table "public"."completed_exercises" to "anon";

grant trigger on table "public"."completed_exercises" to "anon";

grant truncate on table "public"."completed_exercises" to "anon";

grant update on table "public"."completed_exercises" to "anon";

grant delete on table "public"."completed_exercises" to "authenticated";

grant insert on table "public"."completed_exercises" to "authenticated";

grant references on table "public"."completed_exercises" to "authenticated";

grant select on table "public"."completed_exercises" to "authenticated";

grant trigger on table "public"."completed_exercises" to "authenticated";

grant truncate on table "public"."completed_exercises" to "authenticated";

grant update on table "public"."completed_exercises" to "authenticated";

grant delete on table "public"."completed_exercises" to "service_role";

grant insert on table "public"."completed_exercises" to "service_role";

grant references on table "public"."completed_exercises" to "service_role";

grant select on table "public"."completed_exercises" to "service_role";

grant trigger on table "public"."completed_exercises" to "service_role";

grant truncate on table "public"."completed_exercises" to "service_role";

grant update on table "public"."completed_exercises" to "service_role";

grant delete on table "public"."config" to "anon";

grant insert on table "public"."config" to "anon";

grant references on table "public"."config" to "anon";

grant select on table "public"."config" to "anon";

grant trigger on table "public"."config" to "anon";

grant truncate on table "public"."config" to "anon";

grant update on table "public"."config" to "anon";

grant delete on table "public"."config" to "authenticated";

grant insert on table "public"."config" to "authenticated";

grant references on table "public"."config" to "authenticated";

grant select on table "public"."config" to "authenticated";

grant trigger on table "public"."config" to "authenticated";

grant truncate on table "public"."config" to "authenticated";

grant update on table "public"."config" to "authenticated";

grant delete on table "public"."config" to "service_role";

grant insert on table "public"."config" to "service_role";

grant references on table "public"."config" to "service_role";

grant select on table "public"."config" to "service_role";

grant trigger on table "public"."config" to "service_role";

grant truncate on table "public"."config" to "service_role";

grant update on table "public"."config" to "service_role";

grant delete on table "public"."content_reports" to "anon";

grant insert on table "public"."content_reports" to "anon";

grant references on table "public"."content_reports" to "anon";

grant select on table "public"."content_reports" to "anon";

grant trigger on table "public"."content_reports" to "anon";

grant truncate on table "public"."content_reports" to "anon";

grant update on table "public"."content_reports" to "anon";

grant delete on table "public"."content_reports" to "authenticated";

grant insert on table "public"."content_reports" to "authenticated";

grant references on table "public"."content_reports" to "authenticated";

grant select on table "public"."content_reports" to "authenticated";

grant trigger on table "public"."content_reports" to "authenticated";

grant truncate on table "public"."content_reports" to "authenticated";

grant update on table "public"."content_reports" to "authenticated";

grant delete on table "public"."content_reports" to "service_role";

grant insert on table "public"."content_reports" to "service_role";

grant references on table "public"."content_reports" to "service_role";

grant select on table "public"."content_reports" to "service_role";

grant trigger on table "public"."content_reports" to "service_role";

grant truncate on table "public"."content_reports" to "service_role";

grant update on table "public"."content_reports" to "service_role";

grant delete on table "public"."doubles_match_requests" to "anon";

grant insert on table "public"."doubles_match_requests" to "anon";

grant references on table "public"."doubles_match_requests" to "anon";

grant select on table "public"."doubles_match_requests" to "anon";

grant trigger on table "public"."doubles_match_requests" to "anon";

grant truncate on table "public"."doubles_match_requests" to "anon";

grant update on table "public"."doubles_match_requests" to "anon";

grant delete on table "public"."doubles_match_requests" to "authenticated";

grant insert on table "public"."doubles_match_requests" to "authenticated";

grant references on table "public"."doubles_match_requests" to "authenticated";

grant select on table "public"."doubles_match_requests" to "authenticated";

grant trigger on table "public"."doubles_match_requests" to "authenticated";

grant truncate on table "public"."doubles_match_requests" to "authenticated";

grant update on table "public"."doubles_match_requests" to "authenticated";

grant delete on table "public"."doubles_match_requests" to "service_role";

grant insert on table "public"."doubles_match_requests" to "service_role";

grant references on table "public"."doubles_match_requests" to "service_role";

grant select on table "public"."doubles_match_requests" to "service_role";

grant trigger on table "public"."doubles_match_requests" to "service_role";

grant truncate on table "public"."doubles_match_requests" to "service_role";

grant update on table "public"."doubles_match_requests" to "service_role";

grant delete on table "public"."doubles_matches" to "anon";

grant insert on table "public"."doubles_matches" to "anon";

grant references on table "public"."doubles_matches" to "anon";

grant select on table "public"."doubles_matches" to "anon";

grant trigger on table "public"."doubles_matches" to "anon";

grant truncate on table "public"."doubles_matches" to "anon";

grant update on table "public"."doubles_matches" to "anon";

grant delete on table "public"."doubles_matches" to "authenticated";

grant insert on table "public"."doubles_matches" to "authenticated";

grant references on table "public"."doubles_matches" to "authenticated";

grant select on table "public"."doubles_matches" to "authenticated";

grant trigger on table "public"."doubles_matches" to "authenticated";

grant truncate on table "public"."doubles_matches" to "authenticated";

grant update on table "public"."doubles_matches" to "authenticated";

grant delete on table "public"."doubles_matches" to "service_role";

grant insert on table "public"."doubles_matches" to "service_role";

grant references on table "public"."doubles_matches" to "service_role";

grant select on table "public"."doubles_matches" to "service_role";

grant trigger on table "public"."doubles_matches" to "service_role";

grant truncate on table "public"."doubles_matches" to "service_role";

grant update on table "public"."doubles_matches" to "service_role";

grant delete on table "public"."doubles_pairings" to "anon";

grant insert on table "public"."doubles_pairings" to "anon";

grant references on table "public"."doubles_pairings" to "anon";

grant select on table "public"."doubles_pairings" to "anon";

grant trigger on table "public"."doubles_pairings" to "anon";

grant truncate on table "public"."doubles_pairings" to "anon";

grant update on table "public"."doubles_pairings" to "anon";

grant delete on table "public"."doubles_pairings" to "authenticated";

grant insert on table "public"."doubles_pairings" to "authenticated";

grant references on table "public"."doubles_pairings" to "authenticated";

grant select on table "public"."doubles_pairings" to "authenticated";

grant trigger on table "public"."doubles_pairings" to "authenticated";

grant truncate on table "public"."doubles_pairings" to "authenticated";

grant update on table "public"."doubles_pairings" to "authenticated";

grant delete on table "public"."doubles_pairings" to "service_role";

grant insert on table "public"."doubles_pairings" to "service_role";

grant references on table "public"."doubles_pairings" to "service_role";

grant select on table "public"."doubles_pairings" to "service_role";

grant trigger on table "public"."doubles_pairings" to "service_role";

grant truncate on table "public"."doubles_pairings" to "service_role";

grant update on table "public"."doubles_pairings" to "service_role";

grant delete on table "public"."elo_sport_config" to "anon";

grant insert on table "public"."elo_sport_config" to "anon";

grant references on table "public"."elo_sport_config" to "anon";

grant select on table "public"."elo_sport_config" to "anon";

grant trigger on table "public"."elo_sport_config" to "anon";

grant truncate on table "public"."elo_sport_config" to "anon";

grant update on table "public"."elo_sport_config" to "anon";

grant delete on table "public"."elo_sport_config" to "authenticated";

grant insert on table "public"."elo_sport_config" to "authenticated";

grant references on table "public"."elo_sport_config" to "authenticated";

grant select on table "public"."elo_sport_config" to "authenticated";

grant trigger on table "public"."elo_sport_config" to "authenticated";

grant truncate on table "public"."elo_sport_config" to "authenticated";

grant update on table "public"."elo_sport_config" to "authenticated";

grant delete on table "public"."elo_sport_config" to "service_role";

grant insert on table "public"."elo_sport_config" to "service_role";

grant references on table "public"."elo_sport_config" to "service_role";

grant select on table "public"."elo_sport_config" to "service_role";

grant trigger on table "public"."elo_sport_config" to "service_role";

grant truncate on table "public"."elo_sport_config" to "service_role";

grant update on table "public"."elo_sport_config" to "service_role";

grant delete on table "public"."event_attendance" to "anon";

grant insert on table "public"."event_attendance" to "anon";

grant references on table "public"."event_attendance" to "anon";

grant select on table "public"."event_attendance" to "anon";

grant trigger on table "public"."event_attendance" to "anon";

grant truncate on table "public"."event_attendance" to "anon";

grant update on table "public"."event_attendance" to "anon";

grant delete on table "public"."event_attendance" to "authenticated";

grant insert on table "public"."event_attendance" to "authenticated";

grant references on table "public"."event_attendance" to "authenticated";

grant select on table "public"."event_attendance" to "authenticated";

grant trigger on table "public"."event_attendance" to "authenticated";

grant truncate on table "public"."event_attendance" to "authenticated";

grant update on table "public"."event_attendance" to "authenticated";

grant delete on table "public"."event_attendance" to "service_role";

grant insert on table "public"."event_attendance" to "service_role";

grant references on table "public"."event_attendance" to "service_role";

grant select on table "public"."event_attendance" to "service_role";

grant trigger on table "public"."event_attendance" to "service_role";

grant truncate on table "public"."event_attendance" to "service_role";

grant update on table "public"."event_attendance" to "service_role";

grant delete on table "public"."event_comments" to "anon";

grant insert on table "public"."event_comments" to "anon";

grant references on table "public"."event_comments" to "anon";

grant select on table "public"."event_comments" to "anon";

grant trigger on table "public"."event_comments" to "anon";

grant truncate on table "public"."event_comments" to "anon";

grant update on table "public"."event_comments" to "anon";

grant delete on table "public"."event_comments" to "authenticated";

grant insert on table "public"."event_comments" to "authenticated";

grant references on table "public"."event_comments" to "authenticated";

grant select on table "public"."event_comments" to "authenticated";

grant trigger on table "public"."event_comments" to "authenticated";

grant truncate on table "public"."event_comments" to "authenticated";

grant update on table "public"."event_comments" to "authenticated";

grant delete on table "public"."event_comments" to "service_role";

grant insert on table "public"."event_comments" to "service_role";

grant references on table "public"."event_comments" to "service_role";

grant select on table "public"."event_comments" to "service_role";

grant trigger on table "public"."event_comments" to "service_role";

grant truncate on table "public"."event_comments" to "service_role";

grant update on table "public"."event_comments" to "service_role";

grant delete on table "public"."event_invitations" to "anon";

grant insert on table "public"."event_invitations" to "anon";

grant references on table "public"."event_invitations" to "anon";

grant select on table "public"."event_invitations" to "anon";

grant trigger on table "public"."event_invitations" to "anon";

grant truncate on table "public"."event_invitations" to "anon";

grant update on table "public"."event_invitations" to "anon";

grant delete on table "public"."event_invitations" to "authenticated";

grant insert on table "public"."event_invitations" to "authenticated";

grant references on table "public"."event_invitations" to "authenticated";

grant select on table "public"."event_invitations" to "authenticated";

grant trigger on table "public"."event_invitations" to "authenticated";

grant truncate on table "public"."event_invitations" to "authenticated";

grant update on table "public"."event_invitations" to "authenticated";

grant delete on table "public"."event_invitations" to "service_role";

grant insert on table "public"."event_invitations" to "service_role";

grant references on table "public"."event_invitations" to "service_role";

grant select on table "public"."event_invitations" to "service_role";

grant trigger on table "public"."event_invitations" to "service_role";

grant truncate on table "public"."event_invitations" to "service_role";

grant update on table "public"."event_invitations" to "service_role";

grant delete on table "public"."event_waitlist" to "anon";

grant insert on table "public"."event_waitlist" to "anon";

grant references on table "public"."event_waitlist" to "anon";

grant select on table "public"."event_waitlist" to "anon";

grant trigger on table "public"."event_waitlist" to "anon";

grant truncate on table "public"."event_waitlist" to "anon";

grant update on table "public"."event_waitlist" to "anon";

grant delete on table "public"."event_waitlist" to "authenticated";

grant insert on table "public"."event_waitlist" to "authenticated";

grant references on table "public"."event_waitlist" to "authenticated";

grant select on table "public"."event_waitlist" to "authenticated";

grant trigger on table "public"."event_waitlist" to "authenticated";

grant truncate on table "public"."event_waitlist" to "authenticated";

grant update on table "public"."event_waitlist" to "authenticated";

grant delete on table "public"."event_waitlist" to "service_role";

grant insert on table "public"."event_waitlist" to "service_role";

grant references on table "public"."event_waitlist" to "service_role";

grant select on table "public"."event_waitlist" to "service_role";

grant trigger on table "public"."event_waitlist" to "service_role";

grant truncate on table "public"."event_waitlist" to "service_role";

grant update on table "public"."event_waitlist" to "service_role";

grant delete on table "public"."events" to "anon";

grant insert on table "public"."events" to "anon";

grant references on table "public"."events" to "anon";

grant select on table "public"."events" to "anon";

grant trigger on table "public"."events" to "anon";

grant truncate on table "public"."events" to "anon";

grant update on table "public"."events" to "anon";

grant delete on table "public"."events" to "authenticated";

grant insert on table "public"."events" to "authenticated";

grant references on table "public"."events" to "authenticated";

grant select on table "public"."events" to "authenticated";

grant trigger on table "public"."events" to "authenticated";

grant truncate on table "public"."events" to "authenticated";

grant update on table "public"."events" to "authenticated";

grant delete on table "public"."events" to "service_role";

grant insert on table "public"."events" to "service_role";

grant references on table "public"."events" to "service_role";

grant select on table "public"."events" to "service_role";

grant trigger on table "public"."events" to "service_role";

grant truncate on table "public"."events" to "service_role";

grant update on table "public"."events" to "service_role";

grant delete on table "public"."exercise_example_videos" to "anon";

grant insert on table "public"."exercise_example_videos" to "anon";

grant references on table "public"."exercise_example_videos" to "anon";

grant select on table "public"."exercise_example_videos" to "anon";

grant trigger on table "public"."exercise_example_videos" to "anon";

grant truncate on table "public"."exercise_example_videos" to "anon";

grant update on table "public"."exercise_example_videos" to "anon";

grant delete on table "public"."exercise_example_videos" to "authenticated";

grant insert on table "public"."exercise_example_videos" to "authenticated";

grant references on table "public"."exercise_example_videos" to "authenticated";

grant select on table "public"."exercise_example_videos" to "authenticated";

grant trigger on table "public"."exercise_example_videos" to "authenticated";

grant truncate on table "public"."exercise_example_videos" to "authenticated";

grant update on table "public"."exercise_example_videos" to "authenticated";

grant delete on table "public"."exercise_example_videos" to "service_role";

grant insert on table "public"."exercise_example_videos" to "service_role";

grant references on table "public"."exercise_example_videos" to "service_role";

grant select on table "public"."exercise_example_videos" to "service_role";

grant trigger on table "public"."exercise_example_videos" to "service_role";

grant truncate on table "public"."exercise_example_videos" to "service_role";

grant update on table "public"."exercise_example_videos" to "service_role";

grant delete on table "public"."exercise_milestones" to "anon";

grant insert on table "public"."exercise_milestones" to "anon";

grant references on table "public"."exercise_milestones" to "anon";

grant select on table "public"."exercise_milestones" to "anon";

grant trigger on table "public"."exercise_milestones" to "anon";

grant truncate on table "public"."exercise_milestones" to "anon";

grant update on table "public"."exercise_milestones" to "anon";

grant delete on table "public"."exercise_milestones" to "authenticated";

grant insert on table "public"."exercise_milestones" to "authenticated";

grant references on table "public"."exercise_milestones" to "authenticated";

grant select on table "public"."exercise_milestones" to "authenticated";

grant trigger on table "public"."exercise_milestones" to "authenticated";

grant truncate on table "public"."exercise_milestones" to "authenticated";

grant update on table "public"."exercise_milestones" to "authenticated";

grant delete on table "public"."exercise_milestones" to "service_role";

grant insert on table "public"."exercise_milestones" to "service_role";

grant references on table "public"."exercise_milestones" to "service_role";

grant select on table "public"."exercise_milestones" to "service_role";

grant trigger on table "public"."exercise_milestones" to "service_role";

grant truncate on table "public"."exercise_milestones" to "service_role";

grant update on table "public"."exercise_milestones" to "service_role";

grant delete on table "public"."exercise_records" to "anon";

grant insert on table "public"."exercise_records" to "anon";

grant references on table "public"."exercise_records" to "anon";

grant select on table "public"."exercise_records" to "anon";

grant trigger on table "public"."exercise_records" to "anon";

grant truncate on table "public"."exercise_records" to "anon";

grant update on table "public"."exercise_records" to "anon";

grant delete on table "public"."exercise_records" to "authenticated";

grant insert on table "public"."exercise_records" to "authenticated";

grant references on table "public"."exercise_records" to "authenticated";

grant select on table "public"."exercise_records" to "authenticated";

grant trigger on table "public"."exercise_records" to "authenticated";

grant truncate on table "public"."exercise_records" to "authenticated";

grant update on table "public"."exercise_records" to "authenticated";

grant delete on table "public"."exercise_records" to "service_role";

grant insert on table "public"."exercise_records" to "service_role";

grant references on table "public"."exercise_records" to "service_role";

grant select on table "public"."exercise_records" to "service_role";

grant trigger on table "public"."exercise_records" to "service_role";

grant truncate on table "public"."exercise_records" to "service_role";

grant update on table "public"."exercise_records" to "service_role";

grant delete on table "public"."exercises" to "anon";

grant insert on table "public"."exercises" to "anon";

grant references on table "public"."exercises" to "anon";

grant select on table "public"."exercises" to "anon";

grant trigger on table "public"."exercises" to "anon";

grant truncate on table "public"."exercises" to "anon";

grant update on table "public"."exercises" to "anon";

grant delete on table "public"."exercises" to "authenticated";

grant insert on table "public"."exercises" to "authenticated";

grant references on table "public"."exercises" to "authenticated";

grant select on table "public"."exercises" to "authenticated";

grant trigger on table "public"."exercises" to "authenticated";

grant truncate on table "public"."exercises" to "authenticated";

grant update on table "public"."exercises" to "authenticated";

grant delete on table "public"."exercises" to "service_role";

grant insert on table "public"."exercises" to "service_role";

grant references on table "public"."exercises" to "service_role";

grant select on table "public"."exercises" to "service_role";

grant trigger on table "public"."exercises" to "service_role";

grant truncate on table "public"."exercises" to "service_role";

grant update on table "public"."exercises" to "service_role";

grant delete on table "public"."friendships" to "anon";

grant insert on table "public"."friendships" to "anon";

grant references on table "public"."friendships" to "anon";

grant select on table "public"."friendships" to "anon";

grant trigger on table "public"."friendships" to "anon";

grant truncate on table "public"."friendships" to "anon";

grant update on table "public"."friendships" to "anon";

grant delete on table "public"."friendships" to "authenticated";

grant insert on table "public"."friendships" to "authenticated";

grant references on table "public"."friendships" to "authenticated";

grant select on table "public"."friendships" to "authenticated";

grant trigger on table "public"."friendships" to "authenticated";

grant truncate on table "public"."friendships" to "authenticated";

grant update on table "public"."friendships" to "authenticated";

grant delete on table "public"."friendships" to "service_role";

grant insert on table "public"."friendships" to "service_role";

grant references on table "public"."friendships" to "service_role";

grant select on table "public"."friendships" to "service_role";

grant trigger on table "public"."friendships" to "service_role";

grant truncate on table "public"."friendships" to "service_role";

grant update on table "public"."friendships" to "service_role";

grant delete on table "public"."guardian_consent_log" to "anon";

grant insert on table "public"."guardian_consent_log" to "anon";

grant references on table "public"."guardian_consent_log" to "anon";

grant select on table "public"."guardian_consent_log" to "anon";

grant trigger on table "public"."guardian_consent_log" to "anon";

grant truncate on table "public"."guardian_consent_log" to "anon";

grant update on table "public"."guardian_consent_log" to "anon";

grant delete on table "public"."guardian_consent_log" to "authenticated";

grant insert on table "public"."guardian_consent_log" to "authenticated";

grant references on table "public"."guardian_consent_log" to "authenticated";

grant select on table "public"."guardian_consent_log" to "authenticated";

grant trigger on table "public"."guardian_consent_log" to "authenticated";

grant truncate on table "public"."guardian_consent_log" to "authenticated";

grant update on table "public"."guardian_consent_log" to "authenticated";

grant delete on table "public"."guardian_consent_log" to "service_role";

grant insert on table "public"."guardian_consent_log" to "service_role";

grant references on table "public"."guardian_consent_log" to "service_role";

grant select on table "public"."guardian_consent_log" to "service_role";

grant trigger on table "public"."guardian_consent_log" to "service_role";

grant truncate on table "public"."guardian_consent_log" to "service_role";

grant update on table "public"."guardian_consent_log" to "service_role";

grant delete on table "public"."guardian_event_responses" to "anon";

grant insert on table "public"."guardian_event_responses" to "anon";

grant references on table "public"."guardian_event_responses" to "anon";

grant select on table "public"."guardian_event_responses" to "anon";

grant trigger on table "public"."guardian_event_responses" to "anon";

grant truncate on table "public"."guardian_event_responses" to "anon";

grant update on table "public"."guardian_event_responses" to "anon";

grant delete on table "public"."guardian_event_responses" to "authenticated";

grant insert on table "public"."guardian_event_responses" to "authenticated";

grant references on table "public"."guardian_event_responses" to "authenticated";

grant select on table "public"."guardian_event_responses" to "authenticated";

grant trigger on table "public"."guardian_event_responses" to "authenticated";

grant truncate on table "public"."guardian_event_responses" to "authenticated";

grant update on table "public"."guardian_event_responses" to "authenticated";

grant delete on table "public"."guardian_event_responses" to "service_role";

grant insert on table "public"."guardian_event_responses" to "service_role";

grant references on table "public"."guardian_event_responses" to "service_role";

grant select on table "public"."guardian_event_responses" to "service_role";

grant trigger on table "public"."guardian_event_responses" to "service_role";

grant truncate on table "public"."guardian_event_responses" to "service_role";

grant update on table "public"."guardian_event_responses" to "service_role";

grant delete on table "public"."guardian_links" to "anon";

grant insert on table "public"."guardian_links" to "anon";

grant references on table "public"."guardian_links" to "anon";

grant select on table "public"."guardian_links" to "anon";

grant trigger on table "public"."guardian_links" to "anon";

grant truncate on table "public"."guardian_links" to "anon";

grant update on table "public"."guardian_links" to "anon";

grant delete on table "public"."guardian_links" to "authenticated";

grant insert on table "public"."guardian_links" to "authenticated";

grant references on table "public"."guardian_links" to "authenticated";

grant select on table "public"."guardian_links" to "authenticated";

grant trigger on table "public"."guardian_links" to "authenticated";

grant truncate on table "public"."guardian_links" to "authenticated";

grant update on table "public"."guardian_links" to "authenticated";

grant delete on table "public"."guardian_links" to "service_role";

grant insert on table "public"."guardian_links" to "service_role";

grant references on table "public"."guardian_links" to "service_role";

grant select on table "public"."guardian_links" to "service_role";

grant trigger on table "public"."guardian_links" to "service_role";

grant truncate on table "public"."guardian_links" to "service_role";

grant update on table "public"."guardian_links" to "service_role";

grant delete on table "public"."head_to_head_stats" to "anon";

grant insert on table "public"."head_to_head_stats" to "anon";

grant references on table "public"."head_to_head_stats" to "anon";

grant select on table "public"."head_to_head_stats" to "anon";

grant trigger on table "public"."head_to_head_stats" to "anon";

grant truncate on table "public"."head_to_head_stats" to "anon";

grant update on table "public"."head_to_head_stats" to "anon";

grant delete on table "public"."head_to_head_stats" to "authenticated";

grant insert on table "public"."head_to_head_stats" to "authenticated";

grant references on table "public"."head_to_head_stats" to "authenticated";

grant select on table "public"."head_to_head_stats" to "authenticated";

grant trigger on table "public"."head_to_head_stats" to "authenticated";

grant truncate on table "public"."head_to_head_stats" to "authenticated";

grant update on table "public"."head_to_head_stats" to "authenticated";

grant delete on table "public"."head_to_head_stats" to "service_role";

grant insert on table "public"."head_to_head_stats" to "service_role";

grant references on table "public"."head_to_head_stats" to "service_role";

grant select on table "public"."head_to_head_stats" to "service_role";

grant trigger on table "public"."head_to_head_stats" to "service_role";

grant truncate on table "public"."head_to_head_stats" to "service_role";

grant update on table "public"."head_to_head_stats" to "service_role";

grant delete on table "public"."hidden_content" to "anon";

grant insert on table "public"."hidden_content" to "anon";

grant references on table "public"."hidden_content" to "anon";

grant select on table "public"."hidden_content" to "anon";

grant trigger on table "public"."hidden_content" to "anon";

grant truncate on table "public"."hidden_content" to "anon";

grant update on table "public"."hidden_content" to "anon";

grant delete on table "public"."hidden_content" to "authenticated";

grant insert on table "public"."hidden_content" to "authenticated";

grant references on table "public"."hidden_content" to "authenticated";

grant select on table "public"."hidden_content" to "authenticated";

grant trigger on table "public"."hidden_content" to "authenticated";

grant truncate on table "public"."hidden_content" to "authenticated";

grant update on table "public"."hidden_content" to "authenticated";

grant delete on table "public"."hidden_content" to "service_role";

grant insert on table "public"."hidden_content" to "service_role";

grant references on table "public"."hidden_content" to "service_role";

grant select on table "public"."hidden_content" to "service_role";

grant trigger on table "public"."hidden_content" to "service_role";

grant truncate on table "public"."hidden_content" to "service_role";

grant update on table "public"."hidden_content" to "service_role";

grant delete on table "public"."invitation_codes" to "anon";

grant insert on table "public"."invitation_codes" to "anon";

grant references on table "public"."invitation_codes" to "anon";

grant select on table "public"."invitation_codes" to "anon";

grant trigger on table "public"."invitation_codes" to "anon";

grant truncate on table "public"."invitation_codes" to "anon";

grant update on table "public"."invitation_codes" to "anon";

grant delete on table "public"."invitation_codes" to "authenticated";

grant insert on table "public"."invitation_codes" to "authenticated";

grant references on table "public"."invitation_codes" to "authenticated";

grant select on table "public"."invitation_codes" to "authenticated";

grant trigger on table "public"."invitation_codes" to "authenticated";

grant truncate on table "public"."invitation_codes" to "authenticated";

grant update on table "public"."invitation_codes" to "authenticated";

grant delete on table "public"."invitation_codes" to "service_role";

grant insert on table "public"."invitation_codes" to "service_role";

grant references on table "public"."invitation_codes" to "service_role";

grant select on table "public"."invitation_codes" to "service_role";

grant trigger on table "public"."invitation_codes" to "service_role";

grant truncate on table "public"."invitation_codes" to "service_role";

grant update on table "public"."invitation_codes" to "service_role";

grant delete on table "public"."leave_club_requests" to "anon";

grant insert on table "public"."leave_club_requests" to "anon";

grant references on table "public"."leave_club_requests" to "anon";

grant select on table "public"."leave_club_requests" to "anon";

grant trigger on table "public"."leave_club_requests" to "anon";

grant truncate on table "public"."leave_club_requests" to "anon";

grant update on table "public"."leave_club_requests" to "anon";

grant delete on table "public"."leave_club_requests" to "authenticated";

grant insert on table "public"."leave_club_requests" to "authenticated";

grant references on table "public"."leave_club_requests" to "authenticated";

grant select on table "public"."leave_club_requests" to "authenticated";

grant trigger on table "public"."leave_club_requests" to "authenticated";

grant truncate on table "public"."leave_club_requests" to "authenticated";

grant update on table "public"."leave_club_requests" to "authenticated";

grant delete on table "public"."leave_club_requests" to "service_role";

grant insert on table "public"."leave_club_requests" to "service_role";

grant references on table "public"."leave_club_requests" to "service_role";

grant select on table "public"."leave_club_requests" to "service_role";

grant trigger on table "public"."leave_club_requests" to "service_role";

grant truncate on table "public"."leave_club_requests" to "service_role";

grant update on table "public"."leave_club_requests" to "service_role";

grant delete on table "public"."match_media" to "anon";

grant insert on table "public"."match_media" to "anon";

grant references on table "public"."match_media" to "anon";

grant select on table "public"."match_media" to "anon";

grant trigger on table "public"."match_media" to "anon";

grant truncate on table "public"."match_media" to "anon";

grant update on table "public"."match_media" to "anon";

grant delete on table "public"."match_media" to "authenticated";

grant insert on table "public"."match_media" to "authenticated";

grant references on table "public"."match_media" to "authenticated";

grant select on table "public"."match_media" to "authenticated";

grant trigger on table "public"."match_media" to "authenticated";

grant truncate on table "public"."match_media" to "authenticated";

grant update on table "public"."match_media" to "authenticated";

grant delete on table "public"."match_media" to "service_role";

grant insert on table "public"."match_media" to "service_role";

grant references on table "public"."match_media" to "service_role";

grant select on table "public"."match_media" to "service_role";

grant trigger on table "public"."match_media" to "service_role";

grant truncate on table "public"."match_media" to "service_role";

grant update on table "public"."match_media" to "service_role";

grant delete on table "public"."match_proposals" to "anon";

grant insert on table "public"."match_proposals" to "anon";

grant references on table "public"."match_proposals" to "anon";

grant select on table "public"."match_proposals" to "anon";

grant trigger on table "public"."match_proposals" to "anon";

grant truncate on table "public"."match_proposals" to "anon";

grant update on table "public"."match_proposals" to "anon";

grant delete on table "public"."match_proposals" to "authenticated";

grant insert on table "public"."match_proposals" to "authenticated";

grant references on table "public"."match_proposals" to "authenticated";

grant select on table "public"."match_proposals" to "authenticated";

grant trigger on table "public"."match_proposals" to "authenticated";

grant truncate on table "public"."match_proposals" to "authenticated";

grant update on table "public"."match_proposals" to "authenticated";

grant delete on table "public"."match_proposals" to "service_role";

grant insert on table "public"."match_proposals" to "service_role";

grant references on table "public"."match_proposals" to "service_role";

grant select on table "public"."match_proposals" to "service_role";

grant trigger on table "public"."match_proposals" to "service_role";

grant truncate on table "public"."match_proposals" to "service_role";

grant update on table "public"."match_proposals" to "service_role";

grant delete on table "public"."match_requests" to "anon";

grant insert on table "public"."match_requests" to "anon";

grant references on table "public"."match_requests" to "anon";

grant select on table "public"."match_requests" to "anon";

grant trigger on table "public"."match_requests" to "anon";

grant truncate on table "public"."match_requests" to "anon";

grant update on table "public"."match_requests" to "anon";

grant delete on table "public"."match_requests" to "authenticated";

grant insert on table "public"."match_requests" to "authenticated";

grant references on table "public"."match_requests" to "authenticated";

grant select on table "public"."match_requests" to "authenticated";

grant trigger on table "public"."match_requests" to "authenticated";

grant truncate on table "public"."match_requests" to "authenticated";

grant update on table "public"."match_requests" to "authenticated";

grant delete on table "public"."match_requests" to "service_role";

grant insert on table "public"."match_requests" to "service_role";

grant references on table "public"."match_requests" to "service_role";

grant select on table "public"."match_requests" to "service_role";

grant trigger on table "public"."match_requests" to "service_role";

grant truncate on table "public"."match_requests" to "service_role";

grant update on table "public"."match_requests" to "service_role";

grant delete on table "public"."matches" to "anon";

grant insert on table "public"."matches" to "anon";

grant references on table "public"."matches" to "anon";

grant select on table "public"."matches" to "anon";

grant trigger on table "public"."matches" to "anon";

grant truncate on table "public"."matches" to "anon";

grant update on table "public"."matches" to "anon";

grant delete on table "public"."matches" to "authenticated";

grant insert on table "public"."matches" to "authenticated";

grant references on table "public"."matches" to "authenticated";

grant select on table "public"."matches" to "authenticated";

grant trigger on table "public"."matches" to "authenticated";

grant truncate on table "public"."matches" to "authenticated";

grant update on table "public"."matches" to "authenticated";

grant delete on table "public"."matches" to "service_role";

grant insert on table "public"."matches" to "service_role";

grant references on table "public"."matches" to "service_role";

grant select on table "public"."matches" to "service_role";

grant trigger on table "public"."matches" to "service_role";

grant truncate on table "public"."matches" to "service_role";

grant update on table "public"."matches" to "service_role";

grant delete on table "public"."ml_data_consent" to "anon";

grant insert on table "public"."ml_data_consent" to "anon";

grant references on table "public"."ml_data_consent" to "anon";

grant select on table "public"."ml_data_consent" to "anon";

grant trigger on table "public"."ml_data_consent" to "anon";

grant truncate on table "public"."ml_data_consent" to "anon";

grant update on table "public"."ml_data_consent" to "anon";

grant delete on table "public"."ml_data_consent" to "authenticated";

grant insert on table "public"."ml_data_consent" to "authenticated";

grant references on table "public"."ml_data_consent" to "authenticated";

grant select on table "public"."ml_data_consent" to "authenticated";

grant trigger on table "public"."ml_data_consent" to "authenticated";

grant truncate on table "public"."ml_data_consent" to "authenticated";

grant update on table "public"."ml_data_consent" to "authenticated";

grant delete on table "public"."ml_data_consent" to "service_role";

grant insert on table "public"."ml_data_consent" to "service_role";

grant references on table "public"."ml_data_consent" to "service_role";

grant select on table "public"."ml_data_consent" to "service_role";

grant trigger on table "public"."ml_data_consent" to "service_role";

grant truncate on table "public"."ml_data_consent" to "service_role";

grant update on table "public"."ml_data_consent" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."points_history" to "anon";

grant insert on table "public"."points_history" to "anon";

grant references on table "public"."points_history" to "anon";

grant select on table "public"."points_history" to "anon";

grant trigger on table "public"."points_history" to "anon";

grant truncate on table "public"."points_history" to "anon";

grant update on table "public"."points_history" to "anon";

grant delete on table "public"."points_history" to "authenticated";

grant insert on table "public"."points_history" to "authenticated";

grant references on table "public"."points_history" to "authenticated";

grant select on table "public"."points_history" to "authenticated";

grant trigger on table "public"."points_history" to "authenticated";

grant truncate on table "public"."points_history" to "authenticated";

grant update on table "public"."points_history" to "authenticated";

grant delete on table "public"."points_history" to "service_role";

grant insert on table "public"."points_history" to "service_role";

grant references on table "public"."points_history" to "service_role";

grant select on table "public"."points_history" to "service_role";

grant trigger on table "public"."points_history" to "service_role";

grant truncate on table "public"."points_history" to "service_role";

grant update on table "public"."points_history" to "service_role";

grant delete on table "public"."poll_votes" to "anon";

grant insert on table "public"."poll_votes" to "anon";

grant references on table "public"."poll_votes" to "anon";

grant select on table "public"."poll_votes" to "anon";

grant trigger on table "public"."poll_votes" to "anon";

grant truncate on table "public"."poll_votes" to "anon";

grant update on table "public"."poll_votes" to "anon";

grant delete on table "public"."poll_votes" to "authenticated";

grant insert on table "public"."poll_votes" to "authenticated";

grant references on table "public"."poll_votes" to "authenticated";

grant select on table "public"."poll_votes" to "authenticated";

grant trigger on table "public"."poll_votes" to "authenticated";

grant truncate on table "public"."poll_votes" to "authenticated";

grant update on table "public"."poll_votes" to "authenticated";

grant delete on table "public"."poll_votes" to "service_role";

grant insert on table "public"."poll_votes" to "service_role";

grant references on table "public"."poll_votes" to "service_role";

grant select on table "public"."poll_votes" to "service_role";

grant trigger on table "public"."poll_votes" to "service_role";

grant truncate on table "public"."poll_votes" to "service_role";

grant update on table "public"."poll_votes" to "service_role";

grant delete on table "public"."post_comments" to "anon";

grant insert on table "public"."post_comments" to "anon";

grant references on table "public"."post_comments" to "anon";

grant select on table "public"."post_comments" to "anon";

grant trigger on table "public"."post_comments" to "anon";

grant truncate on table "public"."post_comments" to "anon";

grant update on table "public"."post_comments" to "anon";

grant delete on table "public"."post_comments" to "authenticated";

grant insert on table "public"."post_comments" to "authenticated";

grant references on table "public"."post_comments" to "authenticated";

grant select on table "public"."post_comments" to "authenticated";

grant trigger on table "public"."post_comments" to "authenticated";

grant truncate on table "public"."post_comments" to "authenticated";

grant update on table "public"."post_comments" to "authenticated";

grant delete on table "public"."post_comments" to "service_role";

grant insert on table "public"."post_comments" to "service_role";

grant references on table "public"."post_comments" to "service_role";

grant select on table "public"."post_comments" to "service_role";

grant trigger on table "public"."post_comments" to "service_role";

grant truncate on table "public"."post_comments" to "service_role";

grant update on table "public"."post_comments" to "service_role";

grant delete on table "public"."post_likes" to "anon";

grant insert on table "public"."post_likes" to "anon";

grant references on table "public"."post_likes" to "anon";

grant select on table "public"."post_likes" to "anon";

grant trigger on table "public"."post_likes" to "anon";

grant truncate on table "public"."post_likes" to "anon";

grant update on table "public"."post_likes" to "anon";

grant delete on table "public"."post_likes" to "authenticated";

grant insert on table "public"."post_likes" to "authenticated";

grant references on table "public"."post_likes" to "authenticated";

grant select on table "public"."post_likes" to "authenticated";

grant trigger on table "public"."post_likes" to "authenticated";

grant truncate on table "public"."post_likes" to "authenticated";

grant update on table "public"."post_likes" to "authenticated";

grant delete on table "public"."post_likes" to "service_role";

grant insert on table "public"."post_likes" to "service_role";

grant references on table "public"."post_likes" to "service_role";

grant select on table "public"."post_likes" to "service_role";

grant trigger on table "public"."post_likes" to "service_role";

grant truncate on table "public"."post_likes" to "service_role";

grant update on table "public"."post_likes" to "service_role";

grant delete on table "public"."profile_club_sports" to "anon";

grant insert on table "public"."profile_club_sports" to "anon";

grant references on table "public"."profile_club_sports" to "anon";

grant select on table "public"."profile_club_sports" to "anon";

grant trigger on table "public"."profile_club_sports" to "anon";

grant truncate on table "public"."profile_club_sports" to "anon";

grant update on table "public"."profile_club_sports" to "anon";

grant delete on table "public"."profile_club_sports" to "authenticated";

grant insert on table "public"."profile_club_sports" to "authenticated";

grant references on table "public"."profile_club_sports" to "authenticated";

grant select on table "public"."profile_club_sports" to "authenticated";

grant trigger on table "public"."profile_club_sports" to "authenticated";

grant truncate on table "public"."profile_club_sports" to "authenticated";

grant update on table "public"."profile_club_sports" to "authenticated";

grant delete on table "public"."profile_club_sports" to "service_role";

grant insert on table "public"."profile_club_sports" to "service_role";

grant references on table "public"."profile_club_sports" to "service_role";

grant select on table "public"."profile_club_sports" to "service_role";

grant trigger on table "public"."profile_club_sports" to "service_role";

grant truncate on table "public"."profile_club_sports" to "service_role";

grant update on table "public"."profile_club_sports" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."push_notification_logs" to "anon";

grant insert on table "public"."push_notification_logs" to "anon";

grant references on table "public"."push_notification_logs" to "anon";

grant select on table "public"."push_notification_logs" to "anon";

grant trigger on table "public"."push_notification_logs" to "anon";

grant truncate on table "public"."push_notification_logs" to "anon";

grant update on table "public"."push_notification_logs" to "anon";

grant delete on table "public"."push_notification_logs" to "authenticated";

grant insert on table "public"."push_notification_logs" to "authenticated";

grant references on table "public"."push_notification_logs" to "authenticated";

grant select on table "public"."push_notification_logs" to "authenticated";

grant trigger on table "public"."push_notification_logs" to "authenticated";

grant truncate on table "public"."push_notification_logs" to "authenticated";

grant update on table "public"."push_notification_logs" to "authenticated";

grant delete on table "public"."push_notification_logs" to "service_role";

grant insert on table "public"."push_notification_logs" to "service_role";

grant references on table "public"."push_notification_logs" to "service_role";

grant select on table "public"."push_notification_logs" to "service_role";

grant trigger on table "public"."push_notification_logs" to "service_role";

grant truncate on table "public"."push_notification_logs" to "service_role";

grant update on table "public"."push_notification_logs" to "service_role";

grant delete on table "public"."push_subscriptions" to "anon";

grant insert on table "public"."push_subscriptions" to "anon";

grant references on table "public"."push_subscriptions" to "anon";

grant select on table "public"."push_subscriptions" to "anon";

grant trigger on table "public"."push_subscriptions" to "anon";

grant truncate on table "public"."push_subscriptions" to "anon";

grant update on table "public"."push_subscriptions" to "anon";

grant delete on table "public"."push_subscriptions" to "authenticated";

grant insert on table "public"."push_subscriptions" to "authenticated";

grant references on table "public"."push_subscriptions" to "authenticated";

grant select on table "public"."push_subscriptions" to "authenticated";

grant trigger on table "public"."push_subscriptions" to "authenticated";

grant truncate on table "public"."push_subscriptions" to "authenticated";

grant update on table "public"."push_subscriptions" to "authenticated";

grant delete on table "public"."push_subscriptions" to "service_role";

grant insert on table "public"."push_subscriptions" to "service_role";

grant references on table "public"."push_subscriptions" to "service_role";

grant select on table "public"."push_subscriptions" to "service_role";

grant trigger on table "public"."push_subscriptions" to "service_role";

grant truncate on table "public"."push_subscriptions" to "service_role";

grant update on table "public"."push_subscriptions" to "service_role";

grant delete on table "public"."seasons" to "anon";

grant insert on table "public"."seasons" to "anon";

grant references on table "public"."seasons" to "anon";

grant select on table "public"."seasons" to "anon";

grant trigger on table "public"."seasons" to "anon";

grant truncate on table "public"."seasons" to "anon";

grant update on table "public"."seasons" to "anon";

grant delete on table "public"."seasons" to "authenticated";

grant insert on table "public"."seasons" to "authenticated";

grant references on table "public"."seasons" to "authenticated";

grant select on table "public"."seasons" to "authenticated";

grant trigger on table "public"."seasons" to "authenticated";

grant truncate on table "public"."seasons" to "authenticated";

grant update on table "public"."seasons" to "authenticated";

grant delete on table "public"."seasons" to "service_role";

grant insert on table "public"."seasons" to "service_role";

grant references on table "public"."seasons" to "service_role";

grant select on table "public"."seasons" to "service_role";

grant trigger on table "public"."seasons" to "service_role";

grant truncate on table "public"."seasons" to "service_role";

grant update on table "public"."seasons" to "service_role";

grant delete on table "public"."sports" to "anon";

grant insert on table "public"."sports" to "anon";

grant references on table "public"."sports" to "anon";

grant select on table "public"."sports" to "anon";

grant trigger on table "public"."sports" to "anon";

grant truncate on table "public"."sports" to "anon";

grant update on table "public"."sports" to "anon";

grant delete on table "public"."sports" to "authenticated";

grant insert on table "public"."sports" to "authenticated";

grant references on table "public"."sports" to "authenticated";

grant select on table "public"."sports" to "authenticated";

grant trigger on table "public"."sports" to "authenticated";

grant truncate on table "public"."sports" to "authenticated";

grant update on table "public"."sports" to "authenticated";

grant delete on table "public"."sports" to "service_role";

grant insert on table "public"."sports" to "service_role";

grant references on table "public"."sports" to "service_role";

grant select on table "public"."sports" to "service_role";

grant trigger on table "public"."sports" to "service_role";

grant truncate on table "public"."sports" to "service_role";

grant update on table "public"."sports" to "service_role";

grant delete on table "public"."streaks" to "anon";

grant insert on table "public"."streaks" to "anon";

grant references on table "public"."streaks" to "anon";

grant select on table "public"."streaks" to "anon";

grant trigger on table "public"."streaks" to "anon";

grant truncate on table "public"."streaks" to "anon";

grant update on table "public"."streaks" to "anon";

grant delete on table "public"."streaks" to "authenticated";

grant insert on table "public"."streaks" to "authenticated";

grant references on table "public"."streaks" to "authenticated";

grant select on table "public"."streaks" to "authenticated";

grant trigger on table "public"."streaks" to "authenticated";

grant truncate on table "public"."streaks" to "authenticated";

grant update on table "public"."streaks" to "authenticated";

grant delete on table "public"."streaks" to "service_role";

grant insert on table "public"."streaks" to "service_role";

grant references on table "public"."streaks" to "service_role";

grant select on table "public"."streaks" to "service_role";

grant trigger on table "public"."streaks" to "service_role";

grant truncate on table "public"."streaks" to "service_role";

grant update on table "public"."streaks" to "service_role";

grant delete on table "public"."subgroup_members" to "anon";

grant insert on table "public"."subgroup_members" to "anon";

grant references on table "public"."subgroup_members" to "anon";

grant select on table "public"."subgroup_members" to "anon";

grant trigger on table "public"."subgroup_members" to "anon";

grant truncate on table "public"."subgroup_members" to "anon";

grant update on table "public"."subgroup_members" to "anon";

grant delete on table "public"."subgroup_members" to "authenticated";

grant insert on table "public"."subgroup_members" to "authenticated";

grant references on table "public"."subgroup_members" to "authenticated";

grant select on table "public"."subgroup_members" to "authenticated";

grant trigger on table "public"."subgroup_members" to "authenticated";

grant truncate on table "public"."subgroup_members" to "authenticated";

grant update on table "public"."subgroup_members" to "authenticated";

grant delete on table "public"."subgroup_members" to "service_role";

grant insert on table "public"."subgroup_members" to "service_role";

grant references on table "public"."subgroup_members" to "service_role";

grant select on table "public"."subgroup_members" to "service_role";

grant trigger on table "public"."subgroup_members" to "service_role";

grant truncate on table "public"."subgroup_members" to "service_role";

grant update on table "public"."subgroup_members" to "service_role";

grant delete on table "public"."subgroups" to "anon";

grant insert on table "public"."subgroups" to "anon";

grant references on table "public"."subgroups" to "anon";

grant select on table "public"."subgroups" to "anon";

grant trigger on table "public"."subgroups" to "anon";

grant truncate on table "public"."subgroups" to "anon";

grant update on table "public"."subgroups" to "anon";

grant delete on table "public"."subgroups" to "authenticated";

grant insert on table "public"."subgroups" to "authenticated";

grant references on table "public"."subgroups" to "authenticated";

grant select on table "public"."subgroups" to "authenticated";

grant trigger on table "public"."subgroups" to "authenticated";

grant truncate on table "public"."subgroups" to "authenticated";

grant update on table "public"."subgroups" to "authenticated";

grant delete on table "public"."subgroups" to "service_role";

grant insert on table "public"."subgroups" to "service_role";

grant references on table "public"."subgroups" to "service_role";

grant select on table "public"."subgroups" to "service_role";

grant trigger on table "public"."subgroups" to "service_role";

grant truncate on table "public"."subgroups" to "service_role";

grant update on table "public"."subgroups" to "service_role";

grant delete on table "public"."tournament_matches" to "anon";

grant insert on table "public"."tournament_matches" to "anon";

grant references on table "public"."tournament_matches" to "anon";

grant select on table "public"."tournament_matches" to "anon";

grant trigger on table "public"."tournament_matches" to "anon";

grant truncate on table "public"."tournament_matches" to "anon";

grant update on table "public"."tournament_matches" to "anon";

grant delete on table "public"."tournament_matches" to "authenticated";

grant insert on table "public"."tournament_matches" to "authenticated";

grant references on table "public"."tournament_matches" to "authenticated";

grant select on table "public"."tournament_matches" to "authenticated";

grant trigger on table "public"."tournament_matches" to "authenticated";

grant truncate on table "public"."tournament_matches" to "authenticated";

grant update on table "public"."tournament_matches" to "authenticated";

grant delete on table "public"."tournament_matches" to "service_role";

grant insert on table "public"."tournament_matches" to "service_role";

grant references on table "public"."tournament_matches" to "service_role";

grant select on table "public"."tournament_matches" to "service_role";

grant trigger on table "public"."tournament_matches" to "service_role";

grant truncate on table "public"."tournament_matches" to "service_role";

grant update on table "public"."tournament_matches" to "service_role";

grant delete on table "public"."tournament_participants" to "anon";

grant insert on table "public"."tournament_participants" to "anon";

grant references on table "public"."tournament_participants" to "anon";

grant select on table "public"."tournament_participants" to "anon";

grant trigger on table "public"."tournament_participants" to "anon";

grant truncate on table "public"."tournament_participants" to "anon";

grant update on table "public"."tournament_participants" to "anon";

grant delete on table "public"."tournament_participants" to "authenticated";

grant insert on table "public"."tournament_participants" to "authenticated";

grant references on table "public"."tournament_participants" to "authenticated";

grant select on table "public"."tournament_participants" to "authenticated";

grant trigger on table "public"."tournament_participants" to "authenticated";

grant truncate on table "public"."tournament_participants" to "authenticated";

grant update on table "public"."tournament_participants" to "authenticated";

grant delete on table "public"."tournament_participants" to "service_role";

grant insert on table "public"."tournament_participants" to "service_role";

grant references on table "public"."tournament_participants" to "service_role";

grant select on table "public"."tournament_participants" to "service_role";

grant trigger on table "public"."tournament_participants" to "service_role";

grant truncate on table "public"."tournament_participants" to "service_role";

grant update on table "public"."tournament_participants" to "service_role";

grant delete on table "public"."tournament_rounds" to "anon";

grant insert on table "public"."tournament_rounds" to "anon";

grant references on table "public"."tournament_rounds" to "anon";

grant select on table "public"."tournament_rounds" to "anon";

grant trigger on table "public"."tournament_rounds" to "anon";

grant truncate on table "public"."tournament_rounds" to "anon";

grant update on table "public"."tournament_rounds" to "anon";

grant delete on table "public"."tournament_rounds" to "authenticated";

grant insert on table "public"."tournament_rounds" to "authenticated";

grant references on table "public"."tournament_rounds" to "authenticated";

grant select on table "public"."tournament_rounds" to "authenticated";

grant trigger on table "public"."tournament_rounds" to "authenticated";

grant truncate on table "public"."tournament_rounds" to "authenticated";

grant update on table "public"."tournament_rounds" to "authenticated";

grant delete on table "public"."tournament_rounds" to "service_role";

grant insert on table "public"."tournament_rounds" to "service_role";

grant references on table "public"."tournament_rounds" to "service_role";

grant select on table "public"."tournament_rounds" to "service_role";

grant trigger on table "public"."tournament_rounds" to "service_role";

grant truncate on table "public"."tournament_rounds" to "service_role";

grant update on table "public"."tournament_rounds" to "service_role";

grant delete on table "public"."tournament_standings" to "anon";

grant insert on table "public"."tournament_standings" to "anon";

grant references on table "public"."tournament_standings" to "anon";

grant select on table "public"."tournament_standings" to "anon";

grant trigger on table "public"."tournament_standings" to "anon";

grant truncate on table "public"."tournament_standings" to "anon";

grant update on table "public"."tournament_standings" to "anon";

grant delete on table "public"."tournament_standings" to "authenticated";

grant insert on table "public"."tournament_standings" to "authenticated";

grant references on table "public"."tournament_standings" to "authenticated";

grant select on table "public"."tournament_standings" to "authenticated";

grant trigger on table "public"."tournament_standings" to "authenticated";

grant truncate on table "public"."tournament_standings" to "authenticated";

grant update on table "public"."tournament_standings" to "authenticated";

grant delete on table "public"."tournament_standings" to "service_role";

grant insert on table "public"."tournament_standings" to "service_role";

grant references on table "public"."tournament_standings" to "service_role";

grant select on table "public"."tournament_standings" to "service_role";

grant trigger on table "public"."tournament_standings" to "service_role";

grant truncate on table "public"."tournament_standings" to "service_role";

grant update on table "public"."tournament_standings" to "service_role";

grant delete on table "public"."tournaments" to "anon";

grant insert on table "public"."tournaments" to "anon";

grant references on table "public"."tournaments" to "anon";

grant select on table "public"."tournaments" to "anon";

grant trigger on table "public"."tournaments" to "anon";

grant truncate on table "public"."tournaments" to "anon";

grant update on table "public"."tournaments" to "anon";

grant delete on table "public"."tournaments" to "authenticated";

grant insert on table "public"."tournaments" to "authenticated";

grant references on table "public"."tournaments" to "authenticated";

grant select on table "public"."tournaments" to "authenticated";

grant trigger on table "public"."tournaments" to "authenticated";

grant truncate on table "public"."tournaments" to "authenticated";

grant update on table "public"."tournaments" to "authenticated";

grant delete on table "public"."tournaments" to "service_role";

grant insert on table "public"."tournaments" to "service_role";

grant references on table "public"."tournaments" to "service_role";

grant select on table "public"."tournaments" to "service_role";

grant trigger on table "public"."tournaments" to "service_role";

grant truncate on table "public"."tournaments" to "service_role";

grant update on table "public"."tournaments" to "service_role";

grant delete on table "public"."training_sessions" to "anon";

grant insert on table "public"."training_sessions" to "anon";

grant references on table "public"."training_sessions" to "anon";

grant select on table "public"."training_sessions" to "anon";

grant trigger on table "public"."training_sessions" to "anon";

grant truncate on table "public"."training_sessions" to "anon";

grant update on table "public"."training_sessions" to "anon";

grant delete on table "public"."training_sessions" to "authenticated";

grant insert on table "public"."training_sessions" to "authenticated";

grant references on table "public"."training_sessions" to "authenticated";

grant select on table "public"."training_sessions" to "authenticated";

grant trigger on table "public"."training_sessions" to "authenticated";

grant truncate on table "public"."training_sessions" to "authenticated";

grant update on table "public"."training_sessions" to "authenticated";

grant delete on table "public"."training_sessions" to "service_role";

grant insert on table "public"."training_sessions" to "service_role";

grant references on table "public"."training_sessions" to "service_role";

grant select on table "public"."training_sessions" to "service_role";

grant trigger on table "public"."training_sessions" to "service_role";

grant truncate on table "public"."training_sessions" to "service_role";

grant update on table "public"."training_sessions" to "service_role";

grant delete on table "public"."user_blocks" to "anon";

grant insert on table "public"."user_blocks" to "anon";

grant references on table "public"."user_blocks" to "anon";

grant select on table "public"."user_blocks" to "anon";

grant trigger on table "public"."user_blocks" to "anon";

grant truncate on table "public"."user_blocks" to "anon";

grant update on table "public"."user_blocks" to "anon";

grant delete on table "public"."user_blocks" to "authenticated";

grant insert on table "public"."user_blocks" to "authenticated";

grant references on table "public"."user_blocks" to "authenticated";

grant select on table "public"."user_blocks" to "authenticated";

grant trigger on table "public"."user_blocks" to "authenticated";

grant truncate on table "public"."user_blocks" to "authenticated";

grant update on table "public"."user_blocks" to "authenticated";

grant delete on table "public"."user_blocks" to "service_role";

grant insert on table "public"."user_blocks" to "service_role";

grant references on table "public"."user_blocks" to "service_role";

grant select on table "public"."user_blocks" to "service_role";

grant trigger on table "public"."user_blocks" to "service_role";

grant truncate on table "public"."user_blocks" to "service_role";

grant update on table "public"."user_blocks" to "service_role";

grant delete on table "public"."user_preferences" to "anon";

grant insert on table "public"."user_preferences" to "anon";

grant references on table "public"."user_preferences" to "anon";

grant select on table "public"."user_preferences" to "anon";

grant trigger on table "public"."user_preferences" to "anon";

grant truncate on table "public"."user_preferences" to "anon";

grant update on table "public"."user_preferences" to "anon";

grant delete on table "public"."user_preferences" to "authenticated";

grant insert on table "public"."user_preferences" to "authenticated";

grant references on table "public"."user_preferences" to "authenticated";

grant select on table "public"."user_preferences" to "authenticated";

grant trigger on table "public"."user_preferences" to "authenticated";

grant truncate on table "public"."user_preferences" to "authenticated";

grant update on table "public"."user_preferences" to "authenticated";

grant delete on table "public"."user_preferences" to "service_role";

grant insert on table "public"."user_preferences" to "service_role";

grant references on table "public"."user_preferences" to "service_role";

grant select on table "public"."user_preferences" to "service_role";

grant trigger on table "public"."user_preferences" to "service_role";

grant truncate on table "public"."user_preferences" to "service_role";

grant update on table "public"."user_preferences" to "service_role";

grant delete on table "public"."user_season_points" to "anon";

grant insert on table "public"."user_season_points" to "anon";

grant references on table "public"."user_season_points" to "anon";

grant select on table "public"."user_season_points" to "anon";

grant trigger on table "public"."user_season_points" to "anon";

grant truncate on table "public"."user_season_points" to "anon";

grant update on table "public"."user_season_points" to "anon";

grant delete on table "public"."user_season_points" to "authenticated";

grant insert on table "public"."user_season_points" to "authenticated";

grant references on table "public"."user_season_points" to "authenticated";

grant select on table "public"."user_season_points" to "authenticated";

grant trigger on table "public"."user_season_points" to "authenticated";

grant truncate on table "public"."user_season_points" to "authenticated";

grant update on table "public"."user_season_points" to "authenticated";

grant delete on table "public"."user_season_points" to "service_role";

grant insert on table "public"."user_season_points" to "service_role";

grant references on table "public"."user_season_points" to "service_role";

grant select on table "public"."user_season_points" to "service_role";

grant trigger on table "public"."user_season_points" to "service_role";

grant truncate on table "public"."user_season_points" to "service_role";

grant update on table "public"."user_season_points" to "service_role";

grant delete on table "public"."user_sport_stats" to "anon";

grant insert on table "public"."user_sport_stats" to "anon";

grant references on table "public"."user_sport_stats" to "anon";

grant select on table "public"."user_sport_stats" to "anon";

grant trigger on table "public"."user_sport_stats" to "anon";

grant truncate on table "public"."user_sport_stats" to "anon";

grant update on table "public"."user_sport_stats" to "anon";

grant delete on table "public"."user_sport_stats" to "authenticated";

grant insert on table "public"."user_sport_stats" to "authenticated";

grant references on table "public"."user_sport_stats" to "authenticated";

grant select on table "public"."user_sport_stats" to "authenticated";

grant trigger on table "public"."user_sport_stats" to "authenticated";

grant truncate on table "public"."user_sport_stats" to "authenticated";

grant update on table "public"."user_sport_stats" to "authenticated";

grant delete on table "public"."user_sport_stats" to "service_role";

grant insert on table "public"."user_sport_stats" to "service_role";

grant references on table "public"."user_sport_stats" to "service_role";

grant select on table "public"."user_sport_stats" to "service_role";

grant trigger on table "public"."user_sport_stats" to "service_role";

grant truncate on table "public"."user_sport_stats" to "service_role";

grant update on table "public"."user_sport_stats" to "service_role";

grant delete on table "public"."video_ai_analyses" to "anon";

grant insert on table "public"."video_ai_analyses" to "anon";

grant references on table "public"."video_ai_analyses" to "anon";

grant select on table "public"."video_ai_analyses" to "anon";

grant trigger on table "public"."video_ai_analyses" to "anon";

grant truncate on table "public"."video_ai_analyses" to "anon";

grant update on table "public"."video_ai_analyses" to "anon";

grant delete on table "public"."video_ai_analyses" to "authenticated";

grant insert on table "public"."video_ai_analyses" to "authenticated";

grant references on table "public"."video_ai_analyses" to "authenticated";

grant select on table "public"."video_ai_analyses" to "authenticated";

grant trigger on table "public"."video_ai_analyses" to "authenticated";

grant truncate on table "public"."video_ai_analyses" to "authenticated";

grant update on table "public"."video_ai_analyses" to "authenticated";

grant delete on table "public"."video_ai_analyses" to "service_role";

grant insert on table "public"."video_ai_analyses" to "service_role";

grant references on table "public"."video_ai_analyses" to "service_role";

grant select on table "public"."video_ai_analyses" to "service_role";

grant trigger on table "public"."video_ai_analyses" to "service_role";

grant truncate on table "public"."video_ai_analyses" to "service_role";

grant update on table "public"."video_ai_analyses" to "service_role";

grant delete on table "public"."video_ai_frames" to "anon";

grant insert on table "public"."video_ai_frames" to "anon";

grant references on table "public"."video_ai_frames" to "anon";

grant select on table "public"."video_ai_frames" to "anon";

grant trigger on table "public"."video_ai_frames" to "anon";

grant truncate on table "public"."video_ai_frames" to "anon";

grant update on table "public"."video_ai_frames" to "anon";

grant delete on table "public"."video_ai_frames" to "authenticated";

grant insert on table "public"."video_ai_frames" to "authenticated";

grant references on table "public"."video_ai_frames" to "authenticated";

grant select on table "public"."video_ai_frames" to "authenticated";

grant trigger on table "public"."video_ai_frames" to "authenticated";

grant truncate on table "public"."video_ai_frames" to "authenticated";

grant update on table "public"."video_ai_frames" to "authenticated";

grant delete on table "public"."video_ai_frames" to "service_role";

grant insert on table "public"."video_ai_frames" to "service_role";

grant references on table "public"."video_ai_frames" to "service_role";

grant select on table "public"."video_ai_frames" to "service_role";

grant trigger on table "public"."video_ai_frames" to "service_role";

grant truncate on table "public"."video_ai_frames" to "service_role";

grant update on table "public"."video_ai_frames" to "service_role";

grant delete on table "public"."video_analyses" to "anon";

grant insert on table "public"."video_analyses" to "anon";

grant references on table "public"."video_analyses" to "anon";

grant select on table "public"."video_analyses" to "anon";

grant trigger on table "public"."video_analyses" to "anon";

grant truncate on table "public"."video_analyses" to "anon";

grant update on table "public"."video_analyses" to "anon";

grant delete on table "public"."video_analyses" to "authenticated";

grant insert on table "public"."video_analyses" to "authenticated";

grant references on table "public"."video_analyses" to "authenticated";

grant select on table "public"."video_analyses" to "authenticated";

grant trigger on table "public"."video_analyses" to "authenticated";

grant truncate on table "public"."video_analyses" to "authenticated";

grant update on table "public"."video_analyses" to "authenticated";

grant delete on table "public"."video_analyses" to "service_role";

grant insert on table "public"."video_analyses" to "service_role";

grant references on table "public"."video_analyses" to "service_role";

grant select on table "public"."video_analyses" to "service_role";

grant trigger on table "public"."video_analyses" to "service_role";

grant truncate on table "public"."video_analyses" to "service_role";

grant update on table "public"."video_analyses" to "service_role";

grant delete on table "public"."video_assignments" to "anon";

grant insert on table "public"."video_assignments" to "anon";

grant references on table "public"."video_assignments" to "anon";

grant select on table "public"."video_assignments" to "anon";

grant trigger on table "public"."video_assignments" to "anon";

grant truncate on table "public"."video_assignments" to "anon";

grant update on table "public"."video_assignments" to "anon";

grant delete on table "public"."video_assignments" to "authenticated";

grant insert on table "public"."video_assignments" to "authenticated";

grant references on table "public"."video_assignments" to "authenticated";

grant select on table "public"."video_assignments" to "authenticated";

grant trigger on table "public"."video_assignments" to "authenticated";

grant truncate on table "public"."video_assignments" to "authenticated";

grant update on table "public"."video_assignments" to "authenticated";

grant delete on table "public"."video_assignments" to "service_role";

grant insert on table "public"."video_assignments" to "service_role";

grant references on table "public"."video_assignments" to "service_role";

grant select on table "public"."video_assignments" to "service_role";

grant trigger on table "public"."video_assignments" to "service_role";

grant truncate on table "public"."video_assignments" to "service_role";

grant update on table "public"."video_assignments" to "service_role";

grant delete on table "public"."video_comments" to "anon";

grant insert on table "public"."video_comments" to "anon";

grant references on table "public"."video_comments" to "anon";

grant select on table "public"."video_comments" to "anon";

grant trigger on table "public"."video_comments" to "anon";

grant truncate on table "public"."video_comments" to "anon";

grant update on table "public"."video_comments" to "anon";

grant delete on table "public"."video_comments" to "authenticated";

grant insert on table "public"."video_comments" to "authenticated";

grant references on table "public"."video_comments" to "authenticated";

grant select on table "public"."video_comments" to "authenticated";

grant trigger on table "public"."video_comments" to "authenticated";

grant truncate on table "public"."video_comments" to "authenticated";

grant update on table "public"."video_comments" to "authenticated";

grant delete on table "public"."video_comments" to "service_role";

grant insert on table "public"."video_comments" to "service_role";

grant references on table "public"."video_comments" to "service_role";

grant select on table "public"."video_comments" to "service_role";

grant trigger on table "public"."video_comments" to "service_role";

grant truncate on table "public"."video_comments" to "service_role";

grant update on table "public"."video_comments" to "service_role";

grant delete on table "public"."video_labels" to "anon";

grant insert on table "public"."video_labels" to "anon";

grant references on table "public"."video_labels" to "anon";

grant select on table "public"."video_labels" to "anon";

grant trigger on table "public"."video_labels" to "anon";

grant truncate on table "public"."video_labels" to "anon";

grant update on table "public"."video_labels" to "anon";

grant delete on table "public"."video_labels" to "authenticated";

grant insert on table "public"."video_labels" to "authenticated";

grant references on table "public"."video_labels" to "authenticated";

grant select on table "public"."video_labels" to "authenticated";

grant trigger on table "public"."video_labels" to "authenticated";

grant truncate on table "public"."video_labels" to "authenticated";

grant update on table "public"."video_labels" to "authenticated";

grant delete on table "public"."video_labels" to "service_role";

grant insert on table "public"."video_labels" to "service_role";

grant references on table "public"."video_labels" to "service_role";

grant select on table "public"."video_labels" to "service_role";

grant trigger on table "public"."video_labels" to "service_role";

grant truncate on table "public"."video_labels" to "service_role";

grant update on table "public"."video_labels" to "service_role";

grant delete on table "public"."video_ml_metadata" to "anon";

grant insert on table "public"."video_ml_metadata" to "anon";

grant references on table "public"."video_ml_metadata" to "anon";

grant select on table "public"."video_ml_metadata" to "anon";

grant trigger on table "public"."video_ml_metadata" to "anon";

grant truncate on table "public"."video_ml_metadata" to "anon";

grant update on table "public"."video_ml_metadata" to "anon";

grant delete on table "public"."video_ml_metadata" to "authenticated";

grant insert on table "public"."video_ml_metadata" to "authenticated";

grant references on table "public"."video_ml_metadata" to "authenticated";

grant select on table "public"."video_ml_metadata" to "authenticated";

grant trigger on table "public"."video_ml_metadata" to "authenticated";

grant truncate on table "public"."video_ml_metadata" to "authenticated";

grant update on table "public"."video_ml_metadata" to "authenticated";

grant delete on table "public"."video_ml_metadata" to "service_role";

grant insert on table "public"."video_ml_metadata" to "service_role";

grant references on table "public"."video_ml_metadata" to "service_role";

grant select on table "public"."video_ml_metadata" to "service_role";

grant trigger on table "public"."video_ml_metadata" to "service_role";

grant truncate on table "public"."video_ml_metadata" to "service_role";

grant update on table "public"."video_ml_metadata" to "service_role";

grant delete on table "public"."video_rally_segments" to "anon";

grant insert on table "public"."video_rally_segments" to "anon";

grant references on table "public"."video_rally_segments" to "anon";

grant select on table "public"."video_rally_segments" to "anon";

grant trigger on table "public"."video_rally_segments" to "anon";

grant truncate on table "public"."video_rally_segments" to "anon";

grant update on table "public"."video_rally_segments" to "anon";

grant delete on table "public"."video_rally_segments" to "authenticated";

grant insert on table "public"."video_rally_segments" to "authenticated";

grant references on table "public"."video_rally_segments" to "authenticated";

grant select on table "public"."video_rally_segments" to "authenticated";

grant trigger on table "public"."video_rally_segments" to "authenticated";

grant truncate on table "public"."video_rally_segments" to "authenticated";

grant update on table "public"."video_rally_segments" to "authenticated";

grant delete on table "public"."video_rally_segments" to "service_role";

grant insert on table "public"."video_rally_segments" to "service_role";

grant references on table "public"."video_rally_segments" to "service_role";

grant select on table "public"."video_rally_segments" to "service_role";

grant trigger on table "public"."video_rally_segments" to "service_role";

grant truncate on table "public"."video_rally_segments" to "service_role";

grant update on table "public"."video_rally_segments" to "service_role";

grant delete on table "public"."xp_history" to "anon";

grant insert on table "public"."xp_history" to "anon";

grant references on table "public"."xp_history" to "anon";

grant select on table "public"."xp_history" to "anon";

grant trigger on table "public"."xp_history" to "anon";

grant truncate on table "public"."xp_history" to "anon";

grant update on table "public"."xp_history" to "anon";

grant delete on table "public"."xp_history" to "authenticated";

grant insert on table "public"."xp_history" to "authenticated";

grant references on table "public"."xp_history" to "authenticated";

grant select on table "public"."xp_history" to "authenticated";

grant trigger on table "public"."xp_history" to "authenticated";

grant truncate on table "public"."xp_history" to "authenticated";

grant update on table "public"."xp_history" to "authenticated";

grant delete on table "public"."xp_history" to "service_role";

grant insert on table "public"."xp_history" to "service_role";

grant references on table "public"."xp_history" to "service_role";

grant select on table "public"."xp_history" to "service_role";

grant trigger on table "public"."xp_history" to "service_role";

grant truncate on table "public"."xp_history" to "service_role";

grant update on table "public"."xp_history" to "service_role";


  create policy "activity_comments_delete"
  on "public"."activity_comments"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "activity_comments_insert"
  on "public"."activity_comments"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "activity_comments_select"
  on "public"."activity_comments"
  as permissive
  for select
  to public
using (true);



  create policy "activity_comments_update"
  on "public"."activity_comments"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) AND (created_at > (now() - '24:00:00'::interval))));



  create policy "Club doubles ranking visible to club members"
  on "public"."activity_events"
  as permissive
  for select
  to public
using (((event_type = 'club_doubles_ranking_change'::text) AND (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));



  create policy "Global doubles ranking visible to players and friends"
  on "public"."activity_events"
  as permissive
  for select
  to public
using (((event_type = 'global_doubles_ranking_change'::text) AND ((user_id = auth.uid()) OR (((event_data ->> 'player1_id'::text))::uuid = auth.uid()) OR (((event_data ->> 'player2_id'::text))::uuid = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.friendships
  WHERE ((friendships.status = 'accepted'::public.friendship_status) AND (((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = ((activity_events.event_data ->> 'player1_id'::text))::uuid)) OR ((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = ((activity_events.event_data ->> 'player2_id'::text))::uuid)))))))));



  create policy "System can insert activity events"
  on "public"."activity_events"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can view activity events based on type and privacy"
  on "public"."activity_events"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = activity_events.user_id) AND (COALESCE((p.privacy_settings ->> 'searchable'::text), 'global'::text) <> 'none'::text) AND (((activity_events.event_type = ANY (ARRAY['club_join'::text, 'club_leave'::text, 'club_ranking_change'::text])) AND (activity_events.club_id IS NOT NULL) AND (activity_events.club_id = ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))) OR ((activity_events.event_type = 'global_ranking_change'::text) AND (EXISTS ( SELECT 1
           FROM public.friendships
          WHERE ((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = activity_events.user_id) AND (friendships.status = 'accepted'::public.friendship_status))))) OR ((activity_events.event_type = ANY (ARRAY['rank_up'::text, 'milestone'::text, 'achievement'::text])) AND (((COALESCE((p.privacy_settings ->> 'searchable'::text), 'global'::text) = 'global'::text) AND ((p.club_id = ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM public.friendships
          WHERE ((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = activity_events.user_id) AND (friendships.status = 'accepted'::public.friendship_status)))))) OR (((p.privacy_settings ->> 'searchable'::text) = 'club_only'::text) AND (p.club_id = ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))) OR (((p.privacy_settings ->> 'searchable'::text) = 'friends_only'::text) AND (EXISTS ( SELECT 1
           FROM public.friendships
          WHERE ((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = activity_events.user_id) AND (friendships.status = 'accepted'::public.friendship_status)))))))))))));



  create policy "activity_likes_delete"
  on "public"."activity_likes"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "activity_likes_insert"
  on "public"."activity_likes"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "activity_likes_select"
  on "public"."activity_likes"
  as permissive
  for select
  to public
using (true);



  create policy "attendance_delete"
  on "public"."attendance"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM (public.training_sessions ts
     JOIN public.profiles p ON ((p.club_id = ts.club_id)))
  WHERE ((ts.id = attendance.session_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "attendance_insert"
  on "public"."attendance"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM (public.training_sessions ts
     JOIN public.profiles p ON ((p.club_id = ts.club_id)))
  WHERE ((ts.id = attendance.session_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "attendance_select"
  on "public"."attendance"
  as permissive
  for select
  to public
using ((session_id IN ( SELECT training_sessions.id
   FROM public.training_sessions
  WHERE (training_sessions.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));



  create policy "attendance_update"
  on "public"."attendance"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM (public.training_sessions ts
     JOIN public.profiles p ON ((p.club_id = ts.club_id)))
  WHERE ((ts.id = attendance.session_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "audit_logs_insert_policy"
  on "public"."audit_logs"
  as permissive
  for insert
  to public
with check (true);



  create policy "audit_logs_select_policy"
  on "public"."audit_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));



  create policy "challenges_delete"
  on "public"."challenges"
  as permissive
  for delete
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = challenges.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = ( SELECT auth.uid() AS uid)) AND (profile_club_sports.club_id = challenges.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text])))))));



  create policy "challenges_insert"
  on "public"."challenges"
  as permissive
  for insert
  to public
with check (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = challenges.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = ( SELECT auth.uid() AS uid)) AND (profile_club_sports.club_id = challenges.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text])))))));



  create policy "challenges_select"
  on "public"."challenges"
  as permissive
  for select
  to public
using (((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (club_id IN ( SELECT profile_club_sports.club_id
   FROM public.profile_club_sports
  WHERE (profile_club_sports.user_id = ( SELECT auth.uid() AS uid))))));



  create policy "challenges_update"
  on "public"."challenges"
  as permissive
  for update
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = challenges.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = ( SELECT auth.uid() AS uid)) AND (profile_club_sports.club_id = challenges.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text])))))));



  create policy "chat_conversations_guardian_select"
  on "public"."chat_conversations"
  as permissive
  for select
  to public
using (public.is_guardian_of_participant(id));



  create policy "chat_conversations_insert"
  on "public"."chat_conversations"
  as permissive
  for insert
  to public
with check (((auth.uid() IS NOT NULL) AND (created_by = ( SELECT auth.uid() AS uid))));



  create policy "chat_conversations_select"
  on "public"."chat_conversations"
  as permissive
  for select
  to public
using (public.is_chat_participant(id));



  create policy "chat_conversations_update"
  on "public"."chat_conversations"
  as permissive
  for update
  to public
using (((created_by = ( SELECT auth.uid() AS uid)) OR public.is_chat_admin(id)));



  create policy "chat_messages_delete"
  on "public"."chat_messages"
  as permissive
  for delete
  to public
using ((sender_id = ( SELECT auth.uid() AS uid)));



  create policy "chat_messages_guardian_select"
  on "public"."chat_messages"
  as permissive
  for select
  to public
using (public.is_guardian_of_participant(conversation_id));



  create policy "chat_messages_insert"
  on "public"."chat_messages"
  as permissive
  for insert
  to public
with check (((sender_id = ( SELECT auth.uid() AS uid)) AND public.is_chat_participant(conversation_id)));



  create policy "chat_messages_select"
  on "public"."chat_messages"
  as permissive
  for select
  to public
using (public.is_chat_participant(conversation_id));



  create policy "chat_messages_update"
  on "public"."chat_messages"
  as permissive
  for update
  to public
using ((sender_id = ( SELECT auth.uid() AS uid)));



  create policy "chat_participants_delete"
  on "public"."chat_participants"
  as permissive
  for delete
  to public
using (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_chat_admin(conversation_id)));



  create policy "chat_participants_guardian_select"
  on "public"."chat_participants"
  as permissive
  for select
  to public
using (public.is_guardian_of_participant(conversation_id));



  create policy "chat_participants_insert"
  on "public"."chat_participants"
  as permissive
  for insert
  to public
with check (((auth.uid() IS NOT NULL) AND ((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.chat_conversations cc
  WHERE ((cc.id = chat_participants.conversation_id) AND (cc.created_by = ( SELECT auth.uid() AS uid))))) OR public.is_chat_admin(conversation_id))));



  create policy "chat_participants_select"
  on "public"."chat_participants"
  as permissive
  for select
  to public
using (public.is_chat_participant(conversation_id));



  create policy "Guardians can create codes for their children"
  on "public"."child_login_codes"
  as permissive
  for insert
  to public
with check (((guardian_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = child_login_codes.child_id))))));



  create policy "Guardians can view codes they created"
  on "public"."child_login_codes"
  as permissive
  for select
  to public
using ((guardian_id = auth.uid()));



  create policy "Guardians can create club requests for children"
  on "public"."club_requests"
  as permissive
  for insert
  to public
with check ((player_id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid()))));



  create policy "Guardians can view child club requests"
  on "public"."club_requests"
  as permissive
  for select
  to public
using ((player_id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid()))));



  create policy "Guardians can withdraw child club requests"
  on "public"."club_requests"
  as permissive
  for delete
  to public
using (((status = 'pending'::public.request_status) AND (player_id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid())))));



  create policy "club_requests_delete"
  on "public"."club_requests"
  as permissive
  for delete
  to public
using (((player_id = auth.uid()) AND (status = 'pending'::public.request_status)));



  create policy "club_requests_insert"
  on "public"."club_requests"
  as permissive
  for insert
  to public
with check ((player_id = auth.uid()));



  create policy "club_requests_select_coach"
  on "public"."club_requests"
  as permissive
  for select
  to public
using ((club_id IN ( SELECT p.club_id
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "club_requests_select_own"
  on "public"."club_requests"
  as permissive
  for select
  to public
using ((player_id = auth.uid()));



  create policy "club_requests_update_coach"
  on "public"."club_requests"
  as permissive
  for update
  to public
using ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "club_sports_admin_delete"
  on "public"."club_sports"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));



  create policy "club_sports_admin_insert"
  on "public"."club_sports"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));



  create policy "club_sports_admin_update"
  on "public"."club_sports"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));



  create policy "club_sports_manage"
  on "public"."club_sports"
  as permissive
  for all
  to public
using ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "club_sports_select"
  on "public"."club_sports"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "clubs_delete"
  on "public"."clubs"
  as permissive
  for delete
  to public
using (public.is_admin());



  create policy "clubs_insert"
  on "public"."clubs"
  as permissive
  for insert
  to public
with check (public.is_admin());



  create policy "clubs_insert_admin"
  on "public"."clubs"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));



  create policy "clubs_select"
  on "public"."clubs"
  as permissive
  for select
  to public
using (true);



  create policy "clubs_select_all"
  on "public"."clubs"
  as permissive
  for select
  to public
using (true);



  create policy "clubs_update"
  on "public"."clubs"
  as permissive
  for update
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "clubs_update_admin"
  on "public"."clubs"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id = clubs.id)))));



  create policy "clubs_update_coach"
  on "public"."clubs"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id = clubs.id)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id = clubs.id)))));



  create policy "Users can create polls"
  on "public"."community_polls"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete own polls"
  on "public"."community_polls"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can update own polls"
  on "public"."community_polls"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can view polls based on visibility"
  on "public"."community_polls"
  as permissive
  for select
  to public
using (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR (visibility = 'public'::text) OR ((visibility = 'club'::text) AND (club_id = ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) OR ((visibility = 'followers'::text) AND (EXISTS ( SELECT 1
   FROM public.friendships
  WHERE ((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = community_polls.user_id) AND (friendships.status = 'accepted'::public.friendship_status))))))));



  create policy "Users can create posts"
  on "public"."community_posts"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete own posts"
  on "public"."community_posts"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can update own posts"
  on "public"."community_posts"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can view posts based on visibility"
  on "public"."community_posts"
  as permissive
  for select
  to public
using (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR (visibility = 'public'::text) OR ((visibility = 'club'::text) AND (club_id IS NOT NULL) AND (club_id = ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) OR ((visibility = 'followers'::text) AND (EXISTS ( SELECT 1
   FROM public.friendships
  WHERE ((friendships.requester_id = auth.uid()) AND (friendships.addressee_id = community_posts.user_id) AND (friendships.status = 'accepted'::public.friendship_status))))))));



  create policy "completed_challenges_insert"
  on "public"."completed_challenges"
  as permissive
  for insert
  to public
with check (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "completed_challenges_manage"
  on "public"."completed_challenges"
  as permissive
  for all
  to public
using (((user_id = auth.uid()) OR public.is_coach_or_admin()));



  create policy "completed_challenges_select"
  on "public"."completed_challenges"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (challenge_id IN ( SELECT challenges.id
   FROM public.challenges
  WHERE (challenges.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))))) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = completed_challenges.user_id))))));



  create policy "completed_exercises_insert"
  on "public"."completed_exercises"
  as permissive
  for insert
  to public
with check (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "completed_exercises_manage"
  on "public"."completed_exercises"
  as permissive
  for all
  to public
using (public.is_coach_or_admin());



  create policy "completed_exercises_select"
  on "public"."completed_exercises"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR public.is_coach_or_admin()));



  create policy "config_read_all"
  on "public"."config"
  as permissive
  for select
  to public
using (true);



  create policy "config_select"
  on "public"."config"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "Admins can update reports"
  on "public"."content_reports"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Admins can view all reports"
  on "public"."content_reports"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Users can create reports"
  on "public"."content_reports"
  as permissive
  for insert
  to public
with check ((reporter_id = auth.uid()));



  create policy "Users can view their own reports"
  on "public"."content_reports"
  as permissive
  for select
  to public
using ((reporter_id = auth.uid()));



  create policy "doubles_match_requests_create"
  on "public"."doubles_match_requests"
  as permissive
  for insert
  to public
with check (((auth.uid() IS NOT NULL) AND (initiated_by = auth.uid())));



  create policy "doubles_match_requests_read"
  on "public"."doubles_match_requests"
  as permissive
  for select
  to public
using (((auth.uid() IS NOT NULL) AND ((initiated_by = auth.uid()) OR (((team_a ->> 'player1_id'::text))::uuid = auth.uid()) OR (((team_a ->> 'player2_id'::text))::uuid = auth.uid()) OR (((team_b ->> 'player1_id'::text))::uuid = auth.uid()) OR (((team_b ->> 'player2_id'::text))::uuid = auth.uid()) OR ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role])) AND (status = 'pending_coach'::public.doubles_request_status)) OR ((( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = club_id) AND (status = ANY (ARRAY['pending_opponent'::public.doubles_request_status, 'pending_coach'::public.doubles_request_status]))))));



  create policy "doubles_match_requests_update"
  on "public"."doubles_match_requests"
  as permissive
  for update
  to public
using (((auth.uid() IS NOT NULL) AND ((initiated_by = auth.uid()) OR (((team_a ->> 'player1_id'::text))::uuid = auth.uid()) OR (((team_a ->> 'player2_id'::text))::uuid = auth.uid()) OR (((team_b ->> 'player1_id'::text))::uuid = auth.uid()) OR (((team_b ->> 'player2_id'::text))::uuid = auth.uid()) OR ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role])) AND (status = 'pending_coach'::public.doubles_request_status)))));



  create policy "doubles_requests_delete"
  on "public"."doubles_match_requests"
  as permissive
  for delete
  to public
using (((initiated_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = doubles_match_requests.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "doubles_requests_insert"
  on "public"."doubles_match_requests"
  as permissive
  for insert
  to public
with check (((initiated_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = doubles_match_requests.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "doubles_requests_select"
  on "public"."doubles_match_requests"
  as permissive
  for select
  to public
using (((initiated_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = doubles_match_requests.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));



  create policy "doubles_requests_update"
  on "public"."doubles_match_requests"
  as permissive
  for update
  to public
using (((initiated_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = doubles_match_requests.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));



  create policy "doubles_matches_create"
  on "public"."doubles_matches"
  as permissive
  for insert
  to public
with check (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (team_a_player1_id = ( SELECT auth.uid() AS uid)) OR (team_a_player2_id = ( SELECT auth.uid() AS uid)) OR (team_b_player1_id = ( SELECT auth.uid() AS uid)) OR (team_b_player2_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid))));



  create policy "doubles_matches_delete"
  on "public"."doubles_matches"
  as permissive
  for delete
  to public
using (((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role])) AND ((club_id IS NULL) OR (( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = club_id))));



  create policy "doubles_matches_manage"
  on "public"."doubles_matches"
  as permissive
  for all
  to public
using (public.is_coach_or_admin());



  create policy "doubles_matches_read"
  on "public"."doubles_matches"
  as permissive
  for select
  to public
using (((auth.uid() IS NOT NULL) AND ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::public.user_role) OR (club_id IS NULL) OR (( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = club_id) OR (team_a_player1_id = auth.uid()) OR (team_a_player2_id = auth.uid()) OR (team_b_player1_id = auth.uid()) OR (team_b_player2_id = auth.uid()))));



  create policy "doubles_matches_select"
  on "public"."doubles_matches"
  as permissive
  for select
  to public
using (((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (club_id IS NULL) OR (team_a_player1_id = ( SELECT auth.uid() AS uid)) OR (team_a_player2_id = ( SELECT auth.uid() AS uid)) OR (team_b_player1_id = ( SELECT auth.uid() AS uid)) OR (team_b_player2_id = ( SELECT auth.uid() AS uid))));



  create policy "doubles_matches_update"
  on "public"."doubles_matches"
  as permissive
  for update
  to public
using (((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role])) AND ((club_id IS NULL) OR (( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = club_id))));



  create policy "doubles_pairings_read"
  on "public"."doubles_pairings"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "elo_sport_config_read"
  on "public"."elo_sport_config"
  as permissive
  for select
  to public
using (true);



  create policy "Coaches can insert event attendance"
  on "public"."event_attendance"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_attendance.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "Coaches can update event attendance"
  on "public"."event_attendance"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_attendance.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "Coaches can view event attendance"
  on "public"."event_attendance"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_attendance.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "Players can view attendance for their club events"
  on "public"."event_attendance"
  as permissive
  for select
  to public
using ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Coaches can delete event comments"
  on "public"."event_comments"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_comments.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Invited users can create event comments"
  on "public"."event_comments"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_comments.event_id) AND (e.comments_enabled = true)))) AND ((EXISTS ( SELECT 1
   FROM public.event_invitations ei
  WHERE ((ei.event_id = event_comments.event_id) AND (ei.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_comments.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))))));



  create policy "Invited users can read event comments"
  on "public"."event_comments"
  as permissive
  for select
  to public
using (((EXISTS ( SELECT 1
   FROM public.event_invitations ei
  WHERE ((ei.event_id = event_comments.event_id) AND (ei.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_comments.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "Users can delete own event comments"
  on "public"."event_comments"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Coaches can create invitations"
  on "public"."event_invitations"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Coaches can delete invitations"
  on "public"."event_invitations"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Coaches can view club invitations"
  on "public"."event_invitations"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])) AND (profiles.club_id = ( SELECT events.club_id
           FROM public.events
          WHERE (events.id = event_invitations.event_id)))))));



  create policy "Users can respond to own invitations"
  on "public"."event_invitations"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view own invitations"
  on "public"."event_invitations"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "event_invitations_delete"
  on "public"."event_invitations"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_invitations.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "event_invitations_insert"
  on "public"."event_invitations"
  as permissive
  for insert
  to public
with check (((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_invitations.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (user_id = auth.uid())));



  create policy "event_invitations_select"
  on "public"."event_invitations"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = event_invitations.user_id)))) OR (EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_invitations.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "event_invitations_update"
  on "public"."event_invitations"
  as permissive
  for update
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = event_invitations.user_id)))) OR (EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_invitations.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "Coaches can manage waitlist"
  on "public"."event_waitlist"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_waitlist.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Users can join waitlist"
  on "public"."event_waitlist"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can leave waitlist"
  on "public"."event_waitlist"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their waitlist status"
  on "public"."event_waitlist"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = event_waitlist.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "Club members can view events"
  on "public"."events"
  as permissive
  for select
  to public
using ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Coaches can create events"
  on "public"."events"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.club_id = events.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "Coaches can delete events"
  on "public"."events"
  as permissive
  for delete
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE ((profiles.club_id = events.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "Coaches can update events"
  on "public"."events"
  as permissive
  for update
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE ((profiles.club_id = events.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "exercise_example_videos_delete"
  on "public"."exercise_example_videos"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = exercise_example_videos.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "exercise_example_videos_insert"
  on "public"."exercise_example_videos"
  as permissive
  for insert
  to public
with check (((added_by = auth.uid()) AND (club_id = ( SELECT p.club_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "exercise_example_videos_select"
  on "public"."exercise_example_videos"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = exercise_example_videos.club_id)))));



  create policy "exercise_example_videos_update"
  on "public"."exercise_example_videos"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = exercise_example_videos.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "Coaches can update milestones"
  on "public"."exercise_milestones"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Coaches can upsert milestones"
  on "public"."exercise_milestones"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Coaches can view all milestones"
  on "public"."exercise_milestones"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Users can view own milestones"
  on "public"."exercise_milestones"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "exercise_milestones_insert"
  on "public"."exercise_milestones"
  as permissive
  for insert
  to public
with check (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "exercise_milestones_manage"
  on "public"."exercise_milestones"
  as permissive
  for all
  to public
using (public.is_coach_or_admin());



  create policy "exercise_milestones_select"
  on "public"."exercise_milestones"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "exercise_milestones_update"
  on "public"."exercise_milestones"
  as permissive
  for update
  to public
using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "exercises_delete"
  on "public"."exercises"
  as permissive
  for delete
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::public.user_role)))) OR ((club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = exercises.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))))));



  create policy "exercises_insert"
  on "public"."exercises"
  as permissive
  for insert
  to public
with check (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::public.user_role)))) OR ((club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = exercises.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))))));



  create policy "exercises_select"
  on "public"."exercises"
  as permissive
  for select
  to public
using (((club_id IS NULL) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));



  create policy "exercises_update"
  on "public"."exercises"
  as permissive
  for update
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::public.user_role)))) OR ((club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = exercises.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role]))))))));



  create policy "Users can create friendship requests"
  on "public"."friendships"
  as permissive
  for insert
  to public
with check ((auth.uid() = requester_id));



  create policy "Users can delete friendships"
  on "public"."friendships"
  as permissive
  for delete
  to public
using (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));



  create policy "Users can update friendship status"
  on "public"."friendships"
  as permissive
  for update
  to public
using (((auth.uid() = addressee_id) OR (auth.uid() = requester_id)));



  create policy "Users can view their own friendships"
  on "public"."friendships"
  as permissive
  for select
  to public
using (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));



  create policy "Guardians can insert consent logs"
  on "public"."guardian_consent_log"
  as permissive
  for insert
  to public
with check ((guardian_id = auth.uid()));



  create policy "Guardians can view their consent logs"
  on "public"."guardian_consent_log"
  as permissive
  for select
  to public
using ((guardian_id = auth.uid()));



  create policy "Guardians can respond"
  on "public"."guardian_event_responses"
  as permissive
  for update
  to public
using ((auth.uid() = guardian_id))
with check ((auth.uid() = guardian_id));



  create policy "Guardians can view own responses"
  on "public"."guardian_event_responses"
  as permissive
  for select
  to public
using (((auth.uid() = guardian_id) OR (EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = guardian_event_responses.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "System can create guardian responses"
  on "public"."guardian_event_responses"
  as permissive
  for insert
  to public
with check (((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.profiles p ON ((p.club_id = e.club_id)))
  WHERE ((e.id = guardian_event_responses.event_id) AND (p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (auth.uid() = guardian_id)));



  create policy "Coaches can view guardian links for club players"
  on "public"."guardian_links"
  as permissive
  for select
  to public
using (((guardian_id = auth.uid()) OR public.is_coach_for_player_club(child_id)));



  create policy "Guardians can insert links for themselves"
  on "public"."guardian_links"
  as permissive
  for insert
  to public
with check ((guardian_id = auth.uid()));



  create policy "Guardians can update their own links"
  on "public"."guardian_links"
  as permissive
  for update
  to public
using ((guardian_id = auth.uid()));



  create policy "Guardians can view their own links"
  on "public"."guardian_links"
  as permissive
  for select
  to public
using ((guardian_id = auth.uid()));



  create policy "System can manage h2h stats"
  on "public"."head_to_head_stats"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "Users can view own h2h stats"
  on "public"."head_to_head_stats"
  as permissive
  for select
  to public
using (((auth.uid() = player_a_id) OR (auth.uid() = player_b_id)));



  create policy "Users can hide content"
  on "public"."hidden_content"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can unhide content"
  on "public"."hidden_content"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own hidden content"
  on "public"."hidden_content"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Coaches can create invitation codes"
  on "public"."invitation_codes"
  as permissive
  for insert
  to authenticated
with check (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = auth.uid()) AND (profile_club_sports.club_id = invitation_codes.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text])))))));



  create policy "Coaches can update invitation codes"
  on "public"."invitation_codes"
  as permissive
  for update
  to authenticated
using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = auth.uid()) AND (profile_club_sports.club_id = invitation_codes.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text])))))))
with check (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = auth.uid()) AND (profile_club_sports.club_id = invitation_codes.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text])))))));



  create policy "Coaches can view invitation codes"
  on "public"."invitation_codes"
  as permissive
  for select
  to authenticated
using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports
  WHERE ((profile_club_sports.user_id = auth.uid()) AND (profile_club_sports.club_id = invitation_codes.club_id) AND (profile_club_sports.role = ANY (ARRAY['coach'::text, 'head_coach'::text]))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role))))));



  create policy "invitation_codes_admin_all"
  on "public"."invitation_codes"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));



  create policy "invitation_codes_delete"
  on "public"."invitation_codes"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = invitation_codes.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "invitation_codes_insert"
  on "public"."invitation_codes"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = invitation_codes.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "invitation_codes_manage"
  on "public"."invitation_codes"
  as permissive
  for all
  to public
using ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "invitation_codes_public_select_by_code"
  on "public"."invitation_codes"
  as permissive
  for select
  to public
using (true);



  create policy "invitation_codes_select"
  on "public"."invitation_codes"
  as permissive
  for select
  to public
using (true);



  create policy "invitation_codes_update"
  on "public"."invitation_codes"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = invitation_codes.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Guardians can create leave requests for children"
  on "public"."leave_club_requests"
  as permissive
  for insert
  to public
with check ((player_id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid()))));



  create policy "Guardians can view child leave requests"
  on "public"."leave_club_requests"
  as permissive
  for select
  to public
using ((player_id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid()))));



  create policy "Guardians can withdraw child leave requests"
  on "public"."leave_club_requests"
  as permissive
  for delete
  to public
using (((status = 'pending'::public.request_status) AND (player_id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid())))));



  create policy "leave_requests_delete"
  on "public"."leave_club_requests"
  as permissive
  for delete
  to public
using (((player_id = auth.uid()) AND (status = 'pending'::public.request_status)));



  create policy "leave_requests_insert"
  on "public"."leave_club_requests"
  as permissive
  for insert
  to public
with check ((player_id = auth.uid()));



  create policy "leave_requests_select_coach"
  on "public"."leave_club_requests"
  as permissive
  for select
  to public
using ((club_id IN ( SELECT p.club_id
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "leave_requests_select_own"
  on "public"."leave_club_requests"
  as permissive
  for select
  to public
using ((player_id = auth.uid()));



  create policy "leave_requests_update_coach"
  on "public"."leave_club_requests"
  as permissive
  for update
  to public
using ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "Users can delete own media"
  on "public"."match_media"
  as permissive
  for delete
  to public
using ((auth.uid() = uploaded_by));



  create policy "Users can insert own media"
  on "public"."match_media"
  as permissive
  for insert
  to public
with check ((auth.uid() = uploaded_by));



  create policy "Users can view match media"
  on "public"."match_media"
  as permissive
  for select
  to public
using (true);



  create policy "match_proposals_delete"
  on "public"."match_proposals"
  as permissive
  for delete
  to public
using (((requester_id = auth.uid()) OR public.is_coach_or_admin()));



  create policy "match_proposals_insert"
  on "public"."match_proposals"
  as permissive
  for insert
  to public
with check ((requester_id = auth.uid()));



  create policy "match_proposals_select"
  on "public"."match_proposals"
  as permissive
  for select
  to public
using (((requester_id = ( SELECT auth.uid() AS uid)) OR (recipient_id = ( SELECT auth.uid() AS uid)) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "match_proposals_update"
  on "public"."match_proposals"
  as permissive
  for update
  to public
using (((requester_id = auth.uid()) OR (recipient_id = auth.uid())));



  create policy "match_requests_delete"
  on "public"."match_requests"
  as permissive
  for delete
  to public
using (((player_a_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = match_requests.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "match_requests_insert"
  on "public"."match_requests"
  as permissive
  for insert
  to public
with check ((player_a_id = ( SELECT auth.uid() AS uid)));



  create policy "match_requests_select"
  on "public"."match_requests"
  as permissive
  for select
  to public
using (((player_a_id = ( SELECT auth.uid() AS uid)) OR (player_b_id = ( SELECT auth.uid() AS uid)) OR (winner_id = ( SELECT auth.uid() AS uid)) OR (loser_id = ( SELECT auth.uid() AS uid)) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "match_requests_update"
  on "public"."match_requests"
  as permissive
  for update
  to public
using (((player_a_id = ( SELECT auth.uid() AS uid)) OR (player_b_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = match_requests.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "matches_delete"
  on "public"."matches"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = matches.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "matches_delete_coach"
  on "public"."matches"
  as permissive
  for delete
  to public
using ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "matches_guardian_select"
  on "public"."matches"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND ((guardian_links.child_id = matches.player_a_id) OR (guardian_links.child_id = matches.player_b_id))))));



  create policy "matches_insert"
  on "public"."matches"
  as permissive
  for insert
  to public
with check (((player_a_id = ( SELECT auth.uid() AS uid)) OR (player_b_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = matches.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "matches_insert_coach"
  on "public"."matches"
  as permissive
  for insert
  to public
with check ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "matches_select"
  on "public"."matches"
  as permissive
  for select
  to public
using (((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (player_a_id = ( SELECT auth.uid() AS uid)) OR (player_b_id = ( SELECT auth.uid() AS uid)) OR (winner_id = ( SELECT auth.uid() AS uid)) OR (loser_id = ( SELECT auth.uid() AS uid)) OR (club_id IS NULL)));



  create policy "matches_update"
  on "public"."matches"
  as permissive
  for update
  to public
using (((player_a_id = ( SELECT auth.uid() AS uid)) OR (player_b_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = matches.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "matches_update_coach"
  on "public"."matches"
  as permissive
  for update
  to public
using ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "ml_data_consent_insert"
  on "public"."ml_data_consent"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "ml_data_consent_select"
  on "public"."ml_data_consent"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "ml_data_consent_update"
  on "public"."ml_data_consent"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "notifications_delete"
  on "public"."notifications"
  as permissive
  for delete
  to public
using (((user_id = auth.uid()) OR (((data ->> 'player_id'::text))::uuid = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = notifications.user_id))))));



  create policy "notifications_insert"
  on "public"."notifications"
  as permissive
  for insert
  to public
with check ((auth.uid() IS NOT NULL));



  create policy "notifications_select"
  on "public"."notifications"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = notifications.user_id))))));



  create policy "notifications_update"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "points_history_insert"
  on "public"."points_history"
  as permissive
  for insert
  to public
with check ((auth.uid() IS NOT NULL));



  create policy "points_history_select"
  on "public"."points_history"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = points_history.user_id))))));



  create policy "Users can delete own votes"
  on "public"."poll_votes"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update own votes"
  on "public"."poll_votes"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can view poll votes"
  on "public"."poll_votes"
  as permissive
  for select
  to public
using (true);



  create policy "Users can vote on polls"
  on "public"."poll_votes"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can create comments"
  on "public"."post_comments"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete own comments"
  on "public"."post_comments"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can update own comments"
  on "public"."post_comments"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can view comments"
  on "public"."post_comments"
  as permissive
  for select
  to public
using ((((post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.community_posts
  WHERE ((community_posts.id = post_comments.post_id) AND (community_posts.deleted_at IS NULL))))) OR ((poll_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.community_polls
  WHERE ((community_polls.id = post_comments.poll_id) AND (community_polls.deleted_at IS NULL)))))));



  create policy "Users can like posts"
  on "public"."post_likes"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can unlike posts"
  on "public"."post_likes"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can view post likes"
  on "public"."post_likes"
  as permissive
  for select
  to public
using (true);



  create policy "profile_club_sports_delete_policy"
  on "public"."profile_club_sports"
  as permissive
  for delete
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports pcs
  WHERE ((pcs.user_id = auth.uid()) AND (pcs.club_id = profile_club_sports.club_id) AND (pcs.sport_id = profile_club_sports.sport_id) AND (pcs.role = 'head_coach'::text))))));



  create policy "profile_club_sports_insert_policy"
  on "public"."profile_club_sports"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports pcs
  WHERE ((pcs.user_id = auth.uid()) AND (pcs.club_id = profile_club_sports.club_id) AND (pcs.sport_id = profile_club_sports.sport_id) AND (pcs.role = 'head_coach'::text))))));



  create policy "profile_club_sports_select_policy"
  on "public"."profile_club_sports"
  as permissive
  for select
  to public
using (true);



  create policy "profile_club_sports_update_policy"
  on "public"."profile_club_sports"
  as permissive
  for update
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports pcs
  WHERE ((pcs.user_id = auth.uid()) AND (pcs.club_id = profile_club_sports.club_id) AND (pcs.sport_id = profile_club_sports.sport_id) AND (pcs.role = 'head_coach'::text))))));



  create policy "Guardians can update their children profiles"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (((guardian_links.permissions ->> 'can_edit_profile'::text))::boolean = true)))));



  create policy "Guardians can view their children profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((id IN ( SELECT guardian_links.child_id
   FROM public.guardian_links
  WHERE (guardian_links.guardian_id = auth.uid()))));



  create policy "Users can update own profile"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "Users can view all profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "profiles_insert_coach"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())));



  create policy "profiles_select"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((public.is_admin() OR (id = auth.uid()) OR ((club_id IS NOT NULL) AND (club_id = public.get_my_club_id())) OR public.can_coach_see_profile(id)));



  create policy "profiles_update_coach"
  on "public"."profiles"
  as permissive
  for update
  to public
using (((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())) OR (id = auth.uid())))
with check (((public.is_coach_or_admin() AND (club_id = public.get_my_club_id())) OR (id = auth.uid())));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id = auth.uid()))
with check ((id = auth.uid()));



  create policy "Service role can manage push logs"
  on "public"."push_notification_logs"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can view own push logs"
  on "public"."push_notification_logs"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can delete own push subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for delete
  to authenticated
using ((auth.uid() = user_id));



  create policy "Users can insert own push subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "Users can update own push subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can view own push subscriptions"
  on "public"."push_subscriptions"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "Coaches can manage club seasons"
  on "public"."seasons"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['head_coach'::public.user_role, 'admin'::public.user_role])) AND ((seasons.club_id = profiles.club_id) OR (seasons.club_id IS NULL))))));



  create policy "seasons_insert_policy"
  on "public"."seasons"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::public.user_role) OR (p.role = 'head_coach'::public.user_role)) AND ((p.club_id IS NULL) OR (p.club_id = p.club_id))))));



  create policy "seasons_select_policy"
  on "public"."seasons"
  as permissive
  for select
  to public
using (true);



  create policy "seasons_update_policy"
  on "public"."seasons"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::public.user_role) OR (p.role = 'head_coach'::public.user_role)) AND ((seasons.club_id IS NULL) OR (p.club_id = seasons.club_id))))));



  create policy "sports_select"
  on "public"."sports"
  as permissive
  for select
  to public
using (true);



  create policy "streaks_insert"
  on "public"."streaks"
  as permissive
  for insert
  to public
with check (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "streaks_manage"
  on "public"."streaks"
  as permissive
  for all
  to public
using (public.is_coach_or_admin());



  create policy "streaks_select"
  on "public"."streaks"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR public.is_coach_or_admin()));



  create policy "streaks_update"
  on "public"."streaks"
  as permissive
  for update
  to public
using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profiles target ON ((target.id = streaks.user_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.club_id = target.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "subgroup_members_delete"
  on "public"."subgroup_members"
  as permissive
  for delete
  to public
using ((subgroup_id IN ( SELECT subgroups.id
   FROM public.subgroups
  WHERE (subgroups.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))))));



  create policy "subgroup_members_insert"
  on "public"."subgroup_members"
  as permissive
  for insert
  to public
with check ((subgroup_id IN ( SELECT subgroups.id
   FROM public.subgroups
  WHERE (subgroups.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))))));



  create policy "subgroup_members_select"
  on "public"."subgroup_members"
  as permissive
  for select
  to public
using ((subgroup_id IN ( SELECT subgroups.id
   FROM public.subgroups
  WHERE (subgroups.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));



  create policy "subgroup_members_update"
  on "public"."subgroup_members"
  as permissive
  for update
  to public
using ((subgroup_id IN ( SELECT subgroups.id
   FROM public.subgroups
  WHERE (subgroups.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))))));



  create policy "subgroups_delete"
  on "public"."subgroups"
  as permissive
  for delete
  to public
using ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "subgroups_insert"
  on "public"."subgroups"
  as permissive
  for insert
  to public
with check ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "subgroups_select"
  on "public"."subgroups"
  as permissive
  for select
  to public
using ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));



  create policy "subgroups_update"
  on "public"."subgroups"
  as permissive
  for update
  to public
using ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Creators can delete tournament matches"
  on "public"."tournament_matches"
  as permissive
  for delete
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.created_by = auth.uid()) OR (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])))))))));



  create policy "System can create tournament matches"
  on "public"."tournament_matches"
  as permissive
  for insert
  to public
with check ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.created_by = auth.uid()) OR (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])))))))));



  create policy "System can update tournament matches"
  on "public"."tournament_matches"
  as permissive
  for update
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.is_club_only = false) OR ((tournaments.is_club_only = true) AND (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))));



  create policy "Users can view tournament matches"
  on "public"."tournament_matches"
  as permissive
  for select
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.is_club_only = false) OR ((tournaments.is_club_only = true) AND (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))));



  create policy "Coaches can update tournament participants"
  on "public"."tournament_participants"
  as permissive
  for update
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.created_by = auth.uid()) OR (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])))))))));



  create policy "Users can join tournaments"
  on "public"."tournament_participants"
  as permissive
  for insert
  to public
with check ((((player_id = auth.uid()) AND (tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.status = 'registration'::public.tournament_status) AND ((tournaments.is_club_only = false) OR ((tournaments.is_club_only = true) AND (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id IN ( SELECT tournaments.club_id
           FROM public.tournaments
          WHERE (tournaments.id = tournament_participants.tournament_id))))))));



  create policy "Users can leave tournaments"
  on "public"."tournament_participants"
  as permissive
  for delete
  to public
using ((((player_id = auth.uid()) AND (tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.status = 'registration'::public.tournament_status)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id IN ( SELECT tournaments.club_id
           FROM public.tournaments
          WHERE (tournaments.id = tournament_participants.tournament_id)))))) OR (tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.created_by = auth.uid())))));



  create policy "Users can view tournament participants"
  on "public"."tournament_participants"
  as permissive
  for select
  to public
using ((tournament_id IN ( SELECT t.id
   FROM public.tournaments t
  WHERE ((t.is_club_only = false) OR ((t.is_club_only = true) AND (auth.uid() IS NOT NULL) AND (t.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))));



  create policy "Coaches can manage tournament rounds"
  on "public"."tournament_rounds"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id IN ( SELECT tournaments.club_id
           FROM public.tournaments
          WHERE (tournaments.id = tournament_rounds.tournament_id)))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])) AND (profiles.club_id IN ( SELECT tournaments.club_id
           FROM public.tournaments
          WHERE (tournaments.id = tournament_rounds.tournament_id)))))));



  create policy "Tournament creators can manage rounds"
  on "public"."tournament_rounds"
  as permissive
  for all
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.created_by = auth.uid()))))
with check ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.created_by = auth.uid()))));



  create policy "Users can view tournament rounds"
  on "public"."tournament_rounds"
  as permissive
  for select
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.is_club_only = false) OR ((tournaments.is_club_only = true) AND (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))));



  create policy "Creators can delete tournament standings"
  on "public"."tournament_standings"
  as permissive
  for delete
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.created_by = auth.uid()) OR (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])))))))));



  create policy "System can create tournament standings"
  on "public"."tournament_standings"
  as permissive
  for insert
  to public
with check ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments)));



  create policy "System can update tournament standings"
  on "public"."tournament_standings"
  as permissive
  for update
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments)));



  create policy "Users can view tournament standings"
  on "public"."tournament_standings"
  as permissive
  for select
  to public
using ((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE ((tournaments.is_club_only = false) OR ((tournaments.is_club_only = true) AND (tournaments.club_id IN ( SELECT profiles.club_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))));



  create policy "Tournament creators and coaches can delete"
  on "public"."tournaments"
  as permissive
  for delete
  to public
using (((created_by = auth.uid()) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "Tournament creators and coaches can update"
  on "public"."tournaments"
  as permissive
  for update
  to public
using (((created_by = auth.uid()) OR (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "Users can create tournaments"
  on "public"."tournaments"
  as permissive
  for insert
  to public
with check ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Users can view tournaments"
  on "public"."tournaments"
  as permissive
  for select
  to public
using (((is_club_only = false) OR ((is_club_only = true) AND (club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))))));



  create policy "training_sessions_delete"
  on "public"."training_sessions"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = training_sessions.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "training_sessions_insert"
  on "public"."training_sessions"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = training_sessions.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "training_sessions_select"
  on "public"."training_sessions"
  as permissive
  for select
  to public
using ((club_id IN ( SELECT profiles.club_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));



  create policy "training_sessions_update"
  on "public"."training_sessions"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.club_id = training_sessions.club_id) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "Users can create blocks"
  on "public"."user_blocks"
  as permissive
  for insert
  to public
with check ((blocker_id = auth.uid()));



  create policy "Users can delete their own blocks"
  on "public"."user_blocks"
  as permissive
  for delete
  to public
using ((blocker_id = auth.uid()));



  create policy "Users can view their own blocks"
  on "public"."user_blocks"
  as permissive
  for select
  to public
using ((blocker_id = auth.uid()));



  create policy "Users can delete own preferences"
  on "public"."user_preferences"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert own preferences"
  on "public"."user_preferences"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own preferences"
  on "public"."user_preferences"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can view own preferences"
  on "public"."user_preferences"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "user_season_points_insert_policy"
  on "public"."user_season_points"
  as permissive
  for insert
  to public
with check (true);



  create policy "user_season_points_select_policy"
  on "public"."user_season_points"
  as permissive
  for select
  to public
using (true);



  create policy "user_season_points_update_policy"
  on "public"."user_season_points"
  as permissive
  for update
  to public
using (true);



  create policy "user_sport_stats_insert_policy"
  on "public"."user_sport_stats"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "user_sport_stats_select_policy"
  on "public"."user_sport_stats"
  as permissive
  for select
  to public
using (true);



  create policy "user_sport_stats_update_policy"
  on "public"."user_sport_stats"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profile_club_sports pcs
  WHERE ((pcs.user_id = auth.uid()) AND (pcs.role = ANY (ARRAY['coach'::text, 'head_coach'::text])) AND (pcs.club_id IN ( SELECT profile_club_sports.club_id
           FROM public.profile_club_sports
          WHERE ((profile_club_sports.user_id = user_sport_stats.user_id) AND (profile_club_sports.sport_id = user_sport_stats.sport_id)))))))));



  create policy "video_ai_analyses_insert"
  on "public"."video_ai_analyses"
  as permissive
  for insert
  to public
with check (((auth.uid() = created_by) AND ((EXISTS ( SELECT 1
   FROM public.video_analyses va
  WHERE ((va.id = video_ai_analyses.video_id) AND (va.uploaded_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.video_analyses va
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((va.id = video_ai_analyses.video_id) AND (p.club_id = va.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))))));



  create policy "video_ai_analyses_select"
  on "public"."video_ai_analyses"
  as permissive
  for select
  to public
using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.video_analyses va
  WHERE ((va.id = video_ai_analyses.video_id) AND (va.uploaded_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.video_analyses va
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((va.id = video_ai_analyses.video_id) AND (p.club_id = va.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "video_ai_analyses_update"
  on "public"."video_ai_analyses"
  as permissive
  for update
  to public
using ((created_by = auth.uid()));



  create policy "Users create ai frames"
  on "public"."video_ai_frames"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.video_ai_analyses vaa
  WHERE ((vaa.id = video_ai_frames.analysis_id) AND (vaa.created_by = auth.uid())))));



  create policy "Users see ai frames via analysis"
  on "public"."video_ai_frames"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.video_ai_analyses vaa
  WHERE (vaa.id = video_ai_frames.analysis_id))));



  create policy "video_analyses_delete"
  on "public"."video_analyses"
  as permissive
  for delete
  to public
using (((uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_analyses.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "video_analyses_insert"
  on "public"."video_analyses"
  as permissive
  for insert
  to public
with check (((auth.uid() = uploaded_by) AND (((club_id IS NULL) AND (( SELECT p.club_id
   FROM public.profiles p
  WHERE (p.id = auth.uid())) IS NULL)) OR ((club_id IS NULL) AND (( SELECT p.club_id
   FROM public.profiles p
  WHERE (p.id = auth.uid())) IS NOT NULL)) OR (club_id = ( SELECT p.club_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))))));



  create policy "video_analyses_select"
  on "public"."video_analyses"
  as permissive
  for select
  to public
using (((uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.video_assignments va
  WHERE ((va.video_id = va.id) AND (va.player_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_analyses.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))) OR ((allow_ai_training = true) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'labeler'::public.user_role))))) OR ((allow_ai_training = true) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.user_role)))))));



  create policy "video_analyses_update"
  on "public"."video_analyses"
  as permissive
  for update
  to public
using (((uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_analyses.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))) OR ((allow_ai_training = true) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'labeler'::public.user_role))))) OR ((allow_ai_training = true) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.user_role)))))));



  create policy "video_assignments_delete"
  on "public"."video_assignments"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_assignments.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "video_assignments_insert"
  on "public"."video_assignments"
  as permissive
  for insert
  to public
with check ((club_id = ( SELECT p.club_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))));



  create policy "video_assignments_select"
  on "public"."video_assignments"
  as permissive
  for select
  to public
using (((player_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_assignments.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "video_assignments_update"
  on "public"."video_assignments"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_assignments.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))));



  create policy "video_comments_delete"
  on "public"."video_comments"
  as permissive
  for delete
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.club_id = video_comments.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "video_comments_insert"
  on "public"."video_comments"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) AND (club_id = ( SELECT p.club_id
   FROM public.profiles p
  WHERE (p.id = auth.uid())))));



  create policy "video_comments_select"
  on "public"."video_comments"
  as permissive
  for select
  to public
using (((EXISTS ( SELECT 1
   FROM public.video_analyses va
  WHERE ((va.id = video_comments.video_id) AND (va.uploaded_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.video_assignments vas
  WHERE ((vas.video_id = video_comments.video_id) AND (vas.player_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.video_analyses va
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((va.id = video_comments.video_id) AND (va.club_id = p.club_id) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'admin'::public.user_role, 'head_coach'::public.user_role]))))) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.video_analyses va
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((va.id = video_comments.video_id) AND (va.allow_ai_training = true) AND (p.role = 'labeler'::public.user_role))))));



  create policy "video_comments_update"
  on "public"."video_comments"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "video_labels_delete"
  on "public"."video_labels"
  as permissive
  for delete
  to public
using (((labeled_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'coach'::public.user_role, 'head_coach'::public.user_role])))))));



  create policy "video_labels_insert"
  on "public"."video_labels"
  as permissive
  for insert
  to public
with check (((labeled_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'coach'::public.user_role, 'head_coach'::public.user_role, 'labeler'::public.user_role])))))));



  create policy "video_labels_select"
  on "public"."video_labels"
  as permissive
  for select
  to public
using (((labeled_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'coach'::public.user_role, 'head_coach'::public.user_role, 'labeler'::public.user_role])))))));



  create policy "video_labels_update"
  on "public"."video_labels"
  as permissive
  for update
  to public
using (((labeled_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.user_role))))));



  create policy "video_ml_metadata_insert"
  on "public"."video_ml_metadata"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "video_ml_metadata_select"
  on "public"."video_ml_metadata"
  as permissive
  for select
  to public
using (true);



  create policy "video_ml_metadata_update"
  on "public"."video_ml_metadata"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "video_rally_segments_delete"
  on "public"."video_rally_segments"
  as permissive
  for delete
  to public
using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::public.user_role))))));



  create policy "video_rally_segments_insert"
  on "public"."video_rally_segments"
  as permissive
  for insert
  to public
with check (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "video_rally_segments_select"
  on "public"."video_rally_segments"
  as permissive
  for select
  to public
using (true);



  create policy "video_rally_segments_update"
  on "public"."video_rally_segments"
  as permissive
  for update
  to public
using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role])))))));



  create policy "xp_history_insert"
  on "public"."xp_history"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))));



  create policy "xp_history_select"
  on "public"."xp_history"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['coach'::public.user_role, 'head_coach'::public.user_role, 'admin'::public.user_role]))))) OR (EXISTS ( SELECT 1
   FROM public.guardian_links
  WHERE ((guardian_links.guardian_id = auth.uid()) AND (guardian_links.child_id = xp_history.user_id))))));


CREATE TRIGGER activity_comments_updated_at BEFORE UPDATE ON public.activity_comments FOR EACH ROW EXECUTE FUNCTION public.update_activity_comment_updated_at();

CREATE TRIGGER trigger_update_attendance_streak AFTER INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_attendance_streak();

CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_update_conversation_on_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

CREATE TRIGGER trigger_chat_push_notification AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.send_chat_push_notification();

CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_notify_coaches_on_report AFTER INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.notify_coaches_on_report();

CREATE TRIGGER update_content_reports_updated_at BEFORE UPDATE ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER process_approved_doubles_request_trigger AFTER UPDATE ON public.doubles_match_requests FOR EACH ROW EXECUTE FUNCTION public.process_approved_doubles_request();

CREATE TRIGGER trigger_process_approved_doubles_request AFTER UPDATE ON public.doubles_match_requests FOR EACH ROW EXECUTE FUNCTION public.process_approved_doubles_match_request();

CREATE TRIGGER trigger_process_doubles_match BEFORE INSERT ON public.doubles_matches FOR EACH ROW EXECUTE FUNCTION public.process_doubles_match_result();

CREATE TRIGGER trigger_doubles_pairing_ranking_events AFTER UPDATE OF current_elo_rating ON public.doubles_pairings FOR EACH ROW EXECUTE FUNCTION public.create_doubles_pairing_ranking_events();

CREATE TRIGGER trigger_promote_from_waitlist AFTER UPDATE ON public.event_invitations FOR EACH ROW EXECUTE FUNCTION public.promote_from_waitlist();

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_friendships_updated_at BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_auto_create_club_invitation BEFORE INSERT ON public.invitation_codes FOR EACH ROW EXECUTE FUNCTION public.auto_create_club_on_invitation();

CREATE TRIGGER trigger_process_match_elo BEFORE INSERT OR UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.process_match_elo();

CREATE TRIGGER trigger_process_match_result BEFORE INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.process_match_result();

CREATE TRIGGER trigger_update_h2h_stats AFTER INSERT ON public.matches FOR EACH ROW WHEN ((new.processed = true)) EXECUTE FUNCTION public.update_head_to_head_stats();

CREATE TRIGGER trigger_update_matches_played AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_matches_played();

CREATE TRIGGER trigger_forward_notification_to_guardians AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.forward_notification_to_guardians();

CREATE TRIGGER trigger_queue_push_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.queue_push_notification();

CREATE TRIGGER trigger_send_push_notification_instant AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.send_push_notification_instant();

CREATE TRIGGER trigger_decrement_poll_votes AFTER DELETE ON public.poll_votes FOR EACH ROW EXECUTE FUNCTION public.decrement_poll_votes();

CREATE TRIGGER trigger_increment_poll_votes AFTER INSERT ON public.poll_votes FOR EACH ROW EXECUTE FUNCTION public.increment_poll_votes();

CREATE TRIGGER trigger_decrement_post_likes AFTER DELETE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.decrement_post_likes();

CREATE TRIGGER trigger_increment_post_likes AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.increment_post_likes();

CREATE TRIGGER enforce_single_coach_sport BEFORE INSERT OR UPDATE ON public.profile_club_sports FOR EACH ROW EXECUTE FUNCTION public.check_single_coach_sport();

CREATE TRIGGER update_profile_club_sports_updated_at BEFORE UPDATE ON public.profile_club_sports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER sync_season_points_trigger AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_season_points_on_profile_update();

CREATE TRIGGER trigger_cleanup_guardian_links AFTER UPDATE OF email ON public.profiles FOR EACH ROW WHEN ((new.email ~~ 'deleted_%@anonymous.local'::text)) EXECUTE FUNCTION public.cleanup_guardian_links_on_delete();

CREATE TRIGGER trigger_club_join_event AFTER UPDATE OF club_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_club_join_event();

CREATE TRIGGER trigger_ranking_change_events AFTER UPDATE OF elo_rating ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_ranking_change_events();

CREATE TRIGGER trigger_update_age_mode BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_age_mode();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_push_subscription_timestamp BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_push_subscription_timestamp();

CREATE TRIGGER enforce_single_active_season BEFORE INSERT OR UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.ensure_single_active_season();

CREATE TRIGGER update_sports_updated_at BEFORE UPDATE ON public.sports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_subgroups_updated_at BEFORE UPDATE ON public.subgroups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_tournament_match_counts AFTER INSERT OR DELETE OR UPDATE ON public.tournament_matches FOR EACH ROW EXECUTE FUNCTION public.update_tournament_match_count();

CREATE TRIGGER tournament_participant_count_delete AFTER DELETE ON public.tournament_participants FOR EACH ROW EXECUTE FUNCTION public.update_tournament_participant_count();

CREATE TRIGGER tournament_participant_count_insert AFTER INSERT ON public.tournament_participants FOR EACH ROW EXECUTE FUNCTION public.update_tournament_participant_count();

CREATE TRIGGER update_tournament_standings_updated_at BEFORE UPDATE ON public.tournament_standings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.update_user_preferences_updated_at();

CREATE TRIGGER update_user_season_points_timestamp BEFORE UPDATE ON public.user_season_points FOR EACH ROW EXECUTE FUNCTION public.update_user_season_points_updated_at();

CREATE TRIGGER sync_season_sport_points_trigger AFTER UPDATE ON public.user_sport_stats FOR EACH ROW EXECUTE FUNCTION public.sync_season_points_on_sport_stats_update();

CREATE TRIGGER update_user_sport_stats_timestamp BEFORE UPDATE ON public.user_sport_stats FOR EACH ROW EXECUTE FUNCTION public.update_user_sport_stats_updated_at();

CREATE TRIGGER trigger_video_ai_analyses_updated_at BEFORE UPDATE ON public.video_ai_analyses FOR EACH ROW EXECUTE FUNCTION public.update_video_ai_analyses_updated_at();

CREATE TRIGGER update_video_analyses_updated_at BEFORE UPDATE ON public.video_analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_video_comments_updated_at BEFORE UPDATE ON public.video_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_video_labels_updated_at BEFORE UPDATE ON public.video_labels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_video_ml_metadata_updated_at BEFORE UPDATE ON public.video_ml_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


