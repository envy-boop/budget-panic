# Budget Panic 🛒

A fast, funny market-survival game for [start.ng](https://start.ng). You have a recipe to cook, a small budget, and prices that keep moving. Haggle with traders, dodge pickpockets, survive market chaos, and buy the whole list before you go broke.

**Play it:** https://budget-panic.start.ng

Built by Eniola with three.js.

## How to play

You are a shopper in a Nigerian market. Each round gives you a recipe (like Jollof Rice or Stew & Rice) and a shopping list.

1. Walk to an item with a gold ring. Items on your list have the ring.
2. Stand close and press **Space**. A haggle bar starts sliding.
3. Press **Space** again to lock the price:
   - **Green zone:** 40% off
   - **Yellow zone:** 15% off
   - **Miss:** you pay 15% more
4. Buy every item on the list to finish the round. You get bonus money and a harder round.
5. Run out of money and it's over.

**Watch out for:**

- **Impulse buys.** Touching an item that is not on your list costs you full price.
- **Traders.** They chase you and take your money. There are four kinds: grunt, sprinter, tank and pickpocket. A hit also ruins any haggle in progress.
- **Moving prices.** ▲ means the price is going up, ▼ means it is dropping.
- **Rising prices.** Everything gets a bit more expensive as the round goes on.
- **Mama's calls.** Mama sometimes phones with one more thing to buy.
- **Market events** from round 2: fuel price hike, NEPA taking light, rain, and flash sales.

**Power-ups:** ⚡ speed boost, 🛡️ shield that blocks one hit, 💰 cash.

## Controls

| Key | What it does |
| --- | --- |
| WASD or arrow keys | Move |
| Space | Haggle / lock the price / play again |
| Esc | Walk away from a haggle |
| P | Pause |
| M | Sound on/off |

### On a phone or tablet

| Touch | What it does |
| --- | --- |
| Thumb down anywhere on the floor, then drag | Move. A joystick appears under your thumb; a small push walks, a big push runs |
| Big button, bottom right | **HAGGLE** when you're next to a gold-ringed item, then **LOCK!** to lock the price |
| ✕ next to it | Walk away from a haggle |
| Small buttons, top right | Pause, sound, full screen (where the browser allows it) |

Touch controls switch on by themselves on phones and tablets, and hide again as soon as someone presses a movement key. The game fits both portrait and landscape: on a tall screen the market gets taller instead of squeezed, item names grow so they stay readable, and nothing spawns under the score bar or the buttons. Traders move 10% slower for touch players, because a thumb is less precise than a key.

## Run it on your computer

You need [Node.js](https://nodejs.org) installed. There is no build step, because the game is plain HTML, CSS and JavaScript, and three.js loads from a CDN.

```
git clone https://github.com/envy-boop/budget-panic.git
cd budget-panic
npx serve
```

Open the link it prints (usually http://localhost:3000). Don't double-click `index.html`, because browsers block the game's scripts when you open it that way.

On your own computer the game can't reach start.ng, so it runs in guest mode. Sign-in only works on the live site.

## How it uses start.ng

The game never handles passwords, tokens or emails. It only asks start.ng who is playing.

- **`src/platform.js`** loads start.ng in a hidden frame and asks "who is signed in?". start.ng answers with the player's `id`, `name` and `style`. The game only accepts answers that really come from start.ng, and it treats no answer as "unknown", not "signed out". It checks again when the tab regains focus, so signing in or out on start.ng is noticed.
- **Signed in:** the player is greeted by name, and their scores are saved under their own id.
- **Not signed in:** the menu shows "Sign in with start.ng" and "Play as guest".
- **Sign-in not available** (for example on localhost): guest only, with a short note.

### The player's character (centralized styling)

Every start.ng player has one look that follows them into every game. start.ng sends it as:

```
{ primaryColor, secondaryColor, skinColor, hat, accessory }
```

`src/character.js` turns that into the shopper:

| Value | In Budget Panic |
| --- | --- |
| `primaryColor` | Body |
| `secondaryColor` | Outline, hats, scarf and backpack |
| `skinColor` | Face |
| `hat` (none, cap, beanie, tophat, crown) | Drawn on top of the circle |
| `accessory` (none, glasses, scarf, backpack) | Drawn on the face or body |

Missing or unknown values fall back to a default look, so new options added by start.ng later won't break the game. Guests get the default look and show as "Guest".

## Scores

Best scores and a top-10 leaderboard are saved in the browser's `localStorage`, keyed by start.ng user id. This means scores stay on the device you played on. A shared leaderboard would need a server, which start.ng games don't have.

## Project files

```
index.html     page + three.js import map
style.css      market floor background
cover.png      game card picture (1600 x 1000)
src/game.js    the game
src/touch.js   phone controls: joystick, HAGGLE/LOCK button, pause/sound/full screen
src/platform.js    start.ng sign-in
src/character.js   draws the player's character
```

## Changing the game

- Item names and prices are in the `CATALOG` list in `src/game.js`.
- Recipes are in the `RECIPES` list.
- Starting money and round bonus are `START_BUDGET` and `ROUND_BONUS`.

To update the live game, push your changes to GitHub. start.ng picks them up on its own within a minute or two.

## What was tested

Played through in a simulated browser (menu, haggling, clearing rounds, game over, leaderboard, restart) with no errors. The real start.ng sign-in has to be checked on the live site.

Phone controls were tested with touch emulation at 390 x 844 (portrait) and 844 x 390 (landscape): joystick movement, tapping HAGGLE next to an item, the haggle bar, LOCK!, pause and sound, with no errors. Desktop at 1280 x 720 still plays with the keyboard and shows no touch buttons. Real phones (especially iPhone Safari) still need a quick check on the live site.
