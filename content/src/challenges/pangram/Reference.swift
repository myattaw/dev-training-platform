// Reference solution. Private: used only to prove the tests are correct.
func isPangram(_ sentence: String) -> Bool {
    let letters = sentence.lowercased().unicodeScalars.filter { $0 >= "a" && $0 <= "z" }
    return Set(letters).count == 26
}
