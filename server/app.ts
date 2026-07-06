import express from 'express';
import cors from 'cors';
import path from 'path';
import topicsRouter from './routes/topics';
import previewRouter from './routes/preview';
import publishRouter from './routes/publish';
import configRouter from './routes/config';
import historyRouter from './routes/history';
import commsRouter from './routes/comms';
import webinarsRouter from './routes/webinars';
import syncRouter from './routes/sync';
import communityAgentRouter from './routes/community-agent';
import dmReviewRouter from './routes/dm-review';
import cronRouter from './routes/cron';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/topics', topicsRouter);
app.use('/api/preview', previewRouter);
app.use('/api/publish', publishRouter);
app.use('/api/config', configRouter);
app.use('/api/history', historyRouter);
app.use('/api/comms', commsRouter);
app.use('/api/webinars', webinarsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/community-agent', communityAgentRouter);
app.use('/api/dm-review', dmReviewRouter);
app.use('/api/cron', cronRouter);

const uiBuild = path.resolve(__dirname, '../ui/dist');
app.use(express.static(uiBuild));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(uiBuild, 'index.html'));
});

export default app;
