-- Fix: Remove duplicate trigger for doubles match requests
-- There were TWO triggers that both created matches when a request was approved:
-- 1. trigger_process_approved_doubles_request (from functions.sql)
-- 2. process_approved_doubles_request_trigger (from doubles-policies.sql)
-- This caused doubles matches to be created twice.

-- Drop the duplicate trigger from functions.sql
DROP TRIGGER IF EXISTS trigger_process_approved_doubles_request ON doubles_match_requests;

-- Keep the one from doubles-policies.sql:
-- process_approved_doubles_request_trigger
-- which executes process_approved_doubles_request()

-- Verify only one trigger exists:
-- SELECT * FROM pg_trigger WHERE tgrelid = 'doubles_match_requests'::regclass;
