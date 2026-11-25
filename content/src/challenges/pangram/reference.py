# Reference solution. Private: used only to prove the tests are correct.
def is_pangram(sentence: str) -> bool:
    return len({c for c in sentence.lower() if "a" <= c <= "z"}) == 26
