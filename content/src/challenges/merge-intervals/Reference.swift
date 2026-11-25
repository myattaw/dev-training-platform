// Reference solution. Private: used only to prove the tests are correct.
func merge(_ intervals: [[Int]]) -> [[Int]] {
    var merged: [[Int]] = []
    for interval in intervals.sorted(by: { $0[0] < $1[0] }) {
        if let last = merged.last, interval[0] <= last[1] {
            merged[merged.count - 1][1] = max(last[1], interval[1])
        } else {
            merged.append([interval[0], interval[1]])
        }
    }
    return merged
}
