# Reference solution. Private: used only to prove the tests are correct.
class TextBuffer:
    def __init__(self):
        # Characters before the cursor, in order.
        self.before: list[str] = []
        # Characters after the cursor, reversed: the last element is next to the cursor.
        self.after: list[str] = []

    def insert(self, text: str) -> None:
        self.before.extend(text)

    def backspace(self, count: int) -> int:
        k = min(count, len(self.before))
        del self.before[len(self.before) - k :]
        return k

    def move(self, offset: int) -> int:
        if offset < 0:
            for _ in range(min(-offset, len(self.before))):
                self.after.append(self.before.pop())
        else:
            for _ in range(min(offset, len(self.after))):
                self.before.append(self.after.pop())
        return len(self.before)

    def text_around(self, radius: int) -> str:
        left = "".join(self.before[max(0, len(self.before) - radius) :])
        right = "".join(reversed(self.after[max(0, len(self.after) - radius) :]))
        return f"{left}|{right}"

    def get_text(self) -> str:
        return "".join(self.before) + "".join(reversed(self.after))

    def get_cursor(self) -> int:
        return len(self.before)
