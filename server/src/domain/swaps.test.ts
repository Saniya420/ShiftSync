import { describe, expect, it } from 'vitest';
import { transitionSwap, type SwapAction, type SwapState } from './swaps.js';
const states: SwapState[] = ['PENDING', 'ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED'];
const actions: SwapAction[] = ['accept', 'approve', 'reject', 'cancel'];
describe('swap state machine', () => {
  for (const state of states)
    for (const action of actions) {
      it(state + ' / ' + action, () => {
        const expected =
          action === 'cancel' && ['PENDING', 'ACCEPTED'].includes(state)
            ? 'CANCELLED'
            : action === 'accept' && state === 'PENDING'
              ? 'ACCEPTED'
              : action === 'approve' && state === 'ACCEPTED'
                ? 'APPROVED'
                : action === 'reject' && ['PENDING', 'ACCEPTED'].includes(state)
                  ? 'REJECTED'
                  : null;
        expect(
          transitionSwap(state, action, {
            isRequester: action === 'cancel',
            isManager: true,
            eligible: true,
          }),
        ).toBe(expected);
      });
    }
  it('enforces actor permissions', () => {
    expect(
      transitionSwap('PENDING', 'accept', { isRequester: true, isManager: false, eligible: true }),
    ).toBeNull();
    expect(
      transitionSwap('PENDING', 'accept', {
        isRequester: false,
        isManager: false,
        eligible: false,
      }),
    ).toBeNull();
    expect(
      transitionSwap('ACCEPTED', 'approve', {
        isRequester: false,
        isManager: false,
        eligible: true,
      }),
    ).toBeNull();
    expect(
      transitionSwap('ACCEPTED', 'reject', {
        isRequester: false,
        isManager: false,
        eligible: true,
      }),
    ).toBeNull();
    expect(
      transitionSwap('ACCEPTED', 'cancel', { isRequester: false, isManager: true, eligible: true }),
    ).toBeNull();
  });
});
