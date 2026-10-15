export interface ProjectTagRule {
  suffix: string;
  interpretation: 'access_review' | 'quality_reassigned' | 'throttle_hint' | 'onboarding_hint' | 'informational';
  internalDescription: string;
}

// Meanings confirmed by the Money Heist project manager; reply text is separately allowlisted.
export const MONEY_HEIST_TAG_RULES: readonly ProjectTagRule[] = [
  { suffix: 'disabled', interpretation: 'quality_reassigned', internalDescription: 'Project task access removed and contributor reassigned due to quality requirements.' },
  { suffix: 'new_contributor', interpretation: 'throttle_hint', internalDescription: 'New contributor: not enough reads evaluated yet, throttled to 2 tasks / 24h' },
  { suffix: 'throttled_attempter', interpretation: 'throttle_hint', internalDescription: 'Throttled to 2 tasks / 24h' },
  { suffix: 'trusted_attempter', interpretation: 'throttle_hint', internalDescription: 'Trusted contributor, throttled to 6 tasks / 24h' },
  { suffix: 'new_reviewer', interpretation: 'throttle_hint', internalDescription: 'New reviewer: not enough reads evaluated yet, throttled to 4 reviews / 24h' },
  { suffix: 'throttled_reviewer', interpretation: 'throttle_hint', internalDescription: 'Throttled to 4 reviews / 24h' },
  { suffix: 'trusted_reviewer', interpretation: 'informational', internalDescription: 'Trusted reviewer, unthrottled (on track to L12)' },
  { suffix: 'course_intro_complete', interpretation: 'onboarding_hint', internalDescription: 'Completed the intro course module (pending pass/fail grading)' },
  { suffix: 'course_intro_pass', interpretation: 'informational', internalDescription: 'Passed the intro course module' },
  { suffix: 'course_intro_fail', interpretation: 'onboarding_hint', internalDescription: 'Failed the intro course module' },
];

export function projectTagPolicy(projectId: string) {
  return projectId === '6a96fa0eeb622ed112e30794'
    ? { prefix: 'money_heist', rules: MONEY_HEIST_TAG_RULES, descriptionsVerified: true }
    : null;
}

export function interpretProjectTags(projectId: string, tagNames: string[]) {
  const policy = projectTagPolicy(projectId);
  const names = new Set(tagNames.map(name => name.toLowerCase()));
  const matched = policy?.rules.filter(rule => names.has(`${policy.prefix}_${rule.suffix}`)) || [];
  return {
    checked: Boolean(policy),
    accessReview: matched.some(rule => rule.interpretation === 'access_review' || rule.interpretation === 'quality_reassigned'),
    qualityReassigned: matched.some(rule => rule.interpretation === 'quality_reassigned'),
    throttleHint: matched.some(rule => rule.interpretation === 'throttle_hint'),
    onboardingHint: matched.some(rule => rule.interpretation === 'onboarding_hint'),
    informational: matched.some(rule => rule.interpretation === 'informational'),
    unknownTag: Boolean(policy && [...names].some(name => name.startsWith(`${policy.prefix}_`) && !policy.rules.some(rule => name === `${policy.prefix}_${rule.suffix}`))),
  };
}
