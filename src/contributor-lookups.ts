export interface ContributorLookup {
  id: string;
  title: string;
  sql: string;
  parameters: string[];
}
const scoped = ['contributor_id', 'project_id'];
export const CONTRIBUTOR_LOOKUPS: ContributorLookup[] = [
  { id: '01', title: 'Exact contributor identity', parameters: ['email_primary', 'email_alternate', 'email_legacy', 'email_legacy_alternate'], sql: `
SELECT u._id AS "contributor_id", LOWER(u.email) AS "email"
FROM PUBLIC.USERS u
WHERE LOWER(u.email) IN (LOWER('{{email_primary}}'), LOWER('{{email_alternate}}'),
  LOWER('{{email_legacy}}'), LOWER('{{email_legacy_alternate}}'))
  AND COALESCE(u.__DELETED, FALSE) = FALSE
LIMIT 2` },
  { id: '02', title: 'Project association snapshot', parameters: scoped, sql: `
SELECT up.PROJECT_ID AS "project_id", up.IS_USER_QUALIFIED AS "qualified_signal",
  up.EMPTY_QUEUE_STATUS AS "individual_eq_signal", up.LAST_MOVEMENT AS "observed_at"
FROM PUBLIC.USERPROJECTPRIORITIES up
WHERE up.USER_ID = '{{contributor_id}}' AND up.PROJECT_ID = '{{project_id}}'
ORDER BY up.LAST_MOVEMENT DESC NULLS LAST LIMIT 5` },
  { id: '03', title: 'Project permission evidence', parameters: scoped, sql: `
SELECT wpp.PROJECT_ID AS "project_id", TRUE AS "permission_record_found"
FROM VIEW.DIM_WORKER_PROJECT_PERMISSIONS wpp
WHERE wpp.WORKER = '{{contributor_id}}' AND wpp.PROJECT_ID = '{{project_id}}'
LIMIT 2` },
  { id: '04', title: 'Project access review signal', parameters: scoped, sql: `
SELECT d.PROJECT_ID AS "project_id", d.TNS_DISABLE AS "disabled_signal",
  d.TNS_DISABLE_DATE AS "observed_at"
FROM VIEW.USER_PROJECT_DISABLEMENTS d
WHERE d.USER_ID = '{{contributor_id}}' AND d.PROJECT_ID = '{{project_id}}'
ORDER BY d.TNS_DISABLE_DATE DESC NULLS LAST LIMIT 1` },
  { id: '05', title: 'Quality evidence availability - no scores', parameters: scoped, sql: `
SELECT q.PROJECT_ID AS "project_id", (q.FINAL_SCORE IS NOT NULL) AS "quality_evidence_found",
  q.WEEK AS "observed_at"
FROM VIEW.CONTRIBUTOR_PROJECT_WEEKLY_QUALITY_SCORE q
WHERE q.WORKER_ID = '{{contributor_id}}' AND q.PROJECT_ID = '{{project_id}}'
ORDER BY q.WEEK DESC NULLS LAST LIMIT 1` },
  { id: '06', title: 'Active project throttle signal', parameters: scoped, sql: `
SELECT '{{project_id}}' AS "project_id", EXISTS (
  SELECT 1 FROM VIEW.THROTTLED_WORKERS t
  WHERE t.USER_ID = '{{contributor_id}}' AND t.PROJECT_ID = '{{project_id}}'
    AND t.THROTTLE_ENABLED = TRUE
    AND t.START_TIME <= CURRENT_TIMESTAMP()
    AND t.EXPIRATION_TIME > CURRENT_TIMESTAMP()
) AS "active_throttle_signal"` },
  { id: '07', title: 'Recent task limit event - no limits', parameters: scoped, sql: `
SELECT r.PROJECT_ID AS "project_id", TRUE AS "recent_throttle_event_found",
  (r.WORK_PERIOD_END > CURRENT_TIMESTAMP()) AS "event_window_still_open",
  r.ARRIVAL_TIME AS "observed_at"
FROM EVENTS.TASKER_THROTTLE_REASON r
WHERE r.USER_ID = '{{contributor_id}}' AND r.PROJECT_ID = '{{project_id}}'
  AND r.ARRIVAL_TIME >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
ORDER BY r.ARRIVAL_TIME DESC LIMIT 1` },
  { id: '08', title: 'Onboarding evidence - scope preserved', parameters: scoped, sql: `
SELECT 'ACCOUNT_ONBOARDING' AS "scope", TO_VARCHAR(g.HAS_COMPLETED_ONBOARDING) AS "completion_signal",
  g.UPDATED_AT::TIMESTAMP_NTZ AS "observed_at"
FROM PUBLIC.USERONBOARDINGSTATES g WHERE g.USER_ID = '{{contributor_id}}'
UNION ALL
SELECT 'PROJECT_ONBOARDING', TO_VARCHAR(p.HAS_COMPLETED_ONBOARDING), p.USER_UPDATED_AT::TIMESTAMP_NTZ
FROM PUBLIC.PROJECTONBOARDINGSTATES p
WHERE p.USER_ID = '{{contributor_id}}' AND p.PROJECT_ID = '{{project_id}}'
UNION ALL
SELECT 'PROJECT_COURSE_RECORD', TO_VARCHAR(c.COMPLETED_AT IS NOT NULL), c.COMPLETED_AT::TIMESTAMP_NTZ
FROM PUBLIC.COURSEPROGRESSV2 c
WHERE c.WORKER = '{{contributor_id}}' AND c.PROJECT_ID = '{{project_id}}'
ORDER BY "observed_at" DESC NULLS LAST LIMIT 20` },
  { id: '09', title: 'Recent project EQ evidence - no raw reasons', parameters: scoped, sql: `
SELECT e.PROJECT_ID AS "project_id", TRUE AS "recent_eq_event_found", e.CREATED_AT AS "observed_at"
FROM VIEW.EQ_REASONS e
WHERE e.WORKER_ID = '{{contributor_id}}' AND e.PROJECT_ID = '{{project_id}}'
  AND e.CREATED_AT >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
ORDER BY e.CREATED_AT DESC LIMIT 1` },
  { id: '10', title: 'Individual queue snapshot - unknown preserved', parameters: scoped, sql: `
SELECT '{{project_id}}' AS "project_id", CASE
  WHEN up.EMPTY_QUEUE_STATUS = TRUE THEN 'INDIVIDUAL_EQ_SIGNAL'
  WHEN up.EMPTY_QUEUE_STATUS = FALSE THEN 'INDIVIDUAL_NOT_EQ_SIGNAL'
  ELSE 'UNKNOWN' END AS "queue_signal", up.LAST_MOVEMENT AS "observed_at"
FROM (SELECT 1) seed
LEFT JOIN PUBLIC.USERPROJECTPRIORITIES up
  ON up.USER_ID = '{{contributor_id}}' AND up.PROJECT_ID = '{{project_id}}'
QUALIFY ROW_NUMBER() OVER (ORDER BY up.LAST_MOVEMENT DESC NULLS LAST) = 1` },
  { id: '11', title: 'Recent assignment evidence - no operator identities', parameters: scoped, sql: `
SELECT TRUE AS "project_assignment_event_found", a.START_TIME AS "observed_at"
FROM PUBLIC.USERPROJECTASSIGNMENTSLOGENTRIES a
WHERE a.USER_ID = '{{contributor_id}}'
  AND ARRAY_CONTAINS(TO_VARIANT('{{project_id}}'), a.MOVED_TO_PROJECT_IDS)
  AND a.START_TIME >= DATEADD('day', -14, CURRENT_TIMESTAMP())
ORDER BY a.START_TIME DESC LIMIT 10` },
  { id: '12', title: 'Scoped tag evidence - no names or descriptions', parameters: [...scoped, 'project_tag_prefix'], sql: `
SELECT '{{project_id}}' AS "project_id", EXISTS (
  SELECT 1 FROM VIEW.USER_TAGS_LONG t
  WHERE t.USER_ID = '{{contributor_id}}'
    AND LENGTH('{{project_tag_prefix}}') > 0
    AND STARTSWITH(LOWER(t.NAME), LOWER('{{project_tag_prefix}}') || '_')
) AS "scoped_tag_evidence_found", EXISTS (
  SELECT 1 FROM VIEW.USER_TAGS_LONG t
  WHERE t.USER_ID = '{{contributor_id}}'
    AND LENGTH('{{project_tag_prefix}}') > 0
    AND LOWER(t.NAME) = LOWER('{{project_tag_prefix}}') || '_disabled'
) AS "disabled_tag_present"` },
  { id: '13', title: 'Project queue layer signals - no counts', parameters: ['project_id'], sql: `
WITH layers AS (SELECT -1 AS review_level UNION ALL SELECT 0),
signals AS (
  SELECT hn.REVIEW_LEVEL, COUNT_IF(hn.WORKER IS NULL) > 0 AS has_pending_unclaimed
  FROM PUBLIC.PIPELINEV3HUMANNODES hn
  WHERE hn.PROJECT = '{{project_id}}' AND hn.STATUS = 'pending'
    AND hn.REVIEW_LEVEL IN (-1, 0)
  GROUP BY hn.REVIEW_LEVEL
)
SELECT '{{project_id}}' AS "project_id", l.REVIEW_LEVEL AS "layer",
  CASE WHEN COALESCE(s.has_pending_unclaimed, FALSE)
    THEN 'PENDING_UNCLAIMED_NODES_EXIST' ELSE 'NO_PENDING_UNCLAIMED_NODES' END AS "queue_signal"
FROM layers l LEFT JOIN signals s ON s.REVIEW_LEVEL = l.REVIEW_LEVEL
ORDER BY l.REVIEW_LEVEL` },
];

