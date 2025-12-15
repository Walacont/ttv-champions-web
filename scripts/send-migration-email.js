/**
 * Send Migration Email to All Users
 *
 * This script sends an email to all users informing them about the
 * system migration and asking them to reset their password.
 *
 * Setup:
 * 1. Sign up at https://resend.com
 * 2. Create an API key
 * 3. Verify your domain (or use onboarding@resend.dev for testing)
 * 4. Set RESEND_API_KEY environment variable
 *
 * Usage:
 * RESEND_API_KEY=re_xxxx node scripts/send-migration-email.js
 *
 * Options:
 * --dry-run    Only show who would receive emails (no actual sending)
 * --test       Send only to test email address
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

// Email configuration
const FROM_EMAIL = 'SC Champions <noreply@sc-champions.de>'; 
const REPLY_TO = 'support@sc-champions.de'; 
const APP_URL = 'https://sc-champions.de';

// Test configuration
const TEST_EMAIL = 'your-test-email@example.com'; 

// ============================================
// Initialize clients
// ============================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================
// Email Template
// ============================================

function generateEmailHtml(firstName) {
    const name = firstName || 'Spieler';

    return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SC Champions - Systemaktualisierung</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px 40px; border-radius: 12px 12px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                                🏆 SC Champions
                            </h1>
                            <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">
                                Systemaktualisierung
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 22px;">
                                Hallo ${name}! 👋
                            </h2>

                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Wir haben <strong>SC Champions</strong> auf ein neues, verbessertes System umgestellt,
                                um dir ein noch besseres Erlebnis zu bieten.
                            </p>

                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                                <p style="margin: 0; color: #92400e; font-size: 15px;">
                                    <strong>⚠️ Wichtig:</strong> Aus Sicherheitsgründen musst du dein Passwort
                                    einmalig zurücksetzen, um dich wieder anzumelden.
                                </p>
                            </div>

                            <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px;">
                                So geht's:
                            </h3>

                            <ol style="margin: 0 0 20px 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                                <li>Gehe zu <a href="${APP_URL}" style="color: #4f46e5; text-decoration: none;">${APP_URL}</a></li>
                                <li>Klicke auf <strong>"Passwort vergessen"</strong></li>
                                <li>Gib deine E-Mail-Adresse ein</li>
                                <li>Du erhältst einen Link zum Zurücksetzen</li>
                            </ol>

                            <p style="margin: 0 0 30px 0; font-size: 13px; color: #6b7280; background-color: #f9fafb; padding: 10px; border-radius: 6px; border: 1px dashed #d1d5db;">
                                <strong>💡 Tipp:</strong> Falls die Seite nicht korrekt angezeigt wird, leere bitte deinen <strong>Browser-Cache</strong> oder lade die Seite neu.
                            </p>

                            <table role="presentation" style="margin: 30px 0;">
                                <tr>
                                    <td>
                                        <a href="${APP_URL}"
                                           style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                                                  color: #ffffff; text-decoration: none; padding: 14px 32px;
                                                  border-radius: 8px; font-weight: bold; font-size: 16px;
                                                  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
                                            Jetzt Passwort zurücksetzen →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <div style="background-color: #ecfdf5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
                                <p style="margin: 0; color: #065f46; font-size: 15px;">
                                    <strong>✅ Gute Nachricht:</strong> Deine Daten (Punkte, Matches, Ränge)
                                    sind vollständig erhalten geblieben!
                                </p>
                            </div>

                            <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px;">
                                🆕 Was ist neu?
                            </h3>

                            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                                <li><strong>Neues Elo-System:</strong> Erwachsene (Ü18) starten jetzt mit 1000 Elo, Jugendliche mit 800 Elo</li>
                                <li><strong>A-Faktor:</strong> Neue Spieler haben einen höheren Multiplikator für schnelleres Einpendeln</li>
                                <li><strong>Faires Handicap:</strong> Bei großen Elo-Unterschieden gibt es automatische Handicap-Vorschläge</li>
                                <li><strong>Verbessertes Head-to-Head:</strong> Das Handicap wird jetzt graduell angepasst</li>
                            </ul>

                            <div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                                <h4 style="margin: 0 0 10px 0; color: #1f2937; font-size: 16px;">
                                    🚧 Testphase & Feedback
                                </h4>
                                <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                                    SC Champions befindet sich noch in der <strong>Testphase</strong>. 
                                    Wenn du Bugs findest oder Feedback hast, schreib uns gerne:
                                </p>
                                <p style="margin: 10px 0 0 0; font-size: 14px;">
                                    📱 <strong>WhatsApp:</strong> <a href="https://wa.me/4971923874" style="color: #4f46e5; text-decoration: none;">+49 7192 3874</a><br>
                                    📧 <strong>E-Mail:</strong> <a href="mailto:noreply@sc-champions.de" style="color: #4f46e5; text-decoration: none;">noreply@sc-champions.de</a>
                                </p>
                            </div>

                            <p style="margin: 30px 0 0 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
                                Bei Fragen kannst du auch direkt auf diese E-Mail antworten.
                            </p>

                            <p style="margin: 20px 0 0 0; color: #1f2937; font-size: 15px;">
                                Sportliche Grüße,<br>
                                <strong>Tommy Wang</strong>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="background-color: #f9fafb; padding: 24px 40px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #6b7280; font-size: 13px; text-align: center;">
                                © ${new Date().getFullYear()} SC Champions - Das Gamification-System für Sportvereine
                            </p>
                            <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                Du erhältst diese E-Mail, weil du ein Konto bei SC Champions hast.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

function generateEmailText(firstName) {
    const name = firstName || 'Spieler';

    return `
Hallo ${name}!

Wir haben SC Champions auf ein neues, verbessertes System umgestellt, um dir ein noch besseres Erlebnis zu bieten.

WICHTIG: Aus Sicherheitsgründen musst du dein Passwort einmalig zurücksetzen, um dich wieder anzumelden.

So geht's:
1. Gehe zu ${APP_URL}
2. Klicke auf "Passwort vergessen"
3. Gib deine E-Mail-Adresse ein
4. Du erhältst einen Link zum Zurücksetzen

TIPP: Falls die Seite nicht korrekt angezeigt wird, leere bitte deinen Browser-Cache oder lade die Seite neu.

Gute Nachricht: Deine Daten (Punkte, Elo, Matches, Ränge) sind vollständig erhalten geblieben!

WAS IST NEU?
- Neues Elo-System: Erwachsene (Ü18) starten jetzt mit 1000 Elo, Jugendliche mit 800 Elo
- A-Faktor: Neue Spieler haben einen höheren Multiplikator für schnelleres Einpendeln
- Faires Handicap: Bei großen Elo-Unterschieden gibt es automatische Handicap-Vorschläge
- Verbessertes Head-to-Head: Das Handicap wird jetzt graduell angepasst
- Neue Startseite
- Spieler abonnieren
- Videos/Fotos zu Matches hinzufügen
- Beiträge hochladen

---
TESTPHASE & FEEDBACK
SC Champions befindet sich noch in der Testphase. Wenn du Probleme/Bugs findest oder Feedback geben möchtest, kannst du uns gerne schreiben:
WhatsApp: +49 7192 3874
E-Mail: noreply@sc-champions.de
---

Bei Fragen kannst du auf diese E-Mail antworten.

Sportliche Grüße,
Tommy Wang

---
© ${new Date().getFullYear()} SC Champions - Das Gamification-System für Sportvereine
    `.trim();
}

// ============================================
// Main Functions
// ============================================

async function fetchUsers() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, first_name')
        .not('email', 'is', null)
        .not('email', 'eq', '')
        .not('email', 'ilike', '%@offline.local')
        .order('display_name');

    if (error) {
        throw new Error(`Failed to fetch users: ${error.message}`);
    }

    return data || [];
}

async function sendEmail(user) {
    const firstName = user.first_name || user.display_name?.split(' ')[0] || null;

    const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        reply_to: REPLY_TO,
        subject: '🏆 SC Champions - Systemaktualisierung: Bitte Passwort zurücksetzen',
        html: generateEmailHtml(firstName),
        text: generateEmailText(firstName),
    });

    if (error) {
        throw error;
    }

    return data;
}

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isTest = args.includes('--test');

    console.log('');
    console.log('========================================');
    console.log('  SC Champions - Migration Email Tool');
    console.log('========================================');
    console.log('');

    // Check API key
    if (!process.env.RESEND_API_KEY && !isDryRun) {
        console.error('❌ Error: RESEND_API_KEY environment variable is not set');
        console.log('');
        console.log('Usage:');
        console.log('  RESEND_API_KEY=re_xxxx node scripts/send-migration-email.js');
        console.log('  RESEND_API_KEY=re_xxxx node scripts/send-migration-email.js --dry-run');
        console.log('  RESEND_API_KEY=re_xxxx node scripts/send-migration-email.js --test');
        console.log('');
        process.exit(1);
    }

    // Fetch users
    console.log('📧 Fetching users from database...');
    const users = await fetchUsers();
    console.log(`   Found ${users.length} users with valid emails`);
    console.log('');

    if (isDryRun) {
        console.log('🔍 DRY RUN - No emails will be sent');
        console.log('');
        console.log('Users who would receive emails:');
        console.log('─'.repeat(60));
        users.forEach((user, i) => {
            console.log(`${(i + 1).toString().padStart(3)}. ${user.email.padEnd(35)} ${user.display_name || user.first_name || 'N/A'}`);
        });
        console.log('─'.repeat(60));
        console.log(`Total: ${users.length} users`);
        console.log('');
        console.log('To send emails, run without --dry-run flag');
        return;
    }

    if (isTest) {
        console.log('🧪 TEST MODE - Sending only to test email');
        console.log(`   Test email: ${TEST_EMAIL}`);
        console.log('');

        try {
            const result = await sendEmail({
                email: TEST_EMAIL,
                first_name: 'Test',
                display_name: 'Test User'
            });
            console.log(`✅ Test email sent successfully! ID: ${result.id}`);
        } catch (error) {
            console.error(`❌ Failed to send test email: ${error.message}`);
        }
        return;
    }

    // Send emails to all users
    console.log('📤 Sending emails...');
    console.log('');

    let successCount = 0;
    let failCount = 0;
    const failures = [];

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const progress = `[${(i + 1).toString().padStart(3)}/${users.length}]`;

        try {
            await sendEmail(user);
            successCount++;
            console.log(`${progress} ✅ ${user.email}`);

            // Rate limiting: wait 100ms between emails to avoid hitting limits
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            failCount++;
            failures.push({ email: user.email, error: error.message });
            console.log(`${progress} ❌ ${user.email} - ${error.message}`);
        }
    }

    // Summary
    console.log('');
    console.log('========================================');
    console.log('  Summary');
    console.log('========================================');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed:     ${failCount}`);
    console.log(`  📊 Total:      ${users.length}`);
    console.log('');

    if (failures.length > 0) {
        console.log('Failed emails:');
        failures.forEach(f => console.log(`  - ${f.email}: ${f.error}`));
    }

    console.log('');
    console.log('✨ Done!');
}

// Run
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});