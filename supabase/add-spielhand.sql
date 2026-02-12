-- Spielhand (Schlaghand) zum Profil hinzufügen
-- Mögliche Werte: 'right' (Rechtshänder), 'left' (Linkshänder)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spielhand TEXT DEFAULT NULL;

-- Kommentar zur Dokumentation
COMMENT ON COLUMN profiles.spielhand IS 'Schlaghand des Spielers: right = Rechtshänder, left = Linkshänder';
