import express from 'express';
import cors from 'cors';
import path from 'path';
import topicsRouter from './routes/topics';
import previewRouter from './routes/preview';
import publishRouter from './routes/publish';
import configRouter from './routes/config';
import historyRouter from './routes/history';
import commsRouter from './routes/comms';
import composerRouter from './routes/composer';
import webinarsRouter from './routes/webinars';
import syncRouter from './routes/sync';
import communityAgentRouter from './routes/community-agent';
import dmReviewRouter from './routes/dm-review';
import cronRouter from './routes/cron';
import operationsRouter from './routes/operations';
import automationRouter from './routes/automation';
import dailySummaryRouter from './routes/daily-summary';
import reviewQueueRouter from './routes/review-queue';
import sandboxRouter from './routes/sandbox';
import memoryRouter from './routes/memory';
import usageRouter from './routes/usage';
import platformRouter from './routes/platform';
import discourseAuthRouter from './routes/discourse-auth';
import { attachProjectContext } from './auth';
import { apiRateLimit, protectWorkspaceApi, securityHeaders } from './security';

const app = express();

const allowedOrigins = new Set(
  [
    process.env.FRONTEND_BASE_URL,
    process.env.APP_FRONTEND_URL,
    process.env.PUBLIC_BASE_URL,
    process.env.CRON_TARGET_BASE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}` : '',
    ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()),
    'http://localhost:5173',
    'http://localhost:3001',
  ].filter((value): value is string => Boolean(value)).map((value) => value.replace(/\/+$/, ''))
);

app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ''))) callback(null, true);
    else callback(new Error('Origin is not allowed.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Admin-Token', 'X-Project-Id', 'X-Cron-Secret'],
}));
app.use('/api/platform/guidelines/extract', express.json({ limit: '18mb' }));
app.use('/api/platform/projects', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRateLimit);
app.use(attachProjectContext);
app.use('/api', protectWorkspaceApi);

app.use('/api/platform', platformRouter);
app.use('/api/discourse-auth', discourseAuthRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/preview', previewRouter);
app.use('/api/publish', publishRouter);
app.use('/api/config', configRouter);
app.use('/api/history', historyRouter);
app.use('/api/comms', commsRouter);
app.use('/api/composer', composerRouter);
app.use('/api/webinars', webinarsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/community-agent', communityAgentRouter);
app.use('/api/dm-review', dmReviewRouter);
app.use('/api/cron', cronRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/automation', automationRouter);
app.use('/api/daily-summary', dailySummaryRouter);
app.use('/api/review-queue', reviewQueueRouter);
app.use('/api/sandbox', sandboxRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/usage', usageRouter);

const uiBuild = path.resolve(__dirname, '../ui/dist');
app.use(express.static(uiBuild));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(uiBuild, 'index.html'));
});

export default app;
