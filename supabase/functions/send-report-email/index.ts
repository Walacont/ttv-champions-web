// Supabase Edge Function: Send Report Email Notification to Admin
// Sends an email via Resend when a new content report is submitted

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ReportEmailPayload {
  report_id: string
  reporter_name: string
  reported_user_name: string
  report_type: string
  content_type: string
  description?: string
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Belästigung',
  hate_speech: 'Hassrede',
  violence: 'Gewalt',
  inappropriate_content: 'Unangemessener Inhalt',
  impersonation: 'Identitätsdiebstahl',
  misinformation: 'Fehlinformation',
  other: 'Sonstiges',
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  user: 'Nutzer',
  post: 'Beitrag',
  poll: 'Umfrage',
  comment: 'Kommentar',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const adminEmail = Deno.env.get('ADMIN_EMAIL')
    const appUrl = Deno.env.get('APP_URL') || 'https://sc-champions.de'

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!adminEmail) {
      console.error('ADMIN_EMAIL not configured')
      return new Response(
        JSON.stringify({ error: 'Admin email not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload: ReportEmailPayload = await req.json()

    if (!payload.report_id || !payload.reporter_name || !payload.reported_user_name) {
      return new Response(
        JSON.stringify({ error: 'report_id, reporter_name, and reported_user_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const reportTypeLabel = REPORT_TYPE_LABELS[payload.report_type] || payload.report_type
    const contentTypeLabel = CONTENT_TYPE_LABELS[payload.content_type] || payload.content_type
    const reportsUrl = `${appUrl}/admin-reports.html`

    const emailHtml = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                ⚠️ Neue Meldung eingegangen
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
                Es wurde eine neue Meldung in <strong>SC Champions</strong> eingereicht.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:14px;width:140px;">Gemeldet von:</td>
                        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(payload.reporter_name)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:14px;">Gemeldete Person:</td>
                        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(payload.reported_user_name)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:14px;">Grund:</td>
                        <td style="padding:6px 0;color:#dc2626;font-size:14px;font-weight:600;">${escapeHtml(reportTypeLabel)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:14px;">Inhaltstyp:</td>
                        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(contentTypeLabel)}</td>
                      </tr>
                      ${payload.description ? `
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:14px;vertical-align:top;">Beschreibung:</td>
                        <td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(payload.description)}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="${reportsUrl}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;">
                      Meldung überprüfen
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
                Diese E-Mail wurde automatisch von SC Champions gesendet.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    // Send email via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SC Champions <noreply@sc-champions.de>',
        to: [adminEmail],
        subject: `Neue Meldung: ${reportTypeLabel} - ${contentTypeLabel} gemeldet`,
        html: emailHtml,
      }),
    })

    const resendResult = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendResult)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: resendResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, email_id: resendResult.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-report-email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
