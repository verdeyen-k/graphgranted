# 📈 Graph and Granted

A puzzle game about a guy who walks to the right forever. You can't touch him: you grab the **graph** instead.

## How to play

- **✋ Move** slides the graph's line and **🔄 Rotate** turns it around the yellow dot, so where everything starts stays still. Then press **▶ Go**.
- The yellow dot runs along the line from the left side to the right side in 10 seconds. Its height is the **number** (−10 to 10).
- 🟥 **Red** slides left when the number is high, and right when it's low.
- 🟦 **Blue** slides left when the number is low, and right when it's high.
- 🟧 **Orange** ignores the graph. It falls, and things push it around.
- ⬜ **Grey** never moves.
- Red, blue and orange pieces are straight bars or balls. Grey can be any shape, so it can slope and be bumpy.
- Get the guy to the 🏁 flag. If he falls or gets stuck, change the graph and try again.

Keys: ↑ ↓ move the line, ← → turn it, M / R switch between move and rotate, Space or Enter is Go and Stop.

The guy is drawn like a Coconut Craze player, but green so he doesn't get mixed up with the red and blue pieces.

## Making levels

**✏️ Make a level** opens the level maker. Draw grey ground with the pen or straight lines, drag out bars and balls, and put the guy and the flag where you want them. Your levels save on this device.

To **upload** a level you have to beat it yourself first with **▶ Test**. Uploaded levels go to **🌍 Uploaded levels**, where everyone can play them. They're stored in the Firebase Realtime Database (the `kvgames` project the other games use), under `games/graphgranted/levels`.

## Files

- `index.html`: the screens and styles.
- `sim.js`: the physics and the 8 built-in levels. It doesn't touch the page, so it also runs in node (for checking that levels can be beaten).
- `graph.js`: drawing, the graph, the level maker and uploading.
- `version.txt`: the newest version number. When you change the game, bump it here and in `index.html` (`?v=` on the scripts and `var V =`), so old copies in browsers reload themselves.
