#!/usr/bin/env node
import * as dotenv from 'dotenv';

dotenv.config();

const API_ENDPOINT = 'https://api.cron-job.org';
const FOLDER_TITLE = 'Stargazer Community Agent';
const DEFAULT_BASE_URL = 'https://stargazer-community-agent.vercel.app';
const ARG_TIMEZONE = 'America/Argentina/Buenos_Aires';
const CREATE_JOB_DELAY_MS = 13_000;

const WEEKDAYS = [1, 2, 3, 4, 5];

const jobs = [
  { title: 'Stargazer - Daily Thread 10:00 ARG', path: '/api/cron/daily-thread/1000', hour: 10, minute: 0, weekdaysOnly: true },
  { title: 'Stargazer - Daily Thread retry 11:00 ARG', path: '/api/cron/daily-thread/1100', hour: 11, minute: 0, weekdaysOnly: true },
  { title: 'Stargazer - Community Agent 10:00 ARG', path: '/api/cron/community-agent/1000', hour: 10, minute: 0 },
  { title: 'Stargazer - Community Agent 11:30 ARG', path: '/api/cron/community-agent/1130', hour: 11, minute: 30 },
  { title: 'Stargazer - Community Agent 13:00 ARG', path: '/api/cron/community-agent/1300', hour: 13, minute: 0 },
  { title: 'Stargazer - Community Agent 14:30 ARG', path: '/api/cron/community-agent/1430', hour: 14, minute: 30 },
  { title: 'Stargazer - Community Agent 16:00 ARG', path: '/api/cron/community-agent/1600', hour: 16, minute: 0 },
  { title: 'Stargazer - Community Agent 17:30 ARG', path: '/api/cron/community-agent/1730', hour: 17, minute: 30 },
  { title: 'Stargazer - Community Agent 19:00 ARG', path: '/api/cron/community-agent/1900', hour: 19, minute: 0 },
  { title: 'Stargazer - DM Review 15:30 ARG', path: '/api/cron/dm-review/1530', hour: 15, minute: 30 },
  { title: 'Stargazer - DM Review 18:00 ARG', path: '/api/cron/dm-review/1800', hour: 18, minute: 0 },
];

function boolArg(name) {
  return process.argv.includes(name);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function requiredEnv(name, aliases = []) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing ${name}. Add it to .env and run this script again.`);
}

function optionalBaseUrl() {
  return trimTrailingSlash(
    process.env.CRON_TARGET_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.APP_URL ||
      DEFAULT_BASE_URL
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_ENDPOINT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed with ${response.status}: ${text}`);
  }

  return body;
}

function buildJob(job, folderId) {
  return {
    title: job.title,
    enabled: true,
    saveResponses: true,
    url: `${baseUrl}${job.path}`,
    requestMethod: 0,
    requestTimeout: 60,
    redirectSuccess: false,
    folderId,
    schedule: {
      timezone: ARG_TIMEZONE,
      expiresAt: 0,
      hours: [job.hour],
      mdays: [-1],
      minutes: [job.minute],
      months: [-1],
      wdays: job.weekdaysOnly ? WEEKDAYS : [-1],
    },
    notification: {
      onFailure: true,
      onFailureCount: 1,
      onSuccess: true,
      onDisable: true,
      onSslCertExpiry: true,
      onSslCertExpirySeconds: 604800,
    },
    extendedData: {
      headers: {
        'X-Cron-Secret': cronSecret,
        'X-Scheduler': 'cron-job-org',
      },
      body: '',
    },
  };
}

async function ensureFolder() {
  const listed = await apiFetch('/folders');
  const existing = listed.folders?.find((folder) => folder.title === FOLDER_TITLE);
  if (existing) return existing.folderId;

  const created = await apiFetch('/folders', {
    method: 'PUT',
    body: JSON.stringify({ folder: { title: FOLDER_TITLE } }),
  });

  console.log(`Created folder "${FOLDER_TITLE}" (${created.folderId}).`);
  return created.folderId;
}

async function upsertJobs(folderId) {
  const listed = await apiFetch('/jobs');
  const existingByTitle = new Map((listed.jobs || []).map((job) => [job.title, job]));
  let createdCount = 0;
  let updatedCount = 0;

  for (const job of jobs) {
    const payload = { job: buildJob(job, folderId) };
    const existing = existingByTitle.get(job.title);

    if (existing) {
      await apiFetch(`/jobs/${existing.jobId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      updatedCount += 1;
      console.log(`Updated ${job.title}`);
      continue;
    }

    const created = await apiFetch('/jobs', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    createdCount += 1;
    console.log(`Created ${job.title} (${created.jobId})`);
    await sleep(CREATE_JOB_DELAY_MS);
  }

  return { createdCount, updatedCount };
}

function printPlan() {
  console.log(`Target: ${baseUrl}`);
  console.log(`Folder: ${FOLDER_TITLE}`);
  console.log('');
  for (const job of jobs) {
    const hh = String(job.hour).padStart(2, '0');
    const mm = String(job.minute).padStart(2, '0');
    const days = job.weekdaysOnly ? 'Mon-Fri' : 'Every day';
    console.log(`${hh}:${mm} ARG  ${days}  ${job.title}`);
    console.log(`           ${baseUrl}${job.path}`);
  }
}

const dryRun = boolArg('--dry-run');
const baseUrl = optionalBaseUrl();

let apiKey = '';
let cronSecret = '';

try {
  cronSecret = requiredEnv('CRON_SECRET');
  if (!dryRun) apiKey = requiredEnv('CRON_JOB_ORG_API_KEY', ['CRONJOB_ORG_API_KEY']);

  if (dryRun) {
    printPlan();
    process.exit(0);
  }

  printPlan();
  console.log('');
  const folderId = await ensureFolder();
  const result = await upsertJobs(folderId);
  console.log('');
  console.log(`Done. Created ${result.createdCount}, updated ${result.updatedCount}.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
