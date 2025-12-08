/**
 * FAQ Page Module (Supabase Version)
 * Handles back link navigation based on user role
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from './supabase-config.js';

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const backLink = document.getElementById('back-link');

// Check authentication state and set back link
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        // User is logged in - set back link based on role
        const { data: userData, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        if (!error && userData) {
            const { role } = userData;
            if (role === 'admin') backLink.href = '/admin.html';
            else if (role === 'coach' || role === 'head_coach') backLink.href = '/coach.html';
            else backLink.href = '/dashboard.html';
        } else {
            // User exists but no profile - go to index
            backLink.href = '/index.html';
        }
    } else {
        // User is not logged in - FAQ is publicly accessible, link back to index
        backLink.href = '/index.html';
    }
});
