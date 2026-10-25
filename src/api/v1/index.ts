import { Router } from 'express';
import categoriesRouter from './categories.js';
import papersRouter from './papers.js';
import filesRouter from './files.js';
import importsRouter from './imports.js';
import exportsRouter from './exports.js';
import healthRouter from './health.js';

const router = Router();

router.use('/categories', categoriesRouter);
router.use('/papers', papersRouter);
router.use('/files', filesRouter);
router.use('/imports', importsRouter);
router.use('/exports', exportsRouter);
router.use('/health', healthRouter);

export default router;