export function lookupEmails(username: string): Record<string, string> {
  if (!/^latam\.coder\d{1,8}$/i.test(username)) throw new Error('Unsupported contributor username.');
  const name = username.toLowerCase();
  return { email_primary: `${name}@remotasks.com+outlier`, email_alternate: `${name}@outlier.ai`,
    email_legacy: `${name}@remotasks.com`, email_legacy_alternate: `${name}@outlier.ai+outlier` };
}

export function summarizeLookup(id: string, rows: Array<Record<string, unknown>>) {
  if (id === '01') return { matched: rows.length === 1, ambiguous: rows.length > 1 };
  const booleanFields = ['qualified_signal', 'individual_eq_signal', 'permission_record_found', 'disabled_signal',
    'quality_evidence_found', 'active_throttle_signal', 'recent_throttle_event_found', 'event_window_still_open',
    'recent_eq_event_found', 'project_assignment_event_found', 'scoped_tag_evidence_found', 'disabled_tag_present'];
  const statuses = new Set(['UNKNOWN', 'INDIVIDUAL_EQ_SIGNAL', 'INDIVIDUAL_NOT_EQ_SIGNAL', 'PENDING_UNCLAIMED_NODES_EXIST', 'NO_PENDING_UNCLAIMED_NODES']);
  return { evidenceFound: rows.length > 0, signals: rows.map(row => {
    const safe: Record<string, unknown> = {};
    for (const field of booleanFields) if (typeof row[field] === 'boolean') safe[field] = row[field];
    if (typeof row.queue_signal === 'string' && statuses.has(row.queue_signal)) safe.queue_signal = row.queue_signal;
    if (id === '08') {
      if (['ACCOUNT_ONBOARDING', 'PROJECT_ONBOARDING', 'PROJECT_COURSE_RECORD'].includes(String(row.scope))) safe.scope = row.scope;
      safe.completedRecord = row.completion_signal === 'true' ? true : row.completion_signal === 'false' ? false : null;
    }
    if (id === '13' && [-1, 0].includes(Number(row.layer))) safe.layer = Number(row.layer);
    return safe;
  }) };
}
