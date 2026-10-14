# Desktop project selection

Set `syncDesktopProjects: true` in `zero.config.json` to include desktop Codex projects and the ChatGPT projects cached by the desktop app in Agentbox's existing project picker. This is opt-in because project names and folders belong to the signed-in desktop user.

Discovery refreshes with the inbox snapshot. Current Codex project records are read from its local database, with persisted workspace records as a fallback. Existing folder matches are reused; archived projects stay archived. Discovery creates private Agentbox project records without starting tasks or changing the source folders.

ChatGPT projects refresh after the desktop app refreshes its sidebar cache. They receive a local dated Codex working folder when the first Agentbox chat is submitted. This does not synchronize cloud conversations, project files or instructions. Missing local folders and whole-home/system roots are excluded. Removing a desktop project does not delete its Agentbox tasks or files.
