import '../server/load-env';
import { platformGeminiApiKey, geminiRuntimeStatus } from '../src/ai-runtime';

async function main() {
  const isFollowUp = process.argv.includes('--second-chance');
  // Explicitly selected, user-approved facts only; no Redash access or identifiers.
  const prompt = {
    task: 'Return only an English contributor-facing draft answering the message. This is a private test; do not execute actions.',
    message: 'I am EQ',
    facts: {
      project: 'Money Heist',
      confirmedStatus: 'Reallocated from this project due to quality considerations; cannot continue tasking on this project.',
      overallAverageScore: 2.25,
      assignmentToAnotherProjectVerified: false,
    },
    writingRules: [
      'Be warm, clear, direct and concise. A greeting like Hello! How are you? is appropriate.',
      'Explain the confirmed cause of unavailable tasks, not internal diagnostic mechanics.',
      'The manager approves disclosing the overall average score of 2.25.',
      'Do not claim a new project assignment exists; only reallocation from Money Heist is verified.',
      'Do not add the phrase This is an access restriction, not an active throttle, or similar technical comparisons.',
      'Do not invent facts, recommend a generic QM review instead of the confirmed cause, add a signature, or use an em dash.',
    ],
    toneReference: 'Hello! How are you? You were reallocated from Money Heist due to quality considerations (average score: 2.25). That\'s why you\'re no longer seeing available tasks.',
  };
  if (isFollowUp) {
    prompt.message = 'Could I have one more chance? Honestly, the last two pieces of feedback I received made it very clear what I was doing wrong.';
    Object.assign(prompt, {
      previousAssistantReply: 'Hello! How are you? You were reallocated from Money Heist due to quality considerations, as your overall average score on the project is 2.25. That is why you are no longer seeing available tasks for this project.',
      additionalFacts: 'No reinstatement or appeal policy, reopening date, or authority to restore access has been provided. The contributor reports understanding the feedback; no new performance evidence has been supplied.',
    });
    prompt.toneReference = 'Warm, direct conversational continuation. Acknowledge the new point and answer the request instead of restating the earlier diagnosis.';
    prompt.writingRules = [
      'This is a follow-up in an ongoing conversation. Do not greet again.',
      'Respond to the new request for another chance, not the already answered question about EQ.',
      'Briefly acknowledge that the contributor understood the feedback without claiming improved performance.',
      'You are the support assistant, not the contributor. Attribute understanding to them: I appreciate you taking the feedback on board. Never say I understand the feedback now as if you received it.',
      'Explain that you cannot authorize another chance or restore project access yourself.',
      'Do not repeat the score, quality metrics, or prior diagnosis unless specifically asked about them.',
      'Do not claim the decision is permanent, invent an appeal procedure, promise reinstatement, or say you escalated anything.',
      'If no approved next step is provided, do not fabricate one. Use at most three short sentences in natural English.',
      'No signature, em dash, generic review boilerplate, or mention of internal system mechanics.',
    ];
  }
  const model = geminiRuntimeStatus().model;
  const base = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': platformGeminiApiKey() },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: JSON.stringify({ facts: prompt.facts, writingRules: prompt.writingRules, toneReference: prompt.toneReference }) }] },
      contents: isFollowUp ? [
        { role: 'user', parts: [{ text: 'I am EQ' }] },
        { role: 'model', parts: [{ text: 'Hello! How are you? You were reallocated from Money Heist due to quality considerations (average score: 2.25). That is why you are no longer seeing available tasks.' }] },
        { role: 'user', parts: [{ text: prompt.message }] },
      ] : [{ role: 'user', parts: [{ text: JSON.stringify(prompt) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}. No fallback used.`);
  const result = await response.json() as any;
  const text = result.candidates?.[0]?.content?.parts?.filter((part: any) => !part.thought).map((part: any) => part.text || '').join('');
  if (!text) throw new Error('Gemini returned no draft.');
  console.log(JSON.stringify({ model, draft: text, usage: result.usageMetadata, redashQueries: 0, messagesSent: 0 }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
