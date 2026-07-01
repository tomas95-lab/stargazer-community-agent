import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PATHS } from '../../src/config';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const dir = PATHS.output;
  if (!fs.existsSync(dir)) {
    res.json([]);
    return;
  }
  const files = fs.readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, modified: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
  res.json(files);
});

router.get('/:filename', (req: Request, res: Response) => {
  const filePath = path.join(PATHS.output, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ name: req.params.filename, content });
});

export default router;
