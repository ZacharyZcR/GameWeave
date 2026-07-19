import { defineComponent, definePlugin } from "@gameweave/core";
import { RigidBody, supportsCharacterMovement, type PhysicsAdapter } from "@gameweave/physics";
import { Transform } from "@gameweave/three";

export interface InputSnapshot {
  readonly move: readonly [number, number];
  readonly look: readonly [number, number];
  readonly jump: boolean;
  readonly sprint: boolean;
  readonly fire: boolean;
}

export type InputSource = () => InputSnapshot;

export interface InputRecording {
  readonly sources: Readonly<Record<string, readonly InputSnapshot[]>>;
}

const idleInput: InputSnapshot = {
  move: [0, 0], look: [0, 0], jump: false, sprint: false, fire: false,
};

export class InputManager {
  #sources = new Map<string, InputSource>();
  #snapshots = new Map<string, InputSnapshot>();
  #recording: Map<string, InputSnapshot[]> | undefined;
  #replay: InputRecording | undefined;
  #replayFrame = 0;

  register(id: string, source: InputSource): this {
    if (this.#sources.has(id)) throw new Error(`Input source already registered: ${id}`);
    this.#sources.set(id, source);
    return this;
  }

  capture(): void {
    for (const [id, source] of this.#sources) {
      const recorded = this.#replay?.sources[id]?.[this.#replayFrame];
      const snapshot = structuredClone(recorded ?? source());
      this.#snapshots.set(id, snapshot);
      if (this.#recording) {
        const frames = this.#recording.get(id) ?? [];
        frames.push(structuredClone(snapshot));
        this.#recording.set(id, frames);
      }
    }
    if (this.#replay) this.#replayFrame += 1;
  }

  startRecording(): void {
    this.#recording = new Map();
  }

  stopRecording(): InputRecording {
    const sources = Object.fromEntries(
      [...(this.#recording ?? [])].map(([id, frames]) => [id, structuredClone(frames)]),
    );
    this.#recording = undefined;
    return { sources };
  }

  play(recording: InputRecording): void {
    this.#replay = recording;
    this.#replayFrame = 0;
  }

  stopPlayback(): void {
    this.#replay = undefined;
    this.#replayFrame = 0;
  }

  get(id: string): InputSnapshot {
    if (!this.#sources.has(id)) throw new Error(`Unknown input source: ${id}`);
    return this.#snapshots.get(id) ?? idleInput;
  }
}

export const CharacterMotor = defineComponent("characterMotor", {
  defaults: { speed: 5, sprintSpeed: 9, jumpSpeed: 5, gravity: 20, verticalSpeed: 0, grounded: true },
});

export const Controller = defineComponent("controller", {
  defaults: { type: "player" as "player" | "bot" | "replay", input: "keyboardMouse" },
});

export const CameraRig = defineComponent("cameraRig", {
  defaults: { mode: "firstPerson" as "firstPerson" | "thirdPerson", fov: 60, distance: 4, eyeHeight: 1.6 },
});

export function character(input = new InputManager()) {
  return {
    ...definePlugin({
      id: "gameweave.character",
      install: (game) => game.provide("input", input),
      setupWorld: (world) => {
        world.register(Transform).register(RigidBody).register(CharacterMotor).register(Controller).register(CameraRig);
        world.addSystem({
          name: "character.input", phase: "fixedUpdate",
          optionalBefore: ["physics.step"],
          run: () => input.capture(),
        });
        world.addSystem({
          name: "character.move", phase: "fixedUpdate",
          after: ["character.input"],
          optionalBefore: ["physics.step"],
          run: ({ dt }) => {
            const adapter = world.services.get("physics") as PhysicsAdapter | undefined;
            for (const entity of world.query(CharacterMotor, Controller, RigidBody)) {
              const motor = entity.get(CharacterMotor);
              const controller = entity.get(Controller);
              const body = entity.get(RigidBody);
              if (!motor || !controller || !body || controller.type !== "player") continue;
              const state = input.get(controller.input);
              const speed = state.sprint ? motor.sprintSpeed : motor.speed;
              const verticalSpeed = state.jump && motor.grounded
                ? motor.jumpSpeed
                : motor.verticalSpeed - motor.gravity * dt;
              const velocity: [number, number, number] = [state.move[0] * speed, verticalSpeed, state.move[1] * speed];
              if (adapter && supportsCharacterMovement(adapter) && body.type === "kinematic") {
                const result = adapter.moveCharacter(world, entity.id, velocity.map((value) => value * dt) as [number, number, number]);
                entity.set(CharacterMotor, {
                  grounded: result.grounded,
                  verticalSpeed: result.grounded && verticalSpeed < 0 ? 0 : verticalSpeed,
                });
                entity.set(RigidBody, { velocity });
              } else {
                entity.set(CharacterMotor, { verticalSpeed });
                entity.set(RigidBody, { velocity });
              }
            }
          },
        });
        world.addSystem({
            name: "character.camera", phase: "render",
            optionalAfter: ["three.sync"],
            optionalBefore: ["three.render"],
            run: () => {
              if (!world.services.has("renderer")) return;
              const renderer = world.service<{ camera: {
                fov: number;
                position: { set(x: number, y: number, z: number): void };
                updateProjectionMatrix(): void;
              } }>("renderer");
              const entity = world.query(Transform, CameraRig).snapshot()[0];
              if (!entity) return;
              const transform = entity.get(Transform), rig = entity.get(CameraRig);
              if (!transform || !rig) return;
              const offset = rig.mode === "thirdPerson" ? rig.distance : 0;
              renderer.camera.position.set(transform.position[0], transform.position[1] + rig.eyeHeight, transform.position[2] + offset);
              if (renderer.camera.fov !== rig.fov) { renderer.camera.fov = rig.fov; renderer.camera.updateProjectionMatrix(); }
            },
          });
      },
    }), input,
  };
}
