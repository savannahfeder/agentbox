import type { Change } from './code-artifact';
export const artifactSampleChange: Change = {
  plus: 4, minus: 2, editCount: 1,
  files: [{ path: 'renderer/src/components/ProjectStart.tsx', plus: 4, minus: 2,
    hunks: [{said:'Keep the first task in the inbox until the user reviews it.', rows:[
      ['=', 'export function startProject(project: Project) {'],
      ['-', '  const task = createTask(project, { status: "running" });'],
      ['-', '  return startAgent(task);'],
      ['+', '  return createTask(project, {'],
      ['+', '    status: "inbox",'],
      ['+', '    title: "Ready to set up onboarding?",'],
      ['+', '  });'],
      ['=', '}'],
    ]}]
  }]
};
export const artifactSampleNotes = '# The first task\n\nStarting a project should give you one clear next step.\n\n## Proposed behavior\n\n- Place the proposal in the inbox.\n- Wait for the user to review it.\n- Begin work after their reply.\n\n## What stays the same\n\nExisting tasks continue to run normally. The change only applies when a new project is created.\n\n*Sample document for comparing artifact layouts.*';
// A multi-file review example, isolated from the existing layout fixture.
export const reviewSampleChange:Change = {
 plus:10,minus:2,editCount:4,
 files:[...artifactSampleChange.files,
 ...['renderer/src/project-defaults.ts','tests/project-start.test.ts','docs/project-start.md'].map((path,i)=>({path,plus:2,minus:0,hunks:[{said:'Keep new projects waiting for a reply.',rows:[['+', ['export const initialStatus = "inbox";', 'expect(startProject(project).status).toBe("inbox");', '# Starting a project'][i]],['+', ['export const autoStart = false;', 'expect(startAgent).not.toHaveBeenCalled();', 'New tasks wait for your reply before running.'][i]]] as [string,string][]}]}))] as Change['files']
};
