-- Spielhand (Schlaghand) zum Profil hinzufügen
-- Nur 'right' oder 'left' erlaubt, NULL = nicht angegeben
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spielhand TEXT DEFAULT NULL;

-- CHECK-Constraint: nur gültige Werte erlauben
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_spielhand_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_spielhand_check
    CHECK (spielhand IS NULL OR spielhand IN ('right', 'left'));

COMMENT ON COLUMN profiles.spielhand IS 'Schlaghand des Spielers: right = Rechtshänder, left = Linkshänder';
