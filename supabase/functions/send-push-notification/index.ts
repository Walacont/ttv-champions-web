// Supabase Edge Function: Send Push Notifications via OneSignal (batch)
// Supports sending to single user or multiple users

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushPayload {
  user_id?: string
  user_ids?: string[]
  title: string
  body: string
  data?: Record<string, string>
  notification_type?: string
}

/**
 * Send a push notification via OneSignal API
 */
async function sendOneSignalNotification(
  appId: string,
  apiKey: string,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {
      app_id: appId,
      include_aliases: { external_id: userIds },
      target_channel: 'push',
      headings: { en: title, de: title },
      contents: { en: body, de: body },
      data: data || {},
    }

    console.log('[Push] Sending to OneSignal:', JSON.stringify({ app_id: appId, userIds, title }))

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    console.log('[Push] OneSignal response:', response.status, JSON.stringify(result))

    if (response.ok && !result.errors) {
      return { success: true }
    }

    const errorMsg = Array.isArray(result.errors)
      ? result.errors.join(', ')
      : JSON.stringify(result.errors || result)
    console.error('[Push] OneSignal error:', errorMsg)

    return {
      success: false,
      error: errorMsg,
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

    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: 'title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let userIds: string[] = []
    if (payload.user_id) {
      userIds = [payload.user_id]
    } else if (payload.user_ids && payload.user_ids.length > 0) {
      userIds = payload.user_ids
    } else {
      return new Response(
        JSON.stringify({ error: 'user_id or user_ids required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const notificationType = payload.notification_type || 'default'
    const notificationData = {
      ...payload.data,
      ...(notificationType !== 'default' && { type: notificationType }),
    }

    // Send via OneSignal (targets users by external_user_id)
    const result = await sendOneSignalNotification(
      oneSignalAppId,
      oneSignalApiKey,
      userIds,
      payload.title,
      payload.body,
      notificationData
    )

    // Log the notification
    try {
      for (const userId of userIds) {
        await supabase.from('push_notification_logs').insert({
          user_id: userId,
          notification_type: notificationType,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          platform: 'onesignal',
          status: result.success ? 'sent' : 'failed',
          error_message: result.error || null,
          sent_at: new Date().toISOString(),
        })
      }
    } catch (logError) {
      console.warn('Failed to log push notification:', logError)
    }

    return new Response(
      JSON.stringify({
        message: result.success ? `Sent to ${userIds.length} users` : 'Failed to send',
        sent: result.success ? userIds.length : 0,
        failed: result.success ? 0 : userIds.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-push-notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
