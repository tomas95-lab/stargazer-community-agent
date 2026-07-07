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
import reviewQueueRouter from './routes/review-queue';
import sandboxRouter from './routes/sandbox';
import memoryRouter from './routes/memory';
import usageRouter from './routes/usage';

const app = express();

app.use(cors());
app.use(express.json());

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
