const PROFILES = [
  { id: 'new', username: 'alex.demo', name: 'Alex Morgan', scenario: 'New contributor: 1 task / 24h', cause: 'throttle', limit: 1, hours: 24, submitted: 1, remaining: 6, scores: [4, 3], overall: 3.5 },
  { id: 'normal', username: 'priya.demo', name: 'Priya Shah', scenario: 'Normal contributor: 1 task / 24h', cause: 'throttle', limit: 1, hours: 24, submitted: 1, remaining: 4, scores: [2, 3, 4], overall: 3 },
  { id: 'untrusted', username: 'marco.demo', name: 'Marco Silva', scenario: 'Limited contributor: 1 task / 72h', cause: 'throttle', limit: 1, hours: 72, submitted: 1, remaining: 30, scores: [1, 1, 4], overall: 2 },
  { id: 'trusted', username: 'sofia.demo', name: 'Sofia Chen', scenario: 'Trusted contributor: 6 tasks / 24h', cause: 'throttle', limit: 6, hours: 24, submitted: 6, remaining: 3, scores: [3, 4, 4], overall: 3.8 },
  { id: 'quality', username: 'jordan.demo', name: 'Jordan Lee', scenario: 'Reallocated for quality', cause: 'quality', limit: null, hours: null, submitted: 0, remaining: null, scores: [2, 2, 3], overall: 2.5 },
  { id: 'demoted', username: 'taylor.demo', name: 'Taylor Kim', scenario: 'Reviewer moved to attempter', cause: 'demoted', limit: null, hours: null, submitted: 0, remaining: null, scores: [2, 3], overall: 2.5 },
  { id: 'empty', username: 'sam.demo', name: 'Sam Rivera', scenario: 'Project empty queue', cause: 'project_empty', limit: null, hours: null, submitted: 0, remaining: null, scores: [4, 4, 5], overall: 4.2 },
  { id: 'healthy', username: 'riley.demo', name: 'Riley Park', scenario: 'Active account, no restrictions', cause: 'healthy', limit: null, hours: null, submitted: 0, remaining: null, scores: [4, 5, 4], overall: 4.3 },
] as const;

export function demoDiagnosticProfiles() {
  return PROFILES.map(({ id, username, name, scenario }) => ({ id, username, name, scenario }));
}

export function demoDiagnosticPreview(username: string, message: string, now = new Date()) {
  const profile = PROFILES.find(item => item.username === username);
  if (!profile) throw new Error('Choose a fictional contributor from the demo list. Real usernames are not supported.');
  const qms = Math.round(profile.scores.reduce((sum, score) => sum + score, 0) / profile.scores.length * 100) / 100;
  const pdr = Math.round(profile.scores.filter(score => score <= 2).length / profile.scores.length * 100);
  const resetAt = profile.remaining === null ? null : new Date(now.getTime() + profile.remaining * 3600000).toISOString();
  let reply: string;
  if (/another chance|more chance|otra oportunidad|reactivat|restore.*access/i.test(message)) {
    reply = 'I appreciate you taking the feedback on board. I cannot authorize another chance or restore your project access myself.';
    if (profile.cause !== 'quality' && profile.cause !== 'demoted') reply = 'Your account has not been removed from Aurora. ' + (profile.cause === 'throttle' ? `Your current task limit resets in ${profile.remaining} hours.` : 'There is no reactivation required.');
  } else if (/score|qms|pdr|quality|calificaci|puntaje/i.test(message)) {
    reply = `Your overall average score is ${profile.overall}. Your latest ${profile.scores.length} reviewed tasks scored ${profile.scores.join(', ')}, with an average of ${qms} and a defect rate of ${pdr}%.`;
  } else if (profile.cause === 'throttle') {
    reply = `Hello! You have reached your limit of ${profile.limit} ${profile.limit === 1 ? 'task' : 'tasks'} every ${profile.hours} hours. That is why you are currently EQ. Your active limit resets in ${profile.remaining} hours.`;
  } else if (profile.cause === 'quality') {
    reply = `Hello! You were reallocated from Aurora due to quality considerations (average score: ${profile.overall}). That is why you are no longer seeing available tasks.`;
  } else if (profile.cause === 'demoted') {
    reply = 'Hello! Your role on Aurora was changed from reviewer to attempter following your recent reviews. You no longer have access to reviewer tasks; check the attempter queue on your dashboard.';
  } else if (profile.cause === 'project_empty') {
    reply = 'Hello! Aurora is currently EQ, so there are no tasks available right now. Your account is active and has no restrictions. Please check back later.';
  } else {
    reply = "Hello! I don't see any EQ restriction or active throttle on your account. Please refresh the page and try again.";
  }
  return { status: 'complete' as const, simulated: true as const,
    draft: { action: 'human' as const, draftOnly: true as const, reply,
      reason: `Fictional scenario: ${profile.scenario}. This is a deterministic demo, not a real query or AI response.` },
    evidence: { contributor: profile.username, project: 'Aurora Community Demo',
      accountStatus: profile.cause === 'quality' ? 'Reallocated' : profile.cause === 'demoted' ? 'Attempter' : 'Active',
      projectHasTasks: profile.cause !== 'project_empty', activeThrottle: profile.cause === 'throttle',
      taskLimit: profile.limit, windowHours: profile.hours, submittedInWindow: profile.submitted,
      resetsAt: resetAt, overallQms: profile.overall, recentQms: qms, recentScores: [...profile.scores], pdrPercent: pdr },
  };
}
