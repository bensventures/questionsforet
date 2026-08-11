import { W, H } from './params';

export const idx = (x: number, y: number) => y * W + x;
export const dans = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const borne = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
