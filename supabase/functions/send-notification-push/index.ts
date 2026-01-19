// Supabase Edge Function: Send Push Notifications (FCM + OneSignal)
// This function sends push notifications to both native apps (FCM) and PWA users (OneSignal)

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

interface ServiceAccount {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
}

// Cache for FCM access token
let cachedAccessToken: string | null = null
let tokenExpiry: number = 0

/**
 * Base64 URL encode (without padding)
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create a JWT token for Google OAuth (FCM)
 */
async function createJWT(serviceAccount: ServiceAccount): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  const privateKey = serviceAccount.private_key
  const pemContents = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  )

  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
  return `${signatureInput}.${encodedSignature}`
}

/**
 * Get an access token from Google OAuth (for FCM)
 */
async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken
  }

  const jwt = await createJWT(serviceAccount)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get FCM access token: ${error}`)
  }

  const data = await response.json()
  cachedAccessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in * 1000)

  return cachedAccessToken!
}

/**
 * Send a push notification via FCM V1 API (for native apps)
 */
async function sendFCMNotification(
  serviceAccount: ServiceAccount,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getAccessToken(serviceAccount)

    const message = {
      message: {
        token: token,
        notification: { title, body },
        data: data || {},
        android: {
          priority: 'high',
          notification: { sound: 'default', channel_id: 'sc_champions_default' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      },
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    )

    if (response.ok) {
      return { success: true }
    }

    const errorData = await response.json()
    const errorCode = errorData.error?.details?.[0]?.errorCode || errorData.error?.status

    return {
      success: false,
      error: errorCode || errorData.error?.message || 'Unknown FCM error',
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Send a push notification via OneSignal API (for PWA users)
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

    // Add URL if provided (opens when notification is clicked)
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
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID')
    const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const payload: PushPayload = await req.json()

    // Validate payload
    if (!payload.user_id || !payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: 'user_id, title, and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's push settings
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('fcm_token, push_platform, notifications_enabled, notification_preferences')
      .eq('id', payload.user_id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User not found', sent: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if notifications are enabled
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

    const results: { platform: string; success: boolean; error?: string }[] = []

    // Prepare notification data
    const notificationData = {
      ...payload.data,
      type: notificationType,
    }

    // Send via FCM if user has FCM token (native app)
    if (profile.fcm_token && serviceAccountJson) {
      try {
        const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson)
        const fcmResult = await sendFCMNotification(
          serviceAccount,
          profile.fcm_token,
          payload.title,
          payload.body,
          notificationData
        )
        results.push({ platform: 'fcm', ...fcmResult })

        // Clear invalid tokens
        if (fcmResult.error === 'UNREGISTERED' || fcmResult.error === 'INVALID_ARGUMENT') {
          await supabase
            .from('profiles')
            .update({ fcm_token: null })
            .eq('id', payload.user_id)
          console.log(`Cleared invalid FCM token for user ${payload.user_id}`)
        }
      } catch (e) {
        console.error('FCM error:', e)
        results.push({ platform: 'fcm', success: false, error: e.message })
      }
    }

    // Send via OneSignal for PWA users (no FCM token or web platform)
    if (!profile.fcm_token || profile.push_platform === 'web') {
      if (oneSignalAppId && oneSignalApiKey) {
        const oneSignalResult = await sendOneSignalNotification(
          oneSignalAppId,
          oneSignalApiKey,
          payload.user_id,
          payload.title,
          payload.body,
          notificationData,
          payload.url
        )
        results.push({ platform: 'onesignal', ...oneSignalResult })
      } else {
        console.warn('OneSignal not configured - missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY')
      }
    }

    // Log the notification attempt
    try {
      await supabase.from('push_notification_logs').insert({
        user_id: payload.user_id,
        notification_type: notificationType,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        platform: results.map(r => r.platform).join(','),
        status: results.some(r => r.success) ? 'sent' : 'failed',
        error_message: results.filter(r => !r.success).map(r => `${r.platform}: ${r.error}`).join('; ') || null,
        sent_at: new Date().toISOString(),
      })
    } catch (logError) {
      console.warn('Failed to log push notification:', logError)
    }

    const sent = results.some(r => r.success)

    return new Response(
      JSON.stringify({
        message: sent ? 'Notification sent' : 'Failed to send notification',
        sent,
        results,
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
