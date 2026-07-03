import { Router, Request, Response } from 'express';
import { listDataDirectory, readDataText } from '../../src/data-store';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const files = await listDataDirectory('output');
    const sorted = files
      .filter((f) => !f.name.startsWith('.'))
      .sort((a, b) => b.name.localeCompare(a.name));
    res.json(sorted.map((f) => ({ name: f.name, size: f.size, modified: f.modified })));
  } catch {
    res.json([]);
  }
});

router.get('/:filename', async (req: Request, res: Response) => {
  try {
    const content = await readDataText(`output/${req.params.filename}`);
    res.json({ name: req.params.filename, content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;
