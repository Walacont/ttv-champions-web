/**
 * Retry failed migration emails
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

const FROM_EMAIL = 'SC Champions <noreply@sc-champions.de>';
const REPLY_TO = 'support@sc-champions.de';
const APP_URL = 'https://sc-champions.de';

// Failed emails from first run
const FAILED_EMAILS = [
    'ak.meta310@gmail.com',
    'ch.weyer@onlinehome.de',
    'daniel.caschube@gmx.de',
    'chillgurke@googlemail.com',
    'syllwasschy.scott.finlay@gmail.com',
    'marsvolta1289@gmail.com',
    'vuvanha@gmx.de',
    'hbfischmann@gmail.com',
    'b.malik@live.de',
    'jan-philipp_arp@gmx.de',
    'larsgrages@gmail.com',
    'lasse.leonie.treu@gmail.com',
    'm.kobow@web.de',
    'lilly@sonnenburg.name',
    'm.kobow@wib.de',
    'dongmao1412@gmail.com',
    'marvinhr.qin@gmail.com',
    'sanni_ii22@gmx.net',
    'patrickschlueer@web.de',
    'steffihildebrand@gmx.de',
    'sascha.lade@gmx.de',
    'shi.hng2@gmail.com',
    'sven.dwinger@wtnet.de',
    'aqua-rius@web.de',
    't.rick1@web.de',
    't-j.m@gmx.de',
    'schwarz_tobias@icloud.com',
    'torsten.caschube@gmx.de',
    'vporebski@wtnet.de'
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const resend = new Resend(process.env.RESEND_API_KEY);

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
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🏆 SC Champions</h1>
                            <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">Systemaktualisierung</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 22px;">Hallo ${name}! 👋</h2>
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
                            <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px;">So geht's:</h3>
                            <ol style="margin: 0 0 30px 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                                <li>Gehe zu <a href="${APP_URL}" style="color: #4f46e5; text-decoration: none;">${APP_URL}</a></li>
                                <li>Klicke auf <strong>"Passwort vergessen"</strong></li>
                                <li>Gib deine E-Mail-Adresse ein</li>
                                <li>Du erhältst einen Link zum Zurücksetzen</li>
                            </ol>
                            <table role="presentation" style="margin: 30px 0;">
                                <tr>
                                    <td>
                                        <a href="${APP_URL}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
                                            Jetzt Passwort zurücksetzen →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <div style="background-color: #ecfdf5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
                                <p style="margin: 0; color: #065f46; font-size: 15px;">
                                    <strong>✅ Gute Nachricht:</strong> Deine Daten (Punkte, Matches, Ränge) sind vollständig erhalten geblieben!
                                </p>
                            </div>
                            <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px;">🆕 Was ist neu?</h3>
                            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                                <li><strong>Neues Elo-System:</strong> Erwachsene (Ü18) starten jetzt mit 1000 Elo, Jugendliche mit 800 Elo</li>
                                <li><strong>A-Faktor:</strong> Neue Spieler haben einen höheren Multiplikator für schnelleres Einpendeln</li>
                                <li><strong>Faires Handicap:</strong> Bei großen Elo-Unterschieden gibt es automatische Handicap-Vorschläge</li>
                                <li><strong>Verbessertes Head-to-Head:</strong> Das Handicap wird jetzt graduell angepasst</li>
                            </ul>
                            <p style="margin: 30px 0 0 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
                                Bei Fragen kannst du auf diese E-Mail antworten.
                            </p>
                            <p style="margin: 20px 0 0 0; color: #1f2937; font-size: 15px;">
                                Sportliche Grüße,<br><strong>Das SC Champions Team</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f9fafb; padding: 24px 40px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #6b7280; font-size: 13px; text-align: center;">
                                © ${new Date().getFullYear()} SC Champions - Das Gamification-System für Sportvereine
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function generateEmailText(firstName) {
    const name = firstName || 'Spieler';
    return `
Hallo ${name}!

Wir haben SC Champions auf ein neues, verbessertes System umgestellt.

WICHTIG: Du musst dein Passwort einmalig zurücksetzen.

So geht's:
1. Gehe zu ${APP_URL}
2. Klicke auf "Passwort vergessen"
3. Gib deine E-Mail-Adresse ein
4. Du erhältst einen Link zum Zurücksetzen

Deine Daten (Punkte, Elo, Matches, Ränge) sind vollständig erhalten!

WAS IST NEU?
- Erwachsene (Ü18) starten mit 1000 Elo, Jugendliche mit 800 Elo
- A-Faktor für schnelleres Einpendeln bei neuen Spielern
- Faires Handicap bei großen Elo-Unterschieden
- Verbessertes Head-to-Head System

Sportliche Grüße,
Das SC Champions Team
    `.trim();
}

async function main() {
    console.log('');
    console.log('========================================');
    console.log('  SC Champions - Retry Failed Emails');
    console.log('========================================');
    console.log('');
    console.log(`📧 Sending to ${FAILED_EMAILS.length} failed emails...`);
    console.log('   (with 600ms delay between each)');
    console.log('');

    // Fetch user data for these emails
    const { data: users, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, first_name')
        .in('email', FAILED_EMAILS);

    if (error) {
        console.error('Failed to fetch users:', error.message);
        process.exit(1);
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const firstName = user.first_name || user.display_name?.split(' ')[0] || null;
        const progress = `[${(i + 1).toString().padStart(2)}/${users.length}]`;

        try {
            await resend.emails.send({
                from: FROM_EMAIL,
                to: user.email,
                reply_to: REPLY_TO,
                subject: '🏆 SC Champions - Systemaktualisierung: Bitte Passwort zurücksetzen',
                html: generateEmailHtml(firstName),
                text: generateEmailText(firstName),
            });
            successCount++;
            console.log(`${progress} ✅ ${user.email}`);
        } catch (err) {
            failCount++;
            console.log(`${progress} ❌ ${user.email} - ${err.message}`);
        }

        // Wait 600ms between emails (well under 2/sec limit)
        if (i < users.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 600));
        }
    }

    console.log('');
    console.log('========================================');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed:     ${failCount}`);
    console.log('========================================');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
