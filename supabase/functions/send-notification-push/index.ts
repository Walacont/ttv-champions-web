// Supabase Edge Function: Send Push Notifications via OneSignal
// Unified push for both native apps and PWA users

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushPayload {
  user_id: string
  title: string
  body: string
  data?: Record<string, string>
  notification_type?: string
  url?: string
}

/**
 * Send a push notification via OneSignal API
 */
async function sendOneSignalNotification(
  appId: string,
  apiKey: string,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  url?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {
      app_id: appId,
      include_external_user_ids: [userId],
      headings: { en: title, de: title },
      contents: { en: body, de: body },
      data: data || {},
    }

    if (url) {
      payload.url = url
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (response.ok && !result.errors) {
      return { success: true }
    }

    return {
      success: false,
      error: result.errors?.join(', ') || 'Unknown OneSignal error',
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID')
    const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')

    if (!oneSignalAppId || !oneSignalApiKey) {
      return new Response(
        JSON.stringify({ error: 'OneSignal not configured - missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const payload: PushPayload = await req.json()

    if (!payload.user_id || !payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: 'user_id, title, and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's notification settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('notifications_enabled, notification_preferences')
      .eq('id', payload.user_id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User not found', sent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profile.notifications_enabled) {
      return new Response(
        JSON.stringify({ message: 'User has notifications disabled', sent: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check notification preferences for this type
    const notificationType = payload.notification_type || 'default'
    const preferences = profile.notification_preferences || {}
    if (notificationType !== 'default' && preferences[notificationType] === false) {
      return new Response(
        JSON.stringify({ message: `User has ${notificationType} notifications disabled`, sent: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send via OneSignal
    const notificationData = {
      ...payload.data,
      type: notificationType,
    }

    const result = await sendOneSignalNotification(
      oneSignalAppId,
      oneSignalApiKey,
      payload.user_id,
      payload.title,
      payload.body,
      notificationData,
      payload.url
    )

    // Log the notification attempt
    try {
      await supabase.from('push_notification_logs').insert({
        user_id: payload.user_id,
        notification_type: notificationType,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        platform: 'onesignal',
        status: result.success ? 'sent' : 'failed',
        error_message: result.error || null,
        sent_at: new Date().toISOString(),
      })
    } catch (logError) {
      console.warn('Failed to log push notification:', logError)
    }

    return new Response(
      JSON.stringify({
        message: result.success ? 'Notification sent' : 'Failed to send notification',
        sent: result.success,
        results: [{ platform: 'onesignal', ...result }],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-notification-push:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
