import { describe, expect, it } from 'vitest';
import { getSessionStatus, type MarketSession } from '../src/domain/market-session.js';

const nse: MarketSession = {
  id: 'nse-regular',
  timezone: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5],
  open: '09:15',
  close: '15:30',
};

describe('market session calendar', () => {
  it.each([
    ['2026-07-13T03:44:00.000Z', 'pre_open'],
    ['2026-07-13T03:45:00.000Z', 'open'],
    ['2026-07-13T10:00:00.000Z', 'closed'],
    ['2026-07-12T05:00:00.000Z', 'closed'],
  ] as const)('classifies %s as %s using the venue timezone', (timestamp, state) => {
    expect(getSessionStatus(nse, new Date(timestamp))).toMatchObject({
      sessionId: 'nse-regular',
      state,
    });
  });

  it('rejects ambiguous overnight sessions until an explicit policy exists', () => {
    expect(() =>
      getSessionStatus({ ...nse, open: '22:00', close: '02:00' }, new Date('2026-07-13T18:00:00Z')),
    ).toThrow('overnight_session_not_supported');
  });
});
