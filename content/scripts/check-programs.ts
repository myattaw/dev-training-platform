/**
 * Runs the Java, Python and Swift Skill Mastery snippets of one or more tracks in
 * the real runner containers and prints every problem (the same check as
 * content/src/checks/program-snippets.spec.ts, but quick to aim at one track).
 *
 *   npx tsx content/scripts/check-programs.ts python            # one track
 *   npx tsx content/scripts/check-programs.ts java spring-boot  # several
 *   npx tsx content/scripts/check-programs.ts python --skill py-strings
 *
 * Also runs the structural validation of the content build for those tracks.
 * Needs Docker and the runner images (npm run runners:build).
 */
import { DockerCodeRunner } from '@pracstack/code-runner';
import { type TrackSource, validateTracks } from '@pracstack/content-model';
import { checkProgramSnippets, collectProgramSnippets } from '../src/checks/program-snippets';
import { TRACKS } from '../src/skill-mastery';

const args = process.argv.slice(2);
const skillIndex = args.indexOf('--skill');
const skillId = skillIndex >= 0 ? args[skillIndex + 1] : undefined;
const trackIds = args.filter(
  (a, i) => !a.startsWith('--') && (skillIndex < 0 || i !== skillIndex + 1),
);

let tracks: TrackSource[] = TRACKS.filter((t) => trackIds.length === 0 || trackIds.includes(t.id));
if (skillId) {
  tracks = tracks.map((t) => ({
    ...t,
    topics: t.topics.map((topic) => ({
      ...topic,
      skills: topic.skills.filter((s) => s.id === skillId),
    })),
  }));
}
// Structure first (ids, answer keys, families, prerequisites), as the content build checks it.
const structural = validateTracks(tracks);
for (const issue of structural)
  console.log(`${issue.severity === 'error' ? '✗' : '!'} ${issue.path}
    ${issue.message}`);
// The mastery rule of content.spec.ts: two first-time correct answers promote, so every tier
// needs at least two questions, and a perfect run to 100 answers seven at tiers 4 and 5.
let masteryErrors = 0;
for (const t of tracks) {
  for (const skill of t.topics.flatMap((topic) => topic.skills)) {
    const at = (d: number) => skill.questions.filter((q) => q.difficulty === d).length;
    const problems: string[] = [];
    for (const d of [1, 2, 3, 4, 5])
      if (at(d) < 2) problems.push(`tier ${d} has ${at(d)} (needs 2)`);
    if (at(4) + at(5) < 7) problems.push(`tiers 4-5 have ${at(4) + at(5)} (needs 7)`);
    if (skill.questions.length < 15)
      problems.push(`${skill.questions.length} questions (needs 15)`);
    if (problems.length > 0) {
      masteryErrors++;
      console.log(`✗ track:${t.id}/${skill.id} (mastery rule)
    ${problems.join('; ')}`);
    }
  }
}
const structuralErrors = structural.filter((i) => i.severity === 'error').length + masteryErrors;
let questions = 0;
for (const t of tracks)
  for (const topic of t.topics)
    for (const skill of topic.skills) questions += skill.questions.length;
const families = new Set(
  tracks.flatMap((t) =>
    t.topics.flatMap((topic) =>
      topic.skills.flatMap((skill) => skill.questions.map((q) => q.family ?? q.id)),
    ),
  ),
).size;
console.log(
  `${questions} questions in ${families} families; ${structuralErrors} structural errors.`,
);
const count = collectProgramSnippets(tracks).length;
console.log(`Checking ${count} snippets in ${tracks.map((t) => t.id).join(', ')}…`);

const runner = new DockerCodeRunner({ maxConcurrent: 4, maxQueue: 100_000 });
const status = await runner.check();
if (!status.ok) {
  console.error(status.message);
  process.exit(2);
}
const started = Date.now();
const issues = await checkProgramSnippets(tracks, runner, { concurrency: 4 });
for (const issue of issues) console.log(`✗ ${issue.path}\n    ${issue.message}`);
const failedPaths = new Set(issues.map((i) => i.path)).size;
console.log(
  `\n${count - failedPaths}/${count} snippets OK, ${issues.length} problems (${Math.round((Date.now() - started) / 1000)} s).`,
);
process.exit(issues.length > 0 || structuralErrors > 0 ? 1 : 0);
