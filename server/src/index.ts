import { createApp } from "./app.js";
import { GameStore } from "./store.js";

const port = Number(process.env.PORT ?? 3001);

const store = new GameStore([
  {
    title: "Echoes of Aria",
    genre: "rpg",
    storyline: "A bard rewrites reality by rediscovering forgotten songs.",
  },
  {
    title: "Neon Ascent",
    genre: "platformer",
    storyline: "Climb an endless megacity tower while gravity keeps flipping.",
  },
]);

const app = createApp(store);

app.listen(port, () => {
  console.log(`ai-gamedev server listening on http://localhost:${port}`);
});
