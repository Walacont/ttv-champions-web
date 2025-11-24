<template>
  <div class="min-h-screen bg-gray-100 text-gray-800">
    <div class="container mx-auto p-4 sm:p-6 md:p-8 max-w-3xl">
      <!-- Header -->
      <header class="flex justify-between items-start mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">FAQ & Regeln</h1>
          <p class="text-gray-600">Alles, was du über TTV Champions wissen musst.</p>
        </div>
        <router-link :to="backLink" class="text-indigo-600 hover:text-indigo-800 font-semibold whitespace-nowrap pt-1">
          ← Zurück zum Dashboard
        </router-link>
      </header>

      <div class="bg-white p-6 rounded-xl shadow-md space-y-6">
        <!-- Das Punktesystem -->
        <section>
          <h2 class="text-xl font-semibold mb-4 border-b pb-2">Das Punktesystem</h2>
          <div class="space-y-4">
            <FAQItem title="Was ist der Unterschied zwischen Elo, XP und Saison-Punkten?">
              <p>Es gibt drei Arten von Punkten, die du sammelst:</p>
              <ul class="list-disc list-inside mt-2 space-y-2">
                <li><strong>⚡ Skill (Elo):</strong> Dies ist deine permanente Spielstärke. Du startest mit <strong>800 Elo-Punkten</strong>. Du gewinnst Elo, indem du Wettkampf-Matches gegen andere gewinnst. Du verlierst Elo, wenn du verlierst. <strong>Wichtig:</strong> Sobald du bestimmte Elo-Meilensteine erreichst (850, 900, 1000, 1100, 1300, 1600), kannst du nicht mehr darunter fallen – das sind deine "Sicherheitsnetze". Dein Elo-Wert bestimmt maßgeblich deinen Rang.</li>
                <li><strong>💪 Fleiß (XP):</strong> Das sind deine permanenten Erfahrungspunkte. Du erhältst XP für fast alles: Anwesenheit, Übungen, Challenges und Match-Siege. <strong>XP werden nie abgezogen</strong> – du kannst sie nur gewinnen! XP sind (genau wie Elo) für deinen Rangaufstieg nötig. Allerdings können Strafen für unsportliches Verhalten auch XP kosten (siehe unten).</li>
                <li><strong>🏆 Saison-Punkte:</strong> Diese Punkte sind nur für den "Saison-Wettbewerb" (alle 6 Wochen). Sie werden für Anwesenheit, Übungen, Challenges und Matches vergeben. Im Gegensatz zu XP kannst du Saison-Punkte bei Match-Niederlagen oder durch Strafen verlieren. Am Ende der Saison werden sie zurückgesetzt.</li>
              </ul>
            </FAQItem>

            <FAQItem title="Wie werden QTTR-Punkte in Elo umgerechnet?">
              <p>Wenn ein Coach einen erfahrenen Offline-Spieler erstellt und als "wettkampfsbereit" markiert, kann er optional die <strong>QTTR-Punkte</strong> (offizielles Tischtennisranking) des Spielers eingeben.</p>
              <p class="mt-2 font-semibold text-lg">📊 Umrechnungsformel:</p>
              <p class="mt-1 bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                <strong>Elo = QTTR × 0,9</strong> (mindestens 800)
              </p>
              <p class="mt-3"><strong>Beispiele:</strong></p>
              <ul class="list-none mt-2 space-y-1 bg-gray-50 p-3 rounded">
                <li><span class="font-mono">QTTR 1000</span> → <span class="font-semibold text-indigo-600">Elo 900</span></li>
                <li><span class="font-mono">QTTR 1200</span> → <span class="font-semibold text-indigo-600">Elo 1080</span></li>
                <li><span class="font-mono">QTTR 1500</span> → <span class="font-semibold text-indigo-600">Elo 1350</span></li>
                <li><span class="font-mono">QTTR 2000</span> → <span class="font-semibold text-indigo-600">Elo 1800</span></li>
              </ul>
              <p class="mt-3 text-sm text-gray-600">
                <strong>💡 Warum 90%?</strong> Diese konservative Umrechnung stellt sicher, dass sich neue Spieler erst im System beweisen müssen, bevor sie ihr volles Niveau erreichen.
              </p>
            </FAQItem>

            <FAQItem title="Wie funktionieren die Punkte bei Einzel-Matches?">
              <p>Wenn du ein Wettkampf-Match (kein Handicap-Match) spielst, werden deine <strong>Elo-Punkte</strong> und deine <strong>Saison-Punkte</strong> angepasst. Deine <strong>XP</strong> können nur steigen.</p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Sieg:</strong> Du gewinnst Elo-Punkte, Saison-Punkte und XP.</li>
                <li><strong>Niederlage:</strong> Du verlierst Elo-Punkte und Saison-Punkte. Du verlierst <strong>keine</strong> XP.</li>
                <li><strong>Fairness:</strong> Gewinnst du gegen einen stärkeren Spieler (höheres Elo), erhältst du mehr Punkte. Verlierst du gegen einen stärkeren Spieler, verlierst du nur wenige Punkte.</li>
              </ul>
              <p class="mt-2"><strong>Wichtig für Rekruten:</strong> Als Rekrut (niedrigster Rang) musst du erst <strong>5 Grundlagen-Übungen</strong> abschließen, bevor du Wettkampf-Matches spielen darfst.</p>
            </FAQItem>

            <FAQItem title="Wie funktionieren Doppel-Matches?">
              <p>Neben Einzel-Matches kannst du auch <strong>Doppel-Matches</strong> spielen! Im Doppel spielst du mit einem Partner gegen ein anderes Team.</p>

              <p class="mt-3"><strong>📋 Der Ablauf:</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Team bilden:</strong> Du wählst einen Partner (Team A) und zwei Gegner (Team B)</li>
                <li><strong>Anfrage senden:</strong> Das Gegner-Team muss die Anfrage bestätigen</li>
                <li><strong>Coach-Genehmigung:</strong> Nach der Bestätigung muss ein Coach das Match genehmigen und das Ergebnis eintragen</li>
                <li><strong>Punkte:</strong> Alle 4 Spieler erhalten oder verlieren Doppel-Elo-Punkte</li>
              </ul>

              <p class="mt-3"><strong>⚡ Doppel-Elo-System:</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li>Du hast ein <strong>separates Doppel-Elo</strong> (startet bei 800), unabhängig von deinem Einzel-Elo</li>
                <li>Das Team-Elo wird aus dem Durchschnitt der beiden Spieler berechnet</li>
                <li><strong>Beispiel:</strong> Spieler A (Doppel-Elo 900) + Spieler B (Doppel-Elo 1000) = Team-Elo 950</li>
              </ul>

              <p class="mt-3"><strong>🏆 Doppel-Rangliste:</strong></p>
              <p class="mt-1">Es gibt eine eigene Doppel-Rangliste, die du im <strong>Ranglisten-Tab</strong> findest.</p>

              <p class="mt-3"><strong>📊 Punkte-Berechnung:</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Sieg:</strong> Beide Spieler des Gewinnerteams erhalten Doppel-Elo und Saison-Punkte</li>
                <li><strong>Niederlage:</strong> Beide Spieler des Verliererteams verlieren Doppel-Elo und Saison-Punkte</li>
                <li><strong>XP:</strong> Wie beim Einzel erhält nur das Gewinnerteam XP</li>
              </ul>
            </FAQItem>

            <FAQItem title="Kann ich auch Punkte verlieren?">
              <p>Ja, du kannst Punkte verlieren – sogar <strong>XP</strong>, aber nur bei schweren Verstößen!</p>
              <ul class="list-disc list-inside mt-2 space-y-2">
                <li><strong>Match-Niederlage:</strong> Du verlierst Elo und Saison-Punkte. Du verlierst <strong>keine</strong> XP.</li>
                <li><strong>Leichte Verstöße (z.B. hört nicht auf Anweisungen):</strong><br>
                  <strong>-10 Saison-Punkte</strong> und <strong>-5 XP</strong>
                </li>
                <li><strong>Mittlere Verstöße (z.B. trainiert nicht ordentlich):</strong><br>
                  <strong>-20 Saison-Punkte</strong> und <strong>-10 XP</strong>
                </li>
                <li><strong>Schwere Verstöße (z.B. respektloses Verhalten):</strong><br>
                  <strong>-30 Saison-Punkte</strong> und <strong>-20 XP</strong>
                </li>
              </ul>
              <p class="mt-2"><strong>Wichtig:</strong> Strafen treffen dich doppelt – sie ziehen sowohl Saison-Punkte als auch XP ab. Also: Fair bleiben!</p>
            </FAQItem>
          </div>
        </section>

        <!-- Spielmechaniken -->
        <section>
          <h2 class="text-xl font-semibold mb-4 border-b pb-2">Spielmechaniken</h2>
          <div class="space-y-4">
            <FAQItem title="Wie funktioniert das Anwesenheits-Punktesystem?">
              <p class="mb-3"><strong>📅 Punkte für Training-Teilnahme:</strong></p>
              <p>Für jedes Training erhältst du Punkte (Saison & XP). Die Höhe hängt von deinem "Streak" ab:</p>
              <ul class="list-disc list-inside mt-2 space-y-1 mb-3">
                <li><strong>Normale Anwesenheit (1-2x in Folge):</strong> <strong>+3 Punkte</strong></li>
                <li><strong>Streak-Bonus (3-4x in Folge):</strong> <strong>+5 Punkte</strong> ⚡</li>
                <li><strong>Super-Streak (5x oder mehr):</strong> <strong>+6 Punkte</strong> 🔥</li>
              </ul>

              <p class="mt-3 mb-3"><strong>🎯 Mehrfach-Training am selben Tag:</strong></p>
              <p>Wenn du an <strong>mehreren Trainings am selben Tag</strong> teilnimmst:</p>
              <ul class="list-disc list-inside mt-2 space-y-1 mb-3">
                <li><strong>1. Training des Tages:</strong> Volle Punkte (3/5/6 je nach Streak)</li>
                <li><strong>2. Training des Tages:</strong> Halbe Punkte (aufgerundet)</li>
              </ul>

              <p class="mt-3"><strong>⚠️ Wichtig:</strong> Wenn du ein Training verpasst, wird dein Streak auf Null zurückgesetzt.</p>
            </FAQItem>

            <FAQItem title="Wie funktionieren Übungen und Punkte?">
              <p>Übungen sind in <strong>drei Schwierigkeitsstufen</strong> eingeteilt: Leicht, Mittel und Schwer.</p>

              <div class="mt-2 overflow-x-auto">
                <table class="min-w-full border border-gray-300 text-sm">
                  <thead class="bg-gray-100">
                    <tr>
                      <th class="border border-gray-300 px-2 py-1">Dein Level</th>
                      <th class="border border-gray-300 px-2 py-1">Leichte Übung</th>
                      <th class="border border-gray-300 px-2 py-1">Mittlere Übung</th>
                      <th class="border border-gray-300 px-2 py-1">Schwere Übung</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td class="border border-gray-300 px-2 py-1">Rekrut/Bronze</td><td class="border border-gray-300 px-2 py-1 text-center">5 P.</td><td class="border border-gray-300 px-2 py-1 text-center">8 P.</td><td class="border border-gray-300 px-2 py-1 text-center">10 P.</td></tr>
                    <tr><td class="border border-gray-300 px-2 py-1">Silber/Gold</td><td class="border border-gray-300 px-2 py-1 text-center">6 P.</td><td class="border border-gray-300 px-2 py-1 text-center">10 P.</td><td class="border border-gray-300 px-2 py-1 text-center">12 P.</td></tr>
                    <tr><td class="border border-gray-300 px-2 py-1">Platin/Champion</td><td class="border border-gray-300 px-2 py-1 text-center">8 P.</td><td class="border border-gray-300 px-2 py-1 text-center">12 P.</td><td class="border border-gray-300 px-2 py-1 text-center">18 P.</td></tr>
                  </tbody>
                </table>
              </div>

              <p class="mt-2"><strong>Wichtig:</strong> Je höher dein Level, desto mehr Punkte bekommst du für dieselbe Übung.</p>
            </FAQItem>

            <FAQItem title="Was sind Meilenstein-Übungen und -Challenges?">
              <p>Manche Übungen und Challenges verwenden ein <strong>abgestuftes Punktesystem</strong> mit Meilensteinen.</p>

              <p class="mt-3"><strong>📊 Beispiel: Endlos-Aufschlag-Übung</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1 bg-indigo-50 p-3 rounded">
                <li>1× geschafft → <strong>3 Punkte</strong></li>
                <li>3× geschafft → <strong>+5 Punkte</strong> (insgesamt 8 Punkte)</li>
                <li>5× geschafft → <strong>+8 Punkte</strong> (insgesamt 16 Punkte)</li>
              </ul>

              <p class="mt-3"><strong>Wie funktioniert es?</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li>Die Punkte sind <strong>kumulativ</strong></li>
                <li>Jeder Meilenstein kann <strong>nur einmal pro Saison</strong> erreicht werden</li>
                <li>Nach dem Saison-Reset kannst du alle Meilensteine erneut erreichen!</li>
              </ul>
            </FAQItem>

            <FAQItem title="Wie funktioniert der Saison-Reset?">
              <p>Jede <strong>6 Wochen</strong> (42 Tage) wird eine neue Saison gestartet. Der Reset erfolgt <strong>automatisch um Mitternacht</strong>.</p>

              <p class="mt-3"><strong>Was wird zurückgesetzt?</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Saison-Punkte:</strong> Werden auf 0 zurückgesetzt</li>
                <li><strong>Liga-Platzierungen:</strong> Top 2 jeder Liga steigen auf, Bottom 2 steigen ab</li>
                <li><strong>Meilenstein-Fortschritt:</strong> Alle Meilensteine können erneut erreicht werden</li>
              </ul>

              <p class="mt-3"><strong>Was bleibt erhalten?</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Einzel-Elo & Doppel-Elo:</strong> Bleiben permanent</li>
                <li><strong>XP (Erfahrungspunkte):</strong> Werden nie zurückgesetzt</li>
                <li><strong>Rang:</strong> Ist permanent</li>
                <li><strong>Grundlagen-Abschlüsse:</strong> Bleiben abgeschlossen</li>
              </ul>
            </FAQItem>

            <FAQItem title="Wie funktionieren die Ränge und das Leaderboard?">
              <p>Dein Rang ist <strong>permanent</strong> und wird nie zurückgesetzt. Um aufzusteigen, musst du bestimmte Meilensteine bei <strong>Elo</strong> und <strong>XP</strong> erreichen.</p>

              <p class="mt-2"><strong>Die Ränge und ihre Anforderungen:</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-2">
                <li><strong>🥉 Rekrut (Start):</strong> 0-49 XP, 800-849 Elo, 0 Grundlagen</li>
                <li><strong>🥉 Bronze:</strong> 50+ XP, 850+ Elo, 5 Grundlagen</li>
                <li><strong>🥈 Silber:</strong> 200+ XP, 900+ Elo</li>
                <li><strong>🥇 Gold:</strong> 500+ XP, 1000+ Elo</li>
                <li><strong>💎 Platin:</strong> 1000+ XP, 1100+ Elo</li>
                <li><strong>👑 Champion:</strong> 1800+ XP, 1300+ Elo</li>
              </ul>

              <p class="mt-2"><strong>Das Leaderboard (Ranglisten):</strong></p>
              <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>💪 Fleiß (XP):</strong> Rangliste basierend auf Erfahrungspunkten</li>
                <li><strong>⭐ Season (Punkte):</strong> Aktuelle Saison-Rangliste</li>
                <li><strong>⚡ Skill (Elo):</strong> Rangliste basierend auf Einzel-Elo</li>
                <li><strong>🏆 Ränge (Level):</strong> Spieler gruppiert nach Rang</li>
                <li><strong>🎾 Doppel (Teams):</strong> Doppel-Rangliste mit Team-Kombinationen</li>
              </ul>
              <p class="mt-2 text-sm italic text-gray-600">Du kannst im Ranglisten-Tab einstellen, welche Ranglisten du sehen möchtest.</p>
            </FAQItem>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

// FAQ Item Component
const FAQItem = {
  props: ['title'],
  template: `
    <details class="group">
      <summary class="flex justify-between items-center cursor-pointer">
        <span class="font-medium">{{ title }}</span>
        <svg class="h-6 w-6 transform transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div class="mt-2 text-gray-700">
        <slot></slot>
      </div>
    </details>
  `
}

const userStore = useUserStore()

const backLink = computed(() => {
  if (!userStore.isAuthenticated) return '/'
  const role = userStore.userData?.role
  if (role === 'admin') return '/admin'
  if (role === 'coach') return '/coach'
  return '/dashboard'
})
</script>

<style scoped>
details > summary {
  list-style: none;
}
details > summary::-webkit-details-marker {
  display: none;
}
</style>
