# ORBIT BREAK — gameplay and CI checks

## Game rules

- The arena is a circular wall (radius 242 px, centered at 400, 300). The ball reflects specularly on the circular wall, not by random angle.
- Moving/rotating targets use deterministic seeded positions and velocities; targets are kept away from the paddle's annular lane.
- The paddle is a short curved arc which rotates around the arena. Its **inner** face reflects an outward-moving ball. An inward-moving ball contacting the paddle's **outer/rear** face loses one life.
- Missing the paddle does not immediately kill the ball: the outer wall reflects it. The ball becomes dangerous if it returns through the narrow wall/paddle gap and contacts the **back** of the paddle. Three rear hits cause GAME OVER.
- Destroy all targets to clear the stage and advance; higher stages add targets and increase the fixed ball speed.
- All ball bounces use collision normals; speed is normalized after contact so moving targets or the paddle never cause runaway acceleration.

## Physics/gameplay regression plan

`node tests/orbit.test.cjs` verifies circular reflection with no life lost, 24 front-face orientations, three actual rear-face hits leading to GAME OVER, wrong-side misses remaining harmless, object motion, destruction/scoring, stage advancement, reflection angles, and a 120-second scripted play simulation with speed bound checks.

`node tests/orbit.browser.cjs` uses Chromium to open each archived game and V5, exercises keyboard/pointer-supported UI, reads Canvas pixels, takes screenshots, verifies front-face bounce, triggers three rear hits, and checks GAME OVER / RESET / LEVEL CLEAR / NEXT STAGE in the actual DOM.

`pages.yml` runs those tests before publishing the site. A failure must block the deploy. The screenshots are attached to the Actions run as `orbit-browser-proof`. No completed CI run means the Pages build is unverified even if files exist in the branch.
