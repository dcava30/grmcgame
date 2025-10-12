# Gordon's Blocky Kitchen Brigade

A retro-leaning browser management game inspired by Overcooked where you guide pixelated Gordon Ramsay through a Minecraft-style
kitchen. Three escalating services (3, 4, and 4 minutes long) challenge you to clear specific score targets by completing
Minecraft-inspired recipes before their order timers expire. The kitchen supports mouse clicks and mobile taps.

## Game loop

- **Grab ingredients** from the supply crates on the left wall.
- **Prep** anything that needs chopping on the cutting boards.
- **Cook** items on the matching stove type (skillet or cauldron) until they hit the cooked stage.
- **Plate and serve** finished ingredients at the plating counter to fill customer orders. Clear every ingredient on a ticket to
  bank the recipe's point value before its personal timer runs out.
- **Keep moving!** Wandering zombie sous-chef adds ambience with random groans while you chase high scores.

The project uses the Phaser 3 engine to deliver a Unity-like scene flow within the constraints of a lightweight web build, so it
remains easy to run locally while still providing a structured engine-driven experience.

## Levels & scoring

- **Level 1 – Tutorial Service (3 minutes, goal: 32 pts):** Serve one easy, one medium, and one hard recipe to learn the flow.
- **Level 2 – Dinner Rush (4 minutes, goal: 100 pts):** Maintain a steady rhythm as overlapping tickets demand quick multitasking.
- **Level 3 – Chef Showdown (4 minutes, goal: 130 pts):** Keep every station humming to break the final score threshold and view
  the BigRigDev thank-you message while future content is still in development.

Recipe difficulty determines its value: easy dishes award 6 points, medium dishes give 10 points, and hard dishes deliver 16
points. Clearing a level requires meeting or exceeding its point target before time expires.

## Running locally

1. Clone or download this repository.
2. Open `index.html` in any modern desktop or mobile browser. No build step is required.
3. Tap or click stations to direct Gordon around the kitchen and push your service score as high as possible before time expires.
