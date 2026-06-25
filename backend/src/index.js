import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import app from './app.js';
import connectDB from './config/db.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  process.stdout.write(`BookMyCut server running on port ${PORT}\n`);
});
