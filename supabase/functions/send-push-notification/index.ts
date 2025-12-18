// Supabase Edge Function: Send Push Notifications
// This function sends push notifications via Firebase Cloud Messaging (FCM)

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

interface FCMMessage {
  token: string
  notification: {
    title: string
    body: string
  }
  data?: Record<string, string>
  android?: {
    priority: string
    notification: {
      sound: string
      channelId: string
    }
  }
  apns?: {
    payload: {
      aps: {
        sound: string
        badge: number
      }
    }
  }
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

    // Parse request body
    const payload: PushPayload = await req.json()

    // Validate payload
    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: 'title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user IDs to send to
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

    // Get push recipients with tokens
    const { data: recipients, error: recipientsError } = await supabase
      .rpc('get_push_recipients', {
        p_user_ids: userIds,
        p_notification_type: payload.notification_type || 'default'
      })

    if (recipientsError) {
      console.error('Error getting recipients:', recipientsError)
      return new Response(
        JSON.stringify({ error: 'Failed to get recipients' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No recipients with push tokens found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send push notifications
    const results = await Promise.allSettled(
      recipients.map(async (recipient: any) => {
        const message: FCMMessage = {
          token: recipient.fcm_token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data || {},
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'sc_champions_default',
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

        // Add notification type to data
        if (payload.notification_type) {
          message.data = { ...message.data, type: payload.notification_type }
        }

        // Send via FCM HTTP v1 API
        const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Authorization': `key=${fcmServerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: recipient.fcm_token,
            notification: message.notification,
            data: message.data,
            android: message.android,
            apns: message.apns,
          }),
        })

        const fcmResult = await fcmResponse.json()

        // Log the notification
        await supabase.from('push_notification_logs').insert({
          user_id: recipient.user_id,
          notification_type: payload.notification_type || 'custom',
          title: payload.title,
          body: payload.body,
          data: payload.data,
          platform: recipient.push_platform,
          status: fcmResult.success ? 'sent' : 'failed',
          error_message: fcmResult.success ? null : JSON.stringify(fcmResult.results),
          sent_at: new Date().toISOString(),
        })

        // Handle invalid tokens
        if (fcmResult.results?.[0]?.error === 'InvalidRegistration' ||
            fcmResult.results?.[0]?.error === 'NotRegistered') {
          // Clear the invalid token
          await supabase
            .from('profiles')
            .update({ fcm_token: null })
            .eq('id', recipient.user_id)
          console.log(`Cleared invalid token for user ${recipient.user_id}`)
        }

        return {
          user_id: recipient.user_id,
          success: fcmResult.success === 1,
          error: fcmResult.results?.[0]?.error,
        }
      })
    )

    // Count successes and failures
    const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length
    const failed = results.length - sent

    return new Response(
      JSON.stringify({
        message: `Sent ${sent} notifications, ${failed} failed`,
        sent,
        failed,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'Promise rejected' }),
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
