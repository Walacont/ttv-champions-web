/**
 * Email Service Module
 * Professional email sending via SendGrid with Gmail fallback
 *
 * Setup:
 * 1. Create SendGrid account: https://sendgrid.com
 * 2. Generate API Key: Settings > API Keys > Create API Key
 * 3. Set environment variable:
 *    firebase functions:config:set sendgrid.api_key="YOUR_API_KEY"
 *    firebase functions:config:set sendgrid.from_email="noreply@yourclub.de"
 *    firebase functions:config:set sendgrid.from_name="TTV Champions"
 */

const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const { logger } = require('firebase-functions');

// Configuration
const EMAIL_CONFIG = {
  // SendGrid (primary)
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@ttv-champions.de',
    fromName: process.env.SENDGRID_FROM_NAME || 'TTV Champions',
  },
  // Gmail (fallback)
  gmail: {
    email: process.env.GMAIL_EMAIL,
    password: process.env.GMAIL_PASSWORD,
  },
};

// Initialize SendGrid if API key is available
if (EMAIL_CONFIG.sendgrid.apiKey) {
  sgMail.setApiKey(EMAIL_CONFIG.sendgrid.apiKey);
  logger.info('📧 SendGrid initialized');
}

/**
 * Send email via SendGrid
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @returns {Promise<boolean>} Success status
 */
async function sendViaSendGrid(options) {
  const msg = {
    to: options.to,
    from: {
      email: EMAIL_CONFIG.sendgrid.fromEmail,
      name: EMAIL_CONFIG.sendgrid.fromName,
    },
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
  };

  try {
    await sgMail.send(msg);
    logger.info(`✅ SendGrid: Email sent to ${options.to}`);
    return true;
  } catch (error) {
    logger.error(`❌ SendGrid error:`, error.response?.body || error.message);
    return false;
  }
}

/**
 * Send email via Gmail (fallback)
 * @param {Object} options - Email options
 * @returns {Promise<boolean>} Success status
 */
