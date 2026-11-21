# Name Race: five-question workshop quiz

## Prepare

Open the live host and log in privately. Create a fresh room shortly before the
session; rooms last two hours. Share its QR code. Use nicknames, not private data.
The quiz needs no model key. The host opens and closes each question.

## Fourteen-minute demo

**0-2 / Invite**

"Scan this code and choose a nickname. You get a colored car. There are five
questions about today's workshop. Correct answers move your car. Your answers
decide the result, not luck or AI."

Show the names and cars. Review the entries and type START.

**2-4 / Question 1: vibe coding**

"What is a good first step when building with AI? Pick one answer on your phone.
Your answer is final after you tap. We start with a clear goal and review a plan."

Wait for answers. Type CLOSE to reveal. Show cars moving for correct answers.
Show the reusable Skill as a recipe: read, plan, change and test.

**4-6 / Question 2: Antigravity**

Type NEXT.

"Antigravity helps us build and review code. It does not make every answer true,
and it does not remove the need for tests. People still check the result."

Wait for answers and type CLOSE. Show `npm run check` and one reviewed code edit.

**6-8 / Question 3: Skills**

Type NEXT.

"A Skill is a reusable recipe for a task. It is not a password or permission to
do anything. We use it to guide a small, safe change."

Wait and type CLOSE. Show the actual Skill file and explain its review boundary.

**8-10 / Question 4: MCP**

Type NEXT.

"MCP connects apps and AI to real tools and data. Registration and answers use
real MCP calls. Here is the request and actual result. Private keys are omitted."

Show `submit_answer`, `read_room` and `host_control` in the trace. The coding
guide is a separate, read-only connection. Wait and type CLOSE.

**10-12 / Question 5: human control**

Type NEXT.

"Only the host should approve starting, closing, reopening or deleting the room.
A participant chooses answers. The optional AI cannot grade or control the quiz."

Wait and type CLOSE. Closing question five reveals the named top-three podium.

**12-14 / Podium and agent recap**

"These racers earned the most correct answers. Each correct answer gives 100
points. If scores match, faster correct answers rank first. The server records
time; network and question polling also affect it. Exact score/time ties share a rank."

Read the podium names and congratulate participants. Show the score and time.

"The coding agent helps build the app. The optional application agent reads an
anonymous summary and chooses a small commentary style. It receives racer
labels, never your nicknames, and code supplies the facts."

Only call commentary if your private key and model were rehearsed. Otherwise
say: "AI is off today. The MCP calls are real, but they are not model reasoning."

Type RESET only if you want another round. It keeps names and clears scores.
Delete the room after the session. Finish with the public repo and keep four
minutes for Q&A in the one-hour workshop.
