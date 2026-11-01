// What sharing a project sends to teammates and what stays on this computer.
export const PROJECT_CROSSES = {
  team: 'Teammates see its threads and the files on them. The rest of its folder stays on this computer.',
  people: 'They see its threads and the files on them. The rest of its folder stays on this computer.',
  private: 'Nothing leaves this computer.',
} as const;
