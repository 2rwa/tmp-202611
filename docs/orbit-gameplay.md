# ORBIT BREAK — gameplay and CI checks

## Game rules

- The arena is a circular wall (radius 242 px, centered at 400, 300). The ball reflects specularly on the circular wall, not by random angle.
- Moving/rotating targets use deterministic seeded positions and velocities; targets are kept away from the paddle's annular lane.
- The paddle is a short curved arc which rotates around the arena. Contact with **either** side reflects the ball and fully restores its energy to 100%. Neither side costs a LIFE.
- Hitting an object with a powered ball deals one hit of damage and consumes 34 energy. A ball with 0 energy reflects without damaging the target and costs one LIFE. Three unpowered collisions cause GAME OVER. A 0.55-second damage grace protects against repeated damage from the same overlapping contact. The ball keeps moving after a nonfatal unpowered collision, leaving an opportunity to recharge at the paddle.
- Destroy all targets to clear the stage and advance; higher stages add targets and increase the fixed ball speed.
- All ball bounces use collision normals; speed is normalized after contact so moving targets or the paddle never cause runaway acceleration.

## Physics/gameplay regression plan

`node tests/orbit.test.cjs` verifies circular reflection with no life lost, 24 front-face orientations charging to 100, harmless rear-face charging, exactly three powered hits per charge, empty-ball reflection + LIFE loss without target damage, nonfatal hit grace, three separated empty-object collisions causing GAME OVER, object motion, destruction/scoring, stage advancement, reflection angles, and a 120-second scripted play simulation with speed bound checks.

`node tests/orbit.browser.cjs` uses Chromium to open each archived game and V5, exercises keyboard/pointer-supported UI, reads Canvas pixels, takes screenshots, verifies both paddle faces charge without LIFE loss, powered target hit updates score and energy UI, three unpowered object collisions trigger GAME OVER, and checks RESET / LEVEL CLEAR / NEXT STAGE in the actual DOM.

`pages.yml` runs those tests before publishing the site. A failure must block the deploy. The screenshots are attached to the Actions run as `orbit-browser-proof`. No completed CI run means the Pages build is unverified even if files exist in the branch.
