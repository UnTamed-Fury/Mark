import { describe, it, expect } from 'vitest';
import {
  truncateAfkReason,
  getAfkSetRoast,
  getAfkMentionRoast,
  getAfkReturnRoast,
  isEssay,
  isDegenerate,
  isGrass,
  MAX_REASON_DISPLAY_LENGTH,
} from '../src/core/afkRoast.js';

describe('AFK Roast System', () => {
  const MILKY_WAY_ESSAY =
    'The Milky Way is a giant barred spiral galaxy that contains our solar system along with hundreds of billions of stars, gas, and dust. ' +
    'Shape and SizeType: Barred spiral galaxy with a central bar-shaped structure of stars surrounded by a flat disk and spiral arms. ' +
    'Diameter: Approximately 100,000 light-years across. Thickness: About 1,000 light-years thick in the main disk. ' +
    'Star Count: Estimated to hold between 100 billion and 400 billion stars. Location of Earth Solar System: Located about 25,000 light-years away from the galactic center.';

  describe('truncateAfkReason', () => {
    it('does not truncate short or normal reasons', () => {
      expect(truncateAfkReason('Going for a quick walk')).toBe('Going for a quick walk');
      expect(truncateAfkReason('AFK')).toBe('AFK');
    });

    it('truncates excessively long paragraph reasons at MAX_REASON_DISPLAY_LENGTH', () => {
      const truncated = truncateAfkReason(MILKY_WAY_ESSAY);
      expect(truncated.length).toBeLessThanOrEqual(MAX_REASON_DISPLAY_LENGTH + 3);
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('respects custom maxLength', () => {
      const truncated = truncateAfkReason('Hello world this is a test', 10);
      expect(truncated).toBe('Hello worl...');
    });
  });

  describe('isEssay, isDegenerate, isGrass helpers', () => {
    it('identifies essay-length reasons correctly', () => {
      expect(isEssay(MILKY_WAY_ESSAY)).toBe(true);
      expect(isEssay('Normal short reason')).toBe(false);
    });

    it('identifies degenerate keywords', () => {
      expect(isDegenerate('gooning')).toBe(true);
      expect(isDegenerate('edging right now')).toBe(true);
      expect(isDegenerate('doing homework')).toBe(false);
    });

    it('identifies touch grass variations', () => {
      expect(isGrass('touching grass')).toBe(true);
      expect(isGrass('touch grass')).toBe(true);
      expect(isGrass('grass')).toBe(true);
      expect(isGrass('eating a salad')).toBe(false);
    });
  });

  describe('getAfkSetRoast', () => {
    it('roasts when setting an essay or paragraph as AFK reason', () => {
      const roast = getAfkSetRoast(MILKY_WAY_ESSAY, 0);
      expect(roast).toBe('Bro wrote a whole Wikipedia article for an AFK reason. Nobody is reading your thesis.');
    });

    it('cycles through essay set roasts with different seeds', () => {
      const roast1 = getAfkSetRoast(MILKY_WAY_ESSAY, 1);
      const roast2 = getAfkSetRoast(MILKY_WAY_ESSAY, 2);
      expect(roast1).toBe('Did you set an AFK reason or submit your final semester dissertation?');
      expect(roast2).toBe('100,000 light-years across the galaxy and not a single soul asked for this essay.');
    });

    it('roasts degenerate reasons (e.g. gooning, edging)', () => {
      const roast = getAfkSetRoast('gooning', 0);
      expect(roast).toBe('Bro announced that to the entire server with zero shame.');
    });

    it('roasts touch grass reasons', () => {
      const roast = getAfkSetRoast('touching grass', 0);
      expect(roast).toBe('We all know you\'re not actually touching any grass.');
    });

    it('returns null for normal AFK reasons', () => {
      expect(getAfkSetRoast('Studying for math exam')).toBeNull();
      expect(getAfkSetRoast('Doing laundry')).toBeNull();
      expect(getAfkSetRoast('AFK')).toBeNull();
      expect(getAfkSetRoast('Sleeping')).toBeNull();
    });
  });

  describe('getAfkMentionRoast', () => {
    it('roasts when someone mentions an AFK user who has an essay reason', () => {
      const roast = getAfkMentionRoast(MILKY_WAY_ESSAY, 0);
      expect(roast).toBe('Bro wrote a whole Wikipedia article for an AFK status. Nobody is reading that thesis.');
    });

    it('roasts when someone mentions an AFK user with degenerate reason', () => {
      const roast = getAfkMentionRoast('gooning', 0);
      expect(roast).toBe('Bro really put that as their public AFK reason.');
    });

    it('roasts when someone mentions an AFK user with grass reason', () => {
      const roast = getAfkMentionRoast('touching grass', 0);
      expect(roast).toBe('They definitely aren\'t touching any grass right now.');
    });

    it('returns null for standard mentions', () => {
      expect(getAfkMentionRoast('Working on code')).toBeNull();
      expect(getAfkMentionRoast('Sleeping')).toBeNull();
    });
  });

  describe('getAfkReturnRoast', () => {
    it('does NOT roast normal quick returns (someone pinged them or quick reply)', () => {
      expect(getAfkReturnRoast('Just away', 5_000, '5s')).toBeNull();
      expect(getAfkReturnRoast('sleeping', 15_000, '15s')).toBeNull();
      expect(getAfkReturnRoast('eating', 30_000, '30s')).toBeNull();
      expect(getAfkReturnRoast('shower', 10_000, '10s')).toBeNull();
    });

    it('roasts essay posters returning with funny roasts', () => {
      const roast = getAfkReturnRoast(MILKY_WAY_ESSAY, 120_000, '2m', 0);
      expect(roast).toBe('All that essay just to come back already.');
    });

    it('roasts degenerate reasons on return', () => {
      const roast = getAfkReturnRoast('gooning', 600_000, '10m', 0);
      expect(roast).toBe('Welcome back... please go wash your hands with bleach.');
    });

    it('roasts touch grass reasons on return', () => {
      const roast = getAfkReturnRoast('touching grass', 60_000, '1m', 0);
      expect(roast).toBe('Did you survive the outside world or did the sun burn you?');
    });

    it('returns null for normal AFK sessions', () => {
      const roast = getAfkReturnRoast('Working at office', 4 * 3600_000, '4h');
      expect(roast).toBeNull();
    });
  });
});
