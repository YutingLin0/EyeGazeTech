# Eye Gaze Activity

An English classroom game inspired by the Tobii Dynavox TD I-Series. The teacher hosts a class, shares the room code, and starts when everyone has entered a name. Players choose **Precision setup** to calibrate the webcam or **Play with clicks** to use a mouse, touch, or keyboard. The host sees each joined player’s score and progress live. The leaderboard appears when every player finishes or when the host chooses **End game**. Ending early freezes the scores already earned.

## Build and run

Run `node worker/build.mjs` (Node.js 20+), then deploy `dist/server/index.js` as a Cloudflare Worker with the D1 binding `DB` and the included migrations. To generate the GitHub Pages frontend, run `node worker/build.mjs --pages <HTTPS API origin>` and publish `docs/`. Camera processing stays in the browser. Names and scores are associated with a temporary classroom room.

## How gaze calibration works

The homepage adapts the [OCULA source](https://github.com/revolutionarybukhari/ocula/tree/7b0d9495564161b37f114cec4205975549d34603), including its interface styling, Face Mesh iris tracking, camera calibration, amber gaze ring, and adjustable dwell timings. Precision setup uses nine targets, collects longer samples, and reports the offset from two fresh targets. Recenter corrects a small shift with one center target. Its MIT notice is in `worker/simple.html`. The English classroom game in `worker/ocula-game.js` presents ten scenarios. The first correct choice earns 100 points, or 50 points if the player needed a retry. Scores on the homepage are local to the current round set. Correct answers advance automatically after spoken feedback. The gaze ring filters isolated jumps and briefly holds its target near a tile edge. Click mode uses the same board and scoring.
