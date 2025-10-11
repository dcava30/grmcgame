# Gordon's Blocky Kitchen Brigade

A retro-leaning browser management game inspired by Overcooked where you guide pixelated Gordon Ramsay through a Minecraft-style
kitchen. Each timed shift lasts between three and five minutes, and the goal is to rack up as many points as possible by turning
in complete dishes before their order timers expire. The kitchen supports mouse clicks and mobile taps.

## Game loop

- **Grab ingredients** from the supply crates on the left wall.
- **Prep** anything that needs chopping on the cutting boards.
- **Cook** items on the matching stove type (skillet or cauldron) until they hit the cooked stage.
- **Plate and serve** finished ingredients at the plating counter to fill customer orders. Deliver everything a ticket needs to
  score bonus points before its personal timer runs out.
- **Keep moving!** Wandering zombie sous-chef adds ambience with random groans while you chase high scores.

The project uses the Phaser 3 engine to deliver a Unity-like scene flow within the constraints of a lightweight web build, so it
remains easy to run locally while still providing a structured engine-driven experience.

## Running locally

1. Clone or download this repository.
2. Open `index.html` in any modern desktop or mobile browser. No build step is required.
3. Tap or click stations to direct Gordon around the kitchen and push your service score as high as possible before time expires.
