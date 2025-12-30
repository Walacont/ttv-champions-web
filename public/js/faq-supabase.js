// FAQ-Seite (Supabase-Version)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from './supabase-config.js';

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const backLink = document.getElementById('back-link');

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
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
            backLink.href = '/index.html';
        }
    } else {
        backLink.href = '/index.html';
    }
});
