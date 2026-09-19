import { app } from '../backend/dist/app.js';
import { ensureBootstrapAdmin } from '../backend/dist/bootstrap-admin.js';

await ensureBootstrapAdmin();

export default app;