// Reference solution. Private: used only to prove the tests are correct.
public static class Solution
{
    public static int[][] Merge(int[][] intervals)
    {
        var merged = new List<int[]>();
        // OrderBy sorts into a new sequence, so the input array is left untouched.
        foreach (var interval in intervals.OrderBy(i => i[0]))
        {
            if (merged.Count > 0 && interval[0] <= merged[^1][1])
            {
                merged[^1][1] = Math.Max(merged[^1][1], interval[1]);
            }
            else
            {
                merged.Add([interval[0], interval[1]]);
            }
        }
        return merged.ToArray();
    }
}
