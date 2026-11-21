import { TestBed } from '@angular/core/testing';
import { Tabs } from './tabs';

describe('Tabs', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Tabs);
    fixture.componentRef.setInput('tabs', [
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two', count: 3 },
      { id: 'three', label: 'Three' },
    ]);
    fixture.componentRef.setInput('selected', 'one');
    fixture.componentRef.setInput('idPrefix', 'demo');
    fixture.componentRef.setInput('label', 'Demo');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = () => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    return { fixture, el, tabs };
  }

  it('renders an accessible tablist with one tabbable tab', async () => {
    const { el, tabs } = await setup();
    expect(el.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Demo');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs()[1].getAttribute('aria-controls')).toBe('demo-panel-two');
    expect(tabs()[1].textContent).toContain('(3)');
  });

  it('selects on click', async () => {
    const { fixture, tabs } = await setup();
    tabs()[2].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('three');
  });

  it('moves selection and focus with arrow, Home and End keys (wrapping)', async () => {
    const { fixture, tabs } = await setup();
    const press = async (key: string) => {
      tabs()[0].parentElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await fixture.whenStable();
    };

    await press('ArrowLeft');
    expect(fixture.componentInstance.selected()).toBe('three');
    expect(document.activeElement).toBe(tabs()[2]);
    await press('ArrowRight');
    expect(fixture.componentInstance.selected()).toBe('one');
    await press('End');
    expect(fixture.componentInstance.selected()).toBe('three');
    await press('Home');
    expect(fixture.componentInstance.selected()).toBe('one');
  });
});
