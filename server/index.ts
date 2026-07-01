import express from 'express';
import cors from 'cors';
import path from 'path';
import topicsRouter from './routes/topics';
import previewRouter from './routes/preview';
import publishRouter from './routes/publish';
import configRouter from './routes/config';
import historyRouter from './routes/history';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/topics', topicsRouter);
app.use('/api/preview', previewRouter);
app.use('/api/publish', publishRouter);
app.use('/api/config', configRouter);
app.use('/api/history', historyRouter);

const uiBuild = path.resolve(__dirname, '../ui/dist');
app.use(express.static(uiBuild));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(uiBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
