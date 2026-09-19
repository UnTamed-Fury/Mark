import { describe, it, expect } from 'vitest';
import { isWebsiteQuery } from '../src/core/autoResponder.js';

describe('Auto-Responder 5-Stage Sequential Filter Engine', () => {
  describe('Positive Query Matches', () => {
    const positiveQueries = [
      'what is the website',
      'whats the website',
      'what is the link',
      'whats the link',
      'where is the website',
      'where is the link',
      'where is the official site',
      'what is the official animex url',
      'forgot the link',
      'forgot the website',
      'lost the link',
      'lost the site',
      'animex website',
      'animex link',
      'animex site',
      'animex url',
      'website of animex',
      'link for animex',
      'send the website',
      'give me the link',
      'gimme the site',
      'need the link',
      'find the website',
      'get the link',
      'please the website',
      'link please',
      'website please',
      'site url',
      'site link',
      'link to site',
      'url for website',
    ];

    for (const query of positiveQueries) {
      it(`should match positive query: "${query}"`, () => {
        expect(isWebsiteQuery(query)).toBe(true);
      });
    }
  });

  describe('Typo & Slang Tolerant Queries', () => {
    const typoQueries = [
      'whats the webste',
      'whats the webiste',
      'whats the websit',
      'whats the lnik',
      'whats the likn',
      'whats the linck',
      'where is the urll',
      'where is the siet',
      'animx website',
      'aimex link',
      'forgott the link',
      'forgote the site',
      'forgor the link',
      'wheres the link',
      'link plz',
      'website pls',
    ];

    for (const query of typoQueries) {
      it(`should match typo query: "${query}"`, () => {
        expect(isWebsiteQuery(query)).toBe(true);
      });
    }
  });

  describe('Negative Queries & Anti-False Positive Exclusions', () => {
    const negativeQueries = [
      'send discord link',
      'what is the discord link',
      'where is the rules link',
      'give me the video link',
      'episode link please',
      'image link',
      'twitter link',
      'youtube link',
      'tiktok link',
      'link to discord',
      'link for rules',
      'link of youtube',
      'hello how are you',
      'i like anime',
      'where can i watch episode 5',
      'what happened to the server',
      'random chatter without any target words',
      'link',
      'website',
      'site',
      'animex',
      '',
      '   ',
    ];

    for (const query of negativeQueries) {
      it(`should reject non-website or excluded query: "${query}"`, () => {
        expect(isWebsiteQuery(query)).toBe(false);
      });
    }
  });

  describe('Edge Cases & Boundary Limits', () => {
    it('should reject messages exceeding 200 characters', () => {
      const longMessage = 'what is the website '.repeat(20);
      expect(isWebsiteQuery(longMessage)).toBe(false);
    });

    it('should reject messages exceeding 25 words', () => {
      const manyWords = 'what is the website ' + 'extra '.repeat(25);
      expect(isWebsiteQuery(manyWords)).toBe(false);
    });

    it('should handle zero-width spaces and weird unicode formatting', () => {
      const cleanWithZeroWidth = 'what\u200B is\uFEFF the\u200C website';
      expect(isWebsiteQuery(cleanWithZeroWidth)).toBe(true);
    });
  });
});
