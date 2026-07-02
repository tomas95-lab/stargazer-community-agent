import * as dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.SERVER_PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
