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
  video_url?: string
  frame_timestamps: number[]   // Sekunden-Zeitpunkte für Frame-Extraktion
  frame_images: string[]       // Base64-encodierte Frame-Bilder
  pose_data?: any              // Optionale Pose-Daten als Kontext
  shot_labels?: any[]          // Optionale Shot-Labels als Kontext
  player_name?: string
  exercise_name?: string
  reference_comparison?: {     // Optionaler Vergleich mit Musterbeispiel
    exercise_name?: string
    overall_score?: string
  }
}

interface TechniqueAnalysis {
  overall_rating: number       // 1-10
  summary: string              // Kurze Zusammenfassung auf Deutsch
  body_parts: {
    schlagtechnik: { rating: number, feedback: string }   // Griff, Treffpunkt, Armeinsatz, Schlägerwinkel
    beinarbeit: { rating: number, feedback: string }      // Grundstellung, Bewegung, Gewichtsverlagerung, Rückkehr
    koerperhaltung: { rating: number, feedback: string }  // Gesamthaltung, Schulterrotation, Körpereinsatz
    taktik: { rating: number, feedback: string }          // Platzierung, Aufschlag/Rückschlag, Risiko/Sicherheit
    mental: { rating: number, feedback: string }          // Körpersprache, Fokus, Aktivität
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
  if (payload.reference_comparison?.overall_score) {
    contextText += ` Pose-Vergleich mit Musterbeispiel${payload.reference_comparison.exercise_name ? ` (${payload.reference_comparison.exercise_name})` : ''}: ${payload.reference_comparison.overall_score} Übereinstimmung.`
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

  const systemPrompt = `Du bist ein erfahrener Tischtennis-Trainer (A-Lizenz Niveau) und analysierst Video-Frames eines Vereinsspielers.
Deine Aufgabe ist es, die Technik systematisch nach den folgenden Kriterien zu bewerten und konkretes, umsetzbares Feedback zu geben.

## Bewertungskriterien

### 1. Schlagtechnik (schlagtechnik)
Bewerte folgende Aspekte:
- **Schlägerhaltung und -winkel**: Ist der Griff korrekt (nicht zu verkrampft)? Ist der Schlägerwinkel beim Balltreffpunkt dem Schlag angepasst (z.B. offen beim Schupf, geschlossen beim Topspin)?
- **Balltreffpunkt**: Wird der Ball optimal getroffen? (Vorderster Punkt in der Vorwärtsbewegung, Höhe des Treffpunkts)
- **Treffpunkt am Körper**: Erfolgt der Treffpunkt vor dem Körper? Geht der Spieler "in die Bälle rein"?
- **Armeinsatz**: Wird Unterarm und Handgelenk für Spin und Geschwindigkeit genutzt (kurze, knackige Bewegung statt ausladender Ausholbewegung)?
- **Rückhand-Technik**: Wird bei der Rückhand das Handgelenk ausreichend genutzt? Wird der Ball nicht zu früh (zu weit vorne) angenommen?

### 2. Beinarbeit und Körperposition (beinarbeit)
Bewerte folgende Aspekte:
- **Grundstellung**: Steht der Spieler aktiv in leichter Hockstellung, auf den Vorderfüßen, mit dem Schläger über Tischniveau?
- **Bewegung zum Ball**: Bewegt sich der Spieler mit kleinen Schritten zum Ball (nicht große Ausfallschritte)?
- **Gewichtsverlagerung**: Findet eine Gewichtsverlagerung von hinten nach vorne beim Angriff statt?
- **Rückkehr in Grundstellung**: Kehrt der Spieler nach dem Schlag schnellstmöglich in die neutrale Grundstellung zurück?

### 3. Körperhaltung und Körpereinsatz (koerperhaltung)
Bewerte folgende Aspekte:
- **Gesamthaltung**: Ist die Körperhaltung stabil und ausbalanciert?
- **Schulterrotation**: Wird der Oberkörper bei Vorhand-Schlägen mitgedreht?
- **Körperschwerpunkt**: Ist der Schwerpunkt tief genug und über den Füßen?

### 4. Taktik und Spielintelligenz (taktik)
Bewerte folgende Aspekte (soweit aus den Frames erkennbar):
- **Aufschlag und Rückschlag**: Ist der Aufschlag so platziert, dass der Gegner keinen direkten Angriff starten kann? Ist der Rückschlag variabel?
- **Platzierung**: Werden die Bälle taktisch klug platziert (z.B. in die weite Vorhand, Ellbogen/Umschlagpunkt)?
- **Sicherheit vs. Risiko**: Stimmt das Verhältnis von Fehlern zu Punktgewinnen?
- **Reaktionsschnelligkeit**: Erkennt der Spieler frühzeitig, wohin der Ball kommt?

### 5. Mentale Aspekte (mental)
Bewerte folgende Aspekte (soweit aus den Frames erkennbar):
- **Körpersprache**: Wirkt der Spieler aktiv und positiv oder frustriert/passiv?
- **Fokus**: Konzentriert sich der Spieler auf den nächsten Ball?

## Antwort-Format

Antworte IMMER auf Deutsch und im folgenden JSON-Format:
{
  "overall_rating": <Zahl 1-10>,
  "summary": "<2-3 Sätze Gesamteindruck>",
  "body_parts": {
    "schlagtechnik": { "rating": <1-10>, "feedback": "<konkretes Feedback mit Bezug auf die Kriterien oben>" },
    "beinarbeit": { "rating": <1-10>, "feedback": "<konkretes Feedback>" },
    "koerperhaltung": { "rating": <1-10>, "feedback": "<konkretes Feedback>" },
    "taktik": { "rating": <1-10>, "feedback": "<konkretes Feedback, oder 'Aus den Frames nicht ausreichend beurteilbar' wenn nicht erkennbar>" },
    "mental": { "rating": <1-10>, "feedback": "<konkretes Feedback, oder 'Aus den Frames nicht ausreichend beurteilbar' wenn nicht erkennbar>" }
  },
  "strengths": ["<Stärke 1>", "<Stärke 2>", "<Stärke 3>"],
  "improvements": ["<Verbesserung 1>", "<Verbesserung 2>", "<Verbesserung 3>"],
  "drill_suggestions": ["<konkrete Übung 1>", "<konkrete Übung 2>"]
}

## Wichtige Regeln
- Sei konstruktiv und ermutigend, aber ehrlich — beschönige nichts
- Gib KONKRETE, umsetzbare Tipps (NICHT "verbessere deine Technik" SONDERN "der Ellbogen sollte beim VH-Topspin näher am Körper bleiben, dann kommt mehr Spin")
- Auch gelungene Aspekte erwähnen um Stärken zu festigen — nicht nur Fehler suchen
- Berücksichtige dass es sich um Vereinsspieler handelt, nicht Profis
- Wenn du etwas nicht erkennen kannst (z.B. bei schlechter Auflösung oder ungünstiger Kameraperspektive), sage das ehrlich statt zu raten
- Wenn ein Pose-Vergleich mit einem Musterbeispiel vorliegt, beziehe die Abweichungen in dein Feedback ein
- Die overall_rating soll der gewichtete Durchschnitt sein: Schlagtechnik 35%, Beinarbeit 25%, Körperhaltung 20%, Taktik 10%, Mental 10%
- Nutze die volle Skala 1-10 realistisch: 5 = solide Grundlagen aber deutliche Fehler, 7 = gute Vereinsebene, 9-10 = nahezu fehlerfreie Technik
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
        schlagtechnik: { rating: 5, feedback: 'Analyse konnte nicht strukturiert werden.' },
        beinarbeit: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
        koerperhaltung: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
        taktik: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
        mental: { rating: 5, feedback: 'Siehe Zusammenfassung.' },
      },
      strengths: [],
      improvements: [textContent.substring(0, 200)],
      drill_suggestions: [],
    }
  }
}
