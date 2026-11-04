# ORBIT BREAK — gameplay and CI checks

## Game rules

- The arena is a circular wall (radius 242 px, centered at 400, 300). The ball reflects specularly on the circular wall, not by random angle.
- Moving/rotating targets use deterministic seeded positions and velocities; targets are kept away from the paddle's annular lane.
- The paddle is a short curved arc which rotates around the arena. Contact with **either** side reflects the ball and fully restores its energy to 100%. Neither side costs a LIFE.
- Hitting an object with a powered ball deals one hit of damage and consumes 34 energy. A ball with 0 energy reflects without damaging the target or losing LIFE. The drifting target objects can enter the paddle lane. If a target physically collides with the curved paddle (including its ends), one LIFE is lost, the target is separated and reflected away from the paddle. Three separated paddle-object collisions cause GAME OVER. A 1.1-second damage grace prevents a single overlapping contact from instantly exhausting all lives. The player must avoid incoming targets while guiding the ball back to the paddle to recharge.
- Destroy all targets to clear the stage and advance; higher stages add targets and increase the fixed ball speed.
- All ball bounces use collision normals; speed is normalized after contact so moving targets or the paddle never cause runaway acceleration.

## Physics/gameplay regression plan

`node tests/orbit.test.cjs` verifies circular reflection, 24 front-face orientations charging to 100, harmless rear-face charging, exactly three powered hits per charge, harmless repeated unpowered ball-object reflections, movement into the paddle lane, and scoring/level transitions. `node tests/orbit-paddle.test.cjs` verifies that targets can collide with a stationary or moving paddle, target rebound/separation, damage grace, and three paddle-object hits causing GAME OVER. Simulation also verifies speed bounds.

`node tests/orbit.browser.cjs` uses Chromium to open each archived game and V5, exercises keyboard/pointer-supported UI, reads Canvas pixels, takes screenshots, verifies both paddle faces charge without LIFE loss, powered target hit updates score and energy UI, repeated unpowered ball-object reflections cause no damage, three drifting target-paddle collisions trigger GAME OVER, and checks RESET / LEVEL CLEAR / NEXT STAGE in the actual DOM.

`pages.yml` runs those tests before publishing the site. A failure must block the deploy. The screenshots are attached to the Actions run as `orbit-browser-proof`. No completed CI run means the Pages build is unverified even if files exist in the branch.
