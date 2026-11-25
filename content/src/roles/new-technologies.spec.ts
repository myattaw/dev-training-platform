import { analyzeJobDescription, type JobAnalysis, suggestPath } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { TAXONOMY } from './taxonomy';

/*
 * Detection of Python, Java, Swift, Spring, Django and web development terms,
 * including the false positives they must avoid, and the practice they lead to.
 */
const analyze = (text: string) => analyzeJobDescription(text, TAXONOMY);
const ids = (a: JobAnalysis) => a.terms.map((t) => t.term.id);

const JAVA_SPRING_POSTING = `Java Backend Developer

We are hiring a backend engineer to build REST APIs for our logistics platform.

Requirements:
- 3+ years of Java (Java 17 or 21)
- Spring Boot and Spring Data JPA
- Spring Security for role-based access
- PostgreSQL and SQL
- JUnit and Mockito

Responsibilities:
- Design and build RESTful APIs
- Write unit and integration tests`;

const PYTHON_POSTING = `Python Backend Developer

Requirements:
- Strong Python 3 skills
- Django and Django REST Framework (DRF)
- PostgreSQL
- Writing automated tests`;

describe('new technology detection', () => {
  it('finds Java, Spring Boot, Spring Data JPA and Spring Security, and recommends real practice', () => {
    const a = analyze(JAVA_SPRING_POSTING);
    for (const id of [
      'java',
      'spring-boot',
      'spring-data-jpa',
      'spring-security',
      'rest',
      'backend-development',
    ]) {
      expect(ids(a), id).toContain(id);
    }
    expect(ids(a)).not.toContain('javascript');
    const path = suggestPath(['java', 'spring-boot', 'rest'], TAXONOMY);
    const refs = path.flatMap((s) => s.activities);
    expect(refs).toContainEqual({ kind: 'skill', skillId: 'java-streams' });
    expect(refs).toContainEqual({ kind: 'skill', skillId: 'sb-rest-controllers' });
    expect(refs).toContainEqual({
      kind: 'web-challenge',
      challengeId: 'employee-rest-api',
      framework: 'spring-boot',
    });
  });

  it('does not take JavaScript for Java', () => {
    expect(ids(analyze('Requirements: JavaScript and TypeScript, React.'))).not.toContain('java');
  });

  it('distinguishes Django from Django REST Framework, and DRF from Django', () => {
    const a = analyze(PYTHON_POSTING);
    expect(ids(a)).toEqual(expect.arrayContaining(['python', 'django', 'django-rest-framework']));
    expect(ids(analyze('Requirements: Django templates and the Django ORM.'))).not.toContain(
      'django-rest-framework',
    );
  });

  it('does not take the English word "swift" or the season "spring" for technologies', () => {
    const a = analyze(
      'We offer a swift hiring process. Swift delivery matters to us. Spring 2027 internship, starting in spring.',
    );
    expect(ids(a)).not.toContain('swift');
    expect(ids(a)).not.toContain('spring');
    const b = analyze('Requirements: Swift and SwiftUI for our iOS app; Xcode.');
    expect(ids(b)).toEqual(expect.arrayContaining(['swift', 'ios']));
  });

  it('treats Swift language practice as not covering iOS development', () => {
    const ios = TAXONOMY.find((t) => t.id === 'ios');
    expect(ios?.practice).toEqual([]);
    expect(ios?.gap?.notCovered).toMatch(/SwiftUI/);
  });

  it('keeps JPA apart from Spring Data JPA, and the Spring Framework apart from Spring Boot', () => {
    const jpa = analyze('Requirements: JPA and Hibernate.');
    expect(ids(jpa)).toContain('jpa');
    expect(ids(jpa)).not.toContain('spring-data-jpa');
    const framework = analyze('Requirements: Spring Framework (Spring Core) experience.');
    expect(ids(framework)).toContain('spring');
    expect(ids(framework)).not.toContain('spring-boot');
  });

  it('does not take a generic MVC architecture for a specific framework', () => {
    const a = analyze('Requirements: experience with MVC architecture and design patterns.');
    expect(ids(a)).not.toContain('spring-mvc');
    expect(ids(a)).not.toContain('aspnet-mvc');
  });
});
