import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../shared/ui/icon/icon';

export interface TreeFile {
  readonly path: string;
  readonly editable: boolean;
}

interface Row {
  readonly key: string;
  readonly name: string;
  readonly depth: number;
  readonly kind: 'dir' | 'file';
  readonly path: string;
  readonly editable?: boolean;
  readonly expanded?: boolean;
  readonly parent?: string;
}

/**
 * Project explorer: a WAI-ARIA tree of the project's files. Directories
 * expand and collapse; arrow keys move, Right/Left expand/collapse, Enter
 * opens. Read-only files carry a lock; edited files a dot.
 */
@Component({
  selector: 'app-file-tree',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Keys bubble up from the focused tree item (roving tabindex), as in the WAI-ARIA tree pattern. -->
    <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
    <ul role="tree" [attr.aria-label]="label()" (keydown)="onKeydown($event)">
      @for (row of rows(); track row.key) {
        <!-- Focusable through [tabIndex]; Enter and Space are handled by the tree's keydown. -->
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
        <li
          role="treeitem"
          [attr.aria-level]="row.depth + 1"
          [attr.aria-expanded]="row.kind === 'dir' ? row.expanded : null"
          [attr.aria-selected]="row.kind === 'file' ? row.path === active() : null"
          [attr.data-key]="row.key"
          [tabIndex]="row.key === focusKey() ? 0 : -1"
          [class.active]="row.kind === 'file' && row.path === active()"
          [style.padding-left.px]="8 + row.depth * 14"
          (click)="activate(row)"
          (focus)="focusKey.set(row.key)"
        >
          @if (row.kind === 'dir') {
            <app-icon [name]="row.expanded ? 'chevron-down' : 'chevron-right'" class="chev" />
            <span class="name dir">{{ row.name }}</span>
          } @else {
            <span class="ext" aria-hidden="true">{{ ext(row.name) }}</span>
            <span class="name">{{ row.name }}</span>
            @if (modified().has(row.path)) {
              <span class="dot" title="Edited">●</span><span class="sr-only">(edited)</span>
            }
            @if (!row.editable) {
              <app-icon name="lock" class="lock" title="Read-only" />
              <span class="sr-only">(read-only)</span>
            }
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      overflow: auto;
      font-size: var(--font-size-sm);
    }
    ul {
      margin: 0;
      padding: var(--space-1) 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      padding-right: var(--space-2);
      cursor: pointer;
      white-space: nowrap;
    }
    li:hover {
      background: var(--color-surface-hover);
    }
    li.active {
      background: var(--color-info-bg);
      color: var(--color-primary);
    }
    li:focus-visible {
      outline: 2px solid var(--color-focus, var(--color-primary));
      outline-offset: -2px;
    }
    .chev {
      flex: none;
      color: var(--color-text-secondary);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dir {
      font-weight: var(--font-weight-bold);
    }
    .ext {
      flex: none;
      min-width: 26px;
      color: var(--color-text-secondary);
      font-family: var(--font-mono, monospace);
      font-size: 10px;
      text-transform: uppercase;
    }
    .dot {
      color: var(--color-warning);
      font-size: 9px;
    }
    .lock {
      flex: none;
      margin-left: auto;
      color: var(--color-text-secondary);
    }
  `,
})
export class FileTree {
  readonly files = input.required<readonly TreeFile[]>();
  readonly active = input<string>();
  readonly modified = input<ReadonlySet<string>>(new Set());
  readonly label = input('Project files');
  readonly open = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly focusKey = signal<string>('');

  protected readonly rows = computed<Row[]>(() => {
    const collapsed = this.collapsed();
    const dirs = new Set<string>();
    for (const f of this.files()) {
      const parts = f.path.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    const entries = [
      ...[...dirs].map((d) => ({ path: d, dir: true, editable: false })),
      ...this.files().map((f) => ({ path: f.path, dir: false, editable: f.editable })),
    ].sort((a, b) => compare(a.path, a.dir, b.path, b.dir));
    const rows: Row[] = [];
    for (const e of entries) {
      const parts = e.path.split('/');
      const parent = parts.slice(0, -1).join('/');
      // Hidden if any ancestor is collapsed.
      let hidden = false;
      for (let i = 1; i < parts.length; i++) {
        if (collapsed.has(parts.slice(0, i).join('/'))) hidden = true;
      }
      if (hidden) continue;
      rows.push({
        key: (e.dir ? 'd:' : 'f:') + e.path,
        name: parts[parts.length - 1] ?? e.path,
        depth: parts.length - 1,
        kind: e.dir ? 'dir' : 'file',
        path: e.path,
        editable: e.editable,
        expanded: e.dir ? !collapsed.has(e.path) : undefined,
        ...(parent ? { parent: `d:${parent}` } : {}),
      } as Row);
    }
    if (!this.focusKey() && rows[0])
      queueMicrotask(() => this.focusKey.set(`f:${this.active() ?? ''}`));
    return rows;
  });

  protected ext(name: string): string {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1, i + 5) : '';
  }

  protected activate(row: Row): void {
    this.focusKey.set(row.key);
    if (row.kind === 'dir') this.toggle(row.path);
    else this.open.emit(row.path);
  }

  private toggle(path: string, expand?: boolean): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      const isCollapsed = next.has(path);
      if (expand === undefined ? isCollapsed : expand) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    const index = rows.findIndex((r) => r.key === this.focusKey());
    const row = rows[index];
    if (!row) return;
    let target: Row | undefined;
    switch (event.key) {
      case 'ArrowDown':
        target = rows[index + 1];
        break;
      case 'ArrowUp':
        target = rows[index - 1];
        break;
      case 'Home':
        target = rows[0];
        break;
      case 'End':
        target = rows[rows.length - 1];
        break;
      case 'ArrowRight':
        if (row.kind === 'dir' && !row.expanded) this.toggle(row.path, true);
        else target = rows[index + 1];
        break;
      case 'ArrowLeft':
        if (row.kind === 'dir' && row.expanded) this.toggle(row.path, false);
        else target = rows.find((r) => r.key === row.parent);
        break;
      case 'Enter':
      case ' ':
        this.activate(row);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target) {
      this.focusKey.set(target.key);
      queueMicrotask(() =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-key="${CSS.escape(target.key)}"]`)
          ?.focus(),
      );
    }
  }
}

/** Directories before files at the same level; then by name. */
function compare(a: string, aDir: boolean, b: string, bDir: boolean): number {
  const pa = a.split('/');
  const pb = b.split('/');
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    const aIsDir = i < pa.length - 1 || aDir;
    const bIsDir = i < pb.length - 1 || bDir;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return (pa[i] ?? '').localeCompare(pb[i] ?? '');
  }
  return pa.length - pb.length;
}
