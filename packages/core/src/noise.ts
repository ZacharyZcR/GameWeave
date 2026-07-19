import { SeededRandom } from "./random.js";

export interface Noise2D {
  sample(x: number, y: number): number;
  fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
}

// 确定性 2D 值噪声：同种子跨环境同输出，供程序化生成使用
export function createNoise2D(seed: string | number): Noise2D {
  const random = new SeededRandom(seed);
  const perm = new Uint8Array(512);
  const table = Array.from({ length: 256 }, (_, index) => index);
  for (let index = 255; index > 0; index -= 1) {
    const swap = random.integer(0, index);
    [table[index], table[swap]] = [table[swap]!, table[index]!];
  }
  for (let index = 0; index < 512; index += 1) perm[index] = table[index & 255]!;

  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (hash: number, x: number, y: number): number => {
    switch (hash & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  const sample = (x: number, y: number): number => {
    const gridX = Math.floor(x) & 255, gridY = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[gridX]! + gridY, b = perm[gridX + 1]! + gridY;
    return lerp(
      lerp(grad(perm[a]!, x, y), grad(perm[b]!, x - 1, y), u),
      lerp(grad(perm[a + 1]!, x, y - 1), grad(perm[b + 1]!, x - 1, y - 1), u),
      v,
    );
  };

  return {
    sample,
    fbm(x, y, octaves = 4, lacunarity = 2, gain = .5) {
      let amplitude = 1, frequency = 1, sum = 0, norm = 0;
      for (let octave = 0; octave < octaves; octave += 1) {
        sum += sample(x * frequency, y * frequency) * amplitude;
        norm += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
      }
      return sum / norm;
    },
  };
}
