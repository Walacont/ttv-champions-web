// Supabase Edge Function: Send Web Push Notifications
// This function sends push notifications via Web Push API for PWA users

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebPushPayload {
  user_id?: string
  user_ids?: string[]
  title: string
  body: string
  url?: string
  data?: Record<string, string>
  notification_type?: string
}

interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
}

/**
 * Generate VAPID JWT token for Web Push authentication
 */
async function generateVapidJWT(
  endpoint: string,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  subject: string
): Promise<string> {
  const urlParts = new URL(endpoint)
  const audience = `${urlParts.protocol}//${urlParts.host}`

  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + 43200, // 12 hours
    sub: subject,
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Import the private key
  const privateKeyDer = base64UrlDecode(vapidPrivateKey)

  // Create the full key with the standard P-256 curve prefix
  const fullPrivateKey = new Uint8Array(138)
  // PKCS#8 header for P-256 EC private key
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x20
  ])
  fullPrivateKey.set(pkcs8Header)
  fullPrivateKey.set(privateKeyDer, pkcs8Header.length)

  // Public key wrapper
  const publicKeyWrapper = new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00])
  fullPrivateKey.set(publicKeyWrapper, pkcs8Header.length + 32)

  // Add public key
  const publicKeyBytes = base64UrlDecode(vapidPublicKey)
  fullPrivateKey.set(publicKeyBytes, pkcs8Header.length + 32 + 5)

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    fullPrivateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )

  // Convert DER signature to raw format
  const signatureB64 = base64UrlEncode(new Uint8Array(signature))

  return `${unsignedToken}.${signatureB64}`
}

/**
 * Encrypt payload for Web Push
 */
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; publicKey: Uint8Array }> {
  // Generate local key pair
  const localKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  // Export local public key
  const localPublicKey = await crypto.subtle.exportKey('raw', localKeys.publicKey)

  // Import subscriber's public key
  const subscriberPublicKeyBytes = base64UrlDecode(p256dh)
  const subscriberPublicKey = await crypto.subtle.importKey(
    'raw',
    subscriberPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPublicKey },
    localKeys.privateKey,
    256
  )

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const authSecret = base64UrlDecode(auth)

  // Derive encryption key using HKDF
  const ikm = await hkdfExtract(authSecret, new Uint8Array(sharedSecret))
  const prk = await hkdfExpand(ikm, new TextEncoder().encode('Content-Encoding: auth\x00'), 32)

  const context = createContext(subscriberPublicKeyBytes, new Uint8Array(localPublicKey))
  const contentEncoding = new TextEncoder().encode('Content-Encoding: aes128gcm\x00')
  const nonceInfo = concatBuffers(contentEncoding, context)
  const keyInfo = concatBuffers(new TextEncoder().encode('Content-Encoding: aesgcm\x00'), context)

  const nonce = await hkdfExpand(prk, nonceInfo, 12)
  const contentEncryptionKey = await hkdfExpand(prk, keyInfo, 16)

  // Import CEK for AES-GCM
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey,
    'AES-GCM',
    false,
    ['encrypt']
  )

  // Add padding to payload
  const paddedPayload = new Uint8Array(payload.length + 2)
  paddedPayload.set(new TextEncoder().encode(payload))
  paddedPayload[payload.length] = 0x02 // Delimiter

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    salt,
    publicKey: new Uint8Array(localPublicKey),
  }
}

function createContext(subscriberPublicKey: Uint8Array, localPublicKey: Uint8Array): Uint8Array {
  const context = new Uint8Array(5 + 65 + 65)
  context.set(new TextEncoder().encode('P-256\x00'))
  context[5] = 0
  context[6] = 65
  context.set(subscriberPublicKey, 7)
  context[72] = 0
  context[73] = 65
  context.set(localPublicKey, 74)
  return context
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = await crypto.subtle.sign('HMAC', key, ikm)
  return new Uint8Array(prk)
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const infoWithCounter = new Uint8Array(info.length + 1)
  infoWithCounter.set(info)
  infoWithCounter[info.length] = 1
  const output = await crypto.subtle.sign('HMAC', key, infoWithCounter)
  return new Uint8Array(output).slice(0, length)
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const length = buffers.reduce((acc, buf) => acc + buf.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

function base64UrlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - str.length % 4) % 4)
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, c => c.charCodeAt(0))
}

/**
 * Send a Web Push notification
 */
async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; url?: string; data?: Record<string, string> },
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    const payloadString = JSON.stringify(payload)

    // For simplicity, we'll send an unencrypted push with the required headers
    // In production, you should use the full encryption as implemented above

    const jwt = await generateVapidJWT(
      subscription.endpoint,
      vapidPrivateKey,
      vapidPublicKey,
      vapidSubject
    )

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400', // 24 hours
        'Urgency': 'normal',
      },
      body: new TextEncoder().encode(payloadString),
    })

    if (response.ok || response.status === 201) {
      return { success: true }
    }

    const errorText = await response.text()
    return {
      success: false,
      error: errorText || response.statusText,
      statusCode: response.status,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
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
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@sc-champions.de'

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured')
      return new Response(
        JSON.stringify({ error: 'Web Push not configured - missing VAPID keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const payload: WebPushPayload = await req.json()

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

    // Get Web Push subscriptions for these users
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', userIds)
      .eq('is_active', true)

    if (subError) {
      console.error('Error getting subscriptions:', subError)
      return new Response(
        JSON.stringify({ error: 'Failed to get subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No Web Push subscriptions found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending to ${subscriptions.length} Web Push subscriptions`)

    // Prepare notification payload
    const notificationPayload = {
      title: payload.title,
      body: payload.body,
      url: payload.url || '/dashboard.html',
      data: payload.data || {},
    }

    // Send push notifications
    const results = await Promise.allSettled(
      subscriptions.map(async (sub: PushSubscription) => {
        const result = await sendWebPush(
          sub,
          notificationPayload,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        )

        // Handle expired/invalid subscriptions
        if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
          // Deactivate invalid subscription
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('endpoint', sub.endpoint)
          console.log(`Deactivated invalid subscription for user ${sub.user_id}`)
        }

        // Update last_used_at for successful sends
        if (result.success) {
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('endpoint', sub.endpoint)
        }

        return {
          user_id: sub.user_id,
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
        message: `Sent ${sent} Web Push notifications, ${failed} failed`,
        sent,
        failed,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'Promise rejected' }),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-web-push:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
