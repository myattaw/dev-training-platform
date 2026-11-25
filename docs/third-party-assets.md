# Third-party assets

## Technology logos (track tiles)

Track tiles on the dashboard, the home page and Skill Mastery show the technology's logo where
its owner allows third parties to use it to refer to the technology, and a short text monogram
everywhere else. The glyphs come from [Simple Icons](https://simpleicons.org) 16.38.1 (CC0 1.0);
the logos remain trademarks of their owners, and PracStack is not affiliated with or endorsed by
them. Code: `apps/web/src/app/features/home/tech-logos.ts`.

| Track                                    | Shown as  | Owner and terms                                                                                                                                                                                                                              |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                               | Logo      | Microsoft; [TypeScript branding](https://www.typescriptlang.org/branding)                                                                                                                                                                    |
| Angular                                  | Logo      | Google; [Angular press kit](https://angular.dev/press-kit). The Angular logo is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); attribution: "Angular logo by Google, CC BY 4.0" (shown on the Skill Mastery page) |
| PostgreSQL                               | Logo      | PostgreSQL Community Association; [trademark policy](https://www.postgresql.org/about/policies/trademarks/)                                                                                                                                  |
| ASP.NET Core                             | .NET logo | .NET Foundation; [dotnet/brand](https://github.com/dotnet/brand) (CC0 1.0)                                                                                                                                                                   |
| C#                                       | Text "C#" | No logo with permissive terms is available                                                                                                                                                                                                   |
| SQL Server, Azure, Power Platform        | Text      | Microsoft does not permit third-party use of these logos without permission                                                                                                                                                                  |
| Oracle SQL                               | Text      | Oracle does not permit third-party use of its logo                                                                                                                                                                                           |
| AWS                                      | Text      | Amazon's trademark guidelines restrict use of the AWS logo                                                                                                                                                                                   |
| Engineering practices, Coding Challenges | Text      | Not products                                                                                                                                                                                                                                 |

To add a logo: check the owner's brand guidelines first, then add the glyph to `tech-logos.ts`
and a row here.

## Sign-in buttons

The "Continue with GitHub" button on the Cognito sign-in pages shows the GitHub mark
(`infra/assets/brand/github-mark*.svg`, glyph from Simple Icons 16.38.1, CC0 1.0). The mark is
GitHub's trademark, used to link to GitHub sign-in as its [logo guidelines](https://github.com/logos)
allow. Google's button icon is Cognito's own.

## Fonts

The PracStack wordmark is drawn from Fira Code Bold glyph outlines (SIL Open Font License 1.1).

## Live syntax check (C# and Java)

The challenge editor checks C# and Java syntax as you type, in the browser, with
[Tree-sitter](https://tree-sitter.github.io/) (MIT): the `web-tree-sitter` 0.27.2 runtime (an npm
dependency; its `web-tree-sitter.wasm` is copied to `/grammars/` by the Angular build) and two
grammars compiled to WebAssembly, vendored gzip-compressed in `apps/web/public/grammars/` (`.wasm.gz`, unpacked
in the browser with `DecompressionStream`: CloudFront does not compress WebAssembly, and the C#
grammar is 7 MB raw, 400 KB compressed) with their licenses. The SHA-256 is of the uncompressed file:

| File                          | Package                            | SHA-256                                                            |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `tree-sitter-c_sharp.wasm.gz` | `tree-sitter-c-sharp` 0.24.0 (MIT) | `e137386fcdfc2562a058f8048c76ab77b0663a318cb62d8026cd4d2e94944231` |
| `tree-sitter-java.wasm.gz`    | `tree-sitter-java` 0.23.5 (MIT)    | `4fdeac4ca6ca089f06c6f7e562abcac1733cd465728cc7031ebb73c2019122c4` |

The grammar packages are not installed as dependencies: they build native Node.js bindings on
install, which the browser does not need. To update one, take the `.wasm` file from the package's
npm tarball (`npm pack tree-sitter-c-sharp@<version>`), compress it with `gzip -9 -n`, and update the
row above.

Besides syntax errors, it flags lowercase names declared nowhere in the file (`return ew;`; see
`undefined-names.ts`, checked against all C# and Java content by `content/src/checks/editor-name-check.spec.ts`).
Types and members are checked by the real compiler when the code runs on the server, and those
errors are underlined too. Suggestions while typing (keywords, common types and members) come from
a fixed list in `apps/web/src/app/shared/editor/completions.ts`. The parser runs in a Web Worker
(`apps/web/src/app/shared/editor/workers/syntax.worker.ts`) under the worker policy, which allows
compiling WebAssembly and denies network access; the page fetches the files and passes them in.
