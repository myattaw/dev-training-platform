# Reference solution. Private: used only to prove the tests are correct.
def apply_edits(commands: list[str]) -> str:
    # Text before the cursor, and text after it.
    before = ""
    after = ""
    for command in commands:
        name, space, arg = command.partition(" ")
        if name == "type" and space:
            before += arg
            continue
        if name == "home":
            before, after = "", before + after
            continue
        if name == "end":
            before, after = before + after, ""
            continue
        if not (arg.isascii() and arg.isdigit()):
            continue
        n = int(arg)
        if name == "left":
            k = min(n, len(before))
            before, after = before[: len(before) - k], before[len(before) - k :] + after
        elif name == "right":
            before, after = before + after[:n], after[n:]
        elif name == "backspace":
            before = before[: max(0, len(before) - n)]
        elif name == "delete":
            after = after[n:]
    return before + after
