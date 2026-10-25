// The renderer's fixture snapshot as JSON, for a stage outside the app.
import fs from 'node:fs';
import { fixtureHistory, fixtureSnapshot, fixtureTraces } from '../../renderer/src/fixtures';

fs.writeFileSync(process.argv[2], JSON.stringify({ ...fixtureSnapshot, __history: fixtureHistory, __traces: fixtureTraces }));
