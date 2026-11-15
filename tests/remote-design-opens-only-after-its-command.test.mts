import {it as test} from 'vitest';import assert from 'node:assert/strict';
import {remotePreviewCommand} from '../designs/remote-continuation/remote-preview-command.mjs';
// The previous preview appeared without an initiating command. Only explicit
// remote commands in the localhost design preview may open this simulation.
test('matches the command and alias only in the explicit local preview',()=>{
 assert.equal(remotePreviewCommand('http://127.0.0.1:65463/?remotePreview=C','/remote-control'),true);
 for(const text of ['/remote-control',' /rc '])assert.equal(remotePreviewCommand('http://127.0.0.1:65463/?remotePreview=A',text),true);
 for(const text of ['hello','/remote-control-other','/remote-control argument'])assert.equal(remotePreviewCommand('http://127.0.0.1:65463/?remotePreview=A',text),false);
 for(const url of ['http://127.0.0.1:65463/','https://example.com/?remotePreview=A','http://127.0.0.1:65463/?remotePreview=unknown'])assert.equal(remotePreviewCommand(url,'/remote-control'),false);
});
