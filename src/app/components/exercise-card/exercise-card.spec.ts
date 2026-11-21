import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { pangram } from '../../data/exercises/pangram';
import { ExerciseCard } from './exercise-card';

describe('ExerciseCard', () => {
  it('renders the exercise and links to it', async () => {
    await TestBed.configureTestingModule({
      imports: [ExerciseCard],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(ExerciseCard);
    fixture.componentRef.setInput('exercise', pangram);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h3')?.textContent).toContain('Pangram');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/exercises/pangram');
  });
});
