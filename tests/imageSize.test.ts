import { describe, expect, it } from 'vitest';
import { fitWithin } from '../src/logic/imageSize';

describe('fitWithin', () => {
  it('scales the long edge down to the limit', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4032, 3024, 300)).toEqual({ width: 300, height: 225 });
  });
  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });
  it('keeps at least 1 px on extreme aspect ratios', () => {
    expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
