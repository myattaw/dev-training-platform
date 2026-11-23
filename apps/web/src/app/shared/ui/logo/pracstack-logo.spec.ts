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

  it('shows the mark and the two-colour wordmark by default', async () => {
    const full = (await render()).querySelector('#full')!;
    expect(full.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(full.querySelector('svg')?.getAttribute('height')).toBe('24');
    expect(full.querySelector('.prac')?.textContent).toBe('Prac');
    expect(full.querySelector('.stack')?.textContent).toBe('Stack');
    expect(full.textContent?.trim()).toBe('PracStack');
  });

  it('shows only the mark in the icon variant, sized and adapted to dark backgrounds', async () => {
    const icon = (await render()).querySelector('#icon')!;
    expect(icon.querySelector('.wordmark')).toBeNull();
    expect(icon.querySelector('svg')?.getAttribute('width')).toBe('16');
    expect(icon.classList).toContain('on-dark');
    expect(icon.querySelectorAll('svg .code')).toHaveLength(3);
  });
});
