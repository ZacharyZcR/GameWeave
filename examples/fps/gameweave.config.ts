import { defineGame } from "@gameweave/cli";

export default defineGame({
  name: "GameWeave FPS",
  identifier: "dev.gameweave.fps",
  version: "0.1.0",
  window: { width: 1600, height: 900, resizable: true },
});
