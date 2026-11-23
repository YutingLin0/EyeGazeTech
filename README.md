# Eye Gaze Lab

A browser communication board inspired by the Tobii Dynavox TD I-Series. Open the homepage for three illustrated English communication missions, camera calibration and a three-tile tracking check. Open /match for the classroom game. The host creates a room, shares a join link, starts each round, and reveals the final scores. Players build the displayed phrase on a communication board and speak it aloud. Correct submissions earn 100 points plus up to 30 for time remaining.

Webcam gaze, mouse dwell, and keyboard controls are available. For a comparable class challenge, agree on an input mode before starting and keep alternatives available for access needs. After joining, choose Enable eye gaze and allow camera access. Follow the calibration dot without clicking, then hold your gaze on words, Undo, Clear, or Speak & submit. Camera processing remains in the browser. The room service stores nicknames and scores.

## Build and run

Run `node worker/build.mjs` (Node.js 20+). Deploy `dist/server/index.js` as a Cloudflare Worker with a D1 database named `DB` in its bindings. Apply `drizzle/0000_classroom.sql` to the database before running the Worker. Sites uses the hosting manifest and packaged Drizzle migration for its own deployment.

The multiplayer API needs a server. A static GitHub Pages deployment alone cannot run multiplayer rooms.

## How gaze calibration works

The picture missions use the gaze extraction, affine screen mapping, five target positions, and smoothing approach from [OCULA](https://github.com/revolutionarybukhari/ocula/tree/7b0d9495564161b37f114cec4205975549d34603). See the MIT notice in `worker/board-tracking.js`. The board uses the same refined MediaPipe Face Mesh model as OCULA and verifies gaze with three tile selections before play. Camera frames and calibration stay in the current browser session. Use the Dwell button to change selection time or Recenter gaze to correct a small change in seating position.
