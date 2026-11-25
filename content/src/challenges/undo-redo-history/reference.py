# Reference solution. Private: used only to prove the tests are correct.
from dataclasses import dataclass


@dataclass(frozen=True)
class Edit:
    typed: bool
    text: str


class EditHistory:
    def __init__(self):
        self.text = ""
        self.done: list[Edit] = []
        self.undone: list[Edit] = []

    def type(self, text: str) -> None:
        if text:
            self._record(Edit(True, text))

    def erase(self, count: int) -> None:
        removed = self.text[max(0, len(self.text) - count) :]
        if removed:
            self._record(Edit(False, removed))

    def undo(self) -> bool:
        if not self.done:
            return False
        edit = self.done.pop()
        self._apply(Edit(not edit.typed, edit.text))
        self.undone.append(edit)
        return True

    def redo(self) -> bool:
        if not self.undone:
            return False
        edit = self.undone.pop()
        self._apply(edit)
        self.done.append(edit)
        return True

    def get_text(self) -> str:
        return self.text

    def _record(self, edit: Edit) -> None:
        self._apply(edit)
        self.done.append(edit)
        self.undone.clear()

    def _apply(self, edit: Edit) -> None:
        if edit.typed:
            self.text += edit.text
        else:
            self.text = self.text[: len(self.text) - len(edit.text)]
