import { TestBed } from '@angular/core/testing';
import { SplitPane } from './split-pane';

describe('SplitPane', () => {
  beforeEach(() => localStorage.clear());

  async function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(SplitPane);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    await fixture.whenStable();
    const divider = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[role="separator"]',
    )!;
    const press = async (key: string) => {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await fixture.whenStable();
    };
    return { divider, press };
  }

  it('exposes the window-splitter ARIA attributes', async () => {
    const { divider } = await setup({ initialSize: 40, min: 20, max: 70 });
    expect(divider.getAttribute('aria-valuenow')).toBe('40');
    expect(divider.getAttribute('aria-valuemin')).toBe('20');
    expect(divider.getAttribute('aria-valuemax')).toBe('70');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.tabIndex).toBe(0);
  });

  it('resizes with the arrow keys and clamps to min/max', async () => {
    const { divider, press } = await setup({ initialSize: 50, min: 46, max: 54 });
    await press('ArrowRight');
    expect(divider.getAttribute('aria-valuenow')).toBe('52');
    await press('End');
    expect(divider.getAttribute('aria-valuenow')).toBe('54');
    await press('ArrowRight');
    expect(divider.getAttribute('aria-valuenow')).toBe('54');
    await press('Home');
    expect(divider.getAttribute('aria-valuenow')).toBe('46');
    await press('Enter');
    expect(divider.getAttribute('aria-valuenow')).toBe('50');
  });

  it('uses up/down keys in vertical orientation', async () => {
    const { divider, press } = await setup({ orientation: 'vertical', initialSize: 50 });
    expect(divider.getAttribute('aria-orientation')).toBe('horizontal');
    await press('ArrowDown');
    expect(divider.getAttribute('aria-valuenow')).toBe('52');
    await press('ArrowRight');
    expect(divider.getAttribute('aria-valuenow')).toBe('52');
  });

  it('remembers the size when a storage key is given', async () => {
    const first = await setup({ storageKey: 'test:split', initialSize: 50 });
    await first.press('ArrowLeft');
    expect(localStorage.getItem('pracstack:test:split')).toBe('48');

    const second = await setup({ storageKey: 'test:split', initialSize: 50 });
    expect(second.divider.getAttribute('aria-valuenow')).toBe('48');
  });
});
