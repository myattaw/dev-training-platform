import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InstructionBlocks } from '../instruction-blocks/instruction-blocks';
import { InlineText } from './inline-text';

@Component({
  imports: [InlineText, InstructionBlocks],
  template: `<p id="inline"><app-inline-text text="What type is \`city\`?" /></p>
    <app-instruction-blocks
      [blocks]="[{ kind: 'paragraph', text: 'Use \`IS NULL\`, not \`= NULL\`.' }]"
    />`,
})
class Host {}

describe('inline code rendering', () => {
  it('renders text and code without stray spaces around the code', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#inline')?.textContent).toBe('What type is city?');
    expect(el.querySelector('#inline code')?.textContent).toBe('city');
    expect(el.querySelector('app-instruction-blocks p')?.textContent).toBe(
      'Use IS NULL, not = NULL.',
    );
  });
});
