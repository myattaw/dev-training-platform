# Reference solution. Private: used only to prove the tests are correct.
PAIRS = {")": "(", "]": "[", "}": "{"}


def is_balanced(text: str) -> bool:
    stack: list[str] = []
    for c in text:
        if c in "([{":
            stack.append(c)
        elif c in PAIRS and (not stack or stack.pop() != PAIRS[c]):
            return False
    return not stack
