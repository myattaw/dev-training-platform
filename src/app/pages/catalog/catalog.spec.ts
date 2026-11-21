import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Catalog } from './catalog';

describe('Catalog', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [Catalog],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const titles = () => [...el.querySelectorAll('app-exercise-card h3')].map((h) => h.textContent?.trim());
    return { fixture, el, titles };
  }

  it('lists all exercises by default', async () => {
    const { titles } = await setup();
    expect(titles()).toContain('Pangram');
  });

  it('filters by search text', async () => {
    const { fixture, el, titles } = await setup();
    const input = el.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'reverse';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(titles()).toEqual(['Reverse String']);
  });

  it('filters by difficulty and shows an empty state', async () => {
    const { fixture, el, titles } = await setup();
    const hard = [...el.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.textContent?.trim() === 'Hard')!;
    hard.click();
    await fixture.whenStable();
    expect(titles()).toEqual([]);
    expect(el.textContent).toContain('No exercises match');
  });
});
