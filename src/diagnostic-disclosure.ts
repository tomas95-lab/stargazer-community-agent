// Only these reviewed strings can leave the diagnostic subsystem as draft text.
export const DIAGNOSTIC_COPY = Object.freeze({
  unrestricted: 'I don\'t see any EQ restriction or active throttle on your account. Please refresh the page and try again.',
  review: 'Thanks for flagging this. A QM needs to verify your account and project status before confirming why tasks are unavailable.',
  access: 'Your task access for this project requires a QM review. Please contact the project support team so they can check the appropriate next steps.',
  moneyHeistQualityReassigned: 'You were reassigned from Money Heist due to quality requirements and can no longer task on this project. Please check your dashboard for your current project assignment.',
  limited: 'Your task access is temporarily limited. Please check your dashboard for updates; a QM can review the next steps if the limit persists.',
  empty: 'The project is currently reporting an empty queue. Please check your dashboard for updates as more work becomes available.',
});

const ALLOWED_COPY = new Set<string>(Object.values(DIAGNOSTIC_COPY));
// Reviewed operational explanations for the QM, never contributor reply text.
const ALLOWED_REASONS = new Set([
  'Diagnostic query is still running. Retry to continue the same query.',
  'Diagnostic draft validation failed.',
  'Unified query completed, but AI draft generation failed. Retry the draft.',
  'Identity or project permission could not be verified.',
  'Apply the confirmed project-specific access policy.',
  'Project tag policy was not checked.',
  'Verified individual queue has no EQ restriction or active throttle.',
  'Missing or contradictory state flags.',
  'Project availability was not returned by the query. EQ cannot be confirmed.',
  'Account restriction or throttle evidence is incomplete.',
  'Project availability signals contradict each other.',
  'An unexpired project-specific throttle was found. Limits and internal details are withheld.',
  'A throttle-related tag exists, but it does not confirm an active throttle.',
  'An onboarding-related tag needs corroboration against course completion.',
  'An unmapped project tag was found. Its meaning cannot be assumed.',
  'Project source reports an empty queue. Task quantities are withheld.',
  'No confirmed, safely disclosable cause. Task quantities are withheld.',
  'Identity ambiguous or missing.',
  'Status missing or ambiguous.',
  'Diagnostic queries need updating.',
  'Diagnostic lookup unavailable.',
  'Diagnostic query failed.',
  'Diagnostic timeout.',
]);
const SENSITIVE_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b[a-f\d]{24,}\b|\b(?:sk-|sb_secret_|api[_ -]?key|password|bearer\s|quality\s+score|disable_reason)|\d|https?:\/\//i;

export function sealDiagnosticDraft(value: unknown) {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = typeof candidate.reply === 'string' ? candidate.reply : '';
  if (candidate.diagnosticVersion === 3) {
    // Only the internal v3 generator sets this marker. Drop arbitrary extra data.
    const privateData = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b[a-f\d]{24}\b|\b(?:sk-ant-|sb_secret_|bearer\s|api[_ -]?key|password)/i;
    const reason = typeof candidate.reason === 'string' ? candidate.reason : '';
    if (!text || !reason || text.length > 4000 || reason.length > 4000 || privateData.test(`${text}\n${reason}`)) {
      return sealDiagnosticDraft({ reply: DIAGNOSTIC_COPY.review, reason: 'Diagnostic draft validation failed.' });
    }
    return { action: 'human' as const, confidence: 0, draftOnly: true as const,
      ...(candidate.diagnosticPending === true ? { diagnosticPending: true } : {}),
      diagnosticResolved: candidate.diagnosticResolved === true,
      reason, reply: text.replace(/\u2014/g, ','), guidelineSnippets: [] as string[], diagnosticVersion: 3 as const };
  }
  const allowed = ALLOWED_COPY.has(text) && !SENSITIVE_PATTERN.test(text);
  // Reconstruct rather than spread: discard raw rows, identifiers, errors, notes, etc.
  return {
    action: 'human' as const,
    ...(candidate.diagnosticPending === true ? { diagnosticPending: true } : {}),
    confidence: 0,
    draftOnly: true as const,
    reason: allowed && typeof candidate.reason === 'string' && ALLOWED_REASONS.has(candidate.reason)
      ? candidate.reason : 'The diagnostic did not provide a recognized reason. Generate a new draft with the updated backend; this result does not establish an account restriction.',
    reply: allowed ? text : DIAGNOSTIC_COPY.review,
    guidelineSnippets: [] as string[],
  };
}
