// Supabase Edge Function: Send Push Notifications
// This function sends push notifications via Firebase Cloud Messaging (FCM) V1 API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

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
    exp: now + 3600, // 1 hour
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  // Import the private key
  const privateKey = serviceAccount.private_key
  const pemContents = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  )

  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))

  return `${signatureInput}.${encodedSignature}`
}

/**
 * Base64 URL encode (without padding)
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Get an access token from Google OAuth
 */
async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken
  }

  const jwt = await createJWT(serviceAccount)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
      notification: {
        title: title,
        body: body,
      },
      data: data || {},
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
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
        // Add notification type to data
        const notificationData = {
          ...payload.data,
          ...(payload.notification_type && { type: payload.notification_type }),
        }

        const result = await sendFCMNotification(
          serviceAccount,
          recipient.fcm_token,
          payload.title,
          payload.body,
          notificationData
        )

        // Log the notification
        await supabase.from('push_notification_logs').insert({
          user_id: recipient.user_id,
          notification_type: payload.notification_type || 'custom',
          title: payload.title,
          body: payload.body,
          data: payload.data,
          platform: recipient.push_platform,
          status: result.success ? 'sent' : 'failed',
          error_message: result.error || null,
          sent_at: new Date().toISOString(),
        })

        // Handle invalid tokens
        if (result.error === 'UNREGISTERED' || result.error === 'INVALID_ARGUMENT') {
          // Clear the invalid token
          await supabase
            .from('profiles')
            .update({ fcm_token: null })
            .eq('id', recipient.user_id)
          console.log(`Cleared invalid token for user ${recipient.user_id}`)
        }

        return {
          user_id: recipient.user_id,
          success: result.success,
          error: result.error,
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
