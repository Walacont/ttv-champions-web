/**
 * Edge Function: Claude Vision Technik-Analyse
 *
 * Empfängt Video-Frames (als URLs) + Pose-Daten + Shot-Labels,
 * schickt sie an die Claude Vision API und gibt strukturierte
 * Technik-Bewertungen zurück.
 *
 * Benötigte Secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ANTHROPIC_API_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AnalysisRequest {
  video_id: string
  video_url: string
  frame_timestamps: number[]   // Sekunden-Zeitpunkte für Frame-Extraktion
  frame_images: string[]       // Base64-encodierte Frame-Bilder
  pose_data?: any              // Optionale Pose-Daten als Kontext
  shot_labels?: any[]          // Optionale Shot-Labels als Kontext
  player_name?: string
  exercise_name?: string
}

interface TechniqueAnalysis {
  overall_rating: number       // 1-10
  summary: string              // Kurze Zusammenfassung auf Deutsch
  body_parts: {
    arm_technique: { rating: number, feedback: string }
    shoulder_rotation: { rating: number, feedback: string }
    footwork: { rating: number, feedback: string }
    body_posture: { rating: number, feedback: string }
    racket_angle: { rating: number, feedback: string }
  }
  strengths: string[]          // 2-3 Stärken
  improvements: string[]       // 2-3 Verbesserungsvorschläge
  drill_suggestions: string[]  // 1-2 Übungsempfehlungen
}

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload: AnalysisRequest = await req.json()

    if (!payload.video_id || !payload.frame_images || payload.frame_images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'video_id and frame_images are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Analyse-Eintrag in DB erstellen (status: processing)
    let analysisId: string | null = null
    const { data: analysis, error: insertError } = await supabase
      .from('video_ai_analyses')
      .insert({
        video_id: payload.video_id,
        analysis_type: 'claude_technique_analysis',
        status: 'processing',
        processing_location: 'edge_function',
        model_name: 'claude-sonnet-4-5-20250929',
        frames_analyzed: payload.frame_images.length,
      })
      .select('id')
      .single()

    if (insertError) {
      // DB-Insert fehlgeschlagen (z.B. CHECK constraint) - trotzdem weitermachen
      console.warn('[analyze-video-ai] DB insert failed (continuing without DB):', insertError.message)
    } else {
      analysisId = analysis.id
    }

    const startTime = Date.now()

    // Claude Vision API aufrufen
    const claudeResult = await callClaudeVision(
      anthropicApiKey,
      payload
    )

    const processingTime = Date.now() - startTime

    // Ergebnis in DB speichern (nur wenn Insert erfolgreich war)
    if (analysisId) {
      const { error: updateError } = await supabase
        .from('video_ai_analyses')
        .update({
          status: 'completed',
          results: claudeResult,
          summary: {
            overall_rating: claudeResult.overall_rating,
            summary: claudeResult.summary,
            strengths_count: claudeResult.strengths?.length || 0,
            improvements_count: claudeResult.improvements?.length || 0,
          },
          processing_time_ms: processingTime,
        })
        .eq('id', analysisId)

      if (updateError) {
        console.error('[analyze-video-ai] DB update error:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        analysis_id: analysisId,
        result: claudeResult,
        processing_time_ms: processingTime,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[analyze-video-ai] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Ruft die Claude Vision API auf mit Frame-Bildern und Kontext.
 */
async function callClaudeVision(
  apiKey: string,
  payload: AnalysisRequest
): Promise<TechniqueAnalysis> {
  // Kontext-Text aufbauen
  let contextText = 'Du analysierst ein Tischtennis-Trainingsvideo.'
  if (payload.player_name) {
    contextText += ` Spieler: ${payload.player_name}.`
  }
  if (payload.exercise_name) {
    contextText += ` Übung: ${payload.exercise_name}.`
  }
  if (payload.shot_labels && payload.shot_labels.length > 0) {
    const shotSummary = payload.shot_labels
      .map(s => `${s.type} bei ${s.timestamp?.toFixed(1)}s`)
      .join(', ')
    contextText += ` Erkannte Schläge: ${shotSummary}.`
  }

  // Frame-Bilder als Content-Blocks aufbauen
  const imageBlocks = payload.frame_images.map((base64, idx) => {
    const timestamp = payload.frame_timestamps?.[idx]
    const caption = timestamp !== undefined ? `Frame bei ${timestamp.toFixed(1)}s` : `Frame ${idx + 1}`
    return [
      {
        type: 'text',
        text: caption,
      },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64,
        },
      },
    ]
  }).flat()

  const systemPrompt = `Du bist ein erfahrener Tischtennis-Trainer und analysierst Video-Frames eines Spielers.
Deine Aufgabe ist es, die Technik des Spielers zu bewerten und konkretes Feedback zu geben.

Antworte IMMER auf Deutsch und im folgenden JSON-Format:
{
  "overall_rating": <Zahl 1-10>,
  "summary": "<2-3 Sätze Gesamteindruck>",
  "body_parts": {
    "arm_technique": { "rating": <1-10>, "feedback": "<konkretes Feedback zur Armtechnik>" },
    "shoulder_rotation": { "rating": <1-10>, "feedback": "<Feedback zur Schulterrotation>" },
    "footwork": { "rating": <1-10>, "feedback": "<Feedback zur Beinarbeit>" },
    "body_posture": { "rating": <1-10>, "feedback": "<Feedback zur Körperhaltung>" },
    "racket_angle": { "rating": <1-10>, "feedback": "<Feedback zum Schlägerwinkel>" }
  },
  "strengths": ["<Stärke 1>", "<Stärke 2>"],
  "improvements": ["<Verbesserung 1>", "<Verbesserung 2>", "<Verbesserung 3>"],
  "drill_suggestions": ["<Übung 1>", "<Übung 2>"]
}

Wichtig:
- Sei konstruktiv und ermutigend, aber ehrlich
- Gib konkrete, umsetzbare Tipps (nicht "verbessere deine Technik" sondern "der Ellbogen sollte beim Topspin stärker gestreckt werden")
- Berücksichtige dass es sich um Vereinsspieler handelt, nicht Profis
- Wenn du etwas nicht erkennen kannst (z.B. Schlägerwinkel bei schlechter Auflösung), sage das ehrlich
- Antworte NUR mit dem JSON, kein Text davor oder danach`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: contextText,
            },
            ...imageBlocks,
            {
              type: 'text',
              text: 'Bitte analysiere die Tischtennis-Technik in diesen Frames und gib dein Feedback als JSON.',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[analyze-video-ai] Claude API error:', response.status, errorText)
    throw new Error(`Claude API error: ${response.status}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: any) => c.type === 'text')?.text

  if (!textContent) {
    throw new Error('No text response from Claude')
  }

  // JSON aus der Antwort extrahieren (Claude gibt manchmal Markdown-Codeblocks zurück)
  let jsonStr = textContent.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  try {
    return JSON.parse(jsonStr)
  } catch (parseError) {
    console.error('[analyze-video-ai] JSON parse error:', parseError, 'Raw:', textContent)
    // Fallback: Basis-Antwort mit dem Rohtext als Summary
    return {
      overall_rating: 5,
      summary: textContent.substring(0, 500),
      body_parts: {
        arm_technique: { rating: 5, feedback: 'Analyse konnte nicht strukturiert werden.' },
        shoulder_rotation: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
        footwork: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
        body_posture: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
        racket_angle: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
      },
      strengths: [],
      improvements: [textContent.substring(0, 200)],
      drill_suggestions: [],
    }
  }
}
