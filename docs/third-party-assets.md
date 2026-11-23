# Third-party assets

## Technology logos (track tiles)

Track tiles on the dashboard, the home page and Skill Mastery show the technology's logo where
its owner allows third parties to use it to refer to the technology, and a short text monogram
everywhere else. The glyphs come from [Simple Icons](https://simpleicons.org) 16.38.1 (CC0 1.0);
the logos remain trademarks of their owners, and PracStack is not affiliated with or endorsed by
them. Code: `apps/web/src/app/features/home/tech-logos.ts`.

| Track | Shown as | Owner and terms |
| --- | --- | --- |
| TypeScript | Logo | Microsoft; [TypeScript branding](https://www.typescriptlang.org/branding) |
| Angular | Logo | Google; [Angular press kit](https://angular.dev/press-kit). The Angular logo is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); attribution: "Angular logo by Google, CC BY 4.0" (shown on the Skill Mastery page) |
| PostgreSQL | Logo | PostgreSQL Community Association; [trademark policy](https://www.postgresql.org/about/policies/trademarks/) |
| ASP.NET Core | .NET logo | .NET Foundation; [dotnet/brand](https://github.com/dotnet/brand) (CC0 1.0) |
| C# | Text "C#" | No logo with permissive terms is available |
| SQL Server, Azure, Power Platform | Text | Microsoft does not permit third-party use of these logos without permission |
| Oracle SQL | Text | Oracle does not permit third-party use of its logo |
| AWS | Text | Amazon's trademark guidelines restrict use of the AWS logo |
| Engineering practices, Coding Challenges | Text | Not products |

To add a logo: check the owner's brand guidelines first, then add the glyph to `tech-logos.ts`
and a row here.

## Fonts

The PracStack wordmark is drawn from Fira Code Bold glyph outlines (SIL Open Font License 1.1).
