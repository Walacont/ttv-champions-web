// Supabase Edge Function: Process Push Notification Queue
// This function processes pending push notifications from the queue

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY')

    if (!fcmServerKey) {
      console.error('FCM_SERVER_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'FCM not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get pending notifications (limit to 100 per batch)
    const { data: pendingLogs, error: fetchError } = await supabase
      .from('push_notification_logs')
      .select(`
        id,
        user_id,
        notification_type,
        title,
        body,
        data,
        platform,
        profiles!inner(fcm_token, push_platform, notifications_enabled)
      `)
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
        const profile = log.profiles
        const token = profile?.fcm_token

        // Skip if no token or notifications disabled
        if (!token || !profile?.notifications_enabled) {
          await supabase
            .from('push_notification_logs')
            .update({
              status: 'skipped',
              error_message: !token ? 'No FCM token' : 'Notifications disabled',
            })
            .eq('id', log.id)
          return { id: log.id, status: 'skipped' }
        }

        try {
          // Prepare FCM message
          const fcmPayload = {
            to: token,
            notification: {
              title: log.title,
              body: log.body,
            },
            data: {
              ...(log.data || {}),
              type: log.notification_type,
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                channel_id: 'sc_champions_default',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          }

          // Send via FCM
          const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Authorization': `key=${fcmServerKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(fcmPayload),
          })

          const fcmResult = await fcmResponse.json()
          const success = fcmResult.success === 1

          // Update log status
          await supabase
            .from('push_notification_logs')
            .update({
              status: success ? 'sent' : 'failed',
              error_message: success ? null : JSON.stringify(fcmResult.results || fcmResult),
              sent_at: new Date().toISOString(),
            })
            .eq('id', log.id)

          // Handle invalid tokens
          if (fcmResult.results?.[0]?.error === 'InvalidRegistration' ||
              fcmResult.results?.[0]?.error === 'NotRegistered') {
            await supabase
              .from('profiles')
              .update({ fcm_token: null })
              .eq('id', log.user_id)
            console.log(`Cleared invalid token for user ${log.user_id}`)
          }

          return {
            id: log.id,
            status: success ? 'sent' : 'failed',
            error: fcmResult.results?.[0]?.error,
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

    // Count results
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
