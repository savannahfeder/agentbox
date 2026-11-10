// Imported first by main.mts, so no module's log line can wait on the terminal.
import { letTheTerminalFallBehind } from './terminal-output.mts';

letTheTerminalFallBehind(process.stdout);
letTheTerminalFallBehind(process.stderr);
