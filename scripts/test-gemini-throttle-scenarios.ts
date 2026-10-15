import '../server/load-env';
import { platformGeminiApiKey, geminiRuntimeStatus } from '../src/ai-runtime';

async function main() {
  const projectEmpty = process.argv.includes('--project-empty');
  const scenarios = projectEmpty ? [{
    id: 'project_empty', fictional: true, message: 'Hello! I am EQ. Why am I not seeing any tasks?',
    activeThrottle: false, disabled: false, projectHasTasks: false,
    evidence: 'Verified project-wide empty queue. Contributor access enabled. No refill date or next batch schedule is available.',
  }] : [
    { id: 'new_attempter', tier: 'New Attempter', limit: 1, hours: 24, completedInWindow: 1, windowAnchor: 'first submission' },
    { id: 'untrusted_attempter', tier: 'Untrusted Attempter', limit: 1, hours: 72, completedInWindow: 1, windowAnchor: 'submission' },
    { id: 'normal_attempter', tier: 'Normal Attempter', limit: 1, hours: 24, completedInWindow: 1, windowAnchor: 'submission' },
    { id: 'trusted_attempter', tier: 'Trusted Attempter', limit: 6, hours: 24, completedInWindow: 6, windowAnchor: 'rolling window; exact next release timestamp unavailable' },
  ].map(scenario => ({ ...scenario, fictional: true, message: 'Hello! I am EQ. Why am I not seeing any tasks?', activeThrottle: true, disabled: false, projectHasTasks: true }));
  const model = geminiRuntimeStatus().model;
  const base = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': platformGeminiApiKey() },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: projectEmpty
        ? 'Generate an English contributor-facing support draft for this fictional case. Return JSON array of {id, reply}. Warm, clear, direct and concise. The project is confirmed empty, contributor access is enabled, and no throttle is active. Explain that tasks are unavailable because the project is currently EQ, not due to an account restriction. Do not invent a refill date, guarantee new work, say the contributor should refresh to fix it, promise notifications, or refer to exact inventory numbers. No signature, em dash or generic QM review. Return the actual reply, not an analysis.'
        : 'Generate English contributor-facing support drafts for these entirely fictional cases. Return JSON array of {id, reply}. Warm, direct, concise, natural greeting allowed. These query-equivalent facts are confirmed: each contributor has reached their limit and has an active throttle causing EQ. State their numeric limit and the reset mechanism. New: one task then twenty-four hours after first submission. Untrusted: one every seventy-two hours. Normal: one every twenty-four hours. Trusted: six per rolling twenty-four hours; do not say all six return twenty-four hours after the last or sixth task because that reset rule is not established. No exact timestamps are supplied; invent none. Do not invent score, quality-based causes, review requirements, midnight resets, permanent disablement, or human escalations. Do not disclose exact project inventory or raw tier tags. Do not add a signature or em dash. No generic QM review when active throttle explains the situation. Draft text only inside reply.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(scenarios) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 2200 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}. No fallback used.`);
  const result = await response.json() as any;
  const text = result.candidates?.[0]?.content?.parts?.filter((part: any) => !part.thought).map((part: any) => part.text || '').join('');
  if (!text) throw new Error('Gemini returned no drafts.');
  const drafts = JSON.parse(text);
  console.log(JSON.stringify({ model, scenarios, drafts, usage: result.usageMetadata, redashQueries: 0, messagesSent: 0 }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
