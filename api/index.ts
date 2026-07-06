import '../server/load-env';

import express from 'express';
import cors from 'cors';
import topicsRouter from '../server/routes/topics';
import previewRouter from '../server/routes/preview';
import publishRouter from '../server/routes/publish';
import configRouter from '../server/routes/config';
import historyRouter from '../server/routes/history';
import commsRouter from '../server/routes/comms';
import webinarsRouter from '../server/routes/webinars';
import communityAgentRouter from '../server/routes/community-agent';
import dmReviewRouter from '../server/routes/dm-review';
import cronRouter from '../server/routes/cron';

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
app.use('/api/community-agent', communityAgentRouter);
app.use('/api/dm-review', dmReviewRouter);
app.use('/api/cron', cronRouter);

export default app;
