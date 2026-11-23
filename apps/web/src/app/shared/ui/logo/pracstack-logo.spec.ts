import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PracStackLogo } from './pracstack-logo';

@Component({
  imports: [PracStackLogo],
  template: `
    <app-pracstack-logo id="full" />
    <app-pracstack-logo id="icon" variant="icon" [size]="16" surface="dark" />
  `,
})
class Host {}

describe('PracStackLogo', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the mark and the two-colour wordmark by default, hidden from assistive tech', async () => {
    const full = (await render()).querySelector('#full')!;
    const [mark, wordmark] = [...full.querySelectorAll('svg')];
    expect(mark?.getAttribute('height')).toBe('24');
    expect(wordmark?.getAttribute('height')).toBe('16');
    expect(wordmark?.querySelector('.prac')?.getAttribute('d')).toMatch(/^M/);
    expect(wordmark?.querySelector('.stack')?.getAttribute('d')).toMatch(/^M/);
    for (const svg of [mark, wordmark]) expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows only the mark in the icon variant, sized and adapted to dark backgrounds', async () => {
    const icon = (await render()).querySelector('#icon')!;
    expect(icon.querySelector('.wordmark')).toBeNull();
    expect(icon.querySelector('svg')?.getAttribute('width')).toBe('16');
    expect(icon.classList).toContain('on-dark');
    expect(icon.querySelectorAll('svg .code')).toHaveLength(3);
  });
});
