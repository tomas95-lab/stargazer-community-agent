import { Router, Request, Response } from 'express';
import { listDirectory, readFile } from '../../src/github-storage';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const files = await listDirectory('output');
    const sorted = files
      .filter((f) => !f.name.startsWith('.'))
      .sort((a, b) => b.name.localeCompare(a.name));
    res.json(sorted.map((f) => ({ name: f.name, size: f.size, modified: '' })));
  } catch {
    res.json([]);
  }
});

router.get('/:filename', async (req: Request, res: Response) => {
  try {
    const content = await readFile(`output/${req.params.filename}`);
    res.json({ name: req.params.filename, content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;
