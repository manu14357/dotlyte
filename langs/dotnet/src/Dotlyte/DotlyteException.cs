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

/// <summary>
/// Raised when a required config key is missing.
/// </summary>
public class MissingKeyException : DotlyteException
{
    /// <summary>Sources that were checked.</summary>
    public IReadOnlyList<string> SourcesChecked { get; }

    /// <summary>
    /// Initializes a new <see cref="MissingKeyException"/>.
    /// </summary>
    public MissingKeyException(string message, string? key = null, IReadOnlyList<string>? sourcesChecked = null)
        : base(message, key)
    {
        SourcesChecked = sourcesChecked ?? Array.Empty<string>();
    }
}

/// <summary>
/// Raised when a config file cannot be read or found.
/// </summary>
public class FileException : DotlyteException
{
    /// <summary>The file path that caused the error.</summary>
    public string? FilePath { get; }

    /// <summary>
    /// Initializes a new <see cref="FileException"/>.
    /// </summary>
    public FileException(string message, string? filePath = null, string? key = null)
        : base(message, key)
    {
        FilePath = filePath;
    }
}

/// <summary>
/// Raised when schema validation fails.
/// </summary>
public class ValidationException : DotlyteException
{
    /// <summary>All schema violations.</summary>
    public IReadOnlyList<SchemaViolation> Violations { get; }

    /// <summary>
    /// Initializes a new <see cref="ValidationException"/>.
    /// </summary>
    public ValidationException(string message, IReadOnlyList<SchemaViolation>? violations = null, string? key = null)
        : base(message, key)
    {
        Violations = violations ?? Array.Empty<SchemaViolation>();
    }
}

/// <summary>
/// Raised when variable interpolation fails (e.g., circular reference).
/// </summary>
public class InterpolationException : DotlyteException
{
    /// <inheritdoc />
    public InterpolationException(string message, string? key = null)
        : base(message, key) { }
}

/// <summary>
/// Raised when decryption of an encrypted value fails.
/// </summary>
public class DecryptionException : DotlyteException
{
    /// <inheritdoc />
    public DecryptionException(string message, string? key = null)
        : base(message, key) { }

    /// <inheritdoc />
    public DecryptionException(string message, string? key, Exception innerException)
        : base(message, key, innerException) { }
}