async function sendViaGmail(options) {
  if (!EMAIL_CONFIG.gmail.email || !EMAIL_CONFIG.gmail.password) {
    logger.warn('⚠️ Gmail not configured');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_CONFIG.gmail.email,
      pass: EMAIL_CONFIG.gmail.password,
    },
  });

  try {
    await transporter.sendMail({
      from: `"TTV Champions" <${EMAIL_CONFIG.gmail.email}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    logger.info(`✅ Gmail: Email sent to ${options.to}`);
    return true;
  } catch (error) {
    logger.error(`❌ Gmail error:`, error.message);
    return false;
  }
}

/**
 * Send email (tries SendGrid first, falls back to Gmail)
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @returns {Promise<boolean>} Success status
 */
async function sendEmail(options) {
  // Validate required fields
  if (!options.to || !options.subject || !options.html) {
    logger.error('❌ Missing required email fields');
    return false;
  }

  // Try SendGrid first
  if (EMAIL_CONFIG.sendgrid.apiKey) {
    const success = await sendViaSendGrid(options);
    if (success) return true;
    logger.warn('⚠️ SendGrid failed, trying Gmail fallback...');
  }

  // Fallback to Gmail
  return await sendViaGmail(options);
}

// ========================================================================
// ===== EMAIL TEMPLATES =====
// ========================================================================

/**
 * Generate match request notification email
 * @param {Object} data - Template data
 * @returns {Object} Email options (subject, html)
 */
function matchRequestEmail(data) {
  const { coachName, teamANames, teamBNames, setsStr, winningTeam } = data;

  return {
    subject: '🎾 Neue Doppel-Match Anfrage wartet auf Genehmigung',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🏓 TTV Champions</h1>
        </div>

        <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #1f2937; margin-top: 0;">Neue Doppel-Match Anfrage</h2>

          <p style="color: #4b5563;">Hallo ${coachName || 'Coach'},</p>
          <p style="color: #4b5563;">Es wartet eine neue Doppel-Match Anfrage auf deine Genehmigung:</p>

          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <p style="margin: 8px 0; color: #374151;"><strong>Team A:</strong> ${teamANames}</p>
            <p style="margin: 8px 0; color: #374151;"><strong>Team B:</strong> ${teamBNames}</p>
            <p style="margin: 8px 0; color: #374151;"><strong>Ergebnis:</strong> ${setsStr}</p>
            <p style="margin: 8px 0; color: #374151;"><strong>Gewinner:</strong> Team ${winningTeam}</p>
          </div>

          <p style="color: #4b5563;">Bitte logge dich in die TTV Champions App ein, um die Anfrage zu genehmigen oder abzulehnen.</p>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://ttv-champions.web.app/coach.html"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 12px 30px;
                      text-decoration: none;
                      border-radius: 6px;
                      font-weight: bold;
                      display: inline-block;">
              Zur App →
            </a>
          </div>
        </div>

        <div style="background-color: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
            Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
          </p>
        </div>
      </div>
    `,
  };
}

/**
 * Generate welcome email for new users
 * @param {Object} data - Template data
 * @returns {Object} Email options (subject, html)
 */
function welcomeEmail(data) {
  const { firstName, clubName } = data;

  return {
    subject: '🎉 Willkommen bei TTV Champions!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🏓 TTV Champions</h1>
        </div>

        <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #1f2937; margin-top: 0;">Willkommen, ${firstName}! 🎉</h2>

          <p style="color: #4b5563;">Du bist jetzt Teil von <strong>${clubName || 'TTV Champions'}</strong>!</p>

          <p style="color: #4b5563;">Mit TTV Champions kannst du:</p>

          <ul style="color: #4b5563; line-height: 1.8;">
            <li>🏆 An Wettkämpfen teilnehmen und Punkte sammeln</li>
            <li>📊 Dein ELO-Rating verfolgen</li>
            <li>🎯 Challenges meistern</li>
            <li>📈 Dich im Leaderboard hocharbeiten</li>
          </ul>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://ttv-champions.web.app/dashboard.html"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 12px 30px;
                      text-decoration: none;
                      border-radius: 6px;
                      font-weight: bold;
                      display: inline-block;">
              Zum Dashboard →
            </a>
          </div>
        </div>

        <div style="background-color: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
            Viel Spaß beim Spielen! 🏓
          </p>
        </div>
      </div>
    `,
  };
}

/**
 * Generate match result notification email
 * @param {Object} data - Template data
 * @returns {Object} Email options (subject, html)
 */
function matchResultEmail(data) {
  const { playerName, opponentName, isWinner, pointsChange, newElo } = data;

  const resultText = isWinner ? 'gewonnen' : 'verloren';
  const emoji = isWinner ? '🏆' : '💪';
  const pointsText = isWinner ? `+${pointsChange} Punkte` : 'Weiter so beim nächsten Mal!';

  return {
    subject: `${emoji} Match ${resultText} gegen ${opponentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🏓 TTV Champions</h1>
        </div>

        <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #1f2937; margin-top: 0;">${emoji} Match ${resultText}!</h2>

          <p style="color: #4b5563;">Hallo ${playerName},</p>
          <p style="color: #4b5563;">Dein Match gegen <strong>${opponentName}</strong> wurde verarbeitet.</p>

          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="font-size: 24px; margin: 0; color: ${isWinner ? '#10b981' : '#6b7280'};">
              ${pointsText}
            </p>
            <p style="color: #6b7280; margin-top: 10px;">
              Neues ELO-Rating: <strong>${newElo}</strong>
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://ttv-champions.web.app/dashboard.html"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 12px 30px;
                      text-decoration: none;
                      border-radius: 6px;
                      font-weight: bold;
                      display: inline-block;">
              Statistiken ansehen →
            </a>
          </div>
        </div>

        <div style="background-color: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
            Diese E-Mail wurde automatisch generiert.
          </p>
        </div>
      </div>
    `,
  };
}

module.exports = {
  sendEmail,
  sendViaSendGrid,
  sendViaGmail,
  // Templates
  matchRequestEmail,
  welcomeEmail,
  matchResultEmail,
  // Config (for testing)
  EMAIL_CONFIG,
};
