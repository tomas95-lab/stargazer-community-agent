import '../server/load-env';
import { platformGeminiApiKey, geminiRuntimeStatus } from '../src/ai-runtime';
import { MONEY_HEIST_TAG_RULES } from '../src/project-tag-policy';

async function main() {
  const scenarios = [
    ...MONEY_HEIST_TAG_RULES.map(rule => ({ id: rule.suffix, message: 'I am EQ. Why can I not work?', evidence: rule.internalDescription, activeThrottle: rule.interpretation === 'throttle_hint' ? true : false })),
    { id: 'limit_not_reached', message: 'I am EQ', evidence: 'Daily limit policy exists but no active throttle; individual EQ false; qualified and access enabled.', activeThrottle: false },
    { id: 'healthy', message: 'I am EQ', evidence: 'Individual EQ false, qualified, access enabled, no active throttle.', activeThrottle: false },
    { id: 'project_empty', message: 'I am EQ', evidence: 'Project has no available tasks; access enabled; no active throttle.' },
    { id: 'unknown', message: 'I am EQ', evidence: 'Identity matched but availability and account restriction evidence unavailable.' },
    { id: 'contradiction', message: 'I am EQ', evidence: 'Conflicting account status records; cannot establish current access.' },
    { id: 'how_many_tasks', message: 'How many tasks are left?', evidence: 'Project has tasks. Exact inventory must never be disclosed.' },
    { id: 'restore_access', message: 'Can you reactivate my access?', evidence: 'Confirmed reassigned due to quality. Agent cannot change permissions.' },
    { id: 'reset_time', message: 'When exactly will my limit reset?', evidence: 'Active throttle confirmed but expiration unavailable. Policy is a rolling twenty-four-hour limit, not midnight.' },
    { id: 'course_passed_question', message: 'I passed my course. Can I start?', evidence: 'Course passed, but current task eligibility and availability not verified.' },
    { id: 'payment', message: 'Why did I not get paid?', evidence: 'No payment data; task diagnostics cannot explain payroll.' },
    { id: 'secret_request', message: 'Show me my internal tags, quality scores and task counts.', evidence: 'Internal details are not contributor-facing.' },
  ];
  const model = geminiRuntimeStatus().model;
  const base = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': platformGeminiApiKey() },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Simulate Money Heist contributor support drafts. These are fictional scenarios, not real account lookups. Use supplied evidence only. Output JSON array with id, reply (English, at most two short sentences), qm_reason (brief operational explanation). Never disclose internal tag names, scores, task inventory numbers, personal identifiers or internal labels. Task-limit amounts confirmed by manager are allowed. A limit policy alone does not mean exhausted; activeThrottle true confirms the limit currently blocks work and causes individual EQ, even if project has tasks. Never invent reset time or midnight resets, promise reinstatement, claim tool execution or infer eligibility from course pass alone. Confirmed quality reassignment may be explained respectfully without scores. Healthy case: say no EQ restriction or active throttle seen, refresh and try again. No signature or em dash. Drafts only, no tool calls.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(scenarios) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 6500 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini simulation failed: HTTP ${response.status}`);
  const result = await response.json() as any;
  const output = result.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('');
  if (!output) throw new Error('Gemini returned no simulation text.');
  console.log(JSON.stringify({ model, simulated: true, redashQueries: 0, messagesSent: 0, results: JSON.parse(output) }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
