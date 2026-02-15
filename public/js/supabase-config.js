// Supabase-Konfiguration
// Automatically uses local Supabase when running on localhost (via `just dev`)

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const supabaseConfig = isLocal
    ? {
          url: 'http://127.0.0.1:54321',
          anonKey:
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      }
    : {
          url: 'https://wmrbjuyqgbmvtzrujuxs.supabase.co',
          anonKey:
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NzkzMzksImV4cCI6MjA4MDI1NTMzOX0.pLAfrsmS8A9FEByMTiMyO4dN-agHd6_aCJuKS9Sn9vw',
      };
