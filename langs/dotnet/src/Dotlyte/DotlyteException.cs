namespace Dotlyte;

/// <summary>
/// Base exception for all DOTLYTE errors.
/// </summary>
public class DotlyteException : Exception
{
    /// <summary>The config key that caused the error.</summary>
    public string? Key { get; }

    /// <summary>
    /// Initializes a new <see cref="DotlyteException"/> with a message and optional key.
    /// </summary>
    public DotlyteException(string message, string? key = null)
        : base(message)
    {
        Key = key;
    }

    /// <summary>
    /// Initializes a new <see cref="DotlyteException"/> with a message, key, and inner exception.
    /// </summary>
    public DotlyteException(string message, string? key, Exception innerException)
        : base(message, innerException)
    {
        Key = key;
    }
}
