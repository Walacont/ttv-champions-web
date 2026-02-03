// Supabase Edge Function: Process Push Notification Queue via OneSignal
// Processes pending push notifications from the queue

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {
      app_id: appId,
      include_external_user_ids: [userId],
      headings: { en: title, de: title },
      contents: { en: body, de: body },
      data: data || {},
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

    // Get pending notifications (limit to 100 per batch)
    const { data: pendingLogs, error: fetchError } = await supabase
      .from('push_notification_logs')
      .select('id, user_id, notification_type, title, body, data')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100)

    if (fetchError) {
      console.error('Error fetching pending logs:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch pending notifications' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending notifications', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${pendingLogs.length} pending notifications`)

    // Process each notification
    const results = await Promise.allSettled(
      pendingLogs.map(async (log: any) => {
        try {
          const notificationData = {
            ...(log.data || {}),
            type: log.notification_type,
          }

          const result = await sendOneSignalNotification(
            oneSignalAppId!,
            oneSignalApiKey!,
            log.user_id,
            log.title,
            log.body,
            notificationData
          )

          // Update log status
          await supabase
            .from('push_notification_logs')
            .update({
              status: result.success ? 'sent' : 'failed',
              error_message: result.error || null,
              sent_at: new Date().toISOString(),
            })
            .eq('id', log.id)

          return {
            id: log.id,
            status: result.success ? 'sent' : 'failed',
            error: result.error,
          }
        } catch (sendError) {
          console.error(`Error sending notification ${log.id}:`, sendError)
          await supabase
            .from('push_notification_logs')
            .update({
              status: 'failed',
              error_message: sendError.message,
            })
            .eq('id', log.id)
          return { id: log.id, status: 'failed', error: sendError.message }
        }
      })
    )

    const processed = results.length
    const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'sent').length
    const failed = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'failed').length
    const skipped = processed - sent - failed

    return new Response(
      JSON.stringify({
        message: `Processed ${processed} notifications`,
        processed,
        sent,
        failed,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-push-queue:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
