# Eye Gaze Lab

A browser communication board inspired by the Tobii Dynavox TD I-Series. Open the homepage for three illustrated English communication missions, camera calibration and a three-tile tracking check. Open /match for the classroom game. The host creates a room, shares a join link, starts each round, and reveals the final scores. Players build the displayed phrase on a communication board and speak it aloud. Correct submissions earn 100 points plus up to 30 for time remaining.

Webcam gaze, mouse dwell, and keyboard controls are available. For a comparable class challenge, agree on an input mode before starting and keep alternatives available for access needs. After joining, choose Enable eye gaze and allow camera access. Follow the calibration dot without clicking, then hold your gaze on words, Undo, Clear, or Speak & submit. Camera processing remains in the browser. The room service stores nicknames and scores.

## Build and run

Run `node worker/build.mjs` (Node.js 20+). Deploy `dist/server/index.js` as a Cloudflare Worker with a D1 database named `DB` in its bindings. Apply `drizzle/0000_classroom.sql` to the database before running the Worker. Sites uses the hosting manifest and packaged Drizzle migration for its own deployment.

The multiplayer API needs a server. A static GitHub Pages deployment alone cannot run multiplayer rooms.

## How gaze calibration works

The board uses MediaPipe Face Landmarker in the browser. The eye-look and head-pose approach, nine-point calibration, and dwell hysteresis were informed by [Iris](https://github.com/AventureStudio/iris/tree/d418d917f85c1072cea62ba3475135532015b59d). Eye Gaze Lab collects samples at the actual tile locations, chooses between eye/pose and iris-assisted mappings by testing held-out calibration targets, and waits for steadier gaze samples, and asks the player to dwell on three highlighted tiles before turning on gaze selection. Recenter gaze corrects a small change in seating position and runs the check again. Camera frames and calibration stay in the current browser session.
