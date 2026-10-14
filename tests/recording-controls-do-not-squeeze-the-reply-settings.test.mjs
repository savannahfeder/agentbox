// A waveform in the reply footer squeezed the settings into a tall narrow column.
import {it,expect} from 'vitest';import fs from 'node:fs';
it('hides the settings only while recording and keeps the recording buttons compact and labelled',()=>{
 const css=fs.readFileSync('renderer/src/styles.css','utf8'),ui=fs.readFileSync('renderer/src/components/Dictation.tsx','utf8');
 expect(css).toMatch(/\.compose-sentence:has\(\.dictation-waveform\) \.compose-clauses[^}]*display:\s*none/);
 expect(ui).toContain('aria-label="Stoppen und Text bearbeiten"');expect(ui).toContain('aria-label="Nach Transkription automatisch senden"');
 expect(ui).not.toContain('■ Stoppen</button>');
});
