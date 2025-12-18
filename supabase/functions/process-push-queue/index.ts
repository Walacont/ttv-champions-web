// Supabase Edge Function: Process Push Notification Queue
// This function processes pending push notifications from the queue using FCM V1 API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Cache for access token
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
 * Create a JWT token for Google OAuth
 */
async function createJWT(serviceAccount: ServiceAccount): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

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
 * Get an access token from Google OAuth
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
    throw new Error(`Failed to get access token: ${error}`)
  }

  const data = await response.json()
  cachedAccessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in * 1000)

  return cachedAccessToken!
}

/**
 * Send a push notification via FCM V1 API
 */
async function sendFCMNotification(
  serviceAccount: ServiceAccount,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
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
    error: errorCode || errorData.error?.message || 'Unknown error',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')

    if (!serviceAccountJson) {
      console.error('FIREBASE_SERVICE_ACCOUNT not configured')
      return new Response(
        JSON.stringify({ error: 'FCM not configured - missing service account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let serviceAccount: ServiceAccount
    try {
      serviceAccount = JSON.parse(serviceAccountJson)
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e)
      return new Response(
        JSON.stringify({ error: 'FCM not configured - invalid service account JSON' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
          const notificationData = {
            ...(log.data || {}),
            type: log.notification_type,
          }

          const result = await sendFCMNotification(
            serviceAccount,
            token,
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

          // Handle invalid tokens
          if (result.error === 'UNREGISTERED' || result.error === 'INVALID_ARGUMENT') {
            await supabase
              .from('profiles')
              .update({ fcm_token: null })
              .eq('id', log.user_id)
            console.log(`Cleared invalid token for user ${log.user_id}`)
          }

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
