export type SwapState = 'PENDING' | 'ACCEPTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type SwapAction = 'accept' | 'approve' | 'reject' | 'cancel';
export function transitionSwap(
  status: SwapState,
  action: SwapAction,
  actor: { isRequester: boolean; isManager: boolean; eligible: boolean },
): SwapState | null {
  if (action === 'cancel' && actor.isRequester && ['PENDING', 'ACCEPTED'].includes(status))
    return 'CANCELLED';
  if (action === 'accept' && !actor.isRequester && actor.eligible && status === 'PENDING')
    return 'ACCEPTED';
  if (action === 'approve' && actor.isManager && status === 'ACCEPTED') return 'APPROVED';
  if (action === 'reject' && actor.isManager && ['PENDING', 'ACCEPTED'].includes(status))
    return 'REJECTED';
  return null;
}
