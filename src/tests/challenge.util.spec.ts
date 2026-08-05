import { describe, it, expect } from '@jest/globals';
import {
  generateChallenge,
  getChallengeExpiry,
  isChallengeExpired,
  getChallengeExpirySeconds,
} from '../utils/challenge.util';

describe('challenge.util', () => {
  describe('generateChallenge', () => {
    it('produces a challenge in the xelma_auth_<timestamp>_<random> format', () => {
      const challenge = generateChallenge();
      expect(challenge).toMatch(/^xelma_auth_\d+_[0-9a-f]{64}$/);
    });

    it('produces a unique value on every call', () => {
      const a = generateChallenge();
      const b = generateChallenge();
      expect(a).not.toBe(b);
    });
  });

  describe('getChallengeExpiry', () => {
    it('returns a Date roughly 5 minutes in the future', () => {
      const before = Date.now();
      const expiry = getChallengeExpiry();
      const after = Date.now();

      const deltaFromBefore = expiry.getTime() - before;
      const deltaFromAfter = expiry.getTime() - after;

      expect(deltaFromBefore).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000);
      expect(deltaFromAfter).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
    });
  });

  describe('isChallengeExpired', () => {
    it('is false for a future expiry', () => {
      expect(isChallengeExpired(new Date(Date.now() + 60_000))).toBe(false);
    });

    it('is true for a past expiry', () => {
      expect(isChallengeExpired(new Date(Date.now() - 60_000))).toBe(true);
    });
  });

  describe('getChallengeExpirySeconds', () => {
    it('matches the 5-minute expiry window in seconds', () => {
      expect(getChallengeExpirySeconds()).toBe(300);
    });
  });
});
