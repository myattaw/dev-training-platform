import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { scenarioFamily, selectFamily } from './builders';

/*
 * Git workflow: reading git output, merge versus rebase, conflicts, undoing
 * changes, pull requests and branching strategies. Artifacts are git output
 * shown as text and reviewed by hand.
 */

export const gitWorkflowFamilies: readonly QuestionSource[] = [
  // ---------------------------------------------------------------- Reading git status
  ...scenarioFamily(
    'eng-git-status-read',
    1,
    'Git commits what is in the staging area (the index), not what is in your editor.',
    [
      {
        key: 'staged-vs-unstaged',
        question:
          'You run `git commit -m "Add login"` right after this output. What goes into the commit?',
        code: plain(`$ git status
On branch feature/login
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        modified:   src/auth.ts

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   src/auth.ts
        modified:   README.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        src/auth.spec.ts`),
        correct:
          'Only the version of `src/auth.ts` that was staged; its later edits, `README.md` and `src/auth.spec.ts` stay out of the commit',
        wrong: [
          'Every change shown: both versions of `src/auth.ts`, `README.md` and the new `src/auth.spec.ts`',
          '`src/auth.ts` with all its current edits, but not `README.md` or the new file',
          'Nothing: Git refuses to commit while there are unstaged changes',
        ],
        why: '`git add` copies a snapshot of a file into the staging area, and `git commit` records exactly that snapshot. `src/auth.ts` appears twice because it was staged and then edited again: only the staged snapshot is committed. Unstaged edits and untracked files are left in the working tree. A common misconception is that a commit takes the files as they are on disk; use `git add -p` or `git diff --staged` to see exactly what will be committed.',
      },
      {
        key: 'diverged',
        difficulty: 2,
        question:
          'You have not pushed today. What does this output mean, and what is the safe next step?',
        code: plain(`$ git fetch
$ git status
On branch main
Your branch and 'origin/main' have diverged,
and have 2 and 3 different commits each, respectively.
  (use "git pull" if you want to integrate the remote branch with yours)

nothing to commit, working tree clean`),
        correct:
          'You have 2 commits the remote lacks and the remote has 3 you lack; integrate the remote commits (merge or rebase your 2 unpushed commits on them), then push',
        wrong: [
          'Your local branch is the newer one, so `git push --force` is the right way to bring the remote up to date',
          'There are 5 uncommitted changes in the working tree that must be committed first',
          'The remote branch has been deleted, so the next push will recreate it',
        ],
        why: 'Diverged means both sides have commits the other does not: here 2 local and 3 remote. Integrate the 3 remote commits first, by merging or by rebasing your own unpushed commits on top (safe because nobody else has them), then push. Force-pushing would silently discard the 3 commits your teammates pushed. "Working tree clean" confirms nothing is uncommitted.',
      },
      {
        key: 'detached-head',
        difficulty: 2,
        question:
          'You check out an old commit to investigate a bug, fix it and commit. What is the risk?',
        code: plain(`$ git checkout 3f2a9c1
Note: switching to '3f2a9c1'.
You are in 'detached HEAD' state. ...
$ git status
HEAD detached at 3f2a9c1
nothing to commit, working tree clean`),
        correct:
          'The new commit belongs to no branch; if you switch away without creating one (for example `git switch -c fix/old-bug`), it becomes unreachable and is eventually garbage-collected',
        wrong: [
          'The commit is added to `main`, because `main` contains `3f2a9c1`',
          'Git refuses to create commits in detached HEAD state',
          'The commit replaces `3f2a9c1`, rewriting history for everyone',
        ],
        why: 'In detached HEAD state, HEAD points straight at a commit instead of at a branch. New commits are made, but no branch name moves to include them, so once you check out something else nothing refers to them (only the reflog, for a while). Create a branch on them before leaving. Nothing is rewritten: commits are immutable, and new ones are only added.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Merge versus rebase
  ...scenarioFamily(
    'eng-git-merge-rebase',
    2,
    'Rebasing creates new commits; think about who else already has the old ones.',
    [
      {
        key: 'what-rebase-does',
        question: 'You are on `feature/search` and run `git rebase main`. What happens?',
        correct:
          'Your feature commits are replayed on top of the tip of `main` as new commits with new hashes, giving a linear history',
        wrong: [
          '`main` is merged into `feature/search` with a merge commit that has two parents',
          "`main`'s commits are moved onto `feature/search` and your commits keep their hashes",
          '`feature/search` is merged into `main` and the feature branch is deleted',
        ],
        why: 'Rebase takes the commits that are on your branch but not on `main`, and re-applies them one by one on top of `main`. The results are new commits (new parents, so new hashes) even if the changes are identical. That is what "rewriting history" means. Merging, by contrast, keeps the existing commits and adds a merge commit.',
      },
      {
        key: 'shared-branch',
        difficulty: 3,
        question:
          'Three developers push to the shared branch `feature/payments`. One of them rebases it onto `main` and runs `git push --force`. What happens to the other two?',
        correct:
          'Their local copies still contain the old commits, which no longer exist on the remote; their next pull tries to combine both histories, causing duplicate commits and conflicts',
        wrong: [
          'Nothing changes for them: a rebase only affects the copy of the person who ran it',
          'Git rejects the push, because rebased branches can never be pushed',
          'Their local commits are rebased automatically the next time they fetch',
        ],
        why: 'The force-push replaced the remote branch with new commits. Anyone who built on the old commits now has a history that the remote no longer shares, and Git sees their old commits as different work to merge back in. That is why the rule is: never rebase a branch others have pulled. Rebase your own unpushed or private work; integrate shared branches with merges.',
      },
      {
        key: 'read-graph',
        difficulty: 4,
        question: 'Which command, run on `main`, produced this history?',
        code: plain(`$ git log --oneline --graph
*   9c1e7d2 Merge branch 'feature/search'
|\\
| * 4b8a113 Add search ranking
| * 2d77e0a Add search endpoint
* | 7a0c5f1 Fix header layout
|/
* 51f3b88 Release 1.4`),
        correct:
          '`git merge feature/search`, which needed a merge commit because `main` had gained `7a0c5f1` since the branch started',
        wrong: [
          '`git merge --ff-only feature/search` after rebasing the feature branch onto `main`',
          '`git merge --squash feature/search` followed by `git commit`',
          '`git cherry-pick 2d77e0a 4b8a113`',
        ],
        why: 'The commit `9c1e7d2` has two parents (the graph joins two lines), so it is a true merge commit. Rebasing plus a fast-forward gives a straight line with no merge commit. A squash merge creates one ordinary commit with a single parent, so the feature commits would not appear as a side branch. Cherry-picking copies commits as new single-parent commits on `main`.',
      },
      {
        key: 'force-with-lease',
        difficulty: 4,
        question:
          'Only you work on your pull request branch. After review you rebased it onto the latest `main` and now want to update the remote branch. Which push is the best choice?',
        correct:
          '`git push --force-with-lease`, which overwrites the remote branch only if it is still at the commit you last fetched',
        wrong: [
          '`git push --force`, because it guarantees the remote matches your branch',
          '`git push`, because Git notices the rebase and updates the branch for you',
          '`git pull` and then `git push`, so both the old and new commits are kept',
        ],
        why: 'After a rebase the remote branch is not an ancestor of yours, so a plain push is rejected as non-fast-forward. A force push is needed, and `--force-with-lease` is the safer form: if someone (or a bot, or your other machine) pushed in the meantime, the lease check fails instead of silently deleting their commit. Pulling first would merge the old pre-rebase commits back in and duplicate every change.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Conflicts
  ...scenarioFamily(
    'eng-git-conflict',
    2,
    'Read the marker labels: they name the two sides being combined.',
    [
      {
        key: 'which-side',
        question:
          'While on `main` you run `git merge feature/slow-network` and get this conflict. Which statement is right?',
        code: plain(`<<<<<<< HEAD
const TIMEOUT_MS = 5000;
=======
const TIMEOUT_MS = 10000;
>>>>>>> feature/slow-network`),
        correct:
          'The top part is the version on `main` (the branch you are on); the bottom part comes from `feature/slow-network`',
        wrong: [
          'The top part is the incoming change; the bottom part is what `main` had',
          'The top part is the common ancestor that both branches started from',
          'Git has already chosen `10000`; the markers are only informational',
        ],
        why: 'In a merge, `HEAD` is the branch you are on, so the part between `<<<<<<< HEAD` and `=======` is your side and the part down to `>>>>>>>` is the branch being merged in. Git never picks a side for a conflicting hunk: the file is left with markers, and the merge cannot be completed until you edit it, `git add` it and commit.',
      },
      {
        key: 'combine-both',
        difficulty: 3,
        question:
          '`main` added VAT and the feature branch added discounts. Both rules are required, and the discount applies before VAT. How should the conflict be resolved?',
        code: plain(`function price(order) {
<<<<<<< HEAD
  const subtotal = sum(order.lines);
  return applyVat(subtotal);
=======
  const subtotal = sum(order.lines) - order.discount;
  return subtotal;
>>>>>>> feature/discounts
}`),
        correct:
          'Write `const subtotal = sum(order.lines) - order.discount;` and `return applyVat(subtotal);`, remove the markers, run the tests, then `git add` and complete the merge',
        wrong: [
          'Keep the `main` side (`git checkout --ours`), because `main` is the authoritative branch',
          'Keep the feature side (`git checkout --theirs`), because it is the newer change',
          'Delete only the three marker lines and keep both blocks in order',
        ],
        why: 'A conflict means both sides changed the same lines, and the right result is often neither side but a combination that satisfies both intentions. Picking one side drops a required rule. Keeping both blocks leaves two `const subtotal` declarations and an early `return`, so it does not even run. Resolve by understanding both changes, then verify with tests before committing.',
      },
      {
        key: 'rebase-ours-theirs',
        difficulty: 4,
        question:
          'You are rebasing your feature branch onto `main`. After reviewing the diff you decide `config/app.json` must be exactly as your commit has it. Which commands do that?',
        code: plain(`$ git rebase main
Auto-merging config/app.json
CONFLICT (content): Merge conflict in config/app.json
error: could not apply 5e1d0aa... Raise upload limit to 50 MB`),
        correct:
          '`git checkout --theirs config/app.json`, then `git add config/app.json` and `git rebase --continue`',
        wrong: [
          '`git checkout --ours config/app.json`, then `git add config/app.json` and `git rebase --continue`',
          '`git rebase --skip`, which keeps your version of the conflicting file',
          '`git reset --hard HEAD`, then `git rebase --continue`',
        ],
        why: 'During a rebase the roles swap compared with a merge: "ours" is the branch being built (starting from `main`), and "theirs" is the commit being replayed, which is your own `5e1d0aa`. So `--theirs` selects your version. `git rebase --skip` drops your commit entirely, and resetting throws away the in-progress resolution instead of picking a side.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Undoing changes
  ...scenarioFamily(
    'eng-git-undo',
    3,
    'Ask first whether the commit has already been shared with others.',
    [
      {
        key: 'revert-pushed',
        question:
          'Commit `a1b2c3d` broke login. It is already on `origin/main` and teammates have pulled it. How do you undo it?',
        correct:
          '`git revert a1b2c3d` and push: a new commit that reverses the change, leaving shared history intact',
        wrong: [
          '`git reset --hard a1b2c3d~1` and `git push --force`, so the bad commit disappears',
          '`git commit --amend` to edit the bad commit, then push',
          '`git reset --soft HEAD~1` and push',
        ],
        why: 'Revert adds a commit that applies the inverse of `a1b2c3d`, so everyone simply pulls one more commit. Resetting and force-pushing rewrites a shared branch: teammates still have `a1b2c3d` and later commits built on it, and may push it back. Amending also creates a replacement commit, which is a rewrite too.',
      },
      {
        key: 'reset-local',
        question:
          'Two minutes ago you committed a change to your local feature branch. You have not pushed. You want to undo the commit but keep the edits in your files so you can rework them. What do you run?',
        correct:
          '`git reset HEAD~1` (a mixed reset): the commit is removed and its changes stay in the working tree, unstaged',
        wrong: ['`git reset --hard HEAD~1`', '`git revert HEAD`', '`git checkout HEAD~1`'],
        why: 'Since nobody else has the commit, rewriting local history is fine. A mixed reset moves the branch back one commit and keeps the file changes. `--hard` would also throw the edits away. `git revert` keeps the commit and adds another one that undoes it, removing the edits from your files. `git checkout HEAD~1` only detaches HEAD; the branch still has the commit.',
      },
      {
        key: 'cherry-pick-hotfix',
        difficulty: 4,
        question:
          'Production runs `release/2.3`. A security fix was committed to `main` as `e4f5a6b`, but `main` also contains features that are not ready to release. How do you get only the fix into the release branch?',
        correct: '`git switch release/2.3`, then `git cherry-pick e4f5a6b`, then test and release',
        wrong: [
          '`git switch release/2.3`, then `git merge main`',
          '`git switch release/2.3`, then `git rebase main`',
          '`git switch main`, then `git cherry-pick release/2.3`',
        ],
        why: 'Cherry-pick applies the change from one commit as a new commit on the current branch, which is exactly what a hotfix backport needs. Merging or rebasing on `main` would pull every unreleased feature into the release. Cherry-picking `release/2.3` while on `main` goes in the wrong direction.',
      },
      {
        key: 'revert-merge-remerge',
        difficulty: 5,
        question: [
          'Feature branch `feature/export` was merged into `main` as merge commit `M`. It caused a bug, so `M` was reverted with `git revert -m 1 M`.',
          'The team adds one fix commit `F` to `feature/export` and merges `feature/export` into `main` again. What ends up on `main`?',
        ],
        correct:
          'Only the change in `F`: Git considers the original feature commits already merged, so they stay reverted until the revert itself is reverted',
        wrong: [
          'The whole feature plus the fix, because the branch is merged again',
          'The merge stops with a conflict asking you to choose between the revert and the feature',
          'Nothing: Git refuses to merge a branch whose earlier merge was reverted',
        ],
        why: 'Reverting a merge undoes its changes but does not undo the history: the feature commits are still ancestors of `main`. A later merge only brings commits that are not yet merged, which is just `F`. To bring the feature back you revert the revert commit (and then merge the fix). The misconception is that a revert makes Git forget the merge happened.',
      },
      {
        key: 'reflog-recover',
        difficulty: 5,
        question:
          'Your working tree is clean. You ran `git reset --hard HEAD~3` on your local branch and realise you need those three commits. They were never pushed. What do you do?',
        code: plain(`$ git reflog
1c9d2e4 (HEAD -> feature/report) HEAD@{0}: reset: moving to HEAD~3
8f7e6d5 HEAD@{1}: commit: Add CSV export
b3a4c5d HEAD@{2}: commit: Add totals row
9e8f7a6 HEAD@{3}: commit: Add report query
1c9d2e4 HEAD@{4}: checkout: moving from main to feature/report`),
        correct:
          '`git reset --hard 8f7e6d5` (or `HEAD@{1}`), moving the branch back to where it was before the reset',
        wrong: [
          'Nothing can be done: commits that were never pushed are deleted by a hard reset',
          '`git revert HEAD~3`',
          '`git pull`, to restore the commits from the remote',
        ],
        why: 'A reset only moves the branch pointer; the commits still exist in the object database. The reflog records every position HEAD had, so `8f7e6d5` is the tip before the reset. Resetting back to it restores the branch. Unreachable commits are only garbage-collected after a grace period, and the remote cannot help because it never had them.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Pull requests and commits
  ...scenarioFamily(
    'eng-git-pull-requests',
    1,
    'Think about what helps a reviewer, or a future reader of the history, understand the change.',
    [
      {
        key: 'commit-message',
        question: 'Which commit message is most useful?',
        correct:
          'Reject expired coupons at checkout (subject line), followed by a body explaining that coupons past their end date were accepted because the date check used local time',
        wrong: ['Fix bug', 'WIP', 'Changes from Friday'],
        why: 'A good commit message has a short imperative subject saying what the commit does, and a body saying why when it is not obvious. Months later, `git log` and `git blame` are how people find out why code changed. "Fix bug" or "WIP" tells the reader nothing.',
      },
      {
        key: 'huge-pr',
        difficulty: 2,
        question:
          'A pull request changes 2,400 lines: a refactor of the order module, a new refund feature and upgrades of five dependencies. What should the reviewer ask for?',
        correct:
          'Split it into smaller pull requests with one purpose each (the refactor, then the feature, then the upgrades)',
        wrong: [
          'Nothing: approve it, since all the tests pass',
          'Squash it into one commit so the change is easier to review',
          'Add three more reviewers and give each a third of the files',
        ],
        why: 'Review quality drops sharply with size: a reviewer cannot meaningfully check 2,400 mixed lines, and a problem in one part blocks the rest. Focused pull requests are reviewed faster and more carefully, and are easier to revert. Squashing changes the history, not the amount to review. Splitting by file loses the context each change needs.',
      },
      {
        key: 'review-comment',
        difficulty: 3,
        question: 'Which review comment is the most effective?',
        correct:
          '"This calls `GetCustomer` once per order, so 500 orders means 500 database round trips. Could we load the customers in one query using the IDs up front?"',
        wrong: [
          '"This is wrong."',
          '"I would have written this differently."',
          '"Please fix the performance."',
        ],
        why: 'A useful review comment names the specific problem, explains its impact and suggests a direction, so the author can act on it and learn from it. Vague or personal-preference comments start debates without giving the author anything concrete to change.',
      },
    ],
  ),
  ...selectFamily(
    'eng-git-branch-protection',
    3,
    'Each rule either guarantees review and CI on every change, or weakens that guarantee.',
    [
      {
        key: 'protect-main',
        question:
          'The team wants every change to `main` to be reviewed and to pass CI, with no exceptions. Which protection rules for `main` support this?',
        right: [
          'Require a pull request with at least one approval before merging',
          'Require the CI status checks to pass before merging',
          'Dismiss existing approvals when new commits are pushed to the pull request',
          'Apply the rules to administrators too',
        ],
        wrong: ['Allow force pushes to `main`', 'Allow direct pushes from maintainers'],
        why: 'Required reviews and required status checks enforce the two goals. Without dismissing stale approvals, someone could push unreviewed commits after approval. Exempting administrators creates the exception the team ruled out. Force pushes can rewrite or remove reviewed history, and direct pushes bypass review and CI entirely.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Branching strategy
  ...scenarioFamily(
    'eng-git-branching-strategy',
    2,
    'Match the strategy to how often the team releases and how many versions it supports.',
    [
      {
        key: 'continuous-delivery',
        question:
          'A team deploys its web service to production several times a day. Which branching strategy fits best?',
        correct:
          'Trunk-based development: short-lived branches (hours to a day or two) merged to `main` often, with unfinished work behind feature flags',
        wrong: [
          'GitFlow, with `develop`, release and hotfix branches for every deployment',
          'Long-lived feature branches merged to `main` at the end of each quarter',
          'One personal branch per developer, merged into `main` once a week',
        ],
        why: 'Deploying many times a day needs `main` to always be releasable and changes to integrate continuously. Trunk-based development does that: small changes merged quickly, incomplete features hidden by flags. GitFlow was designed for scheduled, versioned releases; its extra branches add delay and merge work that a continuously deployed service does not need.',
      },
      {
        key: 'versioned-product',
        difficulty: 4,
        question:
          'A team ships an installable desktop app. Customers stay on version 3 for years, so security patches for 3.x must ship while version 4.0 is being built. What branching approach fits?',
        correct:
          'Keep a maintenance branch for each supported release line (such as `release/3.x`), apply fixes there, and continue new development on the main line',
        wrong: [
          'Commit everything to `main` and ship 3.x patches from `main`',
          'Keep one long-lived branch per 4.0 feature and merge them all when 4.0 ships',
          'Fork the repository for 3.x and stop sharing fixes between the copies',
        ],
        why: 'When several released versions must be supported, you need a branch per release line to patch without shipping unfinished 4.0 work. This is the part of GitFlow-style models that earns its cost. Fixes are made once and cherry-picked between the release branch and the main line. A separate fork loses that easy sharing.',
      },
      {
        key: 'merge-hell',
        difficulty: 5,
        question:
          'Feature branches live for three to four weeks. Merging each one into `main` takes days of conflict resolution and often breaks other features. Which change addresses the cause?',
        correct:
          'Integrate continuously: deliver each feature in small increments merged to `main` at least daily, hiding unfinished parts behind feature flags',
        wrong: [
          'Add a one-week code freeze before every merge',
          'Rebase each feature branch only once, just before it is merged',
          'Assign one senior developer to resolve all merge conflicts',
        ],
        why: 'Conflict pain grows with the time branches spend apart, because both sides accumulate changes to the same code. The fix is to shorten that time: merge small changes often so conflicts are small and found early. Freezes and a dedicated "merge master" treat the symptom, and a single late rebase still has all the accumulated conflicts.',
      },
    ],
  ),
];
