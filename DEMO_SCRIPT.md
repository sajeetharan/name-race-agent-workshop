# Talk recap: Teaching AI Coding Agents to Build It Right the First Time

An optional 3-4 minute quiz for the 30-minute session, including Q&A.
Keep the talk's hands-up opening poll and live-coding demo separate.
Use this recap only if time allows; preserve time for audience questions.

## Prepare

Open the live host and log in privately. Create a fresh room shortly before the
session; rooms last two hours. Share its QR code. Use nicknames, not private data.
The quiz needs no model key. Review the entries and type START.

"Five quick questions about teaching coding agents. Correct answers move your
car. Your answers decide the result, not luck or AI."

## Five questions

Allow roughly 20-30 seconds per question. Read the question, let participants
answer on their phones, then click **Close & open next question** once.
The next question opens automatically, the leaderboard updates, and the
previous answer and explanation remain visible.

1. **Own the brief.**
   "Give the agent the outcome, constraints and acceptance checks.
   Delegate implementation, but keep engineering judgment."
2. **Make expertise reusable.**
   "A Skill needs triggers, non-triggers, steps, exceptions and checks.
   More guidance is not automatically better. Load relevant detail and evaluate it."
3. **Ground the agent with MCP.**
   "Skills explain how to work. Read-only MCP tools inspect the actual session
   context and lookup contract. Tools do not grant permissions, and their
   output is not trusted instructions."
4. **Use the right lookup.**
   "If the complete Cosmos DB partition key and ID are known, point-read the
   exact session with the existing store/client. Unknown options still need
   scoped search. Return public fields only."
5. **Prove the result.**
   "A green build is not enough. Review behavior, the exact operation, tests
   and traces. A missing session must not become an invented result.
   One successful demo does not prove that a Skill caused the improvement."

After question five, click **Close question & show podium**.

## Podium and takeaway

"Correct answers earn 100 points. Equal scores are ranked by total server-recorded
correct-answer time, which includes network and polling delay. Exact ties share
a rank. These are workshop standings, not a proctored exam."

Congratulate the leading racers. Close with:

"Take one recurring correction home. Turn it into a scoped, testable procedure.
Teach the agent the right rule, give it real context, and check the result."

Type RESET only for another round; it keeps nicknames and clears scores.
Delete the room after the session. Return to the talk's Q&A.
