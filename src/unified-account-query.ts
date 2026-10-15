export const UNIFIED_DIAGNOSTIC_VERSION = 3;
export const UNIFIED_DIAGNOSTIC_PARAMETERS = [
  'email_primary', 'email_alternate', 'email_legacy', 'email_legacy_alternate',
  'project_id', 'project_tag_prefix',
];

// Every population is scoped before joining. Ratings and permission rows are
// deduplicated before aggregation, so joins cannot multiply scores or attempts.
export const UNIFIED_DIAGNOSTIC_SQL = `WITH identity_matches AS (
  SELECT u._id, u.tags
  FROM PUBLIC.USERS u
  WHERE LOWER(u.email) IN (LOWER('{{email_primary}}'), LOWER('{{email_alternate}}'),
    LOWER('{{email_legacy}}'), LOWER('{{email_legacy_alternate}}'))
    AND COALESCE(u.__DELETED, FALSE) = FALSE
), person AS (
  SELECT * FROM identity_matches WHERE (SELECT COUNT(*) FROM identity_matches) = 1
), project AS (
  SELECT _id, permission_group FROM PUBLIC.PROJECTS
  WHERE _id = '{{project_id}}' AND COALESCE(__DELETED, FALSE) = FALSE
), permission AS (
  SELECT pe._id, pe.disabled, pe.review_level
  FROM PUBLIC.TASKPERMISSIONENTRIES pe
  JOIN person u ON pe.worker = u._id
  JOIN project p ON pe.permission_group = p.permission_group
  WHERE COALESCE(pe.__DELETED, FALSE) = FALSE
  QUALIFY ROW_NUMBER() OVER (ORDER BY pe.updated_at DESC NULLS LAST, pe._id) = 1
), tags AS (
  SELECT DISTINCT LOWER(t.name) AS name,
    SUBSTR(LOWER(t.name), LENGTH('{{project_tag_prefix}}') + 2) AS suffix
  FROM VIEW.USER_TAGS_LONG t JOIN person u ON t.user_id = u._id
  WHERE LENGTH('{{project_tag_prefix}}') > 0
    AND STARTSWITH(LOWER(t.name), '{{project_tag_prefix}}_')
), exclusions AS (
  SELECT EXISTS (
    SELECT 1 FROM VIEW.PROJECT_CONFIG_STG pc, person u,
      LATERAL FLATTEN(input => ARRAY_FLATTEN(pc.excluded_worker_tags)) et
    WHERE pc.project_id = '{{project_id}}'
      AND ARRAY_CONTAINS(et.value::VARIANT, u.tags)
  ) AS excluded
), attempts AS (
  SELECT ta._id, ta.attempted_at, ta.attempted_at_review_level
  FROM FULL.TASKATTEMPTS ta JOIN person u ON ta.attempted_by = u._id
  WHERE ta.project = '{{project_id}}'
    AND ta.attempted_at >= DATEADD('day', -365, CURRENT_TIMESTAMP())
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ta._id ORDER BY ta.updated_at DESC) = 1
), ratings AS (
  SELECT a._id, a.attempted_at, a.attempted_at_review_level,
    q.result_number AS score, q.qms_updated_at
  FROM attempts a JOIN VIEW.QMS_RATINGS q ON q.attempt_work_id = a._id
  WHERE q.result_number BETWEEN 1 AND 5
  QUALIFY ROW_NUMBER() OVER (PARTITION BY a._id ORDER BY q.qms_updated_at DESC, q.result_number) = 1
), role_ratings AS (
  SELECT * FROM ratings
  WHERE attempted_at_review_level = COALESCE((SELECT review_level FROM permission), -1)
), recent AS (
  SELECT * FROM role_ratings
  QUALIFY ROW_NUMBER() OVER (ORDER BY qms_updated_at DESC, _id)
    <= IFF(COALESCE((SELECT review_level FROM permission), -1) >= 0, 2, 3)
), queue_snapshot AS (
  SELECT up.empty_queue_status, up.is_user_qualified, up.last_movement
  FROM PUBLIC.USERPROJECTPRIORITIES up JOIN person u ON up.user_id = u._id
  WHERE up.project_id = '{{project_id}}'
  QUALIFY ROW_NUMBER() OVER (ORDER BY up.last_movement DESC NULLS LAST) = 1
), throttle AS (
  SELECT t.start_time, t.expiration_time
  FROM VIEW.THROTTLED_WORKERS t JOIN person u ON t.user_id = u._id
  WHERE t.project_id = '{{project_id}}' AND t.throttle_enabled = TRUE
    AND t.start_time <= CURRENT_TIMESTAMP() AND t.expiration_time > CURRENT_TIMESTAMP()
), tag_state AS (
  SELECT
    COALESCE(ARRAY_AGG(name) WITHIN GROUP (ORDER BY name), ARRAY_CONSTRUCT()) AS project_tags,
    COUNT_IF(suffix = 'disabled') > 0 AS disabled_tag,
    COUNT_IF(suffix IN ('reviewer_demoted')) > 0 AS demoted_tag,
    COUNT_IF(suffix IN ('course_intro_pass')) > 0 AS intro_passed,
    COUNT_IF(suffix IN ('course_intro_fail')) > 0 AS intro_failed,
    COUNT_IF(suffix IN ('course_intro_complete')) > 0 AS intro_completed,
    COUNT_IF(suffix IN ('course_qa_pass')) > 0 AS qa_passed,
    COUNT_IF(suffix IN ('attempter_new', 'new_contributor')) > 0 AS is_new,
    COUNT_IF(suffix IN ('attempter_untrusted', 'strike1')) > 0 AS is_untrusted,
    COUNT_IF(suffix = 'attempter_normal') > 0 AS is_normal,
    COUNT_IF(suffix IN ('attempter_trusted', 'trusted_attempter')) > 0 AS is_trusted,
    COUNT_IF(suffix IN ('reviewer_new', 'new_reviewer')) > 0 AS is_new_reviewer,
    COUNT_IF(suffix IN ('reviewer_untrusted', 'throttled_reviewer')) > 0 AS is_untrusted_reviewer,
    COUNT_IF(suffix IN ('reviewer_trusted', 'trusted_reviewer')) > 0 AS is_trusted_reviewer
  FROM tags
), evidence AS (
  SELECT u._id AS "contributor_id", p._id AS "project_id", CURRENT_TIMESTAMP() AS "observed_at",
    (SELECT COUNT(*) FROM identity_matches) AS "identity_matches",
    (SELECT COUNT(*) FROM permission) > 0 AS "permission_found",
    (SELECT disabled FROM permission) AS "disabled",
    (SELECT review_level FROM permission) AS "review_level",
    IFF(COALESCE((SELECT review_level FROM permission), -1) >= 0, 2, 3) AS "review_window",
    tags.project_tags AS "project_tags", tags.disabled_tag AS "disabled_tag",
    tags.demoted_tag AS "demoted_tag", tags.intro_passed AS "intro_passed",
    tags.intro_failed AS "intro_failed", tags.intro_completed AS "intro_completed",
    tags.qa_passed AS "qa_passed", exclusions.excluded AS "excluded",
    (SELECT empty_queue_status FROM queue_snapshot) AS "individual_eq",
    (SELECT is_user_qualified FROM queue_snapshot) AS "qualified",
    (SELECT last_movement FROM queue_snapshot) AS "queue_observed_at",
    (SELECT COUNT(*) FROM throttle) > 0 AS "active_throttle",
    (SELECT MIN(start_time) FROM throttle) AS "throttle_started_at",
    (SELECT MAX(expiration_time) FROM throttle) AS "throttle_expires_at",
    (SELECT COUNT(*) FROM attempts WHERE attempted_at_review_level = COALESCE((SELECT review_level FROM permission), -1)) AS "total_attempts",
    (SELECT MAX(attempted_at) FROM attempts WHERE attempted_at_review_level = COALESCE((SELECT review_level FROM permission), -1)) AS "last_submission_at",
    (SELECT COUNT(*) FROM attempts WHERE attempted_at_review_level = COALESCE((SELECT review_level FROM permission), -1)
      AND attempted_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP())) AS "submissions_last_24h",
    (SELECT COUNT(*) FROM attempts WHERE attempted_at_review_level = COALESCE((SELECT review_level FROM permission), -1)
      AND attempted_at >= DATEADD('hour', -72, CURRENT_TIMESTAMP())) AS "submissions_last_72h",
    (SELECT COUNT(*) FROM role_ratings) AS "total_graded",
    (SELECT AVG(score) FROM role_ratings) AS "overall_qms",
    (SELECT COUNT_IF(score <= 2) / NULLIF(COUNT(*), 0)::FLOAT FROM role_ratings) AS "overall_pdr",
    (SELECT COUNT(*) FROM recent) AS "recent_graded",
    (SELECT ARRAY_AGG(score) WITHIN GROUP (ORDER BY qms_updated_at DESC, _id) FROM recent) AS "recent_scores",
    (SELECT AVG(score) FROM recent) AS "recent_qms",
    (SELECT COUNT_IF(score <= 2) FROM recent) AS "recent_defects",
    (SELECT COUNT_IF(score <= 2) / NULLIF(COUNT(*), 0)::FLOAT FROM recent) AS "recent_pdr",
    (SELECT COUNT_IF(score >= 4) > 0 FROM recent) AS "recent_has_four_or_five",
    (SELECT COUNT_IF(score = 5) FROM role_ratings) AS "five_score",
    (SELECT COUNT_IF(score = 4) FROM role_ratings) AS "four_score",
    (SELECT COUNT_IF(score = 3) FROM role_ratings) AS "three_score",
    (SELECT COUNT_IF(score = 2) FROM role_ratings) AS "two_score",
    (SELECT COUNT_IF(score = 1) FROM role_ratings) AS "one_score",
    EXISTS (SELECT 1 FROM PUBLIC.PIPELINEV3HUMANNODES h WHERE h.project = p._id
      AND h.status = 'pending' AND h.worker IS NULL) AS "project_has_tasks",
    EXISTS (SELECT 1 FROM PUBLIC.PIPELINEV3HUMANNODES h WHERE h.project = p._id
      AND h.status = 'pending' AND h.worker IS NULL
      AND h.review_level = COALESCE((SELECT review_level FROM permission), -1)) AS "role_has_tasks",
    CASE WHEN tags.disabled_tag THEN 'disabled'
      WHEN tags.demoted_tag THEN 'reviewer_demoted'
      WHEN tags.is_new_reviewer THEN 'reviewer_new'
      WHEN tags.is_untrusted_reviewer THEN 'reviewer_untrusted'
      WHEN tags.is_trusted_reviewer THEN 'reviewer_trusted'
      WHEN tags.is_untrusted THEN 'attempter_untrusted'
      WHEN tags.is_new THEN 'attempter_new'
      WHEN tags.is_normal THEN 'attempter_normal'
      WHEN tags.is_trusted THEN 'attempter_trusted'
      ELSE NULL END AS "current_bucket",
    (IFF(tags.disabled_tag,1,0) + IFF(tags.demoted_tag,1,0) + IFF(tags.is_new_reviewer,1,0)
      + IFF(tags.is_untrusted_reviewer,1,0) + IFF(tags.is_trusted_reviewer,1,0)
      + IFF(tags.is_untrusted,1,0) + IFF(tags.is_new,1,0) + IFF(tags.is_normal,1,0) + IFF(tags.is_trusted,1,0)) > 1 AS "multiple_bucket_tags"
  FROM person u CROSS JOIN project p CROSS JOIN tag_state tags CROSS JOIN exclusions
), classified AS (
  SELECT *, CASE
    WHEN NOT "permission_found" THEN NULL
    WHEN "recent_graded" < "review_window" THEN IFF("review_window" = 3, 'attempter_new', 'reviewer_new')
    WHEN "review_window" = 2 THEN CASE
      WHEN "recent_qms" < 3.5 OR "recent_pdr" >= 0.5 THEN 'reviewer_demoted'
      WHEN "recent_qms" < 4 OR "recent_pdr" > 0 THEN 'reviewer_untrusted'
      WHEN "recent_qms" >= 4 AND "recent_pdr" = 0 THEN 'reviewer_trusted' END
    WHEN "recent_qms" < 3 AND "recent_defects" * 3 >= "recent_graded"
      THEN IFF("recent_has_four_or_five", 'attempter_untrusted', 'disabled')
    WHEN "recent_qms" >= 4 AND "recent_defects" = 0 THEN 'reviewer_new'
    WHEN "recent_qms" > 3 AND "recent_defects" = 0 THEN 'attempter_trusted'
    WHEN "recent_qms" >= 3 AND "recent_defects" * 3 <= "recent_graded" THEN 'attempter_normal'
    ELSE NULL END AS "expected_bucket"
  FROM evidence
)
SELECT *,
  IFF("current_bucket" IS NULL OR "expected_bucket" IS NULL OR "multiple_bucket_tags", NULL,
    "current_bucket" = "expected_bucket") AS "tier_matches_performance",
  CASE "current_bucket" WHEN 'attempter_new' THEN 1 WHEN 'attempter_untrusted' THEN 1
    WHEN 'attempter_normal' THEN 1 WHEN 'attempter_trusted' THEN 6 END AS "task_limit",
  CASE "current_bucket" WHEN 'attempter_new' THEN 24 WHEN 'attempter_untrusted' THEN 72
    WHEN 'attempter_normal' THEN 24 WHEN 'attempter_trusted' THEN 24 END AS "window_hours",
  CASE WHEN "disabled_tag" THEN 'quality_reallocated'
    WHEN "disabled" THEN 'access_disabled'
    WHEN "excluded" THEN 'project_excluded'
    WHEN "demoted_tag" THEN 'reviewer_demoted'
    WHEN "active_throttle" THEN 'active_throttle'
    WHEN NOT "project_has_tasks" THEN 'project_empty'
    WHEN NOT "role_has_tasks" THEN 'role_queue_empty'
    WHEN "individual_eq" = FALSE AND "qualified" = TRUE AND "permission_found" THEN 'no_restriction_found'
    ELSE 'unresolved' END AS "diagnosis"
FROM classified`;
