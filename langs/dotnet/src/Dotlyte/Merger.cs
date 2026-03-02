namespace Dotlyte;

/// <summary>
/// Deep merge utility.
/// </summary>
public static class Merger
{
    /// <summary>
    /// Deep merge two dictionaries. Override values win.
    /// </summary>
    public static Dictionary<string, object?> DeepMerge(
        Dictionary<string, object?> baseDict,
        Dictionary<string, object?> overrideDict)
    {
        var result = new Dictionary<string, object?>(baseDict);

        foreach (var (key, value) in overrideDict)
        {
            if (result.TryGetValue(key, out var existing)
                && existing is Dictionary<string, object?> existingDict
                && value is Dictionary<string, object?> overrideInner)
            {
                result[key] = DeepMerge(existingDict, overrideInner);
            }
            else
            {
                result[key] = value;
            }
        }

        return result;
    }
}
