/**
 * Instructions are structured data rather than raw HTML. That keeps them
 * type-safe, avoids `innerHTML`, and lets each client decide how blocks look.
 * Inline `backticks` inside text are rendered as code.
 */
export type InstructionBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'code'; readonly code: string };
