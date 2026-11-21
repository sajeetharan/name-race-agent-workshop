export const questions = [
  {
    prompt: 'What is a good first step when building with AI?',
    options: ['Copy everything without checking', 'Explain your goal and review a plan', 'Hide all errors', 'Skip the tests'],
    correctChoice: 1,
    explanation: 'Start with a clear goal, then review the plan before building.',
  },
  {
    prompt: 'What does Antigravity help you do?',
    options: ['Guarantee that every answer is true', 'Replace every human decision', 'Build and review app code with AI', 'Make tests unnecessary'],
    correctChoice: 2,
    explanation: 'Antigravity helps with the development workflow. People still review and test the code.',
  },
  {
    prompt: 'What is a Skill?',
    options: ['A reusable recipe for doing a task', 'A secret password', 'A new database', 'Permission to do anything'],
    correctChoice: 0,
    explanation: 'A Skill gives reusable guidance. It does not grant extra permissions.',
  },
  {
    prompt: 'What does MCP connect?',
    options: ['Only the colors on a page', 'A nickname to a prize', 'Only two browsers', 'Apps and AI to real tools and data'],
    correctChoice: 3,
    explanation: 'MCP is a standard way to connect applications and AI to tools and data.',
  },
  {
    prompt: 'Who should approve starting or deleting this quiz room?',
    options: ['Any participant', 'The host', 'The AI without asking', 'The fastest phone'],
    correctChoice: 1,
    explanation: 'The host reviews and approves room controls. Participants only submit their own answers.',
  },
] as const;
