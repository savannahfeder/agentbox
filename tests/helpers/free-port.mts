// A PORT NOBODY IS ON, FOR THE TESTS THAT NEED A NUMBER RATHER THAN A SERVER.
//
// A dozen agents work this Mac, so two test runs overlap routinely and a port
// written into a test is a collision waiting (see
// tests/two-test-runs-at-once-do-not-fight-over-a-port). Where a test is about
// something LISTENING, it asks for `port: 0` and reads back what it got. Where
// a test needs a port with nothing on it -- "the door is shut, so this is
// refused" -- there is nothing to read back, so it borrows one and hands it
// straight back.
import net from 'node:net';

export function aFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
