export const questions = [
  {
    prompt: 'What should a coding agent know before it starts building?',
    options: ['Only which language to use', 'The outcome, constraints and acceptance checks', 'That every generated answer is correct', 'That tests can wait until after shipping'],
    correctChoice: 1,
    explanation: 'Own the brief: state intent, provide relevant context and define what counts as right. Delegate implementation, not engineering judgment.',
  },
  {
    prompt: 'What makes a reusable Skill useful to a coding agent?',
    options: ['Loading every reference for every task', 'A long list of vague advice', 'Clear triggers, steps, exceptions and checks', 'Permission to act without approval'],
    correctChoice: 2,
    explanation: 'A Skill guides a scoped task. Explain when it applies and when it does not, route to relevant detail, and test whether the guidance helps.',
  },
  {
    prompt: 'In the talk demo, why does Copilot call the read-only MCP tools?',
    options: ['To inspect the actual session context and lookup contract', 'To grant itself access to any data', 'To replace tests with tool output', 'To let tool output override the task instructions'],
    correctChoice: 0,
    explanation: 'Skills explain how to work; MCP tools supply real context. The service still enforces access, and tool output is not trusted instructions.',
  },
  {
    prompt: 'You know the complete partition key and ID of a Cosmos DB session. Which read should you use?',
    options: ['Fetch the whole conference agenda', 'Search every conference', 'Ask the model to invent the session details', 'Point-read that exact session using the existing store/client'],
    correctChoice: 3,
    explanation: 'A known address allows a direct point read. Unknown session options still need scoped search. Return only public fields; do not leak storage metadata.',
  },
  {
    prompt: 'The generated code builds. What proves the session lookup is right?',
    options: ['The Skill appeared in the tool trace', 'Check behavior, the exact read and the missing-session case', 'The agent says it is finished', 'One successful run proves the Skill always helps'],
    correctChoice: 1,
    explanation: 'Review the diff, tests and traces: correct stored facts, public fields, one exact lookup and no invented missing session. Compare repeated guided and unguided trials to evaluate a Skill.',
  },
] as const;
