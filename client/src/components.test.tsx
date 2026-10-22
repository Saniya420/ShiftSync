import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { scheduledHours, WeekPicker } from './components';
import { Modal } from './Modal';
describe('week navigation and totals', () => {
  it('moves across year boundaries in full weeks', () => {
    const onChange = vi.fn();
    render(<WeekPicker week="2026-12-28" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onChange).toHaveBeenCalledWith('2027-01-04');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onChange).toHaveBeenCalledWith('2026-12-21');
  });
  it('clips overnight shifts to the local week for hours and cost', () => {
    const shifts = [
      { startsAt: '2026-10-18T22:00:00Z', endsAt: '2026-10-19T06:00:00Z' },
      { startsAt: '2026-10-25T22:00:00Z', endsAt: '2026-10-26T06:00:00Z' },
    ];
    expect(scheduledHours(shifts, '2026-10-19', 'UTC')).toBe(8);
    expect(scheduledHours(shifts)).toBe(16);
  });
  it('measures elapsed hours over DST changes', () => {
    expect(
      scheduledHours([
        { startsAt: '2026-03-08T01:00:00-05:00', endsAt: '2026-03-08T04:00:00-04:00' },
      ]),
    ).toBe(2);
  });
  it('supports keyboard dismissal, initial focus and focus restoration', () => {
    const close = vi.fn();
    const previous = document.createElement('button');
    document.body.append(previous);
    previous.focus();
    const view = render(
      <Modal title="Edit shift" onClose={close}>
        <input aria-label="Start time" />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit shift' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(previous).toHaveFocus();
    previous.remove();
  });
});
